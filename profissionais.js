// profissionais.js
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml, showToast, formatarData, validarEmail, validarTelefone,
    aplicarMascaraTelefone, carregarEmpresaUsuario, verificarStatusEmpresa
} from './util.js';

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
const itemsPerPage = 10;

let profissionaisCache = [];
let agendamentosCache = [];
let unsubscribeProfissionais = null;

// ==================== FUNÇÕES AUXILIARES ====================
function calcularIdade(dataNasc) {
    if (!dataNasc) return null;
    const hoje = new Date();
    const nasc = new Date(dataNasc);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const mes = hoje.getMonth() - nasc.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
}

// ==================== CARREGAR DADOS COM LISTENER ====================
async function carregarDadosEmpresa() {
    if (!currentEmpresa) return;
    const empresaId = currentEmpresa.id;

    const agendamentosSnap = await getDocs(query(collection(db, 'agendamentos'), where('empresaId', '==', empresaId)));
    agendamentosCache = agendamentosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (unsubscribeProfissionais) unsubscribeProfissionais();
    const qProfissionais = query(collection(db, 'profissionais'), where('empresaId', '==', empresaId));
    unsubscribeProfissionais = onSnapshot(qProfissionais, (snapshot) => {
        profissionaisCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProfissionais();
        updateStats();
    }, (error) => console.error('Erro no snapshot profissionais:', error));
}

// ==================== CRUD ====================
async function addProfissional(data) {
    if (data.documento && profissionaisCache.some(p => p.documento === data.documento)) {
        showToast('CPF/Registro já cadastrado!', 'error');
        return false;
    }
    if (data.email && profissionaisCache.some(p => p.email === data.email)) {
        showToast('E-mail já cadastrado!', 'error');
        return false;
    }
    const newDoc = {
        ...data,
        empresaId: currentEmpresa.id,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        criado_por: currentUser.uid
    };
    await addDoc(collection(db, 'profissionais'), newDoc);
    showToast('Profissional cadastrado com sucesso!', 'success');
    return true;
}
async function updateProfissional(id, updates) {
    const oldProf = profissionaisCache.find(p => p.id === id);
    if (updates.documento && updates.documento !== oldProf?.documento && profissionaisCache.some(p => p.documento === updates.documento && p.id !== id)) {
        showToast('CPF/Registro já cadastrado para outro profissional!', 'error');
        return false;
    }
    if (updates.email && updates.email !== oldProf?.email && profissionaisCache.some(p => p.email === updates.email && p.id !== id)) {
        showToast('E-mail já cadastrado para outro profissional!', 'error');
        return false;
    }
    await updateDoc(doc(db, 'profissionais', id), { ...updates, atualizado_em: new Date().toISOString() });
    showToast('Profissional atualizado!', 'success');
    return true;
}
async function deleteProfissional(id) {
    const profissional = profissionaisCache.find(p => p.id === id);
    if (!profissional) { showToast('Profissional não encontrado!', 'error'); return; }
    const agendamentosVinculados = agendamentosCache.filter(a => a.profissionalId === id);
    let msg = `⚠️ Excluir "${profissional.nome}"?`;
    if (agendamentosVinculados.length > 0) msg += `\n\n📌 Este profissional possui ${agendamentosVinculados.length} agendamento(s) vinculado(s).`;
    if (confirm(msg)) {
        await deleteDoc(doc(db, 'profissionais', id));
        showToast('Profissional excluído!', 'success');
    }
}

