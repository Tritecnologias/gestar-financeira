import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Visão Geral – Dez Soluções",
};

export default function DashboardPage() {
  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Visão Geral</h1>
          <p className="page-sub">Visão geral do período</p>
        </div>
      </header>
      <div style={{ padding: "40px 28px", color: "var(--text-muted)", textAlign: "center" }}>
        🚧 Em construção – dados reais em breve
      </div>
    </div>
  );
}
