import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { writeAudit } from "./audit";

type Actor = { identityId: string; tenantId: string; grantId: string };
type Trace = { requestId: string; actor?: Actor; path: string; method: string };
const storage = new AsyncLocalStorage<Trace>();
function event(t: Trace, action: string, status?: number) {
  return writeAudit(prisma, { tenantId: t.actor!.tenantId, actorIdentityId: t.actor!.identityId,
    advisoryGrantId: t.actor!.grantId, accessMode: "ADVISORY", action,
    resourceType: "Route", resourceId: t.path, requestId: t.requestId,
    result: status === undefined || status < 400 ? "SUCCESS" : [401, 403].includes(status) ? "DENIED" : "FAILURE",
    metadata: { method: t.method, ...(status === undefined ? {} : { httpStatus: status }) } });
}
/** Durable authorization evidence before business work; reject missing wrappers. */
export async function bindAdvisoryRequest(actor: Actor) {
  const trace = storage.getStore();
  if (!trace) throw Object.assign(new Error("Operação de assessoria sem trilha disponível."), { status: 503 });
  if (trace.actor) return;
  trace.actor = actor;
  try { await event(trace, "ADVISORY_OPERATION_AUTHORIZED"); }
  catch { throw Object.assign(new Error("Não foi possível registrar a autorização de assessoria. A operação não foi iniciada."), { status: 503 }); }
}
/** No request/response body, query string or cookie enters the audit trail. */
export function withAdvisoryAudit<A extends unknown[]>(path: string, method: string, handler: (...args: A) => Promise<Response>) {
  return (...args: A) => storage.run({ requestId: randomUUID(), path, method }, async () => {
    const trace = storage.getStore()!;
    let response: Response;
    try { response = await handler(...args); }
    catch (error) {
      if (trace.actor) await event(trace, "ADVISORY_OPERATION", 500);
      throw error;
    }
    if (trace.actor) {
      try { await event(trace, "ADVISORY_OPERATION", response.status); }
      catch {
        // A mutation may already be committed. Never claim rollback or invite blind retry.
        return Response.json({ error: "Resultado não confirmado pela auditoria. Confira o registro antes de repetir a operação.", requestId: trace.requestId }, { status: 503 });
      }
    }
    return response;
  });
}
