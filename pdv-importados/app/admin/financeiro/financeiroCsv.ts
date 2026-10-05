export function parseExtratoCsv(text: string): Record<string, string>[] {
 const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
 if (lines[0]?.trim().toLowerCase() !== 'referencia;data;descricao;valor') throw new Error('Cabeçalho esperado: referencia;data;descricao;valor')
 if (lines.length < 2 || lines.length > 501) throw new Error('Importe de 1 a 500 linhas por arquivo.')
 return lines.slice(1).map((line, index) => {
  const fields = line.split(';')
  if (fields.length !== 4) throw new Error(`Linha ${index + 2}: use quatro campos sem ponto e vírgula interno.`)
  const [referencia, data, descricao, raw] = fields.map(f => f.trim())
  const valor = raw.replace(',', '.')
  const date = new Date(`${data}T12:00:00Z`)
  if (!referencia || !descricao || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==data || !/^-?\d+(\.\d{1,2})?$/.test(valor) || !Number.isFinite(Number(valor)) || Number(valor) === 0) throw new Error(`Linha ${index + 2}: referência, data ou valor inválidos.`)
  return { referencia, data, descricao, valor }
 })
}

export function exportFinanceiroCsv(rows: Record<string, unknown>[]): string {
 if (!rows.length) return ''
 const keys = Object.keys(rows[0])
 const cell = (value: unknown) => {
  let s = String(value ?? '')
  if (/^[\t\r]/.test(s) || /^[\s]*[=+@]/.test(s) || /^[\s]*-\D/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
 }
 return [keys.join(';'), ...rows.map(r => keys.map(k => cell(r[k])).join(';'))].join('\r\n')
}
