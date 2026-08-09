'use client'

/**
 * Clientes — listagem Admin (Onda 6 + Fase A UX).
 * Valida CrudListShell genérico: mesmo contrato visual do Catálogo.
 * Sem CSS/componentes exclusivos do módulo além de helpers/dialog locais.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'
import {
  buscarClientesPaginadosAction,
  excluirClienteAction,
  type ClienteListRow,
} from '@/app/admin/clientes/actions'
import { ClienteEditarModal } from './ClienteEditarModal'
import { ClienteExcluirDialog } from './ClienteExcluirDialog'
import {
  clienteInitials,
  formatContagemClientes,
  maskDocumentoDisplay,
  maskTelefoneDisplay,
} from './clienteDisplayFormat'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  /** Bundle do catalogAdapter (admin 5.3); senão resolve via getMessages(idioma). */
  messages?: Mensagens
  clientesIniciais: ClienteListRow[]
  hasMoreInicial: boolean
  /** Erro da carga SSR — nunca tratar como lista vazia bem-sucedida. */
  erroCargaInicial?: string | null
}>

function stopRowAction(e: MouseEvent) {
  e.stopPropagation()
}

export function ClientesListClient({
  idioma,
  locale,
  messages,
  clientesIniciais,
  hasMoreInicial,
  erroCargaInicial = null,
}: Props) {
  const m = messages ?? getMessages(idioma)
  const [clientes, setClientes] = useState<ClienteListRow[]>(clientesIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(erroCargaInicial)
  const [termo, setTermo] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<ClienteListRow | null>(null)
  const [excluirAlvo, setExcluirAlvo] = useState<ClienteListRow | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const termoDebounced = useDebounce(termo, 280)
  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ hasMore, loading, loadError })

  useEffect(() => {
    stateRef.current = { hasMore, loading, loadError }
  })

  const carregarProxima = useCallback(async () => {
    if (stateRef.current.loading || !stateRef.current.hasMore || stateRef.current.loadError) return
    setLoading(true)
    const prox = pageRef.current + 1
    try {
      const r = await buscarClientesPaginadosAction(prox, termoDebounced || undefined)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      pageRef.current = prox
      setClientes((cur) => [...cur, ...r.clientes])
      setHasMore(r.hasMore)
    } finally {
      setLoading(false)
    }
  }, [termoDebounced])

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

  useEffect(() => {
    if (skipMountRefetch.current) {
      skipMountRefetch.current = false
      if (erroCargaInicial) return
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    pageRef.current = 1
    buscarClientesPaginadosAction(1, termoDebounced || undefined).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        setLoadError(r.error)
        setClientes([])
        setHasMore(false)
        setLoading(false)
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setClientes(r.clientes)
      setHasMore(r.hasMore)
      setLoadError(null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [termoDebounced, erroCargaInicial])

  async function recarregarPrimeiraPagina() {
    setLoading(true)
    setLoadError(null)
    pageRef.current = 1
    const r = await buscarClientesPaginadosAction(1, termoDebounced || undefined)
    if (!r.ok) {
      setLoadError(r.error)
      setClientes([])
      setHasMore(false)
      setLoading(false)
      return
    }
    setClientes(r.clientes)
    setHasMore(r.hasMore)
    setLoading(false)
  }

  function abrirNovo() {
    setEmEdicao(null)
    setModalAberto(true)
  }
  function abrirEditar(c: ClienteListRow) {
    setEmEdicao(c)
    setModalAberto(true)
  }
  function onSalvo(c: ClienteListRow) {
    setClientes((cur) => {
      const i = cur.findIndex((x) => x.id === c.id)
      if (i >= 0) return cur.map((x) => (x.id === c.id ? c : x))
      return [c, ...cur]
    })
    emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
    setModalAberto(false)
  }
  async function confirmarExclusao() {
    if (!excluirAlvo) return
    setExcluindo(true)
    try {
      const r = await excluirClienteAction(excluirAlvo.id)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setClientes((cur) => cur.filter((x) => x.id !== excluirAlvo.id))
      emitGerenteToast({ kind: 'success', message: m.clientes.toast_excluido })
      setExcluirAlvo(null)
    } finally {
      setExcluindo(false)
    }
  }

  const totalCrediario = clientes.reduce((s, c) => s + Number(c.saldo_crediario), 0)
  const buscando = termoDebounced.trim().length > 0
  const contagemTitulo = formatContagemClientes(clientes.length, hasMore, {
    um: m.clientes.contagem_um,
    muitos: m.clientes.contagem_muitos,
    mostrando: m.clientes.contagem_mostrando,
    parcial: m.clientes.contagem_parcial,
  })

  const columns: Column<ClienteListRow>[] = [
    {
      key: 'cliente',
      header: m.clientes.col_cliente,
      priority: 'primary',
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-bg)] text-caption font-bold text-brand">
            {clienteInitials(c.nome)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="truncate text-fg">{c.nome}</strong>
              <Badge
                className={
                  c.tipo === 'PJ'
                    ? 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg font-semibold'
                    : 'border border-[var(--color-info-border)] bg-[var(--color-info-bg)] font-semibold text-brand'
                }
              >
                {c.tipo}
              </Badge>
            </div>
            {c.email ? <div className="truncate text-caption text-fg-muted">{c.email}</div> : null}
          </div>
        </div>
      ),
    },
    {
      key: 'doc',
      header: m.clientes.col_documento,
      priority: 'contextual',
      cell: (c) => (
        <span className="font-mono text-caption text-fg-muted">{maskDocumentoDisplay(c.documento)}</span>
      ),
    },
    {
      key: 'tel',
      header: m.clientes.col_telefone,
      cell: (c) => (
        <span className="tabular-nums text-caption text-fg" title={c.telefone ?? undefined}>
          {maskTelefoneDisplay(c.telefone)}
        </span>
      ),
    },
    {
      key: 'saldo',
      header: m.clientes.col_saldo,
      priority: 'primary',
      align: 'right',
      cell: (c) => {
        const lim = Number(c.limite_crediario)
        const used = Number(c.saldo_crediario)
        const pct = lim > 0 ? Math.min(100, (used / lim) * 100) : 0
        const alerta = pct >= 70
        if (used === 0 && lim === 0) {
          return (
            <span className="text-caption text-fg-muted">{m.clientes.saldo_sem_aberto}</span>
          )
        }
        return (
          <div className="ml-auto min-w-[9.5rem] text-right">
            <div className="flex flex-col items-end gap-0.5">
              <span
                className={cn(
                  'text-caption font-semibold tabular-nums',
                  used === 0 && 'font-normal text-fg-muted',
                  used > 0 && alerta && 'text-[var(--color-danger-strong)]',
                  used > 0 && !alerta && 'text-[var(--color-warning-strong)]',
                )}
              >
                <span className="sr-only">{m.clientes.saldo_em_aberto_label}: </span>
                {m.clientes.saldo_em_aberto_label}{' '}
                {fmtGerenteBRL(used, locale)}
              </span>
              <span className="text-caption tabular-nums text-fg-muted">
                <span className="sr-only">{m.clientes.limite_label}: </span>
                {m.clientes.limite_label} {fmtGerenteBRL(lim, locale)}
              </span>
            </div>
            {lim > 0 ? (
              <div
                className="mt-1 ml-auto h-1 w-full max-w-[9.5rem] overflow-hidden rounded-full bg-[var(--color-surface-soft)]"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={m.clientes.saldo_progresso_aria.replace('{{pct}}', String(Math.round(pct)))}
              >
                <div
                  className={cn(
                    'h-full transition-[width] duration-200',
                    alerta ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-warning)]',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : null}
          </div>
        )
      },
    },
  ]

  const meta =
    totalCrediario > 0 ? (
      <span className="text-caption text-fg-muted">
        <strong className="tabular-nums text-fg">{fmtGerenteBRL(totalCrediario, locale)}</strong>{' '}
        {m.clientes.em_crediario}
      </span>
    ) : undefined

  const emptyState = buscando ? (
    <EmptyState
      title={m.clientes.vazio_titulo}
      description={m.clientes.vazio_sub}
      actionLabel={m.clientes.novo}
      onAction={abrirNovo}
      className="py-8"
    />
  ) : (
    <EmptyState
      title={m.clientes.vazio_base_titulo}
      description={m.clientes.vazio_base_sub}
      actionLabel={m.clientes.novo}
      onAction={abrirNovo}
      className="py-8"
    />
  )

  return (
    <>
      <CrudListShell
        className="gap-3"
        title={loadError ? undefined : contagemTitulo}
        meta={loadError ? undefined : meta}
        toolbar={
          <>
            <div className="min-w-[240px] max-w-[420px] flex-1">
              <SearchInput
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder={m.clientes.placeholder_busca}
                aria-label={m.clientes.placeholder_busca}
                controlSize="sm"
              />
            </div>
            <PageActions>
              <Button type="button" variant="primary" onClick={abrirNovo} className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                {m.clientes.novo}
              </Button>
            </PageActions>
          </>
        }
        footer={
          loadError ? undefined : (
            <div className="flex w-full flex-col items-stretch gap-2">
              {hasMore ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => void carregarProxima()}
                  >
                    {loading ? m.comum.carregando : m.clientes.carregar_mais}
                  </Button>
                </div>
              ) : null}
              <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
            </div>
          )
        }
      >
        {loadError ? (
          <ErrorState
            title={m.clientes.erro_carga_titulo}
            description={loadError || m.clientes.erro_carga_sub}
            onRetry={() => void recarregarPrimeiraPagina()}
            retryLabel={m.clientes.tentar_novamente}
            className="my-2"
          />
        ) : loading && clientes.length === 0 ? (
          <Loading label={m.comum.carregando} className="min-h-0 py-10" size="sm" />
        ) : (
          <DataTable
            columns={columns}
            data={clientes}
            rowKey={(c) => c.id}
            compact
            loading={loading && clientes.length > 0}
            emptyState={emptyState}
            onRowClick={abrirEditar}
            rowActions={(c) => (
              <div className="flex items-center justify-end gap-1" onClick={stopRowAction}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    stopRowAction(e)
                    abrirEditar(c)
                  }}
                  aria-label={`${m.clientes.editar} — ${c.nome}`}
                  title={m.clientes.editar}
                >
                  <Pencil className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    stopRowAction(e)
                    setExcluirAlvo(c)
                  }}
                  aria-label={`${m.clientes.excluir} — ${c.nome}`}
                  title={m.clientes.excluir}
                  className="text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            )}
            className="rounded-none border-x-0 border-b-0"
          />
        )}
      </CrudListShell>

      {modalAberto && (
        <ClienteEditarModal
          idioma={idioma}
          locale={locale}
          messages={m}
          cliente={emEdicao}
          onClose={() => setModalAberto(false)}
          onSalvo={onSalvo}
        />
      )}

      <ClienteExcluirDialog
        open={excluirAlvo !== null}
        nome={excluirAlvo?.nome ?? ''}
        loading={excluindo}
        title={m.clientes.confirmar_exclusao_titulo}
        description={m.clientes.confirmar_exclusao_texto}
        cancelLabel={m.comum.cancelar}
        confirmLabel={m.clientes.excluir}
        confirmingLabel={m.clientes.excluindo}
        onCancel={() => {
          if (!excluindo) setExcluirAlvo(null)
        }}
        onConfirm={() => void confirmarExclusao()}
      />
    </>
  )
}
