'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import { useRouter } from 'next/navigation'

export function CatalogoNovoButton({
  label,
  m,
  opcoes,
  atalhoHint,
}: {
  label: string
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  /** Dica de atalho de teclado (ex.: "Atalho: pressione N") — vira title/aria só, sem poluir o botão. */
  atalhoHint?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-v2-btn-primary"
        title={atalhoHint}
      >
        <Plus size={14} aria-hidden />
        {label}
      </button>

      <NovoProdutoModal
        open={open}
        onOpenChange={setOpen}
        m={m}
        opcoes={opcoes}
        onCriado={() => {
          router.refresh()
        }}
      />
    </>
  )
}
