/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'
import type { FinanceiroPainel, FinanceiroRecebivel } from '../financeiroLojaTypes'

const carregar = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('../financeiroLojaActions', () => ({ executarFinanceiroLoja: vi.fn(), carregarRecebiveisCompletos: () => carregar() }))

import { FinanceiroRecebiveis } from './FinanceiroRecebiveis'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rec = (o: Partial<FinanceiroRecebivel>): FinanceiroRecebivel => ({ id: 'r1', venda_id: 'aaaaaaaa-1111', forma: 'PIX', parcela: 1, parcelas: 1, bruto: 1234.5, taxa: 10, liquido: 1224.5, previsao: '2026-10-01', operadora: null, conta_financeira_id: null, status: 'PENDENTE', devolucao: false, ...o })

const painel = (recebiveis: FinanceiroRecebivel[], total = recebiveis.length) => ({
 hoje: '2026-10-20', saldo: 0, saldo_pdv: 0, pagina: 1, contas: [], categorias: [], clientes: [], fornecedores: [], pagar: [], receber: [], movimentos: [],
 recebiveis, extratos: [], movimentos_caixa: [], contagens: { pagar: 0, receber: 0, recebiveis: total, movimentos: 0, extratos: 0 }, fluxo: [],
 alertas: { sem_previsao: 0, ar_sem_vencimento: 0, caixas_incompletos: 0, sem_categoria: 0 }, resultado_caixa: [],
}) as unknown as FinanceiroPainel

let root: Root; let el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); carregar.mockReset() })
afterEach(() => { act(() => root.unmount()); el.remove() })

async function render(data: FinanceiroPainel) {
 await act(async () => { root.render(<AdminV2SessionProvider idioma="pt"><FinanceiroRecebiveis data={data} /></AdminV2SessionProvider>) })
}

it('formata moeda e data pt-BR, mostra status vencido e totais do conjunto completo', async () => {
 const pagina = [rec({})]
 carregar.mockResolvedValue({ ok: true, data: { hoje: '2026-10-20', truncado: false, rows: [...pagina, rec({ id: 'r2', liquido: 100, status: 'RECEBIDO' }), rec({ id: 'r3', liquido: 50, previsao: '2026-12-01' })] } })
 await render(painel(pagina, 3))
 const txt = el.textContent!.replace(/\u00a0/g, ' ')
 expect(txt).toContain('R$ 1.234,50')
 expect(txt).toContain('01/10/2026')
 expect(txt).toContain('Vencido')
 const resumo = el.querySelector('[data-testid="financeiro-recebiveis-resumo"]')!.textContent!.replace(/\u00a0/g, ' ')
 expect(resumo).toContain('R$ 1.374,50') // total
 expect(resumo).toContain('R$ 100,00') // recebido
 expect(resumo).toContain('R$ 1.274,50') // em aberto
 expect(resumo).toContain('R$ 1.224,50') // vencido
})

it('estado vazio', async () => {
 carregar.mockResolvedValue({ ok: true, data: { hoje: '2026-10-20', truncado: false, rows: [] } })
 await render(painel([]))
 expect(el.textContent).toContain('Nenhum recebível nesta página')
})

it('estado de erro dos totais com tentar de novo', async () => {
 carregar.mockResolvedValueOnce({ ok: false, error: 'falhou' })
 await render(painel([rec({})]))
 expect(el.textContent).toContain('falhou')
 carregar.mockResolvedValueOnce({ ok: true, data: { hoje: '2026-10-20', truncado: false, rows: [rec({})] } })
 const btn = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Tentar de novo'))!
 await act(async () => { btn.click() })
 expect(el.querySelector('[data-testid="financeiro-recebiveis-resumo"]')).not.toBeNull()
})
