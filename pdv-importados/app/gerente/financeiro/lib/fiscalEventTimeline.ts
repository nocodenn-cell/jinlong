import { formatDateTimeOrDash } from '@/lib/format/datetime'

/** Helpers puros para exibir payload de eventos fiscais na timeline (UI). */

export function labelFiscalEventoTipo(tipo: string): string {
  const map: Record<string, string> = {
    ENFILEIRADO: 'Enfileirado',
    REENFILEIRADO: 'Reenfileirado',
    CLAIM: 'Em processamento (claim)',
    ERRO: 'Erro',
    EMITIDO: 'Emitido',
    REPROCESSO_MANUAL: 'Reprocesso manual',
    CANCELADO: 'Cancelado',
  }
  return map[tipo] ?? tipo
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Linhas legíveis para eventos ERRO com diff opcional (payload do trigger/RPC). */
export function linhasDescricaoPayloadErro(payload: unknown, locale = 'pt-BR'): string[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const lines: string[] = []

  const ultimo = asStr(p.ultimo_erro)
  const ultimoAnt = asStr(p.ultimo_erro_anterior)
  if (ultimo != null && ultimo !== '') {
    if (ultimoAnt != null && ultimoAnt !== '' && ultimoAnt !== ultimo) {
      lines.push(`Mensagem: ${ultimoAnt} → ${ultimo}`)
    } else {
      lines.push(`Mensagem: ${ultimo}`)
    }
  }

  const code = asStr(p.fiscal_error_code)
  const codeAnt = asStr(p.fiscal_error_code_anterior)
  if (code != null && code !== '') {
    if (codeAnt != null && codeAnt !== '' && codeAnt !== code) {
      lines.push(`Código: ${codeAnt} → ${code}`)
    } else {
      lines.push(`Código: ${code}`)
    }
  }

  const cat = asStr(p.fiscal_error_category)
  const catAnt = asStr(p.fiscal_error_category_anterior)
  if (cat != null && cat !== '') {
    if (catAnt != null && catAnt !== '' && catAnt !== cat) {
      lines.push(`Categoria: ${catAnt} → ${cat}`)
    } else {
      lines.push(`Categoria: ${cat}`)
    }
  }

  const tent = p.tentativas
  if (typeof tent === 'number') lines.push(`Tentativas: ${tent}`)

  const prox = asStr(p.proxima_tentativa_em)
  if (prox) lines.push(`Próxima tentativa: ${formatDateTimeOrDash(prox, locale, 'medium')}`)

  return lines
}

export function linhasDescricaoPayloadGenerico(
  tipo: string,
  payload: unknown,
  locale = 'pt-BR',
): string[] {
  if (tipo === 'ERRO') return linhasDescricaoPayloadErro(payload, locale)
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  if (tipo === 'EMITIDO') {
    const out: string[] = []
    const chave = asStr(p.chave_fiscal)
    const proto = asStr(p.protocolo)
    if (chave) out.push(`Chave: ${chave}`)
    if (proto) out.push(`Protocolo: ${proto}`)
    return out
  }
  if (tipo === 'REPROCESSO_MANUAL') {
    const out: string[] = []
    const prev = asStr(p.ultimo_erro_prev)
    if (prev) out.push(`Erro anterior: ${prev}`)
    const c = asStr(p.fiscal_error_code_prev)
    if (c) out.push(`Código anterior: ${c}`)
    return out
  }
  if (tipo === 'REENFILEIRADO' || tipo === 'ENFILEIRADO') {
    const out: string[] = []
    const v = asStr(p.venda_id)
    const td = asStr(p.tipo_doc)
    if (v) out.push(`Venda: ${v}`)
    if (td) out.push(`Tipo: ${td}`)
    return out
  }
  return []
}
