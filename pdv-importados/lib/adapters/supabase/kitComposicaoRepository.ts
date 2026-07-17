import type { SupabaseClient } from '@supabase/supabase-js'
import type { KitComposicaoAtual, KitComposicaoRepositoryPort } from '@/core/ports/kitComposicao'

function parseJsonb(data: unknown): unknown {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown
    } catch {
      return null
    }
  }
  return data
}

export function createKitComposicaoRepository(
  supabase: SupabaseClient,
): KitComposicaoRepositoryPort {
  return {
    async obterComposicaoAtual(kitProdutoId: string): Promise<KitComposicaoAtual | null> {
      const { data, error } = await supabase.rpc('obter_kit_composicao_atual', {
        p_kit_produto_id: kitProdutoId,
      })
      if (error) return null

      const row = parseJsonb(data) as Record<string, unknown> | null
      if (!row?.composicaoId) return null

      const componentesRaw = Array.isArray(row.componentes) ? row.componentes : []
      return {
        composicaoId: String(row.composicaoId),
        versao: Number(row.versao ?? 1),
        componentes: componentesRaw.map((c) => {
          const item = c as Record<string, unknown>
          return {
            produtoId: String(item.produtoId ?? ''),
            quantidade: Number(item.quantidade ?? 0),
          }
        }),
      }
    },
  }
}
