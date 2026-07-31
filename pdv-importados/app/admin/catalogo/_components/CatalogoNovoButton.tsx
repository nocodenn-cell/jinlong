'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { Button } from '@/components/ui/button'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import { useRouter } from 'next/navigation'

export function CatalogoNovoButton({
  label,
  m,
  opcoes,
  idioma,
}: {
  label: string
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  idioma: Idioma
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus size={14} aria-hidden />
        {label}
      </Button>

      <NovoProdutoModal
        open={open}
        onOpenChange={setOpen}
        m={m}
        opcoes={opcoes}
        idioma={idioma}
        onCriado={() => {
          router.refresh()
        }}
      />
    </>
  )
}
