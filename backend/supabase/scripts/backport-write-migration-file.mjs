#!/usr/bin/env node
/**
 * Write a migration file from exported prod statements (Git-only backport).
 * Usage: node scripts/backport-write-migration-file.mjs <export.json>
 * export.json: { "version": "...", "name": "...", "statements": ["...", ...] }
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: backport-write-migration-file.mjs <export.json>');
  process.exit(1);
}

const row = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const version = String(row.version);
const name = String(row.name);
const statements = Array.isArray(row.statements) ? row.statements : [];

if (statements.length === 0) {
  console.error('No statements for', version);
  process.exit(1);
}

const header = `-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations
-- version: ${version}
-- name: ${name}
-- source: production read-only export (${new Date().toISOString().slice(0, 10)})
-- DO NOT re-execute manually on production (already applied).

`;

const body = statements
  .map((s) => {
    const t = String(s).trimEnd();
    if (!t) return "";
    if (t.endsWith(";")) return t;
    return `${t};`;
  })
  .filter(Boolean)
  .join("\n\n");
const sql = header + body;
const filename = `${version}_${name}.sql`;
const outPath = path.join(MIG_DIR, filename);

if (fs.existsSync(outPath)) {
  console.error('Refusing to overwrite existing file:', filename);
  process.exit(1);
}

fs.writeFileSync(outPath, sql, 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
console.log(JSON.stringify({ file: filename, sha256, bytes: Buffer.byteLength(sql, 'utf8') }));
