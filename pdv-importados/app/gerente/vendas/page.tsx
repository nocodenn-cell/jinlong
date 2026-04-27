import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { cancelarVendaGerenteAction } from './actions'

function statusBadgeClasses(status: string): string {
  const s = status.toUpperCase()
  if (s === 'CANCELADA') {
    return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-danger'
  }
  if (s === 'CONCLUIDA') {
    return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-positive'
  }
  return 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold app-btn-neutral'
}

export default async function GerenteVendasPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: vendas } = await supabase
    .from('vendas')
    .select('id, data, total_liquido, total_bruto, forma_pagamento, status, caixa_id')
    .order('data', { ascending: false })
    .limit(120)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      </div>

      <GerenteFilterBar
        title={m.gerente.nav_vendas}
        rightSlot={
          <ExportCsvButton
            label={m.gerente.exportar_csv}
            filename="gerente-vendas.csv"
            columns={[
              { key: 'data', header: m.gerente.col_data },
              { key: 'total_liquido', header: m.gerente.col_total },
              { key: 'forma_pagamento', header: m.gerente.col_forma },
              { key: 'status', header: m.gerente.col_status },
              { key: 'caixa_id', header: m.gerente.col_caixa },
            ]}
            rows={
              vendas?.map((v) => ({
                data: v.data ? new Date(v.data).toISOString() : '',
                total_liquido: Number(v.total_liquido),
                forma_pagamento: v.forma_pagamento,
                status: v.status,
                caixa_id: v.caixa_id ?? '',
              })) ?? []
            }
          />
        }
      />

      <GerenteTable
        tone="dragon"
        columns={[
          { key: 'data', header: m.gerente.col_data },
          { key: 'total', header: m.gerente.col_total },
          { key: 'forma', header: m.gerente.col_forma },
          { key: 'status', header: m.gerente.col_status },
          { key: 'caixa', header: m.gerente.col_caixa },
          { key: 'detalhes', header: m.gerente.col_detalhes },
          { key: 'acoes', header: m.gerente.col_acoes },
        ]}
      >
        {vendas?.map((v) => (
          <tr key={v.id} className="gerente-fin-row-hover transition-colors">
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 tabular-nums">
              {fmtGerenteDateTime(v.data, locale)}
            </td>
            <td className="gerente-fin-cell whitespace-nowrap px-3 py-3 font-medium tabular-nums">
              {fmtGerenteBRL(Number(v.total_liquido), locale)}
            </td>
            <td className="gerente-fin-cell px-3 py-3">{v.forma_pagamento}</td>
            <td className="px-3 py-3">
              <span className={statusBadgeClasses(v.status ?? '')}>{v.status}</span>
            </td>
            <td className="gerente-fin-cell px-3 py-3 font-mono text-xs">
              {fmtGerenteIdCurto(v.caixa_id ?? undefined)}
            </td>
            <td className="px-3 py-3">
              <Link
                href={`/gerente/vendas/${v.id}`}
                className="gerente-section-accent text-sm font-medium hover:underline"
              >
                {m.gerente.ver_detalhes}
              </Link>
            </td>
            <td className="min-w-[min(100%,280px)] max-w-[360px] px-3 py-3">
              {v.status !== 'CANCELADA' ? (
                <form
                  action={cancelarVendaGerenteAction}
                  className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch"
                >
                  <input type="hidden" name="venda_id" value={v.id} />
                  <input
                    name="motivo"
                    placeholder={m.gerente.venda_motivo_cancel_placeholder}
                    required
                    minLength={2}
                    maxLength={500}
                    className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm shadow-inner app-input"
                  />
                  <ConfirmActionButton
                    type="submit"
                    confirmMessage={`Confirma o cancelamento da venda ${fmtGerenteIdCurto(v.id)}? Esta ação não pode ser desfeita.`}
                    className="gerente-btn-cancel app-btn-danger shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
                  >
                    {m.comum.cancelar}
                  </ConfirmActionButton>
                </form>
              ) : (
                <span className="gerente-fin-empty text-sm">{m.gerente.venda_ja_cancelada}</span>
              )}
            </td>
          </tr>
        ))}
        {(!vendas || vendas.length === 0) && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-8 text-center">
              {m.gerente.nenhuma_venda}
            </td>
          </tr>
        )}
      </GerenteTable>
    </div>
  )
}
