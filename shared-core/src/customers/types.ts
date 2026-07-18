/**
 * Tipos de domínio — customers (cadastro satélite).
 * Sem I/O, sem React/Next. Alinhados ao contrato UI legado (limite_crediario).
 */

export type ClienteTipo = 'PF' | 'PJ'

/** Input de create/update — espelha o DTO usado pelas Server Actions. */
export type ClienteInput = {
  id?: string
  nome: string
  tipo: ClienteTipo
  /** Preferencialmente só dígitos; a policy normaliza com strip de não-dígitos. */
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
  limite_crediario: number
  termos_aceitos_em?: string | null
  consentimento_privacidade_em?: string | null
}

/** Linha de listagem / retorno pós-save (campos computados da view). */
export type ClienteListRow = {
  id: string
  nome: string
  tipo: ClienteTipo
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
  limite_crediario: number
  saldo_crediario: number
  ultima_compra: string | null
  criado_em: string | null
}
