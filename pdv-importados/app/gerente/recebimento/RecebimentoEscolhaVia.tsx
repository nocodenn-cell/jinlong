'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViaRecebimento = 'NFE' | 'ORDEM_COMPRA' | 'SEM_DOCUMENTO' | 'FISICA' | 'HISTORICO'

export type ViaOpcao = {
  id: ViaRecebimento
  titulo: string
  ajuda: string
  icon: LucideIcon
}

type Props = {
  pergunta: string
  ajuda: string
  opcoes: readonly ViaOpcao[]
  disabled?: boolean
  onEscolher: (via: ViaRecebimento) => void
}

export function viaRecebimentoFromModo(modo: string | null): ViaRecebimento | null {
  if (modo === 'pedido') return 'ORDEM_COMPRA'
  if (modo === 'nfe') return 'NFE'
  if (modo === 'historico') return 'HISTORICO'
  if (modo === 'fisica') return 'FISICA'
  if (modo === 'manual' || modo === 'sem-documento') return 'SEM_DOCUMENTO'
  return null
}

export function RecebimentoEscolhaVia({ pergunta, ajuda, opcoes, disabled, onEscolher }: Props) {
  return (
    <div data-testid="rec-como-chegou">
      <h2 className="text-title font-semibold text-fg">{pergunta}</h2>
      <p className="mt-1 max-w-2xl text-body text-fg-subtle">{ajuda}</p>
      <div role="group" aria-label={pergunta} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {opcoes.map((opcao) => (
          <ViaCard key={opcao.id} opcao={opcao} disabled={disabled} onEscolher={onEscolher} />
        ))}
      </div>
    </div>
  )
}

function ViaCard({
  opcao,
  disabled,
  onEscolher,
}: {
  opcao: ViaOpcao
  disabled?: boolean
  onEscolher: (via: ViaRecebimento) => void
}) {
  const Icon = opcao.icon
  return (
    <button
      type="button"
      data-via={opcao.id}
      aria-pressed={false}
      disabled={disabled}
      onClick={() => onEscolher(opcao.id)}
      className={cn(
        'fp-focus-ring flex min-h-28 flex-col items-start gap-1 rounded-xl border border-[var(--color-border)]',
        'bg-[var(--color-surface)] p-4 text-left transition-colors',
        'hover:border-brand/40 hover:bg-[var(--color-surface-soft)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <Icon className="h-5 w-5 text-brand" aria-hidden />
      <span className="text-body font-semibold text-fg">{opcao.titulo}</span>
      <span className="text-caption leading-relaxed text-fg-muted">{opcao.ajuda}</span>
    </button>
  )
}
