'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'

type Props = Readonly<{
  label: string
  className?: string
}>

/**
 * Encerra a sessão Supabase e volta ao login (alinhado ao middleware e SessionIdleLogout).
 */
export function SignOutButton({ label, className }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSignOut() {
    setLoading(true)
    setError(null)
    try {
      const res = await performClientLogout()
      if (!res.ok) {
        setError(res.error)
        return
      }
      resetCarrinhoPersistido()
      router.push('/login')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onSignOut()}
        disabled={loading}
        className={className}
      >
        {loading ? '…' : label}
      </button>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </>
  )
}
