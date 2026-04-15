'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.loja_id as string | undefined) ?? LOJA_MATRIZ_ID
}

const AtualizarEstoqueSchema = z.object({
  produto_id: z.string().uuid('Produto inválido.'),
  quantidade_atual: z.coerce.number().min(0, 'Quantidade atual não pode ser negativa.'),
  estoque_minimo: z.coerce.number().min(0, 'Estoque mínimo não pode ser negativo.'),
})

const ProdutoIdSchema = z.object({
  produto_id: z.string().uuid('Produto inválido.'),
})

export async function atualizarEstoqueProduto(
  input: unknown
): Promise<ActionResult> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarEstoqueSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: mensagemErroValidacaoZod(msg) }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const { error } = await supabase
    .from('estoque')
    .update({
      quantidade_atual: parsed.data.quantidade_atual,
      estoque_minimo: parsed.data.estoque_minimo,
    })
    .eq('produto_id', parsed.data.produto_id)
    .eq('loja_id', lojaId)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Estoque', error.message) }
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
  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const { error } = await supabase.from('estoque').insert({
    produto_id: parsed.data.produto_id,
    loja_id: lojaId,
    quantidade_atual: 0,
    estoque_minimo: 0,
  })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Estoque já existe para este produto.' }
    }
    return { success: false, error: mensagemErroComSecao('Estoque', error.message) }
  }

  revalidatePath('/gerente/estoque')
  return { success: true, data: null }
}
