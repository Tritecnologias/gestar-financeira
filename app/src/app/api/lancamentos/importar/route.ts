// Retired CSV/JSON importer: no body parsing, database access or write path.
// The product uses /api/lancamentos/importacao-oficial and its existing guards.
export async function POST() {
  return Response.json({
    error: "Importador legado desativado. Use Importar Lançamentos (XLSX oficial).",
    code: "LEGACY_IMPORT_RETIRED",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
