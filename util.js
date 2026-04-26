import { auth, db } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ========== TOAST ==========
export function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ========== FORMATAÇÃO ==========
export function formatCurrency(value) {
    if (isNaN(value)) value = 0;
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseCurrency(str) {
    if (!str) return 0;
    let cleaned = str.replace(/[^\d,.-]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

export function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

export function configurarMascaraValor(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value === '') return;
        value = (parseInt(value) / 100).toFixed(2);
        e.target.value = `R$ ${value.replace('.', ',')}`;
    });
}

// ========== GERENCIAMENTO DE EMPRESA ==========
export async function carregarEmpresaUsuario(user) {
    try {
        // Buscar empresa vinculada ao usuário
        const q = query(collection(db, 'empresas'), where('usuarioId', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const doc = snap.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        // Se não existir, criar automaticamente
        const novaEmpresa = {
            usuarioId: user.uid,
            emp_razao_social: "Minha Empresa",
            emp_nome_fantasia: "Meu Petshop",
            emp_cnpj: "00.000.000/0001-00",
            emp_telefone: "(11) 99999-9999",
            emp_email: user.email,
            plano: "trial",
            trial_expiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // 1 ano
            createdAt: new Date()
        };
        const docRef = await addDoc(collection(db, 'empresas'), novaEmpresa);
        console.log("Empresa criada automaticamente com ID:", docRef.id);
        return { id: docRef.id, ...novaEmpresa };
    } catch (error) {
        console.error("Erro ao carregar/criar empresa:", error);
        // Fallback para testes (não recomendado em produção)
        return {
            id: "empresa_teste",
            emp_razao_social: "Petshop Teste",
            emp_nome_fantasia: "Teste",
            plano: "ativo"
        };
    }
}

export function verificarStatusEmpresa(empresa) {
    if (!empresa) return { status: 'desconhecido' };
    if (empresa.plano === 'ativo') return { status: 'ativo' };
    if (empresa.trial_expiry) {
        const hoje = new Date();
        const expiry = empresa.trial_expiry.toDate ? empresa.trial_expiry.toDate() : new Date(empresa.trial_expiry);
        const dias = Math.ceil((expiry - hoje) / (1000*60*60*24));
        if (dias <= 0) return { status: 'expirado' };
        if (dias <= 3) return { status: 'trial_urgente', diasRestantes: dias };
        return { status: 'trial', diasRestantes: dias };
    }
    return { status: 'ativo' };
}