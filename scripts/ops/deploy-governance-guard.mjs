#!/usr/bin/env node
// Guarda de governança de deploy (ver docs/ops/deploy-governance.md).
// Falha o PR quando:
//  1) um arquivo de migration ADIADA é alterado, removido ou renomeado;
//  2) uma migration adiada listada no manifesto não existe no tree;
//  3) o PR toca caminhos que a integração GitHub->Supabase publica em produção
//     (migrations, functions, config.toml) ou altera o manifesto, sem o label de aprovação.
//     (Criar o manifesto não exige label; alterá-lo/removê-lo exige.)
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const APPROVAL_LABEL = 'deploy-prod:aprovado';
export const MANIFEST = '.github/deploy-governance/deferred-migrations.json';
export const PROD_PATHS = [
  'backend/supabase/migrations/',
  'backend/supabase/functions/',
  'backend/supabase/config.toml',
  MANIFEST,
];

export function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status: status[0], paths };
  });
}

export function evaluate({ changes, labels, deferred, fileExists }) {
  const errors = [];
  const deferredFiles = new Set(deferred.map((d) => d.file));
  for (const d of deferred) {
    if (!fileExists(d.file)) errors.push(`Migration adiada ${d.version} ausente no tree: ${d.file} (proibido remover/renomear).`);
  }
  for (const c of changes) {
    for (const p of c.paths) {
      if (deferredFiles.has(p)) errors.push(`Migration adiada alterada (${c.status}): ${p}. Ela não pode ser modificada/removida/renomeada.`);
    }
  }
  const touched = [...new Set(changes.filter((c) => !(c.status === 'A' && c.paths[0] === MANIFEST)).flatMap((c) => c.paths).filter((p) => PROD_PATHS.some((pp) => p === pp || p.startsWith(pp))))];
  if (touched.length && !labels.includes(APPROVAL_LABEL)) {
    errors.push(`PR altera caminhos publicados automaticamente em produção pela integração Supabase sem o label "${APPROVAL_LABEL}":\n  - ${touched.join('\n  - ')}`);
  }
  return { errors, touched };
}

function main() {
  const base = process.env.BASE_SHA || 'origin/main';
  const head = process.env.HEAD_SHA || 'HEAD';
  const labels = JSON.parse(process.env.PR_LABELS || '[]');
  const { deferred } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const diff = execFileSync('git', ['diff', '--name-status', '--find-renames', `${base}...${head}`], { encoding: 'utf8' });
  const { errors, touched } = evaluate({ changes: parseNameStatus(diff), labels, deferred, fileExists: existsSync });
  console.log(`Caminhos de produção tocados: ${touched.length ? touched.join(', ') : 'nenhum'}`);
  console.log(`Migrations adiadas protegidas: ${deferred.map((d) => d.version).join(', ')}`);
  if (errors.length) { for (const e of errors) console.error(`::error::${e}`); process.exit(1); }
  console.log('deploy-governance: OK');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
