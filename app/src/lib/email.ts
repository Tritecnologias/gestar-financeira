// Legacy login is email-only. This normalization is shared by authentication
// and account administration until AuthIdentity/Membership replaces the model.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailEqualsNormalized(value: string) {
  return { equals: normalizeEmail(value), mode: "insensitive" as const };
}

// Never choose a tenant by query ordering when the same email has two accounts.
export function unambiguousLegacyAccount<T>(accounts: T[]): T | null {
  return accounts.length === 1 ? accounts[0] : null;
}
