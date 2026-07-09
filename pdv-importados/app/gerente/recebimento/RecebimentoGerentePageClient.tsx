'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { CadastroRapidoBlock } from '@/components/gerente/cadastro'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { formatDecimalPlaces } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { PageHeader } from '@/components/ui/admin-v2'
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

const inputClass = 'w-full rounded-lg px-3 py-2 text-sm shadow-sm app-input'
const selectClass = 'w-full rounded-lg px-3 py-2 text-sm shadow-sm app-select'

const btnPrimary =
  'inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-md transition-[filter] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:min-w-[200px] app-btn-accent'

export function RecebimentoGerentePageClient({ idioma, produtos, remessasRecentes }: Props) {
  const m = getMessages(idioma)
  const r = m.gerente.recebimento_page
  const locale = useMemo(() => localeFromIdioma(idioma), [idioma])
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])
  const semProdutos = produtos.length === 0

  const [qtdEspStr, setQtdEspStr] = useState('')
  const [qtdConfStr, setQtdConfStr] = useState('')

  const divergenciaDetalhe = useMemo(() => {
    const esp = Number(qtdEspStr.replace(',', '.'))
    const conf = Number(qtdConfStr.replace(',', '.'))
    if (qtdEspStr === '' || qtdConfStr === '') return null
    if (Number.isNaN(esp) || Number.isNaN(conf)) return null
    if (esp === conf) return null
    const delta = esp - conf
    const abs = Math.abs(delta)
    const pct = esp > 1e-9 ? (abs / esp) * 100 : 100
    const grave = pct >= 10 || abs >= 5
    return { esp, conf, delta, abs, pct, grave }
  }, [qtdEspStr, qtdConfStr])

  const numLocale = idioma === 'pt' ? 'pt-BR' : 'zh-CN'

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
    <div className={`admin-v2-page ${idioma === 'pt' ? '' : 'font-chinese'}`}>
      <PageHeader
        title={r.titulo}
        subtitle={r.subtitulo}
        filters={
          <span className="gerente-fin-badge rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1">
            {r.badge}
          </span>
        }
      />

      <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
        ← {m.gerente.inicio}
      </Link>

      {semProdutos ? (
        <div
          className="mt-8 rounded-xl border p-5 shadow-sm app-badge-warn"
          role="status"
        >
          <p className="font-semibold">{r.sem_produtos_titulo}</p>
          <p className="mt-2 text-sm">{r.sem_produtos_texto}</p>
          <Link
            href="/gerente/produtos"
            className="mt-4 inline-flex text-sm font-semibold underline decoration-current/60 underline-offset-2"
          >
            {r.link_produtos}
          </Link>
        </div>
      ) : null}

      <CadastroRapidoBlock title={r.sec_formulario} defaultOpen className="mt-8">
      <form
        id="recebimento-form"
        className="space-y-0"
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="rec-origem" className="gerente-fin-label text-sm font-medium">
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
            <label htmlFor="rec-prod" className="gerente-fin-label text-sm font-medium">
              {r.label_produto}
            </label>
            <select
              id="rec-prod"
              name="produto_id"
              required
              disabled={semProdutos}
              className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-60`}
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
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="rec-obs" className="gerente-fin-label text-sm font-medium">
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
            <label htmlFor="rec-q-esp" className="gerente-fin-label text-sm font-medium">
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
            <label htmlFor="rec-q-conf" className="gerente-fin-label text-sm font-medium">
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
          {divergenciaDetalhe ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm md:col-span-2 ${
                divergenciaDetalhe.grave ? 'app-badge-danger' : 'app-badge-warn'
              }`}
              role="status"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    divergenciaDetalhe.grave ? 'app-badge-danger' : 'app-badge-warn'
                  }`}
                >
                  {divergenciaDetalhe.grave ? r.divergencia_grave : r.divergencia_moderada}
                </span>
                <span className="font-mono text-xs tabular-nums sm:text-sm">
                  {r.divergencia_calculo
                    .replace('{{esperada}}', formatDecimalPlaces(divergenciaDetalhe.esp, 3))
                    .replace('{{conferida}}', formatDecimalPlaces(divergenciaDetalhe.conf, 3))
                    .replace(
                      '{{delta}}',
                      (divergenciaDetalhe.delta >= 0 ? '+' : '') +
                        formatDecimalPlaces(divergenciaDetalhe.delta, 3),
                    )}
                </span>
              </div>
              <p className="mt-2 text-xs app-muted">
                {r.divergencia_legenda_pct.replace(
                  '{{pct}}',
                  divergenciaDetalhe.pct.toLocaleString(numLocale, { maximumFractionDigits: 1 }),
                )}
              </p>
              <p className="mt-2 text-sm leading-snug">{r.divergencia_alerta}</p>
            </div>
          ) : null}
        </div>
        <div className="gerente-fin-divider mt-6 flex justify-end border-t pt-5">
          <button type="submit" disabled={loading || semProdutos} className={btnPrimary}>
            {loading ? r.btn_confirmando : r.btn_confirmar}
          </button>
        </div>
      </form>
      </CadastroRapidoBlock>

      <section className="dragon-glass-card mt-10 rounded-xl p-5">
        <h2 className="gerente-section-accent text-lg font-semibold">{r.sec_recentes}</h2>
        <p className="gerente-fin-muted mt-1 text-xs">{r.sec_recentes_ajuda}</p>
        <div className="mt-4 overflow-x-auto">
          <GerenteTable
            tone="dragon"
            compact
            columns={[
              { key: 'id', header: r.col_remessa, priority: 'primary' },
              { key: 'o', header: r.col_origem },
              { key: 's', header: m.gerente.col_status },
              { key: 'd', header: r.col_data, priority: 'contextual' },
            ]}
          >
            {remessasRecentes.length === 0 ? (
              <tr>
                <td colSpan={4} className="gerente-fin-empty px-4 py-8 text-center text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <span>{r.empty_recentes}</span>
                    <a href="#recebimento-form" className="rounded-lg px-3 py-1.5 text-xs font-semibold app-btn-accent">
                      {r.btn_confirmar}
                    </a>
                  </div>
                </td>
              </tr>
            ) : (
              remessasRecentes.map((row) => (
                <tr key={row.id} className="gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-3 py-2 font-mono text-xs">{fmtGerenteIdCurto(row.id)}</td>
                  <td
                    className="gerente-fin-cell max-w-[220px] truncate px-3 py-2 text-sm"
                    title={row.origem_descricao}
                  >
                    {row.origem_descricao}
                  </td>
                  <td className="px-3 py-3">
                    <GerenteStatusBadge status={row.status} />
                  </td>
                  <td className="gerente-fin-cell whitespace-nowrap px-3 py-2 text-sm tabular-nums">
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
