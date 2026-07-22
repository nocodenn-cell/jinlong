'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId, getGerenteUserId } from '@/lib/gerente/auth/sessionContext'
import { validarRemessaInput } from './actions.validation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { createInventoryMovementWriter } from '@/app/admin/estoque/inventoryMovementWriter'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

async function lojaDoUsuario(): Promise<string | null> {
  return getGerenteLojaId()
}

export async function criarRemessaConferencia(input: {
  origem: string
  observacao?: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
}): Promise<R<string>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const userId = await getGerenteUserId()
  if (!userId) return { success: false, error: 'Faça login novamente para registrar a remessa.' }
  const supabase = await createClient()

  const erro = validarRemessaInput({
    origem: input.origem,
    itens: input.itens,
  })
  if (erro) return { success: false, error: erro }
  const origem = input.origem.trim()

  const { data: rem, error: e1 } = await supabase
    .from('remessas')
    .insert({
      loja_id: lojaId,
      origem_descricao: origem,
      status: 'EM_CONFERENCIA',
      observacao: input.observacao?.trim() || null,
      created_by: userId,
    })
    .select('id')
    .single()

  if (e1 || !rem) {
    return {
      success: false,
      error: e1
        ? mensagemErroComSecao('Remessa', e1.message)
        : 'Não foi possível criar a remessa. Tente de novo.',
    }
  }

  const rows = input.itens.map((i) => ({
    remessa_id: rem.id,
    produto_id: i.produto_id,
    quantidade_esperada: i.quantidade_esperada,
    quantidade_conferida: i.quantidade_conferida,
  }))

  const { error: e2 } = await supabase.from('remessa_itens').insert(rows)
  if (e2) return { success: false, error: mensagemErroComSecao('Itens da remessa', e2.message) }

  const writer = createInventoryMovementWriter(supabase, lojaId)
  const confirmed = await writer.confirmRemessaEntrada({ remessaId: rem.id })
  if (!confirmed.ok) {
    return {
      success: false,
      error: mensagemErroComSecao('Confirmação da remessa', confirmed.error),
    }
  }

  revalidatePath('/gerente/recebimento')
  revalidatePath('/gerente/estoque')
  return { success: true, data: rem.id }
}
