/**
 * Adapter ProductExclusion — Missão Products 7 / ADR-007.
 * Efeitos de I/O + orquestração; decisão em `decideProductExclusion` (shared-core).
 * Espelha `motivoBloqueioExclusaoFisica` + delete físico do lote legado.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import {
  PRODUCT_ERROR_CODES,
  decideProductExclusion,
  type ProductExclusionEffects,
  type ProductExclusionService,
  type ExcludeProductResult,
  type ProductId,
} from '@shared-core/src/products'
import { dualWriteFromStatus } from '@/core/catalog/statusPublicacao'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  PRODUTO_IMAGEM_BUCKET,
  storagePathFromProdutoImagemPublicUrl,
} from '@/lib/gerente/produtoImagemStorage'
import { MSG_PRODUTO_NAO_ENCONTRADO } from '@/app/admin/produtos/productReader'

export { MSG_PRODUTO_NAO_ENCONTRADO }

/** Seções legadas para mensagemErroComSecao (infra) — UI resolve locale na borda. */
const SECAO_REGRAS = 'regras_preco'
const SECAO_ESTOQUE = 'estoque'
const SECAO_PRODUTO = 'produto'
const SECAO_LEITURA = 'leitura'

type CountResult = { ok: true; count: number } | { ok: false; error: string }

async function countByProdutoId(
  supabase: SupabaseClient,
  table: string,
  produtoId: string,
  selectCol = 'id',
): Promise<CountResult> {
  const { count, error } = await supabase
    .from(table)
    .select(selectCol, { count: 'exact', head: true })
    .eq('produto_id', produtoId)
  if (error) return { ok: false, error: `${table}: ${error.message}` }
  return { ok: true, count: count ?? 0 }
}

/**
 * O client aqui é o `SupabaseClient` genérico (sem `Database`), então o tsc NÃO
 * valida a string passada a `.select()`. Ancorar o nome da coluna no schema
 * gerado devolve essa verificação: se `estoque` for renomeada, isto quebra no
 * build em vez de virar um 42703 silencioso em runtime.
 */
const COL_ESTOQUE_QTD = 'quantidade_atual' satisfies keyof Database['public']['Tables']['estoque']['Row']

async function loadSaldoEstoque(
  supabase: SupabaseClient,
  produtoId: string,
): Promise<CountResult & { temSaldo?: boolean }> {
  const { data, error } = await supabase
    .from('estoque')
    .select(COL_ESTOQUE_QTD)
    .eq('produto_id', produtoId)
    .maybeSingle()
  if (error) return { ok: false, error: `estoque: ${error.message}` }
  const q = Number((data as { quantidade_atual?: number } | null)?.quantidade_atual ?? 0)
  return { ok: true, count: 0, temSaldo: Number.isFinite(q) && q > 0 }
}

/**
 * Efeitos de I/O da exclusão — espelho do lote legado (FKs + delete limpo).
 */
