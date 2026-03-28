import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

function localeFromIdioma(idioma: string) {
  if (idioma === 'zh') return 'zh-CN'
  if (idioma === 'zh-HK') return 'zh-HK'
  return 'pt-BR'
}

type VendaDia = {
  dia: string
  num_vendas: number
  total_liquido: number
  ticket_medio: number
  total_desconto: number
}

type TopProd = {
  id: string
  nome: string
  origem: string
  total_quantidade: number
  total_valor: number
  num_vendas: number
}

type EstBaixo = {
  id: string
  nome: string
  codigo_barras: string | null
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

export default async function GerenteRelatoriosPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: porDia } = await supabase
    .from('v_vendas_dia')
    .select('dia, num_vendas, total_liquido, ticket_medio, total_desconto')
    .order('dia', { ascending: false })
    .limit(21)

  const { data: top } = await supabase
    .from('v_top_produtos')
    .select('id, nome, origem, total_quantidade, total_valor, num_vendas')
    .order('total_valor', { ascending: false })
    .limit(20)

  const { data: baixo } = await supabase
    .from('v_estoque_baixo')
    .select('id, nome, codigo_barras, quantidade_atual, estoque_minimo, deficit')
    .limit(40)

  const fmtMoney = (n: number) =>
    Number(n).toLocaleString(locale, { style: 'currency', currency: 'BRL' })

  const sec = (title: string, children: ReactNode) => (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/gerente" style={{ fontSize: 13, color: '#2563eb' }}>
          ← {m.gerente.inicio}
        </Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{m.relatorios.titulo}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
        {m.relatorios.vendas_periodo} · {m.relatorios.mais_vendidos} · {m.relatorios.estoque_baixo}
      </p>

      {sec(
        m.gerente.sec_vendas_dia,
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>{m.gerente.col_dia}</th>
                <th style={{ padding: 10 }}>{m.gerente.col_num_vendas}</th>
                <th style={{ padding: 10 }}>{m.relatorios.valor}</th>
                <th style={{ padding: 10 }}>{m.gerente.col_ticket}</th>
              </tr>
            </thead>
            <tbody>
              {(porDia as VendaDia[] | null)?.map((row) => (
                <tr key={String(row.dia)} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>
                    {row.dia
                      ? new Date(row.dia).toLocaleDateString(locale, { dateStyle: 'medium' })
                      : '—'}
                  </td>
                  <td style={{ padding: 10 }}>{row.num_vendas}</td>
                  <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_liquido))}</td>
                  <td style={{ padding: 10 }}>{fmtMoney(Number(row.ticket_medio))}</td>
                </tr>
              ))}
              {(!porDia || porDia.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ padding: 16, color: '#6b7280' }}>
                    {m.gerente.nenhuma_venda}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {sec(
        m.gerente.sec_top_produtos,
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>{m.relatorios.produto}</th>
                <th style={{ padding: 10 }}>{m.relatorios.origem}</th>
                <th style={{ padding: 10 }}>{m.gerente.col_qtde}</th>
                <th style={{ padding: 10 }}>{m.gerente.col_valor}</th>
                <th style={{ padding: 10 }}>{m.gerente.col_num_vendas}</th>
              </tr>
            </thead>
            <tbody>
              {(top as TopProd[] | null)?.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>{row.nome}</td>
                  <td style={{ padding: 10 }}>{row.origem}</td>
                  <td style={{ padding: 10 }}>{Number(row.total_quantidade).toFixed(3)}</td>
                  <td style={{ padding: 10 }}>{fmtMoney(Number(row.total_valor))}</td>
                  <td style={{ padding: 10 }}>{row.num_vendas}</td>
                </tr>
              ))}
              {(!top || top.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {sec(
        m.gerente.sec_estoque_baixo,
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>{m.relatorios.produto}</th>
                <th style={{ padding: 10 }}>{m.relatorios.estoque_atual}</th>
                <th style={{ padding: 10 }}>{m.relatorios.minimo}</th>
                <th style={{ padding: 10 }}>{m.relatorios.deficit}</th>
              </tr>
            </thead>
            <tbody>
              {(baixo as EstBaixo[] | null)?.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>{row.nome}</td>
                  <td style={{ padding: 10 }}>{Number(row.quantidade_atual).toFixed(3)}</td>
                  <td style={{ padding: 10 }}>{Number(row.estoque_minimo).toFixed(3)}</td>
                  <td style={{ padding: 10, color: '#b45309', fontWeight: 600 }}>
                    {Number(row.deficit).toFixed(3)}
                  </td>
                </tr>
              ))}
              {(!baixo || baixo.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ padding: 16, color: '#6b7280' }}>
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
