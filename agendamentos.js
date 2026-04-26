// agendamentos.js
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml, showToast, formatCurrency, parseCurrency, formatarDataHora,
    carregarEmpresaUsuario, verificarStatusEmpresa, configurarMascaraValor
} from './util.js';

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
const itemsPerPage = 10;

let clientesCache = [];
let petsCache = [];
let profissionaisCache = [];
let servicosCache = [];
let agendamentosCache = [];

let unsubscribeAgendamentos = null;

// ==================== FUNÇÕES AUXILIARES ====================
function getServicoDuracao(servicoId) {
    const servico = servicosCache.find(s => s.id === servicoId);
    return servico?.duracao || 60;
}

function getServicoNome(servicoId) {
    const servico = servicosCache.find(s => s.id === servicoId);
    return servico?.nome || '';
}

function getServicoPreco(servicoId) {
    const servico = servicosCache.find(s => s.id === servicoId);
    return servico?.preco || 0;
}

function horariosConflitam(inicio1, fim1, inicio2, fim2) {
    return inicio1 < fim2 && fim1 > inicio2;
}

async function verificarConflitoHorario(dataHoraInicio, profissionalId, servicoId, ignoreId = null) {
    if (!dataHoraInicio || !profissionalId || !servicoId) return [];
    const duracao = getServicoDuracao(servicoId);
    const inicio = new Date(dataHoraInicio);
    const fim = new Date(inicio.getTime() + duracao * 60000);
    const conflitos = [];
    for (const a of agendamentosCache) {
        if (a.profissionalId === profissionalId && a.id !== ignoreId && a.status !== 'cancelado') {
            const aInicio = new Date(a.data);
            const aDuracao = getServicoDuracao(a.servicoId);
            const aFim = new Date(aInicio.getTime() + aDuracao * 60000);
            if (horariosConflitam(inicio, fim, aInicio, aFim)) {
                conflitos.push(a);
            }
        }
    }
    return conflitos;
}

function exibirConflito(conflitos, servicoId) {
    const box = document.getElementById('conflitoHorarioBox');
    const msgSpan = document.getElementById('conflitoMensagem');
    if (conflitos.length > 0) {
        const nomes = conflitos.map(c => {
            const serv = servicosCache.find(s => s.id === c.servicoId);
            return serv?.nome || 'serviço';
        }).join(', ');
        msgSpan.innerHTML = `⚠️ CONFLITO! O profissional já possui agendamento neste horário (${nomes}). Duração do serviço: ${getServicoDuracao(servicoId)} min.`;
        box.style.display = 'flex';
        return true;
    } else {
        box.style.display = 'none';
        return false;
    }
}

// ==================== CARREGAR DADOS COM LISTENER ====================
async function carregarDadosApoio() {
    if (!currentEmpresa) return;
    const empresaId = currentEmpresa.id;

    const clientesSnap = await getDocs(query(collection(db, 'clientes'), where('empresaId', '==', empresaId)));
    clientesCache = clientesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const petsSnap = await getDocs(query(collection(db, 'pets'), where('empresaId', '==', empresaId)));
    petsCache = petsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const profissionaisSnap = await getDocs(query(collection(db, 'profissionais'), where('empresaId', '==', empresaId)));
    profissionaisCache = profissionaisSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const servicosSnap = await getDocs(query(collection(db, 'servicos'), where('empresaId', '==', empresaId)));
    servicosCache = servicosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (unsubscribeAgendamentos) unsubscribeAgendamentos();
    const qAgendamentos = query(collection(db, 'agendamentos'), where('empresaId', '==', empresaId));
    unsubscribeAgendamentos = onSnapshot(qAgendamentos, (snapshot) => {
        agendamentosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAgendamentos();
        updateStats();
    });
    atualizarSelects();
}

// ==================== CRUD ====================
async function addAgendamento(data) {
    const newAgendamento = {
        ...data,
        empresaId: currentEmpresa.id,
        criado_em: new Date().toISOString()
    };
    await addDoc(collection(db, 'agendamentos'), newAgendamento);
    showToast('Agendamento adicionado!', 'success');
}

async function updateAgendamento(id, updates) {
    await updateDoc(doc(db, 'agendamentos', id), { ...updates, updatedAt: new Date().toISOString() });
    showToast('Atualizado!', 'success');
}

async function deleteAgendamento(id) {
    if (!confirm('Excluir agendamento?')) return;
    await deleteDoc(doc(db, 'agendamentos', id));
    showToast('Excluído!', 'success');
}

