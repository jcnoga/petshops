// ==================== IMPORTAÇÕES ====================
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    formatCurrency, showToast, carregarEmpresaUsuario, verificarStatusEmpresa 
} from './util.js';

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = null;
let currentEmpresa = null;
let dataInicio = null;
let dataFim = null;

// Gráficos
let chartFluxo = null;
let chartCategoriaEntrada = null;
let chartServicosMais = null;
let chartProdutosMais = null;

// ==================== FUNÇÕES AUXILIARES ====================
function getDataInicioFim() {
    const inicio = document.getElementById('dataInicio').value;
    const fim = document.getElementById('dataFim').value;
    return { inicio: inicio ? new Date(inicio) : null, fim: fim ? new Date(fim) : null };
}
function setPeriodoRapido(periodo) {
    const hoje = new Date();
    let start = new Date();
    switch(periodo) {
        case 'hoje':
            start = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
            break;
        case 'semana':
            start = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 7);
            break;
        case 'mes':
            start = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            break;
        case 'trimestre':
            start = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
            break;
        case 'ano':
            start = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
            break;
        default: return;
    }
    document.getElementById('dataInicio').value = start.toISOString().split('T')[0];
    document.getElementById('dataFim').value = hoje.toISOString().split('T')[0];
}
document.getElementById('periodoRapido').addEventListener('change', (e) => {
    if (e.target.value) setPeriodoRapido(e.target.value);
});
document.getElementById('aplicarFiltrosBtn').onclick = () => {
    carregarRelatorios();
};

