// financeiro.js
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml, showToast, formatCurrency, parseCurrency, formatarData,
    carregarEmpresaUsuario, configurarMascaraValor, verificarStatusEmpresa
} from './util.js';

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
const itemsPerPage = 10;

let financeiroCache = [];
let unsubscribeFinanceiro = null;
let fluxoChart = null;
let categoriaChart = null;

// ==================== CARREGAR DADOS COM LISTENER ====================
async function carregarDados() {
    if (!currentEmpresa) return;
    const empresaId = currentEmpresa.id;

    if (unsubscribeFinanceiro) unsubscribeFinanceiro();
    const q = query(collection(db, 'financeiro'), where('empresaId', '==', empresaId));
    unsubscribeFinanceiro = onSnapshot(q, (snapshot) => {
        financeiroCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFinanceiro();
        updateStats();
        updateCharts();
    }, (error) => console.error('Erro no snapshot financeiro:', error));
}

// ==================== CRUD ====================
async function addFinanceiro(data) {
    const newDoc = {
        ...data,
        empresaId: currentEmpresa.id,
        criado_em: new Date().toISOString(),
        criado_por: currentUser.uid
    };
    await addDoc(collection(db, 'financeiro'), newDoc);
    showToast('Lançamento adicionado!', 'success');
}

async function updateFinanceiro(id, updates) {
    await updateDoc(doc(db, 'financeiro', id), { ...updates, atualizado_em: new Date().toISOString() });
    showToast('Lançamento atualizado!', 'success');
}

async function deleteFinanceiro(id) {
    if (!confirm('Excluir lançamento? Esta ação não pode ser desfeita.')) return;
    await deleteDoc(doc(db, 'financeiro', id));
    showToast('Lançamento excluído!', 'success');
}

// ==================== FORMULÁRIO ====================
function getFormData() {
    return {
        tipo: document.getElementById('finTipo').value,
        categoria: document.getElementById('finCategoria').value,
        valor: parseCurrency(document.getElementById('finValor').value),
        formPagto: document.getElementById('finFormPagto').value,
        dataVencimento: document.getElementById('finDataVenc').value,
        dataPagamento: document.getElementById('finDataPagto').value,
        status: document.getElementById('finStatus').value,
        clienteFornecedor: document.getElementById('finClienteFornecedor').value,
        obs: document.getElementById('finObs').value
    };
}

function validarFormulario() {
    const valor = parseCurrency(document.getElementById('finValor').value);
    if (isNaN(valor) || valor <= 0) { showToast('Valor inválido!', 'error'); return false; }
    const categoria = document.getElementById('finCategoria').value;
    if (!categoria) { showToast('Selecione uma categoria!', 'error'); return false; }
    const status = document.getElementById('finStatus').value;
    const dataPagamento = document.getElementById('finDataPagto').value;
    if (status === 'pago' && !dataPagamento) { showToast('Para pagos, informe a data de pagamento!', 'error'); return false; }
    return true;
}

