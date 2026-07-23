import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { createClient } from '@/lib/supabase/server'
import { createCustomerWriter } from '@/app/admin/clientes/customerWriter'
import { localizeCustomerFailure } from '@/app/admin/clientes/customerMessages'
import { revalidatePath } from 'next/cache'
import type { ClienteInput } from '@shared-core/src/customers'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const PERFIS_OK = new Set(['OPERADOR', 'GERENTE', 'DONO', 'ADMIN'])

export type CadastroClienteRelampagoInput = {
  nome: string
  documento: string
  celular?: string
}

/**
 * Cadastro rápido de cliente no PDV (aba Cliente).
 * Autoriza OPERADOR+ — distinto do CRUD completo de clientes (GERENTE+ via
 * assertGerenteSession). Create via CustomerWriter existente (mesmo usado por
 * gerente/admin) — sem RPC nova, sem alteração de schema.
 */
export async function criarClienteRelampagoPdvImpl(
  input: CadastroClienteRelampagoInput,
): Promise<ActionResult<{ id: string; nome: string }>> {
  const u = await getUsuarioAtual()
  if (!u.userId) {
    return { success: false, error: 'Sessão expirada — faça login novamente.' }
  }
  if (!PERFIS_OK.has(u.perfil)) {
    return { success: false, error: 'Sem permissão para cadastrar cliente.' }
  }
  const lojaId = u.lojaId
  if (!lojaId) {
    return { success: false, error: 'Operador sem loja vinculada.' }
  }

  const docDigits = input.documento.replace(/\D/g, '')
  const clienteInput: ClienteInput = {
    nome: input.nome.trim(),
    tipo: docDigits.length === 14 ? 'PJ' : 'PF',
    documento: docDigits,
    email: null,
    telefone: input.celular?.replace(/\D/g, '') || null,
    endereco: null,
    limite_crediario: 0,
  }

  const supabase = await createClient()
  const writer = createCustomerWriter(supabase)
  const result = await writer.create({ input: clienteInput, lojaId })

  if (!result.ok) {
    return { success: false, error: localizeCustomerFailure(u.idioma, result).error }
  }

  revalidatePath('/caixa')
  return { success: true, data: { id: result.cliente.id, nome: result.cliente.nome } }
}
