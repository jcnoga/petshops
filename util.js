// ==================== util.js ====================
// Funções utilitárias compartilhadas entre todos os módulos do PerShop

import { auth, db } from './firebase-config.js';
import { doc, getDoc, updateDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const DIAS_TESTE = 15;

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

export function verificarStatusEmpresa(empresa) {
    if (!empresa) return { status: 'nao_cadastrada', statusText: '-', diasRestantes: 0 };
    if (empresa.emp_status === 'ativo') return { status: 'ativo', statusText: 'Ativo', diasRestantes: null };
    if (empresa.emp_status === 'suspenso') return { status: 'suspenso', statusText: 'Suspenso', diasRestantes: null };
    const dias = calcularDiasRestantes(empresa.emp_data_expiracao);
    if (dias <= 0) return { status: 'expirado', statusText: 'Expirado', diasRestantes: 0 };
    if (dias <= 3) return { status: 'trial_urgente', statusText: 'Expira em breve', diasRestantes: dias };
    return { status: 'trial', statusText: 'Em teste', diasRestantes: dias };
}

export async function carregarEmpresaUsuario(user) {
    if (!user) return null;
    try {
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        if (!userDoc.exists()) {
            console.error('Perfil de usuário não encontrado no Firestore.');
            showToast('Perfil não encontrado!', 'error');
            await auth.signOut();
            return null;
        }
        const userData = userDoc.data();
        let empresaId = userData.empresaId;

        if (!empresaId && userData.empresaAtiva) {
            empresaId = userData.empresaAtiva;
            await updateDoc(doc(db, 'usuarios', user.uid), { empresaId: empresaId });
            console.log('Migrado empresaId de empresaAtiva para', empresaId);
        }

        if (!empresaId) {
            console.log('Usuário sem empresa associada. Criando empresa padrão...');
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
            console.log('Empresa criada com ID:', empresaId);
        }

        const empresaDoc = await getDoc(doc(db, 'empresas', empresaId));
        if (!empresaDoc.exists()) {
            console.error('Empresa não encontrada no Firestore para o ID:', empresaId);
            showToast('Empresa não encontrada!', 'error');
            return null;
        }
        const empresa = { id: empresaDoc.id, ...empresaDoc.data() };
        sessionStorage.setItem('empresa_atual', JSON.stringify(empresa));
        return empresa;
    } catch (error) {
        console.error('Erro em carregarEmpresaUsuario:', error);
        showToast('Erro ao carregar dados da empresa.', 'error');
        return null;
    }
}

export async function verificarAcessoAdmin(user) {
    if (!user) return false;
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (!userDoc.exists()) return false;
    return userDoc.data().perfil === 'admin';
}

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