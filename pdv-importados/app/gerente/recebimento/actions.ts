'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId, getGerenteUserId } from '@/lib/gerente/auth/sessionContext'
import { validarRemessaInput } from './actions.validation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { createInventoryMovementWriter } from '@/app/admin/estoque/inventoryMovementWriter'
import { escapeIlike } from '@/app/admin/financeiro/receivableReader'
import { isInativo, type StatusPublicacao } from '@/core/catalog/statusPublicacao'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

async function lojaDoUsuario(): Promise<string | null> {
  return getGerenteLojaId()
}

export type RecebimentoProdutoBusca = Readonly<{
  id: string
  nome: string
  codigo_barras: string | null
}>

/**
 * Busca produtos para o recebimento (autocomplete).
 *
 * Substitui o `<select>` que carregava 500 produtos de uma vez: acima desse teto
 * o produto simplesmente não aparecia, sem erro nem aviso
 * (AUDITORIA_CATALOGO_PRODUTO.md §5.5). Busca por nome, código de barras ou
 * código interno, com teto pequeno e escopo de loja.
 *
 * DRAFT é aceito de propósito; INATIVO não. Receber é entrada física de
 * mercadoria, que precede a venda: produto novo nasce DRAFT
 * (`defaultStatusNovoProduto`), então exigir publicação antes de receber
 * obrigaria a publicar no PDV um item que ainda não chegou. Já o INATIVO é item
 * aposentado — receber estoque para ele é quase sempre engano de digitação, e o
 * caminho certo é reativar antes. Decisão registrada em
 * AUDITORIA_CATALOGO_PRODUTO.md §5.5.
 */
export async function buscarProdutosRecebimento(
  termo: string,
): Promise<R<RecebimentoProdutoBusca[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) {
    return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }
  }

  // `.or()` do PostgREST é uma mini-linguagem: vírgula separa condições e
  // parênteses agrupam. Termo cru com esses caracteres ("Caneca (300ml)",
  // "copo, azul") quebrava a query e o autocomplete devolvia vazio sem erro
  // visível — e permitia acrescentar condições à consulta. Viram espaço em vez
  // de escape: busca é aproximada, e um espaço a mais não muda o resultado.
  const t = (termo ?? '').replace(/[,()]/g, ' ').trim().slice(0, 120)
  if (t.length < 2) return { success: true, data: [] }

  const supabase = await createClient()
  // Curingas de LIKE (`%`, `_`) pelo utilitário já usado no financeiro: sem
  // isto um `%` digitado casaria com o catálogo inteiro.
  const seguro = escapeIlike(t)
  const digitos = t.replace(/\D/g, '')
  const ors = [`nome.ilike.%${seguro}%`, `codigo_interno.ilike.%${seguro}%`]
  if (digitos) ors.push(`codigo_barras.like.%${digitos}%`)

  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, status_publicacao')
    .eq('loja_id', lojaId)
    .or(ors.join(','))
    .order('nome', { ascending: true })
    .limit(20)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Produtos', error.message) }
  }
  const linhas = (data ?? []) as (RecebimentoProdutoBusca & {
    status_publicacao: StatusPublicacao | null
  })[]
  return {
    success: true,
    data: linhas
      .filter((p) => !isInativo(p.status_publicacao))
      .map(({ id, nome, codigo_barras }) => ({ id, nome, codigo_barras })),
  }
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
