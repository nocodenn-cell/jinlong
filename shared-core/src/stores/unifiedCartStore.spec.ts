/**
 * @vitest-environment jsdom
 *
 * Regressão do P0 de venda duplicada (certificação operacional do PDV).
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
import { DEFAULT_MAX_DESCONTO_MANUAL_ITEM_PERCENTUAL } from '../managerDiscount/policy'

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
})

/**
 * Regressão de Single Source of Truth: o teto de desconto manual por item era
 * um literal no store (`const maxPermitido = 15`), enquanto a autoridade real
 * é `pdv_config.max_desconto_manual_item_percentual`, aplicada pelo trigger
 * `trg_fn_itens_venda_limite_desconto` (migration 122) e entregue ao caixa web
 * por `pdv_config_para_caixa_web()` (migration 313).
 *
 * Com o literal, mudar o limite no banco alterava o servidor e não o PDV: o
 * operador só descobria a divergência quando o trigger recusava a venda.
 */
describe('unifiedCartStore — teto de desconto manual vem da configuração', () => {
  const item = {
    id: 'item-1',
    produtoId: 'prod-1',
    nome: 'Produto teste',
    quantidade: 1,
    precoOriginal: 100,
    precoUnitario: 100,
    precoVariejo: 100,
  }

  beforeEach(() => {
    reset()
    useCartStore.getState().setMaxDescontoManualItemPercentual(
      DEFAULT_MAX_DESCONTO_MANUAL_ITEM_PERCENTUAL,
    )
  })

  it('usa o default (15%) enquanto a configuração não chegou', () => {
    expect(useCartStore.getState().maxDescontoManualItemPercentual).toBe(15)

    useCartStore.getState().adicionarItem(item)
    expect(() => useCartStore.getState().aplicarDescontoManual('item-1', 20)).toThrow(
      /limite permitido \(15%\)/,
    )
  })

  it('passa a recusar no teto configurado quando o banco manda um valor menor', () => {
    useCartStore.getState().setMaxDescontoManualItemPercentual(5)
    useCartStore.getState().adicionarItem(item)

    // 10% passaria com o literal antigo de 15 e tem de ser recusado agora.
    expect(() => useCartStore.getState().aplicarDescontoManual('item-1', 10)).toThrow(
      /limite permitido \(5%\)/,
    )
  })

  it('passa a aceitar acima de 15% quando o banco autoriza um teto maior', () => {
    useCartStore.getState().setMaxDescontoManualItemPercentual(30)
    useCartStore.getState().adicionarItem(item)

    // 25% era barrado pelo literal antigo; com o teto configurado tem de passar.
    expect(() => useCartStore.getState().aplicarDescontoManual('item-1', 25)).not.toThrow()
    expect(useCartStore.getState().totalDesconto).toBeGreaterThan(0)
  })

  it('ignora valor inválido e preserva o teto vigente', () => {
    useCartStore.getState().setMaxDescontoManualItemPercentual(30)
    useCartStore.getState().setMaxDescontoManualItemPercentual(Number.NaN)
    expect(useCartStore.getState().maxDescontoManualItemPercentual).toBe(30)

    useCartStore.getState().setMaxDescontoManualItemPercentual(-1)
    expect(useCartStore.getState().maxDescontoManualItemPercentual).toBe(30)
  })
})
