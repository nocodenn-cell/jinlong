import type { Mensagens } from '@/i18n/getMessages'
import { objectsToCsv } from '@/lib/csv'

export function getAvisoPeriodo(
  aviso: 'nenhum' | 'datas_invalidas' | 'periodo_invertido' | 'periodo_limitado' | undefined,
  m: Mensagens,
) {
  if (aviso === 'datas_invalidas') return m.relatorios.aviso_datas_invalidas
  if (aviso === 'periodo_invertido') return m.relatorios.aviso_periodo_invertido
  if (aviso === 'periodo_limitado') return m.relatorios.aviso_periodo_limitado
  return null
}

export function downloadCsv(
  filename: string,
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[],
) {
  const csv = objectsToCsv(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
