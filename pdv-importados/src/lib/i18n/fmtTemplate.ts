/** Substitui `{{chave}}` em strings vindas dos JSON de i18n. */
export function fmtTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(vars[key] ?? ''),
  )
}