// ==================== FORMULÁRIO ====================
function getFormData() {
    return {
        clienteId: document.getElementById('ageClienteId').value,
        petId: document.getElementById('agePetId').value,
        profissionalId: document.getElementById('ageProfissionalId').value,
        servicoId: document.getElementById('ageServicoId').value,
        servico: getServicoNome(document.getElementById('ageServicoId').value),
        data: document.getElementById('ageData').value,
        valor: parseCurrency(document.getElementById('ageValor').value),
        status: document.getElementById('ageStatus').value,
        obs: document.getElementById('ageObs').value
    };
}

async function validarFormulario() {
    let valido = true;
    const clienteId = document.getElementById('ageClienteId').value;
    const petId = document.getElementById('agePetId').value;
    const profissionalId = document.getElementById('ageProfissionalId').value;
    const servicoId = document.getElementById('ageServicoId').value;
    const data = document.getElementById('ageData').value;
    if (!clienteId) { showToast('Selecione um cliente!', 'error'); valido = false; }
    if (!petId) { showToast('Selecione um pet!', 'error'); valido = false; }
    if (!profissionalId) { showToast('Selecione um profissional!', 'error'); valido = false; }
    if (!servicoId) { showToast('Selecione um serviço!', 'error'); valido = false; }
    if (!data) { showToast('Selecione data e horário!', 'error'); valido = false; }
    if (valido && profissionalId && data && servicoId) {
        const conflitos = await verificarConflitoHorario(data, profissionalId, servicoId, editingId);
        if (conflitos.length > 0) {
            exibirConflito(conflitos, servicoId);
            showToast('Conflito de horário!', 'error');
            valido = false;
        }
    }
    return valido;
}

