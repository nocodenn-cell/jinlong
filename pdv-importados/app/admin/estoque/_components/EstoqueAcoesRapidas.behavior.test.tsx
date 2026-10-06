/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EstoqueAcoesRapidas } from './EstoqueAcoesRapidas'
import type { EstoqueLabels, EstoqueLinha } from './EstoqueTable'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('@/app/gerente/estoque/actions', () => ({ atualizarEstoqueProduto: vi.fn() }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const labels = {
  produto: 'Produto',
  saldo: 'Saldo',
  minimo: 'Mín',
  deficit: 'Déficit',
  unidade: 'un',
  origem: 'Origem',
  origemChina: 'China',
  origemBrasilNf: 'NF',
  origemBrasil: 'BR',
  vazioTitulo: 'Vazio',
  vazioSub: '—',
  ajusteTitulo: 'Ajustar',
  reporTitulo: 'Repor',
  saldoAtual: 'Saldo atual',
  estoqueMinimo: 'Mínimo',
  motivo: 'Motivo',
  observacao: 'Obs',
  cancelar: 'Cancelar',
  salvarAjuste: 'Salvar',
  salvando: 'Salvando',
  motivoAcertoInventario: 'Inventário',
  motivoEntradaCompra: 'Compra',
  motivoPerda: 'Perda',
  motivoQuebra: 'Quebra',
  motivoOutro: 'Outro',
  kardexTitulo: 'Kardex',
  kardexVerAuditoria: 'Auditoria',
  semMovimentos: 'Sem',
  semMovimentosSub: '—',
  tipoMap: {},
  situacaoZerado: 'Zerado',
  situacaoAbaixoMinimo: 'Baixo',
  situacaoNoMinimo: 'Mínimo',
} as EstoqueLabels

const quick = {
  faixaAria: 'Ações estoque',
  entrada: 'Entrada de mercadoria',
  retirar: 'Retirar do estoque',
  ajustar: 'Ajustar quantidade',
  entradaTitulo: 'Entrada',
  entradaTexto: 'Reutilize compra',
  entradaNfe: 'Importar NF-e',
  entradaManual: 'Recebimento manual',
  retirarTitulo: 'Retirar do estoque',
  retirarTexto: 'Informe motivo',
  ajustarTitulo: 'Ajustar quantidade',
  ajustarTexto: 'Diferença',
  buscarPlaceholder: 'Buscar',
  selecionarProduto: 'Nenhum',
  motivoObrigatorio: 'Motivo obrigatório',
  quantidadeRetirar: 'Quantidade a retirar',
  quantidadeContada: 'Quantidade contada',
  saldoAnterior: 'Saldo anterior',
  referenciaDoc: 'Referência',
  referenciaDocHint: 'Opcional',
  confirmarRetirada: 'Confirmar retirada',
  confirmarAjuste: 'Confirmar ajuste',
  erroRetiradaInvalida: 'Qtd inválida',
  erroRetiradaExcede: 'Excede saldo',
  codigoLabel: 'Código',
  unidadeLabel: 'Unidade',
}

const linhas: EstoqueLinha[] = [
  {
    id: 'p1',
    nome: 'Parafuso',
    codigo_barras: '789',
    unidade_medida: 'UN',
    origem: 'brasil_sem_nf',
    quantidade_atual: 10,
    estoque_minimo: 2,
    deficit: null,
  },
]

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

it('faixa fixa do estoque tem Entrada, Retirar e Ajustar', () => {
  flushSync(() => root.render(<EstoqueAcoesRapidas linhas={linhas} labels={labels} quick={quick} />))
  for (const texto of ['Entrada de mercadoria', 'Retirar do estoque', 'Ajustar quantidade']) {
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(texto))
    expect(btn, texto).toBeDefined()
    expect(btn!.className).toMatch(/min-h-14/)
  }
})

it('Entrada aponta para NF-e e recebimento oficiais', () => {
  flushSync(() => root.render(<EstoqueAcoesRapidas linhas={linhas} labels={labels} quick={quick} />))
  const entrada = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Entrada de mercadoria'),
  )
  flushSync(() => entrada!.click())
  expect(container.querySelector('a[href="/admin/estoque/importar-nfe"]')?.textContent).toContain('Importar NF-e')
  expect(container.querySelector('a[href="/admin/estoque/recebimento"]')?.textContent).toContain(
    'Recebimento manual',
  )
})

it('Retirar abre formulário com quantidade a retirar e motivos de saída', () => {
  flushSync(() => root.render(<EstoqueAcoesRapidas linhas={linhas} labels={labels} quick={quick} />))
  const retirar = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Retirar do estoque'),
  )
  flushSync(() => retirar!.click())
  const produto = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Parafuso'))
  expect(produto?.textContent).toMatch(/mín\.\s*2/)
  act(() => produto!.click())
  expect(container.querySelector('[data-testid="ajuste-produto-contexto"]')?.textContent).toContain('Parafuso')
  expect(container.querySelector('input[name="quantidade_retirar"]')).toBeTruthy()
  expect(container.textContent).toContain('Confirmar retirada')
  const select = container.querySelector('select[name="motivo"]') as HTMLSelectElement
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['PERDA', 'QUEBRA', 'OUTRO'])
})

it('Ajustar quantidade abre formulário com quantidade contada', () => {
  flushSync(() => root.render(<EstoqueAcoesRapidas linhas={linhas} labels={labels} quick={quick} />))
  const ajustar = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Ajustar quantidade'),
  )
  flushSync(() => ajustar!.click())
  const produto = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Parafuso'))
  act(() => produto!.click())
  expect(container.textContent).toContain('Quantidade contada')
  expect(container.textContent).toContain('Confirmar ajuste')
  expect(container.querySelector('input[name="quantidade_atual"]')).toBeTruthy()
  const select = container.querySelector('select[name="motivo"]') as HTMLSelectElement
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['ACERTO_INVENTARIO', 'OUTRO'])
})
