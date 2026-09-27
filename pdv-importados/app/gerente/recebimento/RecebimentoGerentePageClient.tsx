'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'
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
import { ProdutoRecebimentoAutocomplete } from './ProdutoRecebimentoAutocomplete'

export type RecebimentoProdutoOpt = { id: string; nome: string; codigo_barras: string | null }
export type RecebimentoFornecedorOpt = { id: string; nome: string }

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
  fornecedores: RecebimentoFornecedorOpt[]
  remessasRecentes: RemessaRecenteRow[]
  /** Admin hub S6: oculta link “voltar” redundante com abas de estoque. */
  embeddedInAdminHub?: boolean
}>

export function RecebimentoGerentePageClient({
  idioma,
  produtos,
  fornecedores,
  remessasRecentes,
  embeddedInAdminHub = false,
}: Props) {
  const m = getMessages(idioma)
  const r = m.gerente.recebimento_page
  const locale = useMemo(() => localeFromIdioma(idioma), [idioma])
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])
  const semProdutos = produtos.length === 0
  const semFornecedores = fornecedores.length === 0
  const desabilitado = semProdutos || semFornecedores

  const [qtdEspStr, setQtdEspStr] = useState('')
  const [qtdConfStr, setQtdConfStr] = useState('')
  const [custoUnitarioStr, setCustoUnitarioStr] = useState('')
  const idempotencyKeyRef = useRef(crypto.randomUUID())

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
      fornecedor_id: string
      documento: string
      observacao: string
      produto_id: string
      qtd_esperada: number
      qtd_conferida: number
      custo_unitario: number
      idempotency_key: string
    }) => {
      const res = await criarRemessaConferencia({
        fornecedor_id: p.fornecedor_id,
        documento: p.documento || undefined,
        observacao: p.observacao || undefined,
        idempotency_key: p.idempotency_key,
        itens: [
          {
            produto_id: p.produto_id,
            quantidade_esperada: p.qtd_esperada,
            quantidade_conferida: p.qtd_conferida,
            custo_unitario: p.custo_unitario,
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
          idempotencyKeyRef.current = crypto.randomUUID()
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
    <div
      className={
        embeddedInAdminHub
          ? idioma === 'pt'
            ? ''
            : 'font-chinese'
          : `admin-v2-page ${idioma === 'pt' ? '' : 'font-chinese'}`
      }
    >
      <PageHeader
        title={r.titulo}
        subtitle={r.subtitulo}
        filters={
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption font-semibold text-fg-muted">
            {r.badge}
          </span>
        }
      />

      {!embeddedInAdminHub ? (
        <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      ) : null}

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

      {!semProdutos && semFornecedores ? (
        <div
          className="mt-8 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-5 text-[var(--color-warning-strong)] shadow-sm"
          role="status"
        >
          <p className="font-semibold">{r.sem_fornecedores_titulo}</p>
          <p className="mt-2 text-body">{r.sem_fornecedores_texto}</p>
          <Link
            href={ROUTES.admin.fornecedores}
            className="mt-4 inline-flex text-body font-semibold underline decoration-current/60 underline-offset-2"
          >
            {r.link_fornecedores}
          </Link>
        </div>
      ) : null}

      <CadastroRapidoBlock title={r.sec_formulario} defaultOpen className="mt-8">
        <form
          id="recebimento-form"
          className="space-y-0"
          onSubmit={(e) => {
            e.preventDefault()
            if (desabilitado) return
            const fd = new FormData(e.currentTarget)
            const fornecedorId = readFormDataString(fd, 'fornecedor_id')
            const pid = readFormDataString(fd, 'produto_id')
            const qEsp = Number(fd.get('qtd_esperada'))
            const qConf = Number(fd.get('qtd_conferida'))
            const custo = Number(fd.get('custo_unitario'))
            if (
              !fornecedorId ||
              !pid ||
              !Number.isFinite(qEsp) ||
              !Number.isFinite(qConf) ||
              qEsp <= 0 ||
              qConf <= 0 ||
              !Number.isFinite(custo) ||
              custo <= 0
            ) {
              emitGerenteToast({ kind: 'error', message: r.toast_dados_invalidos })
              return
            }
            void mutate({
              fornecedor_id: fornecedorId,
              documento: readFormDataString(fd, 'documento'),
              observacao: readFormDataString(fd, 'observacao'),
              produto_id: pid,
              qtd_esperada: qEsp,
              qtd_conferida: qConf,
              custo_unitario: custo,
              idempotency_key: idempotencyKeyRef.current,
            })
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="rec-fornecedor" label={r.label_fornecedor} required>
              <Select name="fornecedor_id" required disabled={desabilitado} defaultValue="">
                <option value="" disabled>
                  {r.opt_fornecedor_placeholder}
                </option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="rec-documento" label={r.label_documento}>
              <Input name="documento" disabled={desabilitado} placeholder={r.ph_documento} />
            </Field>
            <Field id="rec-prod" label={r.label_produto} required>
              {/* Busca server-side: o `<select>` anterior carregava só os 500
                  primeiros produtos e o resto ficava inalcançável, sem aviso. */}
              <ProdutoRecebimentoAutocomplete
                disabled={desabilitado}
                placeholder={r.ph_produto_busca}
                semResultadosLabel={r.produto_sem_resultados}
                minimoLabel={r.produto_busca_minimo}
                limparLabel={r.produto_limpar}
              />
            </Field>
            <Field id="rec-obs" label={r.label_observacao} className="md:col-span-2">
              <Input
                name="observacao"
                disabled={desabilitado}
                placeholder={r.ph_observacao}
              />
            </Field>
            <Field id="rec-q-esp" label={r.label_qtd_esperada} required>
              <Input
                name="qtd_esperada"
                type="number"
                min="0.001"
                step="0.001"
                required
                disabled={desabilitado}
                value={qtdEspStr}
                onChange={(e) => setQtdEspStr(e.target.value)}
              />
            </Field>
            <Field id="rec-q-conf" label={r.label_qtd_conferida} required>
              <Input
                name="qtd_conferida"
                type="number"
                min="0.001"
                step="0.001"
                required
                disabled={desabilitado}
                value={qtdConfStr}
                onChange={(e) => setQtdConfStr(e.target.value)}
              />
            </Field>
            <Field id="rec-custo" label={r.label_custo_unitario} required>
              <Input
                name="custo_unitario"
                type="number"
                min="0.01"
                step="0.01"
                required
                disabled={desabilitado}
                placeholder={r.ph_custo_unitario}
                value={custoUnitarioStr}
                onChange={(e) => setCustoUnitarioStr(e.target.value)}
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
            <Button type="submit" variant="primary" loading={loading} disabled={desabilitado}>
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
