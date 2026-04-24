import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DragonEmblemIcon } from '@/components/icons/DragonEmblemIcon'
import { ImperialSealIcon } from '@/components/icons/ImperialSealIcon'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { formatBRL } from '@/lib/format/money'
import {
  gerenteInicioAtalhoKeys,
  gerenteNavLabel,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'

export default async function GerenteInicioPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

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
    .select('total_liquido')
    .gte('data', inicio.toISOString())
    .lt('data', fim.toISOString())
    .eq('status', 'CONCLUIDA')

  const totalHoje = (agg ?? []).reduce((s, r) => s + Number(r.total_liquido ?? 0), 0)

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

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {(mostrarCaixaAberto || mostrarFilaFiscal) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {mostrarCaixaAberto ? (
            <div
              className="dragon-glass-card inline-flex items-center gap-2 rounded-full border border-emerald-700/40 px-3 py-1.5 text-xs font-semibold text-emerald-100"
              role="status"
            >
              <DragonEmblemIcon className="h-5 w-5 shrink-0" />
              <span>
                {m.dashboard.caixa_aberto}
                <span className="ml-1.5 tabular-nums text-emerald-200/90">({caixasAbertos ?? 0})</span>
              </span>
            </div>
          ) : null}
          {mostrarFilaFiscal ? (
            <div
              className="dragon-glass-card inline-flex items-center gap-2 rounded-full border border-red-800/50 px-3 py-1.5 text-xs font-semibold text-red-100"
              role="status"
            >
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 text-red-500"
                pulse
                title={m.gerente.dragon_badge_fila_fiscal}
              />
              <span>
                {m.gerente.dragon_badge_fila_fiscal}
                <span className="ml-1.5 tabular-nums text-red-200/90">({filaFiscalPendente ?? 0})</span>
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
          <tbody className="divide-y divide-slate-700/50">
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
