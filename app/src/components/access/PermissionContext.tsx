"use client";

import { createContext, useContext, type ReactNode } from "react";

const PermissionContext = createContext<ReadonlySet<string>>(new Set());

export function PermissionProvider({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  return <PermissionContext.Provider value={new Set(permissions)}>{children}</PermissionContext.Provider>;
}

/** Interface affordances only. Server guards remain the authorization source of truth. */
export function useCan() {
  const permissions = useContext(PermissionContext);
  return (key: string) => permissions.has(key);
}
