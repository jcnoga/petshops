// servicos.js
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml, showToast, formatCurrency, parseCurrency,
    carregarEmpresaUsuario, verificarStatusEmpresa
} from './util.js';

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
const itemsPerPage = 10;

let servicosCache = [];
let agendamentosCache = [];
let unsubscribeServicos = null;
let categoriaChart = null;
let precoChart = null;

// ==================== CARREGAR DADOS COM LISTENER ====================
async function carregarDadosEmpresa() {
    if (!currentEmpresa) return;
    const empresaId = currentEmpresa.id;

    const agendamentosSnap = await getDocs(query(collection(db, 'agendamentos'), where('empresaId', '==', empresaId)));
    agendamentosCache = agendamentosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (unsubscribeServicos) unsubscribeServicos();
    const qServicos = query(collection(db, 'servicos'), where('empresaId', '==', empresaId));
    unsubscribeServicos = onSnapshot(qServicos, (snapshot) => {
        servicosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderServicos();
        updateStats();
        updateCharts();
    }, (error) => console.error('Erro no snapshot serviços:', error));
}

// ==================== CRUD ====================
async function addServico(data) {
    if (servicosCache.some(s => s.nome.toLowerCase() === data.nome.toLowerCase())) {
        showToast('Já existe um serviço com este nome!', 'error');
        return false;
    }
    const newDoc = {
        ...data,
        empresaId: currentEmpresa.id,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        criado_por: currentUser.uid
    };
    await addDoc(collection(db, 'servicos'), newDoc);
    showToast('Serviço cadastrado com sucesso!', 'success');
    return true;
}
async function updateServico(id, updates) {
    const oldServico = servicosCache.find(s => s.id === id);
    if (updates.nome && updates.nome.toLowerCase() !== oldServico?.nome.toLowerCase() && servicosCache.some(s => s.nome.toLowerCase() === updates.nome.toLowerCase() && s.id !== id)) {
        showToast('Já existe um serviço com este nome!', 'error');
        return false;
    }
    await updateDoc(doc(db, 'servicos', id), { ...updates, atualizado_em: new Date().toISOString() });
    showToast('Serviço atualizado!', 'success');
    return true;
}
async function deleteServico(id) {
    const servico = servicosCache.find(s => s.id === id);
    if (!servico) { showToast('Serviço não encontrado!', 'error'); return; }
    const agendamentosVinculados = agendamentosCache.filter(a => a.servicoId === id || a.servico === servico.nome);
    let msg = `⚠️ Excluir "${servico.nome}"?`;
    if (agendamentosVinculados.length > 0) msg += `\n\n📌 Este serviço possui ${agendamentosVinculados.length} agendamento(s) vinculado(s).`;
    if (confirm(msg)) {
        await deleteDoc(doc(db, 'servicos', id));
        showToast('Serviço excluído!', 'success');
    }
}

