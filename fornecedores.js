// ==================== IMPORTAÇÕES ====================
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    escapeHtml, showToast, formatCurrency, 
    carregarEmpresaUsuario, verificarStatusEmpresa 
} from './util.js';

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
let itemsPerPage = 10;
let fornecedoresCache = [];

// Elementos DOM
const forNome = document.getElementById('forNome');
const forDocumento = document.getElementById('forDocumento');
const forTelefone = document.getElementById('forTelefone');
const forEmail = document.getElementById('forEmail');
const forContato = document.getElementById('forContato');
const forEndereco = document.getElementById('forEndereco');
const forCidade = document.getElementById('forCidade');
const forStatus = document.getElementById('forStatus');
const forObs = document.getElementById('forObs');

// ==================== FUNÇÕES AUXILIARES ====================
function formatarDocumento(valor) {
    valor = valor.replace(/\D/g, '');
    if (valor.length === 11) return valor.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (valor.length === 14) return valor.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return valor;
}
function formatarTelefone(valor) {
    valor = valor.replace(/\D/g, '');
    if (valor.length === 11) return valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (valor.length === 10) return valor.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return valor;
}
function aplicarMascaras() {
    forTelefone.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.slice(0,11);
        e.target.value = formatarTelefone(val);
    });
    forDocumento.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 14) val = val.slice(0,14);
        e.target.value = formatarDocumento(val);
    });
}
function limparForm() {
    forNome.value = '';
    forDocumento.value = '';
    forTelefone.value = '';
    forEmail.value = '';
    forContato.value = '';
    forEndereco.value = '';
    forCidade.value = '';
    forStatus.value = 'ativo';
    forObs.value = '';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const saveBtn = document.getElementById('saveFornecedorBtn');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Fornecedor';
    saveBtn.classList.remove('btn-success');
    saveBtn.classList.add('btn-primary');
    document.getElementById('docError').style.display = 'none';
}
function preencherForm(fornecedor) {
    forNome.value = fornecedor.nome || '';
    forDocumento.value = fornecedor.documento || '';
    forTelefone.value = fornecedor.telefone || '';
    forEmail.value = fornecedor.email || '';
    forContato.value = fornecedor.contato || '';
    forEndereco.value = fornecedor.endereco || '';
    forCidade.value = fornecedor.cidade || '';
    forStatus.value = fornecedor.status || 'ativo';
    forObs.value = fornecedor.obs || '';
    editingId = fornecedor.id;
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    const saveBtn = document.getElementById('saveFornecedorBtn');
    saveBtn.innerHTML = '<i class="fas fa-pen"></i> Atualizar';
    saveBtn.classList.remove('btn-primary');
    saveBtn.classList.add('btn-success');
}
async function verificarDocumentoUnico(documento, ignoreId = null) {
    if (!documento) return true;
    const q = query(collection(db, 'fornecedores'), where('empresaId', '==', currentEmpresa.id), where('documento', '==', documento));
    const snap = await getDocs(q);
    if (snap.empty) return true;
    if (ignoreId && snap.docs[0].id === ignoreId) return true;
    return false;
}
async function carregarProdutosVinculados(fornecedorId) {
    if (!currentEmpresa) return 0;
    const q = query(collection(db, 'produtos'), where('empresaId', '==', currentEmpresa.id), where('fornecedorId', '==', fornecedorId));
    const snap = await getDocs(q);
    return snap.size;
}
async function atualizarTotalProdutosVinculados() {
    let total = 0;
    for (const f of fornecedoresCache) {
        total += await carregarProdutosVinculados(f.id);
    }
    document.getElementById('totalProdutosVinculados').innerText = total;
}

