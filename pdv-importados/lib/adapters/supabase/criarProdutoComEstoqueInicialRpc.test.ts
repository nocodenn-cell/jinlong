import { describe, expect, it } from 'vitest'
import { mensagemErroCriarProdutoRpc } from './criarProdutoComEstoqueInicialRpc'

describe('mensagemErroCriarProdutoRpc', () => {
  it('mapeia códigos de auth/perfil/barcode', () => {
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_AUTH')).toContain('login')
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_PERFIL')).toContain('gerente')
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO')).toContain(
      'Código de barras',
    )
  })

  it('reusa mensagens de ajuste de estoque', () => {
    expect(mensagemErroCriarProdutoRpc('AJUSTE_ESTOQUE_LOJA_INVALIDA')).toContain('loja')
  })
})
