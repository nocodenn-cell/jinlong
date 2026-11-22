/**
 * P0-3 (PDV): recuperação do cupom persistido no store real (`pdv-carrinho`).
 * Escreve blobs no localStorage no formato que o navegador do operador tem hoje
 * (v1) e no formato novo (v2), e exige o comportamento da store, não só da função pura.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { CARRINHO_PERSIST_VERSION, CARRINHO_VALIDADE_MS } from '../caixa/recuperacaoCarrinho'
import { useCartStore, type ItemCarrinho } from './unifiedCartStore'

const KEY = 'pdv-carrinho'
const ABERTO = { status: 'aberto', caixaId: 'caixa-1' } as const

function item(id: string): ItemCarrinho {
  return { id, produtoId: `p-${id}`, quantidade: 1, precoUnitario: 10, precoOriginal: 10, nome: 'Produto teste' }
}

function gravar(version: number, state: Record<string, unknown>) {
  localStorage.setItem(KEY, JSON.stringify({ state, version }))
}

function cupomV2(extra: Record<string, unknown> = {}) {
  return {
    itens: [item('a')],
    caixaId: 'caixa-1',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    cartOwnerUserId: 'op-a',
    cartLojaId: 'loja-1',
    vendaFinalizacaoPendente: false,
    vendaIdempotencyKey: null,
    vendaEmEsperaOrigemId: null,
    ...extra,
  }
}

const opcoes = { userId: 'op-a', lojaId: 'loja-1', caixa: ABERTO } as const

beforeEach(() => {
  localStorage.clear()
  useCartStore.getState().limparCarrinho()
})

describe('persistência do cupom (pdv-carrinho)', () => {
  it('o recorte gravado não contém pagamento, parcelas nem contexto de regras', () => {
    const partialize = (useCartStore as unknown as {
      persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } }
    }).persist.getOptions().partialize
    const chaves = Object.keys(partialize(useCartStore.getState()))

    for (const proibida of ['valorRecebido', 'pagamentos', 'parcelas', 'regras', 'pricingCtx']) {
      expect(chaves).not.toContain(proibida)
    }
    expect(chaves).toEqual(expect.arrayContaining(['caixaId', 'criadoEm', 'atualizadoEm']))
    expect(CARRINHO_PERSIST_VERSION).toBe(2)
  })

  it('adicionar item registra início e última atividade; limpar zera ambos', () => {
    useCartStore.getState().adicionarItem(item('a'))
    const s = useCartStore.getState()
    expect(s.criadoEm).toBeTruthy()
    expect(Number.isNaN(Date.parse(s.atualizadoEm!))).toBe(false)

    useCartStore.getState().limparCarrinho()
    expect(useCartStore.getState().criadoEm).toBeNull()
    expect(useCartStore.getState().atualizadoEm).toBeNull()
  })
})

describe('recuperarCarrinhoPersistido', () => {
  it('restaura cupom válido do mesmo operador, turno e loja', async () => {
    gravar(CARRINHO_PERSIST_VERSION, cupomV2())
    const decisao = await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)
    expect(decisao).toEqual({ acao: 'restaurar' })
    expect(useCartStore.getState().itens.map((i) => i.id)).toEqual(['a'])
  })

  it('cupom v1 (legado, sem caixa) com itens é descartado e não reaparece na próxima abertura', async () => {
    gravar(1, { itens: [item('gato')], cartOwnerUserId: 'op-a', cartLojaId: 'loja-1', vendaFinalizacaoPendente: false })

    const decisao = await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)
    expect(decisao).toMatchObject({ acao: 'descartar', motivo: 'outro_turno' })
    expect(useCartStore.getState().itens).toEqual([])

    // Próxima abertura: o que ficou gravado após o descarte não tem itens.
    useCartStore.getState().limparCarrinho()
    const segunda = await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)
    expect(segunda).toMatchObject({ acao: 'vazio' })
    expect(useCartStore.getState().itens).toEqual([])
  })

  it('cupom de outro turno não é restaurado e a espera reservada é devolvida à decisão', async () => {
    gravar(CARRINHO_PERSIST_VERSION, cupomV2({ caixaId: 'caixa-antigo', vendaEmEsperaOrigemId: 'espera-7' }))
    const decisao = await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)
    expect(decisao).toEqual({ acao: 'descartar', motivo: 'outro_turno', devolverEsperaId: 'espera-7' })
    expect(useCartStore.getState().itens).toEqual([])
    expect(useCartStore.getState().vendaEmEsperaOrigemId).toBeNull()
  })

  it('cupom além da validade é descartado', async () => {
    const velho = new Date(Date.now() - CARRINHO_VALIDADE_MS - 60_000).toISOString()
    gravar(CARRINHO_PERSIST_VERSION, cupomV2({ atualizadoEm: velho }))
    expect(await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)).toMatchObject({
      acao: 'descartar',
      motivo: 'expirado',
    })
  })

  it('cupom de outro operador não é restaurado', async () => {
    gravar(CARRINHO_PERSIST_VERSION, cupomV2({ cartOwnerUserId: 'op-b' }))
    expect(await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)).toMatchObject({
      acao: 'descartar',
      motivo: 'outro_operador',
    })
  })

  it('pagamento recebido de sessão anterior nunca volta, mesmo que estivesse no armazenamento', async () => {
    gravar(CARRINHO_PERSIST_VERSION, { ...cupomV2(), valorRecebido: 5145, pagamentos: [{ valor: 5145 }] })
    await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)
    const s = useCartStore.getState() as unknown as Record<string, unknown>
    expect(s.valorRecebido).toBeUndefined()
    expect(s.pagamentos).toBeUndefined()
  })

  it('finalização pendente é preservada com a chave e não é descartada em silêncio', async () => {
    gravar(1, {
      itens: [item('a')],
      cartOwnerUserId: 'op-a',
      cartLojaId: 'loja-1',
      vendaFinalizacaoPendente: true,
      vendaIdempotencyKey: 'chave-venda-1',
    })
    const decisao = await useCartStore.getState().recuperarCarrinhoPersistido(opcoes)
    expect(decisao).toEqual({ acao: 'verificar_finalizacao' })
    const s = useCartStore.getState()
    expect(s.vendaFinalizacaoPendente).toBe(true)
    expect(s.vendaIdempotencyKey).toBe('chave-venda-1')
    expect(s.itens.map((i) => i.id)).toEqual(['a'])
  })

  it('finalização pendente de caixa fechado também vai à verificação, nunca é apagada', async () => {
    gravar(CARRINHO_PERSIST_VERSION, cupomV2({ vendaFinalizacaoPendente: true, vendaIdempotencyKey: 'k-2' }))
    const decisao = await useCartStore.getState().recuperarCarrinhoPersistido({
      ...opcoes,
      caixa: { status: 'fechado' },
    })
    expect(decisao).toEqual({ acao: 'verificar_finalizacao' })
    expect(useCartStore.getState().vendaIdempotencyKey).toBe('k-2')
  })

  it('com o caixa ainda carregando não lê nem altera o cupom armazenado', async () => {
    const blob = JSON.stringify({ state: cupomV2(), version: CARRINHO_PERSIST_VERSION })
    localStorage.setItem(KEY, blob)
    const decisao = await useCartStore.getState().recuperarCarrinhoPersistido({
      ...opcoes,
      caixa: { status: 'carregando' },
    })
    expect(decisao).toEqual({ acao: 'aguardar' })
    expect(localStorage.getItem(KEY)).toBe(blob)
    expect(useCartStore.getState().itens).toEqual([])
  })

  it('com erro ao carregar o caixa também aguarda sem descartar', async () => {
    const blob = JSON.stringify({ state: cupomV2({ caixaId: null }), version: 1 })
    localStorage.setItem(KEY, blob)
    expect(
      await useCartStore.getState().recuperarCarrinhoPersistido({ ...opcoes, caixa: { status: 'erro' } }),
    ).toEqual({ acao: 'aguardar' })
    expect(localStorage.getItem(KEY)).toBe(blob)
  })
})
