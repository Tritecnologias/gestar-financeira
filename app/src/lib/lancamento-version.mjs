/** Opaque business version. Never derive concurrency tokens from JS Date. */
export function versionToken(revisao) {
  return `v1:${String(revisao)}`;
}

export function parseVersion(value) {
  if (typeof value !== "string" || !/^v1:(0|[1-9]\d{0,18})$/.test(value) ||
      BigInt(value.slice(3)) > BigInt("9223372036854775807")) {
    throw Object.assign(new Error("VersÃ£o ausente ou incompatÃ­vel. Recarregue o lanÃ§amento ou baixe um novo XLSX."), { status: 409 });
  }
  return BigInt(value.slice(3));
}

export function optimisticWhere(id, tenantId, version) {
  return { id, tenantId, revisao: parseVersion(version) };
}

export function concurrencyConflict() {
  throw Object.assign(new Error("Este lanÃ§amento foi alterado por outra operaÃ§Ã£o. Recarregue a base e revise sua alteraÃ§Ã£o; nenhum dado foi sobrescrito."), { status: 409 });
}
