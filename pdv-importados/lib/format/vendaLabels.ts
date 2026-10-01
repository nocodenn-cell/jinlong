import type { Mensagens } from '@/i18n/getMessages'

/** Rotula forma de pagamento persistida como código (ex.: DINHEIRO) para o idioma atual. */
export function labelFormaPagamentoVenda(
  raw: string | null | undefined,
  m: Mensagens,
): string {
  const c = String(raw ?? '').trim().toUpperCase()
  switch (c) {
    case 'DINHEIRO':
      return m.gerente.pagamento_dinheiro
    case 'PIX':
      return m.gerente.pagamento_pix
    case 'CARTAO_DEBITO':
      return m.gerente.forma_cartao_debito
    case 'CARTAO_CREDITO':
      return m.gerente.forma_cartao_credito
    case 'CARTAO':
      return m.gerente.pagamento_cartao
    case 'OUTROS':
    case 'OUTRO':
      return m.gerente.forma_outros
    case 'FIADO':
      return m.gerente.forma_fiado_historico
    default:
      return raw && String(raw).trim() ? String(raw).trim() : '—'
  }
}

/** Rotula status de venda persistido como código (ex.: CONCLUIDA). */
export function labelStatusVenda(raw: string | null | undefined, m: Mensagens): string {
  const c = String(raw ?? '').trim().toUpperCase()
  switch (c) {
    case 'CONCLUIDA':
      return m.gerente.venda_status_concluida
    case 'CANCELADA':
      return m.gerente.venda_status_cancelada
    default:
      return raw && String(raw).trim() ? String(raw).trim() : '—'
  }
}

/** Texto legível para um código desconhecido: `ENTRADA_REMESSA_LOJA` → "Entrada remessa loja". */
export function humanizarCodigo(raw: string): string {
  const t = raw.trim().replace(/_/g, ' ').toLowerCase()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

/** `vendas.tipo_venda` (COM_NF / SEM_NF). */
export function labelTipoVenda(raw: string | null | undefined, m: Mensagens): string {
  const c = String(raw ?? '').trim().toUpperCase()
  if (c === 'COM_NF') return m.gerente.enum_tipo_venda_com_nf
  if (c === 'SEM_NF') return m.gerente.enum_tipo_venda_sem_nf
  return c ? humanizarCodigo(c) : '—'
}

/**
 * Tipos de movimento de estoque (`tipo_codigo` do Kardex/auditoria). Cobre os códigos reais gravados
 * pelo banco (SAIDA_VENDA, ENTRADA_DEVOLUCAO_CLIENTE…) e os genéricos usados pelas telas (VENDA, AJUSTE…).
 * Fonte única: Kardex (Estoque/Auditoria/Relatórios) e qualquer tela que exiba o tipo.
 */
export function tipoMovimentoEstoqueLabels(m: Mensagens): Record<string, string> {
  const g = m.gerente
  const ui = m.admin_ui
  return {
    SAIDA_VENDA: g.enum_mov_saida_venda,
    ENTRADA_DEVOLUCAO_CLIENTE: g.enum_mov_entrada_devolucao_cliente,
    ENTRADA_CANCELAMENTO_VENDA: g.enum_mov_entrada_cancelamento_venda,
    ENTRADA_NFE: g.enum_mov_entrada_nfe,
    ENTRADA_OC: g.enum_mov_entrada_oc,
    ENTRADA_AJUSTE: g.enum_mov_entrada_ajuste,
    SAIDA_AJUSTE: g.enum_mov_saida_ajuste,
    SAIDA_AVARIA: g.enum_mov_saida_avaria,
    TRANSFERENCIA_ENTRADA: g.enum_mov_transferencia_entrada,
    TRANSFERENCIA_SAIDA: g.enum_mov_transferencia_saida,
    ENTRADA_REMESSA_LOJA: g.enum_mov_entrada_remessa_loja,
    PERDA: g.enum_mov_perda,
    QUEBRA: g.enum_mov_quebra,
    VENDA: ui.estoque_tipo_venda,
    COMPRA: ui.estoque_tipo_compra,
    ENTRADA_NF: ui.estoque_tipo_entrada_nf,
    ENTRADA: ui.estoque_tipo_entrada,
    SAIDA: ui.estoque_tipo_saida,
    AJUSTE: ui.estoque_tipo_ajuste,
    ACERTO_INVENTARIO: m.estoque.motivo_acerto_inventario,
    DEVOLUCAO: ui.estoque_tipo_devolucao,
    TRANSFERENCIA: ui.estoque_tipo_transferencia,
    OUTRO: m.estoque.motivo_outro,
  }
}

export function labelTipoMovimentoEstoque(raw: string | null | undefined, m: Mensagens): string {
  const c = String(raw ?? '').trim().toUpperCase()
  if (!c) return '—'
  return tipoMovimentoEstoqueLabels(m)[c] ?? humanizarCodigo(c)
}

/** Status operacionais genéricos (remessa, documento fiscal, OC…). Vendas usam `labelStatusVenda`. */
export function labelStatusOperacional(raw: string | null | undefined, m: Mensagens): string {
  const c = String(raw ?? '').trim().toUpperCase()
  if (!c) return '—'
  const g = m.gerente
  const mapa: Record<string, string> = {
    CONCLUIDA: g.venda_status_concluida,
    CANCELADA: g.venda_status_cancelada,
    RASCUNHO: g.enum_status_rascunho,
    PENDENTE: g.enum_status_pendente,
    PROCESSANDO: g.enum_status_processando,
    EMITIDO: g.enum_status_emitido,
    ERRO: g.enum_status_erro,
    ABERTO: g.enum_status_aberto,
    FECHADO: g.enum_status_fechado,
    ATIVO: g.enum_status_ativo,
    INATIVO: g.enum_status_inativo,
    CONFIRMADA: g.enum_status_confirmada,
    RECEBIDA: g.enum_status_recebida,
  }
  return mapa[c] ?? humanizarCodigo(c)
}
