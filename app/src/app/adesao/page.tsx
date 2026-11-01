import { notFound } from "next/navigation";
import AdmissionClient from "@/components/access/AdmissionClient";
import { admissionOrigin } from "@/lib/admission-policy";
export const dynamic = "force-dynamic";
export const metadata = { title: "Adesão | DEZ Soluções", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function AdmissionPage() {
  if (!admissionOrigin()) notFound();
  return <AdmissionClient />;
}