function resetForm() {
    document.getElementById('ageClienteId').value = '';
    document.getElementById('agePetId').innerHTML = '<option value="">Selecione</option>';
    document.getElementById('ageProfissionalId').value = '';
    document.getElementById('ageServicoId').value = '';
    document.getElementById('ageData').value = '';
    document.getElementById('ageValor').value = '';
    document.getElementById('ageStatus').value = 'agendado';
    document.getElementById('ageObs').value = '';
    document.getElementById('conflitoHorarioBox').style.display = 'none';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const btn = document.getElementById('saveAgendamentoBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}

function fillForm(a) {
    document.getElementById('ageClienteId').value = a.clienteId || '';
    atualizarPetsPorCliente(a.clienteId);
    setTimeout(() => { document.getElementById('agePetId').value = a.petId || ''; }, 100);
    document.getElementById('ageProfissionalId').value = a.profissionalId || '';
    document.getElementById('ageServicoId').value = a.servicoId || '';
    document.getElementById('ageData').value = a.data || '';
    document.getElementById('ageValor').value = formatCurrency(a.valor || 0);
    document.getElementById('ageStatus').value = a.status || 'agendado';
    document.getElementById('ageObs').value = a.obs || '';
}

async function salvarAgendamento() {
    if (!await validarFormulario()) return;
    const formData = getFormData();
    if (editingId) {
        await updateAgendamento(editingId, formData);
    } else {
        await addAgendamento(formData);
    }
    resetForm();
}

function cancelEdit() {
    resetForm();
}

async function verificarConflitoListener() {
    const profissionalId = document.getElementById('ageProfissionalId').value;
    const servicoId = document.getElementById('ageServicoId').value;
    const data = document.getElementById('ageData').value;
    if (profissionalId && data && servicoId) {
        const conflitos = await verificarConflitoHorario(data, profissionalId, servicoId, editingId);
        exibirConflito(conflitos, servicoId);
    } else {
        document.getElementById('conflitoHorarioBox').style.display = 'none';
    }
}

// ==================== PETS POR CLIENTE ====================
function atualizarPetsPorCliente(clienteId) {
    const petSelect = document.getElementById('agePetId');
    const petsFiltrados = petsCache.filter(p => p.clienteId === clienteId);
    petSelect.innerHTML = '<option value="">Selecione</option>' +
        petsFiltrados.map(p => `<option value="${p.id}">${escapeHtml(p.nome || p.pet_nome)}</option>`).join('');
}

// ==================== RENDERIZAÇÃO ====================
function renderAgendamentos() {
    let ags = [...agendamentosCache];
    const search = document.getElementById('searchInput').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    if (search) {
        ags = ags.filter(a => {
            const cli = clientesCache.find(c => c.id === a.clienteId);
            const pet = petsCache.find(p => p.id === a.petId);
            return (cli?.cli_nome || '').toLowerCase().includes(search) || (pet?.nome || '').toLowerCase().includes(search);
        });
    }
    if (statusVal) ags = ags.filter(a => a.status === statusVal);
    ags.sort((a, b) => new Date(a.data) - new Date(b.data));

    const totalPages = Math.ceil(ags.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    const paginated = ags.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const tbody = document.getElementById('agendamentosTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhum agendamento</td><tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(a => {
        const cliente = clientesCache.find(c => c.id === a.clienteId);
        const pet = petsCache.find(p => p.id === a.petId);
        const prof = profissionaisCache.find(p => p.id === a.profissionalId);
        const serv = servicosCache.find(s => s.id === a.servicoId);
        const servicoNome = serv?.nome || a.servico || '-';
        const statusClass = a.status === 'agendado' ? 'status-agendado' : (a.status === 'confirmado' ? 'status-confirmado' : (a.status === 'realizado' ? 'status-realizado' : 'status-cancelado'));
        return `<tr>
            <td>${escapeHtml(cliente?.cli_nome || cliente?.nome || '-')}</td>
            <td>${escapeHtml(pet?.nome || pet?.pet_nome || '-')}</td>
            <td>${escapeHtml(servicoNome)}</span></td>
            <td>${escapeHtml(prof?.prf_nome || prof?.nome || '-')}</span></td>
            <td>${a.data ? new Date(a.data).toLocaleString() : '-'}</span></td>
            <td>R$ ${formatCurrency(a.valor || 0)}</span></td>
            <td><span class="status-badge ${statusClass}">${a.status}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" data-id="${a.id}"><i class="fas fa-eye"></i></button>
                <button class="action-btn edit" data-id="${a.id}"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" data-id="${a.id}"><i class="fas fa-trash-alt"></i></button>
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
        btn.addEventListener('click', () => viewAgendamento(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => editAgendamento(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteAgendamento(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => goToPage(parseInt(btn.getAttribute('data-page'))));
    });
}

function goToPage(page) {
    currentPage = page;
    renderAgendamentos();
}

function updateStats() {
    const total = document.getElementById('totalAgendamentos');
    const hojeSpan = document.getElementById('totalHoje');
    const pendentesSpan = document.getElementById('totalPendentes');
    const realizadosSpan = document.getElementById('totalRealizados');
    total.innerText = agendamentosCache.length;
    const hoje = new Date().toDateString();
    const hojeCount = agendamentosCache.filter(a => a.data && new Date(a.data).toDateString() === hoje).length;
    hojeSpan.innerText = hojeCount;
    const pendentes = agendamentosCache.filter(a => a.status === 'agendado' || a.status === 'confirmado').length;
    pendentesSpan.innerText = pendentes;
    const realizados = agendamentosCache.filter(a => a.status === 'realizado').length;
    realizadosSpan.innerText = realizados;
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    currentPage = 1;
    renderAgendamentos();
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    const ags = agendamentosCache;
    if (ags.length === 0) { showToast('Não há agendamentos para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44, 125, 160); doc.text('Relatório de Agendamentos', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Total: ${ags.length} agendamentos`, 14, 46);
        const colunas = [{ label: 'Cliente', width: 40 }, { label: 'Pet', width: 35 }, { label: 'Serviço', width: 40 }, { label: 'Data', width: 40 }, { label: 'Status', width: 25 }];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44, 125, 160); doc.setTextColor(255, 255, 255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; });
        doc.setTextColor(0, 0, 0);
        y += 12;
        for (const a of ags) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0, 0, 0); }
            const cliente = clientesCache.find(c => c.id === a.clienteId);
            const pet = petsCache.find(p => p.id === a.petId);
            doc.text((cliente?.cli_nome || cliente?.nome || '-').substring(0, 25), x + 2, y + 4); x += 40;
            doc.text((pet?.nome || pet?.pet_nome || '-').substring(0, 20), x + 2, y + 4); x += 35;
            doc.text((a.servico || '-').substring(0, 25), x + 2, y + 4); x += 40;
            doc.text(a.data ? new Date(a.data).toLocaleString() : '-', x + 2, y + 4); x += 40;
            doc.text(a.status || '-', x + 2, y + 4);
            y += 7; x = 14;
        }
        for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200);
        }
        doc.save(`agendamentos_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado!', 'success');
    } catch (e) {
        showToast('Erro ao gerar PDF!', 'error');
    }
}

// ==================== VIEW / EDIT ====================
function viewAgendamento(id) {
    const a = agendamentosCache.find(a => a.id === id);
    if (!a) return;
    const cliente = clientesCache.find(c => c.id === a.clienteId);
    const pet = petsCache.find(p => p.id === a.petId);
    const prof = profissionaisCache.find(p => p.id === a.profissionalId);
    const serv = servicosCache.find(s => s.id === a.servicoId);
    const servicoNome = serv?.nome || a.servico || '-';
    const statusClass = a.status === 'agendado' ? 'status-agendado' : (a.status === 'confirmado' ? 'status-confirmado' : (a.status === 'realizado' ? 'status-realizado' : 'status-cancelado'));
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="info-row"><span class="info-label">Cliente:</span><span class="info-value">${escapeHtml(cliente?.cli_nome || cliente?.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Pet:</span><span class="info-value">${escapeHtml(pet?.nome || pet?.pet_nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Profissional:</span><span class="info-value">${escapeHtml(prof?.prf_nome || prof?.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Serviço:</span><span class="info-value">${escapeHtml(servicoNome)}</span></div>
        <div class="info-row"><span class="info-label">Data/Hora:</span><span class="info-value">${formatarDataHora(a.data)}</span></div>
        <div class="info-row"><span class="info-label">Valor:</span><span class="info-value">R$ ${formatCurrency(a.valor || 0)}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="status-badge ${statusClass}">${a.status}</span></span></div>
        ${a.obs ? `<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(a.obs)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
}

