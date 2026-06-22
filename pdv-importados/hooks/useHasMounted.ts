'use client'

import { useEffect, useState } from 'react'

/**
 * STATE READY GATE para estado client-only / persistido.
 *
 * O store de carrinho usa `zustand/persist` com `localStorage` (síncrono): ao
 * criar o store no cliente ele já lê os itens persistidos, então o primeiro
 * render do cliente divergiria do HTML do SSR (carrinho vazio) → React #418.
 *
 * Retorna `false` no render inicial (servidor e primeiro paint do cliente) e
 * `true` após a montagem. Consumidores devem renderizar o estado neutro/SSR
 * enquanto `false` e só revelar valores client-only quando `true`.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return mounted
}
