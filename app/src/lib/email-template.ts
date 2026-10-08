export function invitationUrl(publicUrl: URL, token: string) {
  const url = new URL("/ativar-acesso", publicUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] || character);

export function invitationMessage(tenantName: string, link: string, expiresAt: Date) {
  const name = tenantName.trim().slice(0, 160);
  const expiry = expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const subject = "Você recebeu acesso ao 10S";
  const text = `Olá,\n\nVocê recebeu um convite para acessar o 10S da empresa ${name}.\n\n` +
    `Conclua seu acesso pelo link:\n${link}\n\nEste convite expira em ${expiry} (horário de Brasília).\n\n` +
    "Se você não esperava este convite, ignore esta mensagem.\n\n10S · Dez Soluções";
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
    `<body style="margin:0;background:#f4f8fb;color:#183047;font:16px Arial,sans-serif;padding:24px">` +
    `<main style="max-width:560px;margin:auto;background:#fff;border:1px solid #dce9f1;border-radius:12px;padding:28px">` +
    `<p style="color:#087f9b;font-size:13px;font-weight:bold">10S · DEZ SOLUÇÕES</p><h1 style="font-size:22px">Você recebeu acesso ao 10S</h1>` +
    `<p>Olá,</p><p>Você recebeu um convite para acessar o 10S da empresa <strong>${safeName}</strong>.</p>` +
    `<p><a href="${safeLink}" style="display:inline-block;background:#087f9b;color:#fff;padding:12px 18px;border-radius:7px;text-decoration:none">Ativar acesso</a></p>` +
    `<p style="font-size:14px">Este convite expira em ${escapeHtml(expiry)} (horário de Brasília).</p>` +
    `<p style="font-size:14px">Se você não esperava este convite, ignore esta mensagem.</p></main></body></html>`;
  return { subject, text, html };
}
