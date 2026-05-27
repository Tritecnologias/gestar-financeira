import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dimensão de Pessoas – Gestar Financeira' };

export default function Page() {
  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Dimensão de Pessoas</h1>
          <p className="page-sub">Estrutura Empresa</p>
        </div>
      </header>
      <div style={{ padding: '60px 28px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Dimensão de Pessoas</div>
        <div style={{ fontSize: 13 }}>Esta tela está em desenvolvimento. Em breve disponível.</div>
      </div>
    </div>
  );
}
