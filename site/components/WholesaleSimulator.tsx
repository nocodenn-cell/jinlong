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
  if (isWholesale(qty)) return fillTemplate(copy.applied, { valor: formatBrl(savingsCents(qty), locale) })
  const missing = missingUnits(qty)
  return missing === 1 ? copy.missingOne : fillTemplate(copy.missingMany, { n: missing })
}

/** Simulação ilustrativa, em memória: nenhum dado real, nenhuma chamada de rede. */
export function WholesaleSimulator({ locale, copy }: WholesaleSimulatorProps) {
  const [qty, setQty] = useState(EXAMPLE.initialQty)
  const wholesale = isWholesale(qty)
  return (
    <div className="jl-widget">
      <div className="jl-widget-top">
        <span>{copy.widgetTitle}</span>
        <span className="jl-dot" aria-hidden="true" />
      </div>
      <div className="jl-widget-status">
        <span id="wh-qty-label">{copy.quantity}</span>
        <div className="jl-stepper" role="group" aria-labelledby="wh-qty-label">
          <button type="button" aria-label={copy.decrease} disabled={qty <= 1} onClick={() => setQty(clampQty(qty - 1))}>
            −
          </button>
          <output aria-labelledby="wh-qty-label">{qty}</output>
          <button type="button" aria-label={copy.increase} disabled={qty >= EXAMPLE.maxQty} onClick={() => setQty(clampQty(qty + 1))}>
            +
          </button>
        </div>
      </div>
      <div className="jl-meter" aria-hidden="true">
        <i style={{ transform: `scaleX(${progressPercent(qty) / 100})` }} />
        <span style={{ left: `${markPercent()}%` }} />
      </div>
      <div className="jl-widget-values">
        <div>
          <small>{copy.unitPrice}</small>
          <strong data-testid="unit-price">{formatBrl(unitCents(qty), locale)}</strong>
          <span className={wholesale ? 'is-wholesale' : undefined}>{wholesale ? copy.wholesale : copy.retail}</span>
        </div>
        <div>
          <small>{copy.total}</small>
          <strong data-testid="total-price">{formatBrl(totalCents(qty), locale)}</strong>
          <span>{copy.simulated}</span>
        </div>
      </div>
      <p className={wholesale ? 'jl-widget-msg is-active' : 'jl-widget-msg'} aria-live="polite">
        {wholesale ? '✓ ' : ''}
        {liveMessage(qty, locale, copy)}
      </p>
      <p className="jl-widget-note">{copy.disclaimer}</p>
    </div>
  )
}
