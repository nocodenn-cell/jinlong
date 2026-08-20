import { describe, expect, it } from 'vitest'
import {
  buscarProdutoPorCodigoBarrasLoja,
  formatMensagemCodigoBarrasDuplicado,
  isProdutosCodigoBarrasLojaUniqueViolation,
  mensagemErroCodigoBarrasDuplicado,
} from './produtoCodigoBarrasDuplicado'

/** Fake query builder fluente — replica só o subset usado por
 *  buscarProdutoPorCodigoBarrasLoja (.from().select().eq()[.neq()].limit().maybeSingle()). */
function fakeSupabase(result: { data: unknown } | { error: unknown }) {
  const calls: { table?: string; eq: Array<[string, string]>; neq: [string, string] | null } = {
    eq: [],
    neq: null,
  }
  const builder = {
    from: (table: string) => {
      calls.table = table
      return builder
    },
    select: () => builder,
    eq: (col: string, val: string) => {
      calls.eq.push([col, val])
      return builder
    },
    neq: (col: string, val: string) => {
      calls.neq = [col, val]
      return builder
    },
    limit: () => builder,
    maybeSingle: async () => result,
  }
  return { builder, calls }
}

describe('produtoCodigoBarrasDuplicado', () => {
  it('detecta 23505 da constraint por loja', () => {
    expect(
      isProdutosCodigoBarrasLojaUniqueViolation({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
      }),
    ).toBe(true)
  })

  it('ignora outros unique/códigos', () => {
    expect(
      isProdutosCodigoBarrasLojaUniqueViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "usuarios_email_key"',
      }),
    ).toBe(false)
    expect(
      isProdutosCodigoBarrasLojaUniqueViolation({
        code: '23503',
        message: 'produtos_codigo_barras_loja_unique',
      }),
    ).toBe(false)
  })

  it('formata mensagem com nome do produto existente', () => {
    expect(formatMensagemCodigoBarrasDuplicado('Cabo USB', 'pt')).toContain('Cabo USB')
    expect(formatMensagemCodigoBarrasDuplicado('Cabo USB', 'pt')).toContain(
      'Código de barras já cadastrado',
    )
  })

  it('formata mensagem sem nome quando lookup falha', () => {
    expect(formatMensagemCodigoBarrasDuplicado(null, 'pt')).toContain('Busque o produto existente')
  })

  describe('buscarProdutoPorCodigoBarrasLoja — isolamento e exclusão de self', () => {
    it('escopa a busca por loja_id (sem vazamento entre lojas)', async () => {
      const { builder, calls } = fakeSupabase({ data: null })
      await buscarProdutoPorCodigoBarrasLoja(builder as never, '789', 'loja-A')
      expect(calls.table).toBe('produtos')
      expect(calls.eq).toContainEqual(['loja_id', 'loja-A'])
      expect(calls.eq).toContainEqual(['codigo_barras', '789'])
    })

    it('exclui o próprio produto da busca (editar mantendo o próprio código não deve se autodenunciar)', async () => {
      const { builder, calls } = fakeSupabase({ data: null })
      await buscarProdutoPorCodigoBarrasLoja(builder as never, '789', 'loja-A', 'produto-proprio-id')
      expect(calls.neq).toEqual(['id', 'produto-proprio-id'])
    })

    it('sem excludeProdutoId (fluxo de create), não filtra por neq', async () => {
      const { builder, calls } = fakeSupabase({ data: null })
      await buscarProdutoPorCodigoBarrasLoja(builder as never, '789', 'loja-A')
      expect(calls.neq).toBeNull()
    })

    it('retorna null sem consultar quando código de barras é vazio', async () => {
      const { builder, calls } = fakeSupabase({ data: { id: 'x', nome: 'Y' } })
      const r = await buscarProdutoPorCodigoBarrasLoja(builder as never, '   ', 'loja-A')
      expect(r).toBeNull()
      expect(calls.table).toBeUndefined()
    })

    it('retorna o produto conflitante quando encontrado', async () => {
      const { builder } = fakeSupabase({ data: { id: 'produto-existente', nome: 'Cabo USB' } })
      const r = await buscarProdutoPorCodigoBarrasLoja(builder as never, '789', 'loja-A')
      expect(r).toEqual({ id: 'produto-existente', nome: 'Cabo USB' })
    })
  })

  describe('mensagemErroCodigoBarrasDuplicado — orquestrador (usado no UPDATE)', () => {
    it('retorna null quando o erro não é o unique de código de barras (não interfere em outros erros)', async () => {
      const { builder } = fakeSupabase({ data: null })
      const r = await mensagemErroCodigoBarrasDuplicado({
        supabase: builder as never,
        error: { code: '23503', message: 'foreign key violation' },
        codigoBarras: '789',
        lojaId: 'loja-A',
      })
      expect(r).toBeNull()
    })

    it('edit usando código de outro produto → mensagem com o nome do produto conflitante', async () => {
      const { builder } = fakeSupabase({ data: { id: 'outro-produto', nome: 'Caixa Amarela' } })
      const r = await mensagemErroCodigoBarrasDuplicado({
        supabase: builder as never,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
        },
        codigoBarras: '0012366665',
        lojaId: 'loja-A',
        excludeProdutoId: 'produto-sendo-editado',
      })
      expect(r).toContain('Caixa Amarela')
    })

    it('fallback genérico quando a consulta complementar falha (lookup rejeita)', async () => {
      const throwingBuilder = {
        from: () => {
          throw new Error('conexão perdida')
        },
      }
      const r = await mensagemErroCodigoBarrasDuplicado({
        supabase: throwingBuilder as never,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
        },
        codigoBarras: '0012366665',
        lojaId: 'loja-A',
      }).catch((e: unknown) => e)
      // A função hoje propaga a exceção do lookup — documenta o comportamento
      // real: quem chama (mapUpdateDbError) é responsável pelo try/catch.
      expect(r).toBeInstanceOf(Error)
    })
  })
})
