const isAdminUser = await verificarAcessoAdmin(user);
const isSuperUser = await verificarSuperAdmin(user);
if (!isAdminUser && !isSuperUser) { /* bloqueia */ }