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

import type { FechamentoFormaLinha } from '@/app/caixa/fechamentoPorFormaTypes'

export type FecharCaixaOperadorResult =
  | {
      ok: true
      caixaId: string
      valorSistemaDinheiro: number
      valorContado: number
      diferenca: number
      alreadyClosed?: boolean
      /** Snapshot por forma; null = falha de leitura (nunca tratar como lista vazia/zero). */
      formas: FechamentoFormaLinha[] | null
      formasError: string | null
    }
  | { ok: false; error: string }
