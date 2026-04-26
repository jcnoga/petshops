import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { carregarEmpresaUsuario, verificarStatusEmpresa, showToast } from './util.js';

let currentEmpresa = null;

async function atualizarStats() {
    if (!currentEmpresa) return;
    try {
        const clientesQuery = query(collection(db, 'clientes'), where('empresaId', '==', currentEmpresa.id), where('deleted', '==', false));
        const petsQuery = query(collection(db, 'pets'), where('empresaId', '==', currentEmpresa.id));
        const [clientesSnap, petsSnap] = await Promise.all([getCountFromServer(clientesQuery), getCountFromServer(petsQuery)]);
        document.getElementById('totalClientes').innerText = clientesSnap.data().count;
        document.getElementById('totalPets').innerText = petsSnap.data().count;
        // Demais estatísticas podem ser adicionadas posteriormente
    } catch (error) {
        console.error("Erro ao atualizar stats:", error);
    }
}

function setupEventos() {
    document.querySelectorAll('.stat-card[data-module]').forEach(card => {
        card.addEventListener('click', () => {
            const modulo = card.getAttribute('data-module');
            if (modulo) window.location.href = modulo;
        });
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentEmpresa = await carregarEmpresaUsuario(user);
        document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${currentEmpresa.emp_razao_social || 'Empresa'}`;
        atualizarStats();
        setupEventos();
        const status = verificarStatusEmpresa(currentEmpresa);
        if (status.status === 'expirado') {
            const alertDiv = document.getElementById('trialAlert');
            alertDiv.innerHTML = `<div><i class="fas fa-hourglass-end"></i> Período de teste expirado!</div>`;
            alertDiv.style.display = 'flex';
        }
    } else {
        window.location.href = 'login.html';
    }
});

document.getElementById('logoutBtn').onclick = () => auth.signOut();