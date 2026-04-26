import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from './util.js';

// Elementos
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const resetLink = document.getElementById('resetPasswordLink');
const resetModal = document.getElementById('resetModal');
const closeModal = document.getElementById('closeModalBtn');
const sendResetBtn = document.getElementById('sendResetBtn');

// Se já estiver logado, redireciona para dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = 'index.html';
  }
});

// Login
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showToast('Preencha e-mail e senha', 'error');
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast('Login realizado com sucesso!', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (error) {
    console.error(error);
    let msg = 'Erro ao fazer login';
    if (error.code === 'auth/user-not-found') msg = 'Usuário não encontrado';
    else if (error.code === 'auth/wrong-password') msg = 'Senha incorreta';
    else if (error.code === 'auth/invalid-email') msg = 'E-mail inválido';
    else if (error.code === 'auth/api-key-not-valid') msg = 'Chave API inválida. Verifique firebase-config.js';
    showToast(msg, 'error');
  }
});

// Recuperar senha
resetLink.onclick = () => {
  resetModal.style.display = 'flex';
};
closeModal.onclick = () => {
  resetModal.style.display = 'none';
};
sendResetBtn.onclick = async () => {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) {
    showToast('Digite o e-mail', 'error');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Link de recuperação enviado!', 'success');
    resetModal.style.display = 'none';
  } catch (error) {
    showToast('Erro: ' + error.message, 'error');
  }
};

// Fechar modal clicando fora
window.onclick = (event) => {
  if (event.target === resetModal) {
    resetModal.style.display = 'none';
  }
};