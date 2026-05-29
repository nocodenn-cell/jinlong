type ExportColumn = { key: string; header: string }

/**
 * Exporta dados tabulares em arquivo XLSX no navegador.
 */
export async function downloadXlsx(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Relatorio')

  worksheet.addRow(columns.map((column) => column.header))
  for (const row of rows) {
    worksheet.addRow(columns.map((column) => row[column.key] ?? ''))
  }

  const header = worksheet.getRow(1)
  header.font = { bold: true }

  void workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  })
}
