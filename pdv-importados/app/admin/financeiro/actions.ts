'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { ROUTES } from '@shared-core/navigation/routes'

type R = { success: true } | { success: false; error: string }

export type FormaPagamentoCR = 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'OUTROS'

export async function baixarContaReceber(input: {
  titulo_id: string
  valor: number
  forma_pagamento: FormaPagamentoCR
  observacao?: string
}): Promise<R> {
  const auth = await assertAdminSession('financeiro:baixar-cr', {
    pathname: ROUTES.admin.financeiro,
    resource: `route:${ROUTES.admin.financeiro}`,
  })
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.titulo_id?.trim()) return { success: false, error: 'Título obrigatório' }
  if (!input.valor || input.valor <= 0) return { success: false, error: 'Valor deve ser maior que zero' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('registrar_liquidacao_receber', {
    p_titulo_id: input.titulo_id,
    p_valor: input.valor,
    p_forma_pagamento: input.forma_pagamento,
    p_observacao: input.observacao?.trim() || null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath(ROUTES.admin.financeiro)
  return { success: true }
}