// ==================== FORMULÁRIO ====================
function getFormData() {
    return {
        nome: document.getElementById('prfNome').value,
        funcao: document.getElementById('prfFuncao').value,
        telefone: document.getElementById('prfTelefone').value,
        email: document.getElementById('prfEmail').value,
        documento: document.getElementById('prfDocumento').value,
        dataNasc: document.getElementById('prfDataNasc').value,
        comissao: parseFloat(document.getElementById('prfComissao').value) || 0,
        ativo: document.getElementById('prfAtivo').value === 'true',
        endereco: document.getElementById('prfEndereco').value,
        cidade: document.getElementById('prfCidade').value,
        obs: document.getElementById('prfObs').value
    };
}
function validarFormulario() {
    const nome = document.getElementById('prfNome').value.trim();
    if (!nome) { showToast('Nome é obrigatório!', 'error'); return false; }
    const funcao = document.getElementById('prfFuncao').value;
    if (!funcao) { showToast('Selecione a função!', 'error'); return false; }
    const telefone = document.getElementById('prfTelefone').value;
    if (telefone && !validarTelefone(telefone)) { showToast('Telefone inválido! Use (00) 00000-0000', 'error'); return false; }
    const email = document.getElementById('prfEmail').value;
    if (email && !validarEmail(email)) { showToast('E-mail inválido!', 'error'); return false; }
    const dataNasc = document.getElementById('prfDataNasc').value;
    if (dataNasc) {
        const hoje = new Date();
        const dataNascDate = new Date(dataNasc);
        if (dataNascDate > hoje) { showToast('Data de nascimento não pode ser futura!', 'error'); return false; }
        const idade = calcularIdade(dataNasc);
        if (idade > 100 && !confirm(`Idade calculada: ${idade} anos. Confirmar?`)) return false;
    }
    const comissao = parseFloat(document.getElementById('prfComissao').value) || 0;
    if (comissao < 0 || comissao > 100) { showToast('Comissão deve estar entre 0% e 100%!', 'error'); return false; }
    return true;
}
function resetForm() {
    document.getElementById('prfNome').value = '';
    document.getElementById('prfFuncao').value = '';
    document.getElementById('prfTelefone').value = '';
    document.getElementById('prfEmail').value = '';
    document.getElementById('prfDocumento').value = '';
    document.getElementById('prfDataNasc').value = '';
    document.getElementById('prfComissao').value = '0';
    document.getElementById('prfAtivo').value = 'true';
    document.getElementById('prfEndereco').value = '';
    document.getElementById('prfCidade').value = '';
    document.getElementById('prfObs').value = '';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const btn = document.getElementById('saveProfissionalBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}
function fillForm(p) {
    document.getElementById('prfNome').value = p.nome || '';
    document.getElementById('prfFuncao').value = p.funcao || '';
    document.getElementById('prfTelefone').value = p.telefone || '';
    document.getElementById('prfEmail').value = p.email || '';
    document.getElementById('prfDocumento').value = p.documento || '';
    document.getElementById('prfDataNasc').value = p.dataNasc || '';
    document.getElementById('prfComissao').value = p.comissao || 0;
    document.getElementById('prfAtivo').value = p.ativo ? 'true' : 'false';
    document.getElementById('prfEndereco').value = p.endereco || '';
    document.getElementById('prfCidade').value = p.cidade || '';
    document.getElementById('prfObs').value = p.obs || '';
}
async function salvarProfissional() {
    if (!validarFormulario()) return;
    const data = getFormData();
    if (editingId) await updateProfissional(editingId, data);
    else await addProfissional(data);
    resetForm();
}
function cancelEdit() { resetForm(); }

// ==================== VIEW / EDIT ====================
function viewProfissional(id) {
    const p = profissionaisCache.find(p => p.id === id);
    if (!p) return;
    const statusClass = p.ativo ? 'status-ativo' : 'status-inativo';
    const idade = calcularIdade(p.dataNasc);
    const idadeText = idade !== null ? `${idade} ${idade === 1 ? 'ano' : 'anos'}` : 'Não informada';
    const funcaoIcon = p.funcao === 'veterinario' ? '🩺' : (p.funcao === 'tosador' ? '✂️' : (p.funcao === 'recepcionista' ? '📞' : (p.funcao === 'banhista' ? '🛁' : '📌')));
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="info-row"><span class="info-label">Nome:</span><span class="info-value">${escapeHtml(p.nome)}</span></div>
        <div class="info-row"><span class="info-label">Função:</span><span class="info-value">${funcaoIcon} ${escapeHtml(p.funcao)}</span></div>
        <div class="info-row"><span class="info-label">Telefone:</span><span class="info-value">${escapeHtml(p.telefone || '-')}</span></div>
        <div class="info-row"><span class="info-label">E-mail:</span><span class="info-value">${escapeHtml(p.email || '-')}</span></div>
        <div class="info-row"><span class="info-label">CPF/Registro:</span><span class="info-value">${escapeHtml(p.documento || '-')}</span></div>
        <div class="info-row"><span class="info-label">Data Nasc.:</span><span class="info-value">${formatarData(p.dataNasc)} (${idadeText})</span></div>
        <div class="info-row"><span class="info-label">Comissão:</span><span class="info-value">${p.comissao || 0}%</span></div>
        <div class="info-row"><span class="info-label">Endereço:</span><span class="info-value">${escapeHtml(p.endereco || '-')}</span></div>
        <div class="info-row"><span class="info-label">Cidade:</span><span class="info-value">${escapeHtml(p.cidade || '-')}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="status-badge ${statusClass}">${p.ativo ? 'Ativo' : 'Inativo'}</span></span></div>
        <div class="info-row"><span class="info-label">Cadastrado em:</span><span class="info-value">${new Date(p.criado_em).toLocaleDateString('pt-BR')}</span></div>
        ${p.obs ? `<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(p.obs)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
}
function editProfissional(id) {
    const p = profissionaisCache.find(p => p.id === id);
    if (p) {
        fillForm(p);
        editingId = id;
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        const btn = document.getElementById('saveProfissionalBtn');
        btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        window.scrollTo({ top: 0 });
    } else {
        showToast('Profissional não encontrado!', 'error');
    }
}
function fecharModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// ==================== RENDERIZAÇÃO ====================
function renderProfissionais() {
    let filtered = profissionaisCache.filter(p => {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const funcaoFilter = document.getElementById('funcaoFilter')?.value || '';
        const statusFilter = document.getElementById('statusFilter')?.value || '';
        return (!search || p.nome.toLowerCase().includes(search) || (p.email || '').toLowerCase().includes(search)) &&
               (!funcaoFilter || p.funcao === funcaoFilter) &&
               (!statusFilter || (p.ativo ? 'true' : 'false') === statusFilter);
    });
    filtered.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const tbody = document.getElementById('profissionaisTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Nenhum profissional encontrado<\/td><\/tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(p => {
        const statusClass = p.ativo ? 'status-ativo' : 'status-inativo';
        const funcaoIcon = p.funcao === 'veterinario' ? '🩺' : (p.funcao === 'tosador' ? '✂️' : (p.funcao === 'recepcionista' ? '📞' : (p.funcao === 'banhista' ? '🛁' : '📌')));
        const funcaoDisplay = p.funcao === 'veterinario' ? 'Veterinário' : (p.funcao === 'tosador' ? 'Tosador' : (p.funcao === 'recepcionista' ? 'Recepcionista' : (p.funcao === 'banhista' ? 'Banhista' : p.funcao)));
        return `<tr>
            <td><strong>${escapeHtml(p.nome)}</strong><br><span style="font-size:0.65rem; color:#7a9eb0;">${escapeHtml(p.email || '')}</span></td>
            <td>${funcaoIcon} ${funcaoDisplay}</td>
            <td>${escapeHtml(p.telefone || '-')}</td>
            <td>${escapeHtml(p.email || '-')}</td>
            <td>${p.comissao || 0}%</span></td>
            <td><span class="status-badge ${statusClass}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" data-id="${p.id}"><i class="fas fa-eye"></i></button>
                <button class="action-btn edit" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>
            </div>
        </tr>`;
    }).join('');
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pagHtml;

    document.querySelectorAll('.action-btn.view').forEach(btn => {
        btn.addEventListener('click', () => viewProfissional(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => editProfissional(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteProfissional(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => goToPage(parseInt(btn.getAttribute('data-page'))));
    });
}
function goToPage(page) {
    currentPage = page;
    renderProfissionais();
}

function updateStats() {
    document.getElementById('totalProfissionais').innerText = profissionaisCache.length;
    document.getElementById('totalVeterinarios').innerText = profissionaisCache.filter(p => p.funcao === 'veterinario').length;
    document.getElementById('totalTosadores').innerText = profissionaisCache.filter(p => p.funcao === 'tosador').length;
    document.getElementById('totalAtivos').innerText = profissionaisCache.filter(p => p.ativo).length;
}
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('funcaoFilter').value = '';
    document.getElementById('statusFilter').value = '';
    currentPage = 1;
    renderProfissionais();
    showToast('Filtros limpos!', 'success');
}
function aplicarFiltroFuncao(funcao) {
    document.getElementById('funcaoFilter').value = funcao;
    currentPage = 1;
    renderProfissionais();
}
function aplicarFiltroStatus(status) {
    document.getElementById('statusFilter').value = status;
    currentPage = 1;
    renderProfissionais();
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    if (profissionaisCache.length === 0) { showToast('Não há profissionais para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44, 125, 160); doc.text('Relatório de Profissionais', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 38);
        doc.text(`Total: ${profissionaisCache.length} profissionais`, 14, 46);
        const colunas = [{ label: 'Nome', width: 50 }, { label: 'Função', width: 35 }, { label: 'Telefone', width: 35 }, { label: 'Email', width: 45 }, { label: 'Comissão', width: 25 }, { label: 'Status', width: 25 }];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44, 125, 160); doc.setTextColor(255, 255, 255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; });
        doc.setTextColor(0, 0, 0);
        y += 12;
        for (const p of profissionaisCache) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0, 0, 0); }
            const funcaoDisplay = p.funcao === 'veterinario' ? 'Veterinário' : (p.funcao === 'tosador' ? 'Tosador' : (p.funcao === 'recepcionista' ? 'Recepcionista' : (p.funcao === 'banhista' ? 'Banhista' : p.funcao)));
            doc.text((p.nome || '-').substring(0, 30), x + 2, y + 4); x += 50;
            doc.text(funcaoDisplay, x + 2, y + 4); x += 35;
            doc.text((p.telefone || '-'), x + 2, y + 4); x += 35;
            doc.text((p.email || '-').substring(0, 25), x + 2, y + 4); x += 45;
            doc.text(`${p.comissao || 0}%`, x + 2, y + 4); x += 25;
            doc.text(p.ativo ? 'Ativo' : 'Inativo', x + 2, y + 4);
            y += 8; x = 14;
        }
        for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200);
        }
        doc.save(`profissionais_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');
    } catch (e) {
        showToast('Erro ao gerar PDF!', 'error');
    }
}

// ==================== MÁSCARAS ====================
function configurarMascaraTelefoneLocal() {
    const telInput = document.getElementById('prfTelefone');
    if (telInput) {
        telInput.addEventListener('input', (e) => {
            e.target.value = aplicarMascaraTelefone(e.target.value);
            if (e.target.value && !validarTelefone(e.target.value)) {
                e.target.style.borderColor = '#e76f51';
            } else {
                e.target.style.borderColor = '#e2edf2';
            }
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
        renderProfissionais();
        updateStats();
        configurarMascaraTelefoneLocal();

        // Eventos
        document.getElementById('saveProfissionalBtn').onclick = salvarProfissional;
        document.getElementById('cancelEditBtn').onclick = cancelEdit;
        document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderProfissionais(); });
        document.getElementById('funcaoFilter').addEventListener('change', () => { currentPage = 1; renderProfissionais(); });
        document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; renderProfissionais(); });
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

        // Clique nos cards de estatísticas
        document.querySelectorAll('.stat-card[data-funcao]').forEach(card => {
            card.addEventListener('click', () => {
                const funcao = card.getAttribute('data-funcao');
                aplicarFiltroFuncao(funcao);
            });
        });
        document.querySelectorAll('.stat-card[data-status]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.getAttribute('data-status');
                aplicarFiltroStatus(status);
            });
        });

        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('conteudoPrincipal').style.display = 'block';
    } else {
        window.location.href = 'login.html';
    }
});