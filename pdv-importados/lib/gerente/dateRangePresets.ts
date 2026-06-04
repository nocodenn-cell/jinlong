/**
 * Presets de intervalo de datas para os relatórios do gerente (achado #21 da
 * auditoria de front-end). Lógica pura — testável sem React e sem fuso horário
 * traiçoeiro: formatamos com as partes LOCAIS da data (getFullYear/Month/Date),
 * nunca toISOString(), que converte p/ UTC e desloca o dia perto da meia-noite
 * (Brasil = UTC-3).
 */

export type DateRangePreset =
  | 'hoje'
  | 'ontem'
  | '7d'
  | '30d'
  | 'esta_semana'
  | 'mes_atual'
  | 'mes_anterior'

export type DateRange = { de: string; ate: string }

/** Formata uma Date como `YYYY-MM-DD` usando as partes locais (sem drift de UTC). */
export function toLocalISODate(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Segunda-feira da semana de `d` (semana ISO: começa na segunda). */
function inicioSemana(d: Date): Date {
  const dow = d.getDay() // 0=dom … 6=sáb
  const recuo = (dow + 6) % 7 // dom→6, seg→0, ter→1 …
  return addDays(d, -recuo)
}

/**
 * Calcula `{de, ate}` (ambos inclusivos, `YYYY-MM-DD`) para um preset.
 * `hoje` default = data atual; injetável para testes determinísticos.
 */
export function computeDateRange(preset: DateRangePreset, hoje: Date = new Date()): DateRange {
  switch (preset) {
    case 'hoje':
      return { de: toLocalISODate(hoje), ate: toLocalISODate(hoje) }
    case 'ontem': {
      const ontem = addDays(hoje, -1)
      return { de: toLocalISODate(ontem), ate: toLocalISODate(ontem) }
    }
    case '7d':
      return { de: toLocalISODate(addDays(hoje, -6)), ate: toLocalISODate(hoje) }
    case '30d':
      return { de: toLocalISODate(addDays(hoje, -29)), ate: toLocalISODate(hoje) }
    case 'esta_semana':
      return { de: toLocalISODate(inicioSemana(hoje)), ate: toLocalISODate(hoje) }
    case 'mes_atual': {
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      return { de: toLocalISODate(primeiro), ate: toLocalISODate(hoje) }
    }
    case 'mes_anterior': {
      const primeiroEste = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const ultimoAnterior = addDays(primeiroEste, -1)
      const primeiroAnterior = new Date(ultimoAnterior.getFullYear(), ultimoAnterior.getMonth(), 1)
      return { de: toLocalISODate(primeiroAnterior), ate: toLocalISODate(ultimoAnterior) }
    }
  }
}

/**
 * Dado um intervalo `{de, ate}`, retorna o preset que o gerou (para destacar o
 * chip ativo) ou `null` quando é um intervalo personalizado.
 */
export function matchDateRangePreset(range: DateRange, hoje: Date = new Date()): DateRangePreset | null {
  const presets: DateRangePreset[] = ['hoje', 'ontem', '7d', '30d', 'esta_semana', 'mes_atual', 'mes_anterior']
  for (const p of presets) {
    const r = computeDateRange(p, hoje)
    if (r.de === range.de && r.ate === range.ate) return p
  }
  return null
}
