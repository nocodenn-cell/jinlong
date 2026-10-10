const BLOCKED = ["kbabmewnahysfvlybiak", "tarxrbxddcwvjkimkbnr"];

export function assertFiscalDrillTarget(ref) {
  const value = String(ref ?? "").trim().toLowerCase();
  for (const blocked of BLOCKED) {
    if (value.includes(blocked)) throw new Error(`BACKUP_ALVO_REMOTO_BLOQUEADO:${blocked}`);
  }
  if (value.includes("supabase.co") || value.includes("pooler.supabase")) {
    throw new Error("BACKUP_ALVO_REMOTO_BLOQUEADO");
  }
  if (value !== "postgres-local-descartavel" && value !== "pglite-local-descartavel") {
    throw new Error("BACKUP_ALVO_NAO_ISOLADO");
  }
}

export function stripTxControl(sql) {
  return String(sql)
    .split("\n")
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join("\n");
}

export function bundleFiscalP0(isolacaoSql, revokeSql) {
  return `BEGIN;\n${stripTxControl(isolacaoSql)}\n${stripTxControl(revokeSql)}\nCOMMIT;\n`;
}

export function assertRecoveryIsCanonical(candidate, canonical) {
  if (String(candidate) !== String(canonical)) {
    throw new Error("RECOVERY_RECUSA_SQL_NAO_CANONICO");
  }
}
