#!/usr/bin/env node
/**
 * Assert estático (sem DB): scope-guard fecha o bypass de escopo da v4
 * e ordena depois da recriação do corpo BL-2 (ex-274).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const guardName = '20260809120837_finalize_v4_scope_guard_22args.sql'
/** Pós-#267 o arquivo 274_* foi timestampado; aceita ambos os nomes. */
const bodyCandidates = [
  '274_bl2_promocao_rpc_e_precedencia.sql',
  '20260731200700_bl2_promocao_rpc_e_precedencia.sql',
]

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
const guardIdx = files.indexOf(guardName)
const bodyName = bodyCandidates.find((n) => files.includes(n))
const bodyIdx = bodyName ? files.indexOf(bodyName) : -1

function fail(msg) {
  console.error(`[assert-finalize-v4-scope-guard] FAIL — ${msg}`)
  process.exit(1)
}

if (guardIdx < 0) fail(`${guardName} ausente`)
if (bodyIdx < 0) fail(`corpo BL-2 (274) ausente — tentou: ${bodyCandidates.join(', ')}`)
if (guardIdx <= bodyIdx) fail(`${guardName} deve ordenar depois de ${bodyName}`)

const src = fs.readFileSync(path.join(migrationsDir, guardName), 'utf8')
const required = [
  'finalizar_venda_transacional_canonica_v4_unscoped',
  'FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA',
  'FINALIZAR_VENDA_CANONICA_CAIXA_LOJA_INVALIDA',
  'FINALIZAR_VENDA_CANONICA_CAIXA_OPERADOR_INVALIDO',
  'FINALIZAR_VENDA_CANONICA_OPERADOR_INVALIDO',
  'p_motivo_desconto',
  'p_motivo_descricao',
  'motivo_desconto_enum_tipo',
  'p_limite_credito_gerente_token',
  'REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4_unscoped',
]

for (const needle of required) {
  if (!src.includes(needle)) fail(`migration não contém: ${needle}`)
}

console.log(
  `[assert-finalize-v4-scope-guard] OK — guard após ${bodyName}, assinatura 22 args`,
)
