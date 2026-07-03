import { useEffect, useRef, type RefObject } from 'react'

function isFocusable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && !el.hasAttribute('disabled') && el.tabIndex !== -1
}

type Params = {
  open: boolean
  onClose: () => void
  /** Container do conteúdo do modal — recebe o focus trap e o foco inicial. */
  containerRef: RefObject<HTMLElement | null>
  /** Trava fechar por Escape — útil durante submit. Default true. */
  dismissable?: boolean
}

/**
 * Gestão de foco para diálogos modais (extraído de `components/ui/DragonModal.tsx`,
 * Fase 2 da auditoria de acessibilidade — WCAG 2.4.3/2.1.2). Cuida de:
 * - Escape fecha o modal (se `dismissable`)
 * - trava de scroll do body enquanto aberto
 * - foco move para o container ao abrir (a menos que o conteúdo já tenha
 *   focado algo, ex.: um input com autoFocus)
 * - Tab/Shift+Tab ciclam dentro do container (focus trap)
 * - foco retorna ao elemento que estava focado antes de abrir, ao fechar
 *
 * Use em qualquer modal custom que não seja construído sobre `DragonModal`.
 */
export function useModalFocusManagement({ open, onClose, containerRef, dismissable = true }: Params) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        const container = containerRef.current
        if (!container) return
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter(isFocusable)
        if (focusables.length === 0) {
          e.preventDefault()
          container.focus()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current
      if (container && !container.contains(document.activeElement)) container.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
      previouslyFocused?.focus?.()
    }
  }, [open, dismissable, containerRef])
}
