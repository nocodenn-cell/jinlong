/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { FinanceiroAcoesRapidas } from './FinanceiroAcoesRapidas'
import type { FinanceiroPainel } from '../financeiroLojaTypes'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('../financeiroLojaActions', () => ({ executarFinanceiroLoja: vi.fn() }))

const labels = {
  faixaAria: 'Ações rápidas',
  registrarVenda: 'Registrar venda',
  receber: 'Receber',
  pagar: 'Pagar / Registrar despesa',
  transferir: 'Transferir',
  vendaTitulo: 'Registrar venda',
  vendaTexto: 'Use o PDV',
  vendaPdv: 'Abrir PDV',
  vendaBuscar: 'Buscar venda',
  receberTitulo: 'Receber',
  pagarTitulo: 'Pagar',
  transferirTitulo: 'Transferir',
  avulsoHint: 'Priorize título',
  confirmarReceber: 'Confirmar',
  confirmarPagar: 'Confirmar',
  confirmarTransferir: 'Confirmar',
  saldoRegistrado: 'Saldo registrado no sistema',
}

const data = {
  hoje: '2026-10-06',
  contas: [{ id: 'c1', nome: 'Banco', tipo: 'BANCO', ativo: true, saldo: 5000 }],
  categorias: [{ id: 'cat1', nome: 'Geral', tipo: 'AMBOS', ativo: true }],
  receber: [{ id: 'ar1', nome: 'Cliente', descricao: 'Título', valor_total: 100, valor_pago: 0, valor_aberto: 100, vencimento: '2026-10-10', status: 'ABERTO', categoria_id: null }],
  pagar: [{ id: 'ap1', nome: 'Fornecedor', descricao: 'Despesa', valor_total: 80, valor_pago: 0, valor_aberto: 80, vencimento: '2026-10-10', status: 'ABERTO', categoria_id: null }],
  clientes: [],
  fornecedores: [],
  movimentos: [],
  recebiveis: [],
  extratos: [],
  movimentos_caixa: [],
  formas_pagamento: [],
  contagens: { pagar: 1, receber: 1, recebiveis: 0, movimentos: 0, extratos: 0 },
  fluxo: [],
  alertas: { sem_previsao: 0, ar_sem_vencimento: 0, caixas_incompletos: 0, sem_categoria: 0 },
  resultado_caixa: [],
  resultado_gerencial: { receita_vendas: 0, custo_conhecido: 0, itens_sem_custo: 0, despesas_manuais: 0, taxas_conferidas: 0, taxas_pendentes: 0 },
  saldo: 5000,
  saldo_pdv: 0,
  pagina: 1,
} as FinanceiroPainel

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

it('faixa fixa expõe Registrar venda, Receber, Pagar e Transferir com texto legível', () => {
  flushSync(() =>
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <FinanceiroAcoesRapidas data={data} labels={labels} />
      </AdminV2SessionProvider>,
    ),
  )
  const toolbar = container.querySelector('[role=toolbar]')
  expect(toolbar).not.toBeNull()
  expect(toolbar?.textContent).toContain('Saldo registrado no sistema')
  for (const texto of ['Registrar venda', 'Receber', 'Pagar / Registrar despesa', 'Transferir']) {
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(texto))
    expect(btn, texto).toBeDefined()
    expect(btn!.className).toMatch(/min-h-14/)
  }
})

it('Receber abre painel com seleção de título existente', () => {
  flushSync(() =>
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <FinanceiroAcoesRapidas data={data} labels={labels} />
      </AdminV2SessionProvider>,
    ),
  )
  const receber = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Receber')
  flushSync(() => receber!.click())
  expect(container.textContent).toContain('Título a receber')
  expect(container.textContent).toContain('Cliente')
})
