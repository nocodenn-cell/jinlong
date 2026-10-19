'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { empresaContextoId, filtrarEmpresa } from '@/lib/multiempresa/empresaContexto'

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
  const empresaId = await empresaContextoId(supabase)
  const { data, error } = await filtrarEmpresa(
    supabase.from('configuracoes_gerais').select('chave, valor').in('chave', ['vendas_suspensas', 'motivo_suspensao']),
    empresaId,
  )

  if (error) return { success: false, error: error.message }

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
  const empresaId = await empresaContextoId(supabase)

  const updates = [
    { chave: 'vendas_suspensas', valor: suspensas ? 'true' : 'false' },
    { chave: 'motivo_suspensao', valor: motivo.trim().slice(0, 300) },
  ]

  for (const [i, u] of updates.entries()) {
    // `.select('chave')` devolve as linhas afetadas: UPDATE sem erro mas com 0 linhas
    // (linha ausente ou RLS negando) não pode virar "sucesso".
    const { data, error } = await filtrarEmpresa(
      supabase.from('configuracoes_gerais').update({ valor: u.valor }).eq('chave', u.chave),
      empresaId,
    ).select('chave')
    if (error) return { success: false, error: error.message }
    if (data?.length !== 1) {
      return {
        success: false,
        error:
          i === 0
            ? 'Não foi possível confirmar a alteração da suspensão. Nada foi salvo.'
            : 'A suspensão foi alterada, mas o motivo não pôde ser confirmado. Recarregue a página e confira o estado.',
      }
    }
  }

  revalidatePath('/gerente')
  return { success: true, data: null }
}