function resetForm() {
    document.getElementById('finTipo').value = 'entrada';
    document.getElementById('finCategoria').value = '';
    document.getElementById('finValor').value = '';
    document.getElementById('finFormPagto').value = '';
    document.getElementById('finDataVenc').value = '';
    document.getElementById('finDataPagto').value = '';
    document.getElementById('finStatus').value = 'pendente';
    document.getElementById('finClienteFornecedor').value = '';
    document.getElementById('finObs').value = '';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const btn = document.getElementById('saveFinanceiroBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}

function fillForm(f) {
    document.getElementById('finTipo').value = f.tipo || 'entrada';
    document.getElementById('finCategoria').value = f.categoria || '';
    document.getElementById('finValor').value = formatCurrency(f.valor || 0);
    document.getElementById('finFormPagto').value = f.formPagto || '';
    document.getElementById('finDataVenc').value = f.dataVencimento || '';
    document.getElementById('finDataPagto').value = f.dataPagamento || '';
    document.getElementById('finStatus').value = f.status || 'pendente';
    document.getElementById('finClienteFornecedor').value = f.clienteFornecedor || '';
    document.getElementById('finObs').value = f.obs || '';
}

async function salvarFinanceiro() {
    if (!validarFormulario()) return;
    const data = getFormData();
    if (editingId) await updateFinanceiro(editingId, data);
    else await addFinanceiro(data);
    resetForm();
}

function cancelEdit() { resetForm(); }

// ==================== VIEW / EDIT ====================
function viewFinanceiro(id) {
    const f = financeiroCache.find(f => f.id === id);
    if (!f) return;
    const statusClass = f.status === 'pago' ? 'status-pago' : (f.status === 'pendente' ? 'status-pendente' : 'status-atrasado');
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="info-row"><span class="info-label">Tipo:</span><span class="info-value">${f.tipo === 'entrada' ? '💰 Entrada' : '💸 Saída'}</span></div>
        <div class="info-row"><span class="info-label">Categoria:</span><span class="info-value">${escapeHtml(f.categoria || '-')}</span></div>
        <div class="info-row"><span class="info-label">Valor:</span><span class="info-value">R$ ${formatCurrency(f.valor || 0)}</span></div>
        <div class="info-row"><span class="info-label">Forma Pagamento:</span><span class="info-value">${escapeHtml(f.formPagto || '-')}</span></div>
        <div class="info-row"><span class="info-label">Vencimento:</span><span class="info-value">${f.dataVencimento ? new Date(f.dataVencimento).toLocaleDateString('pt-BR') : '-'}</span></div>
        <div class="info-row"><span class="info-label">Pagamento:</span><span class="info-value">${f.dataPagamento ? new Date(f.dataPagamento).toLocaleDateString('pt-BR') : '-'}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="status-badge ${statusClass}">${f.status === 'pago' ? '✅ Pago' : (f.status === 'pendente' ? '⏳ Pendente' : '⚠️ Atrasado')}</span></span></div>
        ${f.clienteFornecedor ? `<div class="info-row"><span class="info-label">Cliente/Fornecedor:</span><span class="info-value">${escapeHtml(f.clienteFornecedor)}</span></div>` : ''}
        ${f.obs ? `<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(f.obs)}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Cadastrado em:</span><span class="info-value">${f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '-'}</span></div>
    `;
    document.getElementById('viewModal').style.display = 'flex';
}

function editFinanceiro(id) {
    const f = financeiroCache.find(f => f.id === id);
    if (f) {
        fillForm(f);
        editingId = id;
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        const btn = document.getElementById('saveFinanceiroBtn');
        btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        window.scrollTo({ top: 0 });
    }
}

function fecharModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// ==================== FILTROS E RENDERIZAÇÃO ====================
function getFiltros() {
    return {
        search: document.getElementById('searchInput')?.value.toLowerCase() || '',
        tipoFilter: document.getElementById('tipoFilter')?.value || '',
        statusFilter: document.getElementById('statusFilter')?.value || '',
        inicio: document.getElementById('dataInicio').value,
        fim: document.getElementById('dataFim').value
    };
}

function aplicarFiltros(data) {
    let filtered = [...data];
    const { search, tipoFilter, statusFilter, inicio, fim } = getFiltros();
    if (inicio && fim) {
        filtered = filtered.filter(f => {
            const dataComp = f.dataPagamento || f.dataVencimento;
            return dataComp && dataComp >= inicio && dataComp <= fim;
        });
    }
    if (search) {
        filtered = filtered.filter(f =>
            (f.categoria || '').toLowerCase().includes(search) ||
            (f.obs || '').toLowerCase().includes(search) ||
            (f.clienteFornecedor || '').toLowerCase().includes(search)
        );
    }
    if (tipoFilter) filtered = filtered.filter(f => f.tipo === tipoFilter);
    if (statusFilter) filtered = filtered.filter(f => f.status === statusFilter);
    return filtered;
}

function aplicarFiltrosEAtualizar() {
    currentPage = 1;
    renderFinanceiro();
    updateStats();
    updateCharts();
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('tipoFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
    document.getElementById('periodoRapido').value = '';
    aplicarFiltrosEAtualizar();
    showToast('Filtros limpos!', 'success');
}

function applyPeriodo() {
    const periodo = document.getElementById('periodoRapido').value;
    const hoje = new Date();
    let inicio = null, fim = null;
    if (periodo === 'hoje') {
        inicio = new Date(); inicio.setHours(0, 0, 0, 0);
        fim = new Date(); fim.setHours(23, 59, 59, 999);
    } else if (periodo === 'semana') {
        inicio = new Date(); inicio.setDate(hoje.getDate() - hoje.getDay());
        fim = new Date();
    } else if (periodo === 'mes') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    } else if (periodo === 'trimestre') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
        fim = new Date();
    }
    if (inicio) document.getElementById('dataInicio').value = inicio.toISOString().split('T')[0];
    if (fim) document.getElementById('dataFim').value = fim.toISOString().split('T')[0];
    aplicarFiltrosEAtualizar();
}

function renderFinanceiro() {
    const filtered = aplicarFiltros(financeiroCache);
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const tbody = document.getElementById('financeiroTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Nenhum lançamento encontrado<\/td><\/tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(f => {
        const statusClass = f.status === 'pago' ? 'status-pago' : (f.status === 'pendente' ? 'status-pendente' : 'status-atrasado');
        const dataExibicao = f.dataPagamento || f.dataVencimento || '-';
        const dataFormatada = dataExibicao !== '-' ? new Date(dataExibicao).toLocaleDateString('pt-BR') : '-';
        return `<tr>
            <td style="white-space:nowrap;">${dataFormatada}</td>
            <td>${f.tipo === 'entrada' ? '💰 Entrada' : '💸 Saída'}</td>
            <td>${escapeHtml(f.categoria || '-')}</td>
            <td><strong style="color:${f.tipo === 'entrada' ? '#2a9d8f' : '#e76f51'}">R$ ${formatCurrency(f.valor || 0)}</strong></td>
            <td>${escapeHtml(f.formPagto || '-')}</td>
            <td><span class="status-badge ${statusClass}">${f.status === 'pago' ? '✅ Pago' : (f.status === 'pendente' ? '⏳ Pendente' : '⚠️ Atrasado')}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" data-id="${f.id}"><i class="fas fa-eye"></i></button>
                <button class="action-btn edit" data-id="${f.id}"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" data-id="${f.id}"><i class="fas fa-trash-alt"></i></button>
            </div>
        </tr>`;
    }).join('');
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pagHtml;

    // Reatribuir eventos
    document.querySelectorAll('.action-btn.view').forEach(btn => {
        btn.addEventListener('click', () => viewFinanceiro(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => editFinanceiro(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteFinanceiro(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => goToPage(parseInt(btn.getAttribute('data-page'))));
    });
}

function goToPage(page) {
    currentPage = page;
    renderFinanceiro();
}

function updateStats() {
    const filtered = aplicarFiltros(financeiroCache);
    const entradas = filtered.filter(f => f.tipo === 'entrada' && f.status === 'pago').reduce((s, f) => s + (f.valor || 0), 0);
    const saidas = filtered.filter(f => f.tipo === 'saida' && f.status === 'pago').reduce((s, f) => s + (f.valor || 0), 0);
    const pendentes = filtered.filter(f => f.status === 'pendente' || f.status === 'atrasado');
    const valorPendente = pendentes.reduce((s, f) => s + (f.valor || 0), 0);
    document.getElementById('totalEntradas').innerHTML = `R$ ${formatCurrency(entradas)}`;
    document.getElementById('totalSaidas').innerHTML = `R$ ${formatCurrency(saidas)}`;
    document.getElementById('saldoTotal').innerHTML = `R$ ${formatCurrency(entradas - saidas)}`;
    document.getElementById('totalPendentes').innerText = pendentes.length;
    document.getElementById('valorPendente').innerHTML = `R$ ${formatCurrency(valorPendente)}`;
}

// ==================== GRÁFICOS ====================
function updateCharts() {
    const filtered = aplicarFiltros(financeiroCache);
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const entradasMensais = new Array(12).fill(0);
    const saidasMensais = new Array(12).fill(0);
    filtered.forEach(f => {
        if (f.status === 'pago') {
            const dataRef = f.dataPagamento || f.dataVencimento;
            if (dataRef) {
                const mes = new Date(dataRef).getMonth();
                if (f.tipo === 'entrada') entradasMensais[mes] += f.valor;
                else saidasMensais[mes] += f.valor;
            }
        }
    });
    if (fluxoChart) fluxoChart.destroy();
    const ctx1 = document.getElementById('fluxoChart').getContext('2d');
    fluxoChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [
                { label: 'Entradas', data: entradasMensais, borderColor: '#2a9d8f', backgroundColor: 'rgba(42,157,143,0.1)', fill: true, tension: 0.4 },
                { label: 'Saídas', data: saidasMensais, borderColor: '#e76f51', backgroundColor: 'rgba(231,111,81,0.1)', fill: true, tension: 0.4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: R$ ${formatCurrency(ctx.raw)}` } } }
        }
    });

    const cats = {};
    filtered.forEach(f => { if (f.status === 'pago' && f.categoria) cats[f.categoria] = (cats[f.categoria] || 0) + f.valor; });
    const nomes = { servicos: 'Serviços', produtos: 'Produtos', salario: 'Salários', aluguel: 'Aluguel', contas: 'Contas', impostos: 'Impostos', outros: 'Outros' };
    if (categoriaChart) categoriaChart.destroy();
    const ctx2 = document.getElementById('categoriaChart').getContext('2d');
    categoriaChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats).map(k => nomes[k] || k),
            datasets: [{ data: Object.values(cats), backgroundColor: ['#2c7da0', '#2a9d8f', '#e9c46a', '#e76f51', '#61a5c2', '#f4a261', '#264653'], borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: R$ ${formatCurrency(ctx.raw)} (${((ctx.raw / Object.values(cats).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%)` } } }
        }
    });
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    const filtered = aplicarFiltros(financeiroCache);
    if (filtered.length === 0) { showToast('Não há dados para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44, 125, 160); doc.text('Relatório Financeiro', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 38);
        const entradas = filtered.filter(f => f.tipo === 'entrada' && f.status === 'pago').reduce((s, f) => s + (f.valor || 0), 0);
        const saidas = filtered.filter(f => f.tipo === 'saida' && f.status === 'pago').reduce((s, f) => s + (f.valor || 0), 0);
        const pendentes = filtered.filter(f => f.status === 'pendente' || f.status === 'atrasado');
        const valorPendente = pendentes.reduce((s, f) => s + (f.valor || 0), 0);
        doc.setFontSize(9); doc.text(`Total Entradas: R$ ${formatCurrency(entradas)}`, 14, 46);
        doc.text(`Total Saídas: R$ ${formatCurrency(saidas)}`, 14, 54);
        doc.text(`Saldo: R$ ${formatCurrency(entradas - saidas)}`, 14, 62);
        doc.text(`Pendentes: ${pendentes.length} (R$ ${formatCurrency(valorPendente)})`, 14, 70);
        const colunas = [{ label: 'Data', width: 30 }, { label: 'Tipo', width: 25 }, { label: 'Categoria', width: 35 }, { label: 'Valor', width: 30 }, { label: 'Forma', width: 30 }, { label: 'Status', width: 30 }];
        let y = 80;
        doc.setFontSize(8); doc.setFillColor(44, 125, 160); doc.setTextColor(255, 255, 255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 8, 'F'); doc.text(col.label, x + 2, y + 5); x += col.width; });
        doc.setTextColor(0, 0, 0);
        y += 10;
        for (const f of filtered) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 8, 'F'); doc.text(col.label, x + 2, y + 5); x += col.width; }); y += 10; x = 14; doc.setTextColor(0, 0, 0); }
            const dataExibicao = f.dataPagamento || f.dataVencimento || '-';
            const dataFormatada = dataExibicao !== '-' ? new Date(dataExibicao).toLocaleDateString('pt-BR') : '-';
            doc.text(dataFormatada, x + 1, y + 4); x += colunas[0].width;
            doc.text(f.tipo === 'entrada' ? 'Entrada' : 'Saída', x + 1, y + 4); x += colunas[1].width;
            doc.text((f.categoria || '-').substring(0, 20), x + 1, y + 4); x += colunas[2].width;
            doc.text(`R$ ${formatCurrency(f.valor || 0)}`, x + 1, y + 4); x += colunas[3].width;
            doc.text((f.formPagto || '-').substring(0, 15), x + 1, y + 4); x += colunas[4].width;
            doc.text(f.status || '-', x + 1, y + 4);
            y += 8; x = 14;
        }
        for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200);
        }
        doc.save(`financeiro_${currentEmpresa?.id || 'empresa'}_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');
    } catch (e) {
        showToast('Erro ao gerar PDF!', 'error');
    }
}

// ==================== AUTENTICAÇÃO E INICIALIZAÇÃO ====================
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
        } else {
            trialDiv.style.display = 'none';
        }

        await carregarDados();
        renderFinanceiro();
        updateStats();
        updateCharts();
        configurarMascaraValor('finValor');

        // Eventos
        document.getElementById('saveFinanceiroBtn').onclick = salvarFinanceiro;
        document.getElementById('cancelEditBtn').onclick = cancelEdit;
        document.getElementById('searchInput').addEventListener('input', aplicarFiltrosEAtualizar);
        document.getElementById('tipoFilter').addEventListener('change', aplicarFiltrosEAtualizar);
        document.getElementById('statusFilter').addEventListener('change', aplicarFiltrosEAtualizar);
        document.getElementById('aplicarFiltrosBtn').onclick = aplicarFiltrosEAtualizar;
        document.getElementById('periodoRapido').addEventListener('change', applyPeriodo);
        document.getElementById('clearFiltersBtn').onclick = clearFilters;
        document.getElementById('exportPdfBtn').onclick = exportarPDF;
        document.getElementById('logoutBtn').onclick = () => auth.signOut();
        document.getElementById('modalCloseBtn').onclick = fecharModal;
        window.onclick = (e) => { if (e.target === document.getElementById('viewModal')) fecharModal(); };
        window.solicitarLiberacao = () => {
            const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
            const corpo = encodeURIComponent(`Solicito liberação da empresa:\n\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}\nWhatsApp: ${currentEmpresa?.emp_whatsapp || '-'}\n\nAguardo retorno.`);
            window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
            showToast('Abrindo cliente de e-mail...', 'info');
        };
    } else {
        window.location.href = 'login.html';
    }
});