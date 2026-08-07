'use client'

/**
 * Clientes — listagem Admin (Onda 6).
 * Valida CrudListShell genérico: mesmo contrato visual do Catálogo.
 * Sem CSS/componentes exclusivos do módulo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Loading } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitToast } from '@/lib/gerente/toast'
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

type Props = Readonly<{
  idioma: Idioma
  locale: string
  /** Bundle do catalogAdapter (admin 5.3); senão resolve via getMessages(idioma). */
  messages?: Mensagens
  clientesIniciais: ClienteListRow[]
  hasMoreInicial: boolean
}>

function maskDoc(d: string): string {
  const x = d.replace(/\D/g, '')
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d
}
function maskTel(t: string | null): string {
  if (!t) return '—'
  const x = t.replace(/\D/g, '')
  if (x.length === 11) return x.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4')
  if (x.length === 10) return x.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return t
}
function initials(nome: string): string {
  return nome.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}

export function ClientesListClient({
  idioma,
  locale,
  messages,
  clientesIniciais,
  hasMoreInicial,
}: Props) {
  const m = messages ?? getMessages(idioma)
  const [clientes, setClientes] = useState<ClienteListRow[]>(clientesIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [termo, setTermo] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<ClienteListRow | null>(null)

  const termoDebounced = useDebounce(termo, 280)
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
      const r = await buscarClientesPaginadosAction(prox, termoDebounced || undefined)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
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
      return
    }
    let cancelled = false
    setLoading(true)
    pageRef.current = 1
    buscarClientesPaginadosAction(1, termoDebounced || undefined).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        setLoading(false)
        return
      }
      setClientes(r.clientes)
      setHasMore(r.hasMore)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [termoDebounced])

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
    emitToast({ kind: 'success', message: m.comum.sucesso })
    setModalAberto(false)
  }
  async function onExcluir(c: ClienteListRow) {
    const r = await excluirClienteAction(c.id)
    if (!r.ok) {
      emitToast({ kind: 'error', message: r.error })
      return
    }
    setClientes((cur) => cur.filter((x) => x.id !== c.id))
    emitToast({ kind: 'success', message: m.clientes.toast_excluido })
  }

  const totalCrediario = clientes.reduce((s, c) => s + Number(c.saldo_crediario), 0)

  const columns: Column<ClienteListRow>[] = [
    {
      key: 'cliente',
      header: m.clientes.col_cliente,
      priority: 'primary',
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-bg)] text-caption font-bold text-brand">
            {initials(c.nome)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="truncate text-fg">{c.nome}</strong>
              <Badge
                className={
                  c.tipo === 'PJ'
                    ? 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-muted'
                    : 'border border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand'
                }
              >
                {c.tipo}
              </Badge>
            </div>
            {c.email ? <div className="truncate text-caption text-fg-subtle">{c.email}</div> : null}
          </div>
        </div>
      ),
    },
    {
      key: 'doc',
      header: m.clientes.col_documento,
      priority: 'contextual',
      cell: (c) => (
        <span className="font-mono text-caption text-fg-muted">{maskDoc(c.documento)}</span>
      ),
    },
    {
      key: 'tel',
      header: m.clientes.col_telefone,
      cell: (c) => <span className="tabular-nums text-caption">{maskTel(c.telefone)}</span>,
    },
    {
      key: 'saldo',
      header: m.clientes.col_saldo,
      priority: 'primary',
      cell: (c) => {
        const lim = Number(c.limite_crediario)
        const used = Number(c.saldo_crediario)
        const pct = lim > 0 ? Math.min(100, (used / lim) * 100) : 0
        const alerta = pct >= 70
        return (
          <div className="min-w-[10rem]">
            <div className="flex items-baseline justify-between gap-2.5">
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  used === 0 && 'font-normal text-fg-subtle',
                  used > 0 && alerta && 'text-[var(--color-danger-strong)]',
                  used > 0 && !alerta && 'text-[var(--color-warning-strong)]',
                )}
              >
                {fmtGerenteBRL(used, locale)}
              </span>
              <span className="text-caption tabular-nums text-fg-subtle">
                / {fmtGerenteBRL(lim, locale)}
              </span>
            </div>
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-soft)]"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${Math.round(pct)}% do limite usado`}
            >
              <div
                className={cn(
                  'h-full transition-[width] duration-200',
                  alerta ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-warning)]',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
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

  return (
    <>
      <CrudListShell
        title={`${clientes.length} ${m.clientes.contagem}`}
        meta={meta}
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
        footer={<div ref={sentinelRef} className="h-1 w-full" aria-hidden />}
      >
        {loading && clientes.length === 0 ? (
          <Loading label={m.comum.carregando} className="min-h-0 py-16" size="sm" />
        ) : (
          <DataTable
            columns={columns}
            data={clientes}
            rowKey={(c) => c.id}
            loading={loading && clientes.length > 0}
            emptyState={
              <EmptyState
                title={m.clientes.vazio_titulo}
                description={m.clientes.vazio_sub}
                actionLabel={m.clientes.novo}
                onAction={abrirNovo}
              />
            }
            rowActions={(c) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => abrirEditar(c)}
                  aria-label={`${m.clientes.editar} — ${c.nome}`}
                  title={m.clientes.editar}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <ConfirmActionButton
                  type="button"
                  confirmMessage={`${m.clientes.confirmar_exclusao} "${c.nome}"?`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-control text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]"
                  onClick={() => void onExcluir(c)}
                  aria-label={`${m.clientes.excluir} — ${c.nome}`}
                  title={m.clientes.excluir}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </ConfirmActionButton>
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
    </>
  )
}
