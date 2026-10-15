'use client'

import React, { useEffect, useId, useRef, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DragonModalVariant = 'default' | 'danger'
export type DragonModalSize = 'sm' | 'md' | 'lg' | 'xl'
/**
 * `center`: diálogo centralizado (default).
 * `drawer`: gaveta lateral à direita para detalhes — tela cheia no mobile; a partir de
 * `sm`, 480 px (sm/md) ou 640 px (lg/xl). Header e footer fixos, só o corpo rola.
 */
export type DragonModalPlacement = 'center' | 'drawer'

type Props = Readonly<{
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** Ícone Lucide à esquerda do título. Default = nenhum (ou AlertTriangle no danger). */
  icon?: LucideIcon
  variant?: DragonModalVariant
  size?: DragonModalSize
  /**
   * `sheet`: em telas pequenas vira bottom-sheet (largura total, ancorado embaixo,
   * cantos arredondados só no topo); de `sm` p/ cima centraliza como diálogo normal.
   * Ideal p/ formulários longos no mobile. Default false (sempre centralizado).
   */
  sheet?: boolean
  /** Ver `DragonModalPlacement`. Com `drawer`, `sheet` é ignorado. */
  placement?: DragonModalPlacement
  /** Slot de ações no rodapé (botões). Sem footer, o rodapé não é renderizado. */
  footer?: ReactNode
  children: ReactNode
  /** Trava fechar por backdrop/Escape — útil durante submit. Default true. */
  dismissable?: boolean
  /** rótulo acessível do botão fechar (i18n). */
  closeLabel?: string
  /**
   * `data-testid` aplicado à raiz do diálogo (envolve header, corpo e footer).
   * Permite que testes escopem o modal inteiro — inclusive botões do `footer` —
   * sem depender de wrapper interno. Capacidade genérica de primitivo.
   */
  'data-testid'?: string
}>

const sizeClass: Record<DragonModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-6xl',
}

// Strings literais (não `sm:${...}`) p/ o Tailwind JIT enxergar e gerar a classe.
const sheetSizeClass: Record<DragonModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-6xl',
}

const drawerSizeClass: Record<DragonModalSize, string> = {
  sm: 'sm:max-w-[480px]',
  md: 'sm:max-w-[480px]',
  lg: 'sm:max-w-[640px]',
  xl: 'sm:max-w-[640px]',
}

function isFocusable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && !el.hasAttribute('disabled') && el.tabIndex !== -1
}

/**
 * DragonModal — primitivo único de diálogo (achados #06/#14/#31 da auditoria).
 * Backdrop glass + cartão `dragon-elev-2`, header com ícone âmbar (imperial-red
 * no `variant="danger"`) + título + subtítulo + X, e slot de footer para ações.
 * Cuida de Escape, clique no backdrop, trava de scroll e foco (move ao abrir,
 * restaura ao fechar, ciclo de Tab contido). É o único caminho aceito p/ dialog —
 * inclusive gavetas de detalhe (`placement="drawer"`).
 */
export function DragonModal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  variant = 'default',
  size = 'md',
  sheet = false,
  placement = 'center',
  footer,
  children,
  dismissable = true,
  closeLabel = 'Fechar',
  'data-testid': dataTestId,
}: Props) {
  const titleId = useId()
  const subtitleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  // Ref estável p/ onClose: evita re-rodar o effect (scroll/foco) a cada render
  // quando o pai passa um onClose com identidade nova.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Escape + trava de scroll + foco (abre → move p/ o cartão; fecha → restaura).
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
        const card = cardRef.current
        if (!card) return
        const focusables = Array.from(card.querySelectorAll<HTMLElement>(
          'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
        )).filter(isFocusable)
        if (focusables.length === 0) {
          e.preventDefault()
          card.focus()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        const activeDentro = active instanceof HTMLElement && focusables.includes(active)
        // Se o foco está FORA do ciclo (ex.: no próprio cartão tabIndex=-1 após
        // abrir, ou escapou para trás do modal), puxa de volta para dentro:
        // Tab → primeiro, Shift+Tab → último. Sem isso, Shift+Tab a partir do
        // cartão vazaria o foco para fora do diálogo.
        if (e.shiftKey && (active === first || !activeDentro)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !activeDentro)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // foco inicial no cartão — mas só se o conteúdo não definiu o próprio foco
    // (ex.: modal que dá autofocus num textarea); evita roubar o foco de volta.
    const raf = requestAnimationFrame(() => {
      const card = cardRef.current
      if (card && !card.contains(document.activeElement)) card.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
      previouslyFocused?.focus?.()
    }
  }, [open, dismissable])

  if (!open) return null

  const accent =
    variant === 'danger'
      ? 'text-destructive bg-destructive/10'
      : 'text-amber-400 bg-amber-400/10'

  const drawer = placement === 'drawer'

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        drawer
          ? 'justify-end'
          : cn('justify-center', sheet ? 'items-end p-0 sm:items-center sm:p-4' : 'items-center p-4'),
      )}
      data-placement={placement}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      data-testid={dataTestId}
    >
      <div
        className="dragon-glass-backdrop absolute inset-0"
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        data-dragon-panel
        className={cn(
          'dragon-elev-2 relative z-10 flex w-full flex-col outline-none',
          drawer
            ? cn('h-full border-l border-jl-border-1', drawerSizeClass[size])
            : cn(
                'max-h-[90vh]',
                // sheet: largura total + cantos só no topo no mobile; vira diálogo em sm+
                sheet ? cn('rounded-t-2xl sm:rounded-2xl', sheetSizeClass[size]) : cn('rounded-2xl', sizeClass[size]),
              ),
        )}
      >
        <div
          data-dragon-header
          className={cn('flex items-start gap-3 px-6 pb-4 pt-6', drawer && 'border-b border-jl-border-1')}
        >
          {Icon && (
            <span className={cn('mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', accent)}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-jl-fg-1">
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="mt-0.5 text-sm text-jl-fg-3">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-1.5 -mt-1.5 flex-shrink-0 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06] hover:text-jl-fg-1"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div data-dragon-body className={cn('min-h-0 flex-1 overflow-y-auto px-6', drawer && 'py-4')}>
          {children}
        </div>

        {footer && (
          <div
            data-dragon-footer
            className={cn(
              'flex flex-wrap items-center justify-end gap-3 px-6 pb-6 pt-5',
              drawer && 'border-t border-jl-border-1 pb-5 pt-4',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
