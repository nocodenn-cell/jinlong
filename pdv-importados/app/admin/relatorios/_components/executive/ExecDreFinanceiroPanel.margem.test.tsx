/** @vitest-environment jsdom */
/**
 * UX-IA-01 R5 (opção b): com custo incompleto, a margem aparece como INTERVALO.
 * Teto = margem aproximada (receita − custo conhecido); piso = teto − receita das vendas sem custo.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RelatorioResumoExecutivoDTO } from '@/app/gerente/relatorios/actions'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { ExecDreFinanceiroPanel, resumirVendasSemCusto, LIMITE_MARGEM_POR_VENDA } = await import(
  './ExecDreFinanceiroPanel'
)

const resumo = (over: Partial<RelatorioResumoExecutivoDTO>): RelatorioResumoExecutivoDTO => ({
  itens_vendidos: 10,
  vendas_concluidas: 3,
  vendas_canceladas: 0,
  taxa_cancelamento: 0,
  cobertura_custo: 0.8,
  custo_confiavel: false,
  margem_bruta_estimada: null,
  ...over,
})

const financeiro = {
  hoje: '2026-10-07',
  receber: [],
  pagar: [],
  resultado_gerencial: { receita_vendas: 1000, custo_conhecido: 470, despesas_manuais: 0, taxas_conferidas: 0 },
} as never

function montar(props: Partial<React.ComponentProps<typeof ExecDreFinanceiroPanel>>) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  flushSync(() =>
    root.render(
      React.createElement(ExecDreFinanceiroPanel, {
        faturamentoBruto: 1000,
        receitaLiquida: 1000,
        devolucoes: 0,
        resumo: resumo({}),
        locale: 'pt-BR',
        periodoDe: '2026-10-01',
        periodoAte: '2026-10-07',
        financeiro,
        ...props,
      }),
    ),
  )
  const texto = el.textContent ?? ''
  root.unmount()
  el.remove()
  return texto.replace(/ /g, ' ')
}

describe('resumirVendasSemCusto', () => {
  it('soma só as vendas sem custo confiável e marca lista parcial no limite', () => {
    const r = resumirVendasSemCusto([
      { custo_confiavel: true, total_liquido: 100 },
      { custo_confiavel: false, total_liquido: 51.6 },
      { custo_confiavel: false, total_liquido: 10.1 },
    ])
    expect(r).toEqual({ qtd: 2, receita: 61.7, parcial: false })
    const cheia = Array.from({ length: LIMITE_MARGEM_POR_VENDA }, () => ({ custo_confiavel: true, total_liquido: 1 }))
    expect(resumirVendasSemCusto(cheia).parcial).toBe(true)
  })
})

describe('ExecDreFinanceiroPanel — margem em intervalo', () => {
  it('custo incompleto: mostra "piso a teto" (teto = receita − custo conhecido)', () => {
    const t = montar({ vendasSemCusto: { qtd: 1, receita: 51.6, parcial: false } })
    // teto 1000 − 470 = 530,00 ; piso 530,00 − 51,60 = 478,40
    expect(t).toMatch(/R\$\s?478,40 a R\$\s?530,00/)
    expect(t).toContain('Custo incompleto em 1 venda(s)')
  })

  it('lista parcial é sinalizada', () => {
    const t = montar({ vendasSemCusto: { qtd: 2, receita: 80, parcial: true } })
    expect(t).toContain('lista parcial')
  })

  it('lista parcial sem venda sem custo na fatia: ainda divulga o truncamento (só teto)', () => {
    const t = montar({ vendasSemCusto: { qtd: 0, receita: 0, parcial: true } })
    expect(t).toContain('lista parcial')
    expect(t).not.toMatch(/ a R\$/)
  })

  it('devoluções: piso é sinalizado como conservador', () => {
    const t = montar({ devolucoes: 100, vendasSemCusto: { qtd: 1, receita: 100, parcial: false } })
    expect(t).toContain('piso conservador')
  })

  it('fuso divergente: só o teto, sem piso', () => {
    const t = montar({ fusoDiverge: true, vendasSemCusto: { qtd: 1, receita: 51.6, parcial: false } })
    expect(t).not.toMatch(/ a R\$/)
    expect(t).toContain('fuso do relatório')
  })

  it('custo confiável: valor único, sem intervalo', () => {
    const t = montar({
      resumo: resumo({ custo_confiavel: true, margem_bruta_estimada: 530 }),
      vendasSemCusto: { qtd: 0, receita: 0, parcial: false },
    })
    expect(t).not.toMatch(/ a R\$/)
    expect(t).toMatch(/R\$\s?530,00/)
  })
})
