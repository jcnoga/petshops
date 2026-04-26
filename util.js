// ========== Substituir a função carregarEmpresaUsuario ==========
export async function carregarEmpresaUsuario(user) {
    if (!user) return null;
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (!userDoc.exists()) {
        showToast('Perfil não encontrado!', 'error');
        await auth.signOut();
        return null;
    }
    const userData = userDoc.data();
    const empresaId = userData.empresaId;   // <-- campo único
    if (!empresaId) {
        showToast('Nenhuma empresa associada a este usuário.', 'error');
        return null;
    }
    const empresaDoc = await getDoc(doc(db, 'empresas', empresaId));
    if (!empresaDoc.exists()) return null;
    const empresa = { id: empresaDoc.id, ...empresaDoc.data() };
    // Armazena em cache (opcional)
    sessionStorage.setItem('empresa_atual', JSON.stringify(empresa));
    return empresa;
}