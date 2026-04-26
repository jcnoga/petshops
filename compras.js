// ==================== IMPORTAÇÕES ====================
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    escapeHtml, showToast, formatCurrency, parseCurrency,
    carregarEmpresaUsuario, verificarStatusEmpresa, configurarMascaraValor
} from './util.js';

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = null;
let currentEmpresa = null;
let editingId = null;
let currentPage = 1;
let itemsPerPage = 10;
let comprasCache = [];
let fornecedoresCache = [];
let produtosCache = [];

// Elementos DOM
const comFornecedorId = document.getElementById('comFornecedorId');
const comProdutoId = document.getElementById('comProdutoId');
const comQuantidade = document.getElementById('comQuantidade');
const comPrecoUnitario = document.getElementById('comPrecoUnitario');
const comTotal = document.getElementById('comTotal');
const comData = document.getElementById('comData');
const comStatusPagamento = document.getElementById('comStatusPagamento');
const comObs = document.getElementById('comObs');

// ==================== FUNÇÕES AUXILIARES ====================
function calcularTotal() {
    const qtd = parseFloat(comQuantidade.value) || 0;
    const preco = parseCurrency(comPrecoUnitario.value);
    const total = qtd * preco;
    comTotal.value = formatCurrency(total);
    return total;
}
comQuantidade.addEventListener('input', calcularTotal);
comPrecoUnitario.addEventListener('input', calcularTotal);

