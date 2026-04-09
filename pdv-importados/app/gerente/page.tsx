import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

function localeFromIdioma(idioma: string) {
  if (idioma === 'zh') return 'zh-CN'
  if (idioma === 'zh-HK') return 'zh-HK'
  return 'pt-BR'
}

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

  const exibirTransferencias = (lojasAtivasCount ?? 0) >= 2

  const atalhos = [
    { href: '/gerente/produtos', label: m.produtos.titulo },
    { href: '/gerente/estoque', label: m.estoque.titulo },
    { href: '/gerente/recebimento', label: 'Recebimento' },
    ...(exibirTransferencias ? [{ href: '/gerente/transferencias', label: 'Transferências' }] : []),
    { href: '/gerente/financeiro', label: 'Financeiro' },
    { href: '/gerente/vendas', label: m.gerente.nav_vendas },
    { href: '/gerente/caixas', label: m.gerente.nav_caixas },
    { href: '/gerente/relatorios', label: m.gerente.nav_relatorios },
  ]

  const card = (label: string, value: string) => (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        minWidth: 140,
        flex: '1 1 140px',
      }}
    >
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{m.gerente.inicio}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>{m.gerente.bem_vindo_resumo}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        {card(
          m.dashboard.num_vendas,
          String(vendasHoje ?? 0)
        )}
        {card(
          m.dashboard.total_vendido,
          totalHoje.toLocaleString(locale, { style: 'currency', currency: 'BRL' })
        )}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        {m.gerente.atalhos_modulos}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
        {atalhos.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#f9fafb',
              color: '#111827',
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        {m.gerente.vendas_recentes_link}
      </h2>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.gerente.col_data}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_total}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_forma}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_status}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_detalhes}</th>
            </tr>
          </thead>
          <tbody>
            {ultimas?.map((v) => (
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
                <td style={{ padding: 10 }}>
                  <Link href={`/gerente/vendas/${v.id}`} style={{ color: '#2563eb', fontSize: 13 }}>
                    {m.gerente.ver_detalhes}
                  </Link>
                </td>
              </tr>
            ))}
            {(!ultimas || ultimas.length === 0) && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: '#6b7280' }}>
                  {m.gerente.nenhuma_venda}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Link href="/gerente/vendas" style={{ fontSize: 14, color: '#2563eb' }}>
          {m.gerente.nav_vendas} →
        </Link>
      </div>
    </div>
  )
}
