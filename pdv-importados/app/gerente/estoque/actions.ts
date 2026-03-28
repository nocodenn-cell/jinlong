'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

const AtualizarEstoqueSchema = z.object({
  produto_id: z.string().uuid(),
  quantidade_atual: z.coerce.number().min(0),
  estoque_minimo: z.coerce.number().min(0),
})

const ProdutoIdSchema = z.object({
  produto_id: z.string().uuid(),
})

export async function atualizarEstoqueProduto(
  input: unknown
): Promise<ActionResult> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarEstoqueSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'Dados inválidos',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('estoque')
    .update({
      quantidade_atual: parsed.data.quantidade_atual,
      estoque_minimo: parsed.data.estoque_minimo,
    })
    .eq('produto_id', parsed.data.produto_id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/gerente/estoque')
  return { success: true, data: null }
}

/**
 * Produtos legados sem linha em `estoque`: cria registro inicial (0 / 0).
 */
export async function garantirLinhaEstoque(input: unknown): Promise<ActionResult> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ProdutoIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Produto inválido' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('estoque').insert({
    produto_id: parsed.data.produto_id,
    quantidade_atual: 0,
    estoque_minimo: 0,
  })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Estoque já existe para este produto.' }
    }
    return { success: false, error: error.message }
  }

  revalidatePath('/gerente/estoque')
  return { success: true, data: null }
}
