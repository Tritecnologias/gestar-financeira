"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import type { Papel } from "@/types";
import { viewPermissionForPath } from "@/lib/access-catalog";

interface SidebarProps {
  userNome: string;
  userPapel: Papel;
  tenantNome: string;
  tenantLogoUrl?: string | null;
  authMode?: "identity" | "legacy";
  platformAdmin?: boolean;
  permissions?: string[];
}

interface SubItem {
  label: string;
  href: string;
  letra: string;
}

interface MenuGroup {
  num: number;
  label: string;
  icon: string;
  href?: string;
  disabled?: boolean;
  sub?: SubItem[];
}

const MENU: MenuGroup[] = [
  { num: 0,  icon: "📚", label: "Tutoriais",               href: "/tutoriais",         disabled: true  },
  { num: 1,  icon: "⚡", label: "Ação",                    sub: [
    { letra: "a", label: "Tarefas",    href: "/acao/tarefas"    },
    { letra: "b", label: "5W2H",       href: "/acao/5w2h"       },
    { letra: "c", label: "Calendário", href: "/acao/calendario" },
    { letra: "d", label: "Cronograma", href: "/acao/cronograma" },
  ]},
  { num: 2,  icon: "🏢", label: "Estrutura Empresa",       sub: [
    { letra: "a", label: "Dimensão da Empresa",    href: "/estrutura/dimensao-empresa"      },
    { letra: "b", label: "Dimensão de Pessoas",    href: "/estrutura/dimensao-pessoas"      },
    { letra: "c", label: "Dimensões Financeiras",  href: "/estrutura/dimensoes-financeiras" },
    { letra: "d", label: "Dimensões Cadastrais",   href: "/estrutura/dimensoes-cadastrais"  },
    { letra: "e", label: "Dimensão de Portfólio", href: "/estrutura/dimensao-produtos"     },
    { letra: "f", label: "Dimensões Comerciais",   href: "/estrutura/dimensoes-comerciais"  },
  ]},
  { num: 3,  icon: "💰", label: "Fluxo de Caixa",          sub: [
    { letra: "a", label: "Visão Geral", href: "/fluxo-caixa/dashboards" },
    { letra: "b", label: "Lançamentos", href: "/lancamentos" },
    { letra: "c", label: "Relatórios", href: "/fluxo-caixa/relatorios" },
    { letra: "d", label: "Análises", href: "/fluxo-caixa/graficos" },
  ]},
  { num: 4,  icon: "📊", label: "Orçamento Empresarial",   sub: [
    { letra: "a", label: "Vendas por Produto", href: "/orcamento/vendas-produto" },
    { letra: "b", label: "Folha",              href: "/orcamento/folha"          },
    { letra: "c", label: "Opex",               href: "/orcamento/opex"           },
    { letra: "d", label: "Capex",              href: "/orcamento/capex"          },
  ]},
  { num: 5,  icon: "🤝", label: "Relacionamento",          sub: [
    { letra: "a", label: "Contato Fornecedores", href: "/relacionamento/fornecedores" },
    { letra: "b", label: "Contato Clientes",     href: "/relacionamento/clientes"     },
  ]},
  { num: 6,  icon: "🛒", label: "Compras",                 sub: [
    { letra: "a", label: "Estoque",             href: "/compras/estoque"    },
    { letra: "b", label: "Solicitação Compras", href: "/compras/solicitacao" },
  ]},
  { num: 7,  icon: "💲", label: "Custos e Preço de Venda", sub: [
    { letra: "a", label: "Cálculos",   href: "/custos/calculos"   },
    { letra: "b", label: "Matriz BCG", href: "/custos/matriz-bcg" },
  ]},
  { num: 8,  icon: "📈", label: "Pipeline de Vendas",      sub: [
    { letra: "a", label: "Performance Comercial", href: "/pipeline/performance-comercial" },
  ]},
  { num: 9,  icon: "🔍", label: "Estudo Financeiro",       href: "/estudo-financeiro", disabled: true  },
  { num: 10, icon: "📋", label: "Plano de Negócios",       sub: [
    { letra: "a", label: "Análise Situacional", href: "/plano-negocios/analise-situacional" },
    { letra: "b", label: "Análise SWOT",        href: "/plano-negocios/analise-swot"        },
  ]},
  { num: 11, icon: "⚙️", label: "Processos/Procedimentos", href: "/processos",         disabled: true  },
];

