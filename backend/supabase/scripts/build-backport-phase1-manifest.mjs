#!/usr/bin/env node
/** Build SHA256 manifest for all Fase 1 backport migration files in repo. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const MANIFEST = path.join(ROOT, 'reports/backport-phase1-manifest.json');

const marker = '-- Backport Fase 1 (Git-only)';
const files = fs
  .readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => fs.readFileSync(path.join(MIG_DIR, f), 'utf8').includes(marker))
  .sort();

const migrations = files.map((file) => {
  const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
  const versionMatch = sql.match(/^-- version: (.+)$/m);
  const nameMatch = sql.match(/^-- name: (.+)$/m);
  const sha256 = createHash('sha256').update(sql).digest('hex');
  return {
    version: versionMatch?.[1] ?? file.split('_')[0],
    name: nameMatch?.[1] ?? file.replace(/\.sql$/, ''),
    file,
    sha256,
    bytes: Buffer.byteLength(sql, 'utf8'),
  };
});

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: migrations.length,
      source: 'backend/supabase/migrations (Backport Fase 1 header)',
      migrations,
    },
    null,
    2,
  ),
);
console.log(`Manifest: ${migrations.length} backport files → ${MANIFEST}`);
