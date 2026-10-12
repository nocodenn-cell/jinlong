import { describe, expect, it } from 'vitest'
import { aceitarLeitura } from './barcodeLeitura'
import {
  baixoEstoque,
  canonItens,
  estoqueSuficiente,
  limparRequestId,
  mapAssumidoParaCarrinho,
  payloadEnvio,
  requestIdDe,
  totalPedido,
} from './palmPedido'

describe('pedido PALM', () => {
  it('soma quantidades e ordena o cânone', () => {
    const canon = canonItens([
      { produto_id: 'b', quantidade: 1 },
      { produtoId: 'a', quantidade: 2 },
      { produto_id: 'b', quantidade: 3 },
    ])
    expect(canon).toEqual([
      { produtoId: 'a', quantidade: 2 },
      { produtoId: 'b', quantidade: 4 },
    ])
  })

  it('envio não carrega preço', () => {
    expect(payloadEnvio([{ produtoId: 'p', quantidade: 2 }])).toEqual([
      { produto_id: 'p', quantidade: 2 },
    ])
  })

  it('estoque insuficiente e estoque baixo', () => {
    expect(estoqueSuficiente(3, 2)).toBe(false)
    expect(estoqueSuficiente(2, 2)).toBe(true)
    expect(estoqueSuficiente(1, null)).toBe(false)
    expect(baixoEstoque(2, 5)).toBe(true)
    expect(baixoEstoque(6, 5)).toBe(false)
    expect(baixoEstoque(0, null)).toBe(true)
  })

  it('total em centavos e carrinho com preço revalidado', () => {
    expect(totalPedido([{ quantidade: 2, precoUnitario: 7.1 }, { quantidade: 1, precoUnitario: 0.2 }])).toBe(14.4)
    const [linha] = mapAssumidoParaCarrinho([
      { produto_id: 'p', quantidade: 10, nome: 'Caneca', preco_unitario: '7.00', tipo: 'ATACADO', quantidade_minima: 10 },
    ])
    expect(linha?.resultado?.tipoPreco).toBe('ATACADO')
    expect(linha?.resultado?.precoUnitario).toBe(7)
    expect(linha?.resultado?.quantidadeMinima).toBe(10)
    expect(linha).not.toHaveProperty('preco_unitario')
  })

  it('repete a chave de solicitação e apaga depois do envio', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (chave: string) => mem.get(chave) ?? null,
      setItem: (chave: string, valor: string) => { mem.set(chave, valor) },
      removeItem: (chave: string) => { mem.delete(chave) },
    }
    const primeira = requestIdDe(storage, () => 'id-1')
    const segunda = requestIdDe(storage, () => 'id-2')
    expect(segunda).toBe(primeira)
    limparRequestId(storage)
    expect(requestIdDe(storage, () => 'id-3')).toBe('id-3')
  })
})

describe('leitura de código', () => {
  it('aceita o primeiro e ignora a repetição imediata', () => {
    const primeira = aceitarLeitura(null, '789', 1_000)
    expect(primeira.aceitar).toBe(true)
    const repetida = aceitarLeitura(primeira.estado, '789', 1_200)
    expect(repetida.aceitar).toBe(false)
    const depois = aceitarLeitura(repetida.estado, '789', 3_000)
    expect(depois.aceitar).toBe(true)
    expect(aceitarLeitura(null, '   ', 1).aceitar).toBe(false)
  })
})
