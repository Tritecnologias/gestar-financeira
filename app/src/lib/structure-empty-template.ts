import { NextResponse } from "next/server";
import { createFinancialStructureWorkbook } from "./financial-import-template";
import { createManagementStructureWorkbook } from "./management-import-template";
import { createPeopleWorkbook } from "./people-import-template";
import { createRegistrationWorkbook } from "./registration-import-template";
import { createProductStructureWorkbook } from "./product-import-template";

export function emptyStructureTemplate(request: Request, contract: string) {
  if (new URL(request.url).searchParams.get("template") !== "1") return null;
  const factories: Record<string, () => ArrayBuffer> = {
    financial: () => createFinancialStructureWorkbook([],[]), management: () => createManagementStructureWorkbook([],[]),
    people: () => createPeopleWorkbook([]), registration: () => createRegistrationWorkbook([],[]), product: () => createProductStructureWorkbook([],[],[],[]),
  };
  return new NextResponse(factories[contract](), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="modelo_${contract}_10s.xlsx"`, "Cache-Control": "private, no-store" } });
}
