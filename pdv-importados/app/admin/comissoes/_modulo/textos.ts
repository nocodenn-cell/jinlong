import type { Mensagens } from '@/i18n/getMessages'

/** Todas as chaves admin_ui.comissoes_* (pt-BR / zh-CN) para os componentes cliente do módulo. */
export function textosComissao(m: Mensagens): Record<string, string> {
  const ui = m.admin_ui as unknown as Record<string, string | undefined>
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(ui)) if (k.startsWith('comissoes_') && typeof v === 'string') out[k.slice('comissoes_'.length)] = v
  return out
}

export function competenciaAtual(agora = new Date()): string {
  const s = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return s.slice(0, 7)
}
