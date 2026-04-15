import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import {
  formatarDiaRelatorioParaLocale,
  resolverPeriodoRelatorio,
} from '@/lib/relatorios/periodoRelatorio'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatBRL } from '@/lib/format/money'

type VendaDia = {
  dia: string
  num_vendas: number
  total_liquido: number
  ticket_medio: number
  total_desconto: number
}

type TopProd = {
  id: string
  nome: string
  origem: string
  total_quantidade: number
  total_valor: number
  num_vendas: number
}

type EstBaixo = {
  id: string
  nome: string
  codigo_barras: string | null
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

type PageProps = {
  searchParams?: Promise<{ de?: string; ate?: string }>
}

export default async function GerenteRelatoriosPage(props: PageProps) {
  const sp = (await props.searchParams) ?? {}
  const supabase = await createClient()
  const tzRelatorio = await getRelatorioTimezone(supabase)
  const periodo = resolverPeriodoRelatorio(sp.de, sp.ate, tzRelatorio)

  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)

  const { data: porDiaRaw, error: errPorDia } = await supabase.rpc('relatorio_vendas_por_dia_periodo', {
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_tz: tzRelatorio,
  })

  const { data: topRaw, error: errTop } = await supabase.rpc('relatorio_top_produtos_periodo', {
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_limite: 50,
    p_tz: tzRelatorio,
  })

  const { data: baixo } = await supabase
    .from('v_estoque_baixo')
    .select('id, nome, codigo_barras, quantidade_atual, estoque_minimo, deficit')
    .limit(40)

  const porDia = (porDiaRaw ?? []) as VendaDia[]
  const top = (topRaw ?? []) as TopProd[]

  const fmtMoney = (n: number) => formatBRL(Number(n), locale)

  const sec = (title: string, children: ReactNode) => (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  )

  const avisoTexto =
    periodo.aviso === 'datas_invalidas'
      ? m.relatorios.aviso_datas_invalidas
      : periodo.aviso === 'periodo_invertido'
        ? m.relatorios.aviso_periodo_invertido
        : periodo.aviso === 'periodo_limitado'
          ? m.relatorios.aviso_periodo_limitado
          : null

  const rpcErro = errPorDia?.message ?? errTop?.message
  const rpcErroAmigavel = rpcErro ? mensagemErroParaUsuario(rpcErro) : null

  const totalVendasPeriodo = porDia.reduce((s, r) => s + Number(r.num_vendas), 0)
  const totalLiquidoPeriodo = porDia.reduce((s, r) => s + Number(r.total_liquido), 0)

  const csvSuffix = `${periodo.de}_${periodo.ate}`

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/gerente" style={{ fontSize: 13, color: '#2563eb' }}>
          ← {m.gerente.inicio}
        </Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{m.relatorios.titulo}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        {m.relatorios.vendas_periodo} · {m.relatorios.mais_vendidos} · {m.relatorios.estoque_baixo}
      </p>

      <form
        method="get"
        action="/gerente/relatorios"
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
            name="de"
            defaultValue={periodo.de}
            required
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>{m.relatorios.periodo_ate}</span>
          <input
            type="date"
            name="ate"
            defaultValue={periodo.ate}
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
        <Link
          href="/gerente/relatorios"
          style={{ fontSize: 13, color: '#6b7280', paddingBottom: 8 }}
        >
          {m.relatorios.limpar_periodo}
        </Link>
      </form>

      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>
        {m.relatorios.periodo_fuso_legenda.replace('{{tz}}', tzRelatorio)}
      </p>

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

      {rpcErro ? (
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
          {rpcErroAmigavel ? (
            <p style={{ marginTop: 8, marginBottom: 4, fontWeight: 500 }}>{rpcErroAmigavel}</p>
          ) : null}
          <span style={{ fontSize: 11, color: '#7f1d1d' }}>Detalhe técnico (suporte):</span>
          <code style={{ display: 'block', marginTop: 4, fontSize: 11, wordBreak: 'break-all' }}>
            {rpcErro}
          </code>
        </div>
      ) : null}

      {sec(
        m.gerente.sec_vendas_dia,
        <>
          {!rpcErro && porDia.length > 0 ? (
            <p style={{ fontSize: 14, marginBottom: 12, color: '#374151' }}>
              <strong>{m.relatorios.resumo_periodo}:</strong>{' '}
              {totalVendasPeriodo} {m.relatorios.resumo_vendas} · {fmtMoney(totalLiquidoPeriodo)}{' '}
              {m.relatorios.resumo_liquido}
            </p>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <ExportCsvButton
              label={m.gerente.exportar_csv}
              filename={`relatorio-vendas-dia_${csvSuffix}.csv`}
              columns={[
                { key: 'dia', header: m.gerente.col_dia },
                { key: 'num_vendas', header: m.gerente.col_num_vendas },
                { key: 'total_liquido', header: m.relatorios.valor },
                { key: 'ticket_medio', header: m.gerente.col_ticket },
                { key: 'total_desconto', header: m.relatorios.col_total_desconto },
              ]}
              rows={
                porDia.map((row) => ({
                  dia: row.dia ? String(row.dia).slice(0, 10) : '',
                  num_vendas: row.num_vendas,
                  total_liquido: Number(row.total_liquido),
                  ticket_medio: Number(row.ticket_medio),
                  total_desconto: Number(row.total_desconto),
                })) ?? []
              }
            />
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: 10 }}>{m.gerente.col_dia}</th>
                  <th style={{ padding: 10 }}>{m.gerente.col_num_vendas}</th>
                  <th style={{ padding: 10 }}>{m.relatorios.valor}</th>
                  <th style={{ padding: 10 }}>{m.gerente.col_ticket}</th>
                  <th style={{ padding: 10 }}>{m.relatorios.col_total_desconto}</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((row) => (
                  <tr key={String(row.dia)} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>
                      {row.dia ? formatarDiaRelatorioParaLocale(String(row.dia), locale) : '—'}
                    </td>
                    <td style={{ padding: 10 }}>{row.num_vendas}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_liquido))}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.ticket_medio))}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_desconto))}</td>
                  </tr>
                ))}
                {porDia.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
                      {m.gerente.nenhuma_venda}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sec(
        m.gerente.sec_top_produtos,
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <ExportCsvButton
              label={m.gerente.exportar_csv}
              filename={`relatorio-top-produtos_${csvSuffix}.csv`}
              columns={[
                { key: 'id', header: 'id' },
                { key: 'nome', header: m.relatorios.produto },
                { key: 'origem', header: m.relatorios.origem },
                { key: 'total_quantidade', header: m.gerente.col_qtde },
                { key: 'total_valor', header: m.gerente.col_valor },
                { key: 'num_vendas', header: m.gerente.col_num_vendas },
              ]}
              rows={
                top.map((row) => ({
                  id: row.id,
                  nome: row.nome,
                  origem: row.origem,
                  total_quantidade: row.total_quantidade,
                  total_valor: row.total_valor,
                  num_vendas: row.num_vendas,
                })) ?? []
              }
            />
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
            {m.relatorios.top_produtos_legenda}
          </p>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: 10 }}>{m.relatorios.produto}</th>
                  <th style={{ padding: 10 }}>{m.relatorios.origem}</th>
                  <th style={{ padding: 10 }}>{m.gerente.col_qtde}</th>
                  <th style={{ padding: 10 }}>{m.gerente.col_valor}</th>
                  <th style={{ padding: 10 }}>{m.gerente.col_num_vendas}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>{row.nome}</td>
                    <td style={{ padding: 10 }}>{row.origem}</td>
                    <td style={{ padding: 10 }}>{Number(row.total_quantidade).toFixed(3)}</td>
                    <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_valor))}</td>
                    <td style={{ padding: 10 }}>{row.num_vendas}</td>
                  </tr>
                ))}
                {top.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sec(
        m.gerente.sec_estoque_baixo,
        <>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
            {m.relatorios.estoque_baixo_sem_periodo}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <ExportCsvButton
              label={m.gerente.exportar_csv}
              filename="relatorio-estoque-baixo.csv"
              columns={[
                { key: 'nome', header: m.relatorios.produto },
                { key: 'codigo_barras', header: 'codigo_barras' },
                { key: 'quantidade_atual', header: m.relatorios.estoque_atual },
                { key: 'estoque_minimo', header: m.relatorios.minimo },
                { key: 'deficit', header: m.relatorios.deficit },
              ]}
              rows={
                (baixo as EstBaixo[] | null)?.map((row) => ({
                  nome: row.nome,
                  codigo_barras: row.codigo_barras ?? '',
                  quantidade_atual: row.quantidade_atual,
                  estoque_minimo: row.estoque_minimo,
                  deficit: row.deficit,
                })) ?? []
              }
            />
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: 10 }}>{m.relatorios.produto}</th>
                  <th style={{ padding: 10 }}>{m.relatorios.estoque_atual}</th>
                  <th style={{ padding: 10 }}>{m.relatorios.minimo}</th>
                  <th style={{ padding: 10 }}>{m.relatorios.deficit}</th>
                </tr>
              </thead>
              <tbody>
                {(baixo as EstBaixo[] | null)?.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 10 }}>{row.nome}</td>
                    <td style={{ padding: 10 }}>{Number(row.quantidade_atual).toFixed(3)}</td>
                    <td style={{ padding: 10 }}>{Number(row.estoque_minimo).toFixed(3)}</td>
                    <td style={{ padding: 10, color: '#b45309', fontWeight: 600 }}>
                      {Number(row.deficit).toFixed(3)}
                    </td>
                  </tr>
                ))}
                {(!baixo || baixo.length === 0) && (
                  <tr>
                    <td colSpan={4} style={{ padding: 16, color: '#6b7280' }}>
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
