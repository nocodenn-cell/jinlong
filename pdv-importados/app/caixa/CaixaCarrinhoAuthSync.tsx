"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from "@/lib/auth/lojaUsuario"
import { useCarrinhoStore } from "@/stores/carrinhoStore"

type BrowserSupabase = ReturnType<typeof createClient>

/**
 * Após hidratação do persist e em mudanças de sessão, alinha dono e loja.
 * O dono é aplicado na hora (não espera a loja) para não exibir cupom alheio.
 * Falha ao ler a loja não apaga o cupom: a loja fica sem transição.
 */
async function lojaDaSessao(supabase: BrowserSupabase, uid: string): Promise<string | undefined> {
  try {
    return (await getLojaIdUsuario(supabase, uid)) ?? LOJA_MATRIZ_ID
  } catch (error) {
    console.error("[caixa.carrinho.loja_sessao]", error)
    return undefined
  }
}

function bindOperador(supabase: BrowserSupabase, uid: string | null, ticket: { current: number }) {
  if (!uid) {
    ticket.current += 1
    useCarrinhoStore.getState().setCartOwnerForSession(null)
    return
  }
  useCarrinhoStore.getState().setCartOwnerForSession(uid)
  const geracao = ++ticket.current
  void lojaDaSessao(supabase, uid).then((lojaId) => {
    if (geracao !== ticket.current) return
    useCarrinhoStore.getState().setCartOwnerForSession(uid, lojaId)
  })
}

export function CaixaCarrinhoAuthSync() {
  useEffect(() => {
    const supabase = createClient()
    const ticket = { current: 0 }

    const syncFromSession = () => {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        bindOperador(supabase, session?.user?.id ?? null, ticket)
      })
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      bindOperador(supabase, session?.user?.id ?? null, ticket)
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
      ticket.current += 1
      subscription.unsubscribe()
      unsubHydration?.()
    }
  }, [])

  return null
}
