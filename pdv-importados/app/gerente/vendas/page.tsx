import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'

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
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{m.gerente.nav_vendas}</h1>
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
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.gerente.col_data}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_total}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_forma}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_status}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_caixa}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_detalhes}</th>
            </tr>
          </thead>
          <tbody>
            {vendas?.map((v) => (
              <tr key={v.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: 10 }}>
                  {v.data
                    ? new Date(v.data).toLocaleString(locale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—'}
                </td>
                <td style={{ padding: 10 }}>
                  {Number(v.total_liquido).toLocaleString(locale, {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </td>
                <td style={{ padding: 10 }}>{v.forma_pagamento}</td>
                <td style={{ padding: 10 }}>{v.status}</td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: 'monospace' }}>
                  {v.caixa_id ? String(v.caixa_id).slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ padding: 10 }}>
                  <Link href={`/gerente/vendas/${v.id}`} style={{ color: '#2563eb', fontSize: 13 }}>
                    {m.gerente.ver_detalhes}
                  </Link>
                </td>
              </tr>
            ))}
            {(!vendas || vendas.length === 0) && (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: '#6b7280' }}>
                  {m.gerente.nenhuma_venda}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
