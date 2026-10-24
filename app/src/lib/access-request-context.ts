import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type AccessTrace = { requestId: string; tenantId: string | null };
const storage = new AsyncLocalStorage<AccessTrace>();

export function accessRequestContext(tenantId?: string | null) {
  const trace = storage.getStore();
  if (trace && tenantId) trace.tenantId = tenantId;
  return trace;
}

/** Only server-generated IDs and allowlisted operational metadata reach logs.
 * No URL, body, email, token, credential, or raw exception is logged here.
 */
export function withAccessRequest<A extends unknown[]>(
  flow: string, handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return (...args) => storage.run({ requestId: randomUUID(), tenantId: null }, async () => {
    const trace = storage.getStore()!;
    let status = 500;
    try {
      const response = await handler(...args);
      status = response.status;
      response.headers.set("X-Request-Id", trace.requestId);
      return response;
    } finally {
      console.info(JSON.stringify({ requestId: trace.requestId, flow, tenantId: trace.tenantId,
        status, result: status < 400 ? "SUCCESS" : "FAILURE" }));
    }
  });
}
