'use client'

import { useRouter } from 'next/navigation'
import { type MouseEvent, useState } from 'react'
import { LogOut } from 'lucide-react'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'
import { cn } from '@/lib/utils'

type AdminV2UtilityBarProps = {
  className?: string
}

export function AdminV2UtilityBar({ className }: AdminV2UtilityBarProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function onSignOut(event: MouseEvent<HTMLButtonElement>) {
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
        onClick={(e) => void onSignOut(e)}
        disabled={loggingOut}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-50"
      >
        <LogOut size={14} aria-hidden />
        <span>{loggingOut ? '…' : 'Sair'}</span>
      </button>
    </div>
  )
}
