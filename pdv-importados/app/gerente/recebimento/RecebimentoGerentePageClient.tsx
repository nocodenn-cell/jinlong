'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { criarRemessaConferencia } from './actions'

export type RecebimentoProdutoOpt = { id: string; nome: string; codigo_barras: string | null }

export type RemessaRecenteRow = {
  id: string
  origem_descricao: string
  status: string
  created_at: string
}

function interRecebimento(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), template)
}

type Props = Readonly<{
  idioma: Idioma
  produtos: RecebimentoProdutoOpt[]
  remessasRecentes: RemessaRecenteRow[]
}>

const inputClass = 'gerente-fin-input w-full rounded-lg border px-3 py-2 text-sm shadow-sm'

const btnPrimary =
  'inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-3 text-sm font-semibold text-white shadow-md transition-[filter] hover:from-emerald-500 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:min-w-[200px]'

export function RecebimentoGerentePageClient({ idioma, produtos, remessasRecentes }: Props) {
  const m = getMessages(idioma)
  const r = m.gerente.recebimento_page
  const locale = useMemo(() => localeFromIdioma(idioma), [idioma])
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])
  const semProdutos = produtos.length === 0

  const [qtdEspStr, setQtdEspStr] = useState('')
  const [qtdConfStr, setQtdConfStr] = useState('')

  const mostrarDivergencia = useMemo(() => {
    const a = Number(qtdEspStr.replace(',', '.'))
    const b = Number(qtdConfStr.replace(',', '.'))
    if (qtdEspStr === '' || qtdConfStr === '') return false
    if (Number.isNaN(a) || Number.isNaN(b)) return false
    return a !== b
  }, [qtdEspStr, qtdConfStr])

  const { mutate, loading } = useGerenteMutation(
    async (p: {
      origem: string
      observacao: string
      produto_id: string
      qtd_esperada: number
      qtd_conferida: number
    }) => {
      const res = await criarRemessaConferencia({
        origem: p.origem,
        observacao: p.observacao || undefined,
        itens: [
          {
            produto_id: p.produto_id,
            quantidade_esperada: p.qtd_esperada,
            quantidade_conferida: p.qtd_conferida,
          },
        ],
      })
      if (!res.success) throw new Error(res.error)
      refetch()
      return res.data
    },
    {
      onSuccess: (id) => {
        if (id) {
          emitGerenteToast({ kind: 'success', message: interRecebimento(r.toast_ok, { id }) })
        }
      },
    },
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
        ← {m.gerente.inicio}
      </Link>

      <header className="gerente-fin-header-border mt-5 border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="gerente-fin-page-title text-2xl font-semibold tracking-tight sm:text-3xl">{r.titulo}</h1>
          <span className="gerente-fin-badge rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1">
            {r.badge}
          </span>
        </div>
        <p className="gerente-fin-muted mt-3 max-w-2xl text-sm leading-relaxed">{r.subtitulo}</p>
      </header>

      {semProdutos ? (
        <div
          className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm"
          role="status"
        >
          <p className="font-semibold">{r.sem_produtos_titulo}</p>
          <p className="mt-2 text-sm text-amber-900/90">{r.sem_produtos_texto}</p>
          <Link
            href="/gerente/produtos"
            className="mt-4 inline-flex text-sm font-semibold text-amber-950 underline decoration-amber-700/60 underline-offset-2 hover:decoration-amber-950"
          >
            {r.link_produtos}
          </Link>
        </div>
      ) : null}

      <form
        className="dragon-glass-card mt-8 rounded-xl p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (semProdutos) return
          const fd = new FormData(e.currentTarget)
          const pid = readFormDataString(fd, 'produto_id')
          const qEsp = Number(fd.get('qtd_esperada'))
          const qConf = Number(fd.get('qtd_conferida'))
          if (!pid || Number.isNaN(qEsp) || Number.isNaN(qConf) || qEsp < 0 || qConf < 0) {
            emitGerenteToast({ kind: 'error', message: r.toast_dados_invalidos })
            return
          }
          void mutate({
            origem: readFormDataString(fd, 'origem'),
            observacao: readFormDataString(fd, 'observacao'),
            produto_id: pid,
            qtd_esperada: qEsp,
            qtd_conferida: qConf,
          })
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="rec-origem" className="gerente-fin-label text-xs font-medium">
              {r.label_origem}
            </label>
            <input
              id="rec-origem"
              name="origem"
              required
              disabled={semProdutos}
              placeholder={r.ph_origem}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="rec-obs" className="gerente-fin-label text-xs font-medium">
              {r.label_observacao}
            </label>
            <input
              id="rec-obs"
              name="observacao"
              disabled={semProdutos}
              placeholder={r.ph_observacao}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="rec-prod" className="gerente-fin-label text-xs font-medium">
              {r.label_produto}
            </label>
            <select
              id="rec-prod"
              name="produto_id"
              required
              disabled={semProdutos}
              className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
              defaultValue=""
            >
              <option value="" disabled>
                {r.opt_produto_placeholder}
              </option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.codigo_barras ? ` · ${p.codigo_barras}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="rec-q-esp" className="gerente-fin-label text-xs font-medium">
                {r.label_qtd_esperada}
              </label>
              <input
                id="rec-q-esp"
                name="qtd_esperada"
                type="number"
                min={0}
                step="0.001"
                required
                disabled={semProdutos}
                value={qtdEspStr}
                onChange={(e) => setQtdEspStr(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rec-q-conf" className="gerente-fin-label text-xs font-medium">
                {r.label_qtd_conferida}
              </label>
              <input
                id="rec-q-conf"
                name="qtd_conferida"
                type="number"
                min={0}
                step="0.001"
                required
                disabled={semProdutos}
                value={qtdConfStr}
                onChange={(e) => setQtdConfStr(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {mostrarDivergencia ? (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              role="status"
            >
              {r.divergencia_alerta}
            </p>
          ) : null}
        </div>
        <div className="gerente-fin-divider mt-6 flex justify-end border-t pt-5">
          <button type="submit" disabled={loading || semProdutos} className={btnPrimary}>
            {loading ? r.btn_confirmando : r.btn_confirmar}
          </button>
        </div>
      </form>

      <section className="dragon-glass-card mt-10 rounded-xl p-5">
        <h2 className="gerente-section-accent text-lg font-semibold">{r.sec_recentes}</h2>
        <p className="gerente-fin-muted mt-1 text-xs">{r.sec_recentes_ajuda}</p>
        <div className="mt-4 overflow-x-auto">
          <GerenteTable
            tone="dragon"
            columns={[
              { key: 'id', header: r.col_remessa },
              { key: 'o', header: r.col_origem },
              { key: 's', header: m.gerente.col_status },
              { key: 'd', header: r.col_data },
            ]}
          >
            {remessasRecentes.length === 0 ? (
              <tr>
                <td colSpan={4} className="gerente-fin-empty px-4 py-8 text-center text-sm">
                  {r.empty_recentes}
                </td>
              </tr>
            ) : (
              remessasRecentes.map((row) => (
                <tr key={row.id} className="gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-3 py-3 font-mono text-xs">{fmtGerenteIdCurto(row.id)}</td>
                  <td
                    className="gerente-fin-cell max-w-[220px] truncate px-3 py-3 text-sm"
                    title={row.origem_descricao}
                  >
                    {row.origem_descricao}
                  </td>
                  <td className="px-3 py-3">
                    <GerenteStatusBadge status={row.status} />
                  </td>
                  <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 text-sm tabular-nums">
                    {fmtGerenteDateTime(row.created_at, locale)}
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
