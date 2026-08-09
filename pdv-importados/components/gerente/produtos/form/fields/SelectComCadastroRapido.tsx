'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CadastroRapidoNomeModal } from './CadastroRapidoNomeModal'

type Opcao = Readonly<{ id: string; nome: string }>

type Props = Readonly<{
  label: string
  value: string
  onChange: (id: string) => void
  opcoes: Opcao[]
  vazioLabel: string
  /** Nota abaixo do campo (ex.: aviso de opção inativa). */
  hint?: string | null
  disabled?: boolean
  selectClassName: string
  modalTitulo: string
  modalNomeLabel: string
  modalPlaceholder: string
  cancelarLabel: string
  salvarLabel: string
  salvandoLabel: string
  onCriar: (nome: string) => Promise<{ success: boolean; id?: string; error?: string }>
  onOpcaoCriada: (opcao: Opcao) => void
}>

export function SelectComCadastroRapido({
  label,
  value,
  onChange,
  opcoes,
  vazioLabel,
  hint,
  disabled,
  selectClassName,
  modalTitulo,
  modalNomeLabel,
  modalPlaceholder,
  cancelarLabel,
  salvarLabel,
  salvandoLabel,
  onCriar,
  onOpcaoCriada,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="block text-xs font-medium text-jl-fg-3">
        <span>{label}</span>
        <div className="mt-1 flex gap-1.5">
          <select
            className={cn(selectClassName, 'min-w-0 flex-1')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">{vazioLabel}</option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
          <button
            type="button"
            title={modalTitulo}
            aria-label={modalTitulo}
            disabled={disabled}
            onClick={() => setModalOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-jl-border-1 bg-jl-surface-soft text-jl-fg-2 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
        {hint ? (
          <span className="mt-0.5 block text-caption text-[var(--color-warning-strong)]">
            {hint}
          </span>
        ) : null}
      </div>

      <CadastroRapidoNomeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        titulo={modalTitulo}
        nomeLabel={modalNomeLabel}
        nomePlaceholder={modalPlaceholder}
        cancelarLabel={cancelarLabel}
        salvarLabel={salvarLabel}
        salvandoLabel={salvandoLabel}
        onSubmit={onCriar}
        onCriado={(id, nome) => {
          onOpcaoCriada({ id, nome })
          onChange(id)
        }}
      />
    </>
  )
}
