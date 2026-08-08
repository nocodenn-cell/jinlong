#!/usr/bin/env node
/**
 * Read-only inventory: repo migrations vs production schema_migrations snapshot.
 * Usage: node scripts/reconcile-prod-repo-inventory.mjs
 * Requires: reports/prod_schema_migrations.snapshot.json (generated from prod SQL export)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const SNAPSHOT = path.join(ROOT, 'reports/prod_schema_migrations.snapshot.json');

function parseFile(filename) {
  const base = filename.replace(/\.sql$/, '');
  const ts = base.match(/^(\d{14})_(.+)$/);
  if (ts) {
    return { version: ts[1], slug: ts[2], file: filename, kind: 'timestamp' };
  }
  const num = base.match(/^(\d+)_(.+)$/);
  if (num) {
    return { version: num[1], slug: num[2], file: filename, kind: 'numeric' };
  }
  return { version: base, slug: base, file: filename, kind: 'other' };
}

function shaPrefix(filePath) {
  const buf = fs.readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const repo = files.map((f) => ({ ...parseFile(f), path: path.join(MIG_DIR, f) }));

if (!fs.existsSync(SNAPSHOT)) {
  console.error('Missing snapshot:', SNAPSHOT);
  process.exit(1);
}

const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const prod = snap.migrations ?? snap;
const prodByVersion = new Map(prod.map((m) => [String(m.version), m]));
const repoByVersion = new Map(repo.map((r) => [r.version, r]));

const onlyRepo = repo.filter((r) => !prodByVersion.has(r.version));
const onlyProd = prod.filter((m) => !repoByVersion.has(String(m.version)));

const nameMismatch = repo
  .filter((r) => prodByVersion.has(r.version))
  .filter((r) => {
    const p = prodByVersion.get(r.version);
    const norm = (s) => s.replace(/-/g, '_').toLowerCase();
    return !norm(r.slug).includes(norm(p.name).slice(0, 20)) && !norm(p.name).includes(norm(r.slug).slice(0, 20));
  });

const numericGaps = [];
const nums = prod
  .map((m) => m.version)
  .filter((v) => /^\d+$/.test(v) && v.length <= 3)
  .map(Number)
  .sort((a, b) => a - b);
for (let i = 1; i < nums.length; i++) {
  for (let g = nums[i - 1] + 1; g < nums[i]; g++) {
    if (g >= 120 && g <= 204) continue;
    const hasFile = repoByVersion.has(String(g));
    if (!hasFile) numericGaps.push(g);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  counts: {
    repoFiles: repo.length,
    prodTracked: prod.length,
    onlyRepo: onlyRepo.length,
    onlyProd: onlyProd.length,
    nameMismatch: nameMismatch.length,
  },
  onlyRepo: onlyRepo.map((r) => ({ version: r.version, file: r.file, sha12: shaPrefix(r.path) })),
  onlyProd: onlyProd.map((m) => ({ version: m.version, name: m.name })),
  nameMismatch: nameMismatch.map((r) => ({
    version: r.version,
    repoFile: r.file,
    prodName: prodByVersion.get(r.version)?.name,
  })),
  numericGapsInProdSequence: numericGaps,
};

const reportPath = path.join(ROOT, 'reports/reconcile-prod-repo-inventory.json');
fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.counts, null, 2));
console.log('Wrote', reportPath);
console.log('\nonlyRepo (first 30):');
onlyRepo.slice(0, 30).forEach((r) => console.log(' ', r.version, r.file));
if (onlyRepo.length > 30) console.log(' ...', onlyRepo.length - 30, 'more');
console.log('\nonlyProd:');
onlyProd.forEach((m) => console.log(' ', m.version, m.name));
