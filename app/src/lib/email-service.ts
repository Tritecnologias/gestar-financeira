import nodemailer from "nodemailer";
import { canIssueDevInvite } from "@/lib/access-invites";
import { invitationMessage, invitationUrl } from "@/lib/email-template";

export type EmailDeliveryStatus = "SENT" | "SIMULATED" | "FAILED";
export type EmailDeliveryResult = { status: EmailDeliveryStatus; provider: "smtp" | "mock" };
type Mail = { to: string; subject: string; text: string; html: string };

interface EmailAdapter {
  readonly provider: EmailDeliveryResult["provider"];
  send(message: Mail): Promise<EmailDeliveryStatus>;
}

export type EmailServiceConfig = {
  publicUrl: URL;
  adapter: EmailAdapter;
  dev: boolean;
};

function publicUrl(requestUrl: URL, dev: boolean): URL | null {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (!configured && !dev) return null;
  try {
    const url = new URL(configured || requestUrl.origin);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (!["https:", "http:"].includes(url.protocol) || (url.protocol !== "https:" && !local) ||
        (!dev && local) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url;
  } catch { return null; }
}

function mockAdapter(): EmailAdapter {
  return { provider: "mock", async send() {
    return "SIMULATED";
  } };
}

function smtpAdapter(): EmailAdapter | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const secure = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim();
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "10S · Dez Soluções";
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !["true", "false"].includes(secure || "") || !user || !password ||
      !fromAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) return null;

  const transport = nodemailer.createTransport({ host, port, secure: secure === "true",
    requireTLS: secure !== "true", auth: { user, pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true });
  return { provider: "smtp", async send(message) {
    const result = await transport.sendMail({ from: { name: fromName, address: fromAddress },
      to: message.to, subject: message.subject, text: message.text, html: message.html });
    if (!result.accepted?.includes(message.to)) throw new Error("Recipient rejected");
    return "SENT";
  } };
}

// O provider é selecionado uma vez por operação. Mock é permitido somente no DEV isolado.
export function getEmailServiceConfig(requestUrl: URL): EmailServiceConfig | null {
  const dev = canIssueDevInvite(requestUrl);
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || (dev ? "mock" : "");
  if (provider === "smtp" && !process.env.APP_PUBLIC_URL?.trim()) return null;
  const url = publicUrl(requestUrl, dev);
  if (!url) return null;
  const adapter = provider === "mock" && dev ? mockAdapter() : provider === "smtp" ? smtpAdapter() : null;
  return adapter ? { publicUrl: url, adapter, dev } : null;
}

export async function sendInvitationEmail(config: EmailServiceConfig, input: {
  to: string; tenantName: string; token: string; expiresAt: Date;
}): Promise<EmailDeliveryResult> {
  const link = invitationUrl(config.publicUrl, input.token);
  const message = { ...invitationMessage(input.tenantName, link, input.expiresAt), to: input.to };
  try { return { status: await config.adapter.send(message), provider: config.adapter.provider }; }
  catch { return { status: "FAILED", provider: config.adapter.provider }; }
}
