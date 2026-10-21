'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/admin-v2'
import { formatarDecimal } from '@/lib/import/hub/decimais'
import type { Item } from '@/lib/import/hub/dadosImportacoes'
import { buscarProdutosAction, removerRascunhoAction, salvarItemAction, type ItemInput } from '../actions'
import { Campo, ErroFormulario, Texto, useAcao, type TextosImport } from './campos'

const vazio = (moeda: string): Required<{ [K in keyof ItemInput]: string }> => ({
  id: '',
  descricao: '',
  codigo_fornecedor: '',
  ncm: '',
  produto_id: '',
  moeda,
  valor_mercadoria_moeda: '',
  valor_aduaneiro_brl: '',
  quantidade_comercial: '',
  unidade_comercial: 'UN',
  fator_para_estoque: '1',
  quantidade_estoque: '',
  peso_liquido_kg: '',
  peso_bruto_kg: '',
  volume_m3: '',
})

export function MercadoriasSecao(props: {
  t: TextosImport
  operacaoId: string
  itens: Item[]
  produtos: Record<string, string>
  moedaPadrao: string
  editavel: boolean
}) {
  const { t, itens, editavel } = props
  const { executar, pendente, erro } = useAcao(t)
  const [form, setForm] = useState<ReturnType<typeof vazio> | null>(null)
  const [produtoNome, setProdutoNome] = useState('')
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<{ id: string; nome: string }[]>([])

  const set = (k: keyof ReturnType<typeof vazio>) => (v: string) => setForm((s) => (s ? { ...s, [k]: v } : s))

  function editar(i: Item) {
    setForm({
      id: i.id,
      descricao: i.descricao,
      codigo_fornecedor: i.codigo_fornecedor ?? '',
      ncm: i.ncm ?? '',
      produto_id: i.produto_id ?? '',
      moeda: i.moeda,
      valor_mercadoria_moeda: i.valor_mercadoria_moeda,
      valor_aduaneiro_brl: i.valor_aduaneiro_brl ?? '',
      quantidade_comercial: i.quantidade_comercial,
      unidade_comercial: i.unidade_comercial,
      fator_para_estoque: i.fator_para_estoque,
      quantidade_estoque: i.quantidade_estoque,
      peso_liquido_kg: i.peso_liquido_kg ?? '',
      peso_bruto_kg: i.peso_bruto_kg ?? '',
      volume_m3: i.volume_m3 ?? '',
    })
    setProdutoNome(i.produto_id ? props.produtos[i.produto_id] ?? '' : '')
  }

  return (
    <SectionCard
      title={t.merc_titulo}
      action={
        editavel && !form ? (
          <Button type="button" onClick={() => { setForm(vazio(props.moedaPadrao)); setProdutoNome('') }} data-testid="imp-item-adicionar">
            {t.merc_adicionar}
          </Button>
        ) : null
      }
    >
      {itens.length === 0 ? (
        <p className="py-4 text-body text-fg-subtle">{t.merc_vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small" data-testid="imp-itens">
            <caption className="sr-only">{t.merc_titulo}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase text-fg-subtle">
                <th scope="col" className="px-2 py-1">{t.merc_descricao}</th>
                <th scope="col" className="px-2 py-1">{t.merc_codigo_fornecedor}</th>
                <th scope="col" className="px-2 py-1">{t.merc_ncm}</th>
                <th scope="col" className="px-2 py-1">{t.merc_produto}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.merc_qtd_comercial}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.merc_fator}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.merc_qtd_estoque}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.merc_valor}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.merc_peso_bruto}</th>
                {editavel ? <th scope="col" className="px-2 py-1"><span className="sr-only">{t.editar}</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1.5 font-medium">{i.descricao}</td>
                  <td className="px-2 py-1.5 font-mono" data-testid="imp-item-codigo">{i.codigo_fornecedor ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{i.ncm ?? '—'}</td>
                  <td className="px-2 py-1.5">{i.produto_id ? props.produtos[i.produto_id] ?? '✓' : t.merc_produto_nenhum}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.quantidade_comercial)} {i.unidade_comercial}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.fator_para_estoque)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.quantidade_estoque)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{i.moeda} {formatarDecimal(i.valor_mercadoria_moeda)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.peso_bruto_kg)}</td>
                  {editavel ? (
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <Button type="button" variant="ghost" size="sm" onClick={() => editar(i)}>{t.editar}</Button>
                      <Button
                        type="button"
                        variant="ghost" size="sm"
                        onClick={() => {
                          if (window.confirm(t.confirmar_remocao)) executar(() => removerRascunhoAction(props.operacaoId, 'ITEM', i.id))
                        }}
                      >
                        {t.remover}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <form
          className="mt-5 flex flex-col gap-3 border-t border-[var(--color-border)] pt-4"
          aria-label={t.merc_adicionar}
          data-testid="imp-item-form"
          onSubmit={(e) => {
            e.preventDefault()
            executar(() => salvarItemAction(props.operacaoId, form), () => setForm(null), t.salvo)
          }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Texto rotulo={t.merc_descricao} valor={form.descricao} onChange={set('descricao')} obrigatorio testId="imp-item-descricao" />
            <Texto rotulo={t.merc_codigo_fornecedor} dica={t.merc_codigo_hint} valor={form.codigo_fornecedor} onChange={set('codigo_fornecedor')} testId="imp-item-codigo-input" />
            <Texto rotulo={t.merc_ncm} valor={form.ncm} onChange={set('ncm')} maxLength={10} />
            <Campo rotulo={t.merc_produto} dica={t.merc_produto_hint}>
              {(id, describedBy) => (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <input
                      id={id}
                      aria-describedby={describedBy}
                      className="fp-control w-full text-small"
                      value={busca}
                      placeholder={produtoNome || t.merc_produto_nenhum}
                      onChange={(e) => setBusca(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void buscarProdutosAction(busca).then((r) => setAchados(r.ok ? r.data : []))
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline" size="sm"
                      onClick={() => void buscarProdutosAction(busca).then((r) => setAchados(r.ok ? r.data : []))}
                    >
                      {t.merc_buscar_produto}
                    </Button>
                  </div>
                  {achados.length > 0 ? (
                    <ul className="max-h-40 overflow-auto rounded-md border border-[var(--color-border)]" role="listbox">
                      {achados.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full px-2 py-1 text-left text-small hover:bg-[var(--color-surface-soft)]"
                            onClick={() => { set('produto_id')(p.id); setProdutoNome(p.nome); setAchados([]); setBusca('') }}
                          >
                            {p.nome}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {form.produto_id ? (
                    <button type="button" className="self-start text-xs underline" onClick={() => { set('produto_id')(''); setProdutoNome('') }}>
                      {produtoNome} — {t.remover}
                    </button>
                  ) : null}
                </div>
              )}
            </Campo>
            <Texto rotulo={t.merc_moeda} valor={form.moeda} onChange={(v) => set('moeda')(v.toUpperCase())} maxLength={3} obrigatorio />
            <Texto rotulo={t.merc_valor} valor={form.valor_mercadoria_moeda} onChange={set('valor_mercadoria_moeda')} modoNumerico obrigatorio testId="imp-item-valor" />
            <Texto rotulo={t.merc_valor_aduaneiro} valor={form.valor_aduaneiro_brl} onChange={set('valor_aduaneiro_brl')} modoNumerico />
            <Texto rotulo={t.merc_qtd_comercial} valor={form.quantidade_comercial} onChange={set('quantidade_comercial')} modoNumerico obrigatorio testId="imp-item-qtd" />
            <Texto rotulo={t.merc_unidade} valor={form.unidade_comercial} onChange={set('unidade_comercial')} maxLength={10} obrigatorio />
            <Texto rotulo={t.merc_fator} valor={form.fator_para_estoque} onChange={set('fator_para_estoque')} modoNumerico obrigatorio testId="imp-item-fator" />
            <Texto rotulo={t.merc_qtd_estoque} dica={t.merc_qtd_estoque_hint} valor={form.quantidade_estoque} onChange={set('quantidade_estoque')} modoNumerico obrigatorio testId="imp-item-qtd-estoque" />
            <Texto rotulo={t.merc_peso_liquido} valor={form.peso_liquido_kg} onChange={set('peso_liquido_kg')} modoNumerico />
            <Texto rotulo={t.merc_peso_bruto} valor={form.peso_bruto_kg} onChange={set('peso_bruto_kg')} modoNumerico testId="imp-item-peso-bruto" />
            <Texto rotulo={t.merc_volume} valor={form.volume_m3} onChange={set('volume_m3')} modoNumerico />
          </div>
          <p className="text-xs text-fg-subtle">{t.merc_rateio_hint}</p>
          <ErroFormulario mensagem={erro} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pendente} data-testid="imp-item-salvar">{pendente ? t.salvando : t.salvar}</Button>
            <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={pendente}>{t.cancelar}</Button>
          </div>
        </form>
      ) : null}
    </SectionCard>
  )
}
