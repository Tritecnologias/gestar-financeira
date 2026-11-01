import LoginClient from "@/components/account/LoginClient";
import { supportWhatsAppUrl } from "@/lib/password-reset-policy";
export const dynamic = "force-dynamic";
export default function LoginPage() { return <LoginClient supportUrl={supportWhatsAppUrl()} />; }
