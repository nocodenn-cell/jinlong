'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

/**
 * Leitura do histórico de preços (tabela `historico_precos_produto`, migração
 * 259) — append-only, populada por trigger `SECURITY DEFINER` em UPDATE de
 * `produtos.preco_varejo/preco_atacado/preco_custo`. Sem escrita aqui: a
 * trigger é a única fonte, este módulo só lê e resolve o nome do autor.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type HistoricoPrecoEntry = {
  id: string
  precoVarejoAnterior: number | null
  precoVarejoNovo: number | null
  precoAtacadoAnterior: number | null
  precoAtacadoNovo: number | null
  precoCustoAnterior: number | null
  precoCustoNovo: number | null
  alteradoPorNome: string | null
  alteradoEm: string
}

const SECAO = 'Histórico de preços'
const LIMITE = 50

export async function listarHistoricoPrecos(
  produtoId: string,
): Promise<ActionResult<HistoricoPrecoEntry[]>> {
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
      'id, preco_varejo_anterior, preco_varejo_novo, preco_atacado_anterior, preco_atacado_novo, preco_custo_anterior, preco_custo_novo, alterado_por, alterado_em',
    )
    .eq('produto_id', produtoId)
    .order('alterado_em', { ascending: false })
    .limit(LIMITE)

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroComSecao(SECAO, error.message, idioma) }
  }

  const rows = data ?? []
  const autorIds = Array.from(
    new Set(rows.map((r) => r.alterado_por).filter((id): id is string => id != null)),
  )

  const nomeAutor = new Map<string, string>()
  if (autorIds.length > 0) {
    // Client admin só para este lookup — mesma razão de produtoAutoriaActions.ts:
    // RLS de `usuarios` restringe leitura a mesma loja (GERENTE), e um evento de
    // histórico pode referenciar um autor de outra loja ou já realocado.
    const admin = createAdminClient()
    const { data: usuarios } = await admin.from('usuarios').select('id, nome').in('id', autorIds)
    for (const u of usuarios ?? []) {
      if (u.nome != null) nomeAutor.set(String(u.id), String(u.nome))
    }
  }

  return {
    success: true,
    data: rows.map((r) => ({
      id: String(r.id),
      precoVarejoAnterior: r.preco_varejo_anterior,
      precoVarejoNovo: r.preco_varejo_novo,
      precoAtacadoAnterior: r.preco_atacado_anterior,
      precoAtacadoNovo: r.preco_atacado_novo,
      precoCustoAnterior: r.preco_custo_anterior,
      precoCustoNovo: r.preco_custo_novo,
      alteradoPorNome: r.alterado_por ? (nomeAutor.get(String(r.alterado_por)) ?? null) : null,
      alteradoEm: String(r.alterado_em),
    })),
  }
}
