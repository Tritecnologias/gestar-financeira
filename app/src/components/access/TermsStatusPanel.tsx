"use client";

import { useEffect, useState } from "react";

type TermState = { documentCode: string; audience: string; applicable: boolean;
  requiredVersion: string; acceptedVersion: string | null; acceptedAt: string | null; pending: boolean };
type Row = { membershipId: string; nome: string; email: string; isContractualResponsible: boolean; terms: TermState[] };

export default function TermsStatusPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [responsible, setResponsible] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/access/terms", { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao consultar aceites.");
      setRows(body.rows); setResponsible(body.contractualResponsibleMembershipId);
    }).catch(cause => setError((cause as Error).message));
  }, []);
  return <details className="access-terms-status"><summary>Status dos termos obrigatórios</summary>
    {!responsible && <p className="access-warning">Responsável contratual não designado pela plataforma.</p>}
    {error && <p role="alert" className="access-error">{error}</p>}
    <div className="access-table-wrap"><table className="access-table"><thead><tr><th>Usuário</th><th>Documento</th><th>Versão exigida</th><th>Versão aceita</th><th>Data</th><th>Status</th></tr></thead><tbody>
      {rows.flatMap(row => row.terms.filter(term => term.applicable).map(term => <tr key={`${row.membershipId}:${term.documentCode}`}>
        <td><strong>{row.nome}</strong><small>{row.email}{row.isContractualResponsible ? " · Responsável contratual" : ""}</small></td>
        <td>{term.documentCode}</td><td>{term.requiredVersion}</td><td>{term.acceptedVersion || "—"}</td>
        <td>{term.acceptedAt ? new Date(term.acceptedAt).toLocaleString("pt-BR") : "—"}</td>
        <td>{term.pending ? "Pendente" : "Aceito"}</td>
      </tr>))}
      {!rows.some(row => row.terms.some(term => term.applicable)) && <tr><td colSpan={6} className="access-empty">Nenhum termo obrigatório publicado.</td></tr>}
    </tbody></table></div>
  </details>;
}
