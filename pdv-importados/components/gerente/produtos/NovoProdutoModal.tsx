'use client'

import type { OpcoesFiltrosProdutos } from '@/lib/gerente/produtos/opcoesFiltrosTypes'
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
  codigoBarrasInicial?: string | null
}>

/**
 * Wrapper fino do Cadastro Rápido (modal, sempre criação). Duplicar um
 * produto existente agora abre o Cadastro Completo pré-preenchido
 * (`/admin/catalogo/novo/completo?duplicarDe=<id>`), não este modal — ver
 * `docs/PLANO_CADASTRO_PRODUTO_UX.md` (v2), decisão "Duplicar → Completo".
 */
export function NovoProdutoModal({
  onCriado,
  idioma,
  codigoBarrasInicial,
  ...props
}: NovoProdutoModalProps) {
  return (
    <ProdutoFormModal
      {...props}
      onSaved={onCriado}
      idioma={idioma}
      codigoBarrasInicial={codigoBarrasInicial}
    />
  )
}
