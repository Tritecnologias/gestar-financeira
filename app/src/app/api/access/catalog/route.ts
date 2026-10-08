import { NextResponse } from "next/server";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { ACCESS_CATALOG } from "@/lib/access-catalog";

export async function GET() {
  try { await requireTenantPermission("acessos.perfis.view"); }
  catch (error) { const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status }); }
  return NextResponse.json(ACCESS_CATALOG);
}
