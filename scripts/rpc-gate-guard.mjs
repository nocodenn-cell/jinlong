#!/usr/bin/env node
/**
 * RPC GATE GUARD — Fonte única de verdade para RPCs de venda.
 *
 * Regras não-negociáveis:
 *
 *   1. PROIBIDO em código de produção (pdv-importados + edge functions):
 *      - finalizar_venda_transacional_canonica_v2  → LEGACY_DISABLED_USE_V4 no DB
 *      - finalizar_venda_transacional_canonica_v3  → LEGACY_DISABLED_USE_V4 no DB
 *
 *   2. ÚNICO chamador autorizado para cada RPC de venda:
 *      - finalizar_venda_transacional_canonica_v4  → caixaVendas.impl.ts (web caixa online)
 *      - registrar_venda_com_itens                 → sync-outbox/index.ts (PDV local offline)
 *
 *   3. SEPARAÇÃO de contextos (não há "dupla execução"):
 *      - Web caixa (online)  → v4 — transacional, atômico, retorna event_id
 *      - PDV local (offline) → registrar_venda_com_itens — via sync-outbox edge function
 *
 * Toda mudança que viole estas regras DEVE quebrar o CI antes de chegar ao main.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Diretórios de produção — dev-tools são explicitamente excluídos
const PROD_DIRS = [
  path.join(root, 'pdv-importados'),
  path.join(root, 'backend', 'supabase', 'functions'),
]

// RPCs proibidas em qualquer arquivo de produção
const BLOCKED_RPCS = [
  'finalizar_venda_transacional_canonica_v2',
  'finalizar_venda_transacional_canonica_v3',
]

// RPC → único arquivo autorizado a chamá-la
const SINGLE_CALLER = {
  'finalizar_venda_transacional_canonica_v4':
    'pdv-importados/app/caixa/server/caixaVendas.impl.ts',
  'registrar_venda_com_itens':
    'backend/supabase/functions/sync-outbox/index.ts',
  // Fase 3.1: consumo único do token de gerente + gravação da venda na mesma transação (venda offline com token).
  'registrar_venda_offline_com_token':
    'backend/supabase/functions/sync-outbox/index.ts',
}

/**
 * Coleta recursivamente arquivos .ts/.tsx em dirs de produção.
 * Exclui: arquivos de test/spec (mocks legítimos) e database.types.ts (definições de tipo).
 */
function collectProdFiles(dirs) {
  const result = []
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        result.push(...collectProdFiles([full]))
      } else if (
        e.isFile() &&
        /\.(ts|tsx)$/.test(e.name) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(e.name) &&
        e.name !== 'database.types.ts'
      ) {
        result.push(full)
      }
    }
  }
  return result
}

const violations = []
const prodFiles = collectProdFiles(PROD_DIRS)

// Regra 1: nenhum arquivo de produção pode chamar RPCs bloqueadas
for (const file of prodFiles) {
  const rel = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')
  for (const rpc of BLOCKED_RPCS) {
    if (text.includes(rpc)) {
      violations.push(
        `[BLOQUEADA] ${rel}\n  → Contém "${rpc}" que está bloqueada no DB com LEGACY_DISABLED_USE_V4.\n  → Use finalizar_venda_transacional_canonica_v4.`,
      )
    }
  }
}

// Regra 2: cada RPC crítica tem exatamente um caller autorizado
for (const [rpc, authorizedRelPath] of Object.entries(SINGLE_CALLER)) {
  const authorizedAbs = path.join(root, authorizedRelPath)
  for (const file of prodFiles) {
    const rel = path.relative(root, file)
    if (file === authorizedAbs) continue // caller autorizado — OK
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes(rpc)) {
      violations.push(
        `[CALLER DUPLICADO] ${rel}\n  → Contém "${rpc}" mas o único caller autorizado é ${authorizedRelPath}.\n  → Centralizar em um único ponto de entrada elimina execução dupla.`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error('[rpc-gate-guard] FAIL — violação de roteamento de RPC de venda:\n')
  for (const v of violations) console.error(`  - ${v}\n`)
  console.error(
    '  → Regras: v4 = web caixa (caixaVendas.impl.ts) | registrar_venda_com_itens = sync-outbox apenas.\n  → RPCs v2/v3 estão bloqueadas no DB. Ver scripts/rpc-gate-guard.mjs.',
  )
  process.exit(1)
}

console.log('[rpc-gate-guard] OK — fluxo de venda único e correto: v4 (web) | registrar_venda_com_itens (PDV local)')
