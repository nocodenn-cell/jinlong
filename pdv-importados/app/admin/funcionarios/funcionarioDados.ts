/**
 * Dados complementares (opcionais) de funcionários — validação pura, sem I/O.
 * Persistidos em public.funcionario_dados (migration 20261021190000), RLS só DONO/GERENTE da empresa.
 */

export type FuncionarioDados = {
  telefone: string | null
  cpf: string | null
  cargo: string | null
  data_admissao: string | null
  observacoes: string | null
}

export const FUNCIONARIO_DADOS_VAZIO: FuncionarioDados = {
  telefone: null,
  cpf: null,
  cargo: null,
  data_admissao: null,
  observacoes: null,
}

export function somenteDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

/** CPF válido: 11 dígitos, não repetidos, dígitos verificadores corretos. */
export function cpfValido(raw: string): boolean {
  const d = somenteDigitos(raw)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (len: number) => {
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function formatarCpf(raw: string): string {
  const d = somenteDigitos(raw).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

/** Máscara para listagens: ***.456.789-** */
export function mascararCpf(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = somenteDigitos(raw)
  if (d.length !== 11) return null
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/** Telefone/WhatsApp: guarda só dígitos (e + inicial). 10–13 dígitos (BR com/sem 55). */
export function normalizarTelefone(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const d = somenteDigitos(t)
  if (d.length < 10 || d.length > 13) return null
  return t.startsWith('+') ? `+${d}` : d
}

export function formatarTelefone(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = somenteDigitos(raw)
  const local = d.length > 11 && d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return raw
}

export type DadosEntrada = {
  telefone?: string
  cpf?: string
  cargo?: string
  data_admissao?: string
  observacoes?: string
}

export type DadosErro = 'telefone' | 'cpf' | 'cargo' | 'data_admissao' | 'observacoes'

/** Normaliza entrada do formulário. Campos vazios viram null. */
export function normalizarDados(
  input: DadosEntrada | undefined,
  hoje: Date = new Date(),
): { ok: true; data: FuncionarioDados } | { ok: false; campo: DadosErro } {
  if (!input) return { ok: true, data: { ...FUNCIONARIO_DADOS_VAZIO } }
  const tel = (input.telefone ?? '').trim()
  const telefone = tel ? normalizarTelefone(tel) : null
  if (tel && !telefone) return { ok: false, campo: 'telefone' }

  const cpfRaw = (input.cpf ?? '').trim()
  if (cpfRaw && !cpfValido(cpfRaw)) return { ok: false, campo: 'cpf' }
  const cpf = cpfRaw ? somenteDigitos(cpfRaw) : null

  const cargo = (input.cargo ?? '').trim() || null
  if (cargo && cargo.length > 80) return { ok: false, campo: 'cargo' }

  const dataRaw = (input.data_admissao ?? '').trim()
  let data_admissao: string | null = null
  if (dataRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataRaw)
    const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
    const valida = !!dt && dt.toISOString().slice(0, 10) === dataRaw && +m![1] >= 1950
    const limite = new Date(hoje.getTime() + 366 * 86400000)
    if (!valida || dt! > limite) return { ok: false, campo: 'data_admissao' }
    data_admissao = dataRaw
  }

  const observacoes = (input.observacoes ?? '').trim() || null
  if (observacoes && observacoes.length > 1000) return { ok: false, campo: 'observacoes' }

  return { ok: true, data: { telefone, cpf, cargo, data_admissao, observacoes } }
}

export function temAlgumDado(d: FuncionarioDados): boolean {
  return Object.values(d).some((v) => v != null && v !== '')
}
