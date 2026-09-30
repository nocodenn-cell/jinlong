/**
 * Contrato estático (sem banco): a invariante "desconto de gerente => 100% DINHEIRO"
 * vive no trigger de `descontos_venda`. Falha se a migration perder o trigger, a
 * comparação por forma ou o hardening da função, ou se uma migration posterior
 * derrubar o trigger.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const SQL_TEST = path.resolve(ROOT, '../backend/scripts/descontos-venda-exige-dinheiro.test.sql')
const MIGRATION = '20260929130000_descontos_venda_exige_pagamento_dinheiro.sql'
const TRIGGER = 'trg_descontos_venda_exige_pagamento_dinheiro'
const ERRO = 'DESCONTO_GERENTE_EXIGE_PAGAMENTO_DINHEIRO'

const files = () => fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()

describe('descontos_venda exige pagamento DINHEIRO (invariante de banco)', () => {
  const src = fs.readFileSync(path.join(MIGRATIONS, MIGRATION), 'utf8')

  it('migration existe e cria o trigger BEFORE INSERT em descontos_venda', () => {
    expect(files()).toContain(MIGRATION)
    expect(src).toMatch(/CREATE TRIGGER trg_descontos_venda_exige_pagamento_dinheiro\s+BEFORE INSERT OR UPDATE OF venda_id ON public\.descontos_venda/)
  })

  it('valida escalar e TODAS as parcelas (upper, sem trim) e levanta o erro canônico', () => {
    expect(src).toContain(ERRO)
    expect(src).toContain("upper(COALESCE(v_forma, '')) <> 'DINHEIRO'")
    expect(src).toContain("upper(COALESCE(vp.forma_pagamento, '')) <> 'DINHEIRO'")
    expect(src).not.toMatch(/btrim|trim\(/i)
  })

  it('função SECURITY DEFINER com search_path fixo e sem EXECUTE para anon/authenticated', () => {
    expect(src).toMatch(/SECURITY DEFINER\s+SET search_path TO 'public'/)
    expect(src).toMatch(/REVOKE ALL ON FUNCTION internal\.trg_descontos_venda_exige_pagamento_dinheiro\(\)\s+FROM PUBLIC, anon, authenticated/)
  })

  it('não altera as funções do núcleo transacional nem o offline', () => {
    expect(src).not.toMatch(/CREATE OR REPLACE FUNCTION public\./)
    expect(src).not.toMatch(/finalizar_venda_transacional_canonica_v4\s*\(/)
  })

  it('bloco de verificação confere o trigger no catálogo', () => {
    expect(src).toContain('DESCONTO_DINHEIRO_TRIGGER_AUSENTE')
    expect(src).toContain("t.tgenabled = 'O'")
  })

  it('nenhuma migration posterior derruba ou desabilita o trigger', () => {
    const posteriores = files().filter((f) => f > MIGRATION)
    for (const f of posteriores) {
      const s = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
      expect(s, f).not.toMatch(new RegExp(`DROP TRIGGER[^;]*${TRIGGER}`, 'i'))
      expect(s, f).not.toMatch(new RegExp(`DISABLE TRIGGER[^;]*${TRIGGER}`, 'i'))
    }
  })

  it('teste SQL cobre dinheiro, PIX, cartões, misto, escalar divergente e regressão sem desconto', () => {
    const t = fs.readFileSync(SQL_TEST, 'utf8')
    expect(t).toContain(ERRO)
    for (const caso of ['caso 3 (PIX)', 'caso 6 (dinheiro + PIX)', 'caso 7 (dinheiro + cartão)', 'caso 8 (escalar PIX + parcela dinheiro)']) {
      expect(t).toContain(caso)
    }
    expect(t).toContain('venda sem desconto em PIX/cartão/misto continua gravando')
    expect(t.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })
})
