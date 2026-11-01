import type { Prisma } from "@prisma/client";
import { RESET_TTL_MS } from "./password-reset-policy";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
/** The append-only audit is the durable authorization ledger. A JWT claim,
 * feature flag, SMTP setting or process-local cache cannot clear this state. */
export async function temporaryPasswordState(db: Reader, identityId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; metadata: unknown; occurredAt: Date; now: Date }>>`
    SELECT issued.id, issued.metadata, issued.occurred_at AS "occurredAt", clock_timestamp() AS now
    FROM audit_events issued
    WHERE issued.resource_type = 'AuthIdentity' AND issued.resource_id = ${identityId}
      AND issued.action = 'PASSWORD_TEMPORARY_ISSUED' AND issued.result = 'SUCCESS'
      AND NOT EXISTS (SELECT 1 FROM audit_events ended
        WHERE ended.resource_type = 'TemporaryPassword' AND ended.resource_id = issued.id
          AND ended.action IN ('PASSWORD_TEMPORARY_REPLACED', 'PASSWORD_TEMPORARY_COMPLETED')
          AND ended.result = 'SUCCESS')
    LIMIT 2`;
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("TEMPORARY_PASSWORD_STATE_INVALID");
  const row = rows[0], meta = row.metadata as Record<string, unknown> | null;
  if (!meta || Array.isArray(meta) || Object.keys(meta).join() !== "expiresAt" || typeof meta.expiresAt !== "string")
    throw new Error("TEMPORARY_PASSWORD_STATE_INVALID");
  const expiry = Date.parse(meta.expiresAt);
  if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== meta.expiresAt ||
      expiry <= row.occurredAt.getTime() || expiry > row.occurredAt.getTime() + RESET_TTL_MS + 1000)
    throw new Error("TEMPORARY_PASSWORD_STATE_INVALID");
  return { id: row.id, expiresAt: meta.expiresAt, expired: expiry <= row.now.getTime() };
}
