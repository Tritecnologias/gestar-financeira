import type { UserSession } from "@/types";

/** Assessoria is never represented by a fabricated legacy user or membership. */
export function businessAuthor(session: UserSession) {
  return session.accessSource === "ADVISORY" ? { criadoPor: null, criadoPorIdentityId: session.identityId! } : { criadoPor: session.id };
}
export function layoutOwner(session: UserSession) {
  return session.accessSource === "ADVISORY" ? { usuarioId: null, identityId: session.identityId! } : { usuarioId: session.id, identityId: null };
}
