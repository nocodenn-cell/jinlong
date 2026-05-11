'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Plus, Search } from 'lucide-react'
import React, { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { cn } from '@/lib/utils'
import {
  criarCliente,
  criarTituloReceber,
  enfileirarDocFiscalStub,
  liquidarTitulo,
  processarFilaFiscalAgora,
  reprocessarDocumentoFiscal,
} from './actions'

export type FinanceiroClienteRow = { id: string; nome: string }

export type FinanceiroTituloRow = {
  id: string
  valor_total: number
  valor_aberto: number
  status: string
  descricao: string | null
  vencimento: string | null
  cliente_id: string
  cliente_nome: string | null
}

export type FinanceiroDocRow = {
  id: string
  venda_id: string
  tipo_doc: string
  status: string
  tentativas: number | null
  ultimo_erro: string | null
}

const FORMAS = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS'] as const

function parseForma(raw: string): (typeof FORMAS)[number] {
  return FORMAS.includes(raw as (typeof FORMAS)[number]) ? (raw as (typeof FORMAS)[number]) : 'DINHEIRO'
}

function interStub(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
    template,
  )
}

type Props = Readonly<{
  idioma: Idioma
  clientes: FinanceiroClienteRow[]
  titulos: FinanceiroTituloRow[]
  docsFiscais: FinanceiroDocRow[]
}>

type TituloFilters = {
  opcao: 'mix' | 'ABERTO' | 'PARCIAL'
  nomeCliente: string
  q: string
  de: string
  ate: string
}

const INITIAL_TITULO_FILTERS: TituloFilters = {
  opcao: 'mix',
  nomeCliente: '',
  q: '',
  de: '',
  ate: '',
}