// ==================== FORMULÁRIO ====================
function getFormData() {
    return {
        nome: document.getElementById('serNome').value,
        preco: parseCurrency(document.getElementById('serPreco').value),
        duracao: parseInt(document.getElementById('serDuracao').value) || 0,
        categoria: document.getElementById('serCategoria').value,
        ativo: document.getElementById('serAtivo').value === 'true',
        comissao: parseFloat(document.getElementById('serComissao').value) || 0,
        tags: document.getElementById('serTags').value,
        descricao: document.getElementById('serDescricao').value
    };
}
function validarFormulario() {
    const nome = document.getElementById('serNome').value.trim();
    if (!nome) { showToast('Nome do serviço é obrigatório!', 'error'); return false; }
    const preco = parseCurrency(document.getElementById('serPreco').value);
    if (preco <= 0) { showToast('Preço deve ser maior que zero!', 'error'); return false; }
    const categoria = document.getElementById('serCategoria').value;
    if (!categoria) { showToast('Selecione uma categoria!', 'error'); return false; }
    const comissao = parseFloat(document.getElementById('serComissao').value) || 0;
    if (comissao < 0 || comissao > 100) { showToast('Comissão deve estar entre 0% e 100%!', 'error'); return false; }
    return true;
}
function resetForm() {
    document.getElementById('serNome').value = '';
    document.getElementById('serPreco').value = '';
    document.getElementById('serDuracao').value = '';
    document.getElementById('serCategoria').value = '';
    document.getElementById('serAtivo').value = 'true';
    document.getElementById('serComissao').value = '0';
    document.getElementById('serTags').value = '';
    document.getElementById('serDescricao').value = '';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const btn = document.getElementById('saveServicoBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}
function fillForm(s) {
    document.getElementById('serNome').value = s.nome || '';
    document.getElementById('serPreco').value = formatCurrency(s.preco || 0);
    document.getElementById('serDuracao').value = s.duracao || 0;
    document.getElementById('serCategoria').value = s.categoria || '';
    document.getElementById('serAtivo').value = s.ativo ? 'true' : 'false';
    document.getElementById('serComissao').value = s.comissao || 0;
    document.getElementById('serTags').value = s.tags || '';
    document.getElementById('serDescricao').value = s.descricao || '';
}
async function salvarServico() {
    if (!validarFormulario()) return;
    const data = getFormData();
    if (editingId) await updateServico(editingId, data);
    else await addServico(data);
    resetForm();
}
function cancelEdit() { resetForm(); }

// ==================== RENDERIZAÇÃO ====================
function renderServicos() {
    let filtered = servicosCache.filter(s => {
        const searchTerm = document.getElementById('tableSearch')?.value.toLowerCase() || '';
        const searchFilter = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const term = (searchTerm || searchFilter).toLowerCase();
        const statusFilter = document.getElementById('statusFilter')?.value || '';
        const categoriaFilter = document.getElementById('categoriaFilter')?.value || '';
        return (!term || s.nome.toLowerCase().includes(term) || (s.tags || '').toLowerCase().includes(term)) &&
               (!statusFilter || (s.ativo ? 'true' : 'false') === statusFilter) &&
               (!categoriaFilter || s.categoria === categoriaFilter);
    });
    filtered.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const tbody = document.getElementById('servicosTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<td><td colspan="7" style="text-align:center; padding:40px;">Nenhum serviço encontrado<\/td><\/tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(s => {
        const statusClass = s.ativo ? 'status-ativo' : 'status-inativo';
        const categoriaIcon = s.categoria === 'banho' ? '🛁' : (s.categoria === 'tosa' ? '✂️' : (s.categoria === 'veterinario' ? '🩺' : (s.categoria === 'estetica' ? '💅' : (s.categoria === 'hospedagem' ? '🏠' : '📌'))));
        const categoriaDisplay = s.categoria === 'banho' ? 'Banho' : (s.categoria === 'tosa' ? 'Tosa' : (s.categoria === 'veterinario' ? 'Veterinário' : (s.categoria === 'estetica' ? 'Estética' : (s.categoria === 'hospedagem' ? 'Hospedagem' : s.categoria))));
        return `<tr>
            <td><strong>${escapeHtml(s.nome)}</strong><br><span style="font-size:0.65rem; color:#7a9eb0;">${escapeHtml(s.tags || '')}</span></td>
            <td><strong style="color:#2a9d8f;">R$ ${formatCurrency(s.preco || 0)}</strong></td>
            <td>⏱️ ${s.duracao || 0} min</span></td>
            <td>${categoriaIcon} ${categoriaDisplay}</span></td>
            <td>${s.comissao || 0}%</span></td>
            <td><span class="status-badge ${statusClass}">${s.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" data-id="${s.id}"><i class="fas fa-eye"></i></button>
                <button class="action-btn edit" data-id="${s.id}"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" data-id="${s.id}"><i class="fas fa-trash-alt"></i></button>
            </div>
        <tr>`;
    }).join('');
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pagHtml;

    document.querySelectorAll('.action-btn.view').forEach(btn => {
        btn.addEventListener('click', () => viewServico(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => editServico(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteServico(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => goToPage(parseInt(btn.getAttribute('data-page'))));
    });
}
function goToPage(page) {
    currentPage = page;
    renderServicos();
}

function updateStats() {
    const total = document.getElementById('totalServicos');
    const ativos = document.getElementById('totalAtivos');
    const precoMedioSpan = document.getElementById('precoMedio');
    const duracaoMediaSpan = document.getElementById('duracaoMedia');
    total.innerText = servicosCache.length;
    const ativosCount = servicosCache.filter(s => s.ativo).length;
    ativos.innerText = ativosCount;
    const ativosList = servicosCache.filter(s => s.ativo);
    const precoMedio = ativosList.length ? ativosList.reduce((s, p) => s + (p.preco || 0), 0) / ativosList.length : 0;
    precoMedioSpan.innerHTML = `R$ ${formatCurrency(precoMedio)}`;
    const duracaoMedia = ativosList.length ? Math.round(ativosList.reduce((s, p) => s + (p.duracao || 0), 0) / ativosList.length) : 0;
    duracaoMediaSpan.innerHTML = `${duracaoMedia} min`;
}

// ==================== GRÁFICOS ====================
function updateCharts() {
    const ativos = servicosCache.filter(s => s.ativo);
    const categorias = {};
    ativos.forEach(s => { if (s.categoria) categorias[s.categoria] = (categorias[s.categoria] || 0) + 1; });
    const categoriaLabels = Object.keys(categorias).map(c => {
        const nomes = { banho: 'Banho', tosa: 'Tosa', veterinario: 'Veterinário', estetica: 'Estética', hospedagem: 'Hospedagem', outro: 'Outro' };
        return nomes[c] || c;
    });
    if (categoriaChart) categoriaChart.destroy();
    const ctx1 = document.getElementById('categoriaChart').getContext('2d');
    categoriaChart = new Chart(ctx1, {
        type: 'bar',
        data: { labels: categoriaLabels, datasets: [{ label: 'Quantidade de Serviços', data: Object.values(categorias), backgroundColor: '#2c7da0', borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
    });
    const totalPrecoPorCategoria = {};
    const countPorCategoria = {};
    ativos.forEach(s => {
        if (s.categoria && s.preco) {
            totalPrecoPorCategoria[s.categoria] = (totalPrecoPorCategoria[s.categoria] || 0) + s.preco;
            countPorCategoria[s.categoria] = (countPorCategoria[s.categoria] || 0) + 1;
        }
    });
    const precosMedios = {};
    Object.keys(totalPrecoPorCategoria).forEach(c => precosMedios[c] = totalPrecoPorCategoria[c] / countPorCategoria[c]);
    if (precoChart) precoChart.destroy();
    const ctx2 = document.getElementById('precoChart').getContext('2d');
    precoChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: Object.keys(precosMedios).map(c => ({ banho: 'Banho', tosa: 'Tosa', veterinario: 'Veterinário', estetica: 'Estética', hospedagem: 'Hospedagem', outro: 'Outro' }[c] || c)),
            datasets: [{ label: 'Preço Médio (R$)', data: Object.values(precosMedios), borderColor: '#2a9d8f', backgroundColor: 'rgba(42,157,143,0.1)', fill: true, tension: 0.4 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { tooltip: { callbacks: { label: (ctx) => `R$ ${formatCurrency(ctx.raw)}` } } }
        }
    });
}

// ==================== VIEW / EDIT ====================
function viewServico(id) {
    const s = servicosCache.find(s => s.id === id);
    if (!s) return;
    const statusClass = s.ativo ? 'status-ativo' : 'status-inativo';
    const categoriaIcon = s.categoria === 'banho' ? '🛁' : (s.categoria === 'tosa' ? '✂️' : (s.categoria === 'veterinario' ? '🩺' : (s.categoria === 'estetica' ? '💅' : (s.categoria === 'hospedagem' ? '🏠' : '📌'))));
    const tags = s.tags ? s.tags.split(',').map(t => `<span class="badge" style="background:#2c7da020; margin:2px;">${escapeHtml(t.trim())}</span>`).join('') : '-';
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="info-row"><span class="info-label">Nome:</span><span class="info-value">${escapeHtml(s.nome)}</span></div>
        <div class="info-row"><span class="info-label">Preço:</span><span class="info-value">R$ ${formatCurrency(s.preco || 0)}</span></div>
        <div class="info-row"><span class="info-label">Duração:</span><span class="info-value">${s.duracao || 0} min</span></div>
        <div class="info-row"><span class="info-label">Categoria:</span><span class="info-value">${categoriaIcon} ${escapeHtml(s.categoria || '-')}</span></div>
        <div class="info-row"><span class="info-label">Comissão:</span><span class="info-value">${s.comissao || 0}%</span></div>
        <div class="info-row"><span class="info-label">Tags:</span><span class="info-value">${tags}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="status-badge ${statusClass}">${s.ativo ? 'Ativo' : 'Inativo'}</span></span></div>
        <div class="info-row"><span class="info-label">Cadastrado em:</span><span class="info-value">${new Date(s.criado_em).toLocaleDateString('pt-BR')}</span></div>
        ${s.descricao ? `<div class="info-row"><span class="info-label">Descrição:</span><span class="info-value">${escapeHtml(s.descricao)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
}
function editServico(id) {
    const s = servicosCache.find(s => s.id === id);
    if (s) {
        fillForm(s);
        editingId = id;
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        const btn = document.getElementById('saveServicoBtn');
        btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        window.scrollTo({ top: 0 });
    }
}
function fecharModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// ==================== FILTROS ====================
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('tableSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('categoriaFilter').value = '';
    currentPage = 1;
    renderServicos();
    updateCharts();
    showToast('Filtros limpos!', 'success');
}
function clearTableFilters() {
    document.getElementById('tableSearch').value = '';
    renderServicos();
    showToast('Filtros limpos!', 'success');
}
function aplicarFiltroStatus(status) {
    document.getElementById('statusFilter').value = status;
    currentPage = 1;
    renderServicos();
    updateCharts();
}
function aplicarFiltroCategoria(categoria) {
    document.getElementById('categoriaFilter').value = categoria;
    currentPage = 1;
    renderServicos();
    updateCharts();
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    let servicos = servicosCache.filter(s => {
        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('statusFilter')?.value || '';
        const categoriaFilter = document.getElementById('categoriaFilter')?.value || '';
        return (!searchTerm || s.nome.toLowerCase().includes(searchTerm) || (s.tags || '').toLowerCase().includes(searchTerm)) &&
               (!statusFilter || (s.ativo ? 'true' : 'false') === statusFilter) &&
               (!categoriaFilter || s.categoria === categoriaFilter);
    });
    if (servicos.length === 0) { showToast('Não há serviços para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44, 125, 160); doc.text('Relatório de Serviços', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 38);
        doc.text(`Total: ${servicos.length} serviços`, 14, 46);
        const ativos = servicos.filter(s => s.ativo).length;
        const precoMedioTotal = servicos.reduce((s, p) => s + (p.preco || 0), 0) / servicos.length;
        doc.setFontSize(9); doc.text(`Serviços Ativos: ${ativos}`, 14, 54);
        doc.text(`Preço Médio: R$ ${formatCurrency(precoMedioTotal)}`, 14, 62);
        const colunas = [{ label: 'Serviço', width: 50 }, { label: 'Preço', width: 30 }, { label: 'Duração', width: 30 }, { label: 'Categoria', width: 35 }, { label: 'Comissão', width: 25 }, { label: 'Status', width: 25 }];
        let y = 72;
        doc.setFontSize(9); doc.setFillColor(44, 125, 160); doc.setTextColor(255, 255, 255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; });
        doc.setTextColor(0, 0, 0);
        y += 12;
        for (const s of servicos) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0, 0, 0); }
            const categoriaDisplay = s.categoria === 'banho' ? 'Banho' : (s.categoria === 'tosa' ? 'Tosa' : (s.categoria === 'veterinario' ? 'Veterinário' : (s.categoria === 'estetica' ? 'Estética' : (s.categoria === 'hospedagem' ? 'Hospedagem' : s.categoria))));
            doc.text((s.nome || '-').substring(0, 30), x + 2, y + 4); x += 50;
            doc.text(`R$ ${formatCurrency(s.preco || 0)}`, x + 2, y + 4); x += 30;
            doc.text(`${s.duracao || 0} min`, x + 2, y + 4); x += 30;
            doc.text(categoriaDisplay, x + 2, y + 4); x += 35;
            doc.text(`${s.comissao || 0}%`, x + 2, y + 4); x += 25;
            doc.text(s.ativo ? 'Ativo' : 'Inativo', x + 2, y + 4);
            y += 8; x = 14;
        }
        for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200);
        }
        doc.save(`servicos_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');
    } catch (e) {
        showToast('Erro ao gerar PDF!', 'error');
    }
}

// ==================== MÁSCARAS ====================
function applyMasks() {
    const precoInput = document.getElementById('serPreco');
    if (precoInput) {
        precoInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v === '') { e.target.value = ''; return; }
            e.target.value = formatCurrency(parseInt(v) / 100);
        });
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

        await carregarDadosEmpresa();
        renderServicos();
        updateStats();
        updateCharts();
        applyMasks();

        // Eventos
        document.getElementById('saveServicoBtn').onclick = salvarServico;
        document.getElementById('cancelEditBtn').onclick = cancelEdit;
        document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderServicos(); updateCharts(); });
        document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; renderServicos(); updateCharts(); });
        document.getElementById('categoriaFilter').addEventListener('change', () => { currentPage = 1; renderServicos(); updateCharts(); });
        document.getElementById('tableSearch').addEventListener('input', () => { currentPage = 1; renderServicos(); });
        document.getElementById('clearFiltersBtn').onclick = clearFilters;
        document.getElementById('clearTableFilters').onclick = clearTableFilters;
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
        document.querySelectorAll('.stat-card[data-filter-status]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.getAttribute('data-filter-status');
                aplicarFiltroStatus(status);
            });
        });
    } else {
        window.location.href = 'login.html';
    }
});