import type { Mensagens } from '@/src/lib/i18n/getMessages'

/** Substitui {{chave}} em strings do JSON do caixa. */
export function caixaFmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(vars[key] ?? ''),
  )
}

export type CaixaMessages = Mensagens['caixa']
