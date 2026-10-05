/** ACCESS-4B route layouts for client pages; verifies coverage on reruns. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../src/app/(app)");
const pages = new Map([
  ["acao/tarefas", "acao.tarefas.view"],
  ["estrutura/dimensao-empresa", "estrutura.empresa.view"],
  ["estrutura/dimensao-pessoas", "estrutura.pessoas.view"],
  ["estrutura/dimensoes-financeiras", "estrutura.financeiras.view"],
  ["estrutura/dimensoes-cadastrais", "estrutura.cadastrais.view"],
  ["estrutura/dimensao-produtos", "estrutura.portfolio.view"],
  ["estrutura/dimensoes-comerciais", "estrutura.comerciais.view"],
  ["fluxo-caixa/relatorios", "fluxo.relatorios.view"],
  ["fluxo-caixa/graficos", "fluxo.analises.view"],
  ["dashboard", "fluxo.visao.view"],
]);
for (const [path, key] of pages) {
  const file = resolve(root, path, "layout.tsx");
  const source = `import { requirePermission } from "@/lib/permissions";\nimport { redirect } from "next/navigation";\n\nexport default async function AuthorizedLayout({ children }: { children: React.ReactNode }) {\n  try { await requirePermission("${key}"); }\n  catch { redirect("/acesso-negado"); }\n  return children;\n}\n`;
  if (!existsSync(file)) {
    if (!process.argv.includes("--apply")) throw new Error(`Missing guard: ${path}`);
    writeFileSync(file, source);
  } else if (readFileSync(file, "utf8") !== source) {
    throw new Error(`Unexpected layout: ${path}`);
  }
}
console.log(`ACCESS-4B: ${pages.size} client-page route guards verified.`);
