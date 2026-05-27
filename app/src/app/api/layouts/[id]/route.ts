import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

// DELETE /api/layouts/[id] — excluir layout
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await db.layoutColunas.delete({
      where: { id, usuarioId: session.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}
