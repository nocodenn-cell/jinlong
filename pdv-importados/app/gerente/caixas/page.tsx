import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { formatBRL } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { roundMoney2 } from '@/core/cart/totals'

export default async function GerenteCaixasPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: caixas } = await supabase
    .from('caixas')
    .select(
      'id, operador_id, data_abertura, data_fechamento, valor_inicial, valor_fechamento, fechamento_diferenca, fechamento_observacao, status'
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
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/gerente" style={{ fontSize: 13, color: '#2563eb' }}>
          ← {m.gerente.inicio}
        </Link>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{m.gerente.nav_caixas}</h1>
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
          rows={
            caixasList.map((c) => {
              const valorSistemaBase = valorSistemaPorCaixa.get(c.id) ?? 0
              const valorSistemaDinheiro = roundMoney2(Number(c.valor_inicial ?? 0) + valorSistemaBase)
              const valorFechamento = c.valor_fechamento != null ? Number(c.valor_fechamento) : null
              const diferencaCalculada =
                valorFechamento != null ? roundMoney2(valorFechamento - valorSistemaDinheiro) : null
              const diferenca =
                c.fechamento_diferenca != null ? Number(c.fechamento_diferenca) : diferencaCalculada
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
            })
          }
        />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.gerente.col_data}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_status}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_valor_inicial}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_valor_fechamento}</th>
              <th style={{ padding: 10 }}>Sistema (dinheiro)</th>
              <th style={{ padding: 10 }}>{m.caixa.diferenca}</th>
              <th style={{ padding: 10 }}>Motivo fechamento</th>
              <th style={{ padding: 10 }}>{m.gerente.col_caixa}</th>
            </tr>
          </thead>
          <tbody>
            {caixasList.map((c) => {
              const valorSistemaBase = valorSistemaPorCaixa.get(c.id) ?? 0
              const valorSistemaDinheiro = roundMoney2(Number(c.valor_inicial ?? 0) + valorSistemaBase)
              const valorFechamento = c.valor_fechamento != null ? Number(c.valor_fechamento) : null
              const diferencaCalculada =
                valorFechamento != null ? roundMoney2(valorFechamento - valorSistemaDinheiro) : null
              const diferenca =
                c.fechamento_diferenca != null ? Number(c.fechamento_diferenca) : diferencaCalculada
              const temDivergencia = diferenca != null && Math.abs(diferenca) >= 0.01
              return (
              <tr
                key={c.id}
                style={{
                  borderTop: '1px solid #f3f4f6',
                  background: temDivergencia ? '#fff7ed' : undefined,
                }}
              >
                <td style={{ padding: 10 }}>{formatDateTimeOrDash(c.data_abertura, locale)}</td>
                <td style={{ padding: 10 }}>{c.status}</td>
                <td style={{ padding: 10 }}>
                  {formatBRL(Number(c.valor_inicial), locale)}
                </td>
                <td style={{ padding: 10 }}>
                  {c.valor_fechamento != null
                    ? formatBRL(Number(c.valor_fechamento), locale)
                    : '—'}
                </td>
                <td style={{ padding: 10 }}>{formatBRL(valorSistemaDinheiro, locale)}</td>
                <td style={{ padding: 10, color: temDivergencia ? '#b45309' : undefined }}>
                  {diferenca != null
                    ? `${diferenca > 0 ? '+' : ''}${formatBRL(diferenca, locale)}`
                    : '—'}
                </td>
                <td style={{ padding: 10, maxWidth: 240, color: '#374151' }}>
                  {c.fechamento_observacao ?? '—'}
                </td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: 'monospace' }}>
                  {String(c.id).slice(0, 8)}…
                </td>
              </tr>
            )})}
            {caixasList.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 16, color: '#6b7280' }}>
                  {m.gerente.nenhum_caixa}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
