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
import { ROUTES } from '@/lib/navigation/routes'
import { createInventoryMovementReader } from '@/app/admin/estoque/inventoryMovementReader'
import { createInventoryReader } from '@/app/admin/estoque/inventoryReader'
import { calcularSaldoApos } from '@/app/admin/estoque/kardexSaldo'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type KardexMovimento = Readonly<{
  id: string
  created_at: string
  tipo_codigo: string
  quantidade_delta: number
  observacao: string | null
  /** Nome de quem lançou (null se a origem não registra ou o usuário não é legível). */
  usuario_nome: string | null
  /** Saldo do produto logo após o movimento; null quando o histórico não fecha com o saldo atual. */
  saldo_apos: number | null
}>

const KARDEX_LIMITE = 60
/** Teto de linhas lidas para provar que o histórico fecha com o saldo atual (PostgREST limita a 1000). */
const KARDEX_TOTAL_MAX = 1000

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

  const movimentos = result.movements

  // Usuário: nome legível a partir do id registrado no log (best-effort; falha vira "—").
  const ids = [...new Set(movimentos.map((m) => m.userId).filter((id): id is string => !!id))]
  const nomes = new Map<string, string>()
  if (ids.length > 0) {
    const { data } = await supabase.from('usuarios').select('id, nome').in('id', ids)
    for (const u of (data ?? []) as Array<{ id: string; nome: string | null }>) {
      if (u.nome) nomes.set(String(u.id), u.nome)
    }
  }

  // Saldo após: reconstruído do saldo atual; só vale se a soma de TODO o histórico fecha com ele.
  const [saldoRes, { data: todos }] = await Promise.all([
    createInventoryReader(supabase, loja).getBalance(produtoId),
    supabase
      .from('v_kardex_unificado')
      .select('quantidade_delta')
      .eq('produto_id', produtoId)
      .eq('loja_id', loja)
      .range(0, KARDEX_TOTAL_MAX - 1),
  ])
  const saldoAtual = saldoRes.ok ? saldoRes.item.quantity : null
  const linhas = (todos ?? []) as Array<{ quantidade_delta: number | string }>
  // Se o total estourou o teto de leitura, não dá para provar o fechamento: sem saldo.
  const somaTodos =
    linhas.length >= KARDEX_TOTAL_MAX ? null : linhas.reduce((acc, l) => acc + Number(l.quantidade_delta ?? 0), 0)
  const saldos = calcularSaldoApos(
    movimentos.map((m) => m.quantity),
    saldoAtual,
    somaTodos,
  )

  return movimentos.map((m, i) => ({
    id: m.movementId,
    created_at: m.createdAt,
    tipo_codigo: m.type,
    quantidade_delta: m.quantity,
    observacao: m.reason,
    usuario_nome: m.userId ? (nomes.get(m.userId) ?? null) : null,
    saldo_apos: saldos[i],
  }))
}