async function carregarFornecedores() {
    if (!currentEmpresa) return;
    const q = query(collection(db, 'fornecedores'), where('empresaId', '==', currentEmpresa.id), where('deleted', '==', false));
    const snap = await getDocs(q);
    fornecedoresCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    comFornecedorId.innerHTML = '<option value="">Selecione</option>' + fornecedoresCache.map(f => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('');
}
async function carregarProdutos() {
    if (!currentEmpresa) return;
    const q = query(collection(db, 'produtos'), where('empresaId', '==', currentEmpresa.id), where('ativo', '==', true));
    const snap = await getDocs(q);
    produtosCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    comProdutoId.innerHTML = '<option value="">Selecione</option>' + produtosCache.map(p => `<option value="${p.id}">${escapeHtml(p.nome)} (Estoque: ${p.estoque || 0})</option>`).join('');
}

function limparForm() {
    comFornecedorId.value = '';
    comProdutoId.value = '';
    comQuantidade.value = '1';
    comPrecoUnitario.value = '';
    comTotal.value = '';
    comData.value = new Date().toISOString().split('T')[0];
    comStatusPagamento.value = 'pago';
    comObs.value = '';
    editingId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const saveBtn = document.getElementById('saveCompraBtn');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Compra';
    saveBtn.classList.remove('btn-success');
    saveBtn.classList.add('btn-primary');
}
function preencherForm(compra) {
    comFornecedorId.value = compra.fornecedorId || '';
    comProdutoId.value = compra.produtoId || '';
    comQuantidade.value = compra.quantidade || 1;
    comPrecoUnitario.value = formatCurrency(compra.precoUnitario || 0);
    calcularTotal();
    comData.value = compra.data || new Date().toISOString().split('T')[0];
    comStatusPagamento.value = compra.statusPagamento || 'pago';
    comObs.value = compra.obs || '';
    editingId = compra.id;
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    const saveBtn = document.getElementById('saveCompraBtn');
    saveBtn.innerHTML = '<i class="fas fa-pen"></i> Atualizar';
    saveBtn.classList.remove('btn-primary');
    saveBtn.classList.add('btn-success');
}

// ==================== CRUD COMPRAS (com transação para estoque e financeiro) ====================
async function salvarCompra() {
    if (!comFornecedorId.value) { showToast('Selecione o fornecedor!', 'error'); return; }
    if (!comProdutoId.value) { showToast('Selecione o produto!', 'error'); return; }
    const quantidade = parseInt(comQuantidade.value);
    if (isNaN(quantidade) || quantidade <= 0) { showToast('Quantidade inválida!', 'error'); return; }
    const precoUnitario = parseCurrency(comPrecoUnitario.value);
    if (precoUnitario <= 0) { showToast('Preço unitário inválido!', 'error'); return; }
    const total = quantidade * precoUnitario;
    const dataCompra = comData.value || new Date().toISOString().split('T')[0];
    const statusPagamento = comStatusPagamento.value;
    const obs = comObs.value;
    const produto = produtosCache.find(p => p.id === comProdutoId.value);
    if (!produto) { showToast('Produto não encontrado!', 'error'); return; }
    const fornecedor = fornecedoresCache.find(f => f.id === comFornecedorId.value);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Se for edição, reverter estoque antigo
            if (editingId) {
                const oldCompra = comprasCache.find(c => c.id === editingId);
                if (oldCompra) {
                    const oldProdutoRef = doc(db, 'produtos', oldCompra.produtoId);
                    const oldProdutoSnap = await transaction.get(oldProdutoRef);
                    if (oldProdutoSnap.exists()) {
                        const oldEstoque = oldProdutoSnap.data().estoque || 0;
                        transaction.update(oldProdutoRef, { estoque: oldEstoque - oldCompra.quantidade });
                    }
                    // Remover lançamento financeiro antigo (se existir)
                    if (oldCompra.financeiroId) {
                        const oldFinRef = doc(db, 'financeiro', oldCompra.financeiroId);
                        transaction.delete(oldFinRef);
                    }
                }
            }
            // 2. Atualizar estoque do produto (adicionar quantidade)
            const produtoRef = doc(db, 'produtos', comProdutoId.value);
            const produtoSnap = await transaction.get(produtoRef);
            if (!produtoSnap.exists()) throw new Error('Produto não existe');
            const novoEstoque = (produtoSnap.data().estoque || 0) + quantidade;
            transaction.update(produtoRef, { estoque: novoEstoque });
            // 3. Criar lançamento financeiro (saída do tipo "compras")
            const financeiroData = {
                tipo: 'saida',
                categoria: 'compras',
                valor: total,
                formaPagamento: 'transferencia',
                dataVencimento: dataCompra,
                dataPagamento: statusPagamento === 'pago' ? dataCompra : null,
                status: statusPagamento,
                clienteFornecedor: fornecedor ? fornecedor.nome : '',
                descricao: `Compra de ${quantidade}x ${produto.nome}`,
                obs: obs,
                empresaId: currentEmpresa.id,
                criado_em: new Date().toISOString(),
                criado_por: currentUser.uid
            };
            const financeiroRef = await addDoc(collection(db, 'financeiro'), financeiroData);
            // 4. Salvar compra
            const compraData = {
                fornecedorId: comFornecedorId.value,
                fornecedorNome: fornecedor ? fornecedor.nome : '',
                produtoId: comProdutoId.value,
                produtoNome: produto.nome,
                quantidade: quantidade,
                precoUnitario: precoUnitario,
                total: total,
                data: dataCompra,
                statusPagamento: statusPagamento,
                obs: obs,
                financeiroId: financeiroRef.id,
                empresaId: currentEmpresa.id,
                updatedAt: new Date().toISOString()
            };
            if (!editingId) {
                compraData.createdAt = new Date().toISOString();
                const docRef = await addDoc(collection(db, 'compras'), compraData);
                compraData.id = docRef.id;
                comprasCache.unshift(compraData);
                showToast('Compra registrada com sucesso!', 'success');
            } else {
                await updateDoc(doc(db, 'compras', editingId), compraData);
                const index = comprasCache.findIndex(c => c.id === editingId);
                if (index !== -1) comprasCache[index] = { ...comprasCache[index], ...compraData };
                showToast('Compra atualizada!', 'success');
            }
        });
        await carregarProdutos(); // recarregar produtos para atualizar estoque no select
        limparForm();
        renderCompras();
        atualizarStats();
    } catch (error) {
        console.error('Erro ao salvar compra:', error);
        showToast('Erro ao processar compra: ' + error.message, 'error');
    }
}

