'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type MouseEvent, useState } from 'react'
import { Bell, LogOut, MoonStar } from 'lucide-react'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'
import { cn } from '@/lib/utils'

type AdminV2UtilityBarProps = {
  className?: string
}

export function AdminV2UtilityBar({ className }: AdminV2UtilityBarProps) {
  const router = useRouter()
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
      <button
        type="button"
        disabled
        aria-disabled
        title="Alternância de tema em breve"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--admin-v2-border)] bg-[var(--color-background-secondary)] text-jl-fg-3 opacity-60"
      >
        <MoonStar size={16} aria-hidden />
      </button>
      <button
        type="button"
        disabled
        aria-disabled
        title="Notificações em breve"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--admin-v2-border)] bg-[var(--color-background-secondary)] text-jl-fg-3 opacity-60"
      >
        <Bell size={16} aria-hidden />
      </button>
      <Link
        href="/login"
        onClick={(event) => void onSignOut(event)}
        aria-disabled={loggingOut}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--admin-v2-border)] bg-[var(--color-background-secondary)] px-3 text-xs font-medium text-jl-fg-2 transition-colors hover:bg-[var(--color-background-tertiary)] hover:text-jl-fg-1"
      >
        <LogOut size={14} aria-hidden />
        <span>{loggingOut ? '...' : 'Sair'}</span>
      </Link>
    </div>
  )
}
