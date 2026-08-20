import { describe, expect, it } from 'vitest'
import {
  mensagemErroCriarProdutoRpc,
  mensagemErroCriarProdutoRpcEnriquecida,
} from './criarProdutoComEstoqueInicialRpc'

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

/** Fake admin client roteado por nome de tabela — cobre os dois lookups
 *  encadeados (usuarios.loja_id, depois produtos por loja+código). */
function fakeAdmin(opts: { lojaId: string | null; produtoExistente: { id: string; nome: string } | null }) {
  return {
    from: (table: string) => {
      if (table === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.lojaId ? { loja_id: opts.lojaId } : null, error: null }),
            }),
          }),
        }
      }
      if (table === 'produtos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: opts.produtoExistente, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`tabela inesperada no teste: ${table}`)
    },
  }
}

describe('mensagemErroCriarProdutoRpcEnriquecida', () => {
  it('não mexe em códigos que não são duplicidade de barras (passa direto pro mapeamento síncrono)', async () => {
    const admin = fakeAdmin({ lojaId: 'loja-1', produtoExistente: null })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_NOME', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: null,
    })
    expect(msg).toBe(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_NOME'))
  })

  it('create com código já existente → mensagem com o nome do produto conflitante', async () => {
    const admin = fakeAdmin({
      lojaId: 'loja-1',
      produtoExistente: { id: 'produto-existente', nome: 'Caixa Amarela' },
    })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: '0012366665',
    })
    expect(msg).toContain('Caixa Amarela')
  })

  it('fallback genérico quando a loja do usuário não resolve (sem lojaId, sem lookup de produto)', async () => {
    const admin = fakeAdmin({ lojaId: null, produtoExistente: { id: 'x', nome: 'Não deveria aparecer' } })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: '0012366665',
    })
    expect(msg).not.toContain('Não deveria aparecer')
    expect(msg).toContain('Busque o produto existente')
  })

  it('fallback genérico quando a consulta complementar lança exceção (best-effort, não derruba o create)', async () => {
    const throwingAdmin = {
      from: () => {
        throw new Error('conexão perdida')
      },
    }
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: throwingAdmin as never,
      atorId: 'user-1',
      codigoBarras: '0012366665',
    })
    expect(msg).toContain('Busque o produto existente')
  })

  it('sem código de barras informado, não tenta resolver loja nem produto (nada a buscar)', async () => {
    const admin = fakeAdmin({ lojaId: 'loja-1', produtoExistente: { id: 'x', nome: 'Não deveria aparecer' } })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: null,
    })
    expect(msg).not.toContain('Não deveria aparecer')
  })
})
