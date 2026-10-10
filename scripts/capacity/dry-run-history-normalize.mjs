#!/usr/bin/env node
/**
 * Option B — local-only dry-run of history normalization.
 * Uses SQLite clone of staging history snapshot. NEVER connects to remote DB.
 *
 * Policy:
 *  - Only INSERT canonical rows for applied_verified + fingerprint complete + missing canonical name
 *  - Never INSERT for partial / not_applied / indeterminate
 *  - Never DELETE remote rows in this dry-run (orphan synthetics are flagged only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PREP = path.join(ROOT, 'docs/capacity/staging/repair-prep');
const OUT = path.join(ROOT, 'tmp/stg-repair-prep');

function main() {
  const history = JSON.parse(
    fs.readFileSync(path.join(PREP, 'history-snapshot.json'), 'utf8'),
  );
  const matrix = JSON.parse(fs.readFileSync(path.join(PREP, 'matrix.json'), 'utf8'));
  const candidates = JSON.parse(
    fs.readFileSync(path.join(PREP, 'normalize-candidates.json'), 'utf8'),
  );

  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
  const insert = db.prepare(
    'INSERT INTO schema_migrations(version, name) VALUES (?, ?)',
  );
  for (const row of history) insert.run(row.version, row.name);

  const before = db
    .prepare('SELECT count(*) AS n FROM schema_migrations')
    .get().n;

  const proposedInserts = [];
  const skipped = [];

  for (const c of candidates) {
    if (c.status !== 'applied_verified') {
      skipped.push({ stem: c.stem, reason: 'status!=' + c.status });
      continue;
    }
    if (!(c.fingerprint.expected > 0 && c.fingerprint.present === c.fingerprint.expected)) {
      skipped.push({ stem: c.stem, reason: 'fingerprint incomplete' });
      continue;
    }
    if (!c.canonical_version || !/^\d{14}$/.test(c.canonical_version)) {
      skipped.push({ stem: c.stem, reason: 'canonical_version not 14-digit' });
      continue;
    }
    const existsName = db
      .prepare('SELECT version FROM schema_migrations WHERE name = ?')
      .get(c.stem);
    if (existsName) {
      skipped.push({ stem: c.stem, reason: 'canonical name already present', version: existsName.version });
      continue;
    }
    const existsVer = db
      .prepare('SELECT name FROM schema_migrations WHERE version = ?')
      .get(c.canonical_version);
    if (existsVer) {
      skipped.push({
        stem: c.stem,
        reason: 'canonical version collision',
        existing_name: existsVer.name,
      });
      continue;
    }
    db.prepare('INSERT INTO schema_migrations(version, name) VALUES (?, ?)').run(
      c.canonical_version,
      c.stem,
    );
    proposedInserts.push({
      version: c.canonical_version,
      name: c.stem,
      evidence: 'fingerprint_complete',
    });
  }

  const after = db
    .prepare('SELECT count(*) AS n FROM schema_migrations')
    .get().n;

  const orphans = history.filter(
    (h) => !matrix.some((m) => m.stem === h.name),
  );

  const report = {
    mode: 'local_sqlite_dry_run',
    remote_writes: 0,
    before_count: before,
    after_count: after,
    proposed_inserts: proposedInserts,
    skipped,
    orphan_synthetic_flagged_only: orphans.map((o) => ({
      version: o.version,
      name: o.name,
      action: 'KEEP (no delete in Option B); document mapping only',
    })),
    unsafe_to_register: matrix
      .filter((m) => ['partial', 'not_applied', 'indeterminate'].includes(m.status))
      .map((m) => ({ stem: m.stem, status: m.status, reason: m.reason })),
    verdict:
      proposedInserts.length > 0
        ? 'SAFE_FOR_HISTORY_INSERT_SUBSET_ONLY — still NOT authorized for remote'
        : 'NO_SAFE_INSERTS',
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(PREP, 'normalize-dry-run-report.json'),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT, 'normalize-dry-run-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        before_count: before,
        after_count: after,
        proposed_inserts: proposedInserts.length,
        skipped: skipped.length,
        unsafe_to_register: report.unsafe_to_register.length,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
}

main();
