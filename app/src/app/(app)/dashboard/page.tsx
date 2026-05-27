import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard – Gestar Financeira",
};

export default function DashboardPage() {
  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Visão geral do período</p>
        </div>
      </header>
      <div style={{ padding: "40px 28px", color: "var(--text-muted)", textAlign: "center" }}>
        🚧 Em construção – dados reais em breve
      </div>
    </div>
  );
}