async function carregarCompras() {
    if (!currentEmpresa) return;
    const q = query(collection(db, 'compras'), where('empresaId', '==', currentEmpresa.id));
    const snap = await getDocs(q);
    comprasCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCompras();
    atualizarStats();
}
async function moverParaLixeira(id) {
    if (confirm('Mover compra para lixeira? O estoque será revertido e o lançamento financeiro removido.')) {
        const compra = comprasCache.find(c => c.id === id);
        if (!compra) return;
        try {
            await runTransaction(db, async (transaction) => {
                // Reverter estoque
                const produtoRef = doc(db, 'produtos', compra.produtoId);
                const produtoSnap = await transaction.get(produtoRef);
                if (produtoSnap.exists()) {
                    const novoEstoque = (produtoSnap.data().estoque || 0) - compra.quantidade;
                    transaction.update(produtoRef, { estoque: Math.max(0, novoEstoque) });
                }
                // Remover lançamento financeiro
                if (compra.financeiroId) {
                    const finRef = doc(db, 'financeiro', compra.financeiroId);
                    transaction.delete(finRef);
                }
                // Marcar compra como deletada (soft delete)
                transaction.update(doc(db, 'compras', id), { deleted: true });
            });
            const index = comprasCache.findIndex(c => c.id === id);
            if (index !== -1) comprasCache[index].deleted = true;
            renderCompras();
            atualizarStats();
            await carregarProdutos();
            showToast('Compra movida para lixeira e estoque revertido!', 'info');
        } catch (error) {
            showToast('Erro ao mover para lixeira: ' + error.message, 'error');
        }
    }
}
async function restaurarCompra(id) {
    const compra = comprasCache.find(c => c.id === id);
    if (!compra) return;
    try {
        await runTransaction(db, async (transaction) => {
            // Restaurar estoque
            const produtoRef = doc(db, 'produtos', compra.produtoId);
            const produtoSnap = await transaction.get(produtoRef);
            if (produtoSnap.exists()) {
                const novoEstoque = (produtoSnap.data().estoque || 0) + compra.quantidade;
                transaction.update(produtoRef, { estoque: novoEstoque });
            }
            // Recriar lançamento financeiro
            const fornecedor = fornecedoresCache.find(f => f.id === compra.fornecedorId);
            const financeiroData = {
                tipo: 'saida',
                categoria: 'compras',
                valor: compra.total,
                formaPagamento: 'transferencia',
                dataVencimento: compra.data,
                dataPagamento: compra.statusPagamento === 'pago' ? compra.data : null,
                status: compra.statusPagamento,
                clienteFornecedor: fornecedor ? fornecedor.nome : compra.fornecedorNome,
                descricao: `Compra de ${compra.quantidade}x ${compra.produtoNome}`,
                obs: compra.obs,
                empresaId: currentEmpresa.id,
                criado_em: new Date().toISOString(),
                criado_por: currentUser.uid
            };
            const financeiroRef = await addDoc(collection(db, 'financeiro'), financeiroData);
            transaction.update(doc(db, 'compras', id), { deleted: false, financeiroId: financeiroRef.id });
        });
        const index = comprasCache.findIndex(c => c.id === id);
        if (index !== -1) comprasCache[index].deleted = false;
        renderCompras();
        atualizarStats();
        await carregarProdutos();
        showToast('Compra restaurada!', 'success');
    } catch (error) {
        showToast('Erro ao restaurar: ' + error.message, 'error');
    }
}
async function excluirPermanente(id) {
    if (confirm('ATENÇÃO: Excluir permanentemente esta compra? O estoque e finanças NÃO serão revertidos automaticamente. Deseja continuar?')) {
        await deleteDoc(doc(db, 'compras', id));
        comprasCache = comprasCache.filter(c => c.id !== id);
        renderCompras();
        atualizarStats();
        showToast('Compra excluída permanentemente!', 'success');
    }
}

