/** Escape de célula CSV (RFC 4180). */
export function escapeCsvCell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function rowsToCsv(
  headers: string[],
  dataRows: (string | number | null | undefined)[][],
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...dataRows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}`
}

export function objectsToCsv<T extends Record<string, unknown>>(
  columns: { key: keyof T & string; header: string }[],
  rows: T[],
): string {
  const headers = columns.map((c) => c.header)
  const dataRows = rows.map((r) =>
    columns.map((c) => r[c.key] as string | number | null | undefined),
  )
  return rowsToCsv(headers, dataRows)
}
