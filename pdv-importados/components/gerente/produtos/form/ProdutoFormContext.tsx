'use client'

import { createContext, useContext } from 'react'
import type { ProdutoFormShellProps, ProdutoFormState } from './produtoForm.types'
import type { ProdutoFormErro } from './produtoForm.clientValidation'
import { FIN_IN, FIN_IN_MONO, FIN_SELECT } from './produtoFormStyles'

export type ProdutoFormContextValue = ProdutoFormShellProps &
  ProdutoFormState & {
    inputClassName: string
    inputMonoClassName: string
    selectClassName: string
    /** Campo reprovado na validação — a seção o marca e mostra a mensagem. */
    erro?: ProdutoFormErro | null
  }

const ProdutoFormContext = createContext<ProdutoFormContextValue | null>(null)

export function ProdutoFormProvider({
  value,
  children,
}: Readonly<{ value: ProdutoFormContextValue; children: React.ReactNode }>) {
  return <ProdutoFormContext.Provider value={value}>{children}</ProdutoFormContext.Provider>
}

export function useProdutoFormContext(): ProdutoFormContextValue {
  const ctx = useContext(ProdutoFormContext)
  if (!ctx) {
    throw new Error('useProdutoFormContext must be used within ProdutoFormProvider')
  }
  return ctx
}

export function defaultFieldClasses() {
  return {
    inputClassName: FIN_IN,
    inputMonoClassName: FIN_IN_MONO,
    selectClassName: FIN_SELECT,
  }
}
