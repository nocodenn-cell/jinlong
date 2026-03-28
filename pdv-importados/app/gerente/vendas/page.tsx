import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

function localeFromIdioma(idioma: string) {
  if (idioma === 'zh') return 'zh-CN'
  if (idioma === 'zh-HK') return 'zh-HK'
  return 'pt-BR'
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
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/gerente" style={{ fontSize: 13, color: '#2563eb' }}>
          ← {m.gerente.inicio}
        </Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>{m.gerente.nav_vendas}</h1>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.gerente.col_data}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_total}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_forma}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_status}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_caixa}</th>
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
              </tr>
            ))}
            {(!vendas || vendas.length === 0) && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
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
