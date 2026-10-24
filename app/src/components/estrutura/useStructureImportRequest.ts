"use client";
import { useRef } from "react";
import { readImportResponse } from "@/lib/import-http.mjs";
import { MAX_FILE_BYTES } from "@/lib/official-import-policy.mjs";

/** Shared transport; domain modals retain their own preview and hierarchy rendering. */
export function useStructureImportRequest(endpoint: string, onPreview: (preview: any) => void, onCompleted: (body: any) => void) {
  const token = useRef("");
  return async (file: File, mode: "preview" | "confirm") => {
    if (mode === "preview") token.current = "";
    if (file.size > MAX_FILE_BYTES) throw new Error("O XLSX deve ter no máximo 10 MiB.");
    const form = new FormData(); form.append("file",file); form.append("mode",mode);
    if (mode === "confirm") form.append("previewToken",token.current);
    let response;
    try { response = await fetch(endpoint,{ method: "POST", body: form }); }
    catch { throw new Error(mode === "confirm" ? "Resultado ainda não confirmado. Selecione novamente o mesmo arquivo para consultar; não crie uma cópia do lote." : "Não foi possível consultar a prévia. Verifique a conexão."); }
    let body;
    try { body = await readImportResponse(response,mode === "confirm"); }
    catch (e: any) { if (e.body?.preview) onPreview(e.body.preview); throw e; }
    if (body.preview) onPreview(body.preview);
    if (body.previewToken) token.current = body.previewToken;
    if (["PROCESSING","UNCONFIRMED"].includes(body.state)) throw new Error(body.safeMessage || "Resultado ainda não confirmado. Selecione novamente o mesmo arquivo para consultar.");
    if (body.state === "COMPLETED") onCompleted(body);
    return body;
  };
}
