import { describe, expect, it } from 'vitest'
import {
  mapFormToCreateProductInput,
  mapFormToUpdateProductInput,
} from './productFormMappers'

const baseForm = {
  nome: 'Camiseta',
  codigo_barras: '789',
  codigo_interno: 'SKU-1',
  referencia_fornecedor: 'REF',
  nome_reduzido_pdv: 'Cam',
  localizacao_prateleira: 'A1',
  preco_varejo: 19.9,
  preco_atacado: 15,
  preco_custo: 10,
  permitir_abaixo_custo: false,
  quantidade_gatilho_atacado: 6,
  origem: 'brasil_nf' as const,
  tem_nf: true,
  unidade_medida: 'UN' as const,
  observacao: 'obs',
  categoria_id: 'cat-1',
  marca_id: null,
  fornecedor_id: null,
  ncm: '12345678',
  cfop_produto: '5102',
  csosn: '102',
  cest: null,
  cst_pis: null,
  cst_cofins: null,
}

describe('productFormMappers', () => {
  it('mapFormToCreateProductInput preserva fiscal + estoque + lifecycle', () => {
    const input = mapFormToCreateProductInput(
      {
        ...baseForm,
        estoque_inicial_quantidade: 3,
        estoque_inicial_minimo: 1,
        client_request_id: 'req-1',
      },
      { status_publicacao: 'DRAFT', ativo: false },
    )
    expect(input).toMatchObject({
      nome: 'Camiseta',
      origem: 'brasil_nf',
      temNf: true,
      ncm: '12345678',
      cfopProduto: '5102',
      estoqueInicial: 3,
      estoqueInicialMinimo: 1,
      clientRequestId: 'req-1',
      statusPublicacao: 'DRAFT',
      ativo: false,
    })
  })

  it('mapFormToUpdateProductInput omite lifecycle quando null', () => {
    const input = mapFormToUpdateProductInput(
      { ...baseForm, produto_id: 'prod-1' },
      null,
    )
    expect(input.statusPublicacao).toBeUndefined()
    expect(input.temNf).toBe(true)
    expect(input.ncm).toBe('12345678')
  })

  it('mapFormToUpdateProductInput aplica lifecycle quando presente', () => {
    const input = mapFormToUpdateProductInput(
      { ...baseForm, produto_id: 'prod-1' },
      { status_publicacao: 'PUBLICADO', ativo: true },
    )
    expect(input.statusPublicacao).toBe('PUBLICADO')
    expect(input.ativo).toBe(true)
  })
})
