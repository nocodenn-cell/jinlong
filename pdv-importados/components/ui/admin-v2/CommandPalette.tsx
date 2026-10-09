'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search } from 'lucide-react'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { buildCommandEntries, searchCommandEntries } from '@/lib/navigation/commandPaletteEntries'

/** Evento global para abrir a paleta a partir de qualquer botão (ver `CommandPaletteTrigger`). */
export const OPEN_COMMAND_PALETTE_EVENT = 'jl:open-command-palette'

const MAX_RESULTS = 12

type Props = { idioma: Idioma; showAdminOnlyItems: boolean }

/**
 * Busca de destinos e ações de navegação (Ctrl/Cmd+K). Sem consulta ao banco: a lista vem
 * do mesmo arquivo da sidebar, filtrada por `adminOnly`. Não é controle de acesso — a policy
 * do servidor continua decidindo o que cada perfil abre.
 */
export function CommandPalette({ idioma, showAdminOnlyItems }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const listId = useId()

  const messages = useMemo(() => getMessages(idioma), [idioma])
  const ui = messages.admin_ui
  const entries = useMemo(
    () =>
      buildCommandEntries({
        admin: messages.admin,
        chineseLanguage: idioma !== 'pt',
        adminUi: ui,
        showAdminOnlyItems,
      }),
    [messages, idioma, ui, showAdminOnlyItems],
  )
  const results = useMemo(() => searchCommandEntries(entries, query).slice(0, MAX_RESULTS), [entries, query])

  const abrir = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery('')
    setActive(0)
    setOpen(true)
  }, [])
  const fechar = useCallback(() => {
    setOpen(false)
    returnFocusRef.current?.focus?.()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) fechar()
        else abrir()
      }
    }
    function onOpenEvent() {
      abrir()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent)
    }
  }, [open, abrir, fechar])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const ir = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  if (!open) return null

  const safeActive = Math.min(active, Math.max(results.length - 1, 0))

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = results[safeActive]
      if (alvo) ir(alvo.href)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
    } else if (e.key === 'Tab') {
      e.preventDefault() // mantém o foco dentro do diálogo (o campo é o único tabulável)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={ui.command_palette_aria}
      data-testid="command-palette"
    >
      <div className="absolute inset-0 bg-black/60" onClick={fechar} aria-hidden />
      <div className="admin-v2-panel relative z-10 w-full max-w-xl overflow-hidden rounded-xl shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-border-secondary)] px-3">
          <Search className="h-4 w-4 shrink-0 text-jl-fg-3" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onInputKey}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[safeActive] ? `${listId}-${safeActive}` : undefined}
            aria-autocomplete="list"
            placeholder={ui.command_palette_placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-sm text-jl-fg-1 outline-none placeholder:text-jl-fg-3"
          />
        </div>
        <ul id={listId} role="listbox" aria-label={ui.command_palette_aria} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-6 text-center text-sm text-jl-fg-3">
              {ui.command_palette_vazio}
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.href}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === safeActive}
                data-href={r.href}
                onMouseEnter={() => setActive(i)}
                onClick={() => ir(r.href)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm',
                  i === safeActive ? 'bg-[rgba(251,191,36,0.12)] text-jl-fg-1' : 'text-jl-fg-2',
                )}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.label}</span>
                  {r.secondary ? <span className="ml-2 text-xs text-jl-fg-3">{r.secondary}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-jl-fg-3">
                  {r.group && r.group !== r.label ? <span>{r.group}</span> : null}
                  {i === safeActive ? <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> : null}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
