import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from './util.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = 'index.html';
});

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
    showToast('Login realizado!', 'success');
    setTimeout(() => window.location.href = 'index.html', 1000);
  } catch (error) {
    console.error(error);
    let msg = 'Erro ao fazer login. Verifique e-mail/senha.';
    if (error.code === 'auth/user-not-found') msg = 'Usuário não encontrado';
    else if (error.code === 'auth/wrong-password') msg = 'Senha incorreta';
    else if (error.code === 'auth/invalid-email') msg = 'E-mail inválido';
    else if (error.code === 'auth/api-key-not-valid') msg = 'Chave API inválida. Verifique firebase-config.js';
    showToast(msg, 'error');
  }
});