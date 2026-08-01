'use server'

import { revalidarDominio } from '@/lib/navigation/revalidarDominio'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createCustomerReader } from '@/app/admin/clientes/customerReader'
import { createCustomerWriter } from '@/app/admin/clientes/customerWriter'
import { createCustomerUpdater } from '@/app/admin/clientes/customerUpdater'
import { createCustomerExclusion } from '@/app/admin/clientes/customerExclusion'
import { localizeCustomerFailure } from '@/app/admin/clientes/customerMessages'
import { tApp } from '@/i18n/catalogAdapter'
import {
  CUSTOMER_ERROR_CODES,
  type ClienteInput,
  type ClienteListRow,
  type DeleteClienteResult,
  type ListClientesPaginadosResult,
  type SaveClienteResult,
} from '@shared-core/src/customers'

export type { ClienteInput, ClienteListRow }

/**
 * Borda Server Action — listagem via CustomerReader (Fase 2).
 */
export async function buscarClientesPaginadosAction(
  page: number,
  termo?: string,
): Promise<ListClientesPaginadosResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const supabase = await createClient()
  const reader = createCustomerReader(supabase)
  return reader.listPaginados({ page, termo })
}

function revalidateClientesPaths(): void {
  revalidarDominio('cliente.alterado')
}

/**
 * Borda Server Action — criação via CustomerWriter (Missão 5.1g).
 * Erros de domínio resolvidos no locale da sessão (5.3).
 */
export async function criarClienteAction(input: ClienteInput): Promise<SaveClienteResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const lojaId = authCheck.session.lojaId
  if (!lojaId) {
    return { ok: false, error: tApp(authCheck.session.idioma, 'clientes.err_sem_loja') }
  }

  const supabase = await createClient()
  const writer = createCustomerWriter(supabase)
  const result = await writer.create({ input, lojaId })

  if (!result.ok) return localizeCustomerFailure(authCheck.session.idioma, result)
  revalidateClientesPaths()
  return result
}

/**
 * Borda Server Action — edição via CustomerUpdater (Missão 5.1h).
 */
export async function atualizarClienteAction(input: ClienteInput): Promise<SaveClienteResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  if (!input.id) {
    return localizeCustomerFailure(authCheck.session.idioma, {
      error: 'Operação de atualização exige id.',
      code: CUSTOMER_ERROR_CODES.UPDATE_WITHOUT_ID,
    })
  }

  const supabase = await createClient()
  const updater = createCustomerUpdater(supabase)
  const result = await updater.update({ id: input.id, input })

  if (!result.ok) return localizeCustomerFailure(authCheck.session.idioma, result)
  revalidateClientesPaths()
  return result
}

/**
 * Borda Server Action — exclusão via CustomerExclusionService (Missão 5.1i).
 * Policy LGPD em shared-core; mensagens na borda (5.3).
 */
export async function excluirClienteAction(id: string): Promise<DeleteClienteResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const supabase = await createClient()
  const exclusion = createCustomerExclusion(supabase)
  const result = await exclusion.exclude(id)

  if (!result.ok) return localizeCustomerFailure(authCheck.session.idioma, result)
  revalidateClientesPaths()
  return result
}
