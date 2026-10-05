import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, requireDevDatabase } from "../access3b/context.mjs";

const base = "http://localhost:3000";
const suffix = randomBytes(6).toString("hex");
const email = `access4-renan-${suffix}@localhost.invalid`;
const ownerEmail = `access4-owner-${suffix}@localhost.invalid`;
const password = randomBytes(22).toString("hex");
const created = { tenants: [], identities: [], profiles: [], members: [], users: [], maps: [], platformGrants: [] };
const checks = [];
function assert(label, condition) { if (!condition) throw new Error(`Falha: ${label}`); checks.push(label); }
function cookieJar() {
  const values = new Map();
  return { add(response) { for (const line of response.headers.getSetCookie()) {
    const part = line.split(";", 1)[0]; const split = part.indexOf("=");
    if (split > 0) values.set(part.slice(0, split), part.slice(split + 1));
  } }, header() { return [...values].map(([key, value]) => `${key}=${value}`).join("; "); } };
}
async function request(path, jar, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, redirect: "manual",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Cookie: jar.header(), ...options.headers } });
  jar.add(response);
  let body = null; try { body = await response.json(); } catch { /* route may return HTML */ }
  return { status: response.status, body, headers: response.headers };
}
async function login(userEmail) {
  const jar = cookieJar();
  const csrfResponse = await fetch(`${base}/api/auth/csrf`); jar.add(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const form = new URLSearchParams({ csrfToken, email: userEmail, password, callbackUrl: `${base}/acessos` });
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  jar.add(response);
  assert(`login ${userEmail === email ? "RENAN" : "OWNER"}`, jar.header().includes("authjs.session-token="));
  return jar;
}
async function addMembership(identity, tenant, role, profile) {
  const member = await prisma.tenantMembership.create({ data: { identityId: identity.id, tenantId: tenant.id, role, profileId: profile.id } });
  created.members.push(member.id);
  const user = await prisma.usuario.create({ data: { tenantId: tenant.id, nome: identity.nome, email: identity.email,
    senhaHash: identity.senhaHash, papel: role === "MEMBER" ? "membro" : "admin" } });
  created.users.push(user.id);
  const map = await prisma.legacyUserAccessMap.create({ data: { tenantId: tenant.id, identityId: identity.id,
    membershipId: member.id, legacyUsuarioId: user.id } });
  created.maps.push(map.id);
  return member;
}
async function switchTo(jar, tenantId) {
  const response = await request("/api/tenants/switch", jar, { method: "POST", body: JSON.stringify({ tenantId }) });
  assert("troca de tenant autorizada", response.status === 200);
}

try {
  await requireDevDatabase();
  const [a, b] = await Promise.all([
    prisma.tenant.create({ data: { nome: `ACCESS4 HIGH TEST ${suffix}`, slug: `access4-high-${suffix}`, email: `high-${suffix}@localhost.invalid` } }),
    prisma.tenant.create({ data: { nome: `ACCESS4 THE HOME TEST ${suffix}`, slug: `access4-home-${suffix}`, email: `home-${suffix}@localhost.invalid` } }),
  ]);
  created.tenants.push(a.id, b.id);
  const op = await prisma.accessProfile.create({ data: { tenantId: a.id, nome: "FINANCEIRO OPERACIONAL",
    permissoes: ["fluxo.visao.view", "fluxo.lancamentos.view", "fluxo.lancamentos.create", "fluxo.lancamentos.edit"] } });
  const reader = await prisma.accessProfile.create({ data: { tenantId: a.id, nome: "CONSULTA",
    permissoes: ["fluxo.lancamentos.view"] } });
  const noLaunch = await prisma.accessProfile.create({ data: { tenantId: a.id, nome: "RH",
    permissoes: ["estrutura.pessoas.view"] } });
  const manager = await prisma.accessProfile.create({ data: { tenantId: b.id, nome: "FINANCEIRO GERENTE",
    permissoes: ["fluxo.visao.view", "fluxo.visao.saldos", "fluxo.lancamentos.view", "fluxo.lancamentos.create",
      "fluxo.lancamentos.edit", "fluxo.lancamentos.export", "acessos.usuarios.view", "acessos.usuarios.manage",
      "acessos.perfis.view", "acessos.perfis.manage"] } });
  created.profiles.push(op.id, reader.id, noLaunch.id, manager.id);
  const hash = await bcrypt.hash(password, 12);
  const renan = await prisma.authIdentity.create({ data: { nome: "RENAN TESTE ACCESS4", email, senhaHash: hash } });
  const owner = await prisma.authIdentity.create({ data: { nome: "OWNER TESTE ACCESS4", email: ownerEmail, senhaHash: hash } });
  created.identities.push(renan.id, owner.id);
  const platformIdentity = await prisma.authIdentity.create({ data: { nome: "PLATFORM TESTE ACCESS4",
    email: `access4-platform-${suffix}@localhost.invalid`, senhaHash: hash } });
  created.identities.push(platformIdentity.id);
  const platformGrant = await prisma.platformAdmin.create({ data: { identityId: platformIdentity.id } });
  created.platformGrants.push(platformGrant.id);
  const memberA = await addMembership(renan, a, "MEMBER", op);
  await addMembership(renan, b, "ADMIN", manager);
  const ownerB = await addMembership(owner, b, "OWNER", manager);
  const jar = await login(email);
  await switchTo(jar, a.id);
  let result = await request("/api/access/context", jar);
  assert("RENAN/HIGH role MEMBER e perfil operacional", result.status === 200 && result.body.role === "MEMBER" && result.body.profile?.nome === "FINANCEIRO OPERACIONAL");
  assert("sem saldo sensível no perfil operacional", !result.body.permissions.includes("fluxo.visao.saldos"));
  result = await request("/api/lancamentos?page=1&pageSize=1", jar);
  assert("lançamentos GET autorizado", result.status === 200);
  result = await request("/api/fluxo-caixa/resumo?inicio=2026-01-01&fim=2026-01-31", jar);
  assert("saldo negado sem payload financeiro", result.status === 403 && !JSON.stringify(result.body).includes("valor"));
  result = await request("/api/platform/tenants", jar);
  assert("PlatformAdmin separado de role empresarial", result.status === 403);
  await prisma.tenantMembership.update({ where: { id: memberA.id }, data: { profileId: reader.id } });
  result = await request("/api/lancamentos?page=1&pageSize=1", jar);
  assert("perfil de leitura permite GET", result.status === 200);
  result = await request("/api/lancamentos", jar, { method: "POST", body: "{}" });
  assert("perfil de leitura nega POST", result.status === 403);
  result = await request("/api/config/logo", jar);
  assert("configuração sem permissão não vaza logo", result.status === 403);
  result = await request("/api/pessoas", jar);
  assert("CONSULTA não lê Pessoas", result.status === 403);
  result = await request("/api/pessoas", jar, { method: "POST", body: "{}" });
  assert("CONSULTA não cria Pessoas", result.status === 403);
  result = await request("/api/pessoas/exportar", jar);
  assert("CONSULTA não exporta Pessoas", result.status === 403);
  result = await request("/api/pessoas/importar", jar, { method: "POST", body: "{}" });
  assert("CONSULTA não importa Pessoas", result.status === 403);
  result = await request("/estrutura/dimensao-pessoas", jar);
  assert("rota Pessoas sem permissão bloqueada", result.status !== 200);
  result = await request("/api/estrutura-financeira/exportar", jar);
  assert("CONSULTA não exporta estrutura financeira", result.status === 403);
  for (const path of ["/acao/tarefas", "/estrutura/dimensao-empresa", "/estrutura/dimensoes-financeiras",
    "/estrutura/dimensoes-cadastrais", "/estrutura/dimensao-produtos", "/fluxo-caixa/relatorios",
    "/fluxo-caixa/graficos"]) {
    result = await request(path, jar);
    assert(`rota ${path} bloqueada sem permissão`, result.status !== 200);
  }
  result = await request("/api/categorias", jar);
  assert("consulta compartilhada de Categorias autorizada para Lançamentos", result.status === 200);
  result = await request("/api/categorias", jar, { method: "POST", body: "{}" });
  assert("consulta de Categoria não concede criação", result.status === 403);
  result = await request("/api/produtos", jar, { method: "POST", body: "{}" });
  assert("CONSULTA não cria Item", result.status === 403);
  result = await request("/api/tarefas", jar, { method: "POST", body: "{}" });
  assert("CONSULTA não cria Tarefa", result.status === 403);
  result = await request("/api/lancamentos/importacao-oficial", jar, { method: "POST", body: "{}" });
  assert("perfil de leitura nega importação", result.status === 403);
  result = await request("/api/lancamentos/exportar", jar);
  assert("perfil de leitura nega exportação", result.status === 403);
  await prisma.tenantMembership.update({ where: { id: memberA.id }, data: { profileId: noLaunch.id } });
  result = await request("/lancamentos", jar);
  assert("rota Lançamentos sem permissão bloqueada", result.status !== 200);
  result = await request("/api/pessoas", jar);
  assert("RH lê Pessoas", result.status === 200);
  result = await request("/api/centros-custo", jar);
  assert("RH lê catálogo de Centros para Pessoas", result.status === 200);
  result = await request("/api/categorias", jar);
  assert("RH não lê categorias financeiras", result.status === 403);
  result = await request("/api/fornecedores", jar);
  assert("RH não lê Fornecedores", result.status === 403);
  result = await request("/estrutura/dimensao-pessoas", jar);
  assert("RH abre rota Pessoas", result.status === 200);
  result = await request("/estrutura/dimensoes-financeiras", jar);
  assert("RH não abre Finanças", result.status !== 200);
  await prisma.tenantMembership.update({ where: { id: memberA.id }, data: { profileId: reader.id } });
  await switchTo(jar, b.id);
  result = await request("/api/access/context", jar);
  assert("RENAN/THE HOME role ADMIN e perfil gerente", result.status === 200 && result.body.role === "ADMIN" && result.body.profile?.nome === "FINANCEIRO GERENTE");
  assert("permissões recalculadas na troca", result.body.permissions.includes("fluxo.visao.saldos"));
  result = await request("/api/access/profiles", jar);
  assert("ADMIN consulta perfis do próprio tenant", result.status === 200 && result.body.every(p => p.tenantId === b.id));
  result = await request("/api/access/profiles", jar, { method: "POST", body: JSON.stringify({ nome: "NOVO TESTE", permissoes: ["fluxo.lancamentos.view"] }) });
  assert("criação de perfil por API", result.status === 201);
  created.profiles.push(result.body.id);
  const addedEmail = `access4-added-${suffix}@localhost.invalid`;
  result = await request("/api/access/memberships", jar, { method: "POST", body: JSON.stringify({
    nome: "MEMBRO TESTE ACCESS4", email: addedEmail, senha: password, role: "MEMBER", profileId: op.id,
  }) });
  assert("perfil cross-tenant rejeitado na criação", result.status === 400);
  result = await request("/api/access/memberships", jar, { method: "POST", body: JSON.stringify({
    nome: "MEMBRO TESTE ACCESS4", email: addedEmail, senha: password, role: "MEMBER", profileId: manager.id,
  }) });
  assert("ADMIN adiciona MEMBER com perfil local", result.status === 201);
  const addedId = result.body.id;
  const addedIdentity = await prisma.authIdentity.findUnique({ where: { email: addedEmail } });
  const addedMap = await prisma.legacyUserAccessMap.findFirst({ where: { membershipId: addedId } });
  created.identities.push(addedIdentity.id); created.members.push(addedId);
  created.maps.push(addedMap.id); created.users.push(addedMap.legacyUsuarioId);
  result = await request(`/api/access/memberships/${addedId}`, jar, { method: "PATCH", body: JSON.stringify({ profileId: created.profiles.at(-1) }) });
  assert("mudança de perfil do MEMBER", result.status === 200 && result.body.profileId === created.profiles.at(-1));
  result = await request(`/api/access/memberships/${addedId}`, jar, { method: "PATCH", body: JSON.stringify({ profileId: op.id }) });
  assert("perfil cross-tenant rejeitado na edição", result.status === 400);
  result = await request(`/api/access/memberships/${addedId}`, jar, { method: "PATCH", body: JSON.stringify({ role: "OWNER" }) });
  assert("ADMIN não concede OWNER", result.status === 403);
  result = await request(`/api/access/profiles/${created.profiles.at(-1)}`, jar, { method: "PATCH", body: JSON.stringify({ ativo: false }) });
  assert("perfil vinculado não pode ser inativado", result.status === 409);
  result = await request("/acessos", jar);
  const menuHtml = await (await fetch(`${base}/acessos`, { headers: { Cookie: jar.header() } })).text();
  assert("menu B mostra Lançamentos", result.status === 200 && menuHtml.includes('href="/lancamentos"'));
  assert("menu B oculta Pessoas sem permissão", !menuHtml.includes('href="/estrutura/dimensao-pessoas"'));
  result = await request(`/api/access/memberships/${ownerB.id}`, jar, { method: "PATCH", body: JSON.stringify({ status: "INACTIVE" }) });
  assert("ADMIN não altera OWNER", result.status === 403);
  result = await request(`/api/access/memberships/${memberA.id}`, jar, { method: "PATCH", body: JSON.stringify({ profileId: manager.id }) });
  assert("membership de outro tenant não encontrado", result.status === 404);
  const ownerJar = await login(ownerEmail);
  result = await request(`/api/access/memberships/${ownerB.id}`, ownerJar, { method: "PATCH", body: JSON.stringify({ status: "INACTIVE" }) });
  assert("último OWNER protegido", result.status === 409);
  const platformJar = await login(platformIdentity.email);
  result = await request("/api/platform/tenants", platformJar);
  assert("PlatformAdmin vê inventário sem contexto operacional", result.status === 200 && Array.isArray(result.body));
  result = await request("/api/tenants", platformJar);
  assert("PlatformAdmin não recebe tenant financeiro automaticamente", result.status === 200 && result.body.length === 0);
  result = await request("/api/tenants", platformJar, { method: "POST", body: JSON.stringify({
    nome: `ACCESS4 PLATFORM TEST ${suffix}`, email: `platform-tenant-${suffix}@localhost.invalid`, plano: "trial",
  }) });
  assert("PlatformAdmin cria tenant", result.status === 201);
  const platformTenant = result.body;
  created.tenants.push(platformTenant.id);
  result = await request(`/api/platform/tenants/${platformTenant.id}`, platformJar, { method: "PATCH", body: JSON.stringify({ plano: "mensal" }) });
  assert("PlatformAdmin altera plano", result.status === 200 && result.body.plano === "mensal");
  result = await request(`/api/platform/tenants/${platformTenant.id}/owners`, platformJar, { method: "POST", body: JSON.stringify({ email: ownerEmail }) });
  assert("OWNER exige confirmação explícita", result.status === 400);
  result = await request(`/api/platform/tenants/${platformTenant.id}/owners`, platformJar, { method: "POST", body: JSON.stringify({ email: ownerEmail, confirm: true }) });
  assert("PlatformAdmin provisiona OWNER existente sem duplicar identidade", result.status === 201);
  const provisioned = result.body;
  created.members.push(provisioned.id); created.profiles.push(provisioned.profileId);
  const provisionedMap = await prisma.legacyUserAccessMap.findFirst({ where: { membershipId: provisioned.id } });
  created.maps.push(provisionedMap.id); created.users.push(provisionedMap.legacyUsuarioId);
  result = await request(`/api/platform/tenants/${b.id}/owners`, platformJar, { method: "POST", body: JSON.stringify({ email: addedEmail, confirm: true }) });
  assert("PlatformAdmin promove vínculo existente sem duplicar identidade", result.status === 201 && result.body.id === addedId && result.body.role === "OWNER");
  const promotion = await prisma.accessOwnerEvent.findFirst({ where: { targetMembershipId: addedId } });
  assert("designação OWNER registrada com estado anterior", promotion?.previousRole === "MEMBER" && promotion.actorIdentityId === platformIdentity.id);
  result = await request("/api/platform/tenants", platformJar);
  assert("readiness OWNER calculada no servidor", result.body.some(t => t.id === b.id && t.activeOwnerCount === 2 && t.lastOwnerDesignationAt));
  result = await request("/api/platform/identities", platformJar);
  assert("inventário de identidades não expõe credenciais", result.status === 200 && !JSON.stringify(result.body).includes("senhaHash"));
  result = await request("/api/platform/memberships", platformJar);
  assert("inventário de memberships inclui perfil", result.status === 200 && result.body.some(m => m.id === provisioned.id && m.profile?.nome === "ADMINISTRAÇÃO"));
  result = await request(`/api/platform/tenants/${platformTenant.id}`, platformJar, { method: "PATCH", body: JSON.stringify({ ativo: false }) });
  assert("PlatformAdmin inativa tenant", result.status === 200 && result.body.ativo === false);
  result = await request(`/api/platform/tenants/${platformTenant.id}`, platformJar, { method: "PATCH", body: JSON.stringify({ ativo: true }) });
  assert("PlatformAdmin reativa tenant", result.status === 200 && result.body.ativo === true);
  try { await prisma.tenantMembership.update({ where: { id: memberA.id }, data: { profileId: manager.id } });
    throw new Error("FK composta aceitou perfil cross-tenant");
  } catch (cause) { assert("FK composta rejeita perfil cross-tenant", cause.code === "P2003"); }
  console.log(`ACCESS-4 DEV: ${checks.length} verificações passaram. Fixtures serão removidas.`);
} finally {
  await prisma.accessOwnerEvent.deleteMany({ where: { tenantId: { in: created.tenants } } });
  for (const id of created.maps.reverse()) await prisma.legacyUserAccessMap.delete({ where: { id } });
  for (const id of created.members.reverse()) await prisma.tenantMembership.delete({ where: { id } });
  for (const id of created.users.reverse()) await prisma.usuario.delete({ where: { id } });
  for (const id of created.profiles.reverse()) await prisma.accessProfile.delete({ where: { id } });
  for (const id of created.platformGrants.reverse()) await prisma.platformAdmin.delete({ where: { id } });
  for (const id of created.identities.reverse()) await prisma.authIdentity.delete({ where: { id } });
  for (const id of created.tenants.reverse()) await prisma.tenant.delete({ where: { id } });
  await prisma.$disconnect();
}
