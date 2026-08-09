/**
 * Formatação apenas de apresentação — não altera o valor persistido.
 */

export function maskDocumentoDisplay(d: string): string {
  const x = d.replace(/\D/g, '')
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d
}

/** Telefone BR comum; demais comprimentos ficam legíveis sem mascarar à força. */
export function maskTelefoneDisplay(t: string | null): string {
  if (!t) return '—'
  const x = t.replace(/\D/g, '')
  if (x.length === 0) return '—'
  if (x.length === 11) return x.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4')
  if (x.length === 10) return x.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  if (x.length === 12 && x.startsWith('55')) {
    return x.replace(/(\d{2})(\d{2})(\d{4})(\d{4})/, '+$1 ($2) $3-$4')
  }
  if (x.length === 13 && x.startsWith('55')) {
    return x.replace(/(\d{2})(\d{2})(\d{1})(\d{4})(\d{4})/, '+$1 ($2) $3 $4-$5')
  }
  return groupDigitsReadable(x)
}

function groupDigitsReadable(digits: string): string {
  return digits.replace(/(\d{2,4})(?=\d)/g, '$1 ').trim()
}

/**
 * Máscara de input (até 13 dígitos). Não trunca valores >11 já persistidos.
 * Persistência continua sendo só dígitos no submit do formulário.
 */
export function maskTelefoneInput(raw: string): string {
  const x = raw.replace(/\D/g, '').slice(0, 13)
  if (!x) return ''
  if (x.length < 10) {
    if (x.length <= 2) return `(${x}`
    if (x.length <= 6) return x.replace(/(\d{2})(\d{0,4})/, '($1) $2')
    return x.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  }
  const shown = maskTelefoneDisplay(x)
  return shown === '—' ? x : shown
}

export function clienteInitials(nome: string): string {
  return nome
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function formatContagemClientes(
  n: number,
  hasMore: boolean,
  labels: { um: string; muitos: string; mostrando: string; parcial: string },
): string {
  const label = n === 1 ? labels.um : labels.muitos
  const template = hasMore ? labels.parcial : labels.mostrando
  return template.replace('{{n}}', String(n)).replace('{{label}}', label)
}
