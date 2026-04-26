// produtos.js
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    escapeHtml, showToast, formatCurrency, parseCurrency,
    carregarEmpresaUsuario, verificarStatusEmpresa, configurarMascaraValor
} from './util.js';

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentEmpresa = null;
let editingProdutoId = null;
let currentProdutoPage = 1, currentMovimentoPage = 1;
const itemsPerPage = 10;

let produtosCache = [];
let categoriasCache = [];
let movimentosCache = [];
let unsubscribeProdutos = null;

// ==================== CARREGAR DADOS COM LISTENER ====================
async function carregarDadosApoio() {
    if (!currentEmpresa) return;
    const empresaId = currentEmpresa.id;

    const categoriasSnap = await getDocs(query(collection(db, 'categorias_produtos'), where('empresaId', '==', empresaId)));
    categoriasCache = categoriasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const movimentosSnap = await getDocs(query(collection(db, 'movimento_estoque'), where('empresaId', '==', empresaId)));
    movimentosCache = movimentosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (unsubscribeProdutos) unsubscribeProdutos();
    const produtosQuery = query(collection(db, 'produtos'), where('empresaId', '==', empresaId));
    unsubscribeProdutos = onSnapshot(produtosQuery, (snapshot) => {
        produtosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProdutos();
        updateStats();
        atualizarSelectProdutos();
    }, (error) => console.error('Erro snapshot produtos:', error));
}

// ==================== VALIDAÇÃO DE UNICIDADE (TRANSACTION) ====================
async function verificarUnicidadeCodigoBarras(codigo, empresaId, idIgnorar = null) {
    if (!codigo) return true;
    const q = query(collection(db, 'produtos'), where('codigoBarras', '==', codigo), where('empresaId', '==', empresaId));
    const snap = await getDocs(q);
    const existe = snap.docs.some(doc => doc.id !== idIgnorar);
    return !existe;
}

async function salvarProdutoComUnicidade(dados, isUpdate = false, id = null) {
    const empresaId = currentEmpresa.id;
    await runTransaction(db, async (transaction) => {
        if (dados.codigoBarras) {
            const codigoQuery = query(collection(db, 'produtos'), where('codigoBarras', '==', dados.codigoBarras), where('empresaId', '==', empresaId));
            const codigoSnap = await transaction.get(codigoQuery);
            const existe = codigoSnap.docs.some(doc => doc.id !== id);
            if (existe) throw new Error('Código de barras já cadastrado para outro produto.');
        }
        if (isUpdate && id) {
            const prodRef = doc(db, 'produtos', id);
            transaction.update(prodRef, { ...dados, atualizado_em: new Date().toISOString() });
        } else {
            const novoRef = doc(collection(db, 'produtos'));
            const novoProduto = { ...dados, empresaId, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), criado_por: currentUser.uid };
            transaction.set(novoRef, novoProduto);
        }
    });
}

async function addProduto(data) {
    try {
        await salvarProdutoComUnicidade(data, false);
        showToast('Produto cadastrado!', 'success');
    } catch (error) { showToast(error.message, 'error'); }
}
async function updateProduto(id, data) {
    try {
        await salvarProdutoComUnicidade(data, true, id);
        showToast('Produto atualizado!', 'success');
    } catch (error) { showToast(error.message, 'error'); }
}
async function deleteProduto(id) {
    if (!confirm('Excluir produto? Esta ação não pode ser desfeita.')) return;
    await deleteDoc(doc(db, 'produtos', id));
    showToast('Produto excluído!', 'success');
}