const DISABLED_HREFS = new Set([
  "/acao/5w2h", "/acao/calendario", "/acao/cronograma",
  "/orcamento/vendas-produto", "/orcamento/folha", "/orcamento/opex", "/orcamento/capex",
  "/relacionamento/fornecedores", "/relacionamento/clientes",
  "/compras/estoque", "/compras/solicitacao",
  "/custos/calculos", "/custos/matriz-bcg",
  "/pipeline/performance-comercial",
  "/plano-negocios/analise-situacional", "/plano-negocios/analise-swot",
]);

// ── Tenant Selector: memberships (ou compatibilidade admin_global legado) ──
function TenantSelector({ defaultTenantNome, legacyGlobal }: { defaultTenantNome: string; legacyGlobal: boolean }) {
  type Choice = { id: string; nome: string; kind?: "MEMBERSHIP" | "SUPPORT_GRANT";
    grantId?: string; accessLevel?: string; expiresAt?: string; isActive?: boolean };
  const [tenants, setTenants] = useState<Choice[]>([]);
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/tenants")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setTenants(d);
          const current = d.find((t: any) => t.isActive);
          if (current) setActive(current.grantId ?? current.id);
        }
      })
      .catch(() => {});
  }, []);

  const switchTenant = async (choice: Choice) => {
    const res = await fetch("/api/tenants/switch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: choice.id, ...(choice.grantId ? { grantId: choice.grantId } : {}) }) });
    if (!res.ok) { window.location.assign("/selecionar-tenant"); return; }
    setActive(choice.grantId ?? choice.id);
    setOpen(false);
    window.location.assign(choice.kind === "SUPPORT_GRANT" ? "/estrutura/dimensao-empresa" : "/inicio");
  };

  const resetTenant = async () => {
    await fetch("/api/tenants/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: null }) });
    setActive("");
    setOpen(false);
    window.location.reload();
  };

  if (tenants.length <= 1) return null;

  const activeTenant = tenants.find(t => (t.grantId ?? t.id) === active);
  const isCustomTenant = legacyGlobal && active && active !== "00000000-0000-0000-0000-000000000001";

  return (
    <div className="sidebar-tenant-selector" style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", position: "relative" }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          background: isCustomTenant ? "var(--selection)" : "var(--surface-hover)",
          border: `1px solid ${isCustomTenant ? "var(--focus)" : "var(--border)"}`,
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 11,
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          color: "var(--text-primary)",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          🏢 {activeTenant?.nome || defaultTenantNome || "Trocar Empresa"}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▼</span>
      </button>
      {open && (
        <div className="sidebar-tenant-options" style={{ position: "absolute", bottom: "100%", left: 10, right: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-elevated)", padding: 8, zIndex: 100, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, padding: "2px 4px" }}>
            Alternar Empresa / Tenant
          </div>
          {legacyGlobal && isCustomTenant && (
            <button
              onClick={resetTenant}
              style={{ width: "100%", padding: "7px 10px", fontSize: 11, background: "var(--selection)", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", color: "var(--action)", marginBottom: 6, textAlign: "left", fontWeight: 700 }}
            >
              ↩ Voltar ao meu tenant (Dez Soluções)
            </button>
          )}
          {tenants.map((t, index) => (
            <div key={t.grantId ?? t.id}>
            {(index === 0 || tenants[index - 1].kind !== t.kind) && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", padding: "8px 4px 4px" }}>
              {t.kind === "SUPPORT_GRANT" ? "SUPORTE AUTORIZADO" : "MEUS TENANTS"}</div>}
            <button
              onClick={() => switchTenant(t)}
              style={{
                width: "100%",
                padding: "6px 10px",
                fontSize: 11,
                background: active === (t.grantId ?? t.id) ? "var(--selection)" : "transparent",
                border: active === (t.grantId ?? t.id) ? "1px solid var(--focus)" : "none",
                borderRadius: 5,
                cursor: "pointer",
                color: "var(--text-primary)",
                textAlign: "left",
                marginBottom: 3,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontWeight: active === (t.grantId ?? t.id) ? 700 : 500,
              }}
            >
              <span>{t.nome}{t.kind === "SUPPORT_GRANT" && <small style={{ display: "block", color: "var(--warning)" }}>
                {t.accessLevel === "READ_ONLY" ? "Somente leitura" : "Operacional"} · até {t.expiresAt ? new Date(t.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </small>}</span>
              {active === (t.grantId ?? t.id) && <span style={{ fontSize: 11, color: "var(--action)" }}>✓ Ativo</span>}
            </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ userNome, userPapel, tenantNome, tenantLogoUrl, authMode, platformAdmin, permissions = [] }: SidebarProps) {
  const pathname = usePathname();
  const allowed = new Set(permissions);
  const menu = MENU.map(group => ({ ...group,
    sub: group.sub?.filter(item => {
      const key = viewPermissionForPath(item.href);
      return !key || allowed.has(key);
    }),
  })).filter(group => !group.sub || group.sub.length > 0);

  // ── Collapsed state ───────────────────────────────────────────
  // Sempre começa como false (expandido) para evitar hydration mismatch.
  // O valor persistido é aplicado após o mount via useEffect.
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);

  // ── Um único grupo aberto por vez ─────────────────────────────
  const activeGroup = menu.find((g) => g.sub?.some((s) => pathname.startsWith(s.href)))?.num ?? null;
  const [openGroup, setOpenGroup] = useState<number | null>(activeGroup);

  // ── Tooltip para modo compacto ────────────────────────────────
  const [tooltip, setTooltip] = useState<{ num: number; y: number } | null>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lê o localStorage apenas no cliente, após a hidratação
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    // Carregar tema salvo
    const theme = localStorage.getItem("theme");
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  // Persiste mudanças (só após mount para não rodar no SSR)
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed, mounted]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => {
      setIsMobile(media.matches);
      setMobileOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const focusFrame = requestAnimationFrame(() => sidebarToggleRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const controls = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'))
        .filter((element) => element.getClientRects().length > 0 && !element.closest('.sb-sub[style*="max-height: 0"]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (activeGroup !== null) setOpenGroup(activeGroup);
    setMobileOpen(false);
  }, [pathname, activeGroup]);

  function toggleGroup(num: number) {
    // Se collapsed, expandir primeiro
    if (collapsed && !isMobile) {
      setCollapsed(false);
      setOpenGroup(num);
      return;
    }
    setOpenGroup((prev) => prev === num ? (activeGroup === num ? num : null) : num);
  }

  function closeMobileMenu() {
    setMobileOpen(false);
    mobileTriggerRef.current?.focus();
  }

  function handleMouseEnterGroup(num: number, e: React.MouseEvent) {
    if (!collapsed) return;
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ num, y: rect.top + rect.height / 2 });
  }

  function handleMouseLeaveGroup() {
    if (!collapsed) return;
    tooltipTimeout.current = setTimeout(() => setTooltip(null), 100);
  }

  const iniciais = userNome.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const group = tooltip !== null ? menu.find((g) => g.num === tooltip.num) : null;

  // Classe calculada: antes do mount usa sempre 'expanded' (igual ao SSR)
  const compact = mounted && collapsed && !isMobile;
  const sidebarClass = `sidebar ${compact ? "sidebar--collapsed" : "sidebar--expanded"}${mobileOpen ? " sidebar--mobile-open" : ""}`;

  return (
    <>
      <button
        ref={mobileTriggerRef}
        type="button"
        className="mobile-menu-trigger"
        aria-label="Abrir menu"
        aria-expanded={mobileOpen}
        aria-controls="application-sidebar"
        onClick={() => setMobileOpen(true)}
      >
        ☰
      </button>
      {mobileOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={closeMobileMenu} />}
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside id="application-sidebar" ref={sidebarRef} className={sidebarClass} aria-label="Navegação principal" aria-hidden={isMobile && !mobileOpen} inert={isMobile && !mobileOpen} suppressHydrationWarning>

        {/* ── Header: Logo + Toggle ─────────────────────────── */}
        <div className="sidebar-header">
          <div className="sidebar-logo-wrap">
            {tenantLogoUrl ? (
              <Image
                src={tenantLogoUrl}
                alt="Logo"
                width={160}
                height={48}
                style={{ objectFit: "contain", maxHeight: 48 }}
                unoptimized
              />
            ) : (
              <>
                <span className="sb-logo-icon">💼</span>
                <span className="sb-logo-text">
                  Dez <strong>Soluções</strong>
                </span>
              </>
            )}
          </div>

          <button
            ref={sidebarToggleRef}
            className="sidebar-toggle"
            onClick={() => isMobile ? closeMobileMenu() : setCollapsed((c) => !c)}
            aria-label={isMobile ? "Fechar menu" : compact ? "Expandir menu" : "Recolher menu"}
            title={isMobile ? "Fechar menu" : compact ? "Expandir menu" : "Recolher menu"}
          >
            <span className={`toggle-icon ${compact ? "toggle-icon--open" : "toggle-icon--close"}`}>
              ‹
            </span>
          </button>
        </div>

        {/* ── Nav ───────────────────────────────────────────── */}
        <nav className="sidebar-nav" aria-label="Menu principal">
          {menu.map((g) => {
            const hasSub   = g.sub && g.sub.length > 0;
            const isOpen   = openGroup === g.num;
            const hasActive = g.sub?.some((s) => pathname.startsWith(s.href)) ?? false;
            const isSelfActive = !hasSub && g.href && pathname.startsWith(g.href) && !g.disabled;

            // ── Grupo sem sub-itens ──────────────────────────
            if (!hasSub) {
              return (
                <div
                  key={g.num}
                  className="sb-row-wrap"
                  onMouseEnter={(e) => handleMouseEnterGroup(g.num, e)}
                  onMouseLeave={handleMouseLeaveGroup}
                >
                  {g.disabled ? (
                    <div className={`sb-row sb-row--disabled`}>
                      <span className="sb-icon">{g.icon}</span>
                      <span className="sb-label">
                        <span className="sb-num">#{g.num}.</span> {g.label}
                      </span>
                    </div>
                  ) : (
                    <Link
                      href={g.href!}
                      className={`sb-row ${isSelfActive ? "sb-row--active" : ""}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className="sb-icon">{g.icon}</span>
                      <span className="sb-label">
                        <span className="sb-num">#{g.num}.</span> {g.label}
                      </span>
                    </Link>
                  )}
                </div>
              );
            }

            // ── Grupo com sub-itens ──────────────────────────
            return (
              <div
                key={g.num}
                className={`sb-group ${isOpen ? "sb-group--open" : ""}`}
                onMouseEnter={(e) => handleMouseEnterGroup(g.num, e)}
                onMouseLeave={handleMouseLeaveGroup}
              >
                <button
                  className={`sb-row sb-row--trigger ${hasActive ? "sb-row--has-active" : ""}`}
                  onClick={() => toggleGroup(g.num)}
                  aria-expanded={isOpen}
                >
                  <span className="sb-icon">{g.icon}</span>
                  <span className="sb-label">
                    <span className="sb-num">#{g.num}.</span> {g.label}
                  </span>
                  <span className="sb-chevron" aria-hidden>›</span>
                </button>

                {/* Sub-itens */}
                <div
                  className="sb-sub"
                  style={{ maxHeight: (!compact && isOpen) ? `${g.sub!.length * (isMobile ? 48 : 34)}px` : "0" }}
                >
                  {g.sub!.map((item) => {
                    // Divisória
                    if (item.href.startsWith("---")) return <div key={item.href} className="sb-divider" style={{ margin: "4px 8px" }} />;
                    const isDisabled = DISABLED_HREFS.has(item.href);
                    const isActive   = pathname.startsWith(item.href);
                    return isDisabled ? (
                      <div key={item.href} className="sb-sub-item sb-sub-item--disabled">
                        <span className="sb-sub-letra">{item.letra}.</span>
                        <span className="sb-sub-label">{item.label}</span>
                      </div>
                    ) : (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`sb-sub-item ${isActive ? "sb-sub-item--active" : ""}`}
                        onClick={() => setMobileOpen(false)}
                      >
                        <span className="sb-sub-letra">{item.letra}.</span>
                        <span className="sb-sub-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Administração de acesso, separada do contexto empresarial */}
          {(platformAdmin || userPapel === "admin_global" || allowed.has("acessos.usuarios.view") || allowed.has("acessos.perfis.view") || allowed.has("acessos.auditoria.view")) && (
            <>
              <div className="sb-divider" />
              {platformAdmin && <div
                className="sb-row-wrap"
                onMouseEnter={(e) => handleMouseEnterGroup(-1, e)}
                onMouseLeave={handleMouseLeaveGroup}
              >
                <Link
                  href="/plataforma"
                  className={`sb-row ${pathname.startsWith("/plataforma") ? "sb-row--active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="sb-icon">🛡️</span>
                  <span className="sb-label">Administração da Plataforma</span>
                </Link>
              </div>}
              {allowed.has("acessos.usuarios.view") && <div className="sb-row-wrap">
                <Link href="/acessos" className={`sb-row ${pathname === "/acessos" ? "sb-row--active" : ""}`} onClick={() => setMobileOpen(false)}>
                  <span className="sb-icon">🛡️</span><span className="sb-label">Acessos / Usuários</span>
                </Link>
              </div>}
              {allowed.has("acessos.perfis.view") && <div className="sb-row-wrap">
                <Link href="/acessos/perfis" className={`sb-row ${pathname.startsWith("/acessos/perfis") ? "sb-row--active" : ""}`} onClick={() => setMobileOpen(false)}>
                  <span className="sb-icon">🔑</span><span className="sb-label">Perfis de Acesso</span>
                </Link>
              </div>}
              {allowed.has("acessos.auditoria.view") && <div className="sb-row-wrap">
                <Link href="/acessos/auditoria" className={`sb-row ${pathname.startsWith("/acessos/auditoria") ? "sb-row--active" : ""}`} onClick={() => setMobileOpen(false)}>
                  <span className="sb-icon">📋</span><span className="sb-label">Auditoria</span>
                </Link>
              </div>}
            </>
          )}

          {/* Configurações */}
          {allowed.has("sistema.configuracoes.view") && <div className="sb-divider" />}
          {allowed.has("sistema.configuracoes.view") && <div
            className="sb-row-wrap"
            onMouseEnter={(e) => handleMouseEnterGroup(-2, e)}
            onMouseLeave={handleMouseLeaveGroup}
          >
            <Link
              href="/configuracoes"
              className={`sb-row ${pathname.startsWith("/configuracoes") ? "sb-row--active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className="sb-icon">⚙️</span>
              <span className="sb-label">Configurações</span>
            </Link>
          </div>}
        </nav>

        {/* ── Tenant Selector ─────────────────────────────────── */}
        {(authMode === "identity" || userPapel === "admin_global") && (
          <TenantSelector defaultTenantNome={tenantNome} legacyGlobal={authMode === "legacy" && userPapel === "admin_global"} />
        )}

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="sidebar-footer">
          <div className="avatar">{iniciais}</div>
          <div className="sb-footer-info">
            <div className="user-name">{userNome}</div>
            <div className="user-role">{tenantNome}</div>
          </div>
          <button
            onClick={() => {
              const html = document.documentElement;
              const current = html.getAttribute("data-theme");
              const next = current === "dark" ? "light" : "dark";
              html.setAttribute("data-theme", next);
              localStorage.setItem("theme", next);
            }}
            title="Alternar tema claro/escuro"
            aria-label="Alternar tema claro/escuro"
            className="logout-btn theme-toggle"
            style={{ marginRight: 2 }}
          >
            <span className="theme-icon--clean" aria-hidden="true">☀️</span>
            <span className="theme-icon--dark" aria-hidden="true">🌙</span>
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sair"
            className="logout-btn"
          >
            ⏻
          </button>
        </div>
      </aside>

      {/* ── Tooltip flutuante no modo compacto ─────────────── */}
      {compact && tooltip !== null && group && (
        <div
          className="sb-tooltip"
          style={{ top: tooltip.y }}
          onMouseEnter={() => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); }}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="sb-tooltip-icon">{group.icon}</span>
          <span className="sb-tooltip-label">{group.label}</span>
          {group.sub && (
            <div className="sb-tooltip-sub">
              {group.sub.map((s) => {
                const isDisabled = DISABLED_HREFS.has(s.href);
                const isActive   = pathname.startsWith(s.href);
                return isDisabled ? (
                  <div key={s.href} className="sb-tooltip-item sb-tooltip-item--disabled">
                    <span>{s.letra}.</span> {s.label}
                  </div>
                ) : (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={`sb-tooltip-item ${isActive ? "sb-tooltip-item--active" : ""}`}
                    onClick={() => setTooltip(null)}
                  >
                    <span>{s.letra}.</span> {s.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
