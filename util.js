// ========== Substitua a função carregarEmpresaUsuario ==========
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

        // Se não tiver empresaId, verifica se existe uma empresa no campo antigo (empresaAtiva) e migra
        if (!empresaId && userData.empresaAtiva) {
            empresaId = userData.empresaAtiva;
            // Atualiza o documento do usuário para o novo padrão
            await updateDoc(doc(db, 'usuarios', user.uid), { empresaId: empresaId });
            console.log('Migrado empresaId de empresaAtiva para', empresaId);
        }

        // Se ainda não tem, cria uma nova empresa automaticamente
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