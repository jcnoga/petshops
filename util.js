// ==================== util.js (REFATORADO FINAL - COM TRATAMENTO SEGURO) ====================
import { auth, db } from './firebase-config.js';
import { doc, getDoc, updateDoc, addDoc, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const DIAS_TESTE = 15;

// ---------- Formatação e segurança ----------
export function escapeHtml(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

export function formatCurrency(valor) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(valor || 0);
}

export function parseCurrency(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;
    const num = valor.toString().replace(/\./g, '').replace(',', '.');
    return parseFloat(num) || 0;
}

export function formatarData(dataStr, padrao = 'pt-BR') {
    if (!dataStr) return '-';
    return new Date(dataStr).toLocaleDateString(padrao);
}

export function formatarDataHora(dataStr) {
    if (!dataStr) return '-';
    return new Date(dataStr).toLocaleString('pt-BR');
}

export function validarEmail(email) {
    if (!email) return true;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

export function validarTelefone(telefone) {
    if (!telefone) return true;
    const regex = /^\([0-9]{2}\) [0-9]{4,5}-[0-9]{4}$/;
    return regex.test(telefone);
}

export function aplicarMascaraTelefone(valor) {
    let v = valor.replace(/\D/g, '');
    if (v.length === 0) return '';
    if (v.length <= 10) {
        v = v.replace(/^(\d{2})(\d)/, '($1) $2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
    } else {
        v = v.replace(/^(\d{2})(\d)/, '($1) $2');
        v = v.replace(/(\d{5})(\d)/, '$1-$2');
    }
    return v;
}

export function aplicarMascaraCNPJ(valor) {
    let v = valor.replace(/\D/g, '');
    if (v.length === 0) return '';
    if (v.length <= 2) return v;
    if (v.length <= 5) return v.replace(/^(\d{2})(\d{1,3})/, '$1.$2');
    if (v.length <= 8) return v.replace(/^(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (v.length <= 12) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
    return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
}

export function aplicarMascaraCEP(valor) {
    let v = valor.replace(/\D/g, '');
    if (v.length === 0) return '';
    if (v.length === 8) return v.replace(/^(\d{5})(\d{3})/, '$1-$2');
    return v;
}

export function showToast(mensagem, tipo = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

export function calcularDiasRestantes(dataExpiracao) {
    if (!dataExpiracao) return DIAS_TESTE;
    const diff = new Date(dataExpiracao) - new Date();
    const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return dias > 0 ? dias : 0;
}

// CORREÇÃO CRÍTICA: trata empresa nula/indefinida
export function verificarStatusEmpresa(empresa) {
    if (!empresa) {
        return { status: 'nao_cadastrada', statusText: 'Empresa não cadastrada', diasRestantes: 0 };
    }
    if (empresa.emp_status === 'ativo') {
        return { status: 'ativo', statusText: 'Ativo', diasRestantes: null };
    }
    if (empresa.emp_status === 'suspenso') {
        return { status: 'suspenso', statusText: 'Suspenso', diasRestantes: null };
    }
    const dias = calcularDiasRestantes(empresa.emp_data_expiracao);
    if (dias <= 0) {
        return { status: 'expirado', statusText: 'Expirado', diasRestantes: 0 };
    }
    if (dias <= 3) {
        return { status: 'trial_urgente', statusText: 'Expira em breve', diasRestantes: dias };
    }
    return { status: 'trial', statusText: 'Em teste', diasRestantes: dias };
}

// ---------- Superadmin – SOMENTE via Firestore (sem e-mail hardcoded) ----------
export async function verificarSuperAdmin(user) {
    if (!user) return false;
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    return userDoc.exists() && userDoc.data().globalAdmin === true;
}

// ---------- Admin com suporte a superadmin ----------
export async function verificarAcessoAdmin(user) {
    if (!user) return false;
    if (await verificarSuperAdmin(user)) return true;
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (!userDoc.exists()) return false;
    return userDoc.data().perfil === 'admin';
}

// Carregar empresa do usuário – superadmin recebe objeto especial
export async function carregarEmpresaUsuario(user) {
    if (!user) return null;
    const isSuper = await verificarSuperAdmin(user);
    if (isSuper) {
        return { id: 'SUPER_ADMIN', globalAdmin: true, nome: 'Super Administrador' };
    }
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (!userDoc.exists()) {
        showToast('Perfil não encontrado!', 'error');
        await auth.signOut();
        return null;
    }
    const userData = userDoc.data();
    let empresaId = userData.empresaId;
    if (!empresaId && userData.empresaAtiva) {
        empresaId = userData.empresaAtiva;
        await updateDoc(doc(db, 'usuarios', user.uid), { empresaId: empresaId });
    }
    if (!empresaId) {
        const novaEmpresa = {
            emp_razao_social: `${userData.nome || user.email.split('@')[0]} PetShop`,
            emp_nome_fantasia: userData.nome || 'Meu PetShop',
            emp_cnpj: '',
            emp_whatsapp: '',
            emp_status: 'ativo',
            emp_data_expiracao: new Date(Date.now() + 365 * 86400000).toISOString(),
            emp_criado_em: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'empresas'), novaEmpresa);
        empresaId = docRef.id;
        await updateDoc(doc(db, 'usuarios', user.uid), { empresaId: empresaId });
    }
    const empresaDoc = await getDoc(doc(db, 'empresas', empresaId));
    if (!empresaDoc.exists()) return null;
    return { id: empresaDoc.id, ...empresaDoc.data() };
}

// Auxiliar para queries respeitando superadmin
export function getQueryConstraints(currentEmpresa, extraFilters = []) {
    if (currentEmpresa && currentEmpresa.globalAdmin) return extraFilters;
    return [where('empresaId', '==', currentEmpresa.id), ...extraFilters];
}

// Máscara para campos de valor monetário
export function configurarMascaraValor(idCampo) {
    const campo = document.getElementById(idCampo);
    if (!campo) return;
    campo.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v === '') {
            e.target.value = '';
            return;
        }
        e.target.value = formatCurrency(parseInt(v) / 100);
    });
}