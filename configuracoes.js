// ==================== IMPORTAÇÕES ====================
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    showToast, formatCurrency, carregarEmpresaUsuario, verificarStatusEmpresa 
} from './util.js';

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = null;
let currentEmpresa = null;
let empresaDocId = null;

// Elementos DOM - Empresa
const empRazaoSocial = document.getElementById('empRazaoSocial');
const empNomeFantasia = document.getElementById('empNomeFantasia');
const empCnpj = document.getElementById('empCnpj');
const empTelefone = document.getElementById('empTelefone');
const empEmail = document.getElementById('empEmail');
const empWhatsapp = document.getElementById('empWhatsapp');
const empEndereco = document.getElementById('empEndereco');
const empCidade = document.getElementById('empCidade');
const empLogoUrl = document.getElementById('empLogoUrl');

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
    empCnpj.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 14) val = val.slice(0,14);
        e.target.value = formatarDocumento(val);
    });
    empTelefone.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.slice(0,11);
        e.target.value = formatarTelefone(val);
    });
    empWhatsapp.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.slice(0,11);
        e.target.value = formatarTelefone(val);
    });
}

// ==================== CARREGAR DADOS DA EMPRESA ====================
async function carregarDadosEmpresa() {
    if (!currentEmpresa || !empresaDocId) return;
    try {
        const docRef = doc(db, 'empresas', empresaDocId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            empRazaoSocial.value = data.emp_razao_social || '';
            empNomeFantasia.value = data.emp_nome_fantasia || '';
            empCnpj.value = data.emp_cnpj || '';
            empTelefone.value = data.emp_telefone || '';
            empEmail.value = data.emp_email || '';
            empWhatsapp.value = data.emp_whatsapp || '';
            empEndereco.value = data.emp_endereco || '';
            empCidade.value = data.emp_cidade || '';
            empLogoUrl.value = data.emp_logo_url || '';
            
            // Exibir informações do plano
            const plano = data.plano || 'trial';
            const trialExpiry = data.trial_expiry ? data.trial_expiry.toDate() : null;
            const hoje = new Date();
            let diasRestantes = 0;
            let statusTexto = '';
            if (trialExpiry) {
                const diffTime = trialExpiry - hoje;
                diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diasRestantes <= 0) statusTexto = 'Expirado';
                else if (diasRestantes <= 3) statusTexto = 'Urgente';
                else statusTexto = 'Ativo';
            } else {
                statusTexto = 'Ativo';
                diasRestantes = 999;
            }
            document.getElementById('planoAtual').innerText = plano === 'trial' ? 'Trial (30 dias)' : 'Liberado';
            document.getElementById('dataExpiracao').innerText = trialExpiry ? trialExpiry.toLocaleDateString('pt-BR') : 'Ilimitado';
            document.getElementById('diasRestantes').innerText = diasRestantes > 0 ? diasRestantes : 0;
            document.getElementById('statusPlano').innerHTML = statusTexto === 'Expirado' ? '<span style="color:#e76f51">Expirado</span>' : (statusTexto === 'Urgente' ? '<span style="color:#e9c46a">Perto de expirar</span>' : '<span style="color:#2a9d8f">Ativo</span>');
            
            // Atualizar alerta trial
            const statusInfo = verificarStatusEmpresa(data);
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
        }
    } catch (error) {
        console.error('Erro ao carregar empresa:', error);
        showToast('Erro ao carregar dados da empresa', 'error');
    }
}

// ==================== SALVAR DADOS DA EMPRESA ====================
async function salvarEmpresa() {
    if (!empresaDocId) return;
    const dados = {
        emp_razao_social: empRazaoSocial.value.trim(),
        emp_nome_fantasia: empNomeFantasia.value.trim(),
        emp_cnpj: empCnpj.value.trim(),
        emp_telefone: empTelefone.value.trim(),
        emp_email: empEmail.value.trim(),
        emp_whatsapp: empWhatsapp.value.trim(),
        emp_endereco: empEndereco.value.trim(),
        emp_cidade: empCidade.value.trim(),
        emp_logo_url: empLogoUrl.value.trim(),
        updatedAt: new Date().toISOString()
    };
    try {
        await updateDoc(doc(db, 'empresas', empresaDocId), dados);
        showToast('Dados da empresa atualizados com sucesso!', 'success');
        // Atualizar nome na header
        document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${dados.emp_razao_social || dados.emp_nome_fantasia || 'Empresa'}`;
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar dados da empresa', 'error');
    }
}

// ==================== ALTERAR SENHA ====================
async function alterarSenha() {
    const senhaAtual = document.getElementById('senhaAtual').value;
    const novaSenha = document.getElementById('novaSenha').value;
    const confirmarSenha = document.getElementById('confirmarSenha').value;
    
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
        showToast('Preencha todos os campos de senha', 'error');
        return;
    }
    if (novaSenha.length < 6) {
        showToast('A nova senha deve ter pelo menos 6 caracteres', 'error');
        return;
    }
    if (novaSenha !== confirmarSenha) {
        showToast('As senhas não coincidem', 'error');
        return;
    }
    try {
        const credential = EmailAuthProvider.credential(currentUser.email, senhaAtual);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, novaSenha);
        showToast('Senha alterada com sucesso!', 'success');
        document.getElementById('senhaAtual').value = '';
        document.getElementById('novaSenha').value = '';
        document.getElementById('confirmarSenha').value = '';
    } catch (error) {
        console.error(error);
        let msg = 'Erro ao alterar senha.';
        if (error.code === 'auth/wrong-password') msg = 'Senha atual incorreta.';
        else if (error.code === 'auth/weak-password') msg = 'A nova senha é muito fraca.';
        showToast(msg, 'error');
    }
}

// ==================== SOLICITAR LIBERAÇÃO ====================
window.solicitarLiberacao = () => {
    const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
    const corpo = encodeURIComponent(`Solicito liberação da empresa:\n\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}\nWhatsApp: ${currentEmpresa?.emp_whatsapp || '-'}\n\nAguardo retorno.`);
    window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
    showToast('Abrindo cliente de e-mail...', 'info');
};

// ==================== AUTENTICAÇÃO E INICIALIZAÇÃO ====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentEmpresa = await carregarEmpresaUsuario(user);
        if (!currentEmpresa) { window.location.href = 'login.html'; return; }
        empresaDocId = currentEmpresa.id;
        document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${currentEmpresa.emp_razao_social || currentEmpresa.emp_nome_fantasia || 'Empresa'}`;
        
        await carregarDadosEmpresa();
        aplicarMascaras();
    } else {
        window.location.href = 'login.html';
    }
});

// ==================== EVENTOS GLOBAIS ====================
document.getElementById('saveEmpresaBtn').onclick = salvarEmpresa;
document.getElementById('alterarSenhaBtn').onclick = alterarSenha;
document.getElementById('solicitarLiberacaoBtn').onclick = () => window.solicitarLiberacao();
document.getElementById('logoutBtn').onclick = () => auth.signOut();
document.getElementById('modalCloseBtn').onclick = () => document.getElementById('viewModal').style.display = 'none';
window.onclick = (e) => { if (e.target === document.getElementById('viewModal')) document.getElementById('viewModal').style.display = 'none'; };