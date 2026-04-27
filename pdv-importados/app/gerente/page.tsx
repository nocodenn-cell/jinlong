import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DragonEmblemIcon } from '@/components/icons/DragonEmblemIcon'
import { ImperialSealIcon } from '@/components/icons/ImperialSealIcon'
import { DragonIcon } from '@/components/icons/DragonIcon'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { formatBRL } from '@/lib/format/money'
import { getLojaIdUsuario } from '@/lib/auth/lojaUsuario'
import { resolveGerenteDashboardMetaDia } from '@/lib/gerente/dashboardMetaConfig'
import {
  gerenteInicioAtalhoKeys,
  gerenteNavLabel,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'
import { cn } from '@/lib/utils'

export default async function GerenteInicioPage() {
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()
  const { data: authUser } = await supabase.auth.getUser()
  const gerenteId = authUser.user?.id ?? null
  const lojaId = gerenteId ? await getLojaIdUsuario(supabase, gerenteId) : null
  const metaDia = resolveGerenteDashboardMetaDia({ lojaId, gerenteId })

  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)

  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)

  const { count: vendasHoje } = await supabase
    .from('vendas')
    .select('*', { count: 'exact', head: true })
    .gte('data', inicio.toISOString())
    .lt('data', fim.toISOString())
    .eq('status', 'CONCLUIDA')

  const { data: agg } = await supabase
    .from('vendas')
    .select('total_liquido, forma_pagamento')
    .gte('data', inicio.toISOString())
    .lt('data', fim.toISOString())
    .eq('status', 'CONCLUIDA')

  const totalHoje = (agg ?? []).reduce((s, r) => s + Number(r.total_liquido ?? 0), 0)
  const ticketMedioHoje = (vendasHoje ?? 0) > 0 ? totalHoje / Number(vendasHoje) : 0

  const inicioOntem = new Date(inicio)
  inicioOntem.setDate(inicioOntem.getDate() - 1)
  const fimOntem = new Date(inicio)

  const { data: aggOntem } = await supabase
    .from('vendas')
    .select('total_liquido')
    .gte('data', inicioOntem.toISOString())
    .lt('data', fimOntem.toISOString())
    .eq('status', 'CONCLUIDA')

  const totalOntem = (aggOntem ?? []).reduce((s, r) => s + Number(r.total_liquido ?? 0), 0)
  const variacaoPercentual =
    totalOntem > 0 ? ((totalHoje - totalOntem) / totalOntem) * 100 : totalHoje > 0 ? 100 : 0
  const tendenciaPositiva = variacaoPercentual >= 0
  const progressoMeta = Math.min(totalHoje / metaDia, 1)

  const formaPagamentoHoje = new Map<string, number>()
  for (const row of agg ?? []) {
    const forma = String(row.forma_pagamento ?? 'OUTROS')
    const atual = formaPagamentoHoje.get(forma) ?? 0
    formaPagamentoHoje.set(forma, atual + Number(row.total_liquido ?? 0))
  }
  const topPagamentos = [...formaPagamentoHoje.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  const pagamentoRotulo = new Map<string, string>([
    ['DINHEIRO', m.gerente.pagamento_dinheiro],
    ['PIX', m.gerente.pagamento_pix],
    ['CARTAO', m.gerente.pagamento_cartao],
    ['CARTÃO', m.gerente.pagamento_cartao],
    ['DEBITO', m.gerente.pagamento_cartao],
    ['CRÉDITO', m.gerente.pagamento_cartao],
  ])

  const pagamentoIcone = new Map<string, string>([
    ['DINHEIRO', '💵'],
    ['PIX', '⚡'],
    ['CARTAO', '💳'],
    ['CARTÃO', '💳'],
    ['DEBITO', '💳'],
    ['CRÉDITO', '💳'],
  ])

  const { data: ultimas } = await supabase
    .from('vendas')
    .select('id, data, total_liquido, forma_pagamento, status')
    .order('data', { ascending: false })
    .limit(8)

  const { count: lojasAtivasCount } = await supabase
    .from('lojas')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)

  const { count: caixasAbertos } = await supabase
    .from('caixas')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ABERTO')

  const { data: caixaAberto } = await supabase
    .from('caixas')
    .select('id, operador_id, valor_inicial, data_abertura, status')
    .eq('status', 'ABERTO')
    .order('data_abertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  let valorAtualCaixa = Number(caixaAberto?.valor_inicial ?? 0)
  if (caixaAberto?.id) {
    const { data: vendasCaixa } = await supabase
      .from('vendas')
      .select('total_liquido')
      .eq('caixa_id', caixaAberto.id)
      .eq('forma_pagamento', 'DINHEIRO')
      .eq('status', 'CONCLUIDA')

    valorAtualCaixa += (vendasCaixa ?? []).reduce((s, r) => s + Number(r.total_liquido ?? 0), 0)

    const { data: movimentosCaixa } = await supabase
      .from('movimentos_caixa')
      .select('tipo, valor')
      .eq('caixa_id', caixaAberto.id)
      .in('tipo', ['SUPRIMENTO', 'SANGRIA'])

    for (const movimento of movimentosCaixa ?? []) {
      const valor = Number(movimento.valor ?? 0)
      valorAtualCaixa += movimento.tipo === 'SUPRIMENTO' ? valor : -valor
    }
  }

  let operadorCaixaNome: string | null = null
  if (caixaAberto?.operador_id) {
    const { data: operador } = await supabase
      .from('usuarios')
      .select('nome')
      .eq('id', caixaAberto.operador_id)
      .maybeSingle()

    operadorCaixaNome = operador?.nome ? String(operador.nome) : null
  }

  const { count: filaFiscalPendente } = await supabase
    .from('documentos_fiscais_pendentes')
    .select('*', { count: 'exact', head: true })
    .in('status', ['PENDENTE', 'ERRO'])

  const exibirTransferencias = (lojasAtivasCount ?? 0) >= 2

  const atalhos = gerenteInicioAtalhoKeys(exibirTransferencias).map((key) => ({
    href: painelGerencialHref(key),
    label: gerenteNavLabel(m, key),
  }))

  const mostrarCaixaAberto = (caixasAbertos ?? 0) > 0
  const mostrarFilaFiscal = (filaFiscalPendente ?? 0) > 0
  const formatPct = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <div
          className={cn(
            'dragon-glass-card rounded-2xl border p-4 sm:p-5',
            mostrarCaixaAberto
              ? 'app-badge-positive'
              : 'app-badge-danger',
          )}
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'inline-flex h-12 w-12 items-center justify-center rounded-xl border text-2xl',
                  mostrarCaixaAberto
                    ? 'app-badge-positive'
                    : 'app-badge-danger',
                )}
                aria-hidden
              >
                {mostrarCaixaAberto ? '🟢' : '🔴'}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide">{m.gerente.status_caixa_label}</div>
                <div className="mt-1 text-lg font-bold">
                  {mostrarCaixaAberto ? m.dashboard.caixa_aberto : m.gerente.caixa_nao_aberto}
                  <span className="ml-1.5 tabular-nums">({caixasAbertos ?? 0})</span>
                </div>
                <div className="mt-1 text-sm">
                  {m.gerente.operador_label}: {operadorCaixaNome ?? '—'}
                </div>
              </div>
            </div>
            <div className="min-w-[170px] rounded-xl border px-3 py-2 text-right app-surface app-border">
              <div className="text-xs font-medium uppercase tracking-wide">{m.gerente.valor_atual_caixa}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">
                {mostrarCaixaAberto ? formatBRL(valorAtualCaixa, locale) : formatBRL(0, locale)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {mostrarFilaFiscal && (
        <div className="mb-6 flex flex-wrap gap-3">
          {mostrarFilaFiscal ? (
            <div
              className="dragon-glass-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold app-badge-danger"
              role="status"
            >
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 app-accent-text"
                pulse
                title={m.gerente.dragon_badge_fila_fiscal}
              />
              <span>
                {m.gerente.dragon_badge_fila_fiscal}
                <span className="ml-1.5 tabular-nums app-muted">({filaFiscalPendente ?? 0})</span>
              </span>
            </div>
          ) : null}
        </div>
      )}

      <h1 className="gerente-fin-page-title text-2xl font-semibold tracking-tight">{m.gerente.inicio}</h1>
      <p className="gerente-fin-muted mt-2 text-sm">{m.gerente.bem_vindo_resumo}</p>

      <div className="mt-8 flex flex-wrap gap-4">
        <div className="dragon-glass-card min-w-[140px] flex-1 rounded-xl p-4">
          <div className="gerente-fin-muted text-xs font-medium">{m.dashboard.num_vendas}</div>
          <div className="gerente-kpi-value mt-1 text-2xl font-bold tabular-nums">{String(vendasHoje ?? 0)}</div>
        </div>
        <div className="dragon-glass-card min-w-[140px] flex-1 rounded-xl p-4">
          <div className="gerente-fin-muted text-xs font-medium">{m.dashboard.total_vendido}</div>
          <div className="gerente-kpi-value mt-1 text-2xl font-bold tabular-nums">
            {formatBRL(totalHoje, locale)}
          </div>
        </div>
        <div className="dragon-glass-card min-w-[140px] flex-1 rounded-xl p-4">
          <div className="gerente-fin-muted text-xs font-medium">{m.gerente.ticket_medio}</div>
          <div className="gerente-kpi-value mt-1 text-2xl font-bold tabular-nums">
            {formatBRL(ticketMedioHoje, locale)}
          </div>
        </div>
        <div className="dragon-glass-card min-w-[190px] flex-[1.2] rounded-xl p-4">
          <div className="gerente-fin-muted text-xs font-medium">{m.gerente.meta_dia}</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="gerente-kpi-value text-lg font-bold tabular-nums">
              {formatBRL(totalHoje, locale)} / {formatBRL(metaDia, locale)}
            </div>
            <div
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                tendenciaPositiva ? 'app-badge-positive' : 'app-badge-danger',
              )}
            >
              <DragonIcon className="h-3.5 w-3.5" />
              {tendenciaPositiva ? '↑' : '↓'}
              {formatPct.format(Math.abs(variacaoPercentual) / 100)}
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full app-surface-soft">
            <div
              className="h-full rounded-full app-accent-bg transition-all"
              style={{ width: `${Math.max(6, Math.round(progressoMeta * 100))}%` }}
              aria-hidden
            />
          </div>
          <div className="gerente-fin-muted mt-1 text-xs">
            {m.gerente.vs_dia_anterior}: {tendenciaPositiva ? '↑' : '↓'}
            {formatPct.format(Math.abs(variacaoPercentual) / 100)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {topPagamentos.length > 0 ? (
          topPagamentos.map(([forma, total]) => (
            <div key={forma} className="dragon-glass-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5">
              <span aria-hidden>{pagamentoIcone.get(forma) ?? '•'}</span>
              <span className="gerente-fin-muted text-xs font-medium">
                {pagamentoRotulo.get(forma) ?? forma}:
              </span>
              <span className="text-xs font-semibold tabular-nums">{formatBRL(total, locale)}</span>
            </div>
          ))
        ) : (
          <div className="dragon-glass-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
            <DragonEmblemIcon className="h-4 w-4" />
            <span>{m.gerente.sem_pagamentos_hoje}</span>
          </div>
        )}
      </div>

      <h2 className="gerente-section-accent mt-10 text-base font-semibold">{m.gerente.atalhos_modulos}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {atalhos.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="gerente-inicio-chip dragon-glass-card rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {perfil === 'DONO' && (
        <>
          <h2 className="gerente-section-accent mt-10 text-base font-semibold">{m.gerente.secao_dono_titulo}</h2>
          <p className="gerente-fin-muted mt-2 text-sm">{m.gerente.secao_dono_subtitulo}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link
              href="/admin/dashboard"
              className="dragon-glass-card rounded-xl border p-4 transition-colors app-border hover:opacity-90"
            >
              <div className="text-sm font-semibold">{m.gerente.secao_dono_admin_titulo}</div>
              <div className="gerente-fin-muted mt-1 text-xs">{m.gerente.secao_dono_admin_desc}</div>
            </Link>
            <Link
              href={painelGerencialHref('financeiro')}
              className="dragon-glass-card rounded-xl border p-4 transition-colors app-border hover:opacity-90"
            >
              <div className="text-sm font-semibold">{m.gerente.secao_dono_fin_titulo}</div>
              <div className="gerente-fin-muted mt-1 text-xs">{m.gerente.secao_dono_fin_desc}</div>
            </Link>
          </div>
        </>
      )}

      <h2 className="gerente-section-accent mt-10 text-base font-semibold">{m.gerente.vendas_recentes_link}</h2>
      <div className="dragon-glass-card gerente-inicio-table gerente-table-wrap mt-3 overflow-hidden rounded-xl">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="gerente-fin-muted px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_data}
              </th>
              <th className="gerente-fin-muted px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_total}
              </th>
              <th className="gerente-fin-muted px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_forma}
              </th>
              <th className="gerente-fin-muted px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_status}
              </th>
              <th className="gerente-fin-muted px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_detalhes}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y app-divider">
            {ultimas?.map((v) => (
              <tr key={v.id}>
                <td className="gerente-fin-cell px-3 py-3">{formatDateTimeOrDash(v.data, locale)}</td>
                <td className="gerente-fin-cell px-3 py-3 tabular-nums">
                  {formatBRL(Number(v.total_liquido), locale)}
                </td>
                <td className="gerente-fin-cell px-3 py-3">{v.forma_pagamento}</td>
                <td className="gerente-fin-cell px-3 py-3">{v.status}</td>
                <td className="px-3 py-3">
                  <Link
                    href={`/gerente/vendas/${v.id}`}
                    className="gerente-section-accent text-sm font-medium hover:underline"
                  >
                    {m.gerente.ver_detalhes}
                  </Link>
                </td>
              </tr>
            ))}
            {(!ultimas || ultimas.length === 0) && (
              <tr>
                <td colSpan={5} className="gerente-fin-empty px-4 py-8 text-center">
                  {m.gerente.nenhuma_venda}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-right">
        <Link
          href={painelGerencialHref('vendas')}
          className="gerente-section-accent text-sm font-medium hover:underline"
        >
          {m.gerente.nav_vendas} →
        </Link>
      </div>
    </div>
  )
}
