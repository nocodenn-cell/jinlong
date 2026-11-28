import type { SupabaseClient } from '@supabase/supabase-js'
import { hojeYmd } from '@shared-core/src/financial'
import { contarContasPagarEmAberto } from '@/app/admin/financeiro/payableReader'
import { contarRecebiveisVencidos } from '@/app/admin/financeiro/receivableReader'
import { ROUTES } from '@/lib/navigation/routes'

/**
 * Pendências financeiras do dia para o painel "Hoje" (sprint UX 2026-11-27).
 *
 * O item de menu promete "Pendências e alertas do dia", mas a tela só mostrava vendas e estoque:
 * o dono precisava abrir Dinheiro e filtrar para descobrir conta vencida. Aqui só CONTAMOS, pelos
 * leitores do financeiro (ADR-010: mesma regra da listagem; "vencido" = vencimento < hoje, nunca status
 * persistido — item 13 do Plano Mestre). RLS escopa por loja/empresa.
 *
 * `null` = consulta falhou: o card esconde a linha em vez de mostrar 0 (zero falso tranquiliza à toa).
 */
export type PendenciasHoje = {
  /** Dia (YYYY-MM-DD) das contagens; leva o atalho "vence hoje" ao mesmo dia. */
  hoje: string
  pagarVencidas: number | null
  pagarVenceHoje: number | null
  receberVencidas: number | null
}

export type IdPendencia = 'pagarVencidas' | 'pagarVenceHoje' | 'receberVencidas'

export function hrefPendencia(id: IdPendencia, hoje: string): string {
  if (id === 'pagarVencidas') return `${ROUTES.admin.financeiro}?tab=pagar&status=atrasado`
  if (id === 'pagarVenceHoje') return `${ROUTES.admin.financeiro}?tab=pagar&vence=${hoje}`
  return `${ROUTES.admin.financeiro}?tab=receber&vencidos=1`
}

type CountRes = { count: number | null; error: unknown }

function contagem(res: CountRes | null | undefined): number | null {
  if (!res || res.error) return null
  return res.count ?? 0
}

export async function contarPendenciasHoje(
  supabase: SupabaseClient,
  hoje: string = hojeYmd(),
): Promise<PendenciasHoje> {
  const seguro = (p: PromiseLike<CountRes>): Promise<CountRes | null> =>
    Promise.resolve(p).then(
      (r) => r,
      () => null,
    )

  const [pagarVencidas, pagarVenceHoje, receberVencidas] = await Promise.all([
    seguro(contarContasPagarEmAberto(supabase, 'vencidas', hoje)),
    seguro(contarContasPagarEmAberto(supabase, 'vence_hoje', hoje)),
    seguro(contarRecebiveisVencidos(supabase, hoje)),
  ])

  return {
    hoje,
    pagarVencidas: contagem(pagarVencidas),
    pagarVenceHoje: contagem(pagarVenceHoje),
    receberVencidas: contagem(receberVencidas),
  }
}

export type LinhaPendencia = {
  id: IdPendencia
  quantidade: number
  href: string
  tom: 'danger' | 'warning'
}

const ORDEM: Array<{ id: IdPendencia; tom: LinhaPendencia['tom'] }> = [
  { id: 'pagarVencidas', tom: 'danger' },
  { id: 'receberVencidas', tom: 'danger' },
  { id: 'pagarVenceHoje', tom: 'warning' },
]

/** Só as pendências com quantidade > 0, das mais urgentes para as menos. Puro (testável). */
export function linhasPendencias(p: PendenciasHoje): LinhaPendencia[] {
  const out: LinhaPendencia[] = []
  for (const { id, tom } of ORDEM) {
    const q = p[id]
    if (q && q > 0) out.push({ id, quantidade: q, href: hrefPendencia(id, p.hoje), tom })
  }
  return out
}

/** Contagens que falharam (`null`): precisam aparecer como "não foi possível verificar". */
export function pendenciasComFalha(p: PendenciasHoje): IdPendencia[] {
  return ORDEM.map((o) => o.id).filter((id) => p[id] === null)
}

/** Todas as consultas falharam: o card mostra "indisponível" em vez de "nada pendente". */
export function pendenciasIndisponiveis(p: PendenciasHoje): boolean {
  return p.pagarVencidas === null && p.pagarVenceHoje === null && p.receberVencidas === null
}

/** "Nada pendente" só vale quando TODAS as contagens responderam e deram zero. */
export function pendenciasTudoOk(p: PendenciasHoje): boolean {
  return pendenciasComFalha(p).length === 0 && linhasPendencias(p).length === 0
}
