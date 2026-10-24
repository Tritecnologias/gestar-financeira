const messages = {
  400: 'Arquivo ou envio inválido. Confira a base XLSX oficial.',
  401: 'Sua sessão expirou. Entre novamente antes de continuar.',
  403: 'Você não tem permissão para importar neste tenant.',
  404: 'A referência solicitada não está disponível neste tenant.',
  409: 'Conflito de versão. Confira o resultado e gere uma prévia atualizada.',
  413: 'Arquivo muito grande. O limite do XLSX é 10 MiB.',
  422: 'O arquivo contém regras de negócio inválidas. Confira a prévia.',
  500: 'Não foi possível concluir a consulta. Tente consultar o resultado novamente.',
  502: 'O serviço está temporariamente indisponível.',
  503: 'O serviço está temporariamente indisponível.',
  504: 'O servidor demorou a responder.',
};
export async function readImportResponse(response, confirming = false) {
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const trusted = body && body.protocol === '10s-import-v1';
  if (!response.ok || !trusted) {
    const uncertain = confirming && (response.status >= 500 || (response.ok && !trusted));
    const message = uncertain ? 'Resultado ainda não confirmado. Consulte a operação ou reenvie o mesmo arquivo; não crie uma cópia do lote.'
      : trusted && body.safeMessage ? body.safeMessage : messages[response.status] || 'Resposta inválida do serviço de importação.';
    throw Object.assign(new Error(message), { uncertain, body: trusted ? body : null });
  }
  return body;
}
