"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCarrinhoStore } from "@/stores/carrinhoStore"

/**
 * Após hidratação do persist e em mudanças de sessão, alinha `cartOwnerUserId` ao utilizador atual.
 * Evita vazar itens entre operadores quando o dono persistido difere do utilizador autenticado.
 */
export function CaixaCarrinhoAuthSync() {
  useEffect(() => {
    const supabase = createClient()

    const applyUid = (uid: string | null) => {
      useCarrinhoStore.getState().setCartOwnerForSession(uid)
    }

    const syncFromSession = () => {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        applyUid(session?.user?.id ?? null)
      })
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUid(session?.user?.id ?? null)
    })

    const p = useCarrinhoStore.persist
    let unsubHydration: (() => void) | undefined
    if (p.hasHydrated()) {
      syncFromSession()
    } else {
      unsubHydration = p.onFinishHydration(() => {
        syncFromSession()
      })
    }

    return () => {
      subscription.unsubscribe()
      unsubHydration?.()
    }
  }, [])

  return null
}
