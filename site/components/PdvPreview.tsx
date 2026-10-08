'use client'

import { useState } from 'react'
import type { PdvPreviewCopy } from '@/lib/content/types'
import type { SiteLocale } from '@/lib/locales'
import {
  PREVIEW_PRODUCTS,
  clampQty,
  formatBrl,
  initialQuantities,
  isAtacado,
  lineTotalCents,
  totalCents,
  unitPriceCents,
  type PreviewProduct,
} from '@/lib/pdvPreview'

interface PdvPreviewProps {
  locale: SiteLocale
  copy: PdvPreviewCopy
}

interface LineProps extends PdvPreviewProps {
  product: PreviewProduct
  qty: number
  onChange: (next: number) => void
}

function productNames(product: PreviewProduct, locale: SiteLocale) {
  return locale === 'zh-CN'
    ? { primary: product.nameZh, primaryLang: 'zh-CN', alt: product.namePt, altLang: 'pt-BR' }
    : { primary: product.namePt, primaryLang: 'pt-BR', alt: null, altLang: 'pt-BR' }
}

function PreviewLine({ product, qty, onChange, locale, copy }: LineProps) {
  const names = productNames(product, locale)
  const atacado = isAtacado(qty)
  return (
    <li className="pdv__line">
      <div>
        <p className="pdv__name">
          <span lang={names.primaryLang}>{names.primary}</span>
          {names.alt && (
            <span className="pdv__name-alt" lang={names.altLang}>
              {names.alt}
            </span>
          )}
        </p>
      </div>
      <p className="pdv__sum">{formatBrl(lineTotalCents(product, qty), locale)}</p>
      <div className="pdv__meta">
        <div className="pdv__stepper">
          <button
            type="button"
            className="pdv__step"
            aria-label={`${copy.decrease} ${names.primary}`}
            disabled={qty <= 0}
            onClick={() => onChange(qty - 1)}
          >
            −
          </button>
          <span className="pdv__qty" aria-label={`${copy.qty}: ${qty}`}>
            {qty}
          </span>
          <button
            type="button"
            className="pdv__step"
            aria-label={`${copy.increase} ${names.primary}`}
            disabled={qty >= 99}
            onClick={() => onChange(qty + 1)}
          >
            +
          </button>
        </div>
        <span className="pdv__unit">× {formatBrl(unitPriceCents(product, qty), locale)}</span>
      </div>
      <span className={`pdv__tier${atacado ? ' pdv__tier--atacado' : ''}`}>
        {atacado ? copy.atacado : copy.varejo}
      </span>
    </li>
  )
}

export function PdvPreview({ locale, copy }: PdvPreviewProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities)

  const setQty = (id: string, next: number) =>
    setQuantities((current) => ({ ...current, [id]: clampQty(next) }))

  return (
    <section className="pdv" aria-labelledby="pdv-title">
      <div className="pdv__head">
        <h2 id="pdv-title" className="pdv__title">
          {copy.sale}
        </h2>
        <span className="pdv__stamp">{copy.sample}</span>
      </div>
      <ul>
        {PREVIEW_PRODUCTS.map((product) => (
          <PreviewLine
            key={product.id}
            product={product}
            qty={quantities[product.id] ?? 0}
            onChange={(next) => setQty(product.id, next)}
            locale={locale}
            copy={copy}
          />
        ))}
      </ul>
      <div className="pdv__total">
        <span className="pdv__total-label">{copy.total}</span>
        <output className="pdv__total-value" aria-live="polite">
          {formatBrl(totalCents(quantities), locale)}
        </output>
      </div>
      <ul className="pdv__pay" aria-label={copy.payment}>
        {copy.methods.map((method, index) => (
          <li key={method} data-selected={index === 0} aria-current={index === 0 ? 'true' : undefined}>
            {method}
          </li>
        ))}
      </ul>
      <p className="pdv__hint">{copy.hint}</p>
    </section>
  )
}
