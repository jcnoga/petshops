// ==================== IMPORTAÇÕES ====================
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { collection, query, where, getDocs, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    showToast, formatCurrency, carregarEmpresaUsuario, verificarStatusEmpresa 
} from './util.js';

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = null;
let currentEmpresa = null;
let faturamentoChart = null;
let servicosChart = null;

// ==================== FUNÇÕES AUXILIARES ====================
async function getCount(collectionName, filters = {}) {
    if (!currentEmpresa) return 0;
    let q = query(collection(db, collectionName), where('empresaId', '==', currentEmpresa.id));
    if (filters.deleted !== undefined) q = query(q, where('deleted', '==', filters.deleted));
    if (filters.ativo !== undefined) q = query(q, where('ativo', '==', filters.ativo));
    if (filters.status) q = query(q, where('status', '==', filters.status));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
}

async function getFaturamentoMensal() {
    if (!currentEmpresa) return 0;
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const q = query(
        collection(db, 'financeiro'),
        where('empresaId', '==', currentEmpresa.id),
        where('status', '==', 'pago'),
        where('dataPagamento', '>=', primeiroDiaMes.toISOString().split('T')[0])
    );
    const snap = await getDocs(q);
    let total = 0;
    snap.forEach(doc => {
        const valor = doc.data().valor || 0;
        if (doc.data().tipo === 'entrada') total += valor;
        else if (doc.data().tipo === 'saida') total -= valor;
    });
    return total;
}

async function getAgendamentosHoje() {
    if (!currentEmpresa) return 0;
    const hoje = new Date().toISOString().split('T')[0];
    const q = query(
        collection(db, 'agendamentos'),
        where('empresaId', '==', currentEmpresa.id),
        where('data', '>=', hoje),
        where('data', '<', new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0])
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

async function getServicosAtivos() {
    return await getCount('servicos', { ativo: true });
}

async function getProdutosEstoqueBaixo() {
    if (!currentEmpresa) return 0;
    const q = query(
        collection(db, 'produtos'),
        where('empresaId', '==', currentEmpresa.id),
        where('estoque', '<=', 'estoqueMin') // Nota: isso é uma simplificação; no Firestore você faria uma query composta, mas para demo usamos lógica cliente
    );
    const snap = await getDocs(q);
    let count = 0;
    snap.forEach(doc => {
        const data = doc.data();
        if (data.estoque <= data.estoqueMin) count++;
    });
    return count;
}

async function getFaturamentoUltimos6Meses() {
    if (!currentEmpresa) return { meses: [], valores: [] };
    const meses = [];
    const valores = [];
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const nomeMes = data.toLocaleString('pt-BR', { month: 'short' });
        meses.push(nomeMes);
        const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1).toISOString().split('T')[0];
        const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).toISOString().split('T')[0];
        const q = query(
            collection(db, 'financeiro'),
            where('empresaId', '==', currentEmpresa.id),
            where('status', '==', 'pago'),
            where('dataPagamento', '>=', primeiroDia),
            where('dataPagamento', '<=', ultimoDia)
        );
        const snap = await getDocs(q);
        let total = 0;
        snap.forEach(doc => {
            const valor = doc.data().valor || 0;
            if (doc.data().tipo === 'entrada') total += valor;
            else if (doc.data().tipo === 'saida') total -= valor;
        });
        valores.push(total);
    }
    return { meses, valores };
}

async function getDistribuicaoServicos() {
    if (!currentEmpresa) return { labels: [], data: [] };
    const q = query(collection(db, 'servicos'), where('empresaId', '==', currentEmpresa.id), where('ativo', '==', true));
    const snap = await getDocs(q);
    const categorias = {};
    snap.forEach(doc => {
        const cat = doc.data().categoria || 'outros';
        categorias[cat] = (categorias[cat] || 0) + 1;
    });
    const labels = Object.keys(categorias).map(k => {
        const map = { banho: 'Banho', tosa: 'Tosa', veterinario: 'Veterinário', estetica: 'Estética', hospedagem: 'Hospedagem', outros: 'Outros' };
        return map[k] || k;
    });
    const data = Object.values(categorias);
    return { labels, data };
}

// ==================== ATUALIZAR CARDS ====================
async function atualizarStats() {
    if (!currentEmpresa) return;
    const totalClientes = await getCount('clientes', { deleted: false });
    const totalPets = await getCount('pets');
    const faturamentoMes = await getFaturamentoMensal();
    const agendamentosHoje = await getAgendamentosHoje();
    const servicosAtivos = await getServicosAtivos();
    const produtosEstoqueBaixo = await getProdutosEstoqueBaixo();

    document.getElementById('totalClientes').innerText = totalClientes;
    document.getElementById('totalPets').innerText = totalPets;
    document.getElementById('faturamentoMes').innerHTML = formatCurrency(faturamentoMes);
    document.getElementById('agendamentosHoje').innerText = agendamentosHoje;
    document.getElementById('servicosAtivos').innerText = servicosAtivos;
    document.getElementById('produtosEstoqueBaixo').innerText = produtosEstoqueBaixo;
}

