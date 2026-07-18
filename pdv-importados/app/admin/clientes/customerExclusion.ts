import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CLIENTE_ANONIMIZACAO_PAYLOAD,
  CUSTOMER_ERROR_CODES,
  decideClienteExclusion,
  type CustomerExclusionEffects,
  type CustomerExclusionService,
  type DeleteClienteResult,
} from '@shared-core/src/customers'

export const MSG_CLIENTE_NAO_ENCONTRADO = 'Cliente não encontrado.'
const MSG_EXCLUDE_FAIL = 'Erro ao excluir cliente.'

/**
 * Efeitos de I/O da exclusão — espelho da action legada (view + contas_receber).
 */
export function createCustomerExclusionEffects(
  supabase: SupabaseClient,
): CustomerExclusionEffects {
  return {
    async loadExclusionFacts(id) {
      try {
        const { data: existente, error: getErr } = await supabase
          .from('v_clientes_gerente')
          .select('saldo_crediario, nome')
          .eq('id', id)
          .maybeSingle()

        if (getErr) return { ok: false, error: getErr.message }
        if (!existente) {
          return { ok: false, error: MSG_CLIENTE_NAO_ENCONTRADO, notFound: true }
        }

        const { count: historico, error: histErr } = await supabase
          .from('contas_receber')
          .select('id', { count: 'exact', head: true })
          .eq('cliente_id', id)

        if (histErr) return { ok: false, error: histErr.message }

        return {
          ok: true,
          facts: {
            nome: existente.nome as string,
            saldoCrediario: Number(existente.saldo_crediario),
            temHistoricoContasReceber: Boolean(historico && historico > 0),
          },
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : MSG_EXCLUDE_FAIL,
        }
      }
    },

    async anonymize(id) {
      try {
        const { error } = await supabase
          .from('clientes')
          .update({ ...CLIENTE_ANONIMIZACAO_PAYLOAD })
          .eq('id', id)
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : MSG_EXCLUDE_FAIL,
        }
      }
    },

    async deletePhysical(id) {
      try {
        const { error } = await supabase.from('clientes').delete().eq('id', id)
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : MSG_EXCLUDE_FAIL,
        }
      }
    },
  }
}

/**
 * Orquestra: loadFacts → decideClienteExclusion (shared-core) → efeito.
 */
export function createCustomerExclusionService(
  effects: CustomerExclusionEffects,
): CustomerExclusionService {
  return {
    async exclude(id: string): Promise<DeleteClienteResult> {
      const loaded = await effects.loadExclusionFacts(id)
      if (!loaded.ok) {
        return {
          ok: false,
          error: loaded.error,
          code: loaded.notFound ? CUSTOMER_ERROR_CODES.NOT_FOUND : undefined,
        }
      }

      const decision = decideClienteExclusion(loaded.facts)
      if (decision.action === 'reject') {
        return {
          ok: false,
          error: decision.error,
          code: decision.code,
          params: decision.params,
        }
      }
      if (decision.action === 'anonymize') {
        const anon = await effects.anonymize(id)
        if (!anon.ok) return anon
        return { ok: true, anonimizado: true }
      }

      const del = await effects.deletePhysical(id)
      if (!del.ok) return del
      return { ok: true }
    },
  }
}

/** Factory completa (Supabase) — usada pela Server Action. */
export function createCustomerExclusion(supabase: SupabaseClient): CustomerExclusionService {
  return createCustomerExclusionService(createCustomerExclusionEffects(supabase))
}
