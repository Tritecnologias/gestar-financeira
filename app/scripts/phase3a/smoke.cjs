const assert = require('node:assert/strict');
const { emailFor } = require('./provision.cjs');

async function smoke(db, setup, { base, labPlatformPasswords = null, expectBanner = true }) {
  const passed = [], observations = [];
  const ok = (label, condition) => { if (!condition) throw new Error('CHECK_FAILED: ' + label); passed.push(label); global.phase3aLastCheck=label; };
  async function request(jar, path, method = 'GET', data, raw = false) {
    const response = await fetch(base + path, { method, redirect: 'manual',
      signal: AbortSignal.timeout(60000), headers: { Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '),
        ...(data === undefined ? {} : { 'Content-Type': raw ? 'application/x-www-form-urlencoded' : 'application/json' }) },
      body: data === undefined ? undefined : raw ? data : JSON.stringify(data) });
    for (const cookie of response.headers.getSetCookie()) { const first = cookie.split(';')[0], at = first.indexOf('='); jar.set(first.slice(0, at), first.slice(at + 1)); }
    const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, body };
  }
  async function login(email, password) {
    const jar = new Map(), csrf = await request(jar, '/api/auth/csrf');
    assert.equal(csrf.status, 200);
    await request(jar, '/api/auth/callback/credentials', 'POST', new URLSearchParams({
      csrfToken: csrf.body.csrfToken, email, password, callbackUrl: base + '/selecionar-tenant' }).toString(), true);
    const session = await request(jar, '/api/auth/session');
    ok('login sintético ' + email.split('@')[0], !!session.body.user?.id);
    return { jar, user: session.body.user };
  }
  const choose = (session, tenantId, grantId) => request(session.jar, '/api/tenants/switch', 'POST', { tenantId, ...(grantId ? { grantId } : {}) });
  const sessions = {};
  for (const invite of setup.invitations) {
    const accepted = await request(sessions[invite.key]?.jar ?? new Map(), '/api/access/invitations/accept', 'POST',
      { token: invite.token, password: setup.passwords[invite.key] });
    ok('ativação normal ' + invite.key + ' ' + invite.id.slice(0, 8), accepted.status === 200);
    if (!sessions[invite.key]) sessions[invite.key] = await login(emailFor(invite.key), setup.passwords[invite.key]);
    ok('convite consumido não reutilizável ' + invite.id.slice(0,8),
      (await request(new Map(), '/api/access/invitations/accept', 'POST', { token: invite.token })).status === 404);
  }
  sessions.none = await login(emailFor('none'), setup.passwords.none);
  const [a,b] = setup.tenants.map(t => t.id);
  const [fa,fb] = setup.fixtures;
  const context = s => request(s.jar, '/api/access/context');
  ok('membership única seleciona MODO DEV', (await context(sessions.admin)).body.tenantId === a);
  ok('sem membership não acessa financeiro', (await request(sessions.none.jar, '/api/lancamentos')).status === 403);
  ok('sem membership não escolhe tenant', (await choose(sessions.none, a)).status === 403);
  ok('multi-membership exige escolha explícita', (await context(sessions.multi)).status === 409);
  ok('multi tem duas escolhas', (await request(sessions.multi.jar, '/api/tenants')).body.length === 2);
  ok('multi escolhe A', (await choose(sessions.multi, a)).status === 200);
  ok('multi A pode criar', (await context(sessions.multi)).body.permissions.includes('fluxo.lancamentos.create'));
  ok('multi escolhe B', (await choose(sessions.multi, b)).status === 200);
  ok('multi B somente consulta', !(await context(sessions.multi)).body.permissions.includes('fluxo.lancamentos.create'));
  ok('member sem administração plataforma', (await request(sessions.member.jar, '/api/platform/tenants')).status === 403);
  ok('admin empresarial sem administração plataforma', (await request(sessions.admin.jar, '/api/platform/identities')).status === 403);
  ok('member leitura', (await request(sessions.member.jar, '/api/lancamentos')).status === 200);
  for (const [path,method] of [['/api/lancamentos','POST'], ['/api/lancamentos/edicao-em-massa','POST'],
    ['/api/lancamentos/importacao-oficial','POST'], ['/api/categorias','POST'], ['/api/access/memberships','GET']])
    ok('consulta nega ' + method + ' ' + path, (await request(sessions.member.jar, path, method, method === 'GET' ? undefined : {})).status === 403);
  const memberContext = (await context(sessions.member)).body;
  ok('consulta sem saldos', !memberContext.permissions.includes('fluxo.visao.saldos'));
  ok('admin com saldos e imports', (await context(sessions.admin)).body.permissions.includes('fluxo.visao.saldos') &&
    (await context(sessions.admin)).body.permissions.includes('fluxo.lancamentos.import'));
  const members = await db.tenantMembership.findMany({ select: { id: true, tenantId: true, identityId: true, role: true } });
  const ownMembership = members.find(m => m.identityId === sessions.owner.user.id && m.tenantId === b);
  const inactive = members.find(m => m.identityId === sessions.inactive.user.id);
  const multiA = members.find(m => m.identityId === sessions.multi.user.id && m.tenantId === a);
  ok('último OWNER protegido', (await request(sessions.owner.jar, `/api/access/memberships/${ownMembership.id}`, 'PATCH', { status: 'INACTIVE' })).status === 409);
  ok('ADMIN não promove a OWNER', (await request(sessions.admin.jar, `/api/access/memberships/${inactive.id}`, 'PATCH', { role: 'OWNER' })).status === 403);
  ok('ADMIN não muda ADMIN', (await request(sessions.admin.jar, `/api/access/memberships/${multiA.id}`, 'PATCH', { status: 'INACTIVE' })).status === 403);
  ok('perfil de outro tenant negado', (await request(sessions.admin.jar, `/api/access/memberships/${inactive.id}`, 'PATCH', { profileId: setup.profiles[1].read.id })).status === 400);
  ok('membership de outro tenant não encontrada', (await request(sessions.admin.jar, `/api/access/memberships/${ownMembership.id}`, 'PATCH', { status: 'INACTIVE' })).status === 404);
  ok('escolhe vínculo antes de inativação', (await choose(sessions.inactive, a)).status === 200);
  ok('ADMIN pode inativar MEMBER', (await request(sessions.admin.jar, `/api/access/memberships/${inactive.id}`, 'PATCH', { status: 'INACTIVE' })).status === 200);
  ok('cookie antigo revogado imediatamente', (await context(sessions.inactive)).status === 409);
  ok('membership inativa não pode ser selecionada', (await choose(sessions.inactive, a)).status === 403);

  const beforeB = JSON.stringify(await db.categoria.findMany({ where: { tenantId:b } }));
  for (const [route,model] of [['categorias','categoria'], ['plano-contas','planoContas'], ['centros-custo','centroCusto'], ['clientes','cliente'], ['fornecedores','fornecedor']]) {
    const got = await request(sessions.admin.jar, `/api/${route}?tenantId=${b}`);
    ok('leitura isolada ' + route, got.status === 200 && Array.isArray(got.body) && got.body.every(row => row.tenantId === a));
  }
  ok('ID de categoria cruzado', (await request(sessions.admin.jar, `/api/categorias/${fb.category.id}`, 'PUT', { nome:'Não alterar' })).status === 404);
  ok('ID de centro cruzado', (await request(sessions.admin.jar, `/api/centros-custo/${fb.center.id}`, 'PUT', { nome:'Não alterar', areaId:fa.area.id })).status === 404);
  ok('área de outro tenant', (await request(sessions.admin.jar, '/api/centros-custo', 'POST', { codigo:'XX', nome:'Negado', areaId:fb.area.id })).status === 422);
  ok('categoria de outro tenant em conta', (await request(sessions.admin.jar, '/api/plano-contas', 'POST', { descricao:'Negado', tipo:'RECEITA', categoriaId:fb.category.id })).status === 400);
  for (const [field,id] of [['contaId',fb.account.id], ['clienteId',fb.client.id], ['fornecedorId',fb.supplier.id]]) {
    const result = await request(sessions.admin.jar, '/api/lancamentos', 'POST',
      { dataLanc:'2026-10-23', descricao:'Fixture negativa, não persistir', valor:1, tipo:'ENTRADA', [field]:id, tenantId:b });
    ok('referência cross-tenant ' + field, result.status === 400);
  }
  // Foreign identifiers are 400 in the existing financial validation contract.
  observations.push('Referências Conta/Cliente/Fornecedor/Categoria inválidas retornam 400; Área estrangeira retorna 422; IDs de recurso estrangeiro retornam 404. Nenhuma escrita cruzada.');
  const forged = { jar:new Map(sessions.admin.jar), user:sessions.admin.user };
  forged.jar.set('tenant_context', `${forged.user.id}:${forged.user.loginNonce}:${b}`);
  ok('cookie com outro tenant negado', (await context(forged)).status === 409);
  forged.jar.set('tenant_context', `${sessions.multi.user.id}:${sessions.multi.user.loginNonce}:${b}`);
  ok('cookie de outra identidade não transfere contexto', (await context(forged)).body.tenantId === a);
  ok('switch sem membership negado', (await choose(sessions.admin,b)).status === 403);
  const created = await request(sessions.admin.jar, '/api/categorias', 'POST', { codigo:'99', nome:'Fixture CRUD A', tenantId:b });
  ok('tenantId no payload não troca proprietário', created.status === 201 && created.body.tenantId === a);
  ok('ADMIN edita fixture própria', (await request(sessions.admin.jar, `/api/categorias/${created.body.id}`, 'PUT', { nome:'Fixture CRUD A editada', tenantId:b })).status === 200);
  ok('MEMBER não exclui fixture', (await request(sessions.member.jar, `/api/categorias/${created.body.id}`, 'DELETE')).status === 403);
  ok('ADMIN desativa fixture própria', (await request(sessions.admin.jar, `/api/categorias/${created.body.id}`, 'DELETE')).status === 200);
  ok('categoria B permaneceu intacta', JSON.stringify(await db.categoria.findMany({ where: { tenantId:b } })) === beforeB);
  ok('nenhum lançamento criado', await db.lancamento.count() === 0);

  // Administrative fixture transitions are audited and restored. Never touch
  // Ricardo's identities, passwords, memberships or global grants in these tests.
  async function fixtureChange(model, id, data, action, tenantId) {
    await db.$transaction(async tx => {
      await tx[model].update({ where:{id}, data });
      await tx.auditEvent.create({ data:{ tenantId, accessMode:'SYSTEM', result:'SUCCESS', action, resourceType:model,
        resourceId:id, reason:'FASE 3A fixture sintética de revogação', metadata:{ fixture:true } } });
    });
  }
  await choose(sessions.multi,a);
  try {
    await fixtureChange('tenantMembership',multiA.id,{status:'INACTIVE'},'MEMBERSHIP_DEACTIVATED',a);
    ok('multi contexto revogado', (await context(sessions.multi)).status === 409);
    ok('outro vínculo permanece utilizável', (await choose(sessions.multi,b)).status === 200 && (await context(sessions.multi)).body.tenantId === b);
  } finally { await fixtureChange('tenantMembership',multiA.id,{status:'ACTIVE'},'MEMBERSHIP_ACTIVATED',a); }
  try {
    await fixtureChange('tenant',b,{ativo:false},'TENANT_STATUS_CHANGED',b);
    ok('tenant inativo bloqueia cookie existente', (await context(sessions.multi)).status === 409);
    ok('tenant inativo não selecionável', (await choose(sessions.multi,b)).status === 403);
    ok('multi mantém A com B inativo', (await choose(sessions.multi,a)).status === 200);
  } finally { await fixtureChange('tenant',b,{ativo:true},'TENANT_STATUS_CHANGED',b); }
  if (expectBanner) {
    const page = await request(sessions.admin.jar,'/inicio');
    ok('identificador MODO DEV no HTML operacional', page.status === 200 && page.body.includes('MODO DEV — DADOS DE TESTE'));
  }
  if (labPlatformPasswords) {
    assert.equal(new URL(base).hostname,'10s-phase3a-app');
    const pa = await login('institutional@example.invalid',labPlatformPasswords.institutional);
    ok('PA sem membership vê plataforma', (await request(pa.jar,'/plataforma')).status === 200);
    ok('PA sem membership lista tenants globalmente', (await request(pa.jar,'/api/platform/tenants')).body.length === 2);
    ok('PA sem membership não vê financeiro', (await request(pa.jar,'/api/lancamentos')).status === 403);
    ok('PA sem membership não escolhe tenant', (await choose(pa,a)).status === 403);
    const principal = await login('principal@example.invalid',labPlatformPasswords.principal);
    ok('PA com dois vínculos exige seleção', (await context(principal)).status === 409);
    await choose(principal,a);
    ok('OWNER acessa por membership e perfil', (await context(principal)).body.role === 'OWNER');
    ok('OWNER acessa administração', (await request(principal.jar,'/api/access/memberships')).status === 200);
    const principalMember = setup.principalMemberships[0];
    ok('último OWNER MODO DEV protegido', (await request(principal.jar,`/api/access/memberships/${principalMember.id}`,'PATCH',{status:'INACTIVE'})).status === 409);
    ok('identidades globais sem mutação simplista', (await request(pa.jar,'/api/platform/identities','PATCH',{})).status === 405);
    await supportChecks(db,setup,pa,sessions.owner,request,choose,ok,fixtureChange);
  }
  ok('contagens finais de tenancy', await db.tenant.count() === 2 && await db.tenantMembership.count() === 8);
  ok('duas concessões PlatformAdmin preservadas', await db.platformAdmin.count() === 2);
  ok('oito identidades independentes', await db.authIdentity.count() === 8);
  const actions = await db.auditEvent.groupBy({ by:['action'], _count:true });
  for (const action of ['TENANT_CREATED','MEMBERSHIP_ACTIVATED','OWNER_ASSIGNED','INVITE_ACCEPTED','TENANT_CONTEXT_SWITCHED','MEMBERSHIP_DEACTIVATED'])
    ok('auditoria ' + action, actions.some(row => row.action === action && row._count > 0));
  return { passed, observations, count:passed.length, auditActions:actions };
}