export function createProductExclusionEffects(
  supabase: SupabaseClient,
): ProductExclusionEffects {
  return {
    async loadExclusionFacts(id) {
      try {
        const { data: prod, error: getErr } = await supabase
          .from('produtos')
          .select('id, ativo')
          .eq('id', id)
          .maybeSingle()

        if (getErr) {
          return { ok: false, error: mensagemErroComSecao(SECAO_LEITURA, getErr.message) }
        }
        if (!prod) {
          return {
            ok: false,
            error: PRODUCT_ERROR_CODES.NOT_FOUND,
            code: PRODUCT_ERROR_CODES.NOT_FOUND,
            notFound: true,
          }
        }

        const vendas = await countByProdutoId(supabase, 'itens_venda', id)
        if (!vendas.ok) return vendas
        const remessa = await countByProdutoId(supabase, 'remessa_itens', id)
        if (!remessa.ok) return remessa
        const movs = await countByProdutoId(supabase, 'movimentos_estoque_log', id)
        if (!movs.ok) return movs
        const repos = await countByProdutoId(
          supabase,
          'estoque_reposicoes_cancelamento',
          id,
          'venda_id',
        )
        if (!repos.ok) return repos
        const saldo = await loadSaldoEstoque(supabase, id)
        if (!saldo.ok) return saldo

        return {
          ok: true,
          facts: {
            ativo: Boolean((prod as { ativo?: boolean }).ativo),
            temItensVenda: vendas.count > 0,
            temRemessaItens: remessa.count > 0,
            temMovimentosEstoque: movs.count > 0,
            temReposicoesCancelamento: repos.count > 0,
            temSaldoEstoque: Boolean(saldo.temSaldo),
          },
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.SAVE_FAILED,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },

    async inactivate(id) {
      try {
        const lifecycle = dualWriteFromStatus('INATIVO')
        const { error } = await supabase
          .from('produtos')
          .update({
            status_publicacao: lifecycle.status_publicacao,
            ativo: lifecycle.ativo,
          })
          .eq('id', id)
        if (error) return { ok: false, error: mensagemErroComSecao('Produto', error.message) }
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.SAVE_FAILED,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },

    async deletePhysical(id) {
      try {
        const { error: eRegras } = await supabase
          .from('regras_preco')
          .delete()
          .eq('produto_id', id)
        if (eRegras) {
          return {
            ok: false,
            error: mensagemErroComSecao(SECAO_REGRAS, eRegras.message),
          }
        }

        // Cleanup de linha órfã — só no path de delete limpo (legado).
        // RPC (não DELETE direto): fecha o bypass DELETE+INSERT(qtd=0) que
        // zerava saldo sem RPC/kardex — ver 20260904110000_estoque_fecha_
        // bypass_delete_insert_e_nan.sql.
        const { error: eEst } = await supabase.rpc('excluir_linha_estoque_produto', {
          p_produto_id: id,
        })
        if (eEst) {
          return {
            ok: false,
            error: mensagemErroComSecao(SECAO_ESTOQUE, eEst.message),
          }
        }

        const { data: row } = await supabase
          .from('produtos')
          .select('imagem_url')
          .eq('id', id)
          .maybeSingle()
        const url = (row as { imagem_url?: string | null } | null)?.imagem_url
        const path = url ? storagePathFromProdutoImagemPublicUrl(url) : null
        if (path) {
          await supabase.storage.from(PRODUTO_IMAGEM_BUCKET).remove([path])
        }

        const { error: eDel } = await supabase.from('produtos').delete().eq('id', id)
        if (eDel) {
          return {
            ok: false,
            error: mensagemErroComSecao(SECAO_PRODUTO, eDel.message),
          }
        }
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.SAVE_FAILED,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },
  }
}

async function applyInactivate(
  id: ProductId,
  alreadyInactive: boolean,
  effects: ProductExclusionEffects,
): Promise<ExcludeProductResult> {
  if (alreadyInactive) return { ok: true, outcome: 'already_inactive' }
  const r = await effects.inactivate(id)
  if (!r.ok) return r
  return { ok: true, outcome: 'inactivated' }
}

/**
 * Orquestra: loadFacts → decideProductExclusion → efeito.
 * Fallback legado: delete falhou → inativar se ativo.
 */
export function createProductExclusionService(
  effects: ProductExclusionEffects,
): ProductExclusionService {
  return {
    async exclude(id: ProductId): Promise<ExcludeProductResult> {
      const loaded = await effects.loadExclusionFacts(id)
      if (!loaded.ok) {
        return {
          ok: false,
          error: loaded.error,
          code: loaded.notFound ? PRODUCT_ERROR_CODES.NOT_FOUND : undefined,
          notFound: loaded.notFound,
        }
      }

      const decision = decideProductExclusion(loaded.facts)
      if (decision.action === 'reject') {
        return {
          ok: false,
          error: decision.error,
          code: decision.code,
          params: decision.params,
        }
      }
      if (decision.action === 'inactivate') {
        return applyInactivate(id, decision.alreadyInactive, effects)
      }

      const del = await effects.deletePhysical(id)
      if (del.ok) return { ok: true, outcome: 'deleted' }

      // Fallback do lote: delete falhou → inativar se ainda ativo.
      if (loaded.facts.ativo) {
        const fallback = await effects.inactivate(id)
        if (!fallback.ok) {
          return { ok: false, error: `${del.error} · ${fallback.error}` }
        }
        return { ok: true, outcome: 'inactivated' }
      }
      return { ok: true, outcome: 'already_inactive' }
    },
  }
}

/** Factory completa (Supabase) — wire futuro em actions. */
export function createProductExclusion(supabase: SupabaseClient): ProductExclusionService {
  return createProductExclusionService(createProductExclusionEffects(supabase))
}
