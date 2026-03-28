'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { createProdutoRepository } from '@/lib/adapters/supabase/produtoRepository'
import {
  criarProdutoComEstoque,
  alternarAtivoProduto as alternarAtivoNoDominio,
} from '@/core/services/produtoService'

const NovoProdutoSchema = z.object({
  nome: z.string().min(2),
  codigo_barras: z
    .string()
    .optional()
    .transform((s) => {
      const t = (s ?? '').trim()
      return t.length === 0 ? null : t
    })
    .refine(
      (s) => s === null || s.length >= 3,
      'Código de barras: mínimo 3 caracteres ou deixe em branco'
    ),
  preco_varejo: z.coerce.number().positive(),
  origem: z.enum(['china_manual', 'brasil_nf', 'brasil_sem_nf']),
  tem_nf: z.coerce.boolean(),
})

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function criarProduto(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = NovoProdutoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'Dados inválidos',
    }
  }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await criarProdutoComEstoque(parsed.data, repo)

  if (result.success) {
    revalidatePath('/gerente/produtos')
  }
  return result
}

export async function alternarAtivoProduto(
  produtoId: string,
  ativo: boolean
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await alternarAtivoNoDominio(produtoId, ativo, repo)

  if (!result.success) {
    return { success: false, error: result.error }
  }
  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}
