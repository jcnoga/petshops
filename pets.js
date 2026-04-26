// pets.js
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml, showToast, formatarData, carregarEmpresaUsuario, verificarStatusEmpresa
} from './util.js';

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
const itemsPerPage = 10;
let petsCache = [];
let clientesCache = [];
let agendamentosCache = [];
let unsubscribePets = null;

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

    const clientesSnap = await getDocs(query(collection(db, 'clientes'), where('empresaId', '==', empresaId)));
    clientesCache = clientesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const agendamentosSnap = await getDocs(query(collection(db, 'agendamentos'), where('empresaId', '==', empresaId)));
    agendamentosCache = agendamentosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (unsubscribePets) unsubscribePets();
    const qPets = query(collection(db, 'pets'), where('empresaId', '==', empresaId));
    unsubscribePets = onSnapshot(qPets, (snapshot) => {
        petsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPets();
        updateStats();
    }, (error) => console.error('Erro no snapshot pets:', error));
}

// ==================== CRUD ====================
async function addPet(data) {
    const newPet = {
        ...data,
        empresaId: currentEmpresa.id,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        criado_por: currentUser.uid
    };
    const docRef = await addDoc(collection(db, 'pets'), newPet);
    newPet.id = docRef.id;
    petsCache.unshift(newPet);
    renderPets();
    updateStats();
    atualizarSelectClientes();
    showToast('Pet cadastrado com sucesso!', 'success');
}

async function updatePet(id, updates) {
    await updateDoc(doc(db, 'pets', id), { ...updates, atualizado_em: new Date().toISOString() });
    const idx = petsCache.findIndex(p => p.id === id);
    if (idx !== -1) petsCache[idx] = { ...petsCache[idx], ...updates };
    renderPets();
    updateStats();
    showToast('Pet atualizado!', 'success');
}

async function deletePet(id) {
    const pet = petsCache.find(p => p.id === id);
    if (!pet) { showToast('Pet não encontrado!', 'error'); return; }
    const agendamentosPet = agendamentosCache.filter(a => a.petId === id);
    let msg = `⚠️ Excluir "${pet.nome || 'este pet'}"?`;
    if (agendamentosPet.length > 0) msg += `\n\n📌 Este pet possui ${agendamentosPet.length} agendamento(s) vinculado(s).`;
    if (confirm(msg)) {
        await deleteDoc(doc(db, 'pets', id));
        petsCache = petsCache.filter(p => p.id !== id);
        renderPets();
        updateStats();
        showToast('Pet excluído!', 'success');
    }
}

// ==================== FORMULÁRIO ====================
function getFormData() {
    return {
        clienteId: document.getElementById('petClienteId').value,
        nome: document.getElementById('petNome').value,
        especie: document.getElementById('petEspecie').value,
        raca: document.getElementById('petRaca').value,
        sexo: document.getElementById('petSexo').value,
        dataNasc: document.getElementById('petDataNasc').value,
        peso: parseFloat(document.getElementById('petPeso').value) || null,
        cor: document.getElementById('petCor').value,
        foto: document.getElementById('petFoto').value,
        microchip: document.getElementById('petMicrochip').value,
        castrado: document.getElementById('petCastrado').value === 'true',
        alergias: document.getElementById('petAlergias').value,
        obs: document.getElementById('petObs').value
    };
}

function validarFormulario() {
    const clienteId = document.getElementById('petClienteId').value;
    if (!clienteId) { showToast('Selecione um tutor!', 'error'); return false; }
    const nome = document.getElementById('petNome').value.trim();
    if (!nome) { showToast('Nome do pet é obrigatório!', 'error'); return false; }
    const dataNasc = document.getElementById('petDataNasc').value;
    if (dataNasc) {
        const hoje = new Date();
        const dataNascDate = new Date(dataNasc);
        if (dataNascDate > hoje) { showToast('Data de nascimento não pode ser futura!', 'error'); return false; }
        const idade = calcularIdade(dataNasc);
        if (idade > 50 && !confirm(`Idade calculada: ${idade} anos. Confirmar?`)) return false;
    }
    const cliente = clientesCache.find(c => c.id === clienteId);
    if (!cliente) { showToast('Cliente não encontrado!', 'error'); return false; }
    if (cliente.cli_status === 'inativo' || cliente.deleted_at) { showToast('Este cliente está inativo. Não é possível vincular um pet.', 'error'); return false; }
    return true;
}

