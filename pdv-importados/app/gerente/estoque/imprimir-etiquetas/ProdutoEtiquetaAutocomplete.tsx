'use client'

/**
 * Autocomplete de produto para impressão de etiquetas.
 * Espelha o padrão do recebimento (debounce + Enter do leitor),
 * mas devolve preço/estoque via `buscarProdutosParaEtiqueta`.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Input } from '@/components/ui/forms'
import { formatDecimalBRL } from '@/lib/format/money'
import { buscarProdutosParaEtiqueta } from './actions'
import type { ProdutoComEstoqueDTO } from '@/lib/etiqueta/types'

type Props = Readonly<{
  disabled?: boolean
  placeholder: string
  semResultadosLabel: string
  minimoLabel: string
  onSelecionar: (produto: ProdutoComEstoqueDTO) => void
}>

function escolhaAutomatica(
  lista: readonly ProdutoComEstoqueDTO[],
  termo: string,
): ProdutoComEstoqueDTO | null {
  if (lista.length === 1) return lista[0]
  const exatos = lista.filter((p) => p.codigo_barras !== null && p.codigo_barras === termo)
  return exatos.length === 1 ? exatos[0] : null
}

export function ProdutoEtiquetaAutocomplete({
  disabled,
  placeholder,
  semResultadosLabel,
  minimoLabel,
  onSelecionar,
}: Props) {
  const listId = useId()
  const [termo, setTermo] = useState('')
  const [opcoes, setOpcoes] = useState<ProdutoComEstoqueDTO[]>([])
  const [termoDasOpcoes, setTermoDasOpcoes] = useState('')
  const termoAtualRef = useRef('')
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const termoDebounced = useDebounce(termo, 260)

  useEffect(() => {
    termoAtualRef.current = termo.trim()
  }, [termo])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = termoDebounced.trim()
    if (t.length < 2) {
      setOpcoes([])
      setTermoDasOpcoes('')
      return
    }
    let cancelado = false
    setCarregando(true)
    void buscarProdutosParaEtiqueta(t)
      .then((r) => {
        if (cancelado) return
        setOpcoes(r.success ? r.data : [])
        setTermoDasOpcoes(t)
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [termoDebounced])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const escolher = (p: ProdutoComEstoqueDTO) => {
    setTermo('')
    setOpcoes([])
    setTermoDasOpcoes('')
    setAberto(false)
    onSelecionar(p)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const aoEnter = async () => {
    const t = termo.trim()
    if (t.length < 2) return
    if (termoDasOpcoes === t && opcoes.length > 0) {
      const unico = escolhaAutomatica(opcoes, t) ?? opcoes[0]
      escolher(unico)
      return
    }
    setCarregando(true)
    setAberto(true)
    try {
      const r = await buscarProdutosParaEtiqueta(t)
      if (termoAtualRef.current !== t) return
      const lista = r.success ? r.data : []
      setOpcoes(lista)
      setTermoDasOpcoes(t)
      const unico = escolhaAutomatica(lista, t)
      if (unico) escolher(unico)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          ref={inputRef}
          value={termo}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-autocomplete="list"
          className="pl-8"
          style={{ paddingLeft: '2rem' }}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAberto(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              void aoEnter()
            }
          }}
        />
        {carregando ? (
          <Loader2
            size={14}
            aria-hidden
            className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-fg-subtle"
          />
        ) : null}
      </div>

      {aberto && termo.trim().length >= 1 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
        >
          {carregando && opcoes.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-caption text-fg-subtle">
              <Loader2 size={12} className="mr-1 inline animate-spin" aria-hidden />
            </li>
          ) : termo.trim().length < 2 ? (
            <li role="presentation" className="px-3 py-2 text-caption text-fg-subtle">
              {minimoLabel}
            </li>
          ) : opcoes.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-caption text-fg-subtle">
              {semResultadosLabel}
            </li>
          ) : (
            opcoes.map((p) => (
              <li key={p.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => escolher(p)}
                  className="fp-focus-ring flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-soft)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-fg">{p.nome}</span>
                    {p.codigo_barras ? (
                      <span className="font-mono text-caption text-fg-subtle">{p.codigo_barras}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-body font-semibold text-fg">
                      R$ {formatDecimalBRL(p.preco_varejo)}
                    </span>
                    <span className="text-caption text-fg-subtle">
                      est. {Math.floor(p.quantidade_atual)}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
