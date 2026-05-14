import { objectsToCsv } from '@/lib/csv'

/** Substitui `{{chave}}` em template (mesmo padrão usado em telas gerente). */
export function interpolateTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''))
}

/** Export CSV no browser (tabelas gerente). */
export function downloadCsvBrowser(
  filename: string,
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[],
): void {
  const csv = objectsToCsv(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
