'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { getMessages } from '@/i18n/getMessages'
import { formatBRL, formatDecimalPlaces } from '@/lib/format/money'
import { fmtGerenteDateTime } from '@/lib/format/gerenteValues'
import { carregarProdutosSemGiro } from './actions'

type Props = Readonly<{
  idioma: Idioma
}>

const MS_POR_DIA = 86_400_000

export function RelatoriosSemGiroPageClient({ idioma }: Props) {
  const m = getMessages(idioma)
  const sg = m.relatorios_sem_giro
  const locale = localeFromIdioma(idioma)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [de, setDe] = useState(searchParams.get('de') ?? '')
  const [ate, setAte] = useState(searchParams.get('ate') ?? '')

  const queryFn = useCallback(
    () => carregarProdutosSemGiro({ de: de || undefined, ate: ate || undefined }),
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

  const fmtMoney = (n: number) => formatBRL(Number(n), locale)

  /** Texto "há quantos dias parado" a partir da última venda. */
  const diasParado = (ultimaVenda: string | null): string => {
    if (!ultimaVenda) return sg.nunca_vendido
    const dias = Math.floor((Date.now() - new Date(ultimaVenda).getTime()) / MS_POR_DIA)
    if (dias <= 1) return sg.um_dia_parado
    return sg.dias_parado.replace('{{dias}}', String(dias))
  }

  const totalImobilizado = useMemo(
    () => (data?.itens ?? []).reduce((s, r) => s + Number(r.valor_imobilizado), 0),
    [data],
  )

  return (
    <div className={`mx-auto max-w-[1100px] px-4 py-6 sm:px-6 ${idioma === 'pt' ? '' : 'font-chinese'}`}>
      <div className="mb-4">
        <Link href="/gerente/relatorios" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.relatorios.titulo}
        </Link>
      </div>

      <GerenteFilterBar title={sg.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{sg.legenda}</p>

      <GerenteStickyToolbar className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const q = new URLSearchParams()
            if (de) q.set('de', de)
            if (ate) q.set('ate', ate)
            router.push(`/gerente/relatorios/sem-giro?${q.toString()}`)
            refetch().catch(() => undefined)
          }}
          className="gerente-period-form flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="gerente-fin-label font-medium">{m.relatorios.periodo_de}</span>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              required
              className="rounded-lg px-2.5 py-2 text-sm app-input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="gerente-fin-label font-medium">{m.relatorios.periodo_ate}</span>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              required
              className="rounded-lg px-2.5 py-2 text-sm app-input"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-[filter] app-btn-accent"
          >
            {m.relatorios.aplicar_periodo}
          </button>
          <button
            type="button"
            onClick={() => {
              setDe('')
              setAte('')
              router.push('/gerente/relatorios/sem-giro')
              refetch().catch(() => undefined)
            }}
            className="gerente-fin-muted pb-2 text-sm app-link-accent"
          >
            {m.relatorios.limpar_periodo}
          </button>
        </form>
      </GerenteStickyToolbar>

      {data ? (
        <p className="gerente-fin-muted mb-3 text-xs opacity-90">
          {m.relatorios.periodo_fuso_legenda.replace('{{tz}}', data.tzRelatorio)}
        </p>
      ) : null}

      {loading && !data ? <p className="gerente-fin-muted text-sm">{m.comum.carregando}</p> : null}

      {data?.rpcErro ? (
        <div className="mb-4 rounded-lg border p-3 text-sm leading-relaxed app-badge-danger" role="alert">
          {m.relatorios.rpc_indisponivel}
          {data.rpcErroAmigavel ? (
            <p className="gerente-fin-cell mt-2 font-medium">{data.rpcErroAmigavel}</p>
          ) : null}
          <code className="gerente-fin-cell mt-1 block font-mono text-xs">{data.rpcErro}</code>
        </div>
      ) : null}

      {data ? (
        <section className="dragon-glass-card mb-8 rounded-xl p-5">
          {!data.rpcErro && data.itens.length > 0 ? (
            <p className="gerente-fin-cell mb-3 text-sm">
              <strong>
                {sg.resumo
                  .replace('{{n}}', String(data.itens.length))
                  .replace('{{valor}}', fmtMoney(totalImobilizado))}
              </strong>
            </p>
          ) : null}

          <div className="gerente-table-wrap overflow-x-auto rounded-lg">
            <GerenteTable
              tone="dragon"
              columns={[
                { key: 'cb', header: sg.col_codigo_barras },
                { key: 'nome', header: sg.col_nome },
                { key: 'qtd', header: sg.col_quantidade },
                { key: 'custo', header: sg.col_preco_custo },
                { key: 'imob', header: sg.col_valor_imobilizado },
                { key: 'ult', header: sg.col_ultima_venda },
              ]}
            >
              {data.itens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="gerente-fin-empty px-4 py-8 text-center text-sm">
                    {sg.vazio}
                  </td>
                </tr>
              ) : (
                data.itens.map((row) => (
                  <tr key={row.produto_id} className="gerente-fin-row-hover transition-colors">
                    <td className="gerente-fin-cell px-3 py-2.5 font-mono text-xs">
                      {row.codigo_barras ?? '—'}
                    </td>
                    <td className="gerente-fin-cell px-3 py-2.5">{row.nome}</td>
                    <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                      {formatDecimalPlaces(Number(row.quantidade_atual), 3)}
                    </td>
                    <td className="gerente-fin-cell px-3 py-2.5 tabular-nums">
                      {row.preco_custo == null ? sg.sem_custo : fmtMoney(Number(row.preco_custo))}
                    </td>
                    <td className="gerente-fin-cell px-3 py-2.5 font-semibold tabular-nums">
                      {fmtMoney(Number(row.valor_imobilizado))}
                    </td>
                    <td className="gerente-fin-cell px-3 py-2.5">
                      <span className="tabular-nums">{fmtGerenteDateTime(row.ultima_venda, locale)}</span>
                      <span className="gerente-caixa-diff-warn ml-2 text-xs font-medium">
                        {diasParado(row.ultima_venda)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </GerenteTable>
          </div>
        </section>
      ) : null}
    </div>
  )
}
