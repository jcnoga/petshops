// ==================== util.js (REFATORADO - SEM HARDCODED) ====================
import { auth, db } from './firebase-config.js';
import { doc, getDoc, updateDoc, addDoc, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const DIAS_TESTE = 15;
// CONSTANTE REMOVIDA: export const SUPER_ADMIN_EMAIL = 'jcnvap@gmail.com';

// ---------- Formatação e segurança (mantido igual) ----------
export function escapeHtml(texto) { /* ... */ }
export function formatCurrency(valor) { /* ... */ }
export function parseCurrency(valor) { /* ... */ }
export function formatarData(dataStr, padrao = 'pt-BR') { /* ... */ }
export function formatarDataHora(dataStr) { /* ... */ }
export function validarEmail(email) { /* ... */ }
export function validarTelefone(telefone) { /* ... */ }
export function aplicarMascaraTelefone(valor) { /* ... */ }
export function aplicarMascaraCNPJ(valor) { /* ... */ }
export function aplicarMascaraCEP(valor) { /* ... */ }
export function showToast(mensagem, tipo = 'success') { /* ... */ }
export function calcularDiasRestantes(dataExpiracao) { /* ... */ }
export function verificarStatusEmpresa(empresa) { /* ... */ }

// ---------- Superadmin – agora APENAS pelo Firestore ----------
export async function verificarSuperAdmin(user) {
    if (!user) return false;
    // Removeu a comparação de e-mail. Agora lê exclusivamente do documento.
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    return userDoc.exists() && userDoc.data().globalAdmin === true;
}

// ---------- Admin com suporte a SUPERADMIN ----------
export async function verificarAcessoAdmin(user) {
    if (!user) return false;
    if (await verificarSuperAdmin(user)) return true;
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (!userDoc.exists()) return false;
    return userDoc.data().perfil === 'admin';
}

// Carregar empresa do usuário – para superadmin retorna objeto especial
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

// Função auxiliar para montar query respeitando superadmin
export function getQueryConstraints(currentEmpresa, extraFilters = []) {
    if (currentEmpresa && currentEmpresa.globalAdmin) return extraFilters;
    return [where('empresaId', '==', currentEmpresa.id), ...extraFilters];
}

export function configurarMascaraValor(idCampo) { /* ... */ }