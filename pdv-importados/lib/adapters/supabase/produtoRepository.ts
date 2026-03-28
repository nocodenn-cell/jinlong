import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  NovoProdutoInput,
  ProdutoRepositoryPort,
} from '@/core/ports/produto'

export function createProdutoRepository(
  supabase: SupabaseClient
): ProdutoRepositoryPort {
  return {
    async createWithDefaultEstoque(input: NovoProdutoInput) {
      const { data, error } = await supabase
        .from('produtos')
        .insert({
          nome: input.nome,
          codigo_barras: input.codigo_barras?.trim() || null,
          preco_varejo: input.preco_varejo,
          origem: input.origem,
          tem_nf: input.tem_nf,
          unidade_medida: 'UN',
          ativo: true,
        })
        .select('id')
        .single()

      if (error || !data) {
        return { ok: false, message: error?.message ?? 'Erro ao salvar produto' }
      }

      const { error: estoqueError } = await supabase.from('estoque').insert({
        produto_id: data.id,
        quantidade_atual: 0,
        estoque_minimo: 0,
      })

      if (estoqueError) {
        return {
          ok: false,
          message: estoqueError.message ?? 'Erro ao criar estoque',
        }
      }

      return { ok: true, id: data.id }
    },

    async updateAtivo(produtoId, ativo) {
      const { error } = await supabase
        .from('produtos')
        .update({ ativo })
        .eq('id', produtoId)

      if (error) return { ok: false, message: error.message }
      return { ok: true }
    },
  }
}
