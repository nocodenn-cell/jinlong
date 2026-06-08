export type CaixaOperadorStatus = 'ABERTO' | 'FECHADO' | 'ERRO'

export type CaixaStatusOperadorResult =
  | {
      ok: true
      status: 'ABERTO'
      caixaId: string
      dataAbertura: string
      valorInicial: number
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { ok: true; status: 'FECHADO' }
  | { ok: false; status: 'ERRO'; error: string }

export type AbrirCaixaOperadorResult =
  | { ok: true; caixaId: string }
  | { ok: false; error: string }

export type FecharCaixaOperadorResult =
  | {
      ok: true
      caixaId: string
      valorSistemaDinheiro: number
      valorContado: number
      diferenca: number
      alreadyClosed?: boolean
    }
  | { ok: false; error: string }
