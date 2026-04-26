// ==================== IMPORTAÇÕES ====================
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Importa funções compartilhadas do util.js
import { 
    escapeHtml, showToast, formatCurrency, formatarData, parseCurrency,
    carregarEmpresaUsuario, configurarMascaraValor, verificarStatusEmpresa
} from './util.js';

// ==================== CONSTANTES ====================
let currentUser = null;
let currentEmpresa = null;
let editingVacinaId = null, editingAplicacaoId = null;
let currentVacinaPage = 1, currentAplicacaoPage = 1;
const itemsPerPage = 10;
let vacinasCache = [];
let aplicacoesCache = [];
let petsCache = [];
let profissionaisCache = [];

// ==================== CARREGAR DADOS DO FIRESTORE ====================
async function carregarDadosEmpresa() {
    if (!currentEmpresa) return;
    const empresaId = currentEmpresa.id;
    const vacinasSnap = await getDocs(query(collection(db, 'vacinas'), where('empresaId', '==', empresaId)));
    vacinasCache = vacinasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const aplicacoesSnap = await getDocs(query(collection(db, 'vacinas_pet'), where('empresaId', '==', empresaId)));
    aplicacoesCache = aplicacoesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const petsSnap = await getDocs(query(collection(db, 'pets'), where('empresaId', '==', empresaId)));
    petsCache = petsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const profissionaisSnap = await getDocs(query(collection(db, 'profissionais'), where('empresaId', '==', empresaId)));
    profissionaisCache = profissionaisSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ==================== CRUD VACINAS ====================
async function addVacina(data) {
    const newDoc = { ...data, empresaId: currentEmpresa.id, criado_em: new Date().toISOString(), criado_por: currentUser.uid };
    const docRef = await addDoc(collection(db, 'vacinas'), newDoc);
    newDoc.id = docRef.id;
    vacinasCache.unshift(newDoc);
    renderVacinas();
    updateStats();
    showToast('Vacina cadastrada!', 'success');
}
async function updateVacina(id, updates) {
    await updateDoc(doc(db, 'vacinas', id), updates);
    const idx = vacinasCache.findIndex(v => v.id === id);
    if (idx !== -1) vacinasCache[idx] = { ...vacinasCache[idx], ...updates };
    renderVacinas();
    updateStats();
    showToast('Vacina atualizada!', 'success');
}
async function deleteVacina(id) {
    if (confirm('Excluir vacina?')) {
        await deleteDoc(doc(db, 'vacinas', id));
        vacinasCache = vacinasCache.filter(v => v.id !== id);
        renderVacinas();
        updateStats();
        showToast('Vacina excluída!', 'success');
    }
}
function getVacinaForm() { 
    return { 
        nome: document.getElementById('vacNome').value, 
        descricao: document.getElementById('vacDescricao').value, 
        intervaloDias: parseInt(document.getElementById('vacIntervalo').value) || 0, 
        preco: parseCurrency(document.getElementById('vacPreco').value) 
    }; 
}
function resetVacinaForm() {
    document.getElementById('vacNome').value = '';
    document.getElementById('vacDescricao').value = '';
    document.getElementById('vacIntervalo').value = '';
    document.getElementById('vacPreco').value = '';
    editingVacinaId = null;
    document.getElementById('cancelVacinaBtn').style.display = 'none';
    const btn = document.getElementById('saveVacinaBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}
function fillVacinaForm(v) {
    document.getElementById('vacNome').value = v.nome || '';
    document.getElementById('vacDescricao').value = v.descricao || '';
    document.getElementById('vacIntervalo').value = v.intervaloDias || 0;
    document.getElementById('vacPreco').value = formatCurrency(v.preco || 0);
}
async function salvarVacina() {
    if (!document.getElementById('vacNome').value.trim()) { showToast('Nome é obrigatório!', 'error'); return; }
    const data = getVacinaForm();
    if (editingVacinaId) await updateVacina(editingVacinaId, data);
    else await addVacina(data);
    resetVacinaForm();
}
window.editVacina = function(id) {
    const v = vacinasCache.find(v => v.id === id);
    if (v) { fillVacinaForm(v); editingVacinaId = id; document.getElementById('cancelVacinaBtn').style.display = 'inline-block'; const btn = document.getElementById('saveVacinaBtn'); btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar'; btn.classList.remove('btn-primary'); btn.classList.add('btn-success'); window.scrollTo({ top: 0 }); }
};
window.viewVacina = function(id) {
    const v = vacinasCache.find(v => v.id === id);
    if (!v) return;
    document.getElementById('modalBody').innerHTML = `
        <div class="info-row"><span class="info-label">Nome:</span><span class="info-value">${escapeHtml(v.nome)}</span></div>
        <div class="info-row"><span class="info-label">Descrição:</span><span class="info-value">${escapeHtml(v.descricao || '-')}</span></div>
        <div class="info-row"><span class="info-label">Intervalo:</span><span class="info-value">${v.intervaloDias || 0} dias</span></div>
        <div class="info-row"><span class="info-label">Preço:</span><span class="info-value">R$ ${formatCurrency(v.preco || 0)}</span></div>
    `;
    document.getElementById('viewModal').style.display = 'flex';
};
window.deleteVacina = deleteVacina;

// ==================== CRUD APLICAÇÕES ====================
async function addAplicacao(data) {
    const newDoc = { ...data, empresaId: currentEmpresa.id, criado_em: new Date().toISOString(), criado_por: currentUser.uid };
    const docRef = await addDoc(collection(db, 'vacinas_pet'), newDoc);
    newDoc.id = docRef.id;
    aplicacoesCache.unshift(newDoc);
    renderAplicacoes();
    updateStats();
    showToast('Aplicação registrada!', 'success');
}
async function updateAplicacao(id, updates) {
    await updateDoc(doc(db, 'vacinas_pet', id), updates);
    const idx = aplicacoesCache.findIndex(a => a.id === id);
    if (idx !== -1) aplicacoesCache[idx] = { ...aplicacoesCache[idx], ...updates };
    renderAplicacoes();
    updateStats();
    showToast('Aplicação atualizada!', 'success');
}
async function deleteAplicacao(id) {
    if (confirm('Excluir aplicação?')) {
        await deleteDoc(doc(db, 'vacinas_pet', id));
        aplicacoesCache = aplicacoesCache.filter(a => a.id !== id);
        renderAplicacoes();
        updateStats();
        showToast('Aplicação excluída!', 'success');
    }
}
function getAplicacaoForm() {
    return {
        petId: document.getElementById('vpePetId').value,
        vacinaId: document.getElementById('vpeVacinaId').value,
        profissionalId: document.getElementById('vpeProfissionalId').value,
        dataAplicacao: document.getElementById('vpeDataAplicacao').value,
        proximaDose: document.getElementById('vpeProximaDose').value,
        lote: document.getElementById('vpeLote').value,
        status: document.getElementById('vpeStatus').value,
        obs: document.getElementById('vpeObs').value
    };
}
function resetAplicacaoForm() {
    document.getElementById('vpePetId').value = '';
    document.getElementById('vpeVacinaId').value = '';
    document.getElementById('vpeProfissionalId').value = '';
    document.getElementById('vpeDataAplicacao').value = '';
    document.getElementById('vpeProximaDose').value = '';
    document.getElementById('vpeLote').value = '';
    document.getElementById('vpeStatus').value = 'aplicada';
    document.getElementById('vpeObs').value = '';
    editingAplicacaoId = null;
    document.getElementById('cancelAplicacaoBtn').style.display = 'none';
    const btn = document.getElementById('saveAplicacaoBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Registrar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}
function fillAplicacaoForm(a) {
    document.getElementById('vpePetId').value = a.petId || '';
    document.getElementById('vpeVacinaId').value = a.vacinaId || '';
    document.getElementById('vpeProfissionalId').value = a.profissionalId || '';
    document.getElementById('vpeDataAplicacao').value = a.dataAplicacao || '';
    document.getElementById('vpeProximaDose').value = a.proximaDose || '';
    document.getElementById('vpeLote').value = a.lote || '';
    document.getElementById('vpeStatus').value = a.status || 'aplicada';
    document.getElementById('vpeObs').value = a.obs || '';
}
async function salvarAplicacao() {
    if (!document.getElementById('vpePetId').value) { showToast('Selecione o pet!', 'error'); return; }
    if (!document.getElementById('vpeVacinaId').value) { showToast('Selecione a vacina!', 'error'); return; }
    const data = getAplicacaoForm();
    if (editingAplicacaoId) await updateAplicacao(editingAplicacaoId, data);
    else await addAplicacao(data);
    resetAplicacaoForm();
}
window.editAplicacao = function(id) {
    const a = aplicacoesCache.find(a => a.id === id);
    if (a) { fillAplicacaoForm(a); editingAplicacaoId = id; document.getElementById('cancelAplicacaoBtn').style.display = 'inline-block'; const btn = document.getElementById('saveAplicacaoBtn'); btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar'; btn.classList.remove('btn-primary'); btn.classList.add('btn-success'); window.scrollTo({ top: 0 }); }
};
window.viewAplicacao = function(id) {
    const a = aplicacoesCache.find(a => a.id === id);
    if (!a) return;
    const pet = petsCache.find(p => p.id === a.petId);
    const vac = vacinasCache.find(v => v.id === a.vacinaId);
    const prof = profissionaisCache.find(p => p.id === a.profissionalId);
    const statusClass = a.status === 'aplicada' ? 'status-aplicada' : (a.status === 'pendente' ? 'status-pendente' : 'status-vencida');
    document.getElementById('modalBody').innerHTML = `
        <div class="info-row"><span class="info-label">Pet:</span><span class="info-value">${escapeHtml(pet?.nome || pet?.pet_nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Vacina:</span><span class="info-value">${escapeHtml(vac?.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Profissional:</span><span class="info-value">${escapeHtml(prof?.prf_nome || prof?.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Data Aplicação:</span><span class="info-value">${a.dataAplicacao ? new Date(a.dataAplicacao).toLocaleString() : '-'}</span></div>
        <div class="info-row"><span class="info-label">Próxima Dose:</span><span class="info-value">${a.proximaDose ? new Date(a.proximaDose).toLocaleString() : '-'}</span></div>
        <div class="info-row"><span class="info-label">Lote:</span><span class="info-value">${a.lote || '-'}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="status-badge ${statusClass}">${a.status}</span></span></div>
        ${a.obs ? `<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(a.obs)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
};
window.deleteAplicacao = deleteAplicacao;

// ==================== RENDER VACINAS ====================
function renderVacinas() {
    let filtered = vacinasCache.filter(v => {
        const search = document.getElementById('searchVacina')?.value.toLowerCase() || '';
        return !search || v.nome.toLowerCase().includes(search);
    });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentVacinaPage > totalPages && totalPages > 0) currentVacinaPage = totalPages;
    const paginated = filtered.slice((currentVacinaPage-1)*itemsPerPage, currentVacinaPage*itemsPerPage);
    const tbody = document.getElementById('vacinasTableBody');
    if (paginated.length === 0) { tbody.innerHTML = '<tr><td colspan="5">Nenhuma vacina</td></tr>'; document.getElementById('vacinasPagination').innerHTML = ''; return; }
    tbody.innerHTML = paginated.map(v => `<tr>
        <td><strong>${escapeHtml(v.nome)}</strong></td>
        <td>${escapeHtml((v.descricao || '').substring(0,50))}</td>
        <td>${v.intervaloDias || 0} dias</td>
        <td>R$ ${formatCurrency(v.preco || 0)}</td>
        <td class="action-buttons">
            <button class="action-btn view" onclick="viewVacina('${v.id}')"><i class="fas fa-eye"></i></button>
            <button class="action-btn edit" onclick="editVacina('${v.id}')"><i class="fas fa-edit"></i></button>
            <button class="action-btn delete" onclick="deleteVacina('${v.id}')"><i class="fas fa-trash-alt"></i></button>
        </td>
    </tr>`).join('');
    let pagHtml = '<button class="page-btn" onclick="goToVacinaPage(1)" ' + (currentVacinaPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
    for (let i=1; i<=totalPages; i++) pagHtml += `<button class="page-btn ${i===currentVacinaPage?'active':''}" onclick="goToVacinaPage(${i})">${i}</button>`;
    pagHtml += `<button class="page-btn" onclick="goToVacinaPage(${totalPages})" ${currentVacinaPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    document.getElementById('vacinasPagination').innerHTML = pagHtml;
}
function goToVacinaPage(page) { currentVacinaPage = page; renderVacinas(); }

// ==================== RENDER APLICAÇÕES ====================
function renderAplicacoes() {
    let filtered = aplicacoesCache.filter(a => {
        const search = document.getElementById('searchAplicacao')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('statusAplicacaoFilter')?.value || '';
        const pet = petsCache.find(p => p.id === a.petId);
        const vac = vacinasCache.find(v => v.id === a.vacinaId);
        return (!search || (pet?.nome || '').toLowerCase().includes(search) || (vac?.nome || '').toLowerCase().includes(search)) &&
               (!statusFilter || a.status === statusFilter);
    });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentAplicacaoPage > totalPages && totalPages > 0) currentAplicacaoPage = totalPages;
    const paginated = filtered.slice((currentAplicacaoPage-1)*itemsPerPage, currentAplicacaoPage*itemsPerPage);
    const tbody = document.getElementById('aplicacoesTableBody');
    if (paginated.length === 0) { tbody.innerHTML = '<tr><td colspan="7">Nenhuma aplicação</td></tr>'; document.getElementById('aplicacoesPagination').innerHTML = ''; return; }
    tbody.innerHTML = paginated.map(a => {
        const pet = petsCache.find(p => p.id === a.petId);
        const vac = vacinasCache.find(v => v.id === a.vacinaId);
        const statusClass = a.status === 'aplicada' ? 'status-aplicada' : (a.status === 'pendente' ? 'status-pendente' : 'status-vencida');
        return `<tr>
            <td><strong>${escapeHtml(pet?.nome || pet?.pet_nome || '-')}</strong></td>
            <td>${escapeHtml(vac?.nome || '-')}</td>
            <td>${a.dataAplicacao ? new Date(a.dataAplicacao).toLocaleString() : '-'}</td>
            <td>${a.proximaDose ? new Date(a.proximaDose).toLocaleString() : '-'}</td>
            <td>${a.lote || '-'}</td>
            <td><span class="status-badge ${statusClass}">${a.status}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="viewAplicacao('${a.id}')"><i class="fas fa-eye"></i></button>
                <button class="action-btn edit" onclick="editAplicacao('${a.id}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" onclick="deleteAplicacao('${a.id}')"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>`;
    }).join('');
    let pagHtml = '<button class="page-btn" onclick="goToAplicacaoPage(1)" ' + (currentAplicacaoPage === 1 ? 'disabled' : '') + '>&laquo;</button>';
    for (let i=1; i<=totalPages; i++) pagHtml += `<button class="page-btn ${i===currentAplicacaoPage?'active':''}" onclick="goToAplicacaoPage(${i})">${i}</button>`;
    pagHtml += `<button class="page-btn" onclick="goToAplicacaoPage(${totalPages})" ${currentAplicacaoPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    document.getElementById('aplicacoesPagination').innerHTML = pagHtml;
}
function goToAplicacaoPage(page) { currentAplicacaoPage = page; renderAplicacoes(); }
function clearFilters() { document.getElementById('searchAplicacao').value = ''; document.getElementById('statusAplicacaoFilter').value = ''; currentAplicacaoPage = 1; renderAplicacoes(); }

// ==================== EXPORTAR PDF ====================
async function exportVacinasPDF() {
    if (vacinasCache.length === 0) { showToast('Não há vacinas para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44,125,160); doc.text('Relatório de Vacinas', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Total: ${vacinasCache.length} vacinas`, 14, 46);
        const colunas = [{ label: 'Nome', width: 50 }, { label: 'Descrição', width: 60 }, { label: 'Intervalo', width: 30 }, { label: 'Preço', width: 30 }];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44,125,160); doc.setTextColor(255,255,255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; });
        doc.setTextColor(0,0,0); y += 12;
        for (const v of vacinasCache) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0,0,0); }
            doc.text((v.nome || '-').substring(0,30), x+2, y+4); x += 50;
            doc.text((v.descricao || '-').substring(0,45), x+2, y+4); x += 60;
            doc.text(`${v.intervaloDias || 0} dias`, x+2, y+4); x += 30;
            doc.text(`R$ ${formatCurrency(v.preco || 0)}`, x+2, y+4);
            y += 8; x = 14;
        }
        for (let i=1; i<=doc.internal.getNumberOfPages(); i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150); doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200); }
        doc.save(`vacinas_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado!', 'success');
    } catch(e) { showToast('Erro ao gerar PDF!', 'error'); }
}
async function exportAplicacoesPDF() {
    if (aplicacoesCache.length === 0) { showToast('Não há aplicações para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44,125,160); doc.text('Relatório de Aplicações', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Total: ${aplicacoesCache.length} aplicações`, 14, 46);
        const colunas = [{ label: 'Pet', width: 40 }, { label: 'Vacina', width: 50 }, { label: 'Data', width: 50 }, { label: 'Próx. Dose', width: 50 }, { label: 'Status', width: 30 }];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44,125,160); doc.setTextColor(255,255,255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; });
        doc.setTextColor(0,0,0); y += 12;
        for (const a of aplicacoesCache) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0,0,0); }
            const pet = petsCache.find(p => p.id === a.petId);
            const vac = vacinasCache.find(v => v.id === a.vacinaId);
            doc.text((pet?.nome || pet?.pet_nome || '-').substring(0,25), x+2, y+4); x += 40;
            doc.text((vac?.nome || '-').substring(0,30), x+2, y+4); x += 50;
            doc.text(a.dataAplicacao ? new Date(a.dataAplicacao).toLocaleString() : '-', x+2, y+4); x += 50;
            doc.text(a.proximaDose ? new Date(a.proximaDose).toLocaleString() : '-', x+2, y+4); x += 50;
            doc.text(a.status || '-', x+2, y+4);
            y += 8; x = 14;
        }
        for (let i=1; i<=doc.internal.getNumberOfPages(); i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150); doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200); }
        doc.save(`aplicacoes_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado!', 'success');
    } catch(e) { showToast('Erro ao gerar PDF!', 'error'); }
}

// ==================== UPDATE STATS ====================
function updateStats() {
    document.getElementById('totalVacinas').innerText = vacinasCache.length;
    document.getElementById('totalAplicacoes').innerText = aplicacoesCache.length;
    document.getElementById('totalEmDia').innerText = aplicacoesCache.filter(a => a.status === 'aplicada').length;
    document.getElementById('totalAtrasadas').innerText = aplicacoesCache.filter(a => a.status === 'vencida').length;
}

// ==================== SELECTS ====================
function atualizarSelects() {
    const petSelect = document.getElementById('vpePetId');
    const vacinaSelect = document.getElementById('vpeVacinaId');
    const profissionalSelect = document.getElementById('vpeProfissionalId');
    petSelect.innerHTML = '<option value="">Selecione</option>' + petsCache.map(p => `<option value="${p.id}">${escapeHtml(p.nome || p.pet_nome)}</option>`).join('');
    vacinaSelect.innerHTML = '<option value="">Selecione</option>' + vacinasCache.map(v => `<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');
    profissionalSelect.innerHTML = '<option value="">Selecione</option>' + profissionaisCache.map(p => `<option value="${p.id}">${escapeHtml(p.prf_nome || p.nome)}</option>`).join('');
}

