'use client'

import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { ProdutoFormModal } from './ProdutoFormModal'

export type ProdutosEditarCatalogoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  produto: ProdutoGerenteRow | null
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onSalvo: () => void
  idioma?: Idioma
}>

/** Wrapper fino — editar usa o mesmo ProdutoFormModal que create. */
export function ProdutosEditarCatalogoModal({
  open,
  onOpenChange,
  produto,
  m,
  opcoes,
  onSalvo,
  idioma,
}: ProdutosEditarCatalogoModalProps) {
  if (!open || !produto) return null

  return (
    <ProdutoFormModal
      open={open}
      onOpenChange={onOpenChange}
      m={m}
      opcoes={opcoes}
      produto={produto}
      onSaved={onSalvo}
      idioma={idioma}
    />
  )
}
