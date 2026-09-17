'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import { validarRemessaInput, validarVinculoOrdemCompra } from './actions.validation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { isInativo, type StatusPublicacao } from '@/core/catalog/statusPublicacao'
import type { StatusOC } from '@/app/gerente/compras/actions'

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

  // `.or()` do PostgREST é uma mini-linguagem: vírgula separa condições,
  // parênteses agrupam e a barra invertida é o escape DELA. Termo cru quebrava
  // a query ("Caneca (300ml)", "copo, azul") e permitia acrescentar condições.
  //
  // Os curingas de LIKE (`%`, `_`) entram na mesma limpeza, e não por escape:
  // `escapeIlike` é seguro em `.ilike(col, valor)`, onde o valor viaja como
  // parâmetro e o `\%` chega íntegro ao Postgres — mas NÃO aqui dentro, onde o
  // parser do PostgREST consome a barra antes e devolve o `%` como curinga.
  // Um `%` digitado casaria o catálogo inteiro. Vira espaço: a busca é
  // aproximada e um espaço a mais não muda o resultado prático.
  const t = (termo ?? '').replace(/[,()%_\\]/g, ' ').trim().slice(0, 120)
  if (t.length < 2) return { success: true, data: [] }

  const supabase = await createClient()
  const digitos = t.replace(/\D/g, '')
  const ors = [`nome.ilike.%${t}%`, `codigo_interno.ilike.%${t}%`]
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

/**
 * Busca um produto específico por id para pré-selecionar o recebimento
 * (ex.: deep-link "Repor" a partir de um item crítico em `/admin/estoque`).
 * Mesmo escopo/filtro de `buscarProdutosRecebimento`: produto de outra loja
 * ou INATIVO retorna `null` em vez de erro — o formulário só degrada para a
 * busca manual, sem quebrar a página.
 */
export async function buscarProdutoRecebimentoPorId(
  id: string,
): Promise<R<RecebimentoProdutoBusca | null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) {
    return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, status_publicacao')
    .eq('loja_id', lojaId)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { success: false, error: mensagemErroComSecao('Produtos', error.message) }
  }
  if (!data || isInativo(data.status_publicacao as StatusPublicacao | null)) {
    return { success: true, data: null }
  }
  return {
    success: true,
    data: { id: data.id, nome: data.nome, codigo_barras: data.codigo_barras },
  }
}

export async function criarRemessaConferencia(input: {
  origem: string
  observacao?: string
  idempotency_key: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
  /** S8/RM-14 — vínculo opcional com uma Ordem de Compra (id de `ordens_compra`). */
  ordemCompraId?: string | null
}): Promise<R<string>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const supabase = await createClient()

  const erro = validarRemessaInput({
    origem: input.origem,
    itens: input.itens,
  })
  if (erro) return { success: false, error: erro }
  const idempotencyKey = input.idempotency_key?.trim()
  if (!idempotencyKey) {
    return { success: false, error: 'Não foi possível identificar esta tentativa. Tente novamente.' }
  }

  // S8/RM-14 — validação de aplicação do vínculo com OC (Opção 1: não é trava
  // de RPC nem de schema). Fail-closed: qualquer erro de consulta, OC não
  // encontrada ou fora da loja recusa o recebimento inteiro — não é seguro
  // assumir vínculo válido quando não confirmamos o status real da OC. Não é
  // uma garantia transacional: entre esta leitura e a chamada da RPC abaixo
  // não há lock — se o status da OC mudar nesse intervalo estreito, a
  // corrida não é impedida. Aceitável para um fluxo humano de baixa
  // frequência; não usar este padrão onde a invariante precisa ser atômica.
  const ordemCompraId = input.ordemCompraId?.trim() || null
  if (ordemCompraId) {
    const { data: oc, error: ocError } = await supabase
      .from('ordens_compra')
      .select('status')
      .eq('id', ordemCompraId)
      .eq('loja_id', lojaId)
      .maybeSingle()

    if (ocError) {
      return { success: false, error: 'Não foi possível confirmar a ordem de compra vinculada. Tente novamente.' }
    }
    if (!oc) {
      return { success: false, error: 'Ordem de compra não encontrada.' }
    }
    const erroVinculo = validarVinculoOrdemCompra(oc.status as StatusOC)
    if (erroVinculo) return { success: false, error: erroVinculo }
  }

  const { data: remessaId, error } = await supabase.rpc('criar_confirmar_remessa_entrada', {
    p_origem: input.origem.trim(),
    p_observacao: input.observacao?.trim() || null,
    p_itens: input.itens,
    p_idempotency_key: idempotencyKey,
  })

  if (error || !remessaId) {
    return {
      success: false,
      error: error
        ? mensagemErroComSecao('Remessa', error.message)
        : 'Não foi possível criar a remessa. Tente de novo.',
    }
  }

  revalidatePath('/gerente/recebimento')
  revalidatePath('/gerente/estoque')
  return { success: true, data: remessaId }
}
