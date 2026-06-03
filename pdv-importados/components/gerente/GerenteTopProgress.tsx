'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Barra fina de progresso no topo, disparada a cada navegação interna.
 * Dá feedback instantâneo de "está carregando" sem depender do skeleton da
 * rota — é o que faz a troca de tela parecer responsiva (e não travada).
 *
 * Sem dependência externa: detecta o início pelo clique em qualquer <a href="/...">
 * dentro do shell e conclui quando o `pathname` muda.
 */
export function GerenteTopProgress() {
  const pathname = usePathname()
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const activeRef = useRef(false)

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const start = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    clearTimers()
    setActive(true)
    setWidth(8)
    // sobe progressivamente e estaciona perto do fim até a rota concluir
    timers.current.push(setTimeout(() => setWidth(38), 90))
    timers.current.push(setTimeout(() => setWidth(63), 280))
    timers.current.push(setTimeout(() => setWidth(80), 700))
    timers.current.push(setTimeout(() => setWidth(88), 1600))
  }, [clearTimers])

  // início: clique em link interno
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      const target = anchor.getAttribute('target')
      if (!href || !href.startsWith('/') || (target && target !== '_self')) return
      // mesma rota → não há navegação
      if (href === pathname || href.split('?')[0] === pathname) return
      start()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname, start])

  // conclusão: pathname mudou
  useEffect(() => {
    if (!activeRef.current) return
    clearTimers()
    setWidth(100)
    const t1 = setTimeout(() => {
      setActive(false)
      activeRef.current = false
    }, 220)
    const t2 = setTimeout(() => setWidth(0), 460)
    timers.current.push(t1, t2)
    return clearTimers
    // dispara quando a rota muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => clearTimers, [clearTimers])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]"
      style={{ opacity: active ? 1 : 0, transition: 'opacity 250ms ease' }}
    >
      <div
        className="h-full rounded-r-full bg-amber-400"
        style={{
          width: `${width}%`,
          transition: 'width 280ms cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 0 8px rgba(251,191,36,0.7), 0 0 2px rgba(251,191,36,0.9)',
        }}
      />
    </div>
  )
}
