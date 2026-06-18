import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  NovoProdutoInput,
  ProdutoRepositoryPort,
  StatusPublicacao,
} from '@/core/ports/produto'
import {
  defaultStatusNovoProduto,
  dualWriteFromStatus,
  statusFromAtivoLegacy,
} from '@/core/catalog/statusPublicacao'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export function createProdutoRepository(
  supabase: SupabaseClient
): ProdutoRepositoryPort {
  return {
    async createWithDefaultEstoque(input: NovoProdutoInput) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      let lojaId = LOJA_MATRIZ_ID
      if (user) {
        const { data: urow } = await supabase
          .from('usuarios')
          .select('loja_id')
          .eq('id', user.id)
          .maybeSingle()
        if (urow?.loja_id) lojaId = urow.loja_id as string
      }

      const pa =
        input.preco_atacado !== undefined && input.preco_atacado !== null
          ? Number(input.preco_atacado)
          : null

      const pc =
        input.preco_custo !== undefined && input.preco_custo !== null
          ? Number(input.preco_custo)
          : null

      const lifecycle = defaultStatusNovoProduto(input)

      const { data, error } = await supabase
        .from('produtos')
        .insert({
          nome: input.nome,
          codigo_barras: input.codigo_barras?.trim() || null,
          preco_varejo: input.preco_varejo,
          preco_atacado: pa,
          preco_custo: pc,
          permitir_abaixo_custo: input.permitir_abaixo_custo ?? false,
          quantidade_gatilho_atacado: input.quantidade_gatilho_atacado ?? null,
          origem: input.origem,
          tem_nf: input.tem_nf,
          unidade_medida: input.unidade_medida ?? 'UN',
          observacao: input.observacao ?? null,
          categoria_id: input.categoria_id ?? null,
          marca_id: input.marca_id ?? null,
          fornecedor_id: input.fornecedor_id ?? null,
          ncm: input.ncm ?? null,
          codigo_interno: input.codigo_interno ?? null,
          estoque_minimo: input.estoque_minimo ?? 0,
          ativo: lifecycle.ativo,
          status_publicacao: lifecycle.status_publicacao,
          loja_id: lojaId,
        })
        .select('id')
        .single()

      if (error || !data) {
        return {
          ok: false,
          message: error
            ? mensagemErroComSecao('Cadastro de produto', error.message)
            : 'Não foi possível salvar o produto. Tente de novo.',
        }
      }

      const { error: estoqueError } = await supabase.from('estoque').insert({
        produto_id: data.id,
        loja_id: lojaId,
        quantidade_atual: 0,
        estoque_minimo: input.estoque_minimo ?? 0,
      })

      if (estoqueError) {
        return {
          ok: false,
          message: mensagemErroComSecao(
            'Estoque inicial do produto',
            estoqueError.message,
          ),
        }
      }

      return { ok: true, id: data.id }
    },

    async updateAtivo(produtoId, ativo) {
      const status = statusFromAtivoLegacy(ativo)
      return this.updateStatusPublicacao(produtoId, status)
    },

    async updateStatusPublicacao(produtoId, status: StatusPublicacao) {
      const row = dualWriteFromStatus(status)
      const { error } = await supabase
        .from('produtos')
        .update({
          status_publicacao: row.status_publicacao,
          ativo: row.ativo,
        })
        .eq('id', produtoId)

      if (error) return { ok: false, message: mensagemErroComSecao('Produto', error.message) }
      return { ok: true }
    },
  }
}
