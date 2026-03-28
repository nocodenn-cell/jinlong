import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

function localeFromIdioma(idioma: string) {
  if (idioma === 'zh') return 'zh-CN'
  if (idioma === 'zh-HK') return 'zh-HK'
  return 'pt-BR'
}

export default async function GerenteCaixasPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: caixas } = await supabase
    .from('caixas')
    .select(
      'id, operador_id, data_abertura, data_fechamento, valor_inicial, valor_fechamento, status'
    )
    .order('data_abertura', { ascending: false })
    .limit(80)

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
            { key: 'id', header: m.gerente.col_caixa },
          ]}
          rows={
            caixas?.map((c) => ({
              data_abertura: c.data_abertura ? new Date(c.data_abertura).toISOString() : '',
              status: c.status,
              valor_inicial: Number(c.valor_inicial),
              valor_fechamento:
                c.valor_fechamento != null ? Number(c.valor_fechamento) : '',
              id: c.id,
            })) ?? []
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
              <th style={{ padding: 10 }}>{m.gerente.col_caixa}</th>
            </tr>
          </thead>
          <tbody>
            {caixas?.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: 10 }}>
                  {c.data_abertura
                    ? new Date(c.data_abertura).toLocaleString(locale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—'}
                </td>
                <td style={{ padding: 10 }}>{c.status}</td>
                <td style={{ padding: 10 }}>
                  {Number(c.valor_inicial).toLocaleString(locale, {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </td>
                <td style={{ padding: 10 }}>
                  {c.valor_fechamento != null
                    ? Number(c.valor_fechamento).toLocaleString(locale, {
                        style: 'currency',
                        currency: 'BRL',
                      })
                    : '—'}
                </td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: 'monospace' }}>
                  {String(c.id).slice(0, 8)}…
                </td>
              </tr>
            ))}
            {(!caixas || caixas.length === 0) && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
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