// ==================== BUSCAR DADOS DAS COLEÇÕES ====================
async function carregarRelatorios() {
    if (!currentEmpresa) return;
    const loading = document.getElementById('loadingReport');
    loading.style.display = 'flex';
    try {
        const { inicio, fim } = getDataInicioFim();
        dataInicio = inicio;
        dataFim = fim;
        // 1. Dados financeiros (entradas/saídas pagas)
        const financeiroSnap = await getDocs(query(collection(db, 'financeiro'), where('empresaId', '==', currentEmpresa.id)));
        let entradas = [];
        let saidas = [];
        financeiroSnap.forEach(doc => {
            const data = doc.data();
            const dataDoc = data.dataPagamento || data.dataVencimento;
            if (!dataDoc) return;
            const dataObj = new Date(dataDoc);
            if (inicio && dataObj < inicio) return;
            if (fim && dataObj > fim) return;
            if (data.status === 'pago') {
                if (data.tipo === 'entrada') entradas.push({ valor: data.valor || 0, categoria: data.categoria, data: dataDoc });
                else if (data.tipo === 'saida') saidas.push({ valor: data.valor || 0, categoria: data.categoria, data: dataDoc });
            }
        });
        const totalEntradas = entradas.reduce((s, e) => s + e.valor, 0);
        const totalSaidas = saidas.reduce((s, e) => s + e.valor, 0);
        // 2. Dados de compras (também são saídas, mas já estão incluídas nas saidas? Compras criam lançamentos financeiros tipo "saida" categoria "compras", então já estão contabilizadas. Para fins de relatório, vamos buscar compras separadamente para exibir o valor.
        const comprasSnap = await getDocs(query(collection(db, 'compras'), where('empresaId', '==', currentEmpresa.id), where('deleted', '==', false)));
        let totalComprasPeriodo = 0;
        comprasSnap.forEach(doc => {
            const compra = doc.data();
            const dataCompra = compra.data;
            if (dataCompra) {
                const dataObj = new Date(dataCompra);
                if (inicio && dataObj < inicio) return;
                if (fim && dataObj > fim) return;
                totalComprasPeriodo += compra.total || 0;
            }
        });
        // 3. Dados de agendamentos (para ticket médio, serviços mais realizados, top pets/clientes)
        const agendamentosSnap = await getDocs(query(collection(db, 'agendamentos'), where('empresaId', '==', currentEmpresa.id)));
        let agendamentos = [];
        let totalAtendimentos = 0;
        let valorTotalAtendimentos = 0;
        let servicosCount = {};
        let clientesMap = {};
        let petsMap = {};
        agendamentosSnap.forEach(doc => {
            const age = doc.data();
            const dataAge = age.data;
            if (dataAge) {
                const dataObj = new Date(dataAge);
                if (inicio && dataObj < inicio) return;
                if (fim && dataObj > fim) return;
            } else return;
            totalAtendimentos++;
            const valor = age.valor || 0;
            valorTotalAtendimentos += valor;
            const servico = age.servicoNome || age.servicoId || 'Serviço';
            servicosCount[servico] = (servicosCount[servico] || 0) + 1;
            const cliente = age.clienteNome || age.clienteId;
            if (cliente) {
                if (!clientesMap[cliente]) clientesMap[cliente] = { total: 0, qtd: 0 };
                clientesMap[cliente].total += valor;
                clientesMap[cliente].qtd++;
            }
            const pet = age.petNome || age.petId;
            if (pet) {
                if (!petsMap[pet]) petsMap[pet] = { total: 0, qtd: 0, tutor: age.clienteNome || '' };
                petsMap[pet].total += valor;
                petsMap[pet].qtd++;
            }
        });
        const ticketMedio = totalAtendimentos > 0 ? valorTotalAtendimentos / totalAtendimentos : 0;
        const lucroEstimado = totalEntradas - totalSaidas; // simplificado
        // 4. Dados de produtos mais vendidos (usar movimentos de estoque ou financeiro? Vamos usar financeiro com categoria "produtos" e descrição)
        let produtosVendas = {};
        entradas.forEach(e => {
            if (e.categoria === 'produtos') {
                // extrair nome do produto da descrição
                let nome = 'Produto';
                // simples
                produtosVendas[nome] = (produtosVendas[nome] || 0) + e.valor;
            }
        });
        // Se não tiver dados, criar placeholder
        if (Object.keys(produtosVendas).length === 0) produtosVendas['Nenhum produto'] = 1;
        // Preparar dados para gráficos
        // Gráfico fluxo mensal (últimos 6 meses)
        const mesesLabels = [];
        const entradasMensais = [];
        const saidasMensais = [];
        const hojeRef = new Date();
        for (let i = 5; i >= 0; i--) {
            const ano = hojeRef.getFullYear();
            const mes = hojeRef.getMonth() - i;
            const dataMes = new Date(ano, mes, 1);
            const nomeMes = dataMes.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
            mesesLabels.push(nomeMes);
            const inicioMes = new Date(ano, mes, 1).toISOString().split('T')[0];
            const fimMes = new Date(ano, mes+1, 0).toISOString().split('T')[0];
            let entr = 0, said = 0;
            entradas.forEach(e => { if (e.data >= inicioMes && e.data <= fimMes) entr += e.valor; });
            saidas.forEach(s => { if (s.data >= inicioMes && s.data <= fimMes) said += s.valor; });
            entradasMensais.push(entr);
            saidasMensais.push(said);
        }
        // Gráfico distribuição entradas por categoria
        const catEntradas = {};
        entradas.forEach(e => {
            const cat = e.categoria || 'outros';
            catEntradas[cat] = (catEntradas[cat] || 0) + e.valor;
        });
        const catLabels = Object.keys(catEntradas).map(k => {
            const map = { servicos: 'Serviços', produtos: 'Produtos', outros: 'Outros' };
            return map[k] || k;
        });
        const catData = Object.values(catEntradas);
        // Gráfico serviços mais realizados
        const servicosOrdenados = Object.entries(servicosCount).sort((a,b) => b[1]-a[1]).slice(0,5);
        const servLabels = servicosOrdenados.map(s => s[0]);
        const servData = servicosOrdenados.map(s => s[1]);
        // Gráfico produtos mais vendidos (faturamento)
        const produtosOrdenados = Object.entries(produtosVendas).sort((a,b) => b[1]-a[1]).slice(0,5);
        const prodLabels = produtosOrdenados.map(p => p[0]);
        const prodData = produtosOrdenados.map(p => p[1]);
        // Tabela top clientes
        const topClientes = Object.entries(clientesMap).sort((a,b) => b[1].total - a[1].total).slice(0,5);
        // Tabela top pets
        const topPets = Object.entries(petsMap).sort((a,b) => b[1].qtd - a[1].qtd).slice(0,5);
        // Tabela resumo mensal (últimos 6 meses)
        const resumoMensal = [];
        for (let i = 5; i >= 0; i--) {
            const ano = hojeRef.getFullYear();
            const mes = hojeRef.getMonth() - i;
            const dataMes = new Date(ano, mes, 1);
            const nomeMes = dataMes.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
            const inicioMes = new Date(ano, mes, 1).toISOString().split('T')[0];
            const fimMes = new Date(ano, mes+1, 0).toISOString().split('T')[0];
            let entr = 0, said = 0, comprasMes = 0;
            entradas.forEach(e => { if (e.data >= inicioMes && e.data <= fimMes) entr += e.valor; });
            saidas.forEach(s => { if (s.data >= inicioMes && s.data <= fimMes) said += s.valor; });
            comprasSnap.forEach(c => {
                const dataCompra = c.data();
                if (dataCompra && dataCompra.data >= inicioMes && dataCompra.data <= fimMes) comprasMes += (c.data().total || 0);
            });
            resumoMensal.push({ mes: nomeMes, entradas: entr, saidas: said, lucro: entr - said, compras: comprasMes });
        }

        // Atualizar cards
        document.getElementById('totalFaturamento').innerHTML = formatCurrency(valorTotalAtendimentos);
        document.getElementById('totalLucro').innerHTML = formatCurrency(lucroEstimado);
        document.getElementById('ticketMedio').innerHTML = formatCurrency(ticketMedio);
        document.getElementById('totalEntradas').innerHTML = formatCurrency(totalEntradas);
        document.getElementById('totalSaidas').innerHTML = formatCurrency(totalSaidas);
        document.getElementById('totalCompras').innerHTML = formatCurrency(totalComprasPeriodo);

        // Atualizar gráficos
        if (chartFluxo) chartFluxo.destroy();
        chartFluxo = new Chart(document.getElementById('fluxoMensalChart'), {
            type: 'line', data: { labels: mesesLabels, datasets: [
                { label: 'Entradas', data: entradasMensais, borderColor: '#2a9d8f', backgroundColor: 'rgba(42,157,143,0.1)', fill: true, tension: 0.3 },
                { label: 'Saídas', data: saidasMensais, borderColor: '#e76f51', backgroundColor: 'rgba(231,111,81,0.1)', fill: true, tension: 0.3 }
            ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } } } }
        });
        if (chartCategoriaEntrada) chartCategoriaEntrada.destroy();
        chartCategoriaEntrada = new Chart(document.getElementById('categoriaEntradaChart'), {
            type: 'pie', data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: ['#2c7da0','#61a5c2','#89c2d9','#a9d6e5'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } } } }
        });
        if (chartServicosMais) chartServicosMais.destroy();
        chartServicosMais = new Chart(document.getElementById('servicosMaisChart'), {
            type: 'bar', data: { labels: servLabels, datasets: [{ label: 'Quantidade', data: servData, backgroundColor: '#2c7da0' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        if (chartProdutosMais) chartProdutosMais.destroy();
        chartProdutosMais = new Chart(document.getElementById('produtosMaisChart'), {
            type: 'bar', data: { labels: prodLabels, datasets: [{ label: 'Faturamento (R$)', data: prodData, backgroundColor: '#61a5c2' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } } } }
        });

        // Tabelas
        const topClientesBody = document.getElementById('topClientesBody');
        if (topClientes.length === 0) topClientesBody.innerHTML = '<tr><td colspan="3">Nenhum cliente no período</td></tr>';
        else topClientesBody.innerHTML = topClientes.map(([nome, dados]) => `<tr><td>${escapeHtml(nome)}</td><td>${formatCurrency(dados.total)}</td><td>${dados.qtd}</td></tr>`).join('');
        const topPetsBody = document.getElementById('topPetsBody');
        if (topPets.length === 0) topPetsBody.innerHTML = '<tr><td colspan="4">Nenhum pet no período</td></tr>';
        else topPetsBody.innerHTML = topPets.map(([nome, dados]) => `<tr><td>${escapeHtml(nome)}</td><td>${escapeHtml(dados.tutor)}</td><td>${dados.qtd}</td><td>${formatCurrency(dados.total)}</td></tr>`).join('');
        const resumoBody = document.getElementById('resumoMensalBody');
        if (resumoMensal.length === 0) resumoBody.innerHTML = '<tr><td colspan="5">Nenhum dado no período</td></tr>';
        else resumoBody.innerHTML = resumoMensal.map(r => `<tr><td>${r.mes}</td><td>${formatCurrency(r.entradas)}</td><td>${formatCurrency(r.saidas)}</td><td>${formatCurrency(r.lucro)}</td><td>${formatCurrency(r.compras)}</td></tr>`).join('');

        showToast('Relatórios atualizados!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Erro ao carregar relatórios', 'error');
    } finally {
        loading.style.display = 'none';
    }
}
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    const loading = document.getElementById('loadingReport');
    loading.style.display = 'flex';
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44,125,160); doc.text('Relatório Gerencial PerShop', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Período: ${dataInicio ? dataInicio.toLocaleDateString() : 'início'} até ${dataFim ? dataFim.toLocaleDateString() : 'hoje'}`, 14, 38);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 46);
        // Resumo de indicadores
        const kpis = [
            `Faturamento: ${document.getElementById('totalFaturamento').innerText}`,
            `Lucro: ${document.getElementById('totalLucro').innerText}`,
            `Ticket Médio: ${document.getElementById('ticketMedio').innerText}`,
            `Entradas: ${document.getElementById('totalEntradas').innerText}`,
            `Saídas: ${document.getElementById('totalSaidas').innerText}`,
            `Compras: ${document.getElementById('totalCompras').innerText}`
        ];
        doc.setFontSize(9);
        let y = 55;
        kpis.forEach((kp, idx) => {
            doc.text(kp, 14 + (idx%3)*70, y + Math.floor(idx/3)*8);
        });
        y += 20;
        // Capturar gráficos (simplificado, não captura imagens aqui por complexidade, apenas texto)
        doc.text('Gráficos e detalhes disponíveis no sistema.', 14, y);
        // Salvar
        doc.save(`relatorio_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado!', 'success');
    } catch(e) { showToast('Erro ao gerar PDF', 'error'); } finally { loading.style.display = 'none'; }
}
document.getElementById('exportPdfBtn').onclick = exportarPDF;

// ==================== AUTENTICAÇÃO ====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentEmpresa = await carregarEmpresaUsuario(user);
        if (!currentEmpresa) { window.location.href = 'login.html'; return; }
        document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${currentEmpresa.emp_razao_social || currentEmpresa.emp_nome_fantasia || 'Empresa'}`;
        const statusInfo = verificarStatusEmpresa(currentEmpresa);
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
        } else { trialDiv.style.display = 'none'; }
        await carregarRelatorios();
    } else { window.location.href = 'login.html'; }
});
window.solicitarLiberacao = () => {
    const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
    const corpo = encodeURIComponent(`Solicito liberação da empresa:\n\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}\nWhatsApp: ${currentEmpresa?.emp_whatsapp || '-'}\n\nAguardo retorno.`);
    window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
    showToast('Abrindo cliente de e-mail...', 'info');
};
document.getElementById('logoutBtn').onclick = () => auth.signOut();