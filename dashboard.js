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
  } catch (error) {
    console.error(error);
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

document.getElementById('logoutBtn').addEventListener('click', () => {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  }).catch(console.error);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  try {
    currentEmpresa = await carregarEmpresaUsuario(user);
    document.getElementById('empresaInfo').innerHTML = `<i class="fas fa-building"></i> ${currentEmpresa.emp_razao_social || 'Empresa'}`;
    await atualizarStats();
    setupEventos();
    const status = verificarStatusEmpresa(currentEmpresa);
    const alertDiv = document.getElementById('trialAlert');
    if (status.status === 'expirado') {
      alertDiv.innerHTML = `<div><i class="fas fa-hourglass-end"></i> Período de teste expirado!</div>`;
      alertDiv.style.display = 'flex';
    } else if (status.status === 'trial_urgente') {
      alertDiv.innerHTML = `<div><i class="fas fa-hourglass-half"></i> Trial termina em ${status.diasRestantes} dias!</div><button class="btn btn-outline" onclick="solicitarLiberacao()">Solicitar Liberação</button>`;
      alertDiv.style.display = 'flex';
    } else if (status.status === 'trial') {
      alertDiv.innerHTML = `<div><i class="fas fa-calendar-alt"></i> Trial: ${status.diasRestantes} dias restantes.</div>`;
      alertDiv.style.display = 'flex';
    }
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar dados', 'error');
  }
});

window.solicitarLiberacao = () => {
  const assunto = encodeURIComponent(`Liberação - ${currentEmpresa?.emp_razao_social || 'Empresa'}`);
  const corpo = encodeURIComponent(`Solicito liberação.\nRazão Social: ${currentEmpresa?.emp_razao_social || '-'}\nCNPJ: ${currentEmpresa?.emp_cnpj || '-'}`);
  window.open(`mailto:jcnvap@gmail.com?subject=${assunto}&body=${corpo}`);
  showToast('Abrindo e-mail...', 'info');
};