function resetForm() {
    document.getElementById('petClienteId').value = '';
    document.getElementById('petNome').value = '';
    document.getElementById('petEspecie').value = '';
    document.getElementById('petRaca').value = '';
    document.getElementById('petSexo').value = '';
    document.getElementById('petDataNasc').value = '';
    document.getElementById('petPeso').value = '';
    document.getElementById('petCor').value = '';
    document.getElementById('petFoto').value = '';
    document.getElementById('petMicrochip').value = '';
    document.getElementById('petCastrado').value = 'false';
    document.getElementById('petAlergias').value = '';
    document.getElementById('petObs').value = '';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const btn = document.getElementById('savePetBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar Pet';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}

function fillForm(pet) {
    document.getElementById('petClienteId').value = pet.clienteId || '';
    document.getElementById('petNome').value = pet.nome || '';
    document.getElementById('petEspecie').value = pet.especie || '';
    document.getElementById('petRaca').value = pet.raca || '';
    document.getElementById('petSexo').value = pet.sexo || '';
    document.getElementById('petDataNasc').value = pet.dataNasc || '';
    document.getElementById('petPeso').value = pet.peso || '';
    document.getElementById('petCor').value = pet.cor || '';
    document.getElementById('petFoto').value = pet.foto || '';
    document.getElementById('petMicrochip').value = pet.microchip || '';
    document.getElementById('petCastrado').value = pet.castrado ? 'true' : 'false';
    document.getElementById('petAlergias').value = pet.alergias || '';
    document.getElementById('petObs').value = pet.obs || '';
}

async function salvarPet() {
    if (!validarFormulario()) return;
    const data = getFormData();
    if (editingId) await updatePet(editingId, data);
    else await addPet(data);
    resetForm();
}

function cancelEdit() { resetForm(); }

// ==================== EDITAR E VISUALIZAR ====================
function editPet(id) {
    const pet = petsCache.find(p => p.id === id);
    if (pet) {
        fillForm(pet);
        editingId = id;
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        const btn = document.getElementById('savePetBtn');
        btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar Pet';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        showToast('Pet não encontrado!', 'error');
    }
}

function viewPet(id) {
    const pet = petsCache.find(p => p.id === id);
    if (!pet) return;
    const tutor = clientesCache.find(c => c.id === pet.clienteId);
    const idade = calcularIdade(pet.dataNasc);
    const fotoUrl = pet.foto || '';
    const temFoto = fotoUrl && fotoUrl.trim() !== '';
    const idadeText = idade !== null ? `${idade} ${idade === 1 ? 'ano' : 'anos'}` : 'Não informada';
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="width:120px;height:120px;border-radius:50%;margin:0 auto;background:#e2edf2;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                ${temFoto ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;">` : ''}
                <i class="fas fa-paw" style="font-size:3rem;color:#7a9eb0;"></i>
                ${temFoto ? `</div>` : ''}
            </div>
            <h2 style="color:#1f5068; margin-top:10px;">${escapeHtml(pet.nome)}</h2>
            <span class="badge">${escapeHtml(pet.especie || 'Pet')}</span>
            ${pet.castrado ? '<span class="badge" style="background:#2a9d8f20; color:#2a9d8f; margin-left:5px;">✂️ Castrado</span>' : ''}
        </div>
        <div class="info-row"><span class="info-label">Raça:</span><span class="info-value">${escapeHtml(pet.raca || '-')}</span></div>
        <div class="info-row"><span class="info-label">Sexo:</span><span class="info-value">${pet.sexo === 'macho' ? '♂️ Macho' : (pet.sexo === 'femea' ? '♀️ Fêmea' : '-')}</span></div>
        <div class="info-row"><span class="info-label">Data Nascimento:</span><span class="info-value">${formatarData(pet.dataNasc)} (${idadeText})</span></div>
        <div class="info-row"><span class="info-label">Peso:</span><span class="info-value">${pet.peso ? pet.peso + ' kg' : '-'}</span></div>
        <div class="info-row"><span class="info-label">Cor:</span><span class="info-value">${escapeHtml(pet.cor || '-')}</span></div>
        <div class="info-row"><span class="info-label">Microchip:</span><span class="info-value">${escapeHtml(pet.microchip || '-')}</span></div>
        <div class="info-row"><span class="info-label">Tutor:</span><span class="info-value">${escapeHtml(tutor?.cli_nome || tutor?.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Alergias:</span><span class="info-value">${escapeHtml(pet.alergias || '-')}</span></div>
        <div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(pet.obs || '-')}</span></div>
        <div class="info-row"><span class="info-label">Cadastrado em:</span><span class="info-value">${new Date(pet.criado_em).toLocaleDateString('pt-BR')}</span></div>
    `;
    document.getElementById('viewModal').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('viewModal').style.display = 'none';
}

// ==================== RENDERIZAÇÃO ====================
function renderPets() {
    let filtered = petsCache.filter(p => {
        const tutor = clientesCache.find(c => c.id === p.clienteId);
        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const especieFilter = document.getElementById('especieFilter')?.value || '';
        const matchSearch = !searchTerm || (p.nome || '').toLowerCase().includes(searchTerm) ||
                           (p.raca || '').toLowerCase().includes(searchTerm) ||
                           (tutor?.cli_nome || '').toLowerCase().includes(searchTerm);
        const matchEspecie = !especieFilter || p.especie === especieFilter;
        return matchSearch && matchEspecie;
    });
    filtered.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const tbody = document.getElementById('petsTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">Nenhum pet encontrado<\/td><\/tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(p => {
        const tutor = clientesCache.find(c => c.id === p.clienteId);
        const fotoUrl = p.foto || '';
        const temFoto = fotoUrl && fotoUrl.trim() !== '';
        const especieIcon = p.especie === 'cachorro' ? '🐕' : (p.especie === 'gato' ? '🐈' : (p.especie === 'ave' ? '🐦' : '🐾'));
        return `<tr>
            <td><div class="pet-photo">${temFoto ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" onerror="this.style.display='none';this.parentElement.innerHTML='<i class=\'fas fa-paw\'></i>'">` : '<i class="fas fa-paw"></i>'}</div></td>
            <td><strong>${especieIcon} ${escapeHtml(p.nome || '-')}</strong><br><span style="font-size:0.65rem;color:#7a9eb0;">${escapeHtml(p.cor || '')}</span></td>
            <td>${escapeHtml(p.especie || '-')}</td>
            <td>${escapeHtml(p.raca || '-')}</td>
            <td>${p.sexo === 'macho' ? '♂️' : (p.sexo === 'femea' ? '♀️' : '-')}</td>
            <td>${p.peso ? p.peso + 'kg' : '-'}</td>
            <td>${escapeHtml(tutor?.cli_nome || tutor?.nome || '-')}</td>
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

    // Reatribuir eventos
    document.querySelectorAll('.action-btn.view').forEach(btn => {
        btn.addEventListener('click', (e) => viewPet(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', (e) => editPet(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', (e) => deletePet(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => goToPage(parseInt(btn.getAttribute('data-page'))));
    });
}

function goToPage(page) {
    currentPage = page;
    renderPets();
}

function updateStats() {
    document.getElementById('totalPets').innerText = petsCache.length;
    document.getElementById('totalCachorros').innerText = petsCache.filter(p => p.especie === 'cachorro').length;
    document.getElementById('totalGatos').innerText = petsCache.filter(p => p.especie === 'gato').length;
    document.getElementById('totalClientes').innerText = clientesCache.length;
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('especieFilter').value = '';
    currentPage = 1;
    renderPets();
    showToast('Filtros limpos!', 'success');
}

function aplicarFiltroEspecie(especie) {
    document.getElementById('especieFilter').value = especie;
    currentPage = 1;
    renderPets();
}

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    if (petsCache.length === 0) { showToast('Não há pets para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44, 125, 160); doc.text('Relatório de Pets', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 38);
        doc.text(`Total de pets: ${petsCache.length}`, 14, 46);
        const colunas = [{ label: 'Nome', width: 40 }, { label: 'Espécie', width: 25 }, { label: 'Raça', width: 40 }, { label: 'Sexo', width: 20 }, { label: 'Peso', width: 20 }, { label: 'Tutor', width: 50 }];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44, 125, 160); doc.setTextColor(255, 255, 255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; });
        doc.setTextColor(0, 0, 0);
        y += 12;
        for (const pet of petsCache) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0, 0, 0); }
            const tutor = clientesCache.find(c => c.id === pet.clienteId);
            doc.text((pet.nome || '-').substring(0, 25), x + 2, y + 4); x += 40;
            doc.text((pet.especie || '-'), x + 2, y + 4); x += 25;
            doc.text((pet.raca || '-').substring(0, 25), x + 2, y + 4); x += 40;
            doc.text(pet.sexo === 'macho' ? 'Macho' : (pet.sexo === 'femea' ? 'Fêmea' : '-'), x + 2, y + 4); x += 20;
            doc.text(pet.peso ? `${pet.peso}kg` : '-', x + 2, y + 4); x += 20;
            doc.text((tutor?.cli_nome || tutor?.nome || '-').substring(0, 35), x + 2, y + 4);
            y += 8; x = 14;
        }
        for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200);
        }
        doc.save(`pets_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');
    } catch (e) {
        showToast('Erro ao gerar PDF!', 'error');
    }
}

// ==================== SELECTS ====================
function atualizarSelectClientes() {
    const select = document.getElementById('petClienteId');
    const clientesAtivos = clientesCache.filter(c => c.cli_status !== 'inativo' && !c.deleted_at);
    select.innerHTML = '<option value="">🔍 Selecione o tutor (Cliente)</option>' +
        clientesAtivos.map(c => `<option value="${c.id}">${escapeHtml(c.cli_nome || c.nome)} - ${escapeHtml(c.cli_telefone || c.telefone || '')}</option>`).join('');
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
        atualizarSelectClientes();
        renderPets();
        updateStats();

        // Eventos
        document.getElementById('savePetBtn').onclick = salvarPet;
        document.getElementById('cancelEditBtn').onclick = cancelEdit;
        document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderPets(); });
        document.getElementById('especieFilter').addEventListener('change', () => { currentPage = 1; renderPets(); });
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

        // Filtros por card
        document.querySelectorAll('.stat-card[data-especie]').forEach(card => {
            card.addEventListener('click', () => {
                const especie = card.getAttribute('data-especie');
                aplicarFiltroEspecie(especie);
            });
        });
        document.querySelector('.stat-card[data-page="clientes.html"]')?.addEventListener('click', () => {
            window.location.href = 'clientes.html';
        });

        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('conteudoPrincipal').style.display = 'block';
    } else {
        window.location.href = 'login.html';
    }
});