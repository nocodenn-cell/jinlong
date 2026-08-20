#!/usr/bin/env node
/**
 * Gate de drift banco ↔ `database.types.ts` — F-5 da reauditoria adversarial.
 *
 * O gate de tipos existente (`pdv-importados/lib/supabase/financialRpcContract.ts`)
 * afirma adapters ↔ tipos: falha se o arquivo versionado deixar de declarar o
 * que os adapters enviam. Ele NÃO detecta o caso oposto — uma migration que
 * muda a assinatura de uma RPC sem regenerar os tipos passa silenciosamente,
 * porque os dois lados continuam consistentes entre si.
 *
 * Este script fecha a outra metade: regenera os tipos a partir do banco local e
 * compara com o arquivo versionado. Qualquer divergência falha.
 *
 * Uso:
 *   npm run check:types-drift -w fastproduct-backend
 *
 * Requer o stack local no ar (o CI já o sobe no job `supabase-local-gates`).
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BACKEND = resolve(HERE, '..')
const TYPES_FILE = resolve(BACKEND, '..', 'pdv-importados', 'lib', 'supabase', 'database.types.ts')

/** Ignora diferenças que não são contrato: fim de linha e espaço no fim. */
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()
}

function main() {
  if (!existsSync(TYPES_FILE)) {
    console.error(`Arquivo de tipos não encontrado: ${TYPES_FILE}`)
    process.exit(1)
  }

  const gen = spawnSync('npx', ['supabase', 'gen', 'types', 'typescript', '--local'], {
    cwd: BACKEND,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  })

  if (gen.status !== 0 || !gen.stdout?.trim()) {
    console.error('Falha ao gerar tipos do banco local.')
    if (gen.stderr) process.stderr.write(gen.stderr)
    process.exit(1)
  }

  const geradoLinhas = normalize(gen.stdout).split('\n')
  const versionadoLinhas = normalize(readFileSync(TYPES_FILE, 'utf8')).split('\n')

  if (geradoLinhas.join('\n') === versionadoLinhas.join('\n')) {
    console.log(`Tipos em dia com o banco: ${versionadoLinhas.length} linhas.`)
    return
  }

  // Primeira divergência, com contexto, para dizer o que regenerar.
  let i = 0
  while (
    i < geradoLinhas.length &&
    i < versionadoLinhas.length &&
    geradoLinhas[i] === versionadoLinhas[i]
  ) {
    i++
  }

  console.error('DRIFT: `database.types.ts` não corresponde ao schema do banco.')
  console.error(`Primeira divergência na linha ${i + 1}:`)
  console.error(`  versionado: ${versionadoLinhas[i] ?? '(fim do arquivo)'}`)
  console.error(`  gerado:     ${geradoLinhas[i] ?? '(fim do arquivo)'}`)
  console.error(
    `\nRegenere com:\n  cd backend && npx supabase gen types typescript --local > ../pdv-importados/lib/supabase/database.types.ts`,
  )
  process.exit(1)
}

main()
