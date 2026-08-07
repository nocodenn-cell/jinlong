/** @vitest-environment jsdom */
/**
 * Critério de aceite do cadastro rápido — percorre o fluxo exato do operador
 * novo, sem treinamento e sem mouse:
 *
 *   código → nome → categoria → fornecedor → custo → venda → estoque → salvar
 *
 * e confere que o produto criado é VENDÁVEL pela regra do PDV. O que este teste
 * protege é o funil inteiro: cadastro que sai sem preço, sem estoque ou sem
 * status publicado é produto que não vende no caixa depois.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isProdutoVendavel } from '../../../../shared-core/src/catalog/isProdutoVendavel'
import { statusInicialProduto } from '../../../../shared-core/src/engine/productEngine'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitToast: vi.fn(),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const opcoes = {
  categorias: [{ id: 'cat-bebidas', nome: 'Bebidas' }],
  marcas: [],
  fornecedores: [{ id: 'forn-shenzhen', nome: 'Importadora Shenzhen' }],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarProdutoMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'produto-novo-1' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function campo(field: string): HTMLInputElement {
  const el = container.querySelector(`input[data-field="${field}"]`) as HTMLInputElement | null
  expect(el, `campo ${field}`).toBeTruthy()
  return el!
}

function selectComOpcao(rotulo: string): HTMLSelectElement {
  const opcao = Array.from(container.querySelectorAll('option')).find(
    (o) => o.textContent === rotulo,
  )
  expect(opcao, `opção ${rotulo}`).toBeTruthy()
  return opcao!.closest('select') as HTMLSelectElement
}

function escolher(select: HTMLSelectElement, value: string) {
  flushSync(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function enter(el: HTMLElement) {
  flushSync(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

describe('critério de aceite — cadastro completo sem sair do modo simples', () => {
  it('percorre os 9 passos e cria um produto vendável', async () => {
    flushSync(() =>
      root.render(
        <NovoProdutoModal
          open
          onOpenChange={vi.fn()}
          m={m}
          opcoes={opcoes}
          onCriado={vi.fn()}
        />,
      ),
    )

    // 1. Modo simples é o padrão — "Mais detalhes" nunca é clicado neste teste.
    expect(container.textContent).toContain(m.produtos.modo_completo)

    // 2-3. Código escaneado; Enter cai no nome.
    const codigo = campo('codigo_barras')
    setInputValue(codigo, '7891234567895')
    codigo.focus()
    enter(codigo)
    expect(document.activeElement).toBe(campo('nome'))
    setInputValue(campo('nome'), 'Garrafa Térmica 500ml')

    // 4-5. Categoria e fornecedor: alcançáveis sem abrir "Mais detalhes".
    escolher(selectComOpcao('Bebidas'), 'cat-bebidas')
    escolher(selectComOpcao('Importadora Shenzhen'), 'forn-shenzhen')

    // 6-7. Custo e venda; a margem é visível na hora da digitação.
    enter(campo('nome'))
    expect(document.activeElement).toBe(campo('preco_custo'))
    setInputValue(campo('preco_custo'), '18,00')
    enter(campo('preco_custo'))
    expect(document.activeElement).toBe(campo('preco_varejo'))
    setInputValue(campo('preco_varejo'), '45,00')

    const margem = container.querySelector('[data-field="margem"]') as HTMLElement
    expect(margem.dataset.tom).toBe('ok')
    expect(margem.textContent).toContain('60,0%')

    // 8. Estoque inicial, com a unidade à vista.
    enter(campo('preco_varejo'))
    const estoque = campo('estoque_inicial')
    expect(document.activeElement).toBe(estoque)
    expect(estoque.closest('label')!.textContent).toContain('(UN)')
    setInputValue(estoque, '24')

    // 9. Enter salva — nenhum clique de mouse em todo o fluxo.
    enter(estoque)
    await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalledTimes(1))

    const payload = criarProdutoMock.mock.calls[0][0] as Record<string, unknown>

    // Nada essencial se perdeu no caminho.
    expect(payload).toMatchObject({
      nome: 'Garrafa Térmica 500ml',
      codigo_barras: '7891234567895',
      categoria_id: 'cat-bebidas',
      fornecedor_id: 'forn-shenzhen',
      preco_custo: 18,
      preco_varejo: 45,
      unidade_medida: 'UN',
      estoque_inicial_quantidade: 24,
    })

    // Não marcou rascunho: o payload não carrega override de status, então
    // vale a regra de cadastro manual do motor único.
    expect(payload.status_publicacao).toBeUndefined()
    expect(
      isProdutoVendavel(statusInicialProduto('human')),
      'cadastro manual precisa sair vendável no PDV',
    ).toBe(true)

    // Fecha o ciclo: a tela pós-salvar aponta o próximo passo.
    await vi.waitFor(() => {
      expect(container.textContent).toContain(m.produtos.pos_salvar_ajustar_estoque)
    })
  })

  it('produto vindo de importação NÃO sai vendável', () => {
    // Espelho negativo: só o cadastro manual publica na hora. Se esta regra
    // mudar, o teste acima passa a mentir sobre o fluxo de venda.
    expect(isProdutoVendavel(statusInicialProduto('import'))).toBe(false)
  })
})
