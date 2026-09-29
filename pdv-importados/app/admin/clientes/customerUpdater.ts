import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CUSTOMER_ERROR_CODES,
  validateClienteInput,
  type CustomerUpdater,
  type SaveClienteResult,
  type UpdateClienteCommand,
} from '@shared-core/src/customers'
import { createCustomerReader } from '@/app/admin/clientes/customerReader'
import { buildClientePersistPayload } from '@/app/admin/clientes/customerWriter'

const MSG_UPDATE_SEM_ID = 'Operação de atualização exige id.'
const MSG_SAVE_FAIL = 'Erro ao salvar cliente.'

/**
 * Adapter de atualização — implementa `CustomerUpdater` (Missão 5.1h).
 * Consent LGPD de create não se reaplica (regra legada).
 * Exclusão permanece em `gerente/clientes`.
 */
export function createCustomerUpdater(supabase: SupabaseClient): CustomerUpdater {
  const reader = createCustomerReader(supabase)

  return {
    async update(command: UpdateClienteCommand): Promise<SaveClienteResult> {
      const validation = validateClienteInput(command.input)
      if (!validation.ok) {
        return { ok: false, error: validation.error, code: validation.code }
      }
      if (!command.id) {
        return {
          ok: false,
          error: MSG_UPDATE_SEM_ID,
          code: CUSTOMER_ERROR_CODES.UPDATE_WITHOUT_ID,
        }
      }

      try {
        const { error } = await supabase
          .from('clientes')
          .update(buildClientePersistPayload(command.input))
          .eq('id', command.id)
        if (error) {
          if (error.code === '23505') {
            return {
              ok: false,
              error: 'Já existe um cliente com este CPF/CNPJ nesta loja.',
              code: CUSTOMER_ERROR_CODES.DOCUMENT_DUPLICATE,
            }
          }
          return { ok: false, error: error.message }
        }

        const reload = await reader.getById(command.id)
        if (!reload.ok) return { ok: false, error: reload.error }
        return { ok: true, cliente: reload.cliente }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : MSG_SAVE_FAIL }
      }
    },
  }
}
