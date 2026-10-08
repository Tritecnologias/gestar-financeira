import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { pendingTerms } from "@/lib/terms";

export async function GET() {
  try {
    const { session } = await requireSession({ allowPendingTerms: true });
    return NextResponse.json({ pending: await pendingTerms(session) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: (error as {status?: number}).status ?? 500 });
  }
}
