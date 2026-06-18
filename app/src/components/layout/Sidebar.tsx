"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import type { Papel } from "@/types";

interface SidebarProps {
  userNome: string;
  userPapel: Papel;
  tenantNome: string;
  tenantLogoUrl?: string | null;
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
    { letra: "e", label: "Dimensão Produtos/Serv", href: "/estrutura/dimensao-produtos"     },
    { letra: "f", label: "Dimensões Comerciais",   href: "/estrutura/dimensoes-comerciais"  },
  ]},
  { num: 3,  icon: "💰", label: "Fluxo de Caixa",          sub: [
    { letra: "a", label: "Lançamento", href: "/lancamentos"             },
    { letra: "b", label: "Relatórios", href: "/fluxo-caixa/relatorios" },
    { letra: "c", label: "Dashboards", href: "/fluxo-caixa/dashboards" },
    { letra: "—", label: "—", href: "---" },
    { letra: "d", label: "Investimentos", href: "/fluxo-caixa/investimentos" },
    { letra: "e", label: "Endividamento", href: "/fluxo-caixa/endividamento" },
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
  "/fluxo-caixa/relatorios", "/fluxo-caixa/dashboards",
  "/fluxo-caixa/investimentos", "/fluxo-caixa/endividamento",
  "/acao/tarefas", "/acao/5w2h", "/acao/calendario", "/acao/cronograma",
  "/orcamento/vendas-produto", "/orcamento/folha", "/orcamento/opex", "/orcamento/capex",
  "/relacionamento/fornecedores", "/relacionamento/clientes",
  "/compras/estoque", "/compras/solicitacao",
  "/custos/calculos", "/custos/matriz-bcg",
  "/pipeline/performance-comercial",
  "/plano-negocios/analise-situacional", "/plano-negocios/analise-swot",
]);

export default function Sidebar({ userNome, userPapel, tenantNome, tenantLogoUrl }: SidebarProps) {
  const pathname = usePathname();

  // ── Collapsed state ───────────────────────────────────────────
  // Sempre começa como false (expandido) para evitar hydration mismatch.
  // O valor persistido é aplicado após o mount via useEffect.
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Open groups para accordion ────────────────────────────────
  const defaultOpen = new Set<number>(
    MENU.filter((g) => g.sub?.some((s) => pathname.startsWith(s.href))).map((g) => g.num)
  );
  const [openGroups, setOpenGroups] = useState<Set<number>>(defaultOpen);

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
    setOpenGroups((prev) => {
      const next = new Set(prev);
      MENU.forEach((g) => {
        if (g.sub?.some((s) => pathname.startsWith(s.href))) next.add(g.num);
      });
      return next;
    });
  }, [pathname]);

  function toggleGroup(num: number) {
    // Se collapsed, expandir primeiro
    if (collapsed) {
      setCollapsed(false);
      setTimeout(() => setOpenGroups((prev) => new Set([...prev, num])), 10);
      return;
    }
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
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

  const group = tooltip !== null ? MENU.find((g) => g.num === tooltip.num) : null;

  // Classe calculada: antes do mount usa sempre 'expanded' (igual ao SSR)
  const sidebarClass = `sidebar ${mounted && collapsed ? "sidebar--collapsed" : "sidebar--expanded"}`;

  return (
    <>
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className={sidebarClass} suppressHydrationWarning>

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
                  Gestar<strong>Fin</strong>
                </span>
              </>
            )}
          </div>

          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={mounted && collapsed ? "Expandir menu" : "Recolher menu"}
            title={mounted && collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <span className={`toggle-icon ${mounted && collapsed ? "toggle-icon--open" : "toggle-icon--close"}`}>
              ‹
            </span>
          </button>
        </div>

        {/* ── Nav ───────────────────────────────────────────── */}
        <nav className="sidebar-nav" aria-label="Menu principal">
          {MENU.map((g) => {
            const hasSub   = g.sub && g.sub.length > 0;
            const isOpen   = openGroups.has(g.num);
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
                  style={{ maxHeight: (!(mounted && collapsed) && isOpen) ? `${g.sub!.length * 34}px` : "0" }}
                >
                  {g.sub!.map((item) => {
                    // Divisória
                    if (item.href === "---") return <div key="divider" className="sb-divider" style={{ margin: "4px 8px" }} />;
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

          {/* Admin global */}
          {userPapel === "admin_global" && (
            <>
              <div className="sb-divider" />
              <div
                className="sb-row-wrap"
                onMouseEnter={(e) => handleMouseEnterGroup(-1, e)}
                onMouseLeave={handleMouseLeaveGroup}
              >
                <Link
                  href="/admin"
                  className={`sb-row ${pathname.startsWith("/admin") ? "sb-row--active" : ""}`}
                >
                  <span className="sb-icon">🛡️</span>
                  <span className="sb-label">Admin Global</span>
                </Link>
              </div>
            </>
          )}

          {/* Configurações */}
          <div className="sb-divider" />
          <div
            className="sb-row-wrap"
            onMouseEnter={(e) => handleMouseEnterGroup(-2, e)}
            onMouseLeave={handleMouseLeaveGroup}
          >
            <Link
              href="/configuracoes"
              className={`sb-row ${pathname.startsWith("/configuracoes") ? "sb-row--active" : ""}`}
            >
              <span className="sb-icon">⚙️</span>
              <span className="sb-label">Configurações</span>
            </Link>
          </div>
        </nav>

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
            className="logout-btn"
            style={{ marginRight: 2 }}
          >
            🌙
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
      {collapsed && tooltip !== null && group && (
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
