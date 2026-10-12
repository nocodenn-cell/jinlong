'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import type { Mensagens } from '@/i18n/getMessages'

type Props = {
  m: Mensagens
  children: ReactNode
}

export function PalmShell({ m, children }: Props) {
  const path = usePathname()
  const vendas = !path.startsWith('/palm/estoque')
  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-3 py-4 text-foreground sm:px-4 md:max-w-4xl md:px-6 lg:max-w-5xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold">{m.palm.titulo}</p>
        <nav className="flex gap-2 text-sm">
          <Link href="/palm/vendas" className={aba(vendas)}>{m.palm.nav_vendas}</Link>
          <Link href="/palm/estoque" className={aba(!vendas)}>{m.palm.nav_estoque}</Link>
        </nav>
      </header>
      {children}
    </div>
  )
}

function aba(ativa: boolean): string {
  const base = 'inline-flex min-h-11 items-center rounded-md px-3 font-medium'
  return ativa ? `${base} bg-primary text-primary-foreground` : `${base} border border-border`
}
