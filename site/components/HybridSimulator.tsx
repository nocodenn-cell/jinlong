'use client'

import { useMemo, useState } from 'react'
import type { SiteLocale } from '@/lib/locales'
import type { SimuladorCopy } from '@/lib/simuladorHibrido.copy'
import { CBS_2027_HIPOTESE, IBS_2027, simular } from '@/lib/simuladorHibrido'

function brl(v: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}
function pct(v: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}
const num = (s: string) => {
  const t = s.trim()
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : 0
}
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')

/** Cálculo só em memória: nenhuma chamada de rede, nada guardado. */
export function HybridSimulator({ locale, copy }: { locale: SiteLocale; copy: SimuladorCopy }) {
  const [fat, setFat] = useState('50000')
  const [rbt, setRbt] = useState('')
  const [b2b, setB2b] = useState('70')
  const [compras, setCompras] = useState('30000')
  const [aliq, setAliq] = useState(String(((CBS_2027_HIPOTESE + IBS_2027) * 100).toFixed(1)))

  const r = useMemo(
    () =>
      simular({
        faturamentoMensal: num(fat),
        rbt12: num(rbt) || undefined,
        parcelaB2B: num(b2b) / 100,
        comprasComCredito: num(compras),
        aliquotaCbs: Math.max(0, num(aliq) / 100 - IBS_2027),
        aliquotaIbs: IBS_2027,
      }),
    [fat, rbt, b2b, compras, aliq]
  )
  const { inputs: i, table: t } = copy
  const field = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="jl-hs-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
      {hint ? <small>{hint}</small> : null}
    </label>
  )

  return (
    <div className="jl-hs">
      <p className="jl-hs-disclaimer" role="note">
        ⚠ {copy.disclaimer}
      </p>
      <div className="jl-hs-grid">
        <form className="jl-hs-form" onSubmit={(e) => e.preventDefault()}>
          {field('hs-fat', i.faturamento, fat, setFat)}
          {field('hs-rbt', i.rbt12, rbt, setRbt, i.rbt12Hint)}
          {field('hs-b2b', i.b2b, b2b, setB2b, i.b2bHint)}
          {field('hs-compras', i.compras, compras, setCompras, i.comprasHint)}
          <label className="jl-hs-field" htmlFor="hs-anexo">
            <span>{i.anexo}</span>
            <select id="hs-anexo" disabled>
              <option>{i.anexoValue}</option>
            </select>
          </label>
          {field('hs-aliq', i.cbs, aliq, setAliq, i.cbsHint)}
          <p className="jl-hs-privacy">{copy.privacy}</p>
        </form>
        <div className="jl-hs-out" aria-live="polite">
          {r.recomendacao === 'fora' ? (
            <p className="jl-hs-rec">{copy.rec.fora}</p>
          ) : (
            <>
              <p className="jl-hs-meta">
                {t.faixa}: {r.faixa + 1}ª · {t.efetiva}: {pct(r.aliquotaEfetiva, locale)}
              </p>
              <table className="jl-hs-table">
                <caption>{t.head}</caption>
                <thead>
                  <tr>
                    <th scope="col"></th>
                    <th scope="col">{t.puro}</th>
                    <th scope="col">{t.hibrido}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><th scope="row">{t.das}</th><td>{brl(r.puro.das, locale)}</td><td>{brl(r.hibrido.das, locale)}</td></tr>
                  <tr><th scope="row">{t.porFora}</th><td>{brl(0, locale)}</td><td>{brl(r.hibrido.ibsCbsPorFora, locale)}</td></tr>
                  <tr className="tot"><th scope="row">{t.total}</th><td>{brl(r.puro.total, locale)}</td><td>{brl(r.hibrido.total, locale)}</td></tr>
                  <tr><th scope="row">{t.credito}</th><td>{brl(r.puro.creditoRepassado, locale)}</td><td>{brl(r.hibrido.creditoRepassado, locale)}</td></tr>
                </tbody>
              </table>
              <p className="jl-hs-meta">
                {fill(copy.extra, { custo: brl(r.custoExtraHibrido, locale), credito: brl(r.creditoExtraClientes, locale) })}
              </p>
              {r.saldoCredor > 0 ? <p className="jl-hs-meta">{fill(copy.saldo, { valor: brl(r.saldoCredor, locale) })}</p> : null}
              <p className={`jl-hs-rec jl-hs-rec--${r.recomendacao}`}>{copy.rec[r.recomendacao]}</p>
            </>
          )}
          <p className="jl-hs-disclaimer jl-hs-disclaimer--small">{copy.disclaimer}</p>
        </div>
      </div>
    </div>
  )
}
