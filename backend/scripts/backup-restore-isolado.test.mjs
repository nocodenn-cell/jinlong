import assert from "node:assert/strict";

const BLOCKED = ["kbabmewnahysfvlybiak", "tarxrbxddcwvjkimkbnr"];

export function assertIsolatedBackupTarget(ref) {
  const value = String(ref ?? "").trim().toLowerCase();
  for (const blocked of BLOCKED) {
    if (value.includes(blocked)) throw new Error(`BACKUP_ALVO_REMOTO_BLOQUEADO:${blocked}`);
  }
  if (value.includes("supabase.co") || value.includes("pooler.supabase")) {
    throw new Error("BACKUP_ALVO_REMOTO_BLOQUEADO");
  }
  const local = value === "pglite" || value === "local" || value.startsWith("127.0.0.1") || value.startsWith("localhost");
  if (!local) throw new Error("BACKUP_ALVO_NAO_ISOLADO");
}

async function rehearsal() {
  assertIsolatedBackupTarget("pglite");
  assert.throws(() => assertIsolatedBackupTarget("kbabmewnahysfvlybiak"), /BACKUP_ALVO_REMOTO_BLOQUEADO/);
  assert.throws(() => assertIsolatedBackupTarget("tarxrbxddcwvjkimkbnr"), /BACKUP_ALVO_REMOTO_BLOQUEADO/);
  assert.throws(() => assertIsolatedBackupTarget("https://kbabmewnahysfvlybiak.supabase.co"), /BACKUP_ALVO_REMOTO_BLOQUEADO/);

  const { PGlite } = await import("@electric-sql/pglite");
  const source = new PGlite();
  await source.exec("CREATE TABLE lojas (id text PRIMARY KEY, nome text NOT NULL)");
  await source.query("INSERT INTO lojas (id, nome) VALUES ($1, $2)", ["loja-b", "Loja B"]);
  const dump = await source.query("SELECT id, nome FROM lojas ORDER BY id");

  const target = new PGlite();
  await target.exec("CREATE TABLE lojas (id text PRIMARY KEY, nome text NOT NULL)");
  for (const row of dump.rows) {
    await target.query("INSERT INTO lojas (id, nome) VALUES ($1, $2)", [row.id, row.nome]);
  }
  const restored = await target.query("SELECT id, nome FROM lojas ORDER BY id");
  assert.deepEqual(restored.rows, dump.rows);
  await source.close();
  await target.close();
}

await rehearsal();
console.log("OK: backup e restore somente em pglite");
