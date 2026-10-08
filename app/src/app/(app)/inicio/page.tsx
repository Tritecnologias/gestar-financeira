import Link from "next/link";
import { ACCESS_CATALOG } from "@/lib/access-catalog";
import { permissionsFor } from "@/lib/permissions";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import "./inicio.css";

export default async function InicioPage() {
  const context = await requireSession();
  const { session } = context;
  const permissions = await permissionsFor(context);
  const profile = session.membershipId
    ? await prisma.tenantMembership.findFirst({
      where: { id: session.membershipId, tenantId: session.tenantId, status: "ACTIVE" },
      select: { profile: { select: { nome: true, ativo: true } } },
    })
    : null;
  const sections = ACCESS_CATALOG.map(module => ({
    id: module.id,
    label: module.label,
    screens: module.screens.filter(screen => permissions.has(`${module.id}.${screen.id}.view`)),
  })).filter(module => module.screens.length > 0);
  const owner = session.membershipRole === "OWNER";
  const responsible = owner && session.membershipId
    ? await prisma.tenantContractualResponsible.findUnique({
      where: { tenantId: session.tenantId }, select: { membershipId: true },
    })
    : null;
  const canApproveSupport = responsible?.membershipId === session.membershipId;

  return <div className="onboarding-page"><div className="onboarding-content">
    <header className="onboarding-header">
      <span className="onboarding-eyebrow">DEZ SOLUÇÕES · INÍCIO</span>
      <h1>Bem-vindo ao 10S</h1>
      <p>Você está em <strong>{session.tenantNome}</strong>. Confira seu acesso e escolha por onde começar.</p>
    </header>

    <section className="onboarding-panel" aria-labelledby="onboarding-access-title">
      <h2 id="onboarding-access-title">Seu acesso</h2>
      <dl className="onboarding-facts">
        <div><dt>Identidade</dt><dd>{session.nome}{session.email ? <small>{session.email}</small> : null}</dd></div>
        <div><dt>Empresa selecionada</dt><dd>{session.tenantNome}</dd></div>
        <div><dt>Papel no tenant</dt><dd>{owner ? "Responsável pelo tenant (OWNER)" : session.membershipRole === "ADMIN" ? "Administrador" : session.membershipRole === "MEMBER" ? "Membro" : "Acesso legado"}</dd></div>
        <div><dt>Perfil de Acesso</dt><dd>{profile?.profile?.ativo ? profile.profile.nome : "Sem perfil ativo"}</dd></div>
      </dl>
      <p className="onboarding-note">Se seus dados ou vínculos estiverem incorretos, solicite a revisão ao administrador. Documentos obrigatórios pendentes são apresentados antes da entrada no sistema.</p>
      {session.authMode === "identity" && <Link href="/selecionar-tenant" className="onboarding-link">Trocar empresa</Link>}
    </section>

    {owner && <section className="onboarding-panel" aria-labelledby="onboarding-owner-title">
      <h2 id="onboarding-owner-title">Primeira configuração do tenant</h2>
      <p>Como OWNER, você administra os acessos deste tenant e acompanha termos e auditoria. A aprovação de suporte cabe ao responsável contratual designado.</p>
      <div className="onboarding-actions">
        <Link href="/acessos">Usuários e acessos</Link>
        <Link href="/acessos/perfis">Perfis de Acesso</Link>
        {canApproveSupport && <Link href="/acessos/suporte">Suporte</Link>}
        <Link href="/acessos/auditoria">Auditoria</Link>
        {permissions.has("estrutura.empresa.view") && <Link href="/estrutura/dimensao-empresa">Estrutura Empresa</Link>}
        {permissions.has("estrutura.financeiras.view") && <Link href="/estrutura/dimensoes-financeiras">Dimensões Financeiras</Link>}
      </div>
    </section>}

    <section className="onboarding-panel" aria-labelledby="onboarding-modules-title">
      <h2 id="onboarding-modules-title">Telas disponíveis neste tenant</h2>
      {sections.length ? <div className="onboarding-modules">{sections.map(module =>
        <div key={module.id}><h3>{module.label}</h3><div className="onboarding-actions">
          {module.screens.map(screen => <Link key={screen.id} href={screen.href}>{screen.label}</Link>)}
        </div></div>)}</div> : <p>Seu perfil ainda não oferece telas de trabalho. Peça ao administrador que revise seu Perfil de Acesso.</p>}
    </section>
  </div></div>;
}
