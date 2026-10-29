import { experimentOrigin } from "@/lib/experiment-policy";
import { officialLanding } from "@/lib/official-landing";
import { homologIdentity, environmentIconPaths } from "@/lib/environment-identity";
export const dynamic = "force-dynamic";
export async function GET() {
  const origin = experimentOrigin();
  if (!origin) return new Response("Não encontrado", { status: 404 });
  const homolog = homologIdentity(), icons = environmentIconPaths(homolog);
  const html = officialLanding.replaceAll('href="https://app.dezsolucoes.com.br"', `href="${origin}/primeiro-acesso"`)
    .replace(/\s*<link rel="icon"[^>]*>/g, "")
    .replace('href="styles.css?v=approved-header2"', 'href="/experimentacao/assets/styles.css"')
    .replaceAll('href="icons/', 'href="/experimentacao/assets/icons/').replace('href="favicon.svg?', 'href="/experimentacao/assets/favicon.svg?')
    .replace('src="brand-approved.png?', 'src="/experimentacao/assets/brand-approved.png?')
    .replace('</head>', `<meta name="robots" content="noindex,nofollow"><link rel="icon" type="image/svg+xml" href="${icons.svg}"><link rel="icon" sizes="16x16 32x32 48x48" href="${icons.ico}"><link rel="stylesheet" href="/experimentacao/pilot.css"></head>`)
    .replace('</body>', `<script src="/experimentacao/pilot.js" data-environment="${homolog ? "homolog" : "platform"}" defer></script></body>`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
