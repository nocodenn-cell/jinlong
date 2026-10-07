'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import { validarRemessaInput, validarVinculoOrdemCompra } from './actions.validation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { isInativo, type StatusPublicacao } from '@/core/catalog/statusPublicacao'
import type { StatusOC } from '@/app/gerente/compras/actions'
import { mensagemErroOc, type OcResumoRecebimento } from '@/app/gerente/compras/ocRecebimento'
import { carregarResumoOc } from '@/app/gerente/compras/ocResumoQuery'
import { createInventoryReader } from '@/app/admin/estoque/inventoryReader'

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

export type RemessaConferenciaResultado = {
  remessaId: string
  /** Estado do pedido depois da entrada (só quando a entrada foi vinculada a um pedido). */
  oc: OcResumoRecebimento | null
  /**
   * Saldo do produto DEPOIS da entrada, lido de `estoque` (mesmo reader do inventário). Só existe
   * quando a remessa tem um único item; `null` se a leitura falhar — a entrada já foi confirmada.
   */
  saldoAtual: number | null
}

export async function criarRemessaConferencia(input: {
  origem: string
  observacao?: string
  idempotency_key: string
  /** `quantidade_esperada` ausente (entrada sem documento) vale a própria quantidade conferida. */
  itens: Array<{ produto_id: string; quantidade_esperada?: number; quantidade_conferida: number }>
  /** S8/RM-14 — vínculo opcional com uma Ordem de Compra (id de `ordens_compra`). */
  ordemCompraId?: string | null
}): Promise<R<RemessaConferenciaResultado>> {
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
  // Sem documento não há expectativa: a RPC exige os dois valores, então esperada = conferida.
  const itens = input.itens.map((i) => ({
    produto_id: i.produto_id,
    quantidade_esperada: i.quantidade_esperada ?? i.quantidade_conferida,
    quantidade_conferida: i.quantidade_conferida,
  }))
  const idempotencyKey = input.idempotency_key?.trim()
  if (!idempotencyKey) {
    return { success: false, error: 'Não foi possível identificar esta tentativa. Tente novamente.' }
  }

  // Checagem amigável do vínculo com a OC (fail-closed: erro de consulta, OC inexistente ou de
  // outra loja recusa a entrada inteira). NÃO é a garantia: a RPC abaixo trava o pedido e valida
  // status/saldo de forma atômica (UX-04) — uma corrida entre esta leitura e a RPC é recusada lá.
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
    p_itens: itens,
    p_idempotency_key: idempotencyKey,
    // Só envia o vínculo quando há pedido: entrada sem pedido segue com os 4 argumentos de sempre.
    ...(ordemCompraId ? { p_ordem_compra_id: ordemCompraId } : {}),
  })

  if (error || !remessaId) {
    return {
      success: false,
      error: error
        ? (mensagemErroOc(error.message) ?? mensagemErroComSecao('Remessa', error.message))
        : 'Não foi possível criar a remessa. Tente de novo.',
    }
  }

  // Depois da entrada, mostra o estado real do pedido (o que falta, se fechou), lido do banco.
  const oc: OcResumoRecebimento | null = ordemCompraId
    ? await carregarResumoOc(supabase, lojaId, ordemCompraId)
    : null

  // Saldo novo do produto, só para dar feedback ao operador: leitura, nunca decide nada.
  let saldoAtual: number | null = null
  if (itens.length === 1) {
    const saldo = await createInventoryReader(supabase, lojaId).getBalance(itens[0].produto_id)
    if (saldo.ok) saldoAtual = saldo.item.quantity
  }

  revalidatePath('/gerente/recebimento')
  revalidatePath('/gerente/estoque')
  if (ordemCompraId) {
    revalidatePath('/gerente/compras')
    revalidatePath('/admin/compras')
  }
  return { success: true, data: { remessaId: String(remessaId), oc, saldoAtual } }
}

export async function listarHistoricoEntregas(busca = '', pagina = 1): Promise<R<{ rows: Array<{ id: string; origem_descricao: string; status: string; created_at: string }>; total: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }
  const db = await createClient()
  const filtro = busca.replace(/[,%_()\\]/g, ' ').trim().slice(0, 100)
  let query = db.from('remessas').select('id,origem_descricao,status,created_at', { count: 'exact' }).eq('loja_id', lojaId)
  if (filtro) query = query.ilike('origem_descricao', `%${filtro}%`)
  const page = Number.isFinite(pagina) ? Math.max(1, Math.floor(pagina)) : 1
  const result = await query.order('created_at', { ascending: false }).order('id').range((page - 1) * 20, page * 20 - 1)
  if (result.error) return { success: false, error: mensagemErroComSecao('Histórico de entregas', result.error.message) }
  return { success: true, data: { rows: result.data ?? [], total: result.count ?? 0 } }
}

export type EntregaItemHistorico = { id: string; nome: string; esperada: number; conferida: number }
export async function obterItensEntrega(remessaId: string): Promise<R<EntregaItemHistorico[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  const lojaId = await lojaDoUsuario()
  const db = await createClient()
  const remessa = await db.from('remessas').select('id').eq('id', remessaId).eq('loja_id', lojaId ?? '').maybeSingle()
  if (remessa.error || !remessa.data) return { success: false, error: 'Entrega não encontrada nesta loja.' }
  const result = await db.from('remessa_itens').select('id,quantidade_esperada,quantidade_conferida,produtos(nome)').eq('remessa_id', remessaId).order('id')
  if (result.error) return { success: false, error: mensagemErroComSecao('Itens da entrega', result.error.message) }
  return { success: true, data: (result.data ?? []).map((item) => ({ id: item.id,
    nome: (Array.isArray(item.produtos) ? item.produtos[0] : item.produtos)?.nome ?? '—',
    esperada: Number(item.quantidade_esperada), conferida: Number(item.quantidade_conferida) })) }
}
