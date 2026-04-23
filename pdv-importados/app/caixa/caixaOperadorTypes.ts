export type CaixaStatusOperadorResult =
  | {
      ok: true
      aberto: true
      caixaId: string
      dataAbertura: string
      valorInicial: number
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { ok: true; aberto: false }
  | { ok: false; error: string }

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
    }
  | { ok: false; error: string }
