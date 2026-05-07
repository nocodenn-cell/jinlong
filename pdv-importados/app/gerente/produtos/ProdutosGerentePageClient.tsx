'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { objectsToCsv } from '@/lib/csv'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import {
  alternarAtivoProduto,
  atualizarPrecoVarejoProduto,
  criarProduto,
} from './actions'

export type ProdutoGerenteRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
}

type Props = Readonly<{
  idioma: Idioma
  rows: ProdutoGerenteRow[]
}>

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(vars[key] ?? ''),
  )
}

function downloadCsv(filename: string, columns: { key: string; header: string }[], rows: Record<string, unknown>[]) {
  const csv = objectsToCsv(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type OrigemCode = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

function OrigemBadgeUi({
  tooltip,
  label,
  className,
}: Readonly<{
  tooltip: string
  label: string
  className: string
}>) {
  return (
    <span
      title={tooltip}
      className={`inline-flex max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  )
}

function PrecoVarejoCell({
  produtoId,
  precoVarejo,
  onSaved,
  msgInvalido,
  msgMaiorZero,
  atualizadoMessage,
}: Readonly<{
  produtoId: string
  precoVarejo: number
  onSaved: () => void
  msgInvalido: string
  msgMaiorZero: string
  atualizadoMessage: string
}>) {
  const [draft, setDraft] = useState(() => String(precoVarejo))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(String(precoVarejo))
  }, [precoVarejo, produtoId])

  const parseValor = (raw: string): number | null => {
    const t = raw.trim().replace(/\s/g, '').replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={saving}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        const n = parseValor(draft)
        if (n === null) {
          emitGerenteToast({
            kind: 'error',
            message: msgInvalido,
          })
          setDraft(String(precoVarejo))
          return
        }
        if (n <= 0) {
          emitGerenteToast({ kind: 'error', message: msgMaiorZero })
          setDraft(String(precoVarejo))
          return
        }
        if (Math.abs(n - precoVarejo) < 0.005) {
          setDraft(String(precoVarejo))
          return
        }
        setSaving(true)
        try {
          const r = await atualizarPrecoVarejoProduto({
            produto_id: produtoId,
            preco_varejo: n,
          })
          if (!r.success) {
            emitGerenteToast({ kind: 'error', message: r.error })
            setDraft(String(precoVarejo))
            return
          }
          emitGerenteToast({ kind: 'success', message: atualizadoMessage })
          onSaved()
        } finally {
          setSaving(false)
        }
      }}
      className="gerente-fin-cell w-full min-w-[6rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs font-semibold tabular-nums app-border hover:border-[color:var(--gerente-ring,theme(colors.slate.500))] focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
      aria-label="Preço varejo"
    />
  )
}

export function ProdutosGerentePageClient({ idioma, rows }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'
  const refetch = useCallback(() => router.refresh(), [router])

  const [busca, setBusca] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(10)
  const [filtroOrigem, setFiltroOrigem] = useState<'all' | OrigemCode>('all')
  const [filtroStatus, setFiltroStatus] = useState<'all' | 'ativo' | 'inativo'>('all')
  const [filtroNf, setFiltroNf] = useState<'all' | 'sim' | 'nao'>('all')

  const produtosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    return rows.filter((p) => {
      if (filtroOrigem !== 'all' && p.origem !== filtroOrigem) return false
      if (filtroStatus === 'ativo' && !p.ativo) return false
      if (filtroStatus === 'inativo' && p.ativo) return false
      if (filtroNf === 'sim' && !p.tem_nf) return false
      if (filtroNf === 'nao' && p.tem_nf) return false
      if (!termo) return true
      const nome = p.nome?.toLowerCase() ?? ''
      const cb = p.codigo_barras ?? ''
      const idLow = p.id.toLowerCase()
      return nome.includes(termo) || cb.includes(termo) || idLow.includes(termo)
    })
  }, [busca, rows, filtroOrigem, filtroStatus, filtroNf])

  const totalPaginas = Math.max(1, Math.ceil(produtosFiltrados.length / itensPorPagina))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)

  useEffect(() => {
    setPaginaAtual((prev) => Math.min(prev, totalPaginas))
  }, [totalPaginas])

  const produtosExibidos = useMemo(() => {
    const inicio = (paginaSegura - 1) * itensPorPagina
    return produtosFiltrados.slice(inicio, inicio + itensPorPagina)
  }, [produtosFiltrados, paginaSegura, itensPorPagina])

  const exportOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportCsv, loading: expLoading } = useGerenteMutation(
    async () => {
      downloadCsv(
        'gerente-produtos.csv',
        [
          { key: 'id', header: 'id' },
          { key: 'nome', header: m.produtos.nome },
          { key: 'codigo_barras', header: m.produtos.codigo_barras },
          { key: 'preco_varejo', header: m.produtos.preco_varejo },
          { key: 'origem', header: m.produtos.origem_label },
          { key: 'tem_nf', header: m.produtos.tem_nf },
          { key: 'ativo', header: m.produtos.status },
        ],
        produtosFiltrados.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo_barras: p.codigo_barras ?? '',
          preco_varejo: Number(p.preco_varejo),
          origem: p.origem,
          tem_nf: p.tem_nf ? '1' : '0',
          ativo: p.ativo ? '1' : '0',
        })),
      )
      return null
    },
    exportOpts,
  )

  const { mutate: criar, loading: criarLoading } = useGerenteMutation(
    async (input: {
      nome: string
      codigo_barras: string
      preco_varejo: number
      origem: string
      tem_nf: boolean
    }) => {
      const r = await criarProduto(input)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    { successMessage: m.comum.sucesso },
  )

  const { mutate: toggle, loading: toggleLoading } = useGerenteMutation(
    async (p: { id: string; ativo: boolean }) => {
      const r = await alternarAtivoProduto(p.id, p.ativo)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: m.comum.sucesso },
  )

  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'

  const resetaPaginaFiltros = () => setPaginaAtual(1)

  return (
    <div className={`mx-auto w-full max-w-7xl space-y-4 px-4 py-6 md:px-6 ${fontClass}`}>
      <GerenteFilterBar
        title={m.produtos.titulo}
        rightSlot={
          <button
            type="button"
            disabled={expLoading || produtosFiltrados.length === 0}
            onClick={() => void exportCsv(null)}
            className="gerente-btn-csv rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {m.gerente.exportar_csv}
          </button>
        }
      />
      <p className="gerente-fin-muted -mt-2 text-xs">
        {idioma === 'pt'
          ? 'Gestão de catálogo com visão densa para operação diária.'
          : '高密度商品管理视图，适合日常运营。'}
      </p>

      <section className="dragon-glass-card overflow-hidden rounded-xl">
        <div className="gerente-fin-divider border-b px-3 py-2.5">
          <h2 className="gerente-section-accent text-sm font-semibold">{m.produtos.cadastro_rapido}</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const nome = readFormDataString(fd, 'nome').trim()
            if (!nome) {
              emitGerenteToast({ kind: 'error', message: m.produtos.nome_obrigatorio })
              return
            }
            void criar({
              nome,
              codigo_barras: readFormDataString(fd, 'codigo_barras'),
              preco_varejo: Number(fd.get('preco_varejo')),
              origem: readFormDataString(fd, 'origem'),
              tem_nf: fd.get('tem_nf') === 'on',
            })
            e.currentTarget.reset()
          }}
          className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-6"
        >
          <input name="nome" placeholder={m.produtos.nome} className={`${finIn} md:col-span-2`} />
          <input name="codigo_barras" placeholder={m.produtos.codigo_barras} className={finIn} />
          <input
            name="preco_varejo"
            type="number"
            step="0.01"
            min="0"
            placeholder={m.produtos.preco_varejo}
            required
            className={finIn}
          />
          <select name="origem" defaultValue="china_manual" className={finSelect}>
            <option value="china_manual">{m.produtos.origem_china}</option>
            <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
            <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
          </select>
          <button
            type="submit"
            disabled={criarLoading}
            className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
          >
            {criarLoading ? '…' : m.comum.salvar}
          </button>
          <label className="gerente-fin-muted md:col-span-6 inline-flex items-center gap-2 text-xs">
            <input type="checkbox" name="tem_nf" className="h-3.5 w-3.5 rounded app-border app-surface-soft" />
            {m.produtos.tem_nf}
            <span className="opacity-80">· {m.produtos.codigo_barras_opcional}</span>
          </label>
        </form>
      </section>

      <section className="dragon-glass-card overflow-hidden rounded-xl">
        <div className="gerente-fin-divider flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
          <h2 className="gerente-section-accent text-sm font-semibold">{m.produtos.lista_produtos}</h2>
          <p className="gerente-fin-muted text-xs font-medium">
            {interpolate(m.produtos.contador_encontrados, { count: produtosFiltrados.length })}
          </p>
        </div>

        <div className="gerente-fin-divider grid grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPaginaAtual(1)
            }}
            placeholder={m.produtos.buscar}
            className={`${finIn} h-8`}
            aria-label={m.produtos.buscar}
          />
          <select
            value={filtroOrigem}
            onChange={(e) => {
              setFiltroOrigem(e.target.value as 'all' | OrigemCode)
              resetaPaginaFiltros()
            }}
            className={`${finSelect} h-8`}
          >
            <option value="all">{m.produtos.filtro_todas_origens}</option>
            <option value="china_manual">{m.produtos.origem_china}</option>
            <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
            <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => {
              setFiltroStatus(e.target.value as 'all' | 'ativo' | 'inativo')
              resetaPaginaFiltros()
            }}
            className={`${finSelect} h-8`}
          >
            <option value="all">{m.produtos.filtro_todos_status}</option>
            <option value="ativo">{m.produtos.ativo}</option>
            <option value="inativo">{m.produtos.inativo}</option>
          </select>
          <select
            value={filtroNf}
            onChange={(e) => {
              setFiltroNf(e.target.value as 'all' | 'sim' | 'nao')
              resetaPaginaFiltros()
            }}
            className={`${finSelect} h-8`}
          >
            <option value="all">{m.produtos.filtro_todas_nf}</option>
            <option value="sim">{m.produtos.filtro_nf_sim}</option>
            <option value="nao">{m.produtos.filtro_nf_nao}</option>
          </select>
        </div>

        <div className="p-3">
          <GerenteTable
            tone="dragon"
            columns={[
              { key: 'id', header: 'ID' },
              { key: 'nome', header: m.produtos.nome },
              { key: 'cb', header: m.produtos.codigo_barras },
              { key: 'preco', header: m.produtos.preco_varejo, width: '7rem' },
              { key: 'origem', header: m.produtos.origem_label },
              { key: 'nf', header: m.produtos.tem_nf },
              { key: 'st', header: m.produtos.status },
              { key: 'ac', header: m.produtos.acoes, width: '6rem' },
            ]}
          >
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="gerente-fin-empty px-3 py-4 text-xs">
                  {m.produtos.nenhum_produto_cadastrado}
                </td>
              </tr>
            ) : produtosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="gerente-fin-empty px-3 py-4 text-xs">
                  {m.produtos.nenhum_resultado_filtro}
                </td>
              </tr>
            ) : (
              produtosExibidos.map((p) => (
                <tr key={p.id} className="group gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px] opacity-80">
                    <span title={p.id}>{p.id.length <= 6 ? p.id : p.id.slice(-6)}</span>
                  </td>
                  <td className="gerente-fin-cell px-3 py-2 font-medium leading-relaxed">{p.nome}</td>
                  <td className="gerente-fin-cell px-3 py-2 font-mono">{p.codigo_barras ?? '-'}</td>
                  <td className="gerente-fin-cell px-1 py-1 text-right">
                    <PrecoVarejoCell
                      produtoId={p.id}
                      precoVarejo={Number(p.preco_varejo)}
                      onSaved={refetch}
                      msgInvalido={m.produtos.preco_invalido}
                      msgMaiorZero={m.produtos.preco_maior_zero}
                      atualizadoMessage={m.produtos.preco_atualizado}
                    />
                  </td>
                  <td className="gerente-fin-cell px-3 py-2">
                    {p.origem === 'china_manual' ? (
                      <OrigemBadgeUi
                        label={m.produtos.origem_china}
                        tooltip={m.produtos.tooltip_origem_china_manual}
                        className="border-amber-500/50 bg-amber-500/15 text-amber-100"
                      />
                    ) : p.origem === 'brasil_sem_nf' ? (
                      <OrigemBadgeUi
                        label={m.produtos.origem_brasil_sem_nf}
                        tooltip={m.produtos.tooltip_origem_brasil_sem_nf}
                        className="border-slate-500/50 bg-slate-500/20 text-slate-100"
                      />
                    ) : (
                      <OrigemBadgeUi
                        label={m.produtos.origem_brasil_nf}
                        tooltip={m.produtos.tooltip_origem_brasil_nf}
                        className="border-emerald-500/45 bg-emerald-500/15 text-emerald-100"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <GerenteStatusBadge status={p.tem_nf ? 'TEM_NF' : 'SEM_NF'} label={p.tem_nf ? m.comum.sim : m.comum.nao} />
                  </td>
                  <td className="px-3 py-2">
                    <GerenteStatusBadge
                      status={p.ativo ? 'ATIVO' : 'INATIVO'}
                      label={p.ativo ? m.produtos.ativo : m.produtos.inativo}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={toggleLoading}
                      onClick={() => void toggle({ id: p.id, ativo: !p.ativo })}
                      className="gerente-chip-action rounded-md border px-2 py-1 text-[11px] font-medium opacity-90 transition group-hover:opacity-100 disabled:opacity-40"
                    >
                      {p.ativo ? m.produtos.inativar : m.produtos.ativar}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </GerenteTable>
        </div>

        {rows.length > 0 ? (
          <div className="gerente-fin-divider flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="gerente-fin-muted text-xs">
              {interpolate(m.produtos.pag_mostrar, {
                visiveis: produtosExibidos.length,
                total: produtosFiltrados.length,
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <label className="flex items-center gap-2 text-xs gerente-fin-muted">
                <span>{m.produtos.pag_linhas_por_pagina}</span>
                <select
                  value={itensPorPagina}
                  onChange={(e) => {
                    setItensPorPagina(Number(e.target.value))
                    setPaginaAtual(1)
                  }}
                  className={`${finSelect} h-8 min-w-[4.5rem]`}
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={paginaSegura <= 1}
                  onClick={() => setPaginaAtual((x) => Math.max(1, x - 1))}
                  className="rounded-full p-2 opacity-90 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={m.produtos.pag_prev}
                >
                  <ChevronLeft size={20} className="shrink-0" />
                </button>
                <span className="text-xs font-medium tabular-nums">
                  {interpolate(m.produtos.pag_info, { atual: paginaSegura, total: totalPaginas })}
                </span>
                <button
                  type="button"
                  disabled={paginaSegura >= totalPaginas}
                  onClick={() => setPaginaAtual((x) => Math.min(totalPaginas, x + 1))}
                  className="rounded-full p-2 opacity-90 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={m.produtos.pag_next}
                >
                  <ChevronRight size={20} className="shrink-0" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