// ==================== FORMULÁRIO PRODUTOS ====================
function getProdutoForm() {
    return {
        nome: document.getElementById('prodNome').value,
        codigoBarras: document.getElementById('prodCodigoBarras').value,
        categoriaId: document.getElementById('prodCategoriaId').value,
        precoVenda: parseCurrency(document.getElementById('prodPrecoVenda').value),
        precoCusto: parseCurrency(document.getElementById('prodPrecoCusto').value),
        estoque: parseInt(document.getElementById('prodEstoque').value) || 0,
        estoqueMin: parseInt(document.getElementById('prodEstoqueMin').value) || 0,
        ativo: document.getElementById('prodAtivo').value === 'true',
        localizacao: document.getElementById('prodLocalizacao').value,
        descricao: document.getElementById('prodDescricao').value
    };
}
function validarProduto() {
    const nome = document.getElementById('prodNome').value.trim();
    if (!nome) { showToast('Nome é obrigatório!', 'error'); return false; }
    const precoVenda = parseCurrency(document.getElementById('prodPrecoVenda').value);
    if (precoVenda <= 0) { showToast('Preço de venda deve ser maior que zero!', 'error'); return false; }
    return true;
}
function resetProdutoForm() {
    document.getElementById('prodNome').value = '';
    document.getElementById('prodCodigoBarras').value = '';
    document.getElementById('prodCategoriaId').value = '';
    document.getElementById('prodPrecoVenda').value = '';
    document.getElementById('prodPrecoCusto').value = '';
    document.getElementById('prodMargem').value = '';
    document.getElementById('prodEstoque').value = '0';
    document.getElementById('prodEstoqueMin').value = '0';
    document.getElementById('prodAtivo').value = 'true';
    document.getElementById('prodLocalizacao').value = '';
    document.getElementById('prodDescricao').value = '';
    editingProdutoId = null;
    document.getElementById('cancelProdutoBtn').style.display = 'none';
    const btn = document.getElementById('saveProdutoBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-primary');
}
function fillProdutoForm(p) {
    document.getElementById('prodNome').value = p.nome || '';
    document.getElementById('prodCodigoBarras').value = p.codigoBarras || '';
    document.getElementById('prodCategoriaId').value = p.categoriaId || '';
    document.getElementById('prodPrecoVenda').value = formatCurrency(p.precoVenda || 0);
    document.getElementById('prodPrecoCusto').value = formatCurrency(p.precoCusto || 0);
    document.getElementById('prodEstoque').value = p.estoque || 0;
    document.getElementById('prodEstoqueMin').value = p.estoqueMin || 0;
    document.getElementById('prodAtivo').value = p.ativo ? 'true' : 'false';
    document.getElementById('prodLocalizacao').value = p.localizacao || '';
    document.getElementById('prodDescricao').value = p.descricao || '';
    calcularMargem();
}
function calcularMargem() {
    const venda = parseCurrency(document.getElementById('prodPrecoVenda').value);
    const custo = parseCurrency(document.getElementById('prodPrecoCusto').value);
    if (custo > 0 && venda > 0 && venda > custo) {
        const margem = ((venda - custo) / venda * 100).toFixed(2);
        document.getElementById('prodMargem').value = `${margem}%`;
        document.getElementById('prodMargem').style.color = '#2a9d8f';
    } else if (custo > 0 && venda > 0) {
        document.getElementById('prodMargem').value = 'Prejuízo';
        document.getElementById('prodMargem').style.color = '#e76f51';
    } else {
        document.getElementById('prodMargem').value = '';
    }
}
async function salvarProduto() {
    if (!validarProduto()) return;
    const data = getProdutoForm();
    if (editingProdutoId) await updateProduto(editingProdutoId, data);
    else await addProduto(data);
    resetProdutoForm();
}
function editProduto(id) {
    const p = produtosCache.find(p => p.id === id);
    if (p) { fillProdutoForm(p); editingProdutoId = id; document.getElementById('cancelProdutoBtn').style.display = 'inline-block'; const btn = document.getElementById('saveProdutoBtn'); btn.innerHTML = '<i class="fas fa-pen"></i> Atualizar'; btn.classList.remove('btn-primary'); btn.classList.add('btn-success'); window.scrollTo({ top: 0 }); }
}
function viewProduto(id) {
    const p = produtosCache.find(p => p.id === id);
    if (!p) return;
    const cat = categoriasCache.find(c => c.id === p.categoriaId);
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="info-row"><span class="info-label">Produto:</span><span class="info-value">${escapeHtml(p.nome)}</span></div>
        <div class="info-row"><span class="info-label">Código Barras:</span><span class="info-value">${escapeHtml(p.codigoBarras || '-')}</span></div>
        <div class="info-row"><span class="info-label">Categoria:</span><span class="info-value">${escapeHtml(cat?.nome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Preço Venda:</span><span class="info-value">R$ ${formatCurrency(p.precoVenda || 0)}</span></div>
        <div class="info-row"><span class="info-label">Preço Custo:</span><span class="info-value">R$ ${formatCurrency(p.precoCusto || 0)}</span></div>
        <div class="info-row"><span class="info-label">Estoque:</span><span class="info-value">${p.estoque || 0} un</span></div>
        <div class="info-row"><span class="info-label">Estoque Mínimo:</span><span class="info-value">${p.estoqueMin || 0} un</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value">${p.ativo ? 'Ativo' : 'Inativo'}</span></div>
        ${p.descricao ? `<div class="info-row"><span class="info-label">Descrição:</span><span class="info-value">${escapeHtml(p.descricao)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
}

// ==================== RENDER PRODUTOS ====================
function renderProdutos() {
    let filtered = produtosCache.filter(p => {
        const search = document.getElementById('searchProduto')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('statusProdutoFilter')?.value || '';
        return (!search || p.nome.toLowerCase().includes(search)) && (!statusFilter || (p.ativo ? 'true' : 'false') === statusFilter);
    });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentProdutoPage > totalPages && totalPages > 0) currentProdutoPage = totalPages;
    const paginated = filtered.slice((currentProdutoPage - 1) * itemsPerPage, currentProdutoPage * itemsPerPage);
    const tbody = document.getElementById('produtosTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum produto</td></tr>';
        document.getElementById('produtosPagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(p => `<tr>
        <td><strong>${escapeHtml(p.nome)}</strong><br><span style="font-size:0.65rem;">${escapeHtml(p.codigoBarras || '')}</span></td>
        <td>${escapeHtml(p.codigoBarras || '-')}</td>
        <td>R$ ${formatCurrency(p.precoVenda || 0)}</span></td>
        <td>${p.estoque || 0} un</span>${(p.estoque || 0) <= (p.estoqueMin || 0) && p.estoqueMin > 0 ? '<br><span style="font-size:0.65rem; color:#e76f51;">⚠️ Mínimo!</span>' : ''}</td>
        <td><span class="status-badge ${p.ativo ? 'status-ativo' : 'status-inativo'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td class="action-buttons">
            <button class="action-btn view" data-id="${p.id}"><i class="fas fa-eye"></i></button>
            <button class="action-btn edit" data-id="${p.id}"><i class="fas fa-edit"></i></button>
            <button class="action-btn delete" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>
        </div>
    </tr>`).join('');
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="page-btn ${i === currentProdutoPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    document.getElementById('produtosPagination').innerHTML = pagHtml;

    document.querySelectorAll('.action-btn.view').forEach(btn => {
        btn.addEventListener('click', () => viewProduto(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => editProduto(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteProduto(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => goToProdutoPage(parseInt(btn.getAttribute('data-page'))));
    });
}

function goToProdutoPage(page) {
    currentProdutoPage = page;
    renderProdutos();
}

// ==================== CATEGORIAS ====================
async function addCategoria(data) {
    if (categoriasCache.some(c => c.nome.toLowerCase() === data.nome.toLowerCase())) { showToast('Categoria já existe!', 'error'); return false; }
    const docRef = await addDoc(collection(db, 'categorias_produtos'), { ...data, empresaId: currentEmpresa.id, criado_em: new Date().toISOString() });
    categoriasCache.push({ id: docRef.id, ...data });
    renderCategorias();
    atualizarSelectCategorias();
    showToast('Categoria criada!', 'success');
}
async function deleteCategoria(id) {
    await deleteDoc(doc(db, 'categorias_produtos', id));
    categoriasCache = categoriasCache.filter(c => c.id !== id);
    renderCategorias();
    atualizarSelectCategorias();
    showToast('Categoria excluída!', 'success');
}
function renderCategorias() {
    const search = document.getElementById('searchCategoria')?.value.toLowerCase() || '';
    let filtered = categoriasCache.filter(c => !search || c.nome.toLowerCase().includes(search));
    const tbody = document.getElementById('categoriasTableBody');
    if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="4">Nenhuma categoria</td></tr>'; return; }
    tbody.innerHTML = filtered.map(c => `<tr>
        <td><strong>${escapeHtml(c.nome)}</strong></td>
        <td>${escapeHtml(c.descricao || '')}</td>
        <td>${produtosCache.filter(p => p.categoriaId === c.id).length} produtos</span></td>
        <td class="action-buttons"><button class="action-btn delete" data-id="${c.id}"><i class="fas fa-trash-alt"></i></button></span>
    </tr>`).join('');
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteCategoria(btn.getAttribute('data-id')));
    });
}
function atualizarSelectCategorias() {
    const select = document.getElementById('prodCategoriaId');
    select.innerHTML = '<option value="">Selecione</option>' + categoriasCache.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
}

// ==================== MOVIMENTOS ESTOQUE ====================
async function addMovimento(produtoId, tipo, quantidade, responsavel, motivo) {
    if (!produtoId || quantidade <= 0) { showToast('Dados inválidos!', 'error'); return false; }
    const prod = produtosCache.find(p => p.id === produtoId);
    if (tipo === 'saida' && (prod.estoque || 0) < quantidade) { showToast(`Estoque insuficiente! Disponível: ${prod.estoque || 0}`, 'error'); return false; }
    let novoEstoque = prod.estoque || 0;
    if (tipo === 'entrada') novoEstoque += quantidade;
    else if (tipo === 'saida') novoEstoque -= quantidade;
    else if (tipo === 'ajuste') novoEstoque = quantidade;
    await updateDoc(doc(db, 'produtos', produtoId), { estoque: novoEstoque });
    const newMov = { produtoId, tipo, quantidade, responsavel, motivo, data: new Date().toISOString(), empresaId: currentEmpresa.id, criado_em: new Date().toISOString(), criado_por: currentUser.uid };
    const docRef = await addDoc(collection(db, 'movimento_estoque'), newMov);
    newMov.id = docRef.id;
    movimentosCache.unshift(newMov);
    renderMovimentos();
    showToast('Movimentação registrada!', 'success');
}
async function deleteMovimento(id) {
    if (confirm('Excluir movimentação?')) { await deleteDoc(doc(db, 'movimento_estoque', id)); movimentosCache = movimentosCache.filter(m => m.id !== id); renderMovimentos(); showToast('Excluído!', 'success'); }
}
async function registrarMovimento() {
    const pid = document.getElementById('movProdutoId').value;
    const tipo = document.getElementById('movTipo').value;
    const qtde = parseInt(document.getElementById('movQtde').value);
    const responsavel = document.getElementById('movResponsavel').value;
    const motivo = document.getElementById('movMotivo').value;
    if (!pid) { showToast('Selecione um produto!', 'error'); return; }
    if (!qtde || qtde <= 0) { showToast('Quantidade inválida!', 'error'); return; }
    await addMovimento(pid, tipo, qtde, responsavel || 'Sistema', motivo || 'Movimentação manual');
    document.getElementById('movQtde').value = '';
    document.getElementById('movMotivo').value = '';
}
function renderMovimentos() {
    let filtered = movimentosCache.filter(m => {
        const search = document.getElementById('searchMovimento')?.value.toLowerCase() || '';
        const tipoFilter = document.getElementById('movTipoFilter')?.value || '';
        const prod = produtosCache.find(p => p.id === m.produtoId);
        return (!search || (prod?.nome || '').toLowerCase().includes(search)) && (!tipoFilter || m.tipo === tipoFilter);
    });
    filtered.sort((a, b) => new Date(b.data) - new Date(a.data));
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentMovimentoPage > totalPages) currentMovimentoPage = 1;
    const paginated = filtered.slice((currentMovimentoPage - 1) * itemsPerPage, currentMovimentoPage * itemsPerPage);
    const tbody = document.getElementById('movimentosTableBody');
    if (paginated.length === 0) { tbody.innerHTML = '<tr><td colspan="7">Nenhuma movimentação</td></tr>'; document.getElementById('movimentosPagination').innerHTML = ''; return; }
    tbody.innerHTML = paginated.map(m => {
        const prod = produtosCache.find(p => p.id === m.produtoId);
        return `<tr>
            <td style="white-space:nowrap;">${new Date(m.data).toLocaleString()}</td>
            <td><strong>${escapeHtml(prod?.nome || '-')}</strong></td>
            <td><span class="type-badge">${m.tipo === 'entrada' ? '📥 Entrada' : m.tipo === 'saida' ? '📤 Saída' : '⚙️ Ajuste'}</span></td>
            <td>${m.quantidade}</td>
            <td>${escapeHtml(m.responsavel || '-')}</td>
            <td style="max-width:200px;">${escapeHtml(m.motivo || '-')}</td>
            <td class="action-buttons"><button class="action-btn delete" data-id="${m.id}"><i class="fas fa-trash-alt"></i></button></span>
        </tr>`;
    }).join('');
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="page-btn ${i === currentMovimentoPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    document.getElementById('movimentosPagination').innerHTML = pagHtml;
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteMovimento(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => goToMovimentoPage(parseInt(btn.getAttribute('data-page'))));
    });
}
function goToMovimentoPage(page) {
    currentMovimentoPage = page;
    renderMovimentos();
}
function atualizarSelectProdutos() {
    const select = document.getElementById('movProdutoId');
    select.innerHTML = '<option value="">Selecione</option>' + produtosCache.filter(p => p.ativo).map(p => `<option value="${p.id}">${escapeHtml(p.nome)} (Estoque: ${p.estoque || 0})</option>`).join('');
}

// ==================== ESTATÍSTICAS ====================
function updateStats() {
    document.getElementById('totalProdutos').innerText = produtosCache.length;
    document.getElementById('totalAtivos').innerText = produtosCache.filter(p => p.ativo).length;
    const baixo = produtosCache.filter(p => (p.estoque || 0) <= (p.estoqueMin || 0) && p.estoqueMin > 0).length;
    document.getElementById('totalEstoqueBaixo').innerText = baixo;
    const valor = produtosCache.reduce((s, p) => s + ((p.precoCusto || p.precoVenda || 0) * (p.estoque || 0)), 0);
    document.getElementById('valorEstoque').innerHTML = `R$ ${formatCurrency(valor)}`;
}

// ==================== EXPORTAÇÃO PDF ====================
async function exportProdutosPDF() {
    if (produtosCache.length === 0) { showToast('Não há produtos para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44, 125, 160); doc.text('Relatório de Produtos', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Total: ${produtosCache.length} produtos`, 14, 46);
        const colunas = [{ label: 'Produto', width: 50 }, { label: 'Código', width: 35 }, { label: 'Preço Venda', width: 35 }, { label: 'Estoque', width: 25 }, { label: 'Status', width: 25 }];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44, 125, 160); doc.setTextColor(255, 255, 255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; });
        doc.setTextColor(0, 0, 0);
        y += 12;
        for (const p of produtosCache) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x + 2, y + 7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0, 0, 0); }
            doc.text((p.nome || '-').substring(0, 30), x + 2, y + 4); x += 50;
            doc.text((p.codigoBarras || '-').substring(0, 20), x + 2, y + 4); x += 35;
            doc.text(`R$ ${formatCurrency(p.precoVenda || 0)}`, x + 2, y + 4); x += 35;
            doc.text(`${p.estoque || 0} un`, x + 2, y + 4); x += 25;
            doc.text(p.ativo ? 'Ativo' : 'Inativo', x + 2, y + 4);
            y += 8; x = 14;
        }
        for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200); }
        doc.save(`produtos_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF gerado!', 'success');
    } catch (e) { showToast('Erro ao gerar PDF!', 'error'); }
}

// ==================== FILTROS ====================
function clearProdutoFilters() {
    document.getElementById('searchProduto').value = '';
    document.getElementById('statusProdutoFilter').value = '';
    currentProdutoPage = 1;
    renderProdutos();
    showToast('Filtros limpos!', 'success');
}
function clearMovimentoFilters() {
    document.getElementById('searchMovimento').value = '';
    document.getElementById('movTipoFilter').value = '';
    currentMovimentoPage = 1;
    renderMovimentos();
    showToast('Filtros limpos!', 'success');
}
function aplicarFiltroStatus(status) {
    document.getElementById('statusProdutoFilter').value = status;
    currentProdutoPage = 1;
    renderProdutos();
}

// ==================== TABS ====================
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
            document.getElementById(`${tab}Panel`).style.display = 'block';
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (tab === 'categorias') renderCategorias();
            if (tab === 'movimentos') renderMovimentos();
        };
    });
}

// ==================== MÁSCARAS ====================
function applyMasks() {
    configurarMascaraValor('prodPrecoVenda');
    document.getElementById('prodPrecoVenda').addEventListener('input', calcularMargem);
    document.getElementById('prodPrecoCusto').addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v === '') e.target.value = '';
        else e.target.value = formatCurrency(parseInt(v) / 100);
        calcularMargem();
    });
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
        renderProdutos();
        renderCategorias();
        renderMovimentos();
        updateStats();
        atualizarSelectCategorias();
        atualizarSelectProdutos();
        applyMasks();
        setupTabs();

        // Eventos
        document.getElementById('saveProdutoBtn').onclick = salvarProduto;
        document.getElementById('cancelProdutoBtn').onclick = resetProdutoForm;
        document.getElementById('saveCategoriaBtn').onclick = async () => {
            const nome = document.getElementById('catNome').value.trim();
            if (!nome) { showToast('Nome obrigatório!', 'error'); return; }
            await addCategoria({ nome, descricao: document.getElementById('catDescricao').value });
            document.getElementById('catNome').value = '';
            document.getElementById('catDescricao').value = '';
        };
        document.getElementById('saveMovimentoBtn').onclick = registrarMovimento;
        document.getElementById('searchProduto').addEventListener('input', () => { currentProdutoPage = 1; renderProdutos(); });
        document.getElementById('statusProdutoFilter').addEventListener('change', () => { currentProdutoPage = 1; renderProdutos(); });
        document.getElementById('clearProdutoFilters').onclick = clearProdutoFilters;
        document.getElementById('clearMovimentoFilters').onclick = clearMovimentoFilters;
        document.getElementById('exportProdutosPdfBtn').onclick = exportProdutosPDF;
        document.getElementById('searchCategoria').addEventListener('input', renderCategorias);
        document.getElementById('searchMovimento').addEventListener('input', () => { currentMovimentoPage = 1; renderMovimentos(); });
        document.getElementById('movTipoFilter').addEventListener('change', () => { currentMovimentoPage = 1; renderMovimentos(); });
        document.getElementById('logoutBtn').onclick = () => auth.signOut();
        document.getElementById('modalCloseBtn').onclick = () => document.getElementById('viewModal').style.display = 'none';
        window.onclick = (e) => { if (e.target === document.getElementById('viewModal')) document.getElementById('viewModal').style.display = 'none'; };
        window.solicitarLiberacao = () => {
            window.open('mailto:jcnvap@gmail.com?subject=Liberação - ' + encodeURIComponent(currentEmpresa?.emp_razao_social || 'Empresa'), '_blank');
            showToast('Abrindo e-mail...', 'info');
        };
        document.querySelectorAll('.stat-card[data-filter-status]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.getAttribute('data-filter-status');
                aplicarFiltroStatus(status);
            });
        });
        document.querySelector('.stat-card[data-page="movimentos.html"]')?.addEventListener('click', () => {
            window.location.href = 'movimentos.html';
        });
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('conteudoPrincipal').style.display = 'block';
    } else {
        window.location.href = 'login.html';
    }
});