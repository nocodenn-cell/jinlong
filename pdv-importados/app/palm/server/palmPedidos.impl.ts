import { createClient } from '@/lib/supabase/server'
import { payloadEnvio, type ItemAssumido } from '@/app/palm/domain/palmPedido'
import type { MeuPedidoPalm, PedidoPalmCard } from '@/app/palm/domain/tiposPalm'
import { exigirSessaoPalm, traduzirErroPalm } from '@/app/palm/server/palmSessao'

export type { MeuPedidoPalm, PedidoPalmCard }

export type EnviarPalmResult =
  | { ok: true; id: string; numeroLocal: number; status: string; idempotente: boolean }
  | { ok: false; error: string }

export type AssumirPalmResult =
  | {
      ok: true
      id: string
      numeroLocal: number
      clienteId: string | null
      status: string
      bloqueado: boolean
      motivo: string | null
      precoAlterado: boolean
      itens: ItemAssumido[]
    }
  | { ok: false; error: string }

type LinhaRpc = Record<string, unknown>

export async function enviarPedidoPalmImpl(input: {
  clientRequestId: string
  clienteId?: string | null
  itens: { produtoId: string; quantidade: number }[]
}): Promise<EnviarPalmResult> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('enviar_pedido_palm', {
    p_client_request_id: input.clientRequestId,
    p_itens: payloadEnvio(input.itens),
    p_cliente_id: input.clienteId ?? null,
  })
  if (error) return { ok: false, error: traduzirErroPalm(error.message, sessao.usuario.idioma) }
  const row = comoObjeto(data)
  if (!row?.id) return { ok: false, error: traduzirErroPalm('erro', sessao.usuario.idioma) }
  return {
    ok: true,
    id: String(row.id),
    numeroLocal: Number(row.numero_local ?? 0),
    status: String(row.status ?? 'EM_ESPERA'),
    idempotente: row.idempotente === true,
  }
}

export async function listarPedidosPalmDisponiveisImpl(): Promise<
  { ok: true; pedidos: PedidoPalmCard[] } | { ok: false; error: string }
> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('listar_pedidos_palm_disponiveis')
  if (error) return { ok: false, error: traduzirErroPalm(error.message, sessao.usuario.idioma) }
  return { ok: true, pedidos: comoLista(data).map(cardDisponivel) }
}

export async function listarMeusPedidosPalmImpl(): Promise<
  { ok: true; pedidos: MeuPedidoPalm[] } | { ok: false; error: string }
> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('listar_meus_pedidos_palm')
  if (error) return { ok: false, error: traduzirErroPalm(error.message, sessao.usuario.idioma) }
  return { ok: true, pedidos: comoLista(data).map(cardMeu) }
}

export async function assumirPedidoPalmImpl(id: string): Promise<AssumirPalmResult> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('assumir_pedido_palm', { p_id: id })
  if (error) return { ok: false, error: traduzirErroPalm(error.message, sessao.usuario.idioma) }
  const row = comoObjeto(data)
  if (!row?.id) return { ok: false, error: traduzirErroPalm('erro', sessao.usuario.idioma) }
  return {
    ok: true,
    id: String(row.id),
    numeroLocal: Number(row.numero_local ?? 0),
    clienteId: row.cliente_id ? String(row.cliente_id) : null,
    status: String(row.status ?? ''),
    bloqueado: row.bloqueado === true,
    motivo: row.motivo ? String(row.motivo) : null,
    precoAlterado: row.preco_alterado === true,
    itens: comoLista(row.itens) as unknown as ItemAssumido[],
  }
}

export async function cancelarPedidoPalmImpl(id: string, motivo: string): Promise<
  { ok: true; status: string } | { ok: false; error: string }
> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancelar_pedido_palm', { p_id: id, p_motivo: motivo })
  if (error) return { ok: false, error: traduzirErroPalm(error.message, sessao.usuario.idioma) }
  const row = comoObjeto(data)
  return { ok: true, status: String(row?.status ?? 'DESCARTADA') }
}

function comoObjeto(data: unknown): LinhaRpc | null {
  const parsed = typeof data === 'string' ? jsonSeguro(data) : data
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as LinhaRpc
  return null
}

function comoLista(data: unknown): LinhaRpc[] {
  const parsed = typeof data === 'string' ? jsonSeguro(data) : data
  return Array.isArray(parsed) ? (parsed as LinhaRpc[]) : []
}

function jsonSeguro(texto: string): unknown {
  try {
    return JSON.parse(texto) as unknown
  } catch {
    return null
  }
}

function cardDisponivel(row: LinhaRpc): PedidoPalmCard {
  return {
    id: String(row.id),
    numeroLocal: Number(row.numero_local ?? 0),
    qtdItens: Number(row.qtd_itens ?? 0),
    total: Number(row.total ?? 0),
    criadaEm: String(row.criada_em ?? ''),
    vendedorNome: row.vendedor_nome ? String(row.vendedor_nome) : null,
  }
}

function cardMeu(row: LinhaRpc): MeuPedidoPalm {
  return {
    id: String(row.id),
    numeroLocal: Number(row.numero_local ?? 0),
    status: String(row.status ?? ''),
    total: Number(row.total ?? 0),
    criadaEm: String(row.criada_em ?? ''),
    qtdItens: Number(row.qtd_itens ?? 0),
  }
}
