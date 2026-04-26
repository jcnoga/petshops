// ==================== IMPORTAÇÕES ====================
import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==================== ELEMENTOS DOM ====================
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const resetLink = document.getElementById('resetPasswordLink');
const resetModal = document.getElementById('resetModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const sendResetBtn = document.getElementById('sendResetBtn');
const resetEmailInput = document.getElementById('resetEmail');

// ==================== FUNÇÃO PARA EXIBIR TOAST ====================
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ==================== FUNÇÃO PARA REDIRECIONAR APÓS LOGIN ====================
async function verificarEmpresaEUsuario(user) {
    try {
        // Buscar empresa vinculada ao usuário (campo empresaId no user ou collection empresas)
        const empresasSnap = await getDocs(query(collection(db, 'empresas'), where('usuarioId', '==', user.uid)));
        if (empresasSnap.empty) {
            showToast('Nenhuma empresa vinculada a este usuário. Contate o suporte.', 'error');
            return false;
        }
        // Se encontrou, armazenar no localStorage para uso rápido
        const empresa = empresasSnap.docs[0].data();
        localStorage.setItem('empresaId', empresasSnap.docs[0].id);
        localStorage.setItem('empresaNome', empresa.emp_razao_social || empresa.emp_nome_fantasia || 'Minha Empresa');
        return true;
    } catch (error) {
        console.error('Erro ao buscar empresa:', error);
        showToast('Erro ao verificar dados da empresa.', 'error');
        return false;
    }
}

// ==================== LOGIN ====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showToast('Preencha e-mail e senha.', 'error');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Verificar se o usuário tem empresa vinculada
        const empresaOk = await verificarEmpresaEUsuario(user);
        if (!empresaOk) {
            await auth.signOut();
            showToast('Usuário sem empresa vinculada. Contate o administrador.', 'error');
            return;
        }

        showToast('Login realizado com sucesso!', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    } catch (error) {
        console.error('Erro no login:', error);
        let msg = 'Erro ao fazer login. Verifique suas credenciais.';
        if (error.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
        else if (error.code === 'auth/wrong-password') msg = 'Senha incorreta.';
        else if (error.code === 'auth/invalid-email') msg = 'E-mail inválido.';
        else if (error.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente mais tarde.';
        showToast(msg, 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
    }
});

// ==================== RECUPERAR SENHA (ABRIR MODAL) ====================
resetLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetModal.style.display = 'flex';
    resetEmailInput.value = emailInput.value; // pré-preencher com e-mail do formulário se existir
});

closeModalBtn.addEventListener('click', () => {
    resetModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === resetModal) resetModal.style.display = 'none';
});

sendResetBtn.addEventListener('click', async () => {
    const email = resetEmailInput.value.trim();
    if (!email) {
        showToast('Digite o e-mail para recuperação.', 'error');
        return;
    }
    sendResetBtn.disabled = true;
    sendResetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    try {
        await sendPasswordResetEmail(auth, email);
        showToast(`Link de recuperação enviado para ${email}. Verifique sua caixa de entrada.`, 'success');
        resetModal.style.display = 'none';
    } catch (error) {
        console.error('Erro ao enviar reset:', error);
        let msg = 'Erro ao enviar e-mail de recuperação.';
        if (error.code === 'auth/user-not-found') msg = 'Nenhum usuário encontrado com este e-mail.';
        showToast(msg, 'error');
    } finally {
        sendResetBtn.disabled = false;
        sendResetBtn.innerHTML = 'Enviar link';
    }
});

// ==================== REDIRECIONAR SE JÁ ESTIVER LOGADO ====================
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Se já estiver logado, verificar empresa e redirecionar para dashboard
        const empresaOk = await verificarEmpresaEUsuario(user);
        if (empresaOk) {
            window.location.href = 'index.html';
        }
    }
});