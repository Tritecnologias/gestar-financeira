import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Solicitação de Compras – Gestar Financeira' };

export default function Page() {
  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Solicitação de Compras</h1>
          <p className="page-sub">Compras</p>
        </div>
      </header>
      <div style={{ padding: '60px 28px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Solicitação de Compras</div>
        <div style={{ fontSize: 13 }}>Esta tela está em desenvolvimento. Em breve disponível.</div>
      </div>
    </div>
  );
}
