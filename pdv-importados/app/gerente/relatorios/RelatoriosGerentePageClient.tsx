'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import { formatarDiaRelatorioParaLocale } from '@/lib/relatorios/periodoRelatorio'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { getMessages } from '@/i18n/getMessages'
import { formatBRL, formatDecimalPlaces } from '@/lib/format/money'
import { carregarDadosRelatoriosGerente } from './actions'
import { getAvisoPeriodo } from '@/app/gerente/relatorios/relatoriosGerenteUtils'
import { useRelatoriosGerenteExports } from '@/app/gerente/relatorios/useRelatoriosGerenteExports'
import { cn } from '@/lib/utils'

const REL_EXPORT_BTN_CLASS =
  'gerente-btn-csv inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45'

type Props = Readonly<{
  idioma: Idioma
}>

export function RelatoriosGerentePageClient({ idioma }: Props) {
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const router = useRouter()
  const searchParams = useSearchParams()
  const deUrl = searchParams.get('de') ?? ''
  const ateUrl = searchParams.get('ate') ?? ''

  const [de, setDe] = useState(deUrl)
  const [ate, setAte] = useState(ateUrl)

  const queryFn = useCallback(
    () => carregarDadosRelatoriosGerente({ de: de || undefined, ate: ate || undefined }),
    [de, ate],
  )
  const { data, loading, refetch } = useGerenteQuery(queryFn)

  useEffect(() => {
    const d = searchParams.get('de')
    const a = searchParams.get('ate')
    if (d) setDe(d)
    if (a) setAte(a)
  }, [searchParams])

  useEffect(() => {
    if (!data) return
    const urlEmpty = !searchParams.get('de') && !searchParams.get('ate')
    if (urlEmpty) {
      setDe(data.periodo.de)
      setAte(data.periodo.ate)
    }
  }, [data, searchParams])

  const csvSuffix = data ? `${data.periodo.de}_${data.periodo.ate}` : 'periodo'

  const vendasDiaColumns = useMemo(
    () => [
      { key: 'dia', header: m.gerente.col_dia },
      { key: 'num_vendas', header: m.gerente.col_num_vendas },
      { key: 'total_liquido', header: m.relatorios.valor },
      { key: 'ticket_medio', header: m.gerente.col_ticket },
      { key: 'total_desconto', header: m.relatorios.col_total_desconto },
    ],
    [m],
  )

  const topProdutosColumns = useMemo(
    () => [
      { key: 'id', header: 'id' },
      { key: 'nome', header: m.relatorios.produto },
      { key: 'origem', header: m.relatorios.origem },
      { key: 'total_quantidade', header: m.gerente.col_qtde },
      { key: 'total_valor', header: m.gerente.col_valor },
      { key: 'num_vendas', header: m.gerente.col_num_vendas },
    ],
    [m],
  )

  const estoqueBaixoColumns = useMemo(
    () => [
      { key: 'nome', header: m.relatorios.produto },
      { key: 'codigo_barras', header: 'codigo_barras' },
      { key: 'quantidade_atual', header: m.relatorios.estoque_atual },
      { key: 'estoque_minimo', header: m.relatorios.minimo },
      { key: 'deficit', header: m.relatorios.deficit },
    ],
    [m],
  )

  const {
    exportVendasDia,
    expVendas,
    exportVendasDiaXlsx,
    expVendasXlsx,
    exportTop,
    expTop,
    exportTopXlsx,
    expTopXlsx,
    exportBaixo,
    expBaixo,
    exportBaixoXlsx,
    expBaixoXlsx,
  } = useRelatoriosGerenteExports(m, data, csvSuffix, vendasDiaColumns, topProdutosColumns, estoqueBaixoColumns)

  const fmtMoney = (n: number) => formatBRL(Number(n), locale)

  const avisoTexto = getAvisoPeriodo(data?.periodo.aviso, m)

  const totalVendasPeriodo = data?.porDia.reduce((s, r) => s + Number(r.num_vendas), 0) ?? 0
  const totalLiquidoPeriodo = data?.porDia.reduce((s, r) => s + Number(r.total_liquido), 0) ?? 0
  const itensVendidosPeriodo = data?.resumoExecutivo.itens_vendidos ?? 0
  const taxaCancelamentoPeriodo = data?.resumoExecutivo.taxa_cancelamento ?? 0
  const margemBrutaEstimativa = data?.resumoExecutivo.margem_bruta_estimada ?? null
  const custoConfiavel = data?.resumoExecutivo.custo_confiavel ?? false

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      </div>

      <GerenteFilterBar title={m.relatorios.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">
        {m.relatorios.vendas_periodo} · {m.relatorios.mais_vendidos} · {m.relatorios.estoque_baixo}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const q = new URLSearchParams()
          if (de) q.set('de', de)
          if (ate) q.set('ate', ate)
          router.push(`/gerente/relatorios?${q.toString()}`)
          refetch().catch(() => undefined)
        }}
        className="gerente-period-form mb-4 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="gerente-fin-label font-medium">{m.relatorios.periodo_de}</span>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            required
            className="gerente-fin-input rounded-lg border px-2.5 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="gerente-fin-label font-medium">{m.relatorios.periodo_ate}</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            required
            className="gerente-fin-input rounded-lg border px-2.5 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-[filter] hover:from-emerald-500 hover:to-emerald-700"
        >
          {m.relatorios.aplicar_periodo}
        </button>
        <button
          type="button"
          onClick={() => {
            setDe('')
            setAte('')
            router.push('/gerente/relatorios')
            refetch().catch(() => undefined)
          }}
          className="gerente-fin-muted pb-2 text-sm hover:text-amber-700"
        >
          {m.relatorios.limpar_periodo}
        </button>
      </form>

      {data ? (
        <p className="gerente-fin-muted mb-3 text-xs opacity-90">
          {m.relatorios.periodo_fuso_legenda.replace('{{tz}}', data.tzRelatorio)}
        </p>
      ) : null}

      {loading && !data ? <p className="gerente-fin-muted text-sm">{m.comum.carregando}</p> : null}

      {avisoTexto ? (
        <div className="gerente-alert-warn mb-3 rounded-lg px-3 py-2.5 text-sm leading-relaxed" role="status">
          {avisoTexto}
        </div>
      ) : null}

      {data?.rpcErro ? (
        <div className="gerente-alert-error mb-4 rounded-lg p-3 text-sm leading-relaxed" role="alert">
          {m.relatorios.rpc_indisponivel}
          {data.rpcErroAmigavel ? (
            <p className="gerente-fin-cell mt-2 font-medium">{data.rpcErroAmigavel}</p>
          ) : null}
          <span className="gerente-fin-muted mt-2 block text-xs">Detalhe técnico (suporte):</span>
          <code className="gerente-fin-cell mt-1 block font-mono">{data.rpcErro}</code>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="dragon-glass-card mb-8 rounded-xl p-5">
            <h2 className="gerente-section-accent mb-3 text-base font-semibold">{m.gerente.sec_vendas_dia}</h2>
            {!data.rpcErro && data.porDia.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <span className="gerente-fin-cell min-w-0">
                  <strong>{m.relatorios.resumo_periodo}:</strong> {totalVendasPeriodo} {m.relatorios.resumo_vendas} ·{' '}
                  {fmtMoney(totalLiquidoPeriodo)} {m.relatorios.resumo_liquido}
                </span>
                <span className="gerente-fin-muted text-xs sm:text-sm">
                  {m.relatorios.kpi_itens_vendidos}: {formatDecimalPlaces(Number(itensVendidosPeriodo), 3)}
                </span>
                <span className="gerente-fin-muted text-xs sm:text-sm">
                  {m.relatorios.kpi_taxa_cancelamento}:{' '}
                  {formatDecimalPlaces(Number(taxaCancelamentoPeriodo * 100), 2)}%
                </span>
                <span
                  className={cn(
                    'text-xs font-medium sm:text-sm',
                    custoConfiavel && margemBrutaEstimativa !== null
                      ? 'gerente-relatorio-kpi-margem-ok'
                      : 'gerente-relatorio-kpi-margem-warn',
                  )}
                >
                  {m.relatorios.kpi_margem_bruta_estimada}:{' '}
                  {custoConfiavel && margemBrutaEstimativa !== null
                    ? fmtMoney(Number(margemBrutaEstimativa))
                    : m.relatorios.kpi_margem_indisponivel}
                </span>
              </div>
            ) : null}
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={expVendas || data.porDia.length === 0}
                onClick={() => void exportVendasDia(null)}
                className={REL_EXPORT_BTN_CLASS}
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                disabled={expVendasXlsx || data.porDia.length === 0}
                onClick={() => void exportVendasDiaXlsx(null)}
                className={REL_EXPORT_BTN_CLASS}
              >
                {m.gerente.exportar_xlsx}
              </button>
            </div>
            <div className="gerente-table-wrap overflow-x-auto rounded-lg">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'd', header: m.gerente.col_dia },
                  { key: 'n', header: m.gerente.col_num_vendas },
                  { key: 'v', header: m.relatorios.valor },
                  { key: 't', header: m.gerente.col_ticket },
                  { key: 'des', header: m.relatorios.col_total_desconto },
                ]}
              >
                {data.porDia.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="gerente-fin-empty px-4 py-6 text-center text-sm">
                      {m.gerente.nenhuma_venda}
                    </td>
                  </tr>
                ) : (
                  data.porDia.map((row) => (
                    <tr key={String(row.dia)} className="gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-2.5">
                        {row.dia ? formatarDiaRelatorioParaLocale(String(row.dia), locale) : '—'}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">{row.num_vendas}</td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {fmtMoney(Number(row.total_liquido))}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {fmtMoney(Number(row.ticket_medio))}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {fmtMoney(Number(row.total_desconto))}
                      </td>
                    </tr>
                  ))
                )}
              </GerenteTable>
            </div>
          </section>

          <section className="dragon-glass-card mb-8 rounded-xl p-5">
            <h2 className="gerente-section-accent mb-3 text-base font-semibold">{m.gerente.sec_top_produtos}</h2>
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={expTop || data.top.length === 0}
                onClick={() => void exportTop(null)}
                className={REL_EXPORT_BTN_CLASS}
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                disabled={expTopXlsx || data.top.length === 0}
                onClick={() => void exportTopXlsx(null)}
                className={REL_EXPORT_BTN_CLASS}
              >
                {m.gerente.exportar_xlsx}
              </button>
            </div>
            <p className="gerente-fin-muted mb-2 text-xs">{m.relatorios.top_produtos_legenda}</p>
            <div className="gerente-table-wrap overflow-x-auto rounded-lg">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'p', header: m.relatorios.produto },
                  { key: 'o', header: m.relatorios.origem },
                  { key: 'q', header: m.gerente.col_qtde },
                  { key: 'v', header: m.gerente.col_valor },
                  { key: 'nv', header: m.gerente.col_num_vendas },
                ]}
              >
                {data.top.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="gerente-fin-empty px-4 py-6 text-center text-sm">
                      —
                    </td>
                  </tr>
                ) : (
                  data.top.map((row) => (
                    <tr key={row.id} className="gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-2.5">{row.nome}</td>
                      <td className="gerente-fin-cell px-3 py-2.5">{row.origem}</td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {formatDecimalPlaces(Number(row.total_quantidade), 3)}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {fmtMoney(Number(row.total_valor))}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">{row.num_vendas}</td>
                    </tr>
                  ))
                )}
              </GerenteTable>
            </div>
          </section>

          <section className="dragon-glass-card mb-8 rounded-xl p-5">
            <h2 className="gerente-section-accent mb-3 text-base font-semibold">{m.gerente.sec_estoque_baixo}</h2>
            <p className="gerente-fin-muted mb-2 text-xs">{m.relatorios.estoque_baixo_sem_periodo}</p>
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={expBaixo || data.baixo.length === 0}
                onClick={() => void exportBaixo(null)}
                className={REL_EXPORT_BTN_CLASS}
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                disabled={expBaixoXlsx || data.baixo.length === 0}
                onClick={() => void exportBaixoXlsx(null)}
                className={REL_EXPORT_BTN_CLASS}
              >
                {m.gerente.exportar_xlsx}
              </button>
            </div>
            <div className="gerente-table-wrap overflow-x-auto rounded-lg">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'p', header: m.relatorios.produto },
                  { key: 'a', header: m.relatorios.estoque_atual },
                  { key: 'm', header: m.relatorios.minimo },
                  { key: 'd', header: m.relatorios.deficit },
                ]}
              >
                {data.baixo.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="gerente-fin-empty px-4 py-6 text-center text-sm">
                      —
                    </td>
                  </tr>
                ) : (
                  data.baixo.map((row) => (
                    <tr key={row.id} className="gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-2.5">{row.nome}</td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {formatDecimalPlaces(Number(row.quantidade_atual), 3)}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                        {formatDecimalPlaces(Number(row.estoque_minimo), 3)}
                      </td>
                      <td className="gerente-caixa-diff-warn px-3 py-2.5 font-semibold tabular-nums">
                        {formatDecimalPlaces(Number(row.deficit), 3)}
                      </td>
                    </tr>
                  ))
                )}
              </GerenteTable>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