// ==================== GRÁFICOS ====================
async function carregarGraficoFaturamento() {
    const { meses, valores } = await getFaturamentoUltimos6Meses();
    const ctx = document.getElementById('faturamentoChart').getContext('2d');
    if (faturamentoChart) faturamentoChart.destroy();
    faturamentoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [{
                label: 'Faturamento (R$)',
                data: valores,
                borderColor: '#2c7da0',
                backgroundColor: 'rgba(44,125,160,0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `R$ ${ctx.raw.toFixed(2)}` } }
            }
        }
    });
}

async function carregarGraficoServicos() {
    const { labels, data } = await getDistribuicaoServicos();
    const ctx = document.getElementById('servicosChart').getContext('2d');
    if (servicosChart) servicosChart.destroy();
    servicosChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#2c7da0', '#61a5c2', '#1f5068', '#89c2d9', '#a9d6e5', '#e2edf2'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// ==================== TRIAL E EMPRESA ====================
function exibirAlertaTrial(statusInfo) {
    const trialDiv = document.getElementById('trialAlert');
    if (statusInfo.status === 'trial_urgente') {
        trialDiv.innerHTML = `<div><i class="fas fa-hourglass-half"></i> Teste termina em <strong>${statusInfo.diasRestantes}</strong> dia(s)!</div><button class="btn btn-warning" onclick="solicitarLiberacao()">Solicitar Liberação</button>`;
        trialDiv.style.display = 'flex';
        trialDiv.className = 'trial-alert warning';
    } else if (statusInfo.status === 'expirado') {
        trialDiv.innerHTML = `<div><i class="fas fa-hourglass-end"></i> <strong>Período de teste EXPIRADO!</strong> O sistema está bloqueado.</div><button class="btn btn-danger" onclick="solicitarLiberacao()">Solicitar Liberação</button>`;
        trialDiv.style.display = 'flex';
        trialDiv.className = 'trial-alert expired';
    } else if (statusInfo.status === 'trial') {
        trialDiv.innerHTML = `<div><i class="fas fa-calendar-alt"></i> Período de teste: <strong>${statusInfo.diasRestantes}</strong> dias restantes.</div>`;
        trialDiv.style.display = 'flex';
        trialDiv.className = 'trial-alert';
    } else if (statusInfo.status === 'ativo') {
        trialDiv.innerHTML = `<div><i class="fas fa-check-circle"></i> Conta liberada! Sem restrições de acesso.</div>`;
        trialDiv.style.display = 'flex';
        trialDiv.style.background = '#e0f2e9';
        trialDiv.style.borderLeftColor = '#2a9d8f';
    } else {
        trialDiv.style.display = 'none';
    }
}

window.solicitarLiberacao = () => {
    const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
    const corpo = encodeURIComponent(`Solicito liberação da empresa:\n\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}\nWhatsApp: ${currentEmpresa?.emp_whatsapp || '-'}\n\nAguardo retorno.`);
    window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
    showToast('Abrindo cliente de e-mail...', 'info');
};

// ==================== NAVEGAÇÃO DOS CARDS ====================
document.querySelectorAll('.stat-card[data-module]').forEach(card => {
    card.addEventListener('click', () => {
        const modulo = card.dataset.module;
        if (modulo) window.location.href = modulo;
    });
});

// ==================== AUTENTICAÇÃO E INICIALIZAÇÃO ====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentEmpresa = await carregarEmpresaUsuario(user);
        if (!currentEmpresa) { window.location.href = 'login.html'; return; }
        document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${currentEmpresa.emp_razao_social || currentEmpresa.emp_nome_fantasia || 'Empresa'}`;
        
        const statusInfo = verificarStatusEmpresa(currentEmpresa);
        exibirAlertaTrial(statusInfo);
        
        await atualizarStats();
        await carregarGraficoFaturamento();
        await carregarGraficoServicos();
    } else {
        window.location.href = 'login.html';
    }
});

// ==================== EVENTOS GLOBAIS ====================
document.getElementById('logoutBtn').onclick = () => auth.signOut();
document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
    document.getElementById('infoModal').style.display = 'none';
});
window.onclick = (e) => {
    if (e.target === document.getElementById('infoModal')) {
        document.getElementById('infoModal').style.display = 'none';
    }
};