'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { objectsToCsv } from '@/lib/csv'
import { downloadXlsx } from '@/lib/xlsx'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import { formatarDiaRelatorioParaLocale } from '@/lib/relatorios/periodoRelatorio'
import type { Idioma } from '@/src/lib/idioma/normalizeIdioma'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { formatBRL, formatDecimalPlaces } from '@/lib/format/money'
import { carregarDadosRelatoriosGerente } from './actions'

type Props = Readonly<{
  idioma: Idioma
}>

function getAvisoPeriodo(
  aviso: 'nenhum' | 'datas_invalidas' | 'periodo_invertido' | 'periodo_limitado' | undefined,
  m: ReturnType<typeof getMessages>,
) {
  if (aviso === 'datas_invalidas') return m.relatorios.aviso_datas_invalidas
  if (aviso === 'periodo_invertido') return m.relatorios.aviso_periodo_invertido
  if (aviso === 'periodo_limitado') return m.relatorios.aviso_periodo_limitado
  return null
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

  const exportVendasOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

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

  const { mutate: exportVendasDia, loading: expVendas } = useGerenteMutation(
    async (_: null) => {
      if (!data) throw new Error('Sem dados')
      downloadCsv(
        `relatorio-vendas-dia_${csvSuffix}.csv`,
        vendasDiaColumns,
        data.porDia.map((row) => ({
          dia: row.dia ? String(row.dia).slice(0, 10) : '',
          num_vendas: row.num_vendas,
          total_liquido: Number(row.total_liquido),
          ticket_medio: Number(row.ticket_medio),
          total_desconto: Number(row.total_desconto),
        })),
      )
      return null
    },
    exportVendasOpts,
  )
  const { mutate: exportVendasDiaXlsx, loading: expVendasXlsx } = useGerenteMutation(
    async (_: null) => {
      if (!data) throw new Error('Sem dados')
      downloadXlsx(
        `relatorio-vendas-dia_${csvSuffix}.xlsx`,
        vendasDiaColumns,
        data.porDia.map((row) => ({
          dia: row.dia ? String(row.dia).slice(0, 10) : '',
          num_vendas: row.num_vendas,
          total_liquido: Number(row.total_liquido),
          ticket_medio: Number(row.ticket_medio),
          total_desconto: Number(row.total_desconto),
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportTop, loading: expTop } = useGerenteMutation(
    async (_: null) => {
      if (!data) throw new Error('Sem dados')
      downloadCsv(
        `relatorio-top-produtos_${csvSuffix}.csv`,
        topProdutosColumns,
        data.top.map((row) => ({
          id: row.id,
          nome: row.nome,
          origem: row.origem,
          total_quantidade: row.total_quantidade,
          total_valor: row.total_valor,
          num_vendas: row.num_vendas,
        })),
      )
      return null
    },
    exportVendasOpts,
  )
  const { mutate: exportTopXlsx, loading: expTopXlsx } = useGerenteMutation(
    async (_: null) => {
      if (!data) throw new Error('Sem dados')
      downloadXlsx(
        `relatorio-top-produtos_${csvSuffix}.xlsx`,
        topProdutosColumns,
        data.top.map((row) => ({
          id: row.id,
          nome: row.nome,
          origem: row.origem,
          total_quantidade: row.total_quantidade,
          total_valor: row.total_valor,
          num_vendas: row.num_vendas,
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportBaixo, loading: expBaixo } = useGerenteMutation(
    async (_: null) => {
      if (!data) throw new Error('Sem dados')
      downloadCsv(
        'relatorio-estoque-baixo.csv',
        estoqueBaixoColumns,
        data.baixo.map((row) => ({
          nome: row.nome,
          codigo_barras: row.codigo_barras ?? '',
          quantidade_atual: row.quantidade_atual,
          estoque_minimo: row.estoque_minimo,
          deficit: row.deficit,
        })),
      )
      return null
    },
    exportVendasOpts,
  )
  const { mutate: exportBaixoXlsx, loading: expBaixoXlsx } = useGerenteMutation(
    async (_: null) => {
      if (!data) throw new Error('Sem dados')
      downloadXlsx(
        'relatorio-estoque-baixo.xlsx',
        estoqueBaixoColumns,
        data.baixo.map((row) => ({
          nome: row.nome,
          codigo_barras: row.codigo_barras ?? '',
          quantidade_atual: row.quantidade_atual,
          estoque_minimo: row.estoque_minimo,
          deficit: row.deficit,
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const fmtMoney = (n: number) => formatBRL(Number(n), locale)

  const avisoTexto = getAvisoPeriodo(data?.periodo.aviso, m)

  const totalVendasPeriodo = data?.porDia.reduce((s, r) => s + Number(r.num_vendas), 0) ?? 0
  const totalLiquidoPeriodo = data?.porDia.reduce((s, r) => s + Number(r.total_liquido), 0) ?? 0
  const itensVendidosPeriodo = data?.resumoExecutivo.itens_vendidos ?? 0
  const taxaCancelamentoPeriodo = data?.resumoExecutivo.taxa_cancelamento ?? 0
  const margemBrutaEstimativa = data?.resumoExecutivo.margem_bruta_estimada ?? null
  const custoConfiavel = data?.resumoExecutivo.custo_confiavel ?? false

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/gerente" style={{ fontSize: 13, color: '#2563eb' }}>
          ← {m.gerente.inicio}
        </Link>
      </div>

      <GerenteFilterBar title={m.relatorios.titulo} />
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
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
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 16,
          padding: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          background: '#fafafa',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>{m.relatorios.periodo_de}</span>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            required
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>{m.relatorios.periodo_ate}</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            required
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
          />
        </label>
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            fontSize: 14,
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 500,
          }}
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
          style={{ fontSize: 13, color: '#6b7280', paddingBottom: 8, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {m.relatorios.limpar_periodo}
        </button>
      </form>

      {data ? (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>
          {m.relatorios.periodo_fuso_legenda.replace('{{tz}}', data.tzRelatorio)}
        </p>
      ) : null}

      {loading && !data ? <p style={{ color: '#6b7280' }}>{m.comum.carregando}</p> : null}

      {avisoTexto ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            fontSize: 13,
            borderRadius: 8,
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            color: '#92400e',
          }}
        >
          {avisoTexto}
        </div>
      ) : null}

      {data?.rpcErro ? (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            fontSize: 13,
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
          }}
        >
          {m.relatorios.rpc_indisponivel}
          {data.rpcErroAmigavel ? (
            <p style={{ marginTop: 8, marginBottom: 4, fontWeight: 500 }}>{data.rpcErroAmigavel}</p>
          ) : null}
          <span style={{ fontSize: 11, color: '#7f1d1d' }}>Detalhe técnico (suporte):</span>
          <code style={{ display: 'block', marginTop: 4, fontSize: 11, wordBreak: 'break-all' }}>
            {data.rpcErro}
          </code>
        </div>
      ) : null}

      {data ? (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{m.gerente.sec_vendas_dia}</h2>
            {!data.rpcErro && data.porDia.length > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  color: '#374151',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>
                  <strong>{m.relatorios.resumo_periodo}:</strong> {totalVendasPeriodo} {m.relatorios.resumo_vendas} ·{' '}
                  {fmtMoney(totalLiquidoPeriodo)} {m.relatorios.resumo_liquido}
                </span>
                <span style={{ fontSize: 13, color: '#475569' }}>
                  {m.relatorios.kpi_itens_vendidos}: {formatDecimalPlaces(Number(itensVendidosPeriodo), 3)}
                </span>
                <span style={{ fontSize: 13, color: '#475569' }}>
                  {m.relatorios.kpi_taxa_cancelamento}:{' '}
                  {formatDecimalPlaces(Number(taxaCancelamentoPeriodo * 100), 2)}%
                </span>
                <span style={{ fontSize: 13, color: custoConfiavel ? '#065f46' : '#92400e' }}>
                  {m.relatorios.kpi_margem_bruta_estimada}:{' '}
                  {custoConfiavel && margemBrutaEstimativa !== null
                    ? fmtMoney(Number(margemBrutaEstimativa))
                    : m.relatorios.kpi_margem_indisponivel}
                </span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
              <button
                type="button"
                disabled={expVendas || data.porDia.length === 0}
                onClick={() => void exportVendasDia(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: expVendas ? 'not-allowed' : 'pointer',
                }}
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                disabled={expVendasXlsx || data.porDia.length === 0}
                onClick={() => void exportVendasDiaXlsx(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: expVendasXlsx ? 'not-allowed' : 'pointer',
                }}
              >
                {m.gerente.exportar_xlsx}
              </button>
            </div>
            <GerenteTable
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
                  <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
                    {m.gerente.nenhuma_venda}
                  </td>
                </tr>
              ) : (
                data.porDia.map((row) => (
                  <tr key={String(row.dia)} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>
                      {row.dia ? formatarDiaRelatorioParaLocale(String(row.dia), locale) : '—'}
                    </td>
                    <td style={{ padding: 10 }}>{row.num_vendas}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_liquido))}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.ticket_medio))}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_desconto))}</td>
                  </tr>
                ))
              )}
            </GerenteTable>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{m.gerente.sec_top_produtos}</h2>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
              <button
                type="button"
                disabled={expTop || data.top.length === 0}
                onClick={() => void exportTop(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: expTop ? 'not-allowed' : 'pointer',
                }}
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                disabled={expTopXlsx || data.top.length === 0}
                onClick={() => void exportTopXlsx(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: expTopXlsx ? 'not-allowed' : 'pointer',
                }}
              >
                {m.gerente.exportar_xlsx}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>{m.relatorios.top_produtos_legenda}</p>
            <GerenteTable
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
                  <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
                    —
                  </td>
                </tr>
              ) : (
                data.top.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>{row.nome}</td>
                    <td style={{ padding: 10 }}>{row.origem}</td>
                    <td style={{ padding: 10 }}>{formatDecimalPlaces(Number(row.total_quantidade), 3)}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_valor))}</td>
                    <td style={{ padding: 10 }}>{row.num_vendas}</td>
                  </tr>
                ))
              )}
            </GerenteTable>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{m.gerente.sec_estoque_baixo}</h2>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
              {m.relatorios.estoque_baixo_sem_periodo}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
              <button
                type="button"
                disabled={expBaixo || data.baixo.length === 0}
                onClick={() => void exportBaixo(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: expBaixo ? 'not-allowed' : 'pointer',
                }}
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                disabled={expBaixoXlsx || data.baixo.length === 0}
                onClick={() => void exportBaixoXlsx(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: expBaixoXlsx ? 'not-allowed' : 'pointer',
                }}
              >
                {m.gerente.exportar_xlsx}
              </button>
            </div>
            <GerenteTable
              columns={[
                { key: 'p', header: m.relatorios.produto },
                { key: 'a', header: m.relatorios.estoque_atual },
                { key: 'm', header: m.relatorios.minimo },
                { key: 'd', header: m.relatorios.deficit },
              ]}
            >
              {data.baixo.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 16, color: '#6b7280' }}>
                    —
                  </td>
                </tr>
              ) : (
                data.baixo.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>{row.nome}</td>
                    <td style={{ padding: 10 }}>{formatDecimalPlaces(Number(row.quantidade_atual), 3)}</td>
                    <td style={{ padding: 10 }}>{formatDecimalPlaces(Number(row.estoque_minimo), 3)}</td>
                    <td style={{ padding: 10, color: '#b45309', fontWeight: 600 }}>
                      {formatDecimalPlaces(Number(row.deficit), 3)}
                    </td>
                  </tr>
                ))
              )}
            </GerenteTable>
          </section>
        </>
      ) : null}
    </div>
  )
}
