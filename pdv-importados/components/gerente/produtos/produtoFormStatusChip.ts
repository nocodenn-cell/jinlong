import { isInativo, isRascunho } from '@/core/catalog/statusPublicacao'
import type { StatusPublicacao } from '@/core/ports/produto'
import type { Mensagens } from '@/i18n/getMessages'

export type ProdutoFormStatusChip = Readonly<{
  label: string
  hint: string
  tone: 'novo' | 'rascunho' | 'pdv' | 'inativo'
}>

export function resolveProdutoFormStatusChip(
  editando: boolean,
  status: StatusPublicacao | null | undefined,
  p: Mensagens['produtos'],
): ProdutoFormStatusChip {
  if (!editando) {
    return {
      label: p.status_chip_novo,
      hint: p.status_chip_hint_publica,
      tone: 'novo',
    }
  }
  if (isRascunho(status)) {
    return { label: p.rascunho, hint: p.status_chip_hint_rascunho, tone: 'rascunho' }
  }
  if (isInativo(status)) {
    return { label: p.inativo, hint: p.status_chip_hint_inativo, tone: 'inativo' }
  }
  return { label: p.status_chip_no_pdv, hint: p.status_chip_hint_publica, tone: 'pdv' }
}

const TONE_CLASS: Record<ProdutoFormStatusChip['tone'], string> = {
  novo: 'border-jl-accent/35 bg-jl-accent/10 text-jl-accent',
  rascunho: 'border-amber-400/40 bg-amber-400/10 text-amber-800',
  pdv: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800',
  inativo: 'border-jl-border-1 bg-jl-surface-soft text-jl-fg-3',
}

export function statusChipClassName(tone: ProdutoFormStatusChip['tone']): string {
  return TONE_CLASS[tone]
}
