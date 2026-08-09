'use client'

/**
 * Fornecedores — listagem Admin (Catálogo Onda 5 + UX audit 2026-08).
 * Mesmo contrato CRUD: toolbar · bulk · DataTable · empty/loading/error · modal.
 * Lógica de busca/paginação/lote preservada; chrome visual no DS.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Pencil, Trash2, Plus, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
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
import {
  filtrosFornecedorAtivos,
  montarTituloContagem,
  type StatusFiltroFornecedor,
} from './fornecedoresListUi'

type Props = Readonly<{
  idioma: Idioma
  fornecedoresIniciais: FornecedorListRow[]
  hasMoreInicial: boolean
  erroInicial?: string | null
}>

type StatusFiltro = StatusFiltroFornecedor

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
  erroInicial = null,
}: Props) {
  const m = getMessages(idioma)
  const [fornecedores, setFornecedores] = useState<FornecedorListRow[]>(fornecedoresIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [erroLista, setErroLista] = useState<string | null>(erroInicial)
  const [termo, setTermo] = useState('')
  const [statusF, setStatusF] = useState<StatusFiltro>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<FornecedorListRow | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const termoDebounced = useDebounce(termo, 280)
  const statusFDebounced = useDebounce(statusF, 280)

  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  const aplicarResultadoPagina = useCallback(
    (r: Awaited<ReturnType<typeof buscarFornecedoresPaginadosAction>>) => {
      if (!r.ok) {
        setErroLista(r.error)
        setFornecedores([])
        setHasMore(false)
        setLoading(false)
        return
      }
      setErroLista(null)
      setFornecedores(r.fornecedores)
      setHasMore(r.hasMore)
      setSelecionados(new Set())
      setLoading(false)
    },
    [],
  )

  useEffect(() => {
    if (skipMountRefetch.current) {
      skipMountRefetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    setErroLista(null)
    pageRef.current = 1
    buscarFornecedoresPaginadosAction(1, {
      termo: termoDebounced || undefined,
      status: statusFDebounced,
    }).then((r) => {
      if (cancelled) return
      aplicarResultadoPagina(r)
    })
    return () => {
      cancelled = true
    }
  }, [termoDebounced, statusFDebounced, aplicarResultadoPagina])

  async function recarregarPrimeiraPagina() {
    setLoading(true)
    setErroLista(null)
    pageRef.current = 1
    const r = await buscarFornecedoresPaginadosAction(1, {
      termo: termoDebounced || undefined,
      status: statusFDebounced,
    })
    aplicarResultadoPagina(r)
  }

  function limparFiltros() {
    setTermo('')
    setStatusF('todos')
  }

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
  const filtrosAtivos = filtrosFornecedorAtivos(termo, statusF)

  const headerRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.indeterminate = algumNaPag && !todosNaPag
    },
    [algumNaPag, todosNaPag],
  )

  const colHideMd = 'hidden md:table-cell'

  const columns: Column<FornecedorListRow>[] = [
    {
      key: 'sel',
      header: m.fornecedores.aria_selecionar_pagina,
      width: '40px',
      headerCell: () =>
        fornecedores.length === 0 ? null : (
          <Checkbox
            ref={headerRef}
            checked={todosNaPag}
            onChange={togglePagina}
            aria-label={m.fornecedores.aria_selecionar_pagina}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      cell: (f) => (
        <Checkbox
          checked={selecionados.has(f.id)}
          onChange={() => toggleOne(f.id)}
          aria-label={`${m.fornecedores.aria_selecionar} ${f.nome}`}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'nome',
      header: m.fornecedores.col_nome,
      priority: 'primary',
      cell: (f) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-bg)] text-caption font-bold text-brand">
            {initials(f.nome)}
          </span>
          <div className="min-w-0">
            <strong
              className={cn(
                'block truncate text-fg',
                !f.ativo && 'line-through decoration-[var(--color-fg-subtle)]',
              )}
            >
              {f.nome}
            </strong>
            {(f.contato_pessoa || f.categoria) && (
              <div className="truncate text-caption text-fg-subtle">
                {[f.contato_pessoa, f.categoria].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'doc',
      header: m.fornecedores.col_documento,
      priority: 'contextual',
      cell: (f) => (
        <span className="font-mono text-caption text-fg-muted">{maskCNPJ(f.documento)}</span>
      ),
    },
    {
      key: 'tel',
      header: m.fornecedores.col_telefone,
      priority: 'contextual',
      headerClassName: colHideMd,
      className: colHideMd,
      cell: (f) => <span className="tabular-nums text-caption">{maskTel(f.telefone)}</span>,
    },
    {
      key: 'email',
      header: m.fornecedores.col_email,
      headerClassName: colHideMd,
      className: colHideMd,
      cell: (f) =>
        f.email ? (
          <a
            href={`mailto:${f.email}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-caption text-fg-muted hover:text-brand"
          >
            <Mail className="h-3 w-3" aria-hidden />
            <span className="truncate">{f.email}</span>
          </a>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'status',
      header: m.fornecedores.col_status,
      width: '100px',
      cell: (f) => (
        <Badge
          className={
            f.ativo
              ? 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]'
              : 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-subtle'
          }
        >
          {f.ativo ? m.fornecedores.status_ativo : m.fornecedores.status_inativo}
        </Badge>
      ),
    },
  ]

  const statusOptions: StatusFiltro[] = ['todos', 'ativos', 'inativos']
  const tituloLista = montarTituloContagem(fornecedores.length, hasMore, {
    mostrando: m.fornecedores.mostrando,
    ha_mais: m.fornecedores.ha_mais,
  })

  const emptyState = filtrosAtivos ? (
    <EmptyState
      title={m.fornecedores.vazio_filtrado_titulo}
      description={m.fornecedores.vazio_filtrado_sub}
      actionLabel={m.comum.limpar_filtros}
      onAction={limparFiltros}
    />
  ) : (
    <EmptyState
      title={m.fornecedores.vazio_titulo}
      description={m.fornecedores.vazio_sub}
      actionLabel={m.fornecedores.novo}
      onAction={abrirNovo}
    />
  )

  let listBody: ReactNode
  if (loading && fornecedores.length === 0) {
    listBody = <Loading label={m.comum.carregando} className="min-h-0 py-16" size="sm" />
  } else if (erroLista && fornecedores.length === 0) {
    listBody = (
      <ErrorState
        title={m.fornecedores.erro_titulo}
        description={m.fornecedores.erro_descricao}
        retryLabel={m.fornecedores.tentar_novamente}
        onRetry={() => void recarregarPrimeiraPagina()}
        className="m-4"
      />
    )
  } else {
    listBody = (
      <DataTable
        columns={columns}
        data={fornecedores}
        rowKey={(f) => f.id}
        loading={loading && fornecedores.length > 0}
        onRowClick={abrirEditar}
        emptyState={emptyState}
        rowActions={(f) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => abrirEditar(f)}
              aria-label={`${m.fornecedores.editar} — ${f.nome}`}
              title={m.fornecedores.editar}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <ConfirmActionButton
              type="button"
              confirmMessage={`${m.fornecedores.confirmar_exclusao} "${f.nome}"?`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-control text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]"
              onClick={() => void onExcluir(f)}
              aria-label={`${m.fornecedores.excluir} — ${f.nome}`}
              title={m.fornecedores.excluir}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </ConfirmActionButton>
          </div>
        )}
        className="rounded-none border-x-0 border-b-0"
      />
    )
  }

  return (
    <>
      <CrudListShell
        title={tituloLista}
        toolbar={
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="min-w-[240px] max-w-[420px] flex-1">
                <SearchInput
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={m.fornecedores.placeholder_busca}
                  aria-label={m.fornecedores.placeholder_busca}
                  controlSize="sm"
                />
              </div>
              <div
                className="inline-flex items-center gap-0.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-0.5"
                role="group"
                aria-label={m.fornecedores.col_status}
              >
                {statusOptions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusF(s)}
                    aria-pressed={statusF === s}
                    className={cn(
                      'fp-focus-ring rounded-sm px-2.5 py-1 text-caption font-medium',
                      statusF === s
                        ? 'bg-[var(--color-info-bg)] text-brand'
                        : 'text-fg-subtle hover:text-fg',
                    )}
                  >
                    {m.fornecedores[`filtro_${s}` as const]}
                  </button>
                ))}
              </div>
              {filtrosAtivos ? (
                <Button type="button" size="sm" variant="ghost" onClick={limparFiltros}>
                  {m.comum.limpar_filtros}
                </Button>
              ) : null}
            </div>
            <PageActions>
              <Button type="button" variant="primary" onClick={abrirNovo} className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                {m.fornecedores.novo}
              </Button>
            </PageActions>
          </>
        }
        bulkBar={
          selecionados.size > 0 ? (
            <>
              <span className="text-body font-medium text-fg">
                <strong className="font-bold tabular-nums text-brand">{selecionados.size}</strong>{' '}
                {m.fornecedores.bulk_selecionados}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => onBulkAtivar(true)}>
                  {m.fornecedores.bulk_ativar}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onBulkAtivar(false)}>
                  {m.fornecedores.bulk_inativar}
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => void onBulkExcluir()}>
                  {m.fornecedores.bulk_excluir}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                  {m.fornecedores.bulk_limpar}
                </Button>
              </div>
            </>
          ) : undefined
        }
        footer={<div ref={sentinelRef} className="h-1 w-full" aria-hidden />}
      >
        {listBody}
      </CrudListShell>

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
