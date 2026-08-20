'use server'

/**
 * FastProduct Admin — Estoque · actions
 *
 * LISTAGEM / AJUSTE: facades em `gerente/estoque/actions` (QueryService / AdjustmentService).
 * KARDEX: InventoryMovementReader (SELECT `v_kardex_unificado` — fonte canônica).
 */

import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { ROUTES } from '@shared-core/navigation/routes'
import { createInventoryMovementReader } from '@/app/admin/estoque/inventoryMovementReader'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type KardexMovimento = Readonly<{
  id: string
  created_at: string
  tipo_codigo: string
  quantidade_delta: number
  observacao: string | null
}>

const KARDEX_LIMITE = 60

/**
 * Últimas movimentações de estoque de um produto na loja do usuário logado.
 * Read-only; em qualquer erro retorna lista vazia (o Sheet mostra o empty state).
 */
export async function obterKardexProduto(produtoId: string): Promise<KardexMovimento[]> {
  if (!UUID_RE.test(produtoId)) return []

  const auth = await assertAdminSession('estoque:kardex', {
    pathname: ROUTES.admin.estoque,
    resource: `route:${ROUTES.admin.estoque}`,
  })
  if (!auth.ok) return []

  const supabase = await createClient()
  const loja = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const reader = createInventoryMovementReader(supabase, loja)
  const result = await reader.listByProduct({ productId: produtoId, limit: KARDEX_LIMITE })
  if (!result.ok) return []

  return result.movements.map((m) => ({
    id: m.movementId,
    created_at: m.createdAt,
    tipo_codigo: m.type,
    quantidade_delta: m.quantity,
    observacao: m.reason,
  }))
}