// ==================== MÁSCARAS ====================
function applyMasks() {
    configurarMascaraValor('vacPreco');
}

// ==================== AUTENTICAÇÃO E INICIALIZAÇÃO ====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentEmpresa = await carregarEmpresaUsuario(user);
        if (!currentEmpresa) { window.location.href = 'login.html'; return; }
        document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${currentEmpresa.emp_razao_social || currentEmpresa.emp_nome_fantasia || 'Empresa'}`;
        
        // Exibir alerta de trial
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
        renderVacinas();
        renderAplicacoes();
        updateStats();
        atualizarSelects();
        applyMasks();
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('conteudoPrincipal').style.display = 'block';
    } else {
        window.location.href = 'login.html';
    }
});

// ==================== EVENTOS DOM ====================
document.getElementById('saveVacinaBtn').onclick = salvarVacina;
document.getElementById('cancelVacinaBtn').onclick = resetVacinaForm;
document.getElementById('saveAplicacaoBtn').onclick = salvarAplicacao;
document.getElementById('cancelAplicacaoBtn').onclick = resetAplicacaoForm;
document.getElementById('searchVacina').addEventListener('input', () => { currentVacinaPage = 1; renderVacinas(); });
document.getElementById('searchAplicacao').addEventListener('input', () => { currentAplicacaoPage = 1; renderAplicacoes(); });
document.getElementById('statusAplicacaoFilter').addEventListener('change', () => { currentAplicacaoPage = 1; renderAplicacoes(); });
document.getElementById('clearFiltersBtn').onclick = clearFilters;
document.getElementById('exportVacinasPdfBtn').onclick = exportVacinasPDF;
document.getElementById('exportAplicacoesPdfBtn').onclick = exportAplicacoesPDF;
document.getElementById('logoutBtn').onclick = () => auth.signOut();
document.getElementById('modalCloseBtn').onclick = () => document.getElementById('viewModal').style.display = 'none';
window.onclick = (e) => { if (e.target === document.getElementById('viewModal')) document.getElementById('viewModal').style.display = 'none'; };
window.goToVacinaPage = goToVacinaPage;
window.goToAplicacaoPage = goToAplicacaoPage;
window.fecharModal = () => document.getElementById('viewModal').style.display = 'none';
window.solicitarLiberacao = () => {
    const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
    const corpo = encodeURIComponent(`Solicito liberação da empresa:\n\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}\nWhatsApp: ${currentEmpresa?.emp_whatsapp || '-'}\n\nAguardo retorno.`);
    window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
    showToast('Abrindo cliente de e-mail...', 'info');
};

// TABS
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
            document.getElementById(`${tab}Panel`).style.display = 'block';
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (tab === 'aplicacoes') { atualizarSelects(); renderAplicacoes(); }
            else { renderVacinas(); }
        };
    });
}
setupTabs();

console.log('✅ Vacinas - Refatorado (uma empresa por usuário)');