// ==================== RENDERIZAÇÃO ====================
function renderCompras() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    let filtered = comprasCache.filter(c => {
        if (statusVal === 'deleted') return c.deleted === true;
        if (statusVal) return c.statusPagamento === statusVal && !c.deleted;
        return !c.deleted;
    });
    if (searchTerm) {
        filtered = filtered.filter(c => 
            (c.fornecedorNome || '').toLowerCase().includes(searchTerm) ||
            (c.produtoNome || '').toLowerCase().includes(searchTerm)
        );
    }
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    const start = (currentPage-1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);
    const tbody = document.getElementById('comprasTableBody');
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhuma compra encontrada</td></tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = paginated.map(c => {
        const statusClass = c.deleted ? 'status-deleted' : (c.statusPagamento === 'pago' ? 'status-pago' : 'status-pendente');
        const statusLabel = c.deleted ? 'Lixeira' : (c.statusPagamento === 'pago' ? 'Pago' : 'Pendente');
        return `
        <tr>
            <td><strong>${escapeHtml(c.fornecedorNome || '-')}</strong></td>
            <td>${escapeHtml(c.produtoNome || '-')}</td>
            <td>${c.quantidade}</td>
            <td>${formatCurrency(c.precoUnitario)}</td>
            <td>${formatCurrency(c.total)}</td>
            <td>${c.data || '-'}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verDetalhes('${c.id}')"><i class="fas fa-eye"></i></button>
                ${!c.deleted ? `<button class="action-btn edit" onclick="editarCompra('${c.id}')"><i class="fas fa-edit"></i></button>` : ''}
                ${!c.deleted ? `<button class="action-btn delete" onclick="moverParaLixeira('${c.id}')"><i class="fas fa-trash-alt"></i></button>` : ''}
                ${c.deleted ? `<button class="action-btn restore" onclick="restaurarCompra('${c.id}')"><i class="fas fa-trash-restore"></i></button>` : ''}
                ${c.deleted ? `<button class="action-btn delete" onclick="excluirPermanente('${c.id}')"><i class="fas fa-times-circle"></i></button>` : ''}
            </td>
        </td>`;
    }).join('');
    let pagHtml = `<button class="page-btn" onclick="mudarPagina(1)" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    for (let i=1; i<=totalPages; i++) {
        pagHtml += `<button class="page-btn ${i===currentPage?'active':''}" onclick="mudarPagina(${i})">${i}</button>`;
    }
    pagHtml += `<button class="page-btn" onclick="mudarPagina(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    document.getElementById('pagination').innerHTML = pagHtml;
}
function mudarPagina(page) { currentPage = page; renderCompras(); }
function atualizarStats() {
    const ativas = comprasCache.filter(c => !c.deleted);
    const totalValor = ativas.reduce((sum, c) => sum + (c.total || 0), 0);
    const totalPago = ativas.filter(c => c.statusPagamento === 'pago').reduce((sum, c) => sum + (c.total || 0), 0);
    const totalPendente = ativas.filter(c => c.statusPagamento === 'pendente').reduce((sum, c) => sum + (c.total || 0), 0);
    document.getElementById('totalCompras').innerHTML = formatCurrency(totalValor);
    document.getElementById('totalPago').innerHTML = formatCurrency(totalPago);
    document.getElementById('totalPendente').innerHTML = formatCurrency(totalPendente);
    document.getElementById('numCompras').innerText = ativas.length;
}
window.verDetalhes = function(id) {
    const c = comprasCache.find(c => c.id === id);
    if (!c) return;
    document.getElementById('modalBody').innerHTML = `
        <div class="info-row"><span class="info-label">Fornecedor:</span><span class="info-value">${escapeHtml(c.fornecedorNome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Produto:</span><span class="info-value">${escapeHtml(c.produtoNome || '-')}</span></div>
        <div class="info-row"><span class="info-label">Quantidade:</span><span class="info-value">${c.quantidade}</span></div>
        <div class="info-row"><span class="info-label">Preço Unitário:</span><span class="info-value">${formatCurrency(c.precoUnitario)}</span></div>
        <div class="info-row"><span class="info-label">Total:</span><span class="info-value">${formatCurrency(c.total)}</span></div>
        <div class="info-row"><span class="info-label">Data:</span><span class="info-value">${c.data || '-'}</span></div>
        <div class="info-row"><span class="info-label">Status Pagamento:</span><span class="info-value">${c.statusPagamento === 'pago' ? 'Pago' : 'Pendente'}</span></div>
        ${c.obs ? `<div class="info-row"><span class="info-label">Observações:</span><span class="info-value">${escapeHtml(c.obs)}</span></div>` : ''}
    `;
    document.getElementById('viewModal').style.display = 'flex';
};
window.editarCompra = function(id) {
    const c = comprasCache.find(c => c.id === id);
    if (c && !c.deleted) preencherForm(c);
    else showToast('Não é possível editar uma compra na lixeira.', 'error');
};
window.moverParaLixeira = moverParaLixeira;
window.restaurarCompra = restaurarCompra;
window.excluirPermanente = excluirPermanente;

