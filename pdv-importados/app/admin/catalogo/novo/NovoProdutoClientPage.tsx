'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'

type Props = {
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
}

export function NovoProdutoClientPage({ m, opcoes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) router.push(ROUTES.admin.catalogo)
  }

  function handleCriado() {
    setOpen(false)
    router.push(ROUTES.admin.catalogo)
  }

  return (
    <NovoProdutoModal
      open={open}
      onOpenChange={handleOpenChange}
      m={m}
      opcoes={opcoes}
      onCriado={handleCriado}
    />
  )
}
