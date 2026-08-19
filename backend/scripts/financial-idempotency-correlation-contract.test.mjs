import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260813231034_financial_idempotency_correlation_expand.sql',
  import.meta.url,
)
const sql = readFileSync(migrationUrl, 'utf8')

function tableBlock(table, nextMarker) {
  const start = sql.indexOf(`ALTER TABLE public.${table}`)
  assert.notEqual(start, -1, `migration must alter ${table}`)
  const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length
  assert.notEqual(end, -1, `migration marker missing after ${table}`)
  return sql.slice(start, end)
}

test('EXPAND keeps the legacy RPC contracts untouched', () => {
  assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.registrar_liquidacao_receber/i)
  assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.registrar_pagamento_contas_pagar/i)
})

test('AR history receives nullable correlation and append-only reversal fields', () => {
  const block = tableBlock('liquidacoes_receber', '-- Accounts payable payments')
  for (const column of [
    'idempotency_key text',
    'origem text',
    'loja_id uuid',
    'caixa_id uuid',
    'operacao_tipo text',
    'operacao_origem_id uuid',
  ]) {
    assert.match(block, new RegExp(column.replace(' ', '\\s+'), 'i'))
  }
  assert.match(block, /UNIQUE INDEX IF NOT EXISTS uq_liquidacoes_receber_idempotency/i)
  assert.match(block, /ON public\.liquidacoes_receber\s*\(titulo_id, idempotency_key\)/i)
  assert.match(block, /WHERE idempotency_key IS NOT NULL/i)
  assert.match(block, /operacao_tipo IS NULL OR operacao_tipo IN \('RECEBIMENTO', 'ESTORNO'\)/i)
})

test('AP history receives the same contract plus a unique sangria correlation', () => {
  const block = tableBlock('contas_pagar_pagamentos')
  for (const column of [
    'idempotency_key text',
    'origem text',
    'loja_id uuid',
    'caixa_id uuid',
    'operacao_tipo text',
    'operacao_origem_id uuid',
    'movimentacao_caixa_id uuid',
  ]) {
    assert.match(block, new RegExp(column.replace(' ', '\\s+'), 'i'))
  }
  assert.match(block, /UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_pagamentos_idempotency/i)
  assert.match(block, /ON public\.contas_pagar_pagamentos\s*\(conta_id, idempotency_key\)/i)
  assert.match(block, /UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_pagamentos_movimentacao_caixa/i)
  assert.match(block, /operacao_tipo IS NULL OR operacao_tipo IN \('PAGAMENTO', 'ESTORNO'\)/i)
})

test('new correlation fields stay nullable during EXPAND', () => {
  assert.doesNotMatch(
    sql,
    /ADD COLUMN IF NOT EXISTS\s+(?:idempotency_key|origem|loja_id|caixa_id|operacao_tipo|operacao_origem_id|movimentacao_caixa_id)[^,;\n]*NOT NULL/i,
  )
})

test('migration does not broaden RLS or grants', () => {
  const executableSql = sql.replace(/^\s*--.*$/gm, '')
  assert.doesNotMatch(executableSql, /CREATE\s+POLICY|GRANT\s+/i)
  assert.match(sql, /New snapshot columns do not grant access and are not authorization inputs/i)
})
