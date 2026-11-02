import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmailServiceConfig } from "@/lib/email-service";
import { getEmailServiceConfig, sendEmailMessage } from "@/lib/email-service";
import { admissionEmail, requireAdmissionOrigin } from "@/lib/admission-policy";
import { sealAdmissionValue } from "@/lib/admission-crypto";

/** Reuse the existing email service; the same image selects its authorized adapter at runtime. */
export async function deliverAdmissionChallenge(input: {
  admissionId: string; challengeId: string; to: string; token: string; expiresAt: Date;
}) {
  if (process.env.EMAIL_PROVIDER !== "smtp" && process.env.EMAIL_PROVIDER !== "mock") throw new Error("ADMISSION_EMAIL_DISABLED");
  const origin = requireAdmissionOrigin(); admissionEmail(input.to);
  const config: EmailServiceConfig | null = process.env.EMAIL_PROVIDER === "smtp"
    ? getEmailServiceConfig(new URL(origin)) : { publicUrl: new URL(origin), dev: true, adapter: {
    provider: "mock", async send(message) {
      const directory = process.env.ADMISSION_LAB_MAIL_DIR!;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const encrypted = sealAdmissionValue(message, process.env.ADMISSION_LAB_MAIL_KEY!, "dez/admission/synthetic-mail/v1");
      await writeFile(join(directory, input.challengeId + ".mail"), encrypted, { flag: "wx", mode: 0o600 });
      return "SIMULATED";
    },
  } };
  if (!config) throw new Error("ADMISSION_EMAIL_CONFIGURATION_UNAVAILABLE");
  // Fragment never reaches HTTP access logs; only an explicit POST consumes the challenge.
  const link = `${origin}/adesao#id=${input.admissionId}&challenge=${input.challengeId}&token=${input.token}`;
  const text = `Sua adesão à DEZ foi autorizada. Confirme o controle deste e-mail para continuar.\n\n${link}\n\nO link vale até ${input.expiresAt.toISOString()} e só pode ser usado uma vez. Se você já possui uma conta, sua senha atual será solicitada. Nenhuma senha será alterada por este link.`;
  return sendEmailMessage(config, { to: input.to, subject: "DEZ Soluções — continuar adesão", text,
    html: `<p>Sua adesão à DEZ foi autorizada.</p><p><a href="${link.replaceAll("&", "&amp;")}">Confirmar e-mail e continuar</a></p><p>Link de uso único, válido até ${input.expiresAt.toISOString()}. Sua senha atual será preservada.</p>` });
}
