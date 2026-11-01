import PasswordResetClient from "@/components/account/PasswordResetClient";
import { getResetDelivery } from "@/lib/password-reset";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default function PasswordResetPage() { return <PasswordResetClient enabled={!!getResetDelivery()} />; }
