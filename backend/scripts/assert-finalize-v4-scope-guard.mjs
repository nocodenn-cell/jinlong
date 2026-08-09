#!/usr/bin/env node
/**
 * Assert estático (sem DB): migration 289 fecha o bypass de escopo da v4
 * e ordena depois da recriação do corpo em 274.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const guardName = '289_finalize_v4_scope_guard.sql'
const bodyName = '274_bl2_promocao_rpc_e_precedencia.sql'

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
const guardIdx = files.indexOf(guardName)
const bodyIdx = files.indexOf(bodyName)

function fail(msg) {
  console.error(`[assert-finalize-v4-scope-guard] FAIL — ${msg}`)
  process.exit(1)
}

if (guardIdx < 0) fail(`${guardName} ausente`)
if (bodyIdx < 0) fail(`${bodyName} ausente`)
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
  'REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4_unscoped',
]

for (const needle of required) {
  if (!src.includes(needle)) fail(`migration não contém: ${needle}`)
}

console.log('[assert-finalize-v4-scope-guard] OK — guard 289 após 274, assinatura 21 args')
