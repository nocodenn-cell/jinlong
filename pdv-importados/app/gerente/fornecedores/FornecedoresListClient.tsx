'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Pencil, Trash2, Plus, Search, Mail } from 'lucide-react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { DataTablePage } from '@/components/gerente/DataTablePage'
import { Button } from '@/components/ui/button'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  buscarFornecedoresPaginadosAction,
  bulkAtivarFornecedoresAction,
  bulkExcluirFornecedoresAction,
  excluirFornecedorAction,
  type FornecedorListRow,
} from './actions'
import { FornecedorEditarModal } from './FornecedorEditarModal'

type Props = Readonly<{
  idioma: Idioma
  fornecedoresIniciais: FornecedorListRow[]
  hasMoreInicial: boolean
}>

type StatusFiltro = 'todos' | 'ativos' | 'inativos'

function maskCNPJ(d: string): string {
  const x = (d ?? '').replace(/\D/g, '')
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return d
}
function maskTel(t: string | null): string {
  if (!t) return '—'
  const x = t.replace(/\D/g, '')
  if (x.length === 11) return x.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4')
  if (x.length === 10) return x.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return t
}
function initials(n: string): string {
  return n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}

export function FornecedoresListClient({
  idioma,
  fornecedoresIniciais,
  hasMoreInicial,
}: Props) {
  const m = getMessages(idioma)
  const [fornecedores, setFornecedores] = useState<FornecedorListRow[]>(fornecedoresIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [termo, setTermo] = useState('')
  const [statusF, setStatusF] = useState<StatusFiltro>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<FornecedorListRow | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const termoDebounced = useDebounce(termo, 280)
  const statusFDebounced = useDebounce(statusF, 280)

  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // —— Paginação ————————————————————————————
  const stateRef = useRef({ hasMore, loading })
  useEffect(() => {
    stateRef.current = { hasMore, loading }
  })

  const carregarProxima = useCallback(async () => {
    if (stateRef.current.loading || !stateRef.current.hasMore) return
    setLoading(true)
    const prox = pageRef.current + 1
    try {
      const r = await buscarFornecedoresPaginadosAction(prox, {
        termo: termoDebounced || undefined,
        status: statusFDebounced,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      pageRef.current = prox
      setFornecedores((cur) => [...cur, ...r.fornecedores])
      setHasMore(r.hasMore)
    } finally {
      setLoading(false)
    }
  }, [termoDebounced, statusFDebounced])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void carregarProxima()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [carregarProxima])

  const skipMountRefetch = useRef(true)

  // Busca / filtro status — dispara após debounce
  useEffect(() => {
    if (skipMountRefetch.current) {
      skipMountRefetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    pageRef.current = 1
    buscarFornecedoresPaginadosAction(1, {
      termo: termoDebounced || undefined,
      status: statusFDebounced,
    }).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        setLoading(false)
        return
      }
      setFornecedores(r.fornecedores)
      setHasMore(r.hasMore)
      setSelecionados(new Set())
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [termoDebounced, statusFDebounced])

  // —— Handlers ————————————————————————————
  function abrirNovo() {
    setEmEdicao(null)
    setModalAberto(true)
  }
  function abrirEditar(f: FornecedorListRow) {
    setEmEdicao(f)
    setModalAberto(true)
  }
  function onSalvo(f: FornecedorListRow) {
    setFornecedores((cur) => {
      const i = cur.findIndex((x) => x.id === f.id)
      if (i >= 0) return cur.map((x) => (x.id === f.id ? f : x))
      return [f, ...cur]
    })
    emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
    setModalAberto(false)
  }
  async function onExcluir(f: FornecedorListRow) {
    const r = await excluirFornecedorAction(f.id)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setFornecedores((cur) => cur.filter((x) => x.id !== f.id))
    emitGerenteToast({ kind: 'success', message: m.fornecedores.toast_excluido })
  }

  // —— Seleção em lote ————————————————————
  function toggleOne(id: string) {
    setSelecionados((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function togglePagina() {
    const ids = fornecedores.map((f) => f.id)
    const todosNaPag = ids.every((id) => selecionados.has(id))
    setSelecionados((cur) => {
      const next = new Set(cur)
      if (todosNaPag) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }
  async function onBulkAtivar(ativo: boolean) {
    const ids = [...selecionados]
    const r = await bulkAtivarFornecedoresAction(ids, ativo)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setFornecedores((cur) => cur.map((f) => (ids.includes(f.id) ? { ...f, ativo } : f)))
    emitGerenteToast({
      kind: 'success',
      message: ativo ? m.fornecedores.toast_bulk_ativados : m.fornecedores.toast_bulk_inativados,
    })
    setSelecionados(new Set())
  }
  async function onBulkExcluir() {
    const ids = [...selecionados]
    if (!confirm(m.fornecedores.confirmar_bulk_exclusao.replace('{n}', String(ids.length)))) return
    const r = await bulkExcluirFornecedoresAction(ids)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    if (r.bloqueados > 0) {
      emitGerenteToast({
        kind: 'info',
        message: m.fornecedores.toast_bulk_excluidos_parcial
          .replace('{excluidos}', String(r.excluidos))
          .replace('{bloqueados}', String(r.bloqueados)),
      })
    } else {
      emitGerenteToast({ kind: 'success', message: m.fornecedores.toast_bulk_excluidos })
    }
    setFornecedores((cur) => cur.filter((f) => !ids.includes(f.id)))
    setSelecionados(new Set())
  }

  const idsPagina = fornecedores.map((f) => f.id)
  const todosNaPag = idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id))
  const algumNaPag = idsPagina.some((id) => selecionados.has(id))

  const headerRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.indeterminate = algumNaPag && !todosNaPag
    },
    [algumNaPag, todosNaPag],
  )

  return (
    <>
      <DataTablePage
        filters={
          <>
            <div className="relative max-w-[420px] min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-jl-fg-3" aria-hidden />
              <input
                type="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder={m.fornecedores.placeholder_busca}
                aria-label={m.fornecedores.placeholder_busca}
                className="app-input h-9 w-full rounded-md pl-9 pr-3 text-sm shadow-inner"
              />
            </div>
            {(['todos', 'ativos', 'inativos'] as StatusFiltro[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusF(s)}
                className={cn(
                  'app-chip rounded-full px-3 py-1 text-xs font-medium',
                  statusF === s ? 'app-chip-active' : '',
                )}
              >
                {m.fornecedores[`filtro_${s}` as const]}
              </button>
            ))}
          </>
        }
        meta={<>{fornecedores.length} {m.fornecedores.contagem}</>}
        actions={
          <Button type="button" className="app-btn-accent gap-1.5" onClick={abrirNovo}>
            <Plus className="h-4 w-4" aria-hidden /> {m.fornecedores.novo}
          </Button>
        }
        bulkBarLabel={selecionados.size > 0 ? `${selecionados.size} selecionados` : undefined}
        bulkBar={
          selecionados.size > 0 ? (
            <>
              <span className="text-sm font-medium text-jl-fg-1">
                <strong className="font-bold text-amber-400 tabular-nums">{selecionados.size}</strong>{' '}
                {m.fornecedores.bulk_selecionados}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onBulkAtivar(true)} className="app-btn-neutral rounded-md px-3 py-1.5 text-xs font-medium">
                  {m.fornecedores.bulk_ativar}
                </button>
                <button type="button" onClick={() => onBulkAtivar(false)} className="app-btn-neutral rounded-md px-3 py-1.5 text-xs font-medium">
                  {m.fornecedores.bulk_inativar}
                </button>
                <button
                  type="button"
                  onClick={() => void onBulkExcluir()}
                  className="app-btn-danger rounded-md px-3 py-1.5 text-xs font-semibold"
                >
                  {m.fornecedores.bulk_excluir}
                </button>
                <button type="button" onClick={() => setSelecionados(new Set())} className="text-xs text-jl-fg-3 hover:text-jl-fg-1">
                  {m.fornecedores.bulk_limpar}
                </button>
              </div>
            </>
          ) : undefined
        }
        pagination={<div ref={sentinelRef} className="h-1 w-full" aria-hidden />}
      >

      <GerenteTable
        tone="dragon"
        compact
        loading={loading && fornecedores.length === 0}
        columns={[
          {
            key: 'sel',
            header: (
              <input
                ref={headerRef}
                type="checkbox"
                checked={todosNaPag}
                onChange={togglePagina}
                disabled={fornecedores.length === 0}
                aria-label={m.fornecedores.aria_selecionar_pagina}
                className="h-4 w-4 rounded app-border"
              />
            ),
            width: 36,
          },
          { key: 'nome', header: m.fornecedores.col_nome, priority: 'primary' },
          { key: 'doc', header: m.fornecedores.col_documento, priority: 'contextual' },
          { key: 'tel', header: m.fornecedores.col_telefone, priority: 'contextual' },
          { key: 'email', header: m.fornecedores.col_email },
          { key: 'status', header: m.fornecedores.col_status, width: 100 },
          { key: 'acoes', header: <span className="sr-only">{m.fornecedores.col_acoes}</span>, width: 90, priority: 'contextual' },
        ]}
      >
        {fornecedores.map((f) => (
          <tr
            key={f.id}
            className={cn(
              'gerente-fin-row-hover transition-colors',
              !f.ativo && 'opacity-60',
            )}
          >
            <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selecionados.has(f.id)}
                onChange={() => toggleOne(f.id)}
                aria-label={`${m.fornecedores.aria_selecionar} ${f.nome}`}
                className="h-4 w-4 rounded app-border"
              />
            </td>
            <td className="px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-xs font-bold text-slate-900">
                  {initials(f.nome)}
                </span>
                <div className="min-w-0">
                  <strong
                    className={cn(
                      'block truncate text-jl-fg-1',
                      !f.ativo && 'line-through decoration-slate-500',
                    )}
                  >
                    {f.nome}
                  </strong>
                  {(f.contato_pessoa || f.categoria) && (
                    <div className="truncate text-[11px] text-jl-fg-3">
                      {[f.contato_pessoa, f.categoria].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            </td>
            <td className="gerente-fin-cell px-3 py-2 font-mono text-xs">{maskCNPJ(f.documento)}</td>
            <td className="gerente-fin-cell px-3 py-2 tabular-nums">{maskTel(f.telefone)}</td>
            <td className="px-3 py-2">
              {f.email ? (
                <a
                  href={`mailto:${f.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-xs text-jl-fg-3 hover:text-amber-400"
                >
                  <Mail className="h-3 w-3" aria-hidden />
                  <span className="truncate">{f.email}</span>
                </a>
              ) : (
                <span className="text-jl-fg-3">—</span>
              )}
            </td>
            <td className="px-3 py-2">
              {f.ativo ? (
                <span className="app-badge-positive inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  {m.fornecedores.status_ativo}
                </span>
              ) : (
                <span className="app-badge-neutral inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  {m.fornecedores.status_inativo}
                </span>
              )}
            </td>
            <td className="px-3 py-2">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  className="app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                  onClick={() => abrirEditar(f)}
                  aria-label={`${m.fornecedores.editar} — ${f.nome}`}
                  title={m.fornecedores.editar}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <ConfirmActionButton
                  type="button"
                  confirmMessage={`${m.fornecedores.confirmar_exclusao} "${f.nome}"?`}
                  className="app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md text-red-300 transition-colors hover:border-red-400/50 hover:text-red-200"
                  onClick={() => void onExcluir(f)}
                  aria-label={`${m.fornecedores.excluir} — ${f.nome}`}
                  title={m.fornecedores.excluir}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </ConfirmActionButton>
              </div>
            </td>
          </tr>
        ))}

        {fornecedores.length === 0 && !loading && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="font-serif text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                供
              </div>
              <div className="mt-3 text-sm font-semibold text-jl-fg-1">{m.fornecedores.vazio_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{m.fornecedores.vazio_sub}</div>
            </td>
          </tr>
        )}
      </GerenteTable>
      </DataTablePage>

      {modalAberto && (
        <FornecedorEditarModal
          idioma={idioma}
          fornecedor={emEdicao}
          onClose={() => setModalAberto(false)}
          onSalvo={onSalvo}
        />
      )}
    </>
  )
}