function parseLocalYmd(raw: string | null | undefined): Date | null {
  if (raw == null || String(raw).trim() === '') return null
  const s = String(raw).trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateOnlyOrDash(raw: string | null | undefined, locale: string): string {
  const d = parseLocalYmd(raw)
  if (!d) return '—'
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function tituloMatchesFilters(t: FinanceiroTituloRow, f: TituloFilters): boolean {
  if (f.opcao === 'ABERTO' && t.status !== 'ABERTO') return false
  if (f.opcao === 'PARCIAL' && t.status !== 'PARCIAL') return false
  if (f.opcao === 'mix' && t.status !== 'ABERTO' && t.status !== 'PARCIAL') return false

  const needleNome = f.nomeCliente.trim().toLowerCase()
  if (needleNome) {
    const nome = (t.cliente_nome ?? '').toLowerCase()
    if (!nome.includes(needleNome)) return false
  }

  const needle = f.q.trim().toLowerCase()
  if (needle) {
    const blob = `${t.cliente_nome ?? ''} ${t.descricao ?? ''}`.toLowerCase()
    if (!blob.includes(needle)) return false
  }

  const vd = parseLocalYmd(t.vencimento)
  const de = f.de.trim()
  const ate = f.ate.trim()
  if (de || ate) {
    if (!vd) return false
    const t0 = vd.getTime()
    if (de) {
      const d0 = parseLocalYmd(de)
      if (d0) {
        const start = new Date(d0)
        start.setHours(0, 0, 0, 0)
        if (t0 < start.getTime()) return false
      }
    }
    if (ate) {
      const d1 = parseLocalYmd(ate)
      if (d1) {
        const end = new Date(d1)
        end.setHours(23, 59, 59, 999)
        if (t0 > end.getTime()) return false
      }
    }
  }
  return true
}

function FinField({ id, label, children }: Readonly<{ id: string; label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="gerente-fin-label text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function FinCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: string; children: ReactNode }>) {
  return (
    <section className="dragon-glass-card flex flex-col rounded-xl p-5">
      <h2 className="text-base font-semibold tracking-wide app-accent-text">{title}</h2>
      {description ? <p className="gerente-fin-muted mt-1 text-xs leading-relaxed">{description}</p> : null}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}

const inputClass =
  'w-full rounded-lg px-3 py-2 text-sm shadow-inner app-input disabled:cursor-not-allowed disabled:opacity-60'
const selectClass =
  'w-full rounded-lg px-3 py-2 text-sm shadow-inner app-select disabled:cursor-not-allowed disabled:opacity-60'

const jadeBtnBase =
  'inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-md transition-[filter,box-shadow] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:min-w-[200px] app-btn-accent'

function JadeSubmitButton({
  loading,
  children,
  disabled,
  className,
}: Readonly<{
  loading: boolean
  children: ReactNode
  disabled?: boolean
  className?: string
}>) {
  return (
    <button type="submit" disabled={disabled || loading} className={cn(jadeBtnBase, className)}>
      {loading ? <DragonOuroLoader iconClassName="h-4 w-4 app-surface-text" /> : null}
      <span>{children}</span>
    </button>
  )
}

function JadeActionButton({
  loading,
  children,
  disabled,
  onClick,
  type = 'button',
  className,
}: Readonly<{
  loading: boolean
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(jadeBtnBase, className)}
    >
      {loading ? <DragonOuroLoader iconClassName="h-4 w-4 app-surface-text" /> : null}
      <span>{children}</span>
    </button>
  )
}

export function FinanceiroGerentePageClient({ idioma, clientes, titulos, docsFiscais }: Props) {
  const m = getMessages(idioma)
  const f = m.gerente.financeiro_stub
  const locale = useMemo(() => localeFromIdioma(idioma), [idioma])
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])
  const semClientes = clientes.length === 0

  const { mutate: mutCliente, loading: loadCliente } = useGerenteMutation(
    async (p: { nome: string; documento: string; telefone: string }) => {
      const r = await criarCliente(p)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    { successMessage: f.toast_cliente_ok },
  )

  const { mutate: mutTitulo, loading: loadTitulo } = useGerenteMutation(
    async (p: { cliente_id: string; valor_total: number; descricao: string; vencimento: string }) => {
      const r = await criarTituloReceber({
        cliente_id: p.cliente_id,
        valor_total: p.valor_total,
        descricao: p.descricao || undefined,
        vencimento: p.vencimento || undefined,
      })
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    { successMessage: f.toast_titulo_ok },
  )

  const { mutate: mutLiquidar, loading: loadLiquidar } = useGerenteMutation(
    async (p: { titulo_id: string; valor: number; forma_pagamento: (typeof FORMAS)[number] }) => {
      const r = await liquidarTitulo(p)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: f.toast_liquidar_ok },
  )

  const { mutate: mutFila, loading: loadFila } = useGerenteMutation(
    async () => {
      const r = await processarFilaFiscalAgora(30)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    {
      onSuccess: (data) => {
        if (data) {
          emitGerenteToast({
            kind: 'success',
            message: interStub(f.toast_fila_ok, { emitidos: data.emitted, falhas: data.failed }),
          })
        }
      },
    },
  )

  const { mutate: mutEnfileirar, loading: loadEnfileirar } = useGerenteMutation(
    async (venda_id: string) => {
      const r = await enfileirarDocFiscalStub(venda_id)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: f.toast_enfileirar_ok },
  )

  const { mutate: mutReprocessar, loading: loadReprocessar } = useGerenteMutation(
    async (documento_id: string) => {
      const r = await reprocessarDocumentoFiscal(documento_id)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: f.toast_reprocessar_ok },
  )

  const kpis = useMemo(() => {
    const titulosAbertosCount = titulos.filter((t) => Number(t.valor_aberto) > 1e-6).length
    const valorAbertoTotal = titulos.reduce((s, t) => s + Number(t.valor_aberto ?? 0), 0)
    const filaPendenteCount = docsFiscais.filter((d) => String(d.status).toUpperCase() === 'PENDENTE').length
    const errosFiscaisCount = docsFiscais.filter((d) => String(d.status).toUpperCase() === 'ERRO').length
    return { titulosAbertosCount, valorAbertoTotal, filaPendenteCount, errosFiscaisCount }
  }, [titulos, docsFiscais])

  const novoTituloAnchorRef = useRef<HTMLDivElement>(null)
  const [draftFilters, setDraftFilters] = useState<TituloFilters>(INITIAL_TITULO_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<TituloFilters>(INITIAL_TITULO_FILTERS)

  const titulosFiltrados = useMemo(
    () => titulos.filter((t) => tituloMatchesFilters(t, appliedFilters)),
    [titulos, appliedFilters],
  )

  const valorTotalFiltrado = useMemo(
    () => titulosFiltrados.reduce((s, t) => s + Number(t.valor_aberto ?? 0), 0),
    [titulosFiltrados],
  )

  return (
    <div className="mx-auto max-w-[1580px] px-4 py-5 sm:px-6">
      <Link href="/gerente" className="gerente-nav-back text-sm font-medium transition-colors hover:underline">
        ← {m.gerente.inicio}
      </Link>

      <header className="gerente-fin-header-border mt-4 border-b pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="gerente-fin-page-title text-2xl font-semibold tracking-tight sm:text-3xl">{f.titulo}</h1>
          <span className="gerente-fin-badge rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1">
            {f.badge}
          </span>
        </div>
        <p className="gerente-fin-muted mt-2 max-w-3xl text-sm leading-relaxed">{f.subtitulo}</p>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="dragon-glass-card rounded-xl border p-3 app-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide app-muted">{f.kpi_titulos_abertos}</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums">{kpis.titulosAbertosCount}</div>
          <div className="mt-0.5 text-[11px] app-muted">
            {f.kpi_valor_aberto_total}: {fmtGerenteBRL(kpis.valorAbertoTotal, locale)}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl border p-3 app-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide app-muted">{f.kpi_fila_pendente}</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums">{kpis.filaPendenteCount}</div>
        </div>
        <div className="dragon-glass-card rounded-xl border p-3 app-border">
          <div className="text-[10px] font-semibold uppercase tracking-wide app-muted">{f.kpi_erros_fiscais}</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums">{kpis.errosFiscaisCount}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(200px,260px)] lg:items-start">
        <aside className="dragon-glass-card flex flex-col gap-3 rounded-xl border p-4 app-border lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold tracking-wide app-accent-text">{f.layout_filters_title}</h2>
          <FinField id="fin-filter-opcao" label={f.filter_opcao}>
            <select
              id="fin-filter-opcao"
              value={draftFilters.opcao}
              onChange={(e) =>
                setDraftFilters((p) => ({
                  ...p,
                  opcao: e.target.value as TituloFilters['opcao'],
                }))
              }
              className={selectClass}
            >
              <option value="mix">{f.filter_opcao_em_aberto}</option>
              <option value="ABERTO">{f.filter_opcao_so_aberto}</option>
              <option value="PARCIAL">{f.filter_opcao_parcial}</option>
            </select>
          </FinField>
          <FinField id="fin-filter-cat" label={f.filter_categoria}>
            <select id="fin-filter-cat" disabled value="todas" className={selectClass} title={f.filter_categoria_hint}>
              <option value="todas">{f.filter_categoria_todas}</option>
            </select>
          </FinField>
          <FinField id="fin-filter-nome" label={f.filter_cliente_nome}>
            <input
              id="fin-filter-nome"
              value={draftFilters.nomeCliente}
              onChange={(e) => setDraftFilters((p) => ({ ...p, nomeCliente: e.target.value }))}
              placeholder={f.ph_filter_nome_cliente}
              className={inputClass}
            />
          </FinField>
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="dragon-glass-card flex flex-col gap-3 rounded-xl border p-3 app-border sm:p-4">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70 app-muted"
                aria-hidden
              />
              <input
                value={draftFilters.q}
                onChange={(e) => setDraftFilters((p) => ({ ...p, q: e.target.value }))}
                placeholder={f.toolbar_search_ph}
                className={cn(inputClass, 'gerente-fin-input pl-9')}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2 text-xs font-medium app-muted">
                <Calendar className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="whitespace-nowrap">{f.periodo_venc_de}</span>
              </div>
              <input
                type="date"
                value={draftFilters.de}
                onChange={(e) => setDraftFilters((p) => ({ ...p, de: e.target.value }))}
                className={cn(inputClass, 'sm:max-w-[160px]')}
              />
              <span className="hidden text-xs app-muted sm:inline">{f.periodo_venc_ate}</span>
              <input
                type="date"
                value={draftFilters.ate}
                onChange={(e) => setDraftFilters((p) => ({ ...p, ate: e.target.value }))}
                className={cn(inputClass, 'sm:max-w-[160px]')}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 app-divider">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-semibold app-muted transition hover:underline"
                onClick={() => {
                  setDraftFilters(INITIAL_TITULO_FILTERS)
                  setAppliedFilters(INITIAL_TITULO_FILTERS)
                }}
              >
                {f.btn_limpar_filtros}
              </button>
              <button
                type="button"
                className="inline-flex min-h-[40px] min-w-[120px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 disabled:opacity-55 app-border app-accent-text"
                onClick={() => setAppliedFilters({ ...draftFilters })}
              >
                {f.btn_filtrar}
              </button>
            </div>
          </div>

          <section className="min-w-0">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide app-muted">{f.sec_titulos_aberto}</h2>
            <div className="overflow-x-auto">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'c', header: f.col_cliente },
                  { key: 'v', header: f.col_vencimento },
                  { key: 'a', header: f.col_valor },
                  { key: 's', header: m.gerente.col_status },
                  { key: 'l', header: f.col_liquidar },
                ]}
              >
                {titulos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="gerente-fin-empty px-4 py-10 text-center text-sm">
                      {f.empty_titulos}
                    </td>
                  </tr>
                ) : titulosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="gerente-fin-empty px-4 py-10 text-center text-sm leading-relaxed">
                      <div>{f.empty_filtrados}</div>
                      <div className="mt-2 text-xs app-muted">{f.empty_filtrados_cta}</div>
                    </td>
                  </tr>
                ) : (
                  titulosFiltrados.map((t, idx) => (
                    <tr
                      key={t.id}
                      className={cn(
                        'gerente-fin-row-hover transition-colors',
                        idx % 2 === 1 && 'bg-muted/25',
                      )}
                    >
                      <td className="gerente-fin-cell px-3 py-2.5 font-medium">{t.cliente_nome ?? f.dash}</td>
                      <td className="gerente-fin-cell whitespace-nowrap px-3 py-2.5 tabular-nums">
                        {formatDateOnlyOrDash(t.vencimento, locale)}
                      </td>
                      <td className="gerente-fin-cell whitespace-nowrap px-3 py-2.5 text-sm font-semibold tabular-nums app-accent-text">
                        {fmtGerenteBRL(Number(t.valor_aberto), locale)}
                      </td>
                      <td className="px-3 py-2.5">
                        <GerenteStatusBadge status={t.status} />
                      </td>
                      <td className="min-w-[220px] px-3 py-2.5">
                        <form
                          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
                          onSubmit={(e) => {
                            e.preventDefault()
                            const fd = new FormData(e.currentTarget)
                            const forma = parseForma(readFormDataString(fd, 'forma', 'DINHEIRO'))
                            void mutLiquidar({
                              titulo_id: t.id,
                              valor: Number(fd.get('valor')),
                              forma_pagamento: forma,
                            })
                          }}
                        >
                          <input
                            name="valor"
                            type="number"
                            min={0.01}
                            step="0.01"
                            placeholder={f.liq_placeholder_valor}
                            className={`${inputClass} sm:max-w-[120px]`}
                          />
                          <select name="forma" className={`${selectClass} sm:max-w-[200px]`}>
                            <option value="DINHEIRO">DINHEIRO</option>
                            <option value="PIX">PIX</option>
                            <option value="CARTAO_DEBITO">CARTAO_DEBITO</option>
                            <option value="CARTAO_CREDITO">CARTAO_CREDITO</option>
                            <option value="OUTROS">OUTROS</option>
                          </select>
                          <button
                            type="submit"
                            disabled={loadLiquidar}
                            className="inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-55 app-btn-neutral"
                          >
                            {loadLiquidar ? <DragonOuroLoader iconClassName="h-3.5 w-3.5" /> : null}
                            {loadLiquidar ? f.liq_loading : f.liq_ok}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </GerenteTable>
            </div>
          </section>
        </div>

        <aside className="flex w-full flex-col gap-3 lg:sticky lg:top-4">
          <button
            type="button"
            className={cn(jadeBtnBase, 'w-full justify-center')}
            onClick={() => novoTituloAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            <span>{f.btn_nova_conta}</span>
          </button>
          <div className="dragon-glass-card rounded-xl border p-4 app-border">
            <div className="text-[11px] font-semibold uppercase tracking-wide app-muted">{f.rail_valor_total}</div>
            <div className="mt-2 text-2xl font-bold tabular-nums app-accent-text">
              {fmtGerenteBRL(valorTotalFiltrado, locale)}
            </div>
          </div>
        </aside>
      </div>

      <h2 className="mb-3 mt-10 text-base font-semibold tracking-wide app-accent-text">{f.sec_cadastro_fila}</h2>
      <div className="grid gap-6 lg:grid-cols-3">
        <FinCard title={f.sec_cliente}>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void mutCliente({
                nome: readFormDataString(fd, 'nome'),
                documento: readFormDataString(fd, 'documento'),
                telefone: readFormDataString(fd, 'telefone'),
              })
            }}
          >
            <FinField id="fin-nome" label={f.label_nome}>
              <input id="fin-nome" name="nome" required placeholder={f.ph_nome} className={inputClass} />
            </FinField>
            <FinField id="fin-doc" label={f.label_documento}>
              <input id="fin-doc" name="documento" placeholder={f.ph_documento} className={inputClass} />
            </FinField>
            <FinField id="fin-tel" label={f.label_telefone}>
              <input id="fin-tel" name="telefone" placeholder={f.ph_telefone} className={inputClass} />
            </FinField>
            <JadeSubmitButton loading={loadCliente} className="sm:col-span-2 sm:justify-self-end">
              {loadCliente ? f.btn_salvando : f.btn_salvar_cliente}
            </JadeSubmitButton>
          </form>
        </FinCard>

        <div ref={novoTituloAnchorRef} className="scroll-mt-24">
          <FinCard
            title={f.sec_titulo}
            description={semClientes ? f.sem_clientes_titulo : undefined}
          >
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                void mutTitulo({
                  cliente_id: readFormDataString(fd, 'cliente_id'),
                  valor_total: Number(fd.get('valor_total')),
                  descricao: readFormDataString(fd, 'descricao'),
                  vencimento: readFormDataString(fd, 'vencimento'),
                })
              }}
            >
              <FinField id="fin-cliente-sel" label={f.label_cliente}>
                <select
                  id="fin-cliente-sel"
                  name="cliente_id"
                  required
                  disabled={semClientes}
                  className={selectClass}
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </FinField>
              <FinField id="fin-valor-tit" label={f.label_valor_total}>
                <input
                  id="fin-valor-tit"
                  name="valor_total"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  placeholder={f.ph_valor_titulo}
                  className={inputClass}
                />
              </FinField>
              <FinField id="fin-desc" label={f.label_descricao}>
                <input id="fin-desc" name="descricao" placeholder={f.ph_descricao_titulo} className={inputClass} />
              </FinField>
              <FinField id="fin-ven" label={f.label_vencimento}>
                <input id="fin-ven" name="vencimento" type="date" className={inputClass} />
              </FinField>
              <JadeSubmitButton loading={loadTitulo} disabled={semClientes} className="sm:col-span-2 sm:justify-self-end">
                {loadTitulo ? f.btn_criando : f.btn_criar_titulo}
              </JadeSubmitButton>
            </form>
          </FinCard>
        </div>

        <FinCard title={f.sec_fila} description={f.ajuda_fila}>
          <JadeActionButton loading={loadFila} onClick={() => void mutFila(null)}>
            {f.btn_processar_fila}
          </JadeActionButton>
          <form
            className="gerente-fin-divider grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void mutEnfileirar(readFormDataString(fd, 'venda_id').trim())
            }}
          >
            <FinField id="fin-venda" label={f.label_venda_id}>
              <input id="fin-venda" name="venda_id" required placeholder={f.ph_venda_uuid} className={inputClass} />
            </FinField>
            <JadeSubmitButton loading={loadEnfileirar} className="sm:justify-self-end sm:self-end">
              {loadEnfileirar ? f.btn_enfileirando : f.btn_enfileirar}
            </JadeSubmitButton>
          </form>
        </FinCard>
      </div>

      <section className="dragon-glass-card mt-8 rounded-xl p-5">
        <h2 className="text-lg font-semibold app-accent-text">{f.sec_docs}</h2>
        <div className="mt-4 overflow-x-auto">
          <GerenteTable
            tone="dragon"
            columns={[
              { key: 'st', header: m.gerente.col_status },
              { key: 'v', header: f.col_venda },
              { key: 'tp', header: f.col_tipo },
              { key: 't', header: f.col_tentativas },
              { key: 'e', header: f.col_erro },
              { key: 'dt', header: f.col_detalhe },
              { key: 'ac', header: f.col_acoes },
            ]}
          >
            {docsFiscais.length === 0 ? (
              <tr>
                <td colSpan={7} className="gerente-fin-empty px-4 py-8 text-center text-sm">
                  {f.empty_docs}
                </td>
              </tr>
            ) : (
              docsFiscais.map((d) => (
                <tr key={d.id} className="gerente-fin-row-hover transition-colors">
                  <td className="px-3 py-3">
                    <GerenteStatusBadge status={d.status} />
                  </td>
                  <td className="gerente-fin-cell px-3 py-3 font-mono text-xs">{String(d.venda_id).slice(0, 8)}…</td>
                  <td className="gerente-fin-cell px-3 py-3">{d.tipo_doc}</td>
                  <td className="gerente-fin-cell px-3 py-3 tabular-nums">{Number(d.tentativas ?? 0)}</td>
                  <td className="max-w-[200px] truncate px-3 py-3 text-sm app-badge-danger" title={d.ultimo_erro ?? ''}>
                    {d.ultimo_erro ?? f.dash}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/gerente/financeiro/documento/${d.id}`}
                      className="gerente-nav-back text-sm font-medium hover:underline"
                    >
                      {f.link_timeline}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    {d.status === 'ERRO' || d.status === 'PENDENTE' ? (
                      <ConfirmActionButton
                        type="button"
                        disabled={loadReprocessar}
                        confirmMessage={`Confirma reprocessar o documento ${String(d.id).slice(0, 8)}…? O item voltará para a fila fiscal.`}
                        onClick={() => void mutReprocessar(d.id)}
                        className="inline-flex min-w-[100px] items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm disabled:opacity-55 app-btn-danger"
                      >
                        {loadReprocessar ? <DragonOuroLoader className="app-surface-text" iconClassName="h-3.5 w-3.5" /> : null}
                        {loadReprocessar ? f.liq_loading : f.btn_reprocessar}
                      </ConfirmActionButton>
                    ) : (
                      <span className="gerente-fin-empty text-sm">{f.dash}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </GerenteTable>
        </div>
      </section>
    </div>
  )
}
