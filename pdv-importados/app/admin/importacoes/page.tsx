import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { KpiStrip, PageHeader, SectionCard, StatusBadge, type KpiStripItem, type StatusBadgeTone } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES, adminImportacaoHref } from '@/lib/navigation/routes'
import { paginaImportacoes } from '@/lib/import/hub/gateImportacoes'
import { listarOperacoes, opcoesCadastro, type OperacaoLista } from '@/lib/import/hub/dadosImportacoes'
import { formatarDecimal, resumoMonetario, somarDecimais } from '@/lib/import/hub/decimais'
import { pendenciasDaLista } from '@/lib/import/hub/elegibilidade'
import { NovaImportacaoForm } from './_components/NovaImportacaoForm'
import { carregarCatalogoEmpresa } from '@/lib/import/hub/configImportacao'

export const dynamic = 'force-dynamic'

const STATUS = ['RASCUNHO', 'APROVADA', 'CANCELADA'] as const
const TOM: Record<string, StatusBadgeTone> = { RASCUNHO: 'warning', APROVADA: 'success', CANCELADA: 'neutral' }

type PageProps = { searchParams?: Promise<{ q?: string; status?: string }> }

function dataBr(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default async function ImportacoesPage({ searchParams }: PageProps) {
  const ctx = await paginaImportacoes()
  const t = getMessages(ctx.session.idioma).importacoes
  const sp = (searchParams ? await searchParams : {}) ?? {}
  const busca = (sp.q ?? '').trim().toLowerCase()
  const status = STATUS.includes(sp.status as (typeof STATUS)[number]) ? sp.status! : ''

  const [todas, opcoes, catalogo] = await Promise.all([listarOperacoes(ctx.client), opcoesCadastro(ctx.client), carregarCatalogoEmpresa(ctx.client, ctx.empresaId)])

  const emConferencia = todas.filter((o) => o.status === 'RASCUNHO')
  const comPendencia = emConferencia.filter((o) => pendenciasDaLista(o).length > 0)
  const custoAprovado = somarDecimais(todas.filter((o) => o.status === 'APROVADA').map((o) => o.aprovada_custo_total), 4)
  const custoProvisorio = somarDecimais(
    emConferencia.filter((o) => o.ultima_apuracao_status === 'OK').map((o) => o.ultima_apuracao_custo_total),
    4,
  )
  const recente = todas[0]

  const kpis: KpiStripItem[] = [
    { id: 'total', label: t.kpi_total, value: String(todas.length) },
    { id: 'conferencia', label: t.kpi_conferencia, value: String(emConferencia.length) },
    { id: 'aprovadas', label: t.kpi_aprovadas, value: String(todas.filter((o) => o.status === 'APROVADA').length) },
    { id: 'pendencias', label: t.kpi_pendencias, value: String(comPendencia.length) },
    { id: 'custo', label: t.kpi_custo_aprovado, value: resumoMonetario(custoAprovado), hint: t.kpi_custo_aprovado_hint },
    { id: 'provisorio', label: t.kpi_custo_simulado, value: resumoMonetario(custoProvisorio), hint: t.kpi_custo_simulado_hint },
  ]

  const filtradas = todas.filter(
    (o) =>
      (!status || o.status === status) &&
      (!busca || o.referencia.toLowerCase().includes(busca) || (o.fornecedor_nome ?? '').toLowerCase().includes(busca)),
  )

  const rotuloPendencia = (o: OperacaoLista) =>
    pendenciasDaLista(o).map((p) =>
      p === 'SEM_APURACAO' ? t.pendencia_sem_apuracao : p === 'BLOQUEADA' ? t.pendencia_bloqueada : t.pendencia_desatualizada,
    )

  return (
    <div className="admin-v2-page" data-testid="importacoes-hub">
      <PageHeader title={t.titulo} subtitle={t.subtitulo} />
      <p className="mb-4 text-small text-fg-subtle">{t.aviso_modulo}</p>
      {catalogo && !catalogo.config ? (
        <SectionCard title={t.nac_onboarding_titulo} className="mb-5">
          <p className="text-small" data-testid="importacoes-onboarding-uf">{t.nac_onboarding_texto}</p>
          <Link className="mt-2 inline-block font-medium text-[var(--color-brand-primary)] underline" href={`${ROUTES.admin.importacoes}/configuracao`}>{t.nac_configurar}</Link>
        </SectionCard>
      ) : catalogo?.config ? (
        <p className="mb-4 text-small"><Link className="font-medium text-[var(--color-brand-primary)] underline" href={`${ROUTES.admin.importacoes}/configuracao`} data-testid="importacoes-link-config">{t.nac_configurar}</Link> · {catalogo.config.uf_importador}</p>
      ) : null}

      <section aria-label={t.visao_geral} className="mb-5">
        <KpiStrip items={kpis} />
      </section>

      {recente ? (
        <SectionCard title={t.mais_recente} className="mb-5">
          <div className="flex flex-wrap items-center gap-3 text-body">
            <span className="font-semibold">{recente.referencia}</span>
            <StatusBadge tone={TOM[recente.status]}>{t[`status_${recente.status}`]}</StatusBadge>
            <span className="text-fg-subtle">{recente.fornecedor_nome ?? '—'}</span>
            <Link className="font-medium text-[var(--color-brand-primary)] underline-offset-4 hover:underline" href={adminImportacaoHref(recente.id)}>
              {t.abrir}
            </Link>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title={t.lista_titulo}
        action={<NovaImportacaoForm t={t} lojas={opcoes.lojas} fornecedores={opcoes.fornecedores} />}
      >
        <form method="get" action={ROUTES.admin.importacoes} className="mb-4 flex flex-wrap items-end gap-3" role="search">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-small font-medium">
            {t.busca}
            <input name="q" defaultValue={sp.q ?? ''} className="fp-control w-full text-small" type="search" />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium">
            {t.filtro_status}
            <select name="status" defaultValue={status} className="fp-control text-small">
              <option value="">{t.filtro_todos}</option>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {t[`status_${s}`]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline">
            {t.filtrar}
          </Button>
        </form>

        {filtradas.length === 0 ? (
          <p className="py-6 text-center text-body text-fg-subtle" data-testid="importacoes-vazio">
            {todas.length === 0 ? t.vazio : t.vazio_filtro}
          </p>
        ) : (
          <div className="admin-v2-dense-table-wrap overflow-x-auto">
            <table className="admin-v2-dense-table w-full border-collapse text-left text-small" data-testid="importacoes-tabela">
              <caption className="sr-only">{t.lista_titulo}</caption>
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[11px] uppercase tracking-wide text-fg-subtle">
                  <th scope="col" className="px-2 py-2">{t.col_referencia}</th>
                  <th scope="col" className="px-2 py-2">{t.col_fornecedor}</th>
                  <th scope="col" className="px-2 py-2">{t.col_data}</th>
                  <th scope="col" className="px-2 py-2">{t.col_moeda}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t.col_itens}</th>
                  <th scope="col" className="px-2 py-2">{t.col_status}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t.col_custo}</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((o) => {
                  const aprovado = o.status === 'APROVADA'
                  const custo = aprovado ? o.aprovada_custo_total : o.ultima_apuracao_status === 'OK' ? o.ultima_apuracao_custo_total : null
                  const pend = rotuloPendencia(o)
                  return (
                    <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-2 py-2 font-medium">
                        <Link href={adminImportacaoHref(o.id)} className="text-[var(--color-brand-primary)] underline-offset-4 hover:underline">
                          {o.referencia}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{o.fornecedor_nome ?? '—'}</td>
                      <td className="px-2 py-2 tabular-nums">{dataBr(o.data_invoice)}</td>
                      <td className="px-2 py-2">{o.moeda ?? '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{o.n_itens}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge tone={TOM[o.status]}>{t[`status_${o.status}`]}</StatusBadge>
                          {pend.map((p) => (
                            <StatusBadge key={p} tone="danger">
                              {p}
                            </StatusBadge>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {custo ? formatarDecimal(custo) : '—'}
                        {custo && !aprovado ? (
                          <span className="ml-1 text-xs text-fg-subtle">
                            ({o.ultima_apuracao_atual === false ? t.custo_desatualizado : t.custo_provisorio})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
