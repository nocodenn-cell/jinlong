'use client'

import { useMemo, useState } from 'react'
import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import { formatarDecimal, normalizarDecimal } from '@/lib/import/hub/decimais'
import { compararEstimadoReal, simularPreco, type ModoPreco, type PrecoSimulado } from '@shared-core/src/import/precificacao'
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

  const comparacao = props.estimado && props.real ? compararEstimadoReal(props.estimado.itens, props.real.itens) : []
  const modos = [{ valor: 'MARGEM', rotulo: t.prec_margem }, { valor: 'MARKUP', rotulo: t.prec_markup }]
  const celula = (x: PrecoSimulado | string) =>
    typeof x === 'string' ? <span className="text-xs text-[var(--color-warning-strong)]">{x}</span> : (
      <span className="tabular-nums"><strong>R$ {formatarDecimal(x.preco_brl)}</strong>
        <span className="block text-xs text-fg-subtle">{t.prec_margem} {formatarDecimal(x.margem_resultante_pct)}% · {t.prec_markup} {formatarDecimal(x.markup_resultante_pct)}%</span></span>
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
                    <tr key={l.id} className="border-t border-[var(--color-border)]/60">
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
                </tr>
              </thead>
              <tbody>
                {comparacao.map((c) => (
                  <tr key={c.item_id} className="border-t border-[var(--color-border)]/60">
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
