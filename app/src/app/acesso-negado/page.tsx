import Link from "next/link";

export default function AcessoNegado() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center",
    background: "var(--background)", color: "var(--text-primary)", padding: 24 }}>
    <section style={{ background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: 28, maxWidth: 440 }}>
      <h1>Acesso não autorizado</h1>
      <p>Seu perfil não permite abrir esta tela no tenant selecionado.</p>
      <Link href="/">Voltar ao início</Link>
    </section>
  </main>;
}
