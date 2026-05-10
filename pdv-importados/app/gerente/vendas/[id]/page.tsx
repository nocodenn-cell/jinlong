import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { formatBRL } from '@/lib/format/money'
import { labelFormaPagamentoVenda, labelStatusVenda } from '@/lib/format/vendaLabels'

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

  const money = (n: number) => formatBRL(Number(n), locale)

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
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/gerente/vendas" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.nav_vendas}
        </Link>
      </div>

      <h1 className="gerente-fin-page-title text-2xl font-semibold tracking-tight">{m.gerente.venda_detalhe_titulo}</h1>
      <p className="gerente-fin-muted mb-5 font-mono text-sm">{id}</p>

      <section className="dragon-glass-card mb-5 grid gap-2 rounded-xl p-4 text-sm">
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_data}:</strong> {formatDateTimeOrDash(venda.data, locale)}
        </div>
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_total}:</strong> {money(Number(venda.total_liquido))}
          <span className="gerente-fin-muted ml-2">
            ({m.gerente.venda_bruto} {money(Number(venda.total_bruto))} · {m.gerente.venda_desconto}{' '}
            {money(Number(venda.total_desconto))})
          </span>
        </div>
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_forma}:</strong> {labelFormaPagamentoVenda(venda.forma_pagamento, m)}
        </div>
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_status}:</strong> {labelStatusVenda(venda.status, m)}
        </div>
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_tipo_venda}:</strong> {venda.tipo_venda}
        </div>
        {venda.numero_nf ? (
          <div className="gerente-fin-cell">
            <strong>{m.gerente.col_nf}:</strong> {venda.numero_nf}
          </div>
        ) : null}
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_op}:</strong> {operadorNome ?? '—'}
        </div>
        <div className="gerente-fin-cell">
          <strong>{m.gerente.col_caixa}:</strong>{' '}
          {caixaId ? (
            <Link href="/gerente/caixas" className="gerente-nav-back font-mono text-sm hover:underline">
              {String(caixaId).slice(0, 8)}…
            </Link>
          ) : (
            '—'
          )}
        </div>
      </section>

      <h2 className="gerente-section-accent mb-3 text-base font-semibold">{m.gerente.sec_itens_venda}</h2>
      <div className="gerente-table-dragon gerente-table-wrap dragon-glass-card mb-6 overflow-x-auto rounded-xl">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.estoque.col_produto}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.estoque.col_codigo}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_qtde}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_preco_unit}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_desconto_unit}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_tipo_preco}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_subtotal}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
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
                <tr key={row.id} className="gerente-fin-row-hover">
                  <td className="gerente-fin-cell px-3 py-2.5">{nome}</td>
                  <td className="gerente-fin-cell px-3 py-2.5 font-mono text-xs">{cod ?? '—'}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{q}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{money(pu)}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{money(Number(row.desconto_unitario))}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{row.tipo_preco}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{money(sub)}</td>
                </tr>
              )
            })}
            {(!itens || itens.length === 0) && (
              <tr>
                <td colSpan={7} className="gerente-fin-empty px-4 py-6 text-center text-sm">
                  {m.gerente.venda_sem_itens}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="gerente-section-accent mb-2 text-base font-semibold">{m.gerente.sec_movimentos_caixa}</h2>
      <p className="gerente-fin-muted mb-3 text-sm">{m.gerente.sec_movimentos_caixa_ajuda}</p>
      <div className="gerente-table-dragon gerente-table-wrap dragon-glass-card mb-6 overflow-x-auto rounded-xl">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_data}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.relatorios.tipo}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.relatorios.valor}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_obs_movimento}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {movimentosCaixa.map((mov) => {
              const ehEstaVenda =
                mov.tipo === 'VENDA' && mov.referencia_id != null && String(mov.referencia_id) === id
              const { texto: valorTxt, cor: valorCor } = valorMovimentoExibido(mov.tipo, Number(mov.valor))
              return (
                <tr
                  key={mov.id}
                  className={`gerente-fin-row-hover ${ehEstaVenda ? 'gerente-venda-mov-destaque' : ''}`}
                >
                  <td className="gerente-fin-cell whitespace-nowrap px-3 py-2.5">
                    {formatDateTimeOrDash(mov.created_at, locale, 'medium')}
                    {ehEstaVenda ? (
                      <span className="gerente-venda-mov-badge ml-2 text-[11px] font-semibold">
                        {m.gerente.venda_mov_destaque}
                      </span>
                    ) : null}
                  </td>
                  <td className="gerente-fin-cell px-3 py-2.5">{labelMovimentoTipo(mov.tipo)}</td>
                  <td
                    className="gerente-fin-cell px-3 py-2.5 tabular-nums"
                    style={valorCor ? { color: valorCor } : undefined}
                  >
                    {valorTxt}
                  </td>
                  <td className="gerente-fin-muted max-w-[280px] px-3 py-2.5 text-sm">
                    {mov.observacao?.trim() ? mov.observacao : '—'}
                  </td>
                </tr>
              )
            })}
            {movimentosCaixa.length === 0 && (
              <tr>
                <td colSpan={4} className="gerente-fin-empty px-4 py-6 text-center text-sm">
                  {!caixaId ? m.gerente.venda_sem_caixa : m.gerente.venda_sem_movimentos_caixa}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="gerente-section-accent mb-3 text-base font-semibold">{m.gerente.sec_baixas_estoque}</h2>
      <p className="gerente-fin-muted mb-3 text-sm">{m.gerente.sec_baixas_estoque_ajuda}</p>
      <div className="gerente-table-dragon gerente-table-wrap dragon-glass-card overflow-x-auto rounded-xl">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.estoque.col_produto}
              </th>
              <th className="gerente-fin-muted px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                {m.gerente.col_data}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {baixas?.map((b) => {
              const nome = nomeProdutoBaixa.get(b.produto_id) ?? '—'
              return (
                <tr key={`${b.produto_id}-${b.created_at}`} className="gerente-fin-row-hover">
                  <td className="gerente-fin-cell px-3 py-2.5">{nome}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{formatDateTimeOrDash(b.created_at, locale, 'medium')}</td>
                </tr>
              )
            })}
            {(!baixas || baixas.length === 0) && (
              <tr>
                <td colSpan={2} className="gerente-fin-empty px-4 py-6 text-center text-sm">
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
