'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'

type R = { success: true } | { success: false; error: string }

export async function executarTransferencia(input: {
  loja_origem_id: string
  loja_destino_id: string
  produto_id: string
  quantidade: number
  observacao?: string
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  if (input.loja_origem_id === input.loja_destino_id) {
    return { success: false, error: 'Lojas origem e destino devem ser diferentes.' }
  }
  if (!input.quantidade || input.quantidade <= 0) {
    return { success: false, error: 'Quantidade inválida.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transferir_estoque_entre_lojas', {
    p_loja_origem: input.loja_origem_id,
    p_loja_destino: input.loja_destino_id,
    p_produto_id: input.produto_id,
    p_quantidade: input.quantidade,
    p_observacao: input.observacao?.trim() || null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/gerente/transferencias')
  revalidatePath('/gerente/estoque')
  return { success: true }
}
