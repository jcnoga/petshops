import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast, carregarEmpresaUsuario } from './util.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const resetLink = document.getElementById('resetPasswordLink');
const resetModal = document.getElementById('resetModal');
const closeModal = document.getElementById('closeModalBtn');
const sendReset = document.getElementById('sendResetBtn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        // Força criação da empresa (se não existir)
        await carregarEmpresaUsuario(userCred.user);
        showToast('Login realizado!', 'success');
        setTimeout(() => window.location.href = 'index.html', 1000);
    } catch (error) {
        showToast('Erro: ' + error.message, 'error');
    }
});

resetLink.onclick = () => resetModal.style.display = 'flex';
closeModal.onclick = () => resetModal.style.display = 'none';
sendReset.onclick = async () => {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) return showToast('Digite o e-mail', 'error');
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Link enviado!', 'success');
        resetModal.style.display = 'none';
    } catch (error) {
        showToast('Erro: ' + error.message, 'error');
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) window.location.href = 'index.html';
});