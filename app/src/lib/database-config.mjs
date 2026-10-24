export function databaseConfig(value = process.env.DATABASE_URL) {
  if (!value) throw new Error("DATABASE_URL is required; configure the private runtime secret.");
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2)
      throw new Error("invalid");
    return { connectionString: value, schema: url.searchParams.get("schema") || undefined };
  } catch {
    // URL parsing errors can include their input. Never expose a connection secret.
    throw new Error("Invalid DATABASE_URL configuration; check the private runtime secret.");
  }
}
