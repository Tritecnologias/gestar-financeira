import { NextResponse } from "next/server";
import { backupPool, backupContext, backupConfig } from "@/lib/backup-service";
import { createBackup, previewRestore, restoreBackup, restoreReceipt } from "@/lib/backup/engine.mjs";
import { MAX_BYTES, parse } from "@/lib/backup/format.mjs";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function errorResponse(e: unknown) {
  const cause = e as { status?: number; code?: string; message?: string };
  const known = cause.status && cause.status >= 400 && cause.status < 500;
  return NextResponse.json({ error: known ? cause.message : "Resultado não confirmado. Consulte o recibo antes de repetir a restauração.",
    code: known ? cause.code : "UNCONFIRMED" }, { status: known ? cause.status : 503, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: Request) {
  try {
    const attempt = new URL(request.url).searchParams.get("attempt");
    if (attempt) return NextResponse.json({ receipt: await restoreReceipt(backupPool(), await backupContext("restore"), attempt) }, { headers: { "Cache-Control": "no-store" } });
    const context = await backupContext("create");
    const backup = await createBackup(backupPool(), context, backupConfig());
    const body = JSON.stringify(backup);
    return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="10s-tenant-${context.tenantId}-${new Date().toISOString().slice(0,10)}.json"`,
      "Content-Length": String(Buffer.byteLength(body)), "X-Backup-Checksum": backup.checksum, "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  let auditActor: Awaited<ReturnType<typeof backupContext>> | undefined;
  try {
    // Same-origin only; no credentialed cross-origin restores.
    if (request.headers.get("origin") !== new URL(process.env.APP_PUBLIC_URL ?? request.url).origin) {
      return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    }
    const context = await backupContext("restore");
    auditActor = context;
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return NextResponse.json({ error: "Limite de 8 MB excedido." }, { status: 413 }); }
      chunks.push(r.value);
    }
    const backup = parse(Buffer.concat(chunks), context.tenantId);
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "restore") {
      if (request.headers.get("x-backup-confirm") !== context.tenantId) return NextResponse.json({ error: "Confirme a empresa de destino." }, { status: 400 });
      const receipt = await restoreBackup(backupPool(), context, backup, backupConfig(), request.headers.get("x-backup-preview"), request.headers.get("x-backup-attempt"));
      return NextResponse.json({ receipt }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ preview: await previewRestore(backupPool(), context, backup, backupConfig()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (auditActor) await writeAudit(prisma, { tenantId: auditActor.tenantId, actorIdentityId: auditActor.identityId,
      actorMembershipId: auditActor.membershipId, accessMode: "MEMBERSHIP", action: (e as { status?: number }).status ? "TENANT_RESTORE_REQUEST_REJECTED" : "TENANT_RESTORE_RESULT_UNCONFIRMED",
      resourceType: "TenantBackup", result: "FAILURE", metadata: { outcome: (e as { status?: number }).status ? "REJECTED" : "UNCONFIRMED" } }).catch(() => {});
    return errorResponse(e);
  }
}
