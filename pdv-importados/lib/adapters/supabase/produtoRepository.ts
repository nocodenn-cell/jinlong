import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  NovoProdutoInput,
  ProdutoRepositoryPort,
  StatusPublicacao,
} from '@/core/ports/produto'
import {
  dualWriteFromStatus,
  statusFromAtivoLegacy,
} from '@/core/catalog/statusPublicacao'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  executarCriarProdutoComEstoqueInicial,
  type CriarProdutoEstoqueInput,
} from '@/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc'

export function createProdutoRepository(
  supabase: SupabaseClient,
): ProdutoRepositoryPort {
  return {
    async createWithDefaultEstoque(input: NovoProdutoInput) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) {
        return {
          ok: false,
          message: 'Sessão inválida para cadastrar produto. Faça login novamente.',
        }
      }

      const result = await executarCriarProdutoComEstoqueInicial({
        input: input as CriarProdutoEstoqueInput,
        atorId: user.id,
      })
      if (!result.ok) return { ok: false, message: result.message }
      return { ok: true, id: result.id }
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
