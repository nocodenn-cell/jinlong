'use client'

import { useMemo, useState } from 'react'
import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import { formatarDecimal, normalizarDecimal } from '@/lib/import/hub/decimais'
import { compararEstimadoReal, repricoSugerido, simularFaixasAtacado, simularPreco, type FinalPreco, type ModoPreco, type PrecoFaixa, type PrecoSimulado } from '@shared-core/src/import/precificacao'
import { Selecao, Texto, type TextosImport } from './campos'

type CustoItem = { item_id: string; custo_unitario_brl: string }
type Base = { versao: number; tipo: 'SIMULACAO' | 'APURACAO'; aprovada: boolean; itens: CustoItem[] } | null

/**
 * Simulador de preço (varejo/atacado, margem/markup). NÃO altera preços oficiais.
 * Estimado = última simulação (antes da chegada); Real = apuração aprovada (ou a última apuração).
 */
export function PrecificacaoSecao(props: { t: TextosImport; nomes: Record<string, string>; estimado: Base; real: Base }) {
  const { t } = props
  const [base, setBase] = useState<'ESTIMADO' | 'REAL'>(props.real ? 'REAL' : 'ESTIMADO')
  const [varejo, setVarejo] = useState({ modo: 'MARGEM' as ModoPreco, pct: '40' })
  const [atacado, setAtacado] = useState({ modo: 'MARKUP' as ModoPreco, pct: '30' })
  const [despesas, setDespesas] = useState('0')
  const [final, setFinal] = useState<FinalPreco>('90')
  const [faixas, setFaixas] = useState([{ q: '1', pct: '40' }, { q: '10', pct: '30' }, { q: '50', pct: '20' }])
  const fonte = base === 'REAL' ? props.real : props.estimado

  const linhas = useMemo(() => {
    const sim = (custo: string, canal: 'VAREJO' | 'ATACADO', c: { modo: ModoPreco; pct: string }): PrecoSimulado | string => {
      const pct = normalizarDecimal(c.pct, 4)
      const dv = normalizarDecimal(despesas || '0', 4)
      if (!pct || !dv) return t.erro_valor_invalido
      try {
        return simularPreco(custo, { canal, modo: c.modo, percentual: pct, despesas_venda_pct: dv })
      } catch (e) {
        return (t as Record<string, string>)[`prec_${(e as Error).message}`] ?? t.erro_valor_invalido
      }
    }
    return (fonte?.itens ?? []).map((i) => ({ id: i.item_id, custo: i.custo_unitario_brl, v: sim(i.custo_unitario_brl, 'VAREJO', varejo), a: sim(i.custo_unitario_brl, 'ATACADO', atacado) }))
  }, [fonte, varejo, atacado, despesas, t])

  const faixasCalc = useMemo(() => (fonte?.itens ?? []).map((i) => {
    try {
      const fx = faixas.map((f) => ({ quantidade_minima: Number.parseInt(f.q, 10), modo: 'MARKUP' as ModoPreco, percentual: normalizarDecimal(f.pct, 4) ?? 'x' }))
      return { id: i.item_id, r: simularFaixasAtacado(i.custo_unitario_brl, fx, final, normalizarDecimal(despesas || '0', 4)) as PrecoFaixa[] | string }
    } catch (e) {
      return { id: i.item_id, r: (t as Record<string, string>)[`prec_${(e as Error).message}`] ?? t.erro_valor_invalido }
    }
  }), [fonte, faixas, final, despesas, t])

  const comparacao = props.estimado && props.real ? compararEstimadoReal(props.estimado.itens, props.real.itens) : []
  /** Repreço: mantém a margem do preço de varejo simulado sobre o custo ESTIMADO, aplicada ao custo REAL. */
  const repreco = (itemId: string, ce: string | null, cr: string | null) => {
    if (!ce || !cr) return null
    const pct = normalizarDecimal(varejo.pct, 4)
    if (!pct) return null
    try {
      const pe = simularPreco(ce, { canal: 'VAREJO', modo: varejo.modo, percentual: pct })
      return { estimado: pe.preco_brl, ...repricoSugerido(pe.preco_brl, ce, cr) }
    } catch {
      return null
    }
  }
  const modos = [{ valor: 'MARGEM', rotulo: t.prec_margem }, { valor: 'MARKUP', rotulo: t.prec_markup }]
  const celula = (x: PrecoSimulado | string) =>
    typeof x === 'string' ? <span className="text-xs text-[var(--color-warning-strong)]">{x}</span> : (
      <span className="tabular-nums"><strong>R$ {formatarDecimal(x.preco_brl)}</strong>
        <span className="block text-xs text-fg-subtle">{t.prec_margem_bruta} {formatarDecimal(x.margem_resultante_pct)}% · {t.prec_markup} {formatarDecimal(x.markup_resultante_pct)}%</span></span>
    )

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t.prec_titulo} subtitle={t.prec_subtitulo}>
        <p role="note" className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-prec-aviso">{t.prec_aviso}</p>
        {!props.estimado && !props.real ? (
          <p className="text-small text-fg-subtle" data-testid="imp-prec-sem-base">{t.prec_sem_base}</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-6">
              <Selecao rotulo={t.prec_base} valor={base} onChange={(v) => setBase(v as 'ESTIMADO' | 'REAL')} testId="imp-prec-base"
                opcoes={[...(props.estimado ? [{ valor: 'ESTIMADO', rotulo: `${t.prec_estimado} (v${props.estimado.versao})` }] : []),
                  ...(props.real ? [{ valor: 'REAL', rotulo: `${t.prec_real} (v${props.real.versao}${props.real.aprovada ? ` · ${t.status_APROVADA}` : ''})` }] : [])]} />
              <Selecao rotulo={`${t.prec_varejo} — ${t.prec_modo}`} valor={varejo.modo} onChange={(v) => setVarejo((s) => ({ ...s, modo: v as ModoPreco }))} opcoes={modos} testId="imp-prec-varejo-modo" />
              <Texto rotulo={`${t.prec_varejo} %`} valor={varejo.pct} onChange={(v) => setVarejo((s) => ({ ...s, pct: v }))} modoNumerico testId="imp-prec-varejo-pct" />
              <Selecao rotulo={`${t.prec_atacado} — ${t.prec_modo}`} valor={atacado.modo} onChange={(v) => setAtacado((s) => ({ ...s, modo: v as ModoPreco }))} opcoes={modos} testId="imp-prec-atacado-modo" />
              <Texto rotulo={`${t.prec_atacado} %`} valor={atacado.pct} onChange={(v) => setAtacado((s) => ({ ...s, pct: v }))} modoNumerico testId="imp-prec-atacado-pct" />
              <Texto rotulo={t.prec_despesas_venda} valor={despesas} onChange={setDespesas} modoNumerico dica={t.prec_despesas_venda_dica} testId="imp-prec-despesas" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-small" data-testid="imp-prec-tabela">
                <caption className="sr-only">{t.prec_titulo}</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase text-fg-subtle">
                    <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                    <th scope="col" className="px-2 py-1 text-right">{t.prec_custo_unitario}</th>
                    <th scope="col" className="px-2 py-1 text-right">{t.prec_varejo}</th>
                    <th scope="col" className="px-2 py-1 text-right">{t.prec_atacado}</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{props.nomes[l.id] ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">R$ {formatarDecimal(l.custo)}</td>
                      <td className="px-2 py-1.5 text-right" data-testid="imp-prec-varejo">{celula(l.v)}</td>
                      <td className="px-2 py-1.5 text-right" data-testid="imp-prec-atacado">{celula(l.a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
      {fonte ? (
        <SectionCard title={t.prec_faixas_titulo} subtitle={t.prec_faixas_subtitulo}>
          <div className="mb-3 grid gap-3 md:grid-cols-4">
            {faixas.map((f, k) => (
              <div key={k} className="grid grid-cols-2 gap-2">
                <Texto rotulo={`${t.prec_faixa} ${k + 1} — ${t.prec_qtd_min}`} valor={f.q} onChange={(v) => setFaixas((s) => s.map((x, j) => (j === k ? { ...x, q: v } : x)))} modoNumerico testId={`imp-faixa-${k}-qtd`} />
                <Texto rotulo={`${t.prec_markup} %`} valor={f.pct} onChange={(v) => setFaixas((s) => s.map((x, j) => (j === k ? { ...x, pct: v } : x)))} modoNumerico testId={`imp-faixa-${k}-pct`} />
              </div>
            ))}
            <Selecao rotulo={t.prec_arredondamento} valor={final} onChange={(v) => setFinal(v as FinalPreco)} testId="imp-prec-final"
              opcoes={[{ valor: 'NENHUM', rotulo: t.prec_arred_nenhum }, { valor: '90', rotulo: ',90' }, { valor: '99', rotulo: ',99' }, { valor: '00', rotulo: ',00' }]} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-small" data-testid="imp-prec-faixas">
              <caption className="sr-only">{t.prec_faixas_titulo}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase text-fg-subtle">
                  <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                  {faixas.map((f, k) => <th key={k} scope="col" className="px-2 py-1 text-right">≥ {f.q} un.</th>)}
                </tr>
              </thead>
              <tbody>
                {faixasCalc.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">{props.nomes[l.id] ?? '—'}</td>
                    {typeof l.r === 'string' ? (
                      <td colSpan={faixas.length} className="px-2 py-1.5 text-xs text-[var(--color-warning-strong)]">{l.r}</td>
                    ) : l.r.map((p) => (
                      <td key={p.quantidade_minima} className="px-2 py-1.5 text-right tabular-nums">
                        <strong>R$ {formatarDecimal(p.preco_arredondado_brl)}</strong>
                        <span className="block text-xs" data-testid="imp-faixa-margem-efetiva">{t.prec_margem_efetiva} {formatarDecimal(p.margem_efetiva_pct)}%</span>
                        <span className="block text-[11px] text-fg-subtle">{t.prec_margem_alvo} {formatarDecimal(p.margem_resultante_pct)}%</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title={t.prec_comparacao_titulo} subtitle={t.prec_comparacao_subtitulo}>
        {comparacao.length === 0 ? (
          <p className="text-small text-fg-subtle" data-testid="imp-prec-sem-comparacao">{t.prec_comparacao_vazia}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small" data-testid="imp-prec-comparacao">
              <caption className="sr-only">{t.prec_comparacao_titulo}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase text-fg-subtle">
                  <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.prec_estimado}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.prec_real}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.prec_variacao}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.prec_repreco}</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((c) => (
                  <tr key={c.item_id} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">{props.nomes[c.item_id] ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c.estimado_brl)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c.real_brl)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {c.variacao_brl === null ? '—' : (
                        <StatusBadge tone={c.variacao_brl.startsWith('-') ? 'success' : /[1-9]/.test(c.variacao_brl) ? 'warning' : 'neutral'}>
                          {formatarDecimal(c.variacao_brl)} ({c.variacao_pct === null ? '—' : `${formatarDecimal(c.variacao_pct)}%`})
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" data-testid="imp-prec-repreco">
                      {(() => { const r = repreco(c.item_id, c.estimado_brl, c.real_brl); return r ? <span>R$ {formatarDecimal(r.estimado)} → <strong>R$ {formatarDecimal(r.preco_brl)}</strong></span> : '—' })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
