export type ExperimentAdminItem = {
  id: string; recipientName: string; status: string; createdAt: string; expiresAt: string;
  revokedAt: string | null; viewedAt: string | null; acknowledgedAt: string | null;
  interestAt: string | null; linkRecoverable: boolean; canCopyLink: boolean;
};
export type InvitationSituation = "ALL" | "ACTIVE" | "REVOKED" | "EXPIRED";
export type InvitationInterest = "ALL" | "REGISTERED" | "WAITING";
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

export function experimentSituationTone(row: Pick<ExperimentAdminItem, "status" | "interestAt">) {
  if (row.status === "REVOKED") return "danger";
  if (row.status === "EXPIRED") return "muted";
  return row.interestAt ? "success" : "warning";
}

export function selectExperimentInvitations(rows: ExperimentAdminItem[], query: string, situation: InvitationSituation, interest: InvitationInterest, now: number) {
  const search = normalize(query);
  return rows.map(row => ({
    ...row,
    status: row.status !== "REVOKED" && Date.parse(row.expiresAt) <= now ? "EXPIRED" : row.status,
    canCopyLink: row.canCopyLink && row.status === "ACTIVE" && Date.parse(row.expiresAt) > now,
  })).filter(row =>
    (!search || normalize(row.recipientName).includes(search) || normalize(row.id).includes(search)) &&
    (situation === "ALL" || row.status === situation) &&
    (interest === "ALL" || (interest === "REGISTERED" ? !!row.interestAt : !row.interestAt))
  // Stable partition: preserve the server's newest-first order inside each group.
  ).sort((a, b) => Number(a.status === "REVOKED") - Number(b.status === "REVOKED"));
}
