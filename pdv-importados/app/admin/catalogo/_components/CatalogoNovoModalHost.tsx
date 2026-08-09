'use client'

/**
 * Único dono do modal de cadastro rápido no Catálogo.
 * Entradas: ?modal=novo, atalho N, e botão do header (via URL).
 */

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

type Props = Readonly<{
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  idioma: Idioma
}>

export function CatalogoNovoModalHost({ m, opcoes, idioma }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  const clearModalParam = () => {
    if (searchParams.get('modal') !== 'novo') return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('modal')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  useEffect(() => {
    if (searchParams.get('modal') === 'novo') setOpen(true)
  }, [searchParams])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <NovoProdutoModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) clearModalParam()
      }}
      m={m}
      opcoes={opcoes}
      idioma={idioma}
      onCriado={() => {
        clearModalParam()
        router.refresh()
      }}
    />
  )
}

/** Abre o cadastro rápido via query — usado pelo CTA do header e empty state. */
export function openCatalogoNovoModal(
  router: { push: (href: string, opts?: { scroll?: boolean }) => void },
  pathname: string,
  searchParams: URLSearchParams,
) {
  const params = new URLSearchParams(searchParams.toString())
  params.set('modal', 'novo')
  const qs = params.toString()
  router.push(`${pathname}?${qs}`, { scroll: false })
}
