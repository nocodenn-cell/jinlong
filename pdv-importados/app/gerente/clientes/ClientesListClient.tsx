'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Pencil, Trash2, Plus, Search } from 'lucide-react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { DataTablePage } from '@/components/gerente/DataTablePage'
import { Button } from '@/components/ui/button'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import {
  buscarClientesPaginadosAction,
  excluirClienteAction,
  type ClienteListRow,
} from './actions'
import { ClienteEditarModal } from './ClienteEditarModal'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  clientesIniciais: ClienteListRow[]
  hasMoreInicial: boolean
  /** Falha ao carregar a página inicial (RLS, rede) — distinto de "nenhum cliente". */
  loadErrorInicial?: string | null
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
  clientesIniciais,
  hasMoreInicial,
  loadErrorInicial = null,
}: Props) {
  const m = getMessages(idioma)
  const [clientes, setClientes] = useState<ClienteListRow[]>(clientesIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(loadErrorInicial)
  const [termo, setTermo] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<ClienteListRow | null>(null)

  const termoDebounced = useDebounce(termo, 280)

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

  // Busca — dispara após debounce
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
        emitGerenteToast({ kind: 'error', message: r.error })
        setLoading(false)
        return
      }
      setClientes(r.clientes)
      setHasMore(r.hasMore)
      setLoadError(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [termoDebounced])

  // —— Handlers ————————————————————————————
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
  async function onExcluir(c: ClienteListRow) {
    const r = await excluirClienteAction(c.id)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setClientes((cur) => cur.filter((x) => x.id !== c.id))
    emitGerenteToast({ kind: 'success', message: m.clientes.toast_excluido })
  }

  const totalCrediario = clientes.reduce((s, c) => s + Number(c.saldo_crediario), 0)

  return (
    <>
      {loadError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive" role="alert">
          {loadError}
        </div>
      ) : null}
      <DataTablePage
        filters={
          <div className="relative w-full min-w-[240px] max-w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-jl-fg-3" aria-hidden />
            <input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={m.clientes.placeholder_busca}
              aria-label={m.clientes.placeholder_busca}
              className="app-input h-9 w-full rounded-md pl-9 pr-3 text-sm shadow-inner"
            />
          </div>
        }
        meta={
          <>
            {clientes.length} {m.clientes.contagem}
            {totalCrediario > 0 && (
              <>
                {' · '}
                <strong className="tabular-nums text-jl-fg-1">
                  {fmtGerenteBRL(totalCrediario, locale)}
                </strong>{' '}
                {m.clientes.em_crediario}
              </>
            )}
          </>
        }
        actions={
          <Button type="button" className="app-btn-accent gap-1.5" onClick={abrirNovo}>
            <Plus className="h-4 w-4" aria-hidden /> {m.clientes.novo}
          </Button>
        }
        pagination={<div ref={sentinelRef} className="h-1 w-full" aria-hidden />}
      >

      <GerenteTable
        tone="dragon"
        compact
        loading={loading && clientes.length === 0}
        columns={[
          { key: 'cliente', header: m.clientes.col_cliente,   priority: 'primary'    },
          { key: 'doc',     header: m.clientes.col_documento,  priority: 'contextual' },
          { key: 'tel',     header: m.clientes.col_telefone                           },
          { key: 'saldo',   header: m.clientes.col_saldo,     width: 220, numeric: true, priority: 'primary' },
          { key: 'acoes',   header: <span className="sr-only">{m.clientes.col_acoes}</span>, width: 90, align: 'right', priority: 'contextual' },
        ]}
      >
        {clientes.map((c) => {
          const lim = Number(c.limite_crediario)
          const used = Number(c.saldo_crediario)
          const pct = lim > 0 ? Math.min(100, (used / lim) * 100) : 0
          const alerta = pct >= 70

          return (
            <tr key={c.id} className="gerente-fin-row-hover transition-colors">
              {/* Nome + tipo + e-mail */}
              <td className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-xs font-bold text-slate-900">
                    {initials(c.nome)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="truncate text-jl-fg-1">{c.nome}</strong>
                      <span
                        className={`inline-flex rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider ${
                          c.tipo === 'PJ'
                            ? 'border border-violet-400/30 bg-violet-400/15 text-violet-200'
                            : 'border border-sky-400/30 bg-sky-400/15 text-sky-200'
                        }`}
                      >
                        {c.tipo}
                      </span>
                    </div>
                    {c.email && (
                      <div className="truncate text-[11px] text-jl-fg-3">{c.email}</div>
                    )}
                  </div>
                </div>
              </td>

              <td className="gerente-fin-cell px-3 py-2 font-mono text-xs">{maskDoc(c.documento)}</td>
              <td className="gerente-fin-cell px-3 py-2 tabular-nums">{maskTel(c.telefone)}</td>

              {/* Saldo crediário */}
              <td className="gerente-fin-cell px-3 py-2">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span
                    className={`font-semibold tabular-nums ${
                      used === 0
                        ? 'text-jl-fg-3 font-normal'
                        : alerta
                          ? 'text-red-300'
                          : 'text-amber-200'
                    }`}
                  >
                    {fmtGerenteBRL(used, locale)}
                  </span>
                  <span className="text-[11px] tabular-nums text-jl-fg-3">
                    / {fmtGerenteBRL(lim, locale)}
                  </span>
                </div>
                <div
                  className="mt-1 h-[5px] overflow-hidden rounded-full bg-jl-surface-soft"
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${Math.round(pct)}% do limite usado`}
                >
                  <div
                    className={`h-full transition-[width] duration-200 ${
                      alerta
                        ? 'bg-gradient-to-r from-amber-500 to-red-700'
                        : 'bg-gradient-to-r from-amber-400 to-amber-700'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </td>

              {/* Ações */}
              <td className="px-3 py-2 text-right">
                <div className="gerente-row-actions flex items-center justify-end gap-1">
                  <button
                    type="button"
                    className="app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    onClick={() => abrirEditar(c)}
                    aria-label={`${m.clientes.editar} — ${c.nome}`}
                    title={m.clientes.editar}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <ConfirmActionButton
                    type="button"
                    confirmMessage={`${m.clientes.confirmar_exclusao} "${c.nome}"?`}
                    className="app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md text-red-300 transition-colors hover:border-red-400/50 hover:text-red-200"
                    onClick={() => void onExcluir(c)}
                    aria-label={`${m.clientes.excluir} — ${c.nome}`}
                    title={m.clientes.excluir}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </ConfirmActionButton>
                </div>
              </td>
            </tr>
          )
        })}

        {clientes.length === 0 && !loading && (
          <tr>
            <td colSpan={5} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="font-serif text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                客
              </div>
              <div className="mt-3 text-sm font-semibold text-jl-fg-1">{m.clientes.vazio_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{m.clientes.vazio_sub}</div>
            </td>
          </tr>
        )}
      </GerenteTable>
      </DataTablePage>

      {modalAberto && (
        <ClienteEditarModal
          idioma={idioma}
          locale={locale}
          cliente={emEdicao}
          onClose={() => setModalAberto(false)}
          onSalvo={onSalvo}
        />
      )}
    </>
  )
}
