'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

/**
 * Leitura do histórico de preços (tabela `historico_precos_produto`, migration 259).
 * Append-only: gravada pela trigger `trg_historico_precos_produto` — nenhuma escrita
 * é feita a partir do app.
 */

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type HistoricoPrecoProduto = {
  id: string
  preco_varejo_anterior: number | null
  preco_varejo_novo: number | null
  preco_atacado_anterior: number | null
  preco_atacado_novo: number | null
  preco_custo_anterior: number | null
  preco_custo_novo: number | null
  alterado_em: string
}

const SECAO = 'Histórico de preços'

export async function listarHistoricoPrecoProduto(
  produtoId: string,
): Promise<ActionResult<HistoricoPrecoProduto[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const idValido = z.string().uuid().safeParse(produtoId)
  if (!idValido.success) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod('ID do produto inválido.', idioma) }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('historico_precos_produto')
    .select(
      'id, preco_varejo_anterior, preco_varejo_novo, preco_atacado_anterior, preco_atacado_novo, preco_custo_anterior, preco_custo_novo, alterado_em',
    )
    .eq('produto_id', produtoId)
    .order('alterado_em', { ascending: false })
    .limit(20)

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroComSecao(SECAO, error.message, idioma) }
  }

  return { success: true, data: (data ?? []) as HistoricoPrecoProduto[] }
}
