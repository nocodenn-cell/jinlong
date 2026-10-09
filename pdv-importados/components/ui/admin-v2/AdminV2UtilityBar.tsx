'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type MouseEvent, useState } from 'react'
import { LogOut } from 'lucide-react'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'
import { cn } from '@/lib/utils'
import { useAdminV2Session } from './AdminV2SessionContext'
import { traduzir } from '@/lib/i18n/execTexts'

type AdminV2UtilityBarProps = {
  className?: string
}

export function AdminV2UtilityBar({ className }: AdminV2UtilityBarProps) {
  const router = useRouter()
  const { idioma } = useAdminV2Session()
  const [loggingOut, setLoggingOut] = useState(false)

  async function onSignOut(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const res = await performClientLogout()
      if (!res.ok) return
      resetCarrinhoPersistido()
      router.push('/login')
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LanguageToggle idiomaAtual={idioma} variant="dragon-light" />
      <Link
        href="/login"
        onClick={(event) => void onSignOut(event)}
        aria-disabled={loggingOut}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--admin-v2-border)] bg-[var(--color-background-secondary)] px-3 text-xs font-medium text-jl-fg-2 transition-colors hover:bg-[var(--color-background-tertiary)] hover:text-jl-fg-1"
      >
        <LogOut size={14} aria-hidden />
        <span>{loggingOut ? '...' : traduzir(idioma === 'pt' ? 'pt' : 'zh', 'hdr.sair')}</span>
      </Link>
    </div>
  )
}
