#!/usr/bin/env node
// Guarda do job migration-remote-drift (ci-backend-supabase.yml).
// Aceita EXCLUSIVAMENTE o projeto de homologação. Roda ANTES de `supabase link` e de qualquer consulta remota.
// Não imprime o valor do ref: só o motivo da recusa. Comparação exata, sem trim e sem normalização:
// qualquer diferença (espaço, maiúscula, quebra de linha) é recusada (fail closed).

import { pathToFileURL } from 'node:url';

export const REF_HOMOLOG = 'yvdilcmxyjafnnsfdtam';
export const REF_PRODUCAO = 'kbabmewnahysfvlybiak';

export function validarAlvoDrift(ref) {
  if (typeof ref !== 'string' || ref.length === 0) return { ok: false, motivo: 'REF_VAZIO' };
  if (ref === REF_PRODUCAO) return { ok: false, motivo: 'REF_PRODUCAO_BLOQUEADO' };
  if (ref !== REF_HOMOLOG) return { ok: false, motivo: 'REF_NAO_HOMOLOGACAO' };
  return { ok: true, motivo: 'HOMOLOGACAO' };
}

function main() {
  const resultado = validarAlvoDrift(process.env.SUPABASE_MIGRATION_CHECK_PROJECT_REF);
  if (!resultado.ok) {
    console.error(`drift-target-guard: RECUSADO (${resultado.motivo}). Nenhuma consulta remota foi feita.`);
    process.exit(1);
  }
  console.log('drift-target-guard: alvo aceito (homologação).');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