// ==================== CRUD FORNECEDORES ====================
async function carregarFornecedores() {
    if (!currentEmpresa) return;
    const q = query(collection(db, 'fornecedores'), where('empresaId', '==', currentEmpresa.id));
    const snap = await getDocs(q);
    fornecedoresCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderFornecedores();
    atualizarStats();
    atualizarTotalProdutosVinculados();
}
async function salvarFornecedor() {
    const nome = forNome.value.trim();
    if (!nome) { showToast('Nome é obrigatório!', 'error'); return; }
    const documento = forDocumento.value.replace(/\D/g, '');
    if (documento && !(documento.length === 11 || documento.length === 14)) { showToast('CNPJ/CPF inválido!', 'error'); return; }
    const documentoUnico = await verificarDocumentoUnico(documento, editingId);
    if (!documentoUnico) { document.getElementById('docError').style.display = 'inline'; showToast('Documento já cadastrado!', 'error'); return; }
    document.getElementById('docError').style.display = 'none';
    
    const dados = {
        nome,
        documento,
        telefone: forTelefone.value,
        email: forEmail.value,
        contato: forContato.value,
        endereco: forEndereco.value,
        cidade: forCidade.value,
        status: forStatus.value,
        obs: forObs.value,
        updatedAt: new Date().toISOString(),
        deleted: false
    };
    if (!editingId) {
        dados.createdAt = new Date().toISOString();
        dados.empresaId = currentEmpresa.id;
        const docRef = await addDoc(collection(db, 'fornecedores'), dados);
        fornecedoresCache.unshift({ id: docRef.id, ...dados });
        showToast('Fornecedor cadastrado!', 'success');
    } else {
        await updateDoc(doc(db, 'fornecedores', editingId), dados);
        const index = fornecedoresCache.findIndex(f => f.id === editingId);
        if (index !== -1) fornecedoresCache[index] = { ...fornecedoresCache[index], ...dados };
        showToast('Fornecedor atualizado!', 'success');
    }
    limparForm();
    renderFornecedores();
    atualizarStats();
    atualizarTotalProdutosVinculados();
}
async function moverParaLixeira(id) {
    if (confirm('Mover fornecedor para a lixeira? Ele poderá ser restaurado depois.')) {
        await updateDoc(doc(db, 'fornecedores', id), { deleted: true, status: 'inativo' });
        const index = fornecedoresCache.findIndex(f => f.id === id);
        if (index !== -1) fornecedoresCache[index].deleted = true;
        renderFornecedores();
        atualizarStats();
        showToast('Fornecedor movido para lixeira!', 'info');
    }
}
async function restaurarFornecedor(id) {
    await updateDoc(doc(db, 'fornecedores', id), { deleted: false });
    const index = fornecedoresCache.findIndex(f => f.id === id);
    if (index !== -1) fornecedoresCache[index].deleted = false;
    renderFornecedores();
    atualizarStats();
    showToast('Fornecedor restaurado!', 'success');
}
async function excluirPermanente(id) {
    if (confirm('ATENÇÃO: Excluir permanentemente este fornecedor? Essa ação não pode ser desfeita.')) {
        await deleteDoc(doc(db, 'fornecedores', id));
        fornecedoresCache = fornecedoresCache.filter(f => f.id !== id);
        renderFornecedores();
        atualizarStats();
        atualizarTotalProdutosVinculados();
        showToast('Fornecedor excluído permanentemente!', 'success');
    }
}

// ==================== RENDERIZAÇÃO ====================
function renderFornecedores() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    let filtered = fornecedoresCache.filter(f => {
        if (statusVal === 'deleted') return f.deleted === true;
        if (statusVal) return f.status === statusVal && !f.deleted;
        return !f.deleted;
    });
    if (searchTerm) {
        filtered = filtered.filter(f => 
            f.nome?.toLowerCase().includes(searchTerm) ||
            f.documento?.includes(searchTerm) ||
            f.telefone?.includes(searchTerm) ||
            f.email?.toLowerCase().includes(searchTerm)
        );
    }
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    const start = (currentPage-1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);
    const tbody = document.getElementById('fornecedoresTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum fornecedor encontrado</td></tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(f => {
        const statusClass = f.deleted ? 'status-deleted' : (f.status === 'ativo' ? 'status-ativo' : 'status-inativo');
        const statusLabel = f.deleted ? 'Lixeira' : (f.status === 'ativo' ? 'Ativo' : 'Inativo');
        return `
        <tr>
            <td><strong>${escapeHtml(f.nome || '-')}</strong></td>
            <td>${escapeHtml(f.documento || '-')}</td>
            <td>${escapeHtml(f.telefone || '-')}</td>
            <td>${escapeHtml(f.contato || '-')}</td>
            <td>${escapeHtml(f.cidade || '-')}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verDetalhes('${f.id}')"><i class="fas fa-eye"></i></button>
                ${!f.deleted ? `<button class="action-btn edit" onclick="editarFornecedor('${f.id}')"><i class="fas fa-edit"></i></button>` : ''}
                ${!f.deleted ? `<button class="action-btn delete" onclick="moverParaLixeira('${f.id}')"><i class="fas fa-trash-alt"></i></button>` : ''}
                ${f.deleted ? `<button class="action-btn restore" onclick="restaurarFornecedor('${f.id}')"><i class="fas fa-trash-restore"></i></button>` : ''}
                ${f.deleted ? `<button class="action-btn delete" onclick="excluirPermanente('${f.id}')"><i class="fas fa-times-circle"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
    let pagHtml = `<button class="page-btn" onclick="mudarPagina(1)" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    for (let i=1; i<=totalPages; i++) {
        pagHtml += `<button class="page-btn ${i===currentPage?'active':''}" onclick="mudarPagina(${i})">${i}</button>`;
    }
    pagHtml += `<button class="page-btn" onclick="mudarPagina(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    document.getElementById('pagination').innerHTML = pagHtml;
}
function mudarPagina(page) { currentPage = page; renderFornecedores(); }
function atualizarStats() {
    const total = fornecedoresCache.filter(f => !f.deleted).length;
    const ativos = fornecedoresCache.filter(f => f.status === 'ativo' && !f.deleted).length;
    const lixeira = fornecedoresCache.filter(f => f.deleted === true).length;
    document.getElementById('totalFornecedores').innerText = total;
    document.getElementById('totalAtivos').innerText = ativos;
    document.getElementById('totalLixeira').innerText = lixeira;
}
window.verDetalhes = function(id) {
    const f = fornecedoresCache.find(f => f.id === id);
    if (!f) return;
    document.getElementById('modalBody').innerHTML = `
        <div class="info-row"><span class="info-label">Nome:</span><span class="info-value">${escapeHtml(f.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Documento:</span><span class="info-value">${escapeHtml(f.documento || '-')}</span></div>
        <div class="info-row"><span class="info-label">Telefone:</span><span class="info-value">${escapeHtml(f.telefone || '-')}</span></div>
        <div class="info-row"><span class="info-label">E-mail:</span><span class="info-value">${escapeHtml(f.email || '-')}</span></div>
        <div class="info-row"><span class="info-label">Contato:</span><span class="info-value">${escapeHtml(f.contato || '-')}</span></div>
        <div class="info-row"><span class="info-label">Endereço:</span><span class="info-value">${escapeHtml(f.endereco || '-')}</span></div>
        <div class="info-row"><span class="info-label">Cidade:</span><span class="info-value">${escapeHtml(f.cidade || '-')}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value">${f.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></div>
        ${f.obs ? `<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(f.obs)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
};
window.editarFornecedor = function(id) {
    const f = fornecedoresCache.find(f => f.id === id);
    if (f) preencherForm(f);
};
window.moverParaLixeira = moverParaLixeira;
window.restaurarFornecedor = restaurarFornecedor;
window.excluirPermanente = excluirPermanente;

