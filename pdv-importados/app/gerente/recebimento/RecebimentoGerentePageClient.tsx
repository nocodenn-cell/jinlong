'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { CadastroRapidoBlock } from '@/components/gerente/cadastro'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { formatDecimalPlaces } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { StatusChip } from '@/components/ui/StatusChip'
import { Field, Input, Select } from '@/components/ui/forms'
import { ROUTES } from '@shared-core/navigation/routes'
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

  const remessaColumns: Column<RemessaRecenteRow>[] = useMemo(
    () => [
      {
        key: 'id',
        header: r.col_remessa,
        priority: 'primary',
        cell: (row) => (
          <span className="font-mono text-caption">{fmtGerenteIdCurto(row.id)}</span>
        ),
      },
      {
        key: 'origem',
        header: r.col_origem,
        cell: (row) => (
          <span className="max-w-[220px] truncate text-body" title={row.origem_descricao}>
            {row.origem_descricao}
          </span>
        ),
      },
      {
        key: 'status',
        header: m.gerente.col_status,
        cell: (row) => <StatusChip status={row.status} />,
      },
      {
        key: 'data',
        header: r.col_data,
        priority: 'contextual',
        cell: (row) => (
          <span className="whitespace-nowrap tabular-nums text-body">
            {fmtGerenteDateTime(row.created_at, locale)}
          </span>
        ),
      },
    ],
    [locale, m.gerente.col_status, r.col_data, r.col_origem, r.col_remessa],
  )

  return (
    <div className={`admin-v2-page ${idioma === 'pt' ? '' : 'font-chinese'}`}>
      <PageHeader
        title={r.titulo}
        subtitle={r.subtitulo}
        filters={
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption font-semibold text-fg-muted">
            {r.badge}
          </span>
        }
      />

      <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
        ← {m.gerente.inicio}
      </Link>

      {semProdutos ? (
        <div
          className="mt-8 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-5 text-[var(--color-warning-strong)] shadow-sm"
          role="status"
        >
          <p className="font-semibold">{r.sem_produtos_titulo}</p>
          <p className="mt-2 text-body">{r.sem_produtos_texto}</p>
          <Link
            href={ROUTES.admin.catalogo}
            className="mt-4 inline-flex text-body font-semibold underline decoration-current/60 underline-offset-2"
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
            <Field id="rec-origem" label={r.label_origem} required>
              <Input
                name="origem"
                required
                disabled={semProdutos}
                placeholder={r.ph_origem}
              />
            </Field>
            <Field id="rec-prod" label={r.label_produto} required>
              <Select
                name="produto_id"
                required
                disabled={semProdutos}
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
              </Select>
            </Field>
            <Field id="rec-obs" label={r.label_observacao} className="md:col-span-2">
              <Input
                name="observacao"
                disabled={semProdutos}
                placeholder={r.ph_observacao}
              />
            </Field>
            <Field id="rec-q-esp" label={r.label_qtd_esperada} required>
              <Input
                name="qtd_esperada"
                type="number"
                min={0}
                step="0.001"
                required
                disabled={semProdutos}
                value={qtdEspStr}
                onChange={(e) => setQtdEspStr(e.target.value)}
              />
            </Field>
            <Field id="rec-q-conf" label={r.label_qtd_conferida} required>
              <Input
                name="qtd_conferida"
                type="number"
                min={0}
                step="0.001"
                required
                disabled={semProdutos}
                value={qtdConfStr}
                onChange={(e) => setQtdConfStr(e.target.value)}
              />
            </Field>
            {divergenciaDetalhe ? (
              <div
                className={`rounded-lg border px-3 py-2 text-body md:col-span-2 ${
                  divergenciaDetalhe.grave
                    ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
                    : 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]'
                }`}
                role="status"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    status={divergenciaDetalhe.grave ? 'ERRO' : 'ALERTA'}
                    label={divergenciaDetalhe.grave ? r.divergencia_grave : r.divergencia_moderada}
                  />
                  <span className="font-mono text-caption tabular-nums sm:text-body">
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
                <p className="mt-2 text-caption text-fg-muted">
                  {r.divergencia_legenda_pct.replace(
                    '{{pct}}',
                    divergenciaDetalhe.pct.toLocaleString(numLocale, { maximumFractionDigits: 1 }),
                  )}
                </p>
                <p className="mt-2 text-body leading-snug">{r.divergencia_alerta}</p>
              </div>
            ) : null}
          </div>
          <div className="mt-6 flex justify-end border-t border-[var(--color-border)] pt-5">
            <Button type="submit" variant="primary" loading={loading} disabled={semProdutos}>
              {loading ? r.btn_confirmando : r.btn_confirmar}
            </Button>
          </div>
        </form>
      </CadastroRapidoBlock>

      <SectionCard title={r.sec_recentes} subtitle={r.sec_recentes_ajuda} className="mt-10">
        <DataTable
          columns={remessaColumns}
          data={remessasRecentes}
          rowKey={(row) => row.id}
          compact
          emptyState={
            <EmptyState
              title={r.empty_recentes}
              actionLabel={r.btn_confirmar}
              onAction={() => {
                document.getElementById('recebimento-form')?.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          }
        />
      </SectionCard>
    </div>
  )
}
