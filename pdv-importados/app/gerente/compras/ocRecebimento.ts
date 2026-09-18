/**
 * UX-04 — regras PURAS do recebimento parcial de Ordem de Compra (sem I/O).
 *
 * A fonte da verdade continua sendo o banco (`receber_ordem_compra`,
 * `encerrar_ordem_compra_com_falta`, razão `ordens_compra_recebimentos`). Este módulo só:
 *  - deriva o SALDO a partir de pedido/recebido (não existe status "parcial" armazenado);
 *  - traduz os códigos `OC_*` das RPCs em mensagens de operador;
 *  - descreve o estado do pedido depois de uma entrada.
 * Nenhuma regra de negócio nasce aqui: a UI só reflete o que o banco decide.
 */

export type OcResumoRecebimento = {
  oc_id: string
  status: string
  pedido_total: number
  recebido_total: number
  pendente_total: number
  itens_pendentes: number
  encerrada: boolean
  encerrada_com_falta: boolean
}

export type OcEntradaResultado = OcResumoRecebimento & {
  replay: boolean
  entrada_id: string | null
  /** Quantidade que ESTA chamada creditou (0 no replay). */
  quantidade_creditada: number
}

/** Arredonda a 3 casas (mesma precisão de `quantidade`), evitando 0.1+0.2 no saldo. */
function arred3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Quanto ainda falta chegar de uma linha. Nunca negativo (legado pode ter recebido a mais). */
export function saldoPendente(quantidade: number, recebida: number): number {
  return Math.max(arred3(quantidade - recebida), 0)
}

export type ItemSaldo = { quantidade: number; quantidade_recebida: number }

export function totaisRecebimento(itens: readonly ItemSaldo[]): {
  pedido_total: number
  recebido_total: number
  pendente_total: number
  itens_pendentes: number
} {
  let pedido = 0
  let recebido = 0
  let pendente = 0
  let itensPendentes = 0
  for (const i of itens) {
    pedido += i.quantidade
    recebido += i.quantidade_recebida
    const s = saldoPendente(i.quantidade, i.quantidade_recebida)
    pendente += s
    if (s > 0) itensPendentes += 1
  }
  return {
    pedido_total: arred3(pedido),
    recebido_total: arred3(recebido),
    pendente_total: arred3(pendente),
    itens_pendentes: itensPendentes,
  }
}

/** Valor ainda "em trânsito" = só o que falta chegar (pendente × preço), nunca o pedido cheio. */
export function valorPendente(itens: ReadonlyArray<ItemSaldo & { preco_unitario: number }>): number {
  return itens.reduce(
    (s, i) => s + saldoPendente(i.quantidade, i.quantidade_recebida) * i.preco_unitario,
    0,
  )
}

export type SituacaoRecebimento = 'NADA_RECEBIDO' | 'PARCIAL' | 'COMPLETO' | 'ENCERRADO_COM_FALTA'

/** Situação de recebimento derivada das quantidades — não é (nem vira) um status do banco. */
export function situacaoRecebimento(input: {
  status: string
  encerrada_com_falta: boolean
  recebido_total: number
  pendente_total: number
}): SituacaoRecebimento {
  if (input.encerrada_com_falta) return 'ENCERRADO_COM_FALTA'
  if (input.recebido_total > 0 && input.pendente_total <= 0) return 'COMPLETO'
  if (input.recebido_total > 0) return 'PARCIAL'
  return 'NADA_RECEBIDO'
}

/** Pedido ainda pode receber mercadoria (a RPC confirma; aqui só decide se a UI oferece a ação). */
export function ocAceitaRecebimento(status: string, pendenteTotal: number): boolean {
  return (status === 'EM_TRANSITO' || status === 'CONFIRMADA') && pendenteTotal > 0
}

/** "Encerrar com falta" só faz sentido com algo já recebido e algo ainda pendente. */
export function ocPodeEncerrarComFalta(input: {
  status: string
  recebido_total: number
  pendente_total: number
}): boolean {
  return (
    (input.status === 'EM_TRANSITO' || input.status === 'CONFIRMADA') &&
    input.recebido_total > 0 &&
    input.pendente_total > 0
  )
}

/** Cancelar só quando NADA foi recebido — depois disso o caminho é "encerrar com falta". */
export function ocPodeCancelar(input: { status: string; recebido_total: number }): boolean {
  return (
    ['RASCUNHO', 'CONFIRMADA', 'EM_TRANSITO'].includes(input.status) && input.recebido_total <= 0
  )
}

