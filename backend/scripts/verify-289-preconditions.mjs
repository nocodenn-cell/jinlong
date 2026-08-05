#!/usr/bin/env node
/**
 * PRÉ-CONDIÇÕES DA MIGRATION 289 — Pacote 1, Bloco A (SEC-01, SEC-02, SSOT-01, TB-01).
 *
 * Por que existe: a migration 289 faz `CREATE OR REPLACE FUNCTION` com corpo completo em
 * duas funções de produção. Isso é seguro **apenas** se o corpo em produção for o mesmo da
 * linhagem versionada no repositório — caso contrário o REPLACE reverteria silenciosamente
 * uma alteração feita fora do controle de versão.
 *
 * Este script responde essa pergunta **offline**, comparando o dump de produção com as
 * migrations do repositório. Ele NÃO substitui a introspecção do banco vivo (§7.4 do guia):
 * o dump tem data e o banco pode ter mudado depois. É a metade do trabalho que dá para
 * fazer sem acesso — a outra metade está em `sql/289_precheck.sql`.
 *
 * Uso: node backend/scripts/verify-289-preconditions.mjs
 * Saída: exit 0 se as pré-condições batem; exit 1 se há divergência que exige revisão.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DUMP = path.join(
  ROOT,
  'backend/docs/auditoria/supabase-migration-repair-20260802/remote_schema.sql'
)

/** O dump do Supabase CLI vem em UTF-16LE. */
function readDump() {
  const buf = readFileSync(DUMP)
  const isUtf16 = buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe
  let text = buf.toString(isUtf16 ? 'utf16le' : 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

/**
 * Normaliza para comparar fonte (repo) com `pg_get_functiondef` (dump).
 * As diferenças abaixo são de serialização, não de semântica.
 */
function normalize(sql) {
  return sql
    .replace(/\r/g, '') // CRLF: sem isto o `$` do regex de comentário não casa
    .split('\n')
    .map((line) => line.replace(/--.*$/, '')) // pg_get_functiondef descarta comentários
    .join('\n')
    .replace(/"/g, '') // identificadores citados
    .replace(/DEFAULT NULL::\w+/gi, 'DEFAULT NULL') // cast explícito no default
    .replace(/search_path\s*(?:=|TO)\s*'?public'?/gi, 'search_path=public')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;])\s*/g, '$1')
    .trim()
    .toLowerCase()
}

function extractBody(src, startPattern) {
  const start = src.search(startPattern)
  if (start < 0) return null
  const end = src.indexOf('$$;', start)
  return src.slice(start, end < 0 ? src.length : end)
}

const dump = readDump()

const CASOS = [
  {
    ticket: 'SEC-02 / TB-01',
    nome: 'criar_produto_com_estoque_inicial(jsonb,uuid,uuid)',
    dumpPattern: /CREATE OR REPLACE FUNCTION "public"\."criar_produto_com_estoque_inicial"/,
    repoFile: 'backend/supabase/migrations/20260718135138_criar_produto_permite_operador_pdv.sql',
    repoPattern: /CREATE OR REPLACE FUNCTION public\.criar_produto_com_estoque_inicial/,
    /** O defeito que a 289 remove. Precisa estar presente — se não estiver, já foi corrigido. */
    defeito: (s) => /not in\('operador','gerente','dono','admin'\)/.test(s),
    defeitoDesc: "gate `NOT IN ('OPERADOR','GERENTE','DONO','ADMIN')`",
  },
  {
    ticket: 'SSOT-01',
    nome: 'ajustar_estoque_manual(...,p_ator_id uuid)',
    dumpPattern:
      /CREATE OR REPLACE FUNCTION "public"\."ajustar_estoque_manual"\("p_produto_id" "uuid", "p_loja_id" "uuid", "p_quantidade_atual" numeric, "p_estoque_minimo" numeric, "p_motivo_codigo" "text", "p_observacao" "text" DEFAULT NULL::"text", "p_ator_id"/,
    repoFile: 'backend/supabase/migrations/20260718135500_ajuste_estoque_inicial_operador_pdv.sql',
    repoPattern: /CREATE OR REPLACE FUNCTION public\.ajustar_estoque_manual/,
    defeito: (s) => s.includes('estoque inicial no cadastro de produto'),
    defeitoDesc: 'autorização por string mágica do cliente',
  },
]

let falhou = false

console.log('PRÉ-CONDIÇÕES DA MIGRATION 289 (fonte: dump de produção de 2026-08-02)\n')

for (const caso of CASOS) {
  const corpoDump = extractBody(dump, caso.dumpPattern)
  const corpoRepo = extractBody(
    readFileSync(path.join(ROOT, caso.repoFile), 'utf8'),
    caso.repoPattern
  )

  console.log(`── ${caso.ticket} — ${caso.nome}`)

  if (!corpoDump || !corpoRepo) {
    console.log(`   ✗ não foi possível extrair (dump=${!!corpoDump} repo=${!!corpoRepo})`)
    falhou = true
    continue
  }

  const nd = normalize(corpoDump)
  const nr = normalize(corpoRepo)

  const defeitoPresente = caso.defeito(nd)
  const corpoIgual = nd === nr

  console.log(`   defeito em produção (${caso.defeitoDesc}): ${defeitoPresente ? 'PRESENTE' : 'ausente'}`)
  console.log(`   corpo de produção == linhagem do repo: ${corpoIgual ? 'SIM' : 'NÃO'}`)
  console.log(`   linhagem: ${path.basename(caso.repoFile)}`)

  if (!defeitoPresente) {
    console.log('   ⚠ o defeito não está no dump — reavaliar o ticket antes de aplicar a 289')
    falhou = true
  }
  if (!corpoIgual) {
    const k = [...nd].findIndex((ch, i) => ch !== nr[i])
    console.log(`   ⚠ DIVERGÊNCIA a partir do caractere ${k}:`)
    console.log(`       produção: …${nd.slice(Math.max(0, k - 60), k + 60)}`)
    console.log(`       repo    : …${nr.slice(Math.max(0, k - 60), k + 60)}`)
    console.log('   ⚠ produção divergiu da linhagem versionada — CREATE OR REPLACE reverteria')
    console.log('     essa alteração. NÃO aplicar a 289 antes de resolver.')
    falhou = true
  }
  console.log('')
}

console.log('── SEC-01 — baixar_estoque_venda(uuid,jsonb)')
const grantsSec01 = ['anon', 'authenticated', 'service_role'].filter((role) =>
  dump.includes(
    `GRANT ALL ON FUNCTION "public"."baixar_estoque_venda"("p_loja_id" "uuid", "p_itens" "jsonb") TO "${role}"`
  )
)
console.log(`   grants em produção: ${grantsSec01.join(', ') || '(nenhum)'}`)
const exposto = grantsSec01.includes('anon') || grantsSec01.includes('authenticated')
console.log(`   exposto a role de cliente: ${exposto ? 'SIM — P0 confirmado' : 'não'}`)
if (!exposto) {
  console.log('   ⚠ exposição não confirmada no dump — reavaliar SEC-01')
  falhou = true
}

console.log('')
console.log(
  falhou
    ? '✗ PRÉ-CONDIÇÕES NÃO SATISFEITAS — revisar antes de aplicar a 289'
    : '✓ pré-condições satisfeitas no dump. Falta a verificação no banco vivo (sql/289_precheck.sql).'
)

process.exit(falhou ? 1 : 0)