function editAgendamento(id) {
    const a = agendamentosCache.find(a => a.id === id);
    if (a) {
        fillForm(a);
        editingId = id;
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        const btn = document.getElementById('saveAgendamentoBtn');
        btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        window.scrollTo({ top: 0 });
        setTimeout(async () => {
            const profissionalId = document.getElementById('ageProfissionalId').value;
            const servicoId = document.getElementById('ageServicoId').value;
            const data = document.getElementById('ageData').value;
            if (profissionalId && data && servicoId) {
                const conflitos = await verificarConflitoHorario(data, profissionalId, servicoId, id);
                exibirConflito(conflitos, servicoId);
            } else {
                document.getElementById('conflitoHorarioBox').style.display = 'none';
            }
        }, 200);
    }
}

function fecharModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// ==================== SELECTS ====================
function atualizarSelects() {
    const clienteSelect = document.getElementById('ageClienteId');
    clienteSelect.innerHTML = '<option value="">Selecione</option>' + clientesCache.map(c => `<option value="${c.id}">${escapeHtml(c.cli_nome || c.nome)}</option>`).join('');
    clienteSelect.onchange = () => atualizarPetsPorCliente(clienteSelect.value);

    const profSelect = document.getElementById('ageProfissionalId');
    profSelect.innerHTML = '<option value="">Selecione</option>' + profissionaisCache.map(p => `<option value="${p.id}">${escapeHtml(p.prf_nome || p.nome)}</option>`).join('');

    const servicoSelect = document.getElementById('ageServicoId');
    servicoSelect.innerHTML = '<option value="">Selecione</option>' + servicosCache.filter(s => s.ativo !== false).map(s => `<option value="${s.id}" data-preco="${s.preco || 0}" data-duracao="${s.duracao || 60}">${escapeHtml(s.nome)} - ${formatCurrency(s.preco || 0)} (${s.duracao || 60} min)</option>`).join('');
    servicoSelect.onchange = () => {
        const preco = getServicoPreco(servicoSelect.value);
        document.getElementById('ageValor').value = formatCurrency(preco);
        verificarConflitoListener();
    };
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

        await carregarDadosApoio();
        configurarMascaraValor('ageValor');

        // Eventos
        document.getElementById('saveAgendamentoBtn').onclick = salvarAgendamento;
        document.getElementById('cancelEditBtn').onclick = cancelEdit;
        document.getElementById('clearFiltersBtn').onclick = clearFilters;
        document.getElementById('exportPdfBtn').onclick = exportarPDF;
        document.getElementById('logoutBtn').onclick = () => auth.signOut();
        document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderAgendamentos(); });
        document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; renderAgendamentos(); });
        document.getElementById('ageProfissionalId').addEventListener('change', verificarConflitoListener);
        document.getElementById('ageData').addEventListener('change', verificarConflitoListener);
        document.getElementById('ageServicoId').addEventListener('change', verificarConflitoListener);
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