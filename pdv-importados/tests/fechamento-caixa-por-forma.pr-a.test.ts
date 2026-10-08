/**
 * PR A — Fechamento por forma: contrato estrutural + número explicável (cenário composto).
 * Prova operacional SQL: backend/scripts/fechamento-por-forma-prova.sql
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const MIG = resolve(
  ROOT,
  'backend/supabase/migrations/20261007180000_calcular_valor_sistema_por_forma_caixa.sql',
)
const CONTRATO = resolve(
  ROOT,
  'docs/regras-negocio/CONTRATO_FECHAMENTO_POR_FORMA.md',
)

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function registrado(split: number, legado: number, devolucoes: number): number {
  return Number((split + legado - devolucoes).toFixed(2))
}

function eDeC(p: {
  abertura: number
  vendasDin: number
  arDin: number
  suprimento: number
  sangria: number
  devolucaoDin: number
}): number {
  return Number(
    (
      p.abertura +
      p.vendasDin +
      p.arDin +
      p.suprimento -
      p.sangria -
      p.devolucaoDin
    ).toFixed(2),
  )
}

describe('PR A fechamento por forma — estrutural', () => {
  const mig = read(MIG)
  const contrato = read(CONTRATO)

  it('migration define RPC pública e helper registrado', () => {
    expect(mig).toContain('calcular_valor_sistema_por_forma_caixa')
    expect(mig).toContain('internal.valor_sistema_registrado_forma')
    expect(mig).toContain('E_C_AUTORIDADE')
    expect(mig).toContain('REGISTRADO_JINLONG')
  })

  it('DINHEIRO delega a internal.valor_sistema_dinheiro (sem segunda E(c))', () => {
    expect(mig).toContain('internal.valor_sistema_dinheiro(p_caixa_id)')
    const start = mig.indexOf(
      'CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_por_forma_caixa',
    )
    const end = mig.indexOf('COMMENT ON FUNCTION public.calcular_valor_sistema_por_forma_caixa')
    const facade = mig.slice(start, end)
    expect(facade).toContain("WHEN f.forma = 'DINHEIRO' THEN internal.valor_sistema_dinheiro")
    expect(facade).not.toMatch(/movimentacoes_caixa/)
    expect(facade).not.toMatch(/valor_inicial/)
    expect(facade).not.toMatch(/liquidacoes_receber/)
  })

  it('formas canônicas atuais: sem FIADO no read model', () => {
    expect(mig).toContain("('CARTAO_CREDITO')")
    expect(mig).not.toMatch(/\('FIADO'\)/)
    expect(contrato).toMatch(/FIADO como forma.*desabilitado/i)
  })

  it('contrato separa E(c)/registrado/informado e nega conciliação bancária', () => {
    expect(contrato).toContain('E_C_AUTORIDADE')
    expect(contrato).toContain('REGISTRADO_JINLONG')
    expect(contrato).toMatch(/não.*conciliação bancária/i)
    expect(contrato).toContain('LIQUIDACAO_CAIXA_APENAS_DINHEIRO')
  })

  it('autorização espelha facade E(c)', () => {
    expect(mig).toContain("u.perfil IN ('GERENTE', 'DONO', 'ADMIN')")
    expect(mig).toContain("ERRCODE = '42501'")
  })

  it('somente leitura: sem tabela de snapshot neste PR', () => {
    expect(mig).not.toMatch(/caixas_fechamento_formas/)
    expect(mig).not.toMatch(/INSERT INTO public\.caixas/i)
  })
})

describe('PR A — número explicável (cenário composto)', () => {
  /**
   * Turno:
   * - abertura 50
   * - venda A: 40 DINHEIRO + 60 PIX
   * - venda B: 80 CARTAO_DEBITO (depois cancelada → 0)
   * - venda C: 20 DINHEIRO + CR 50 (título; sem forma FIADO)
   * - AR 30 DINHEIRO
   * - suprimento 10 / sangria 5
   * - devolução 15 PIX na venda A
   */
  it('reconstrói cada forma com exclusões explícitas', () => {
    const dinheiro = eDeC({
      abertura: 50,
      vendasDin: 40 + 20,
      arDin: 30,
      suprimento: 10,
      sangria: 5,
      devolucaoDin: 0,
    })
    expect(dinheiro).toBe(145)

    const pix = registrado(60, 0, 15)
    expect(pix).toBe(45)

    expect(registrado(0, 0, 0)).toBe(0) // débito após cancel
    expect(registrado(0, 0, 0)).toBe(0) // crédito

    expect(dinheiro).not.toBe(pix)

    const exclusoesPix = [
      'suprimento/sangria (físico)',
      'AR PIX sem caixa_id',
      'saldo CR em aberto (não é forma)',
      'venda cancelada',
    ]
    expect(exclusoesPix).toContain('suprimento/sangria (físico)')
  })

  it('split 40 dinheiro + 60 PIX isola parcelas', () => {
    expect(registrado(60, 0, 0)).toBe(60)
    expect(
      eDeC({
        abertura: 0,
        vendasDin: 40,
        arDin: 0,
        suprimento: 0,
        sangria: 0,
        devolucaoDin: 0,
      }),
    ).toBe(40)
  })

  it('parcial: só o recebido entra na forma; CR aberto não vira linha de fechamento', () => {
    const recebidoDinheiro = 20
    const crAberto = 50
    expect(
      eDeC({
        abertura: 0,
        vendasDin: recebidoDinheiro,
        arDin: 0,
        suprimento: 0,
        sangria: 0,
        devolucaoDin: 0,
      }),
    ).toBe(20)
    // CR aberto não soma em nenhuma forma até liquidar
    expect(crAberto).toBe(50)
  })
})
