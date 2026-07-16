'use server'

/**
 * FastProduct Admin — Estoque (Fase 5) · actions
 *
 * A LISTAGEM e o AJUSTE reusam as queries EXISTENTES do gerente
 * (`obterListaEstoqueGerente` / `atualizarEstoqueProduto`) — nenhuma query nova
 * é adicionada para essas operações.
 *
 * A ÚNICA action nova é o KARDEX (histórico de movimentações), porque não havia
 * nenhuma leitura desse tipo no projeto e o Sheet de kardex da Fase 5 depende
 * dela. É READ-ONLY, escopada por loja (RLS + filtro explícito) e não altera
 * schema algum — só lê `movimentos_estoque_log`.
 */

import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { ROUTES } from '@shared-core/navigation/routes'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type KardexMovimento = Readonly<{
  id: string
  created_at: string
  tipo_codigo: string
  quantidade_delta: number
  observacao: string | null
}>

const KARDEX_LIMITE = 60

export type KardexResult =
  | { ok: true; rows: KardexMovimento[] }
  | { ok: false; error: string }

/**
 * Últimas movimentações de estoque de um produto na loja do usuário logado.
 * Read-only. Distingue "sem movimentações" (rows: []) de falha de
 * autenticação/consulta (ok: false) para o Sheet não confundir os dois
 * estados no empty state.
 */
export async function obterKardexProduto(produtoId: string): Promise<KardexResult> {
  if (!UUID_RE.test(produtoId)) return { ok: true, rows: [] }

  const auth = await assertAdminSession('estoque:kardex', {
    pathname: ROUTES.admin.estoque,
    resource: `route:${ROUTES.admin.estoque}`,
  })
  if (!auth.ok) return { ok: false, error: 'Sessão expirada ou sem permissão.' }

  const supabase = await createClient()
  const loja = auth.session.lojaId ?? LOJA_MATRIZ_ID

  const { data, error } = await supabase
    .from('movimentos_estoque_log')
    .select('id, created_at, tipo_codigo, quantidade_delta, observacao')
    .eq('produto_id', produtoId)
    .eq('loja_id', loja)
    .order('created_at', { ascending: false })
    .limit(KARDEX_LIMITE)

  if (error) return { ok: false, error: 'Não foi possível carregar o histórico. Tente novamente.' }
  if (!data) return { ok: true, rows: [] }

  return {
    ok: true,
    rows: data.map((r) => ({
      id: String(r.id),
      created_at: String(r.created_at),
      tipo_codigo: String(r.tipo_codigo ?? ''),
      quantidade_delta: Number(r.quantidade_delta ?? 0),
      observacao: r.observacao == null ? null : String(r.observacao),
    })),
  }
}
