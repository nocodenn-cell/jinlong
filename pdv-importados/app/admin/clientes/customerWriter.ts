import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CUSTOMER_ERROR_CODES,
  validateClienteInput,
  type ClienteInput,
  type CreateClienteCommand,
  type CustomerWriter,
  type SaveClienteResult,
} from '@shared-core/src/customers'
import { createCustomerReader } from '@/app/admin/clientes/customerReader'

const MSG_CREATE_COM_ID = 'Operação de criação não aceita id.'
const MSG_SAVE_FAIL = 'Erro ao salvar cliente.'

/** Payload de colunas `clientes` — espelho do insert/update legado. */
export function buildClientePersistPayload(input: ClienteInput) {
  return {
    nome: input.nome.trim(),
    tipo: input.tipo,
    documento: input.documento.replace(/\D/g, ''),
    email: input.email?.trim() || null,
    telefone: input.telefone?.replace(/\D/g, '') || null,
    endereco: input.endereco?.trim() || null,
    limite_credito: input.limite_crediario,
  }
}

function buildInsertRow(command: CreateClienteCommand): Record<string, unknown> {
  const row: Record<string, unknown> = {
    ...buildClientePersistPayload(command.input),
    loja_id: command.lojaId,
  }
  if (command.input.termos_aceitos_em) {
    row.termos_aceitos_em = command.input.termos_aceitos_em
    row.consentimento_privacidade_em = command.input.consentimento_privacidade_em ?? null
  }
  return row
}

/**
 * Adapter de criação — implementa `CustomerWriter` (Missão 5.1g).
 * Update: `customerUpdater.ts`. Exclusão: legado gerente.
 */
export function createCustomerWriter(supabase: SupabaseClient): CustomerWriter {
  const reader = createCustomerReader(supabase)

  return {
    async create(command: CreateClienteCommand): Promise<SaveClienteResult> {
      const validation = validateClienteInput(command.input)
      if (!validation.ok) {
        return { ok: false, error: validation.error, code: validation.code }
      }
      if (command.input.id) {
        return {
          ok: false,
          error: MSG_CREATE_COM_ID,
          code: CUSTOMER_ERROR_CODES.CREATE_WITH_ID,
        }
      }

      try {
        const { data, error } = await supabase
          .from('clientes')
          .insert(buildInsertRow(command))
          .select('id')
          .single()
        if (error) return { ok: false, error: error.message }

        const reload = await reader.getById(data.id)
        if (!reload.ok) return { ok: false, error: reload.error }
        return { ok: true, cliente: reload.cliente }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : MSG_SAVE_FAIL }
      }
    },
  }
}
