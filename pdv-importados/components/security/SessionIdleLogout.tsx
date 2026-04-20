'use client'

import { useEffect, useRef } from 'react'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { getIdleLogoutMinutes } from '@/lib/security/idleLogoutMinutes'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'

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
      const res = await performClientLogout()
      if (!res.ok) {
        // Se não invalidou sessão, não redireciona (evita falso logout).
        signingOut.current = false
        timeoutId = setTimeout(() => {
          void logout()
        }, 15_000)
        return
      }
      resetCarrinhoPersistido()
      window.location.assign('/login?reason=sessao_inatividade')
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
