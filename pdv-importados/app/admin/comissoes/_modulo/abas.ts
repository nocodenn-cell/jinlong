import type { Mensagens } from '@/i18n/getMessages'
import type { AbaComissao } from './ComissoesModuloNav'

/** Rótulos das abas do módulo (pt-BR / zh-CN vêm do i18n). */
export function rotulosAbasComissao(m: Mensagens): Partial<Record<AbaComissao, string>> {
  const ui = m.admin_ui as unknown as Record<string, string | undefined>
  return {
    resumo: ui.comissoes_aba_resumo,
    regras: ui.comissoes_aba_regras,
    fechamento: ui.comissoes_aba_fechamento,
    relatorio: ui.comissoes_aba_relatorio,
    metas: ui.comissoes_aba_metas,
    falhas: ui.comissoes_aba_falhas,
  }
}
