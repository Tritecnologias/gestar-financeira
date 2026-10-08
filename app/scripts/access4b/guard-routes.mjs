/** One-time, idempotent codemod and coverage inventory for ACCESS-4B. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../src/app/api");
const entry = (base, methods) => [base, methods];
const shared = (...keys) => keys;
const map = new Map([
  entry("tarefas", { GET: "acao.tarefas.view", POST: "acao.tarefas.create" }),
  entry("tarefas/[id]", { PUT: "acao.tarefas.edit", DELETE: "acao.tarefas.delete" }),
  entry("tarefas/status", { GET: "acao.tarefas.view", POST: "acao.tarefas.create", PUT: "acao.tarefas.edit" }),
  ...["empresa", "dados-bancarios", "areas-negocio", "centros-custo"].flatMap(base => [
    entry(base, { GET: base === "centros-custo" ? shared("estrutura.empresa.view", "estrutura.pessoas.view") : "estrutura.empresa.view", POST: "estrutura.empresa.create" }),
    entry(`${base}/[id]`, { PUT: "estrutura.empresa.edit", DELETE: "estrutura.empresa.delete" }),
  ]),
  entry("estrutura-gerencial/importar", { POST: "estrutura.empresa.import" }),
  entry("estrutura-gerencial/exportar", { GET: "estrutura.empresa.export" }),
  entry("pessoas", { GET: "estrutura.pessoas.view", POST: "estrutura.pessoas.create" }),
  entry("pessoas/[id]", { PUT: "estrutura.pessoas.edit", DELETE: "estrutura.pessoas.delete" }),
  entry("pessoas/proximo-codigo", { GET: "estrutura.pessoas.view" }),
  entry("pessoas/importar", { POST: "estrutura.pessoas.import" }),
  entry("pessoas/exportar", { GET: "estrutura.pessoas.export" }),
  ...["categorias", "plano-contas"].flatMap(base => [
    entry(base, { GET: shared("estrutura.financeiras.view", "estrutura.cadastrais.view", "fluxo.lancamentos.view"), POST: "estrutura.financeiras.create" }),
    entry(`${base}/[id]`, { PUT: "estrutura.financeiras.edit", DELETE: "estrutura.financeiras.delete" }),
  ]),
  entry("estrutura-financeira/importar", { POST: "estrutura.financeiras.import" }),
  entry("estrutura-financeira/exportar", { GET: "estrutura.financeiras.export" }),
  entry("dre", { GET: shared("estrutura.financeiras.view", "fluxo.lancamentos.view"), POST: "estrutura.financeiras.create" }),
  entry("dre/[id]", { PUT: "estrutura.financeiras.edit", DELETE: "estrutura.financeiras.delete" }),
  ...["clientes", "fornecedores"].flatMap(base => [
    entry(base, { GET: shared("estrutura.cadastrais.view", "fluxo.lancamentos.view"), POST: "estrutura.cadastrais.create" }),
    entry(`${base}/[id]`, { PUT: "estrutura.cadastrais.edit", DELETE: "estrutura.cadastrais.delete" }),
  ]),
  entry("dimensoes-cadastrais/importar", { POST: "estrutura.cadastrais.import" }),
  entry("dimensoes-cadastrais/exportar", { GET: "estrutura.cadastrais.export" }),
  ...["produtos", "produto-grupos", "produto-tipos", "produto-linhas"].flatMap(base => [
    entry(base, { GET: "estrutura.portfolio.view", POST: "estrutura.portfolio.create" }),
    entry(`${base}/[id]`, { PUT: "estrutura.portfolio.edit", PATCH: "estrutura.portfolio.edit", DELETE: "estrutura.portfolio.delete" }),
  ]),
  entry("produtos/importar", { POST: "estrutura.portfolio.import" }),
  entry("produtos/exportar", { GET: "estrutura.portfolio.export" }),
  entry("fluxo-caixa/relatorio", { GET: "fluxo.relatorios.view" }),
  entry("fluxo-caixa/analises", { GET: "fluxo.analises.view" }),
  entry("dashboard", { GET: "fluxo.visao.saldos" }),
  entry("status-tipos", { GET: shared("fluxo.lancamentos.view", "fluxo.relatorios.view"), POST: "fluxo.lancamentos.edit" }),
  entry("status-tipos/[id]", { PUT: "fluxo.lancamentos.edit", DELETE: "fluxo.lancamentos.edit" }),
  entry("status-tipos/config", { GET: "fluxo.lancamentos.view", PUT: "fluxo.lancamentos.edit" }),
  entry("layouts", { GET: "fluxo.lancamentos.view", POST: "fluxo.lancamentos.view" }),
  entry("layouts/[id]", { DELETE: "fluxo.lancamentos.view" }),
  entry("usuarios", { GET: "acessos.usuarios.view" }),
]);

const applying = process.argv.includes("--apply");
let count = 0;
for (const [path, methods] of map) {
  const file = resolve(root, path, "route.ts");
  let source = readFileSync(file, "utf8");
  for (const [method, key] of Object.entries(methods)) {
    const re = new RegExp(`export async function ${method}\\([\\s\\S]*?\\)\\s*\\{`);
    const match = re.exec(source);
    if (!match) throw new Error(`Missing ${method} ${path}`);
    const bodyStart = match.index + match[0].length;
    const check = `const access = await guardApi(${JSON.stringify(key)}); if (access) return access;`;
    if (!source.slice(bodyStart, bodyStart + 240).includes(check)) {
      if (!applying) throw new Error(`Unguarded ${method} ${path}`);
      source = source.slice(0, bodyStart) + `\n  ${check}` + source.slice(bodyStart);
    }
    count++;
  }
  if (applying && !source.includes('import { guardApi } from "@/lib/permissions";')) {
    source = `import { guardApi } from "@/lib/permissions";\n` + source;
  }
  if (applying) writeFileSync(file, source);
}
console.log(`ACCESS-4B: ${count} handlers mapped and ${applying ? "guarded" : "verified"}.`);
