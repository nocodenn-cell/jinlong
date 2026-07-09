'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { FornecedorEditarModal } from '@/app/gerente/fornecedores/FornecedorEditarModal'
import type { FornecedorListRow } from '@/app/gerente/fornecedores/actions'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { Mensagens } from '@/i18n/getMessages'
import { Button } from '@/components/ui/button'

type Props = Readonly<{
  p: Mensagens['produtos']
  fornecedores: { id: string; nome: string }[]
  value: string
  onChange: (id: string) => void
  onFornecedoresChange?: (fornecedores: { id: string; nome: string }[]) => void
  disabled: boolean
  selectClassName: string
  idioma: Idioma
  label: string
}>

export function FornecedorCombobox({
  p,
  fornecedores,
  value,
  onChange,
  onFornecedoresChange,
  disabled,
  selectClassName,
  idioma,
  label,
}: Props) {
  const inputId = useId()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  const selecionado = useMemo(
    () => fornecedores.find((f) => f.id === value) ?? null,
    [fornecedores, value],
  )

  const [query, setQuery] = useState(selecionado?.nome ?? '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [modalNovo, setModalNovo] = useState(false)

  // Mantém o texto exibido sincronizado quando o valor muda por fora (ex.: carregar produto p/ edição).
  useEffect(() => {
    setQuery(selecionado?.nome ?? '')
  }, [selecionado])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q === selecionado?.nome.toLowerCase()) return fornecedores
    return fornecedores.filter((f) => f.nome.toLowerCase().includes(q))
  }, [fornecedores, query, selecionado])

  useEffect(() => {
    if (highlight >= filtrados.length) setHighlight(Math.max(0, filtrados.length - 1))
  }, [filtrados, highlight])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(selecionado?.nome ?? '')
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [selecionado])

  const selecionar = (f: { id: string; nome: string }) => {
    onChange(f.id)
    setQuery(f.nome)
    setOpen(false)
  }

  const limpar = () => {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const onFornecedorCriado = (f: FornecedorListRow) => {
    const next = [...fornecedores, { id: f.id, nome: f.nome }]
    onFornecedoresChange?.(next)
    selecionar({ id: f.id, nome: f.nome })
    setModalNovo(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => Math.min(i + 1, filtrados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = filtrados[highlight]
      if (alvo) selecionar(alvo)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selecionado?.nome ?? '')
    }
  }

  return (
    <div ref={rootRef} className="flex gap-2">
      <div className="relative flex-1">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtrados[highlight] ? `${listboxId}-${filtrados[highlight].id}` : undefined}
          className={`${selectClassName} w-full pr-8`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setHighlight(0)
            if (e.target.value.trim() === '' && value) onChange('')
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={p.fornecedor_busca_placeholder}
          autoComplete="off"
        />
        {query && !disabled ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-jl-fg-3 transition-colors hover:text-jl-fg-1"
            onClick={limpar}
            aria-label={p.nenhum_fornecedor}
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {open && !disabled ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[color:var(--jl-border-2)] bg-[var(--color-background-secondary)] py-1 shadow-lg"
          >
            {filtrados.length === 0 ? (
              <li className="px-3 py-2 text-xs text-jl-fg-3">{p.nenhum_fornecedor}</li>
            ) : (
              filtrados.map((f, i) => (
                <li
                  key={f.id}
                  id={`${listboxId}-${f.id}`}
                  role="option"
                  aria-selected={f.id === value}
                  className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                    i === highlight ? 'bg-white/[.08] text-jl-fg-1' : 'text-jl-fg-2'
                  } ${f.id === value ? 'font-medium' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selecionar(f)
                  }}
                >
                  {f.nome}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        className="app-btn-neutral shrink-0 px-2"
        disabled={disabled}
        title={p.novo_fornecedor}
        aria-label={p.novo_fornecedor}
        onClick={() => setModalNovo(true)}
      >
        <Plus className="h-4 w-4" />
      </Button>
      {modalNovo ? (
        <FornecedorEditarModal
          idioma={idioma}
          fornecedor={null}
          onClose={() => setModalNovo(false)}
          onSalvo={onFornecedorCriado}
        />
      ) : null}
    </div>
  )
}
