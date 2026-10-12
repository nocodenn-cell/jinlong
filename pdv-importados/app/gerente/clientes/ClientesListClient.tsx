'use client'

/**
 * Clientes — listagem Admin (Onda 6 + Fase A UX).
 * Valida CrudListShell genérico: mesmo contrato visual do Catálogo.
 * Sem CSS/componentes exclusivos do módulo além de helpers/dialog locais.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { AlertTriangle, Receipt, Plus } from 'lucide-react'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/forms'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RowActionsMenu } from '@/components/ui/RowActionsMenu'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { CrudListShell, PageActions } from '@/components/ui/admin-v2'
import { DragonModal } from '@/components/ui/DragonModal'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'
import {
  buscarClientesPaginadosAction,
  excluirClienteAction,
  type ClienteListaFiltro,
  type ClienteListRow,
} from '@/app/admin/clientes/actions'
import { ClienteEditarModal } from './ClienteEditarModal'
import { ClienteFichaDrawer } from './ClienteFichaDrawer'
import { escopoCrediario } from './clienteListaEscopo'
import {
  clienteInitials,
  formatContagemClientes,
  maskDocumentoDisplay,
  maskTelefoneDisplay,
} from './clienteDisplayFormat'

type TipoFiltro = 'todos' | 'PF' | 'PJ'
type SituacaoFiltro = 'todos' | 'aberto' | 'atraso'

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

function montarFiltro(tipo: TipoFiltro, situacao: SituacaoFiltro): ClienteListaFiltro {
  return {
    tipo: tipo === 'todos' ? undefined : tipo,
    situacao: situacao === 'todos' ? undefined : situacao,
  }
}

function rotuloDoEscopo(
  escopo: ReturnType<typeof escopoCrediario>,
  m: Mensagens,
): string {
  if (escopo === 'filtrado') return m.clientes.crediario_filtrado
  if (escopo === 'parcial') return m.clientes.crediario_parcial
  return m.clientes.crediario_todos
}

function FiltrosCliente({
  m,
  tipoF,
  situacaoF,
  onTipo,
  onSituacao,
}: {
  m: Mensagens
  tipoF: TipoFiltro
  situacaoF: SituacaoFiltro
  onTipo: (tipo: TipoFiltro) => void
  onSituacao: (situacao: SituacaoFiltro) => void
}) {
  const tipos: TipoFiltro[] = ['todos', 'PF', 'PJ']
  const chips: SituacaoFiltro[] = ['todos', 'aberto', 'atraso']
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <label className="flex items-center gap-2 text-caption text-fg-muted">
        {m.clientes.filtro_tipo}
        <select
          value={tipoF}
          aria-label={m.clientes.filtro_tipo}
          data-testid="cliente-filtro-tipo"
          className="min-h-9 rounded-control border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-caption text-fg"
          onChange={(e) => onTipo(e.target.value as TipoFiltro)}
        >
          {tipos.map((tipo) => (
            <option key={tipo} value={tipo}>{rotuloTipo(tipo, m)}</option>
          ))}
        </select>
      </label>
      <div role="group" aria-label={m.clientes.chip_situacao} className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            data-testid={`cliente-chip-${chip}`}
            aria-pressed={situacaoF === chip}
            className={cn(
              'min-h-9 rounded-full px-3 text-caption',
              situacaoF === chip ? 'bg-[var(--color-info-bg)] font-semibold text-brand' : 'text-fg-muted',
            )}
            onClick={() => onSituacao(chip)}
          >
            {rotuloChip(chip, m)}
          </button>
        ))}
      </div>
    </div>
  )
}

function rotuloTipo(tipo: TipoFiltro, m: Mensagens): string {
  if (tipo === 'PF') return m.clientes.filtro_tipo_pf
  if (tipo === 'PJ') return m.clientes.filtro_tipo_pj
  return m.clientes.filtro_tipo_todos
}

function rotuloChip(chip: SituacaoFiltro, m: Mensagens): string {
  if (chip === 'aberto') return m.clientes.chip_aberto
  if (chip === 'atraso') return m.clientes.chip_atraso
  return m.clientes.chip_todos
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
  const [tipoF, setTipoF] = useState<TipoFiltro>('todos')
  const [situacaoF, setSituacaoF] = useState<SituacaoFiltro>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<ClienteListRow | null>(null)
  const [ficha, setFicha] = useState<ClienteListRow | null>(null)
  const [excluirAlvo, setExcluirAlvo] = useState<ClienteListRow | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const termoDebounced = useDebounce(termo, 280)
  const filtro = useMemo(() => montarFiltro(tipoF, situacaoF), [tipoF, situacaoF])
  const filtroAtivo = termoDebounced.trim().length > 0 || tipoF !== 'todos' || situacaoF !== 'todos'
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
      const r = await buscarClientesPaginadosAction(prox, termoDebounced || undefined, filtro)
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
  }, [termoDebounced, filtro])

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
    buscarClientesPaginadosAction(1, termoDebounced || undefined, filtro).then((r) => {
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
  }, [termoDebounced, filtro, erroCargaInicial])

  async function recarregarPrimeiraPagina() {
    setLoading(true)
    setLoadError(null)
    pageRef.current = 1
    const r = await buscarClientesPaginadosAction(1, termoDebounced || undefined, filtro)
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
    setFicha(null)
    setEmEdicao(c)
    setModalAberto(true)
  }
  function abrirFicha(c: ClienteListRow) {
    setFicha(c)
  }
  function limparFiltros() {
    setTermo('')
    setTipoF('todos')
    setSituacaoF('todos')
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
  const buscando = filtroAtivo
  const rotuloCrediario = rotuloDoEscopo(escopoCrediario(filtroAtivo, hasMore), m)
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
      sticky: true,
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-bg)] text-caption font-bold text-brand">
            {clienteInitials(c.nome)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="truncate text-left font-semibold text-fg hover:underline"
                data-testid="cliente-nome"
                onClick={(e) => {
                  stopRowAction(e)
                  abrirFicha(c)
                }}
              >
                {c.nome}
              </button>
              <Badge
                className={
                  c.tipo === 'PJ'
                    ? 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg font-semibold'
                    : 'border border-[var(--color-info-border)] bg-[var(--color-info-bg)] font-semibold text-brand'
                }
              >
                {c.tipo === 'PJ' ? m.clientes.tipo_sigla_pj : m.clientes.tipo_sigla_pf}
              </Badge>
            </div>
            <span className="block truncate whitespace-nowrap font-mono text-caption text-fg-muted">{maskDocumentoDisplay(c.documento)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'contato',
      header: m.clientes.col_contato,
      cell: (c) => (
        <div className="min-w-0">
          <span className="block whitespace-nowrap tabular-nums text-caption text-fg" title={c.telefone ?? undefined}>
            {maskTelefoneDisplay(c.telefone)}
          </span>
          {c.email ? <div className="truncate text-caption text-fg-muted">{c.email}</div> : null}
        </div>
      ),
    },
    {
      key: 'saldo',
      header: m.clientes.col_situacao,
      priority: 'primary',
      align: 'right',
      cell: (c) => {
        const lim = Number(c.limite_crediario)
        const used = Number(c.saldo_crediario)
        const pct = lim > 0 ? Math.min(100, (used / lim) * 100) : 0
        const alerta = pct >= 70
        if (used === 0) {
          return (
            <div className="text-right">
              <span className="text-caption text-fg-muted">{m.clientes.saldo_sem_aberto}</span>
              {lim > 0 ? (
                <div className="text-caption tabular-nums text-fg-muted">
                  {m.clientes.limite_label} {fmtGerenteBRL(lim, locale)}
                </div>
              ) : null}
            </div>
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
              {used > 0 ? (
                <Link
                  href={pathWithQuery(
                    ROUTES.admin.financeiro,
                    new URLSearchParams({ tab: 'receber', cliente_id: c.id, cliente: c.nome }),
                  )}
                  onClick={(e) => stopRowAction(e)}
                  className="inline-flex items-center gap-1 text-caption text-[var(--color-info)] hover:underline"
                >
                  <Receipt size={11} aria-hidden />
                  {m.clientes.ver_financeiro}
                </Link>
              ) : null}
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
    totalCrediario > 0 || filtroAtivo ? (
      <span className="text-caption text-fg-muted" data-testid="clientes-crediario-escopo">
        <strong className="tabular-nums text-fg">{fmtGerenteBRL(totalCrediario, locale)}</strong>{' '}
        {m.clientes.em_crediario}{' '}
        <span>{rotuloCrediario}</span>
      </span>
    ) : undefined

  const emptyState = buscando ? (
    <EmptyState
      title={m.clientes.vazio_titulo}
      description={situacaoF === 'atraso' ? m.clientes.vazio_atraso_sub : m.clientes.vazio_sub}
      actionLabel={m.comum.limpar_filtros}
      onAction={limparFiltros}
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
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="min-w-[200px] max-w-[420px] flex-1">
                <SearchInput
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={m.clientes.placeholder_busca}
                  aria-label={m.clientes.placeholder_busca}
                  controlSize="sm"
                />
              </div>
              <FiltrosCliente
                m={m}
                tipoF={tipoF}
                situacaoF={situacaoF}
                onTipo={setTipoF}
                onSituacao={setSituacaoF}
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
            onRowClick={abrirFicha}
            rowActions={(c) => (
              <div className="flex items-center justify-end gap-1" onClick={stopRowAction}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="cliente-ver-detalhes"
                  onClick={(e) => {
                    stopRowAction(e)
                    abrirFicha(c)
                  }}
                >
                  {m.clientes.ver_detalhes}
                </Button>
                <RowActionsMenu
                  label={`${m.clientes.menu_acoes} — ${c.nome}`}
                  items={[
                    { id: 'editar', label: m.clientes.editar, onClick: () => abrirEditar(c) },
                    {
                      id: 'excluir',
                      label: m.clientes.excluir,
                      danger: true,
                      onClick: () => setExcluirAlvo(c),
                    },
                  ]}
                />
              </div>
            )}
            className="rounded-none border-x-0 border-b-0"
          />
        )}
      </CrudListShell>

      {ficha ? (
        <ClienteFichaDrawer
          cliente={ficha}
          locale={locale}
          messages={m}
          onClose={() => setFicha(null)}
          onEditar={() => abrirEditar(ficha)}
        />
      ) : null}

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

      <DragonModal
        open={excluirAlvo !== null}
        onClose={() => {
          if (!excluindo) setExcluirAlvo(null)
        }}
        variant="danger"
        size="sm"
        icon={AlertTriangle}
        title={m.clientes.confirmar_exclusao_titulo}
        dismissable={!excluindo}
        closeLabel={m.comum.cancelar}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExcluirAlvo(null)}
              disabled={excluindo}
            >
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void confirmarExclusao()}
              disabled={excluindo}
            >
              {excluindo ? m.clientes.excluindo : m.clientes.excluir}
            </Button>
          </>
        }
      >
        <p className="pb-1 text-body text-fg-muted">
          {m.clientes.confirmar_exclusao_texto.replace('{{nome}}', excluirAlvo?.nome ?? '')}
        </p>
      </DragonModal>
    </>
  )
}
