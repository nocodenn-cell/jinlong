'use client'

import { useState } from 'react'
import type { WholesaleCopy } from '@/lib/content/types'
import type { SiteLocale } from '@/lib/locales'
import {
  WHOLESALE_EXAMPLE as EXAMPLE,
  clampQty,
  fillTemplate,
  formatBrl,
  isWholesale,
  markPercent,
  missingUnits,
  progressPercent,
  savingsCents,
  totalCents,
  unitCents,
} from '@/lib/wholesale'

interface WholesaleSimulatorProps {
  locale: SiteLocale
  copy: WholesaleCopy
}

function liveMessage(qty: number, locale: SiteLocale, copy: WholesaleCopy): string {
  if (isWholesale(qty)) {
    return fillTemplate(copy.applied, { valor: formatBrl(savingsCents(qty), locale) })
  }
  const missing = missingUnits(qty)
  return missing === 1 ? copy.missingOne : fillTemplate(copy.missingMany, { n: missing })
}

/** Simulação ilustrativa, em memória: nenhum dado real, nenhuma chamada de rede. */
export function WholesaleSimulator({ locale, copy }: WholesaleSimulatorProps) {
  const [qty, setQty] = useState(EXAMPLE.initialQty)
  const wholesale = isWholesale(qty)
  const tier = wholesale ? copy.unitWholesale : copy.unitRetail
  return (
    <div className="jl-wh-card">
      <div className="jl-wh-prod">
        <h3>{copy.product}</h3>
        <span className="jl-demo-tag">{copy.tag}</span>
      </div>
      <div className="jl-wh-rule">
        <div className="r">
          <span>{copy.retailRule}</span>
          <b>{formatBrl(EXAMPLE.retailCents, locale)}</b>
        </div>
        <div className="w">
          <span>{copy.wholesaleRule}</span>
          <b>{formatBrl(EXAMPLE.wholesaleCents, locale)}</b>
        </div>
      </div>
      <div className="jl-track" aria-hidden="true">
        <i style={{ width: `${progressPercent(qty)}%`, backgroundColor: wholesale ? 'var(--green-700)' : 'var(--graphite-700)' }} />
        <span className="mark" style={{ left: `${markPercent()}%` }} />
      </div>
      <div className="jl-wh-result">
        <div className="jl-stepper">
          <button type="button" aria-label={copy.decrease} disabled={qty <= 1} onClick={() => setQty(clampQty(qty - 1))}>
            −
          </button>
          <output aria-label={copy.quantity}>{qty}</output>
          <button type="button" aria-label={copy.increase} disabled={qty >= EXAMPLE.maxQty} onClick={() => setQty(clampQty(qty + 1))}>
            +
          </button>
        </div>
        <div className="total" style={{ textAlign: 'right' }}>
          <span>{`${qty} × ${formatBrl(unitCents(qty), locale)} (${tier})`}</span>
          <b>{formatBrl(totalCents(qty), locale)}</b>
        </div>
      </div>
      <p className="jl-wh-live" aria-live="polite" style={{ color: wholesale ? 'var(--green-700)' : 'var(--graphite-700)' }}>
        {wholesale ? '✓ ' : ''}
        {liveMessage(qty, locale, copy)}
      </p>
      <p className="jl-wh-note">{copy.disclaimer}</p>
    </div>
  )
}
