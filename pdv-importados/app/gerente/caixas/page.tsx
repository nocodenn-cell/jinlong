import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { derivadosLinhaCaixaGerente } from '@/lib/gerente/caixaRowDerivados'
import { cn } from '@/lib/utils'

export default async function GerenteCaixasPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: caixas } = await supabase
    .from('caixas')
    .select(
      'id, operador_id, data_abertura, data_fechamento, valor_inicial, valor_fechamento, fechamento_diferenca, fechamento_observacao, status',
    )
    .order('data_abertura', { ascending: false })
    .limit(80)

  const caixasList = caixas ?? []
  const caixasIds = caixasList.map((c) => c.id)

  const valorSistemaPorCaixa = new Map<string, number>()
  if (caixasIds.length > 0) {
    const { data: vendasDinheiro } = await supabase
      .from('vendas')
      .select('caixa_id, total_liquido')
      .in('caixa_id', caixasIds)
      .eq('forma_pagamento', 'DINHEIRO')
      .eq('status', 'CONCLUIDA')

    for (const row of vendasDinheiro ?? []) {
      const atual = valorSistemaPorCaixa.get(row.caixa_id) ?? 0
      valorSistemaPorCaixa.set(row.caixa_id, atual + Number(row.total_liquido ?? 0))
    }

    const { data: movimentos } = await supabase
      .from('movimentos_caixa')
      .select('caixa_id, tipo, valor')
      .in('caixa_id', caixasIds)
      .in('tipo', ['SUPRIMENTO', 'SANGRIA'])

    for (const row of movimentos ?? []) {
      const atual = valorSistemaPorCaixa.get(row.caixa_id) ?? 0
      const valor = Number(row.valor ?? 0)
      const delta = row.tipo === 'SUPRIMENTO' ? valor : -valor
      valorSistemaPorCaixa.set(row.caixa_id, atual + delta)
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      </div>

      <GerenteFilterBar
        title={m.gerente.nav_caixas}
        rightSlot={
          <ExportCsvButton
            label={m.gerente.exportar_csv}
            filename="gerente-caixas.csv"
            columns={[
              { key: 'data_abertura', header: m.gerente.col_data },
              { key: 'status', header: m.gerente.col_status },
              { key: 'valor_inicial', header: m.gerente.col_valor_inicial },
              { key: 'valor_fechamento', header: m.gerente.col_valor_fechamento },
              { key: 'valor_sistema_dinheiro', header: 'Sistema (dinheiro)' },
              { key: 'diferenca', header: m.caixa.diferenca },
              { key: 'motivo_fechamento', header: 'Motivo fechamento' },
              { key: 'id', header: m.gerente.col_caixa },
            ]}
            rows={caixasList.map((c) => {
              const { valorSistemaDinheiro, valorFechamento, diferenca } =
                derivadosLinhaCaixaGerente(c, valorSistemaPorCaixa)
              return {
                data_abertura: c.data_abertura ? new Date(c.data_abertura).toISOString() : '',
                status: c.status,
                valor_inicial: Number(c.valor_inicial),
                valor_fechamento: valorFechamento ?? '',
                valor_sistema_dinheiro: valorSistemaDinheiro,
                diferenca: diferenca ?? '',
                motivo_fechamento: c.fechamento_observacao ?? '',
                id: c.id,
              }
            })}
          />
        }
      />

      <GerenteTable
        tone="dragon"
        columns={[
          { key: 'data', header: m.gerente.col_data },
          { key: 'status', header: m.gerente.col_status },
          { key: 'vi', header: m.gerente.col_valor_inicial },
          { key: 'vf', header: m.gerente.col_valor_fechamento },
          { key: 'sist', header: 'Sistema (dinheiro)' },
          { key: 'dif', header: m.caixa.diferenca },
          { key: 'mot', header: 'Motivo fechamento' },
          { key: 'id', header: m.gerente.col_caixa },
        ]}
      >
        {caixasList.map((c) => {
          const { valorSistemaDinheiro, diferenca, temDivergencia } =
            derivadosLinhaCaixaGerente(c, valorSistemaPorCaixa)
          return (
            <tr
              key={c.id}
              className={cn('gerente-fin-row-hover transition-colors', temDivergencia && 'gerente-caixa-row-alert')}
            >
              <td className="gerente-fin-cell px-3 py-3">{fmtGerenteDateTime(c.data_abertura, locale)}</td>
              <td className="gerente-fin-cell px-3 py-3">{c.status}</td>
              <td className="gerente-fin-cell px-3 py-3 tabular-nums">
                {fmtGerenteBRL(Number(c.valor_inicial), locale)}
              </td>
              <td className="gerente-fin-cell px-3 py-3 tabular-nums">
                {c.valor_fechamento != null ? fmtGerenteBRL(Number(c.valor_fechamento), locale) : '—'}
              </td>
              <td className="gerente-fin-cell px-3 py-3 tabular-nums">
                {fmtGerenteBRL(valorSistemaDinheiro, locale)}
              </td>
              <td
                className={cn(
                  'gerente-fin-cell px-3 py-3 tabular-nums',
                  temDivergencia && 'gerente-caixa-diff-warn font-semibold',
                )}
              >
                {diferenca != null
                  ? `${diferenca > 0 ? '+' : ''}${fmtGerenteBRL(diferenca, locale)}`
                  : '—'}
              </td>
              <td className="gerente-fin-cell max-w-[240px] px-3 py-3 text-sm">{c.fechamento_observacao ?? '—'}</td>
              <td className="gerente-fin-cell px-3 py-3 font-mono text-xs">{fmtGerenteIdCurto(c.id)}</td>
            </tr>
          )
        })}
        {caixasList.length === 0 && (
          <tr>
            <td colSpan={8} className="gerente-fin-empty px-4 py-8 text-center">
              {m.gerente.nenhum_caixa}
            </td>
          </tr>
        )}
      </GerenteTable>
    </div>
  )
}
