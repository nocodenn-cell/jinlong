#!/usr/bin/env node
/**
 * Phase 1 gate: verify all prod-only version keys from audit §4.2 have backport SQL files.
 */
import fs from 'node:fs';
import path from 'node:path';

const MIG_DIR = path.resolve(import.meta.dirname, '../migrations');
const MARKER = '-- Backport Fase 1 (Git-only)';

/** @type {readonly string[]} */
const PHASE1_VERSIONS = [
  '20260707000000',
  '20260707010000',
  '20260707020000',
  '20260717031500',
  '20260801090000',
  '20260801120000',
  '20260805151822',
  '20260805185445',
  '20260805185458',
  '20260805190920',
  '20260805193920',
  '20260805213357',
  '20260806000032',
  '20260806002522',
  '20260806002925',
  '20260806004637',
  '20260806005804',
  '20260806011719',
  '20260806090414',
  '20260806090531',
  '20260806134834',
  '20260806135106',
  '20260806135429',
  '20260806140528',
  '20260806235913',
  '20260807000105',
  '20260807000138',
  '20260807000157',
  '20260807000525',
  '289',
];

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
const byPrefix = new Map();
for (const f of files) {
  const m = f.match(/^(\d+)_(.+)\.sql$/);
  if (!m) continue;
  byPrefix.set(m[1], f);
}

const missing = [];
const badHeader = [];
for (const version of PHASE1_VERSIONS) {
  const file = byPrefix.get(version);
  if (!file) {
    missing.push(version);
    continue;
  }
  const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
  if (!sql.includes(MARKER)) badHeader.push(file);
}

if (missing.length || badHeader.length) {
  console.error('Phase 1 validation FAILED');
  if (missing.length) console.error('Missing versions:', missing.join(', '));
  if (badHeader.length) console.error('Missing backport header:', badHeader.join(', '));
  process.exit(1);
}

console.log(`Phase 1 validation OK — ${PHASE1_VERSIONS.length} backport files present`);
console.log(`Total .sql in repo: ${files.length}`);
