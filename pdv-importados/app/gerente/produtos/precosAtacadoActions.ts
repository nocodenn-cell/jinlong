'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

/**
 * CRUD de faixas de preço atacado (tabela `precos_atacado`, já usada pela RPC
 * `calcular_preco_produto` — nenhuma regra de precificação é criada aqui).
 * Faixas são sempre globais (loja_id = NULL): este app opera com uma loja
 * matriz, então não há necessidade de faixas por loja nesta entrega.
 */

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type FaixaAtacado = {
  id: string
  produto_id: string
  quantidade_minima: number
  preco_unitario: number
  ativo: boolean
}

const SECAO = 'Faixas de atacado'

function revalidateFaixasPaths(produtoId: string) {
  revalidatePath('/gerente/produtos')
  revalidatePath('/admin/catalogo')
  revalidatePath(`/admin/catalogo/${produtoId}`)
}

const FaixaInputSchema = z.object({
  produto_id: z.string().uuid('ID do produto inválido.'),
  quantidade_minima: z.coerce
    .number()
    .int('A quantidade mínima deve ser um número inteiro.')
    .positive('A quantidade mínima deve ser maior que zero.'),
  preco_unitario: z.coerce.number().positive('O preço unitário deve ser maior que zero.'),
})

async function existeFaixaDuplicada(
  produtoId: string,
  quantidadeMinima: number,
  ignorarId?: string,
): Promise<boolean> {
  const supabase = await createClient()
  let query = supabase
    .from('precos_atacado')
    .select('id')
    .eq('produto_id', produtoId)
    .eq('quantidade_minima', quantidadeMinima)
    .eq('ativo', true)
    .is('loja_id', null)
  if (ignorarId) query = query.neq('id', ignorarId)
  const { data } = await query.maybeSingle()
  return data !== null
}

export async function listarFaixasAtacado(produtoId: string): Promise<ActionResult<FaixaAtacado[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const idValido = z.string().uuid().safeParse(produtoId)
  if (!idValido.success) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod('ID do produto inválido.', idioma) }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('precos_atacado')
    .select('id, produto_id, quantidade_minima, preco_unitario, ativo')
    .eq('produto_id', produtoId)
    .eq('ativo', true)
    .order('quantidade_minima', { ascending: true })

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroComSecao(SECAO, error.message, idioma) }
  }
  return { success: true, data: (data ?? []) as FaixaAtacado[] }
}

export async function criarFaixaAtacado(input: unknown): Promise<ActionResult<FaixaAtacado>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = FaixaInputSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const { idioma } = await getUsuarioIdioma()
  if (await existeFaixaDuplicada(parsed.data.produto_id, parsed.data.quantidade_minima)) {
    return {
      success: false,
      error: mensagemErroComSecao(SECAO, 'já existe uma faixa ativa com esta quantidade mínima.', idioma),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('precos_atacado')
    .insert({
      produto_id: parsed.data.produto_id,
      quantidade_minima: parsed.data.quantidade_minima,
      preco_unitario: parsed.data.preco_unitario,
      loja_id: null,
      ativo: true,
    })
    .select('id, produto_id, quantidade_minima, preco_unitario, ativo')
    .single()

  if (error || !data) {
    return { success: false, error: mensagemErroComSecao(SECAO, error?.message ?? 'Erro ao salvar.', idioma) }
  }

  revalidateFaixasPaths(parsed.data.produto_id)
  return { success: true, data: data as FaixaAtacado }
}

const AtualizarFaixaSchema = FaixaInputSchema.extend({
  id: z.string().uuid('ID da faixa inválido.'),
})

export async function atualizarFaixaAtacado(input: unknown): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarFaixaSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const { idioma } = await getUsuarioIdioma()
  if (await existeFaixaDuplicada(parsed.data.produto_id, parsed.data.quantidade_minima, parsed.data.id)) {
    return {
      success: false,
      error: mensagemErroComSecao(SECAO, 'já existe uma faixa ativa com esta quantidade mínima.', idioma),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('precos_atacado')
    .update({
      quantidade_minima: parsed.data.quantidade_minima,
      preco_unitario: parsed.data.preco_unitario,
    })
    .eq('id', parsed.data.id)
    .eq('produto_id', parsed.data.produto_id)

  if (error) {
    return { success: false, error: mensagemErroComSecao(SECAO, error.message, idioma) }
  }

  revalidateFaixasPaths(parsed.data.produto_id)
  return { success: true, data: null }
}

const InativarFaixaSchema = z.object({
  id: z.string().uuid('ID da faixa inválido.'),
  produto_id: z.string().uuid('ID do produto inválido.'),
})

export async function inativarFaixaAtacado(input: unknown): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = InativarFaixaSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('precos_atacado')
    .update({ ativo: false })
    .eq('id', parsed.data.id)
    .eq('produto_id', parsed.data.produto_id)

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroComSecao(SECAO, error.message, idioma) }
  }

  revalidateFaixasPaths(parsed.data.produto_id)
  return { success: true, data: null }
}
