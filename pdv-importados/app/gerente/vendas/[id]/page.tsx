import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

function localeFromIdioma(idioma: string) {
  if (idioma === 'zh') return 'zh-CN'
  if (idioma === 'zh-HK') return 'zh-HK'
  return 'pt-BR'
}

type PageProps = { params: Promise<{ id: string }> }

export default async function GerenteVendaDetalhePage(props: PageProps) {
  const { id } = await props.params
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: venda, error: vendaErr } = await supabase
    .from('vendas')
    .select(
      `
      id,
      data,
      total_bruto,
      total_desconto,
      total_liquido,
      forma_pagamento,
      tipo_venda,
      status,
      caixa_id,
      operador_id,
      numero_nf,
      operador:usuarios!vendas_operador_id_fkey ( nome )
    `
    )
    .eq('id', id)
    .maybeSingle()

  if (vendaErr || !venda) {
    notFound()
  }

  const operadorNome =
    venda.operador && typeof venda.operador === 'object' && 'nome' in venda.operador
      ? String((venda.operador as { nome: string }).nome)
      : null

  const { data: itens } = await supabase
    .from('itens_venda')
    .select(
      `
      id,
      quantidade,
      preco_unitario,
      preco_unitario_original,
      desconto_unitario,
      tipo_preco,
      produto:produtos!itens_venda_produto_id_fkey ( nome, codigo_barras )
    `
    )
    .eq('venda_id', id)
    .order('id')

  const { data: baixas } = await supabase
    .from('estoque_baixas')
    .select('produto_id, created_at')
    .eq('venda_id', id)
    .order('created_at')

  const baixaProdutoIds = [...new Set((baixas ?? []).map((b) => b.produto_id))]
  let produtosBaixaRows: { id: string; nome: string }[] = []
  if (baixaProdutoIds.length > 0) {
    const { data: pb } = await supabase.from('produtos').select('id, nome').in('id', baixaProdutoIds)
    produtosBaixaRows = pb ?? []
  }
  const nomeProdutoBaixa = new Map(produtosBaixaRows.map((p) => [p.id, p.nome]))

  const caixaId = venda.caixa_id as string | null
  let movimentosCaixa: Array<{
    id: string
    tipo: string
    valor: number
    referencia_id: string | null
    observacao: string | null
    created_at: string | null
  }> = []
  if (caixaId) {
    const { data } = await supabase
      .from('movimentos_caixa')
      .select('id, tipo, valor, referencia_id, observacao, created_at')
      .eq('caixa_id', caixaId)
      .order('created_at', { ascending: true })
    movimentosCaixa = (data ?? []) as typeof movimentosCaixa
  }

  const money = (n: number) =>
    Number(n).toLocaleString(locale, { style: 'currency', currency: 'BRL' })

  function labelMovimentoTipo(tipo: string): string {
    const labels: Record<string, string> = {
      VENDA: m.gerente.mov_tipo_VENDA,
      SANGRIA: m.gerente.mov_tipo_SANGRIA,
      SUPRIMENTO: m.gerente.mov_tipo_SUPRIMENTO,
      DESCONTO_MANUAL: m.gerente.mov_tipo_DESCONTO_MANUAL,
    }
    return labels[tipo] ?? tipo
  }

  /** Sangria: valor armazenado positivo, efeito no caixa é saída. */
  function valorMovimentoExibido(tipo: string, valor: number): { texto: string; cor?: string } {
    const v = Number(valor)
    if (tipo === 'SANGRIA') {
      return { texto: money(-Math.abs(v)), cor: '#b45309' }
    }
    if (tipo === 'SUPRIMENTO') {
      return { texto: money(Math.abs(v)), cor: '#15803d' }
    }
    return { texto: money(v) }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/gerente/vendas" style={{ fontSize: 13, color: '#2563eb' }}>
          ← {m.gerente.nav_vendas}
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>{m.gerente.venda_detalhe_titulo}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280', fontFamily: 'monospace' }}>{id}</p>

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          display: 'grid',
          gap: 8,
          fontSize: 14,
        }}
      >
        <div>
          <strong>{m.gerente.col_data}:</strong>{' '}
          {venda.data
            ? new Date(venda.data).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
            : '—'}
        </div>
        <div>
          <strong>{m.gerente.col_total}:</strong> {money(Number(venda.total_liquido))}
          <span style={{ color: '#6b7280', marginLeft: 8 }}>
            ({m.gerente.venda_bruto} {money(Number(venda.total_bruto))} · {m.gerente.venda_desconto}{' '}
            {money(Number(venda.total_desconto))})
          </span>
        </div>
        <div>
          <strong>{m.gerente.col_forma}:</strong> {venda.forma_pagamento}
        </div>
        <div>
          <strong>{m.gerente.col_status}:</strong> {venda.status}
        </div>
        <div>
          <strong>{m.gerente.col_tipo_venda}:</strong> {venda.tipo_venda}
        </div>
        {venda.numero_nf ? (
          <div>
            <strong>{m.gerente.col_nf}:</strong> {venda.numero_nf}
          </div>
        ) : null}
        <div>
          <strong>{m.gerente.col_op}:</strong> {operadorNome ?? '—'}
        </div>
        <div>
          <strong>{m.gerente.col_caixa}:</strong>{' '}
          {caixaId ? (
            <Link href="/gerente/caixas" style={{ color: '#2563eb', fontFamily: 'monospace', fontSize: 13 }}>
              {String(caixaId).slice(0, 8)}…
            </Link>
          ) : (
            '—'
          )}
        </div>
      </section>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>{m.gerente.sec_itens_venda}</h2>
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 24 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.estoque.col_produto}</th>
              <th style={{ padding: 10 }}>{m.estoque.col_codigo}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_qtde}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_preco_unit}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_desconto_unit}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_tipo_preco}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_subtotal}</th>
            </tr>
          </thead>
          <tbody>
            {itens?.map((row) => {
              const p = row.produto
              const nome =
                p && typeof p === 'object' && 'nome' in p ? String((p as { nome: string }).nome) : '—'
              const cod =
                p && typeof p === 'object' && 'codigo_barras' in p
                  ? (p as { codigo_barras: string | null }).codigo_barras
                  : null
              const q = Number(row.quantidade)
              const pu = Number(row.preco_unitario)
              const sub = q * pu
              return (
                <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>{nome}</td>
                  <td style={{ padding: 10, fontFamily: 'monospace', fontSize: 12 }}>{cod ?? '—'}</td>
                  <td style={{ padding: 10 }}>{q}</td>
                  <td style={{ padding: 10 }}>{money(pu)}</td>
                  <td style={{ padding: 10 }}>{money(Number(row.desconto_unitario))}</td>
                  <td style={{ padding: 10 }}>{row.tipo_preco}</td>
                  <td style={{ padding: 10 }}>{money(sub)}</td>
                </tr>
              )
            })}
            {(!itens || itens.length === 0) && (
              <tr>
                <td colSpan={7} style={{ padding: 16, color: '#6b7280' }}>
                  {m.gerente.venda_sem_itens}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{m.gerente.sec_movimentos_caixa}</h2>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{m.gerente.sec_movimentos_caixa_ajuda}</p>
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 24 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.gerente.col_data}</th>
              <th style={{ padding: 10 }}>{m.relatorios.tipo}</th>
              <th style={{ padding: 10 }}>{m.relatorios.valor}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_obs_movimento}</th>
            </tr>
          </thead>
          <tbody>
            {movimentosCaixa.map((mov) => {
              const ehEstaVenda =
                mov.tipo === 'VENDA' && mov.referencia_id != null && String(mov.referencia_id) === id
              const { texto: valorTxt, cor: valorCor } = valorMovimentoExibido(mov.tipo, Number(mov.valor))
              return (
                <tr
                  key={mov.id}
                  style={{
                    borderTop: '1px solid #f3f4f6',
                    background: ehEstaVenda ? '#eff6ff' : undefined,
                  }}
                >
                  <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                    {mov.created_at
                      ? new Date(mov.created_at).toLocaleString(locale, {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })
                      : '—'}
                    {ehEstaVenda ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#1d4ed8',
                        }}
                      >
                        {m.gerente.venda_mov_destaque}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: 10 }}>{labelMovimentoTipo(mov.tipo)}</td>
                  <td style={{ padding: 10, fontVariantNumeric: 'tabular-nums', color: valorCor }}>
                    {valorTxt}
                  </td>
                  <td style={{ padding: 10, color: '#4b5563', maxWidth: 280 }}>
                    {mov.observacao?.trim() ? mov.observacao : '—'}
                  </td>
                </tr>
              )
            })}
            {movimentosCaixa.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: '#6b7280' }}>
                  {!caixaId ? m.gerente.venda_sem_caixa : m.gerente.venda_sem_movimentos_caixa}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>{m.gerente.sec_baixas_estoque}</h2>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{m.gerente.sec_baixas_estoque_ajuda}</p>
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>{m.estoque.col_produto}</th>
              <th style={{ padding: 10 }}>{m.gerente.col_data}</th>
            </tr>
          </thead>
          <tbody>
            {baixas?.map((b) => {
              const nome = nomeProdutoBaixa.get(b.produto_id) ?? '—'
              return (
                <tr key={`${b.produto_id}-${b.created_at}`} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>{nome}</td>
                  <td style={{ padding: 10 }}>
                    {b.created_at
                      ? new Date(b.created_at).toLocaleString(locale, {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })
                      : '—'}
                  </td>
                </tr>
              )
            })}
            {(!baixas || baixas.length === 0) && (
              <tr>
                <td colSpan={2} style={{ padding: 16, color: '#6b7280' }}>
                  {m.gerente.venda_sem_baixas}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
