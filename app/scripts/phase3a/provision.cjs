// Operational procedure, not shipped in the runtime image. No fixed credentials.
// Caller must check the live artifact, backup, database and deployment before apply.
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');

const PLAN = Object.freeze({ tenants: 2, profiles: 4, newIdentities: 6,
  finalIdentities: 8, platformAdmins: 2, finalMemberships: 8, principalMemberships: 2,
  institutionalMemberships: 0, invitations: 6 });
const FIXTURES = ['owner', 'admin', 'member', 'multi', 'inactive', 'none'];
const emailFor = key => `phase3a-${key}@example.invalid`;

function guardEnvironment(env) {
  const url = new URL(env.DATABASE_URL);
  assert.equal(env.ACCESS_AUTH_MODE, 'identity');
  assert.equal(url.searchParams.get('schema') || 'public', 'public');
  if (env.PHASE3A_LAB === '1') {
    assert.equal(url.hostname, '10s-phase3a-pg');
    assert.equal(url.pathname, '/phase3a_lab');
    assert.equal(env.APP_PUBLIC_URL, 'http://10s-phase3a-app:3000');
  } else {
    assert.equal(url.hostname, 'hd9a0oz02vexqe9u8qadzg6k');
    assert.equal(url.pathname, '/gestar_financeira_homolog');
    assert.equal(env.APP_PUBLIC_URL, 'https://homolog.dezsolucoes.com.br');
    assert.equal(env.NEXTAUTH_URL, env.APP_PUBLIC_URL);
  }
  return url;
}

async function inventory(db, emails) {
  const result = {};
  for (const model of ['tenant', 'authIdentity', 'platformAdmin', 'tenantMembership', 'usuario',
    'legacyUserAccessMap', 'accessProfile', 'accessInvite', 'lancamento']) result[model] = await db[model].count();
  assert.equal(result.authIdentity, 2, 'Fresh HOMO with exactly the two existing identities required');
  assert.equal(result.platformAdmin, 2);
  for (const model of ['tenant', 'tenantMembership', 'usuario', 'legacyUserAccessMap', 'accessProfile', 'accessInvite', 'lancamento']) assert.equal(result[model], 0, model);
  for (const email of emails) {
    const identity = await db.authIdentity.findUnique({ where: { email },
      select: { id: true, status: true, platformAdmin: { select: { status: true } } } });
    assert.equal(identity?.status, 'ACTIVE');
    assert.equal(identity.platformAdmin?.status, 'ACTIVE');
  }
  return result;
}

