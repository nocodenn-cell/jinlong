'use client'

import type { ProdutoFormCampoErro, ProdutoFormErro } from './produtoForm.clientValidation'

/** Mensagem do campo, ou null quando o erro atual é de outro campo. */
export function erroDoCampo(
  erro: ProdutoFormErro | null | undefined,
  campo: ProdutoFormCampoErro,
): string | null {
  return erro && erro.campo === campo ? erro.mensagem : null
}

/**
 * Borda de reprovação — some assim que o operador corrige o valor.
 * Usa `--color-danger-strong` (não o `--color-danger-border` a 35% alfa que
 * banners/badges usam sobre `--color-danger-bg`): aqui a borda fica sobre o
 * fundo neutro do input, sem o fundo tênue por trás, e a 35% ficava fraca
 * demais pra servir de sinal visual por si só.
 */
export const CAMPO_INVALIDO_CLASS = '!border-[var(--color-danger-strong)] ring-1 ring-[var(--color-danger-border)]'

/** Mensagem inline sob o campo. Vazia não renderiza nada. */
export function CampoErroMsg({ mensagem }: Readonly<{ mensagem: string | null }>) {
  if (!mensagem) return null
  return (
    <span
      role="alert"
      className="mt-1 block text-caption font-semibold text-[var(--color-danger-strong)]"
    >
      {mensagem}
    </span>
  )
}
