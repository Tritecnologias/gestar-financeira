"use client";
import { createContext, useContext } from "react";
import "./environment-identity.css";
const Context = createContext(false);
export default function EnvironmentIdentityProvider({ homolog, children }: { homolog: boolean; children: React.ReactNode }) {
  return <Context.Provider value={homolog}>{children}</Context.Provider>;
}
export function PlatformIdentityMark({ size = 24 }: { size?: number }) {
  const homolog = useContext(Context);
  return <img className="environment-identity-icon" src={homolog ? "/favicon.svg?v=homolog-yellow-1" : "/favicon.svg?v=dez-blue-1"} width={size} height={size} alt={homolog ? "DEZ Soluções · HOMOLOG" : "DEZ Soluções"} />;
}
export function HomologIdentityBadge() {
  const homolog = useContext(Context);
  return homolog ? <span className="environment-identity-badge" data-environment="homolog"><PlatformIdentityMark size={20} />HOMOLOG</span> : null;
}
