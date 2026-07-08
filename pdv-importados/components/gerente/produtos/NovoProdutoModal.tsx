'use client'

import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { ProdutoFormModal } from './ProdutoFormModal'

export type NovoProdutoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onCriado: () => void
  idioma?: Idioma
}>

/** Wrapper fino — create usa o mesmo ProdutoFormModal que editar. */
export function NovoProdutoModal({ onCriado, idioma, ...props }: NovoProdutoModalProps) {
  return (
    <ProdutoFormModal
      {...props}
      produto={null}
      onSaved={onCriado}
      idioma={idioma}
    />
  )
}
