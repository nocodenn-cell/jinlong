'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

  async function onSignOut() {
    setLoading(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      /* URL/key inválidos: ainda redireciona para login (fail-safe). */
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={loading}
      className={className}
    >
      {loading ? '…' : label}
    </button>
  )
}
