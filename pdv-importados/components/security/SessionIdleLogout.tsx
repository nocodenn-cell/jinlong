'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getIdleLogoutMinutes } from '@/lib/security/idleLogoutMinutes'

/**
 * Encerra a sessão Supabase após período sem eventos de uso (teclado/mouse/toque).
 * Desativado quando `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` está vazio ou ≤ 0.
 */
export function SessionIdleLogout() {
  const signingOut = useRef(false)

  useEffect(() => {
    const minutes = getIdleLogoutMinutes()
    if (minutes <= 0) return

    const ms = minutes * 60 * 1000
    let timeoutId: ReturnType<typeof setTimeout>

    const logout = async () => {
      if (signingOut.current) return
      signingOut.current = true
      try {
        const supabase = createClient()
        await supabase.auth.signOut()
      } finally {
        window.location.assign('/login?reason=sessao_inatividade')
      }
    }

    const reset = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        void logout()
      }, ms)
    }

    const onActivity = () => reset()

    reset()
    window.addEventListener('keydown', onActivity)
    window.addEventListener('mousedown', onActivity)
    window.addEventListener('touchstart', onActivity)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('mousedown', onActivity)
      window.removeEventListener('touchstart', onActivity)
    }
  }, [])

  return null
}
