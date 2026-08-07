import { objectsToCsv } from '@/lib/csv'
import { downloadTextFile } from '@/lib/ui/downloadTextFile'

/** Substitui `{{chave}}` em template (mesmo padrão usado em telas gerente). */
export function interpolateTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''))
}

/**
 * Export CSV no browser (tabelas).
 * Delega a `downloadTextFile` (SSOT IX-EXPORT).
 */
export function downloadCsvBrowser(
  filename: string,
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[],
): void {
  const csv = objectsToCsv(columns, rows)
  downloadTextFile(filename, csv)
}
