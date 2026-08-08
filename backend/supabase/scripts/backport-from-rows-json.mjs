#!/usr/bin/env node
/**
 * Write backport migration files from a JSON array export.
 * Usage: node scripts/backport-from-rows-json.mjs [--skip-existing] <rows.json>
 * rows.json: [{ "version", "name", "statements": [...] }, ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const MANIFEST = path.join(ROOT, 'reports/backport-phase1-manifest.json');

const SKIP_EXISTING = process.argv.includes('--skip-existing');
const inputPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!inputPath) {
  console.error('Usage: backport-from-rows-json.mjs [--skip-existing] <rows.json>');
  process.exit(1);
}

function normalizeStatements(statements) {
  return statements.map((s) => s.replace(/\r\n/g, '\n'));
}

function writeMigration(row) {
  const version = String(row.version);
  const name = String(row.name);
  const filename = `${version}_${name}.sql`;
  const outPath = path.join(MIG_DIR, filename);
  if (fs.existsSync(outPath)) {
    if (SKIP_EXISTING) {
      const sql = fs.readFileSync(outPath, 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      return { version, name, file: filename, sha256, bytes: Buffer.byteLength(sql, 'utf8'), skipped: true };
    }
    throw new Error(`Already exists: ${filename}`);
  }
  const header = `-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: ${version}
-- name: ${name}
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

`;
  const body = normalizeStatements(row.statements).join('\n\n');
  const sql = header + body;
  fs.writeFileSync(outPath, sql, 'utf8');
  const sha256 = createHash('sha256').update(sql).digest('hex');
  return { version, name, file: filename, sha256, bytes: Buffer.byteLength(sql, 'utf8') };
}

const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const manifest = rows.map(writeMigration);
manifest.sort((a, b) => a.file.localeCompare(b.file));
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(
  MANIFEST,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: manifest.length, migrations: manifest }, null, 2),
);
console.log(`Wrote ${manifest.filter((m) => !m.skipped).length} new, ${manifest.filter((m) => m.skipped).length} skipped`);
for (const m of manifest) {
  console.log(m.file, m.sha256.slice(0, 12), m.bytes, m.skipped ? '(skip)' : '');
}
