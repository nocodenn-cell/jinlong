import type { Mensagens } from '@/i18n/getMessages'
import { formatBRL, formatDecimalPlaces } from '@/lib/format/money'
import type { DashboardAtividadeRecente } from '@/lib/gerente/dashboardResumoTypes'

type DashboardInicio = Mensagens['gerente']['dashboard_inicio']

/** Substitui `{{chave}}` em modelo i18n por valores (seguro para HTML escapado pelo React como texto). */
export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : '',
  )
}

function rotuloTipoCaixa(di: DashboardInicio, raw: string): string {
  const k = String(raw ?? '').toLowerCase()
  if (k === 'suprimento') return di.caixa_suprimento
  if (k === 'sangria') return di.caixa_sangria
  if (k === 'estorno') return di.caixa_estorno
  return raw
}

/**
 * Monta a linha exibida no feed de atividades a partir do payload estruturado
 * da RPC (migration 080+) ou do texto legado (`descricao`).
 */
export function formatLinhaAtividade(
  di: DashboardInicio,
  locale: string,
  atividade: DashboardAtividadeRecente,
): string {
  if (atividade.descricao && !atividade.payload) {
    return atividade.descricao
  }

  const p = atividade.payload
  if (!p) {
    return atividade.descricao ?? '—'
  }

  if (atividade.tipo === 'VENDA') {
    const v = Number(p.total_liquido ?? 0)
    return interpolateTemplate(di.atividade_venda, {
      valor: formatBRL(v, locale),
    })
  }

  if (atividade.tipo === 'ESTOQUE') {
    const tipoCodigo = String(p.tipo_codigo ?? '')
    const rotulo =
      p.tipo_rotulo !== null && p.tipo_rotulo !== undefined && String(p.tipo_rotulo).length > 0
        ? String(p.tipo_rotulo)
        : tipoCodigo
    const produto =
      String(p.produto_nome ?? '').trim().length > 0 ? String(p.produto_nome) : di.produto_sem_nome
    const q = Number(p.quantidade_delta ?? 0)
    const deltaStr = (q >= 0 ? '+' : '') + formatDecimalPlaces(q, 3)
    return interpolateTemplate(di.atividade_estoque, {
      tipo: rotulo,
      produto,
      delta: deltaStr,
    })
  }

  if (atividade.tipo === 'CAIXA') {
    const valorNum = Number(p.valor ?? 0)
    const motivoRaw = p.motivo
    const motivo =
      motivoRaw !== null &&
      motivoRaw !== undefined &&
      typeof motivoRaw === 'string' &&
      motivoRaw.trim().length > 0
        ? di.atividade_caixa_motivo_sep + motivoRaw.trim()
        : ''
    return interpolateTemplate(di.atividade_caixa, {
      tipo: rotuloTipoCaixa(di, String(p.tipo_movimento ?? '')),
      valor: formatBRL(valorNum, locale),
      motivo,
    })
  }

  return atividade.descricao ?? '—'
}