export function fmtQtd(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/**
 * Traduz o erro de uma RPC do fluxo de OC. Retorna `null` quando a mensagem não é de OC
 * (o chamador cai no tradutor genérico).
 */
export function mensagemErroOc(raw: string): string | null {
  const m = raw ?? ''
  if (!/OC_[A-Z_]+/.test(m)) return null

  if (m.includes('OC_QTD_ACIMA_SALDO')) {
    const saldo = /OC_QTD_ACIMA_SALDO:[^:\s]+:(-?[\d.]+)/.exec(m)?.[1]
    const faltam = saldo !== undefined ? ` Faltam ${fmtQtd(Number(saldo))} unidades.` : ''
    return `A quantidade informada é maior do que ainda falta receber deste pedido.${faltam} Nada foi lançado no estoque. Atualize a tela e confira o saldo.`
  }
  if (m.includes('OC_STATUS_INVALIDO')) {
    return 'Este pedido não está mais aberto para recebimento (já foi encerrado ou cancelado). Atualize a tela. Nada foi lançado no estoque.'
  }
  if (m.includes('OC_ENTRADA_VAZIA')) {
    return 'Informe a quantidade que chegou em pelo menos um item.'
  }
  if (m.includes('OC_QTD_INVALIDA') || m.includes('OC_ITEM_INVALIDO') || m.includes('OC_ITENS_INVALIDOS')) {
    return 'Quantidade inválida. Use números maiores ou iguais a zero.'
  }
  if (m.includes('OC_ITEM_DUPLICADO')) {
    return 'O mesmo item do pedido foi enviado duas vezes. Atualize a tela e tente de novo.'
  }
  if (m.includes('OC_ITEM_NAO_ENCONTRADO')) {
    return 'Um dos itens não pertence a este pedido. Atualize a tela e tente de novo.'
  }
  if (m.includes('OC_IDEMPOTENCY_PAYLOAD_DIVERGENTE')) {
    return 'Esta tentativa de recebimento já foi registrada com outras quantidades. Atualize a tela para ver o saldo atual antes de lançar de novo.'
  }
  if (m.includes('OC_IDEMPOTENCY_KEY')) {
    return 'Não foi possível identificar esta tentativa de recebimento. Atualize a tela e tente de novo.'
  }
  if (m.includes('OC_PRODUTO_FORA_DO_PEDIDO')) {
    return 'Um dos produtos da entrada não faz parte do pedido escolhido. Escolha outro pedido ou lance a entrada sem pedido.'
  }
  if (m.includes('OC_MOTIVO_OBRIGATORIO')) {
    return 'Informe o motivo do encerramento (mínimo de 5 caracteres).'
  }
  if (m.includes('OC_SEM_RECEBIMENTO')) {
    return 'Este pedido ainda não recebeu nada. Para desistir dele, use "Cancelar pedido".'
  }
  if (m.includes('OC_JA_COMPLETA')) {
    return 'Este pedido já foi recebido por completo — não há falta a registrar.'
  }
  if (m.includes('OC_CANCELAR_COM_RECEBIMENTO')) {
    return 'Este pedido já recebeu mercadoria e não pode ser cancelado. Use "Encerrar com falta".'
  }
  if (m.includes('OC_RECEBIDA_SOMENTE_VIA_RPC') || m.includes('OC_RECEBIDO_SOMENTE_VIA_RPC')) {
    return 'O recebimento do pedido só pode ser registrado pela ação "Registrar recebimento".'
  }
  if (m.includes('OC_NAO_ENCONTRADA')) return 'Pedido não encontrado.'
  if (m.includes('OC_LOJA')) return 'Este pedido pertence a outra loja.'
  if (m.includes('OC_PERFIL') || m.includes('OC_AUTH')) {
    return 'Você não tem permissão para registrar recebimento de pedidos.'
  }
  return null
}

function tpl(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
}

/**
 * Mesmo texto de `mensagemPosEntradaOc`, montado a partir de templates i18n (`compras.pos_entrada_*`
 * e `compras.resumo_completo`) — para a UI mostrar no idioma da sessão.
 */
export function textoPosEntrada(
  t: { estoque: string; parcial: string; completo: string },
  r: Pick<OcResumoRecebimento, 'pedido_total' | 'recebido_total' | 'pendente_total' | 'encerrada'>,
  creditado: number,
): string {
  const entrou = tpl(t.estoque, { n: fmtQtd(creditado) })
  if (r.encerrada) return `${entrou} ${t.completo}`
  return `${entrou} ${tpl(t.parcial, {
    recebido: fmtQtd(r.recebido_total),
    pedido: fmtQtd(r.pedido_total),
    n: fmtQtd(r.pendente_total),
  })}`
}

/**
 * Texto operacional depois de uma entrada vinculada ao pedido: o que entrou no estoque,
 * quanto falta e se o pedido fechou. Substitui a mensagem genérica "recebimento registrado".
 */
export function mensagemPosEntradaOc(
  r: Pick<
    OcResumoRecebimento,
    'pedido_total' | 'recebido_total' | 'pendente_total' | 'encerrada' | 'encerrada_com_falta'
  >,
  creditado: number,
): string {
  const entrou = `Estoque atualizado: +${fmtQtd(creditado)}.`
  if (r.encerrada) {
    return `${entrou} Pedido totalmente recebido.`
  }
  return `${entrou} Pedido: ${fmtQtd(r.recebido_total)} de ${fmtQtd(r.pedido_total)} recebidas. Faltam ${fmtQtd(r.pendente_total)} unidades.`
}
