'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SuspensaoStatus = {
  suspensas: boolean
  motivo: string
}

export async function carregarSuspensaoVendas(): Promise<ActionResult<SuspensaoStatus>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('configuracoes_gerais')
    .select('chave, valor')
    .in('chave', ['vendas_suspensas', 'motivo_suspensao'])

  if (error) return { success: false, error: mensagemErroParaUsuario(error.message) }

  const map = Object.fromEntries((data ?? []).map((r) => [r.chave as string, r.valor as string]))
  return {
    success: true,
    data: {
      suspensas: map.vendas_suspensas === 'true',
      motivo: map.motivo_suspensao ?? '',
    },
  }
}

export async function atualizarSuspensaoVendas(
  suspensas: boolean,
  motivo: string,
): Promise<ActionResult> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const updates = [
    { chave: 'vendas_suspensas', valor: suspensas ? 'true' : 'false' },
    { chave: 'motivo_suspensao', valor: motivo.trim().slice(0, 300) },
  ]

  for (const u of updates) {
    const { error } = await supabase
      .from('configuracoes_gerais')
      .update({ valor: u.valor })
      .eq('chave', u.chave)
    if (error) return { success: false, error: mensagemErroParaUsuario(error.message) }
  }

  revalidatePath('/gerente')
  return { success: true, data: null }
}