async function supportChecks(db,setup,pa,owner,request,choose,ok,fixtureChange) {
  const tenantId=setup.tenants[1].id;
  const membership=await db.tenantMembership.findFirst({where:{tenantId,identityId:owner.user.id}});
  const designated=await request(pa.jar,`/api/platform/tenants/${tenantId}/contractual-responsible`,'POST',{membershipId:membership.id,confirm:true});
  ok('responsável sintético explícito', designated.status===200);
  const n=await db.tenantMembership.count();
  for(const finish of ['revoke','expire']) {
    pa.jar.delete('support_context');
    const grant=await request(pa.jar,'/api/support-grants','POST',{tenantId,reason:'FASE 3A investigação sintética de isolamento financeiro',modules:['ESTRUTURA_FINANCEIRA'],accessLevel:'READ_ONLY',requestedMinutes:15});
    ok('support solicitado '+finish,grant.status===201);
    ok('support não autoriza antes da aprovação '+finish,(await choose(pa,tenantId,grant.body.id)).status===403);
    ok('support aprovado por OWNER '+finish,(await request(owner.jar,`/api/support-grants/${grant.body.id}`,'PATCH',{action:'approve'})).status===200);
    ok('support selecionado '+finish,(await choose(pa,tenantId,grant.body.id)).status===200);
    ok('support leitura no escopo '+finish,(await request(pa.jar,'/api/categorias')).status===200);
    ok('support escrita negada '+finish,(await request(pa.jar,'/api/categorias','POST',{})).status===403);
    ok('support fora do escopo negado '+finish,(await request(pa.jar,'/api/lancamentos')).status===403);
    if(finish==='revoke') ok('support revogado',(await request(owner.jar,`/api/support-grants/${grant.body.id}`,'PATCH',{action:'revoke',reason:'Teste sintético concluído'})).status===200);
    else await fixtureChange('supportGrant',grant.body.id,{startsAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)},'TEST_EXPIRY_ADVANCED',tenantId);
    ok('support cookie bloqueado após '+finish,(await request(pa.jar,'/api/categorias')).status===409);
  }
  ok('SupportGrant não criou membership',await db.tenantMembership.count()===n);
}
module.exports={smoke};
