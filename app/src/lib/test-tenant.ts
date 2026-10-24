/** Reserved fixture slugs, presentation only: never a permission or auth bypass. */
export function testTenantLabel(slug?: string | null): string | null {
  if (slug === "modo-dev") return "MODO DEV — DADOS DE TESTE";
  if (slug === "modo-dev-isolamento") return "MODO DEV ISOLAMENTO — DADOS DE TESTE";
  return null;
}