async function provision(db, { env, allPermissions, apply = false }) {
  const url = guardEnvironment(env);
  const principalEmail = env.PHASE3A_LAB === '1' ? 'principal@example.invalid' : 'ricardomarcondes86@hotmail.com';
  const institutionalEmail = env.PHASE3A_LAB === '1' ? 'institutional@example.invalid' : 'ricardo@gestarfinanceira.com.br';
  const [database] = await db.$queryRawUnsafe('SELECT current_database() AS name');
  assert.equal('/' + database.name, url.pathname);
  const ledger = await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  assert.equal(ledger[0].n, 13);
  const before = await inventory(db, [principalEmail, institutionalEmail]);
  assert.ok(allPermissions.length > 30 && allPermissions.includes('acessos.usuarios.manage'));
  const readPermissions = allPermissions.filter(p => p.endsWith('.view') && !p.startsWith('acessos.'));
  if (!apply) return { state: 'FRESH', before, plan: PLAN, readPermissions };

  // Passwords/tokens live only in process memory and are never logged or returned
  // to the operator. The test harness consumes them, then the process terminates.
  const passwords = Object.fromEntries(FIXTURES.map(key => [key, randomBytes(32).toString('base64url')]));
  const unusableLegacyHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
  const noneHash = await bcrypt.hash(passwords.none, 12);
  const setup = await db.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('phase3a-provision', 0))");
    await inventory(tx, [principalEmail, institutionalEmail]);
    const audit = async (action, resourceType, resourceId, tenantId = null, metadata = {}) =>
      tx.auditEvent.create({ data: { accessMode: 'SYSTEM', result: 'SUCCESS', action, resourceType,
        resourceId, tenantId, reason: 'FASE 3A: provisionamento sintético explicitamente autorizado', metadata } });
    const principal = await tx.authIdentity.findUniqueOrThrow({ where: { email: principalEmail }, select: { id: true, nome: true, email: true } });
    const tenants = [];
    const profiles = [];
    for (const [nome, slug] of [['MODO DEV', 'modo-dev'], ['MODO DEV ISOLAMENTO', 'modo-dev-isolamento']]) {
      const tenant = await tx.tenant.create({ data: { nome, slug, email: `${slug}@example.invalid`, plano: 'trial', ativo: true } });
      tenants.push(tenant);
      await audit('TENANT_CREATED', 'Tenant', tenant.id, tenant.id, { purpose: 'Dados sintéticos permanentes da HOMO' });
      const set = {};
      for (const [key, nome, permissoes] of [['admin', 'ADMINISTRAÇÃO', allPermissions], ['read', 'CONSULTA', readPermissions]]) {
        set[key] = await tx.accessProfile.create({ data: { tenantId: tenant.id, nome, permissoes,
          descricao: 'FASE 3A — perfil sintético explícito; nenhuma concessão por PlatformAdmin' } });
        await audit('ACCESS_PROFILE_CREATED', 'AccessProfile', set[key].id, tenant.id, { name: nome, permissionCount: permissoes.length });
      }
      profiles.push(set);
    }
    const principalMemberships = [];
    for (let index = 0; index < tenants.length; index++) {
      const tenantId = tenants[index].id, role = index === 0 ? 'OWNER' : 'MEMBER';
      const membership = await tx.tenantMembership.create({ data: { identityId: principal.id, tenantId,
        role, profileId: profiles[index][index === 0 ? 'admin' : 'read'].id } });
      // Explicit author key required by current runtime. No usable legacy password
      // is copied from Ricardo, and no PlatformAdmin legacy mapping is introduced.
      const user = await tx.usuario.create({ data: { tenantId, nome: principal.nome, email: principal.email,
        senhaHash: unusableLegacyHash, papel: role === 'MEMBER' ? 'membro' : 'admin' } });
      await tx.legacyUserAccessMap.create({ data: { tenantId, identityId: principal.id,
        membershipId: membership.id, legacyUsuarioId: user.id } });
      await audit('MEMBERSHIP_ACTIVATED', 'TenantMembership', membership.id, tenantId, { role });
      if (role === 'OWNER') {
        await tx.accessOwnerEvent.create({ data: { tenantId, targetIdentityId: principal.id, targetMembershipId: membership.id } });
        await audit('OWNER_ASSIGNED', 'TenantMembership', membership.id, tenantId);
      }
      principalMemberships.push(membership);
    }
    const none = await tx.authIdentity.create({ data: { nome: 'FASE 3A Sem vínculo', email: emailFor('none'), senhaHash: noneHash } });
    await audit('IDENTITY_ACTIVATED', 'AuthIdentity', none.id);
    const invitations = [];
    for (const [key, index, role] of [['owner', 1, 'OWNER'], ['admin', 0, 'ADMIN'], ['member', 0, 'MEMBER'],
      ['multi', 0, 'ADMIN'], ['multi', 1, 'MEMBER'], ['inactive', 0, 'MEMBER']]) {
      const token = randomBytes(32).toString('base64url');
      const invitation = await tx.accessInvite.create({ data: { tenantId: tenants[index].id, email: emailFor(key),
        name: `FASE 3A ${key}`, role, profileId: profiles[index][role === 'MEMBER' ? 'read' : 'admin'].id,
        tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000),
        invitedByIdentityId: principal.id } });
      await audit('INVITE_CREATED', 'AccessInvite', invitation.id, tenants[index].id,
        { delivery: 'NOT_SENT', purpose: 'Fixture técnica: ativação pela API, sem destinatário real' });
      invitations.push({ key, token, id: invitation.id });
    }
    const fixtures = [];
    for (const tenant of tenants) {
      const tenantId = tenant.id, suffix = tenant.slug;
      const category = await tx.categoria.create({ data: { tenantId, codigo: '01', nome: `Categoria teste ${suffix}` } });
      const account = await tx.planoContas.create({ data: { tenantId, codigo: '01.01', descricao: `Conta teste ${suffix}`, tipo: 'RECEITA', categoriaId: category.id } });
      const area = await tx.areaNegocio.create({ data: { tenantId, codigo: 'A01', nome: `Área teste ${suffix}` } });
      const center = await tx.centroCusto.create({ data: { tenantId, codigo: 'CC01', nome: `Centro teste ${suffix}`, areaId: area.id } });
      const client = await tx.cliente.create({ data: { tenantId, codigo: 'C0001', nome: `Cliente sintético ${suffix}` } });
      const supplier = await tx.fornecedor.create({ data: { tenantId, codigo: 'F0001', nome: `Fornecedor sintético ${suffix}` } });
      fixtures.push({ category, account, area, center, client, supplier });
      await audit('TEST_FIXTURES_CREATED', 'Tenant', tenantId, tenantId, { records: 6, financialEntries: 0 });
    }
    return { tenants, profiles, fixtures, invitations, principalMemberships, principalId: principal.id, noneId: none.id };
  }, { isolationLevel: 'Serializable', timeout: 60000 });
  return { ...setup, passwords, plan: PLAN };
}
module.exports = { PLAN, FIXTURES, emailFor, guardEnvironment, provision };
