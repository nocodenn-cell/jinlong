/**
 * Regressão do P0 de venda duplicada (certificação operacional do PDV).
 * Ambiente node + polyfill de localStorage (o docblock jsdom excluía este arquivo
 * do runner web, que não instala jsdom).
 *
 * A chave de idempotência da venda é o `venda_id` enviado ao RPC
 * `finalizar_venda_transacional_canonica_v4`, cuja idempotência é keyed nesse id.
 * Antes desta correção ela vivia num `useRef` do componente: o carrinho era
 * persistido em localStorage e a chave não, então F5 / queda de energia /
 * fechamento da aplicação devolviam o carrinho cheio sem a chave. O reenvio
 * gerava `venda_id` novo e a MESMA venda era gravada duas vezes — estoque
 * baixado em dobro e dinheiro em dobro no turno contra um único pagamento.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './unifiedCartStore'

function reset() {
  useCartStore.getState().limparCarrinho()
}

describe('unifiedCartStore — idempotência da venda', () => {
  beforeEach(reset)

  it('cria a chave uma única vez e devolve sempre a mesma para o cupom', () => {
    const primeira = useCartStore.getState().garantirVendaIdempotencyKey()
    const segunda = useCartStore.getState().garantirVendaIdempotencyKey()
    const terceira = useCartStore.getState().garantirVendaIdempotencyKey()

    expect(primeira).toBeTruthy()
    expect(segunda).toBe(primeira)
    expect(terceira).toBe(primeira)
  })

  it('mantém a chave após um desfecho negativo confirmado pelo servidor', () => {
    const chave = useCartStore.getState().garantirVendaIdempotencyKey()
    useCartStore.getState().marcarFinalizacaoPendente()

    useCartStore.getState().resolverFinalizacaoPendente()

    // O reenvio precisa reusar a MESMA chave: se a 1ª tentativa tiver gravado
    // antes de responder, o RPC reconhece a venda em vez de criar outra.
    expect(useCartStore.getState().vendaIdempotencyKey).toBe(chave)
    expect(useCartStore.getState().vendaFinalizacaoPendente).toBe(false)
    expect(useCartStore.getState().garantirVendaIdempotencyKey()).toBe(chave)
  })

  it('o recorte persistido do store carrega chave e pendência (F5 / queda de energia)', () => {
    const chave = useCartStore.getState().garantirVendaIdempotencyKey()
    useCartStore.getState().marcarFinalizacaoPendente()

    // Assere o `partialize` REAL do store: é ele que decide o que vai para o
    // localStorage. Se a chave sair daqui, F5 devolve o carrinho cheio sem a
    // chave e o reenvio grava uma segunda venda — o P0 que esta suíte trava.
    const partialize = (useCartStore as unknown as {
      persist: { getOptions: () => { partialize?: (s: unknown) => unknown } }
    }).persist?.getOptions().partialize

    expect(partialize, 'store precisa expor partialize (zustand/persist)').toBeTypeOf(
      'function',
    )

    const persistido = partialize!(useCartStore.getState()) as Record<string, unknown>

    expect(persistido).toMatchObject({
      vendaIdempotencyKey: chave,
      vendaFinalizacaoPendente: true,
    })

    // Reidratação: o finalizar reusa a chave em vez de criar outra.
    useCartStore.setState(persistido as never)
    expect(useCartStore.getState().garantirVendaIdempotencyKey()).toBe(chave)
  })

  it('só descarta a chave quando a venda é confirmada como gravada', () => {
    useCartStore.getState().garantirVendaIdempotencyKey()
    useCartStore.getState().marcarFinalizacaoPendente()

    useCartStore.getState().concluirVendaIdempotencyKey()

    expect(useCartStore.getState().vendaIdempotencyKey).toBeNull()
    expect(useCartStore.getState().vendaFinalizacaoPendente).toBe(false)
    // Cupom seguinte recebe chave própria.
    expect(useCartStore.getState().garantirVendaIdempotencyKey()).toBeTruthy()
  })

  it('marcarFinalizacaoPendente preserva a chave (estado de recuperação)', () => {
    const chave = useCartStore.getState().garantirVendaIdempotencyKey()

    useCartStore.getState().marcarFinalizacaoPendente()

    expect(useCartStore.getState().vendaFinalizacaoPendente).toBe(true)
    expect(useCartStore.getState().vendaIdempotencyKey).toBe(chave)
  })

  it('trocar de operador zera chave e pendência (não vazam entre sessões)', () => {
    useCartStore.getState().setCartOwnerForSession('operador-a')
    const chave = useCartStore.getState().garantirVendaIdempotencyKey()
    useCartStore.getState().marcarFinalizacaoPendente()

    useCartStore.getState().setCartOwnerForSession('operador-b')

    expect(useCartStore.getState().vendaIdempotencyKey).not.toBe(chave)
    expect(useCartStore.getState().vendaIdempotencyKey).toBeNull()
    expect(useCartStore.getState().vendaFinalizacaoPendente).toBe(false)
  })

  it('retomar venda em espera (substituirCarrinho) abre cupom com chave nova', () => {
    const anterior = useCartStore.getState().garantirVendaIdempotencyKey()

    useCartStore.getState().substituirCarrinho([
      {
        id: 'item-1',
        produtoId: 'prod-1',
        nome: 'Produto',
        quantidade: 1,
        precoOriginal: 10,
        precoUnitario: 10,
      },
    ])

    expect(useCartStore.getState().vendaIdempotencyKey).toBeNull()
    expect(useCartStore.getState().vendaFinalizacaoPendente).toBe(false)
    expect(useCartStore.getState().garantirVendaIdempotencyKey()).not.toBe(anterior)
  })

  it('persiste vendaEmEsperaOrigemId com o carrinho (anti double-sell pós-F5)', () => {
    const esperaId = '11111111-2222-4333-8444-555555555555'
    useCartStore.getState().setVendaEmEsperaOrigemId(esperaId)

    const partialize = (useCartStore as unknown as {
      persist: { getOptions: () => { partialize?: (s: unknown) => unknown } }
    }).persist?.getOptions().partialize
    expect(partialize).toBeTypeOf('function')

    const persistido = partialize!(useCartStore.getState()) as Record<string, unknown>
    expect(persistido.vendaEmEsperaOrigemId).toBe(esperaId)

    useCartStore.getState().limparCarrinho()
    expect(useCartStore.getState().vendaEmEsperaOrigemId).toBeNull()

    useCartStore.setState(persistido as never)
    expect(useCartStore.getState().vendaEmEsperaOrigemId).toBe(esperaId)
  })
})
