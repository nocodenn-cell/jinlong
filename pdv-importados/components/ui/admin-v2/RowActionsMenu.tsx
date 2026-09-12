'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Menu de ações de linha — o gesto de "três pontos" do Bling.
 *
 * Por que existe: o Jinlong tinha cinco jeitos diferentes de oferecer ação numa
 * linha (dois ícones soltos no Estoque, dois nas Vendas, dois botões em Contas a
 * Pagar, um formulário inline em Contas a Receber, e nenhuma ação em Compras).
 * Quem vem do Bling procura um único lugar: os três pontos na própria linha.
 *
 * Substitui o `app/gerente/vendas/VendaActionsMenu.tsx`, que tinha o gesto certo
 * mas estava morto (nenhum importador) e montava caminhos por concatenação de
 * string, fora do SSOT de rotas. Aqui o destino é sempre dado por quem usa.
 *
 * Acessibilidade: `menu`/`menuitem`, fecha em Escape e em clique fora, seta
 * `aria-expanded`. Ações destrutivas recebem tom próprio e ficam depois de um
 * separador — nunca encostadas na ação neutra que vem antes.
 */

export type RowAction = Readonly<{
  id: string
  label: string
  icon?: LucideIcon
  /** Navegação interna. Mutuamente exclusivo com `onSelect`. */
  href?: string
  /** Abre em nova aba — usado por impressão, que não deve perder a lista. */
  external?: boolean
  onSelect?: () => void
  destructive?: boolean
  disabled?: boolean
  /** Explica por que a ação está indisponível, em vez de só esmaecê-la. */
  disabledHint?: string
}>

type Props = Readonly<{
  actions: readonly RowAction[]
  /** Rótulo acessível do gatilho — inclua o nome do registro. */
  ariaLabel: string
  align?: 'left' | 'right'
  className?: string
}>

const ITEM_BASE =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-45'

export function RowActionsMenu({ actions, ariaLabel, align = 'right', className }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visiveis = actions.filter(Boolean)
  if (visiveis.length === 0) return null

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
          open
            ? 'border-[var(--color-border)] bg-[var(--color-surface-soft)]'
            : 'border-[var(--color-border-secondary)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]',
        )}
      >
        <MoreVertical className="h-4 w-4 text-fg-muted" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            // `admin-v2-panel` é a superfície elevada do design system. Usar um
            // token inventado (`--color-surface-elevated`, que não existe)
            // deixava o menu TRANSPARENTE: a linha de trás vazava através dele.
            // Achado no QA visual de 11/09.
            'admin-v2-panel absolute top-full z-50 mt-1 w-56 overflow-hidden rounded-lg shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {visiveis.map((action, i) => {
            const Icone = action.icon
            const anterior = visiveis[i - 1]
            const separador = action.destructive && anterior && !anterior.destructive
            const conteudo = (
              <>
                {Icone ? (
                  <Icone
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      action.destructive ? '' : 'text-fg-muted',
                    )}
                    aria-hidden
                  />
                ) : null}
                <span className="truncate">{action.label}</span>
              </>
            )
            const tom = action.destructive
              ? 'text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]'
              : 'text-fg hover:bg-[var(--color-surface-soft)]'

            return (
              <div key={action.id}>
                {separador ? (
                  <div className="border-t border-[var(--color-border-secondary)]" aria-hidden />
                ) : null}
                {action.href && !action.disabled ? (
                  action.external ? (
                    <a
                      href={action.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={cn(ITEM_BASE, tom)}
                    >
                      {conteudo}
                    </a>
                  ) : (
                    <Link
                      href={action.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={cn(ITEM_BASE, tom)}
                    >
                      {conteudo}
                    </Link>
                  )
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={action.disabled}
                    title={action.disabled ? action.disabledHint : undefined}
                    onClick={() => {
                      setOpen(false)
                      action.onSelect?.()
                    }}
                    className={cn(ITEM_BASE, tom)}
                  >
                    {conteudo}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
