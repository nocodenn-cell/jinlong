'use client'

import { useEffect } from 'react'

/**
 * Recolhe o botão flutuante de contato enquanto a seção do formulário (#contato) está visível,
 * para não cobrir campos nem o botão de envio. Sem JavaScript o botão continua visível.
 */
export function FabAutoHide({ targetId = 'contato' }: { targetId?: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId)
    const fab = document.querySelector<HTMLDetailsElement>('.jl-fab')
    if (!target || !fab || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        fab.open = false
        fab.setAttribute('data-hidden', '')
      } else {
        fab.removeAttribute('data-hidden')
      }
    })
    observer.observe(target)
    return () => {
      observer.disconnect()
      fab.removeAttribute('data-hidden')
    }
  }, [targetId])

  return null
}
