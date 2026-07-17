import { formatDateTimeOrDash } from '@/lib/format/datetime'
import type { Mensagens } from '@/i18n/getMessages'

/** Helpers puros para exibir payload de eventos fiscais na timeline (UI). */

export function labelFiscalEventoTipo(tipo: string, m: Mensagens): string {
  const ui = m.admin_ui
  const map: Record<string, string> = {
    ENFILEIRADO: ui.financeiro_evento_enfileirado,
    REENFILEIRADO: ui.financeiro_evento_reenfileirado,
    CLAIM: ui.financeiro_evento_claim,
    ERRO: ui.financeiro_evento_erro,
    EMITIDO: ui.financeiro_evento_emitido,
    REPROCESSO_MANUAL: ui.financeiro_evento_reprocesso_manual,
    CANCELADO: ui.financeiro_evento_cancelado,
  }
  return map[tipo] ?? tipo
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v, null, 0)
  } catch {
    return String(v)
  }
}

/** Linhas legíveis para eventos ERRO com diff opcional (payload do trigger/RPC). */
export function linhasDescricaoPayloadErro(payload: unknown, m: Mensagens, locale = 'pt-BR'): string[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const ui = m.admin_ui
  const lines: string[] = []

  const ultimo = asStr(p.ultimo_erro)
  const ultimoAnt = asStr(p.ultimo_erro_anterior)
  if (ultimo != null && ultimo !== '') {
    if (ultimoAnt != null && ultimoAnt !== '' && ultimoAnt !== ultimo) {
      lines.push(`${ui.financeiro_evento_campo_mensagem}: ${ultimoAnt} → ${ultimo}`)
    } else {
      lines.push(`${ui.financeiro_evento_campo_mensagem}: ${ultimo}`)
    }
  }

  const code = asStr(p.fiscal_error_code)
  const codeAnt = asStr(p.fiscal_error_code_anterior)
  if (code != null && code !== '') {
    if (codeAnt != null && codeAnt !== '' && codeAnt !== code) {
      lines.push(`${ui.financeiro_evento_campo_codigo}: ${codeAnt} → ${code}`)
    } else {
      lines.push(`${ui.financeiro_evento_campo_codigo}: ${code}`)
    }
  }

  const cat = asStr(p.fiscal_error_category)
  const catAnt = asStr(p.fiscal_error_category_anterior)
  if (cat != null && cat !== '') {
    if (catAnt != null && catAnt !== '' && catAnt !== cat) {
      lines.push(`${ui.financeiro_evento_campo_categoria}: ${catAnt} → ${cat}`)
    } else {
      lines.push(`${ui.financeiro_evento_campo_categoria}: ${cat}`)
    }
  }

  const tent = p.tentativas
  if (typeof tent === 'number') lines.push(`${ui.financeiro_evento_campo_tentativas}: ${tent}`)

  const prox = asStr(p.proxima_tentativa_em)
  if (prox) lines.push(`${ui.financeiro_evento_campo_proxima_tentativa}: ${formatDateTimeOrDash(prox, locale, 'medium')}`)

  return lines
}

export function linhasDescricaoPayloadGenerico(
  tipo: string,
  payload: unknown,
  m: Mensagens,
  locale = 'pt-BR',
): string[] {
  if (tipo === 'ERRO') return linhasDescricaoPayloadErro(payload, m, locale)
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const ui = m.admin_ui
  if (tipo === 'EMITIDO') {
    const out: string[] = []
    const chave = asStr(p.chave_fiscal)
    const proto = asStr(p.protocolo)
    if (chave) out.push(`${ui.financeiro_evento_campo_chave}: ${chave}`)
    if (proto) out.push(`${ui.financeiro_evento_campo_protocolo}: ${proto}`)
    return out
  }
  if (tipo === 'REPROCESSO_MANUAL') {
    const out: string[] = []
    const prev = asStr(p.ultimo_erro_prev)
    if (prev) out.push(`${ui.financeiro_evento_campo_erro_anterior}: ${prev}`)
    const c = asStr(p.fiscal_error_code_prev)
    if (c) out.push(`${ui.financeiro_evento_campo_codigo_anterior}: ${c}`)
    return out
  }
  if (tipo === 'REENFILEIRADO' || tipo === 'ENFILEIRADO') {
    const out: string[] = []
    const v = asStr(p.venda_id)
    const td = asStr(p.tipo_doc)
    if (v) out.push(`${ui.financeiro_evento_campo_venda}: ${v}`)
    if (td) out.push(`${ui.financeiro_evento_campo_tipo}: ${td}`)
    return out
  }
  return []
}
