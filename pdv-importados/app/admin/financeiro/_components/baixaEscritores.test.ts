/**
 * Correspondência ação → escritor → destino. Lê o código, não o banco.
 * Caixa não grava conta financeira. Conta não manda caixa_id.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const aqui = dirname(fileURLToPath(import.meta.url))

function ler(relativo: string): string {
  return readFileSync(join(aqui, relativo), 'utf8')
}

function trecho(fonte: string, inicio: string, fim: string): string {
  const de = fonte.indexOf(inicio)
  const ate = fonte.indexOf(fim, de + inicio.length)
  return fonte.slice(de, ate)
}

describe('escritores de baixa — caixa e conta não se misturam', () => {
  const ledger = ler('../../../../../backend/supabase/migrations/20261005004647_financeiro_loja_contas_ledger.sql')
  const baixarAp = trecho(ledger, "WHEN 'BAIXAR_AP'", "WHEN 'CRIAR_AR'")
  const baixarAr = trecho(ledger, "WHEN 'BAIXAR_AR'", "WHEN 'TRANSFERIR'")

  it('BAIXAR_AP chama o pagamento com TRANSF, sem gaveta, e liga a conta financeira', () => {
    expect(baixarAp).toContain("'TRANSF'")
    expect(baixarAp).toContain(",NULL,'FINANCEIRO_CONTAS',NULL")
    expect(baixarAp).toContain('SET conta_financeira_id=c.id')
    expect(baixarAp).not.toContain('DINHEIRO')
  })

  it('BAIXAR_AR liquida como OUTROS, sem gaveta, e liga a conta financeira', () => {
    expect(baixarAr).toContain("'OUTROS'")
    expect(baixarAr).toContain(",NULL,'FINANCEIRO_CONTAS'")
    expect(baixarAr).toContain('SET conta_financeira_id=c.id')
    expect(baixarAr).not.toContain('DINHEIRO')
  })

  it('o gatilho só lança movimento quando a conta financeira está preenchida', () => {
    const gatilho = trecho(ledger, 'CREATE FUNCTION internal.financeiro_baixa_ledger', 'CREATE TRIGGER financeiro_ap_ledger')
    expect(gatilho).toContain('IF c IS NOT NULL')
    expect(gatilho).toContain("NEW.forma_pagamento='DINHEIRO'")
  })

  it('o modal de caixa não referencia o comando da conta', () => {
    const modal = ler('../../../gerente/financeiro/contas-pagar/PagamentoModal.tsx')
    const action = ler('../../../gerente/financeiro/contas-pagar/actions.ts')
    expect(modal).toContain('registrarPagamentoAction')
    expect(modal).not.toContain('executarFinanceiroLoja')
    expect(action).toContain('createPayablePaymentService')
    expect(action).not.toContain('financeiro_comando')
  })

  it('o formulário da conta não referencia pagamento de caixa nem liquidação direta', () => {
    const form = ler('./FinanceiroForm.tsx')
    expect(form).toContain('executarFinanceiroLoja')
    expect(form).not.toContain('registrarPagamentoAction')
    expect(form).not.toContain('liquidarTitulo')
  })

  it('receber no caixa chama liquidarTitulo e não o comando da conta', () => {
    const extras = ler('./FinanceiroReceberExtras.tsx')
    const chamada = trecho(extras, 'function handleLiquidar', 'function handleNovoTitulo')
    expect(chamada).toContain('liquidarTitulo')
    expect(chamada).toContain("const forma = 'DINHEIRO'")
    expect(chamada).not.toContain('executarFinanceiroLoja')
  })
})
