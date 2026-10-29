import { environmentFavicon } from "@/lib/environment-favicon";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET() { return environmentFavicon("svg"); }