// ==================== FILTROS ====================
document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderCompras(); });
document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; renderCompras(); });
document.getElementById('clearFiltersBtn').onclick = () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    currentPage = 1;
    renderCompras();
};

// ==================== EXPORTAR PDF ====================
async function exportarPDF() {
    const ativas = comprasCache.filter(c => !c.deleted);
    if (ativas.length === 0) { showToast('Nenhuma compra para exportar!', 'error'); return; }
    showToast('Gerando PDF...', 'info');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(20); doc.setTextColor(44,125,160); doc.text('Relatório de Compras', 14, 20);
        doc.setFontSize(10); doc.text(`Empresa: ${currentEmpresa?.emp_razao_social || 'Empresa'}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 38);
        doc.text(`Total de compras: ${ativas.length} | Valor total: ${formatCurrency(ativas.reduce((s,c)=>s+(c.total||0),0))}`, 14, 46);
        const colunas = [
            { label: 'Fornecedor', width: 40 },
            { label: 'Produto', width: 50 },
            { label: 'Qtd', width: 15 },
            { label: 'Unitário', width: 25 },
            { label: 'Total', width: 30 },
            { label: 'Data', width: 25 },
            { label: 'Status', width: 25 }
        ];
        let y = 55;
        doc.setFontSize(9); doc.setFillColor(44,125,160); doc.setTextColor(255,255,255);
        let x = 14;
        colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; });
        doc.setTextColor(0,0,0); y += 12;
        for (const c of ativas) {
            if (y > 190) { doc.addPage(); y = 30; x = 14; colunas.forEach(col => { doc.rect(x, y, col.width, 10, 'F'); doc.text(col.label, x+2, y+7); x += col.width; }); y += 12; x = 14; doc.setTextColor(0,0,0); }
            doc.text((c.fornecedorNome || '-').substring(0,25), x+2, y+4); x += 40;
            doc.text((c.produtoNome || '-').substring(0,30), x+2, y+4); x += 50;
            doc.text(String(c.quantidade), x+2, y+4); x += 15;
            doc.text(formatCurrency(c.precoUnitario), x+2, y+4); x += 25;
            doc.text(formatCurrency(c.total), x+2, y+4); x += 30;
            doc.text(c.data || '-', x+2, y+4); x += 25;
            doc.text(c.statusPagamento === 'pago' ? 'Pago' : 'Pendente', x+2, y+4);
            y += 8; x = 14;
        }
        for (let i=1; i<=doc.internal.getNumberOfPages(); i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150); doc.text(`Página ${i} de ${doc.internal.getNumberOfPages()}`, 14, 200); }
        doc.save(`compras_${new Date().toISOString().split('T')[0]}.pdf`);
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
        await carregarProdutos();
        await carregarCompras();
        configurarMascaraValor('comPrecoUnitario');
        comData.value = new Date().toISOString().split('T')[0];
    } else {
        window.location.href = 'login.html';
    }
});

// ==================== EVENTOS GLOBAIS ====================
document.getElementById('saveCompraBtn').onclick = salvarCompra;
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