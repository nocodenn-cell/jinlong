'use client'

import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
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
  /** Duplicar para criar: semeia o novo cadastro a partir deste produto. */
  duplicarDe?: ProdutoGerenteRow | null
  codigoBarrasInicial?: string | null
}>

/** Wrapper fino — create usa o mesmo ProdutoFormModal que editar. */
export function NovoProdutoModal({
  onCriado,
  idioma,
  codigoBarrasInicial,
  ...props
}: NovoProdutoModalProps) {
  return (
    <ProdutoFormModal
      {...props}
      produto={null}
      onSaved={onCriado}
      idioma={idioma}
      codigoBarrasInicial={codigoBarrasInicial}
    />
  )
}