// ==================== FILTROS E BUSCA ====================
document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderFornecedores(); });
document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; renderFornecedores(); });
document.getElementById('clearFiltersBtn').onclick = () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    currentPage = 1;
    renderFornecedores();
};

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    const ativos = fornecedoresCache.filter(f => !f.deleted);
    if (ativos.length === 0) { showToast('Nenhum fornecedor para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44,125,160); doc.text('Relatório de Fornecedores', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Total: ${ativos.length} fornecedores`, 14, 46);
        const colunas = [
            { label: 'Nome', width: 50 },
            { label: 'Documento', width: 35 },
            { label: 'Telefone', width: 35 },
            { label: 'Contato', width: 40 },
            { label: 'Cidade', width: 35 },
            { label: 'Status', width: 25 }
        ];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44,125,160); doc.setTextColor(255,255,255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; });
        doc.setTextColor(0,0,0); y += 12;
        for (const f of ativos) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0,0,0); }
            doc.text((f.nome || '-').substring(0,30), x+2, y+4); x += 50;
            doc.text((f.documento || '-'), x+2, y+4); x += 35;
            doc.text((f.telefone || '-'), x+2, y+4); x += 35;
            doc.text((f.contato || '-').substring(0,25), x+2, y+4); x += 40;
            doc.text((f.cidade || '-').substring(0,20), x+2, y+4); x += 35;
            doc.text((f.status === 'ativo' ? 'Ativo' : 'Inativo'), x+2, y+4);
            y += 8; x = 14;
        }
        for (let i=1; i<=doc.internal.getNumberOfPages(); i++) {
            doc.setPage(i);
            doc.setFontSize(8); doc.setTextColor(150,150,150);
            doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200);
        }
        doc.save(`fornecedores_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado!', 'success');
    } catch(e) { showToast('Erro ao gerar PDF!', 'error'); }
}
document.getElementById('exportPdfBtn').onclick = exportarPDF;

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
        
        await carregarFornecedores();
        aplicarMascaras();
    } else {
        window.location.href = 'login.html';
    }
});

// ==================== EVENTOS GLOBAIS ====================
document.getElementById('saveFornecedorBtn').onclick = salvarFornecedor;
document.getElementById('cancelEditBtn').onclick = limparForm;
document.getElementById('modalCloseBtn').onclick = () => document.getElementById('viewModal').style.display = 'none';
window.onclick = (e) => { if (e.target === document.getElementById('viewModal')) document.getElementById('viewModal').style.display = 'none'; };
window.mudarPagina = mudarPagina;
window.solicitarLiberacao = () => {
    const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
    const corpo = encodeURIComponent(`Solicito liberação da empresa:\n\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}\nWhatsApp: ${currentEmpresa?.emp_whatsapp || '-'}\n\nAguardo retorno.`);
    window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
    showToast('Abrindo cliente de e-mail...', 'info');
};
document.getElementById('logoutBtn').onclick = () => auth.signOut();