import type { PdvWindowCopy } from '@/lib/content/types'
import type { SiteLocale } from '@/lib/locales'
import {
  HERO_SALE,
  findProduct,
  lineSubtotalCents,
  productName,
  saleTotalCents,
  type SaleLine,
} from '@/lib/products'
import { formatBrl, formatDecimal } from '@/lib/wholesale'
import { Seal } from './Brand'

interface PdvWindowProps {
  locale: SiteLocale
  copy: PdvWindowCopy
}

function SaleRow({ line, locale, copy, hideOnMobile }: { line: SaleLine; locale: SiteLocale; copy: PdvWindowCopy; hideOnMobile: boolean }) {
  const product = findProduct(line.productId)
  return (
    <tr className={hideOnMobile ? 'hide-m' : undefined}>
      <td>
        <span className="p">{productName(product, locale)}</span>
        {line.wholesale && <span className="jl-badge-wh">{copy.wholesaleBadge}</span>}
      </td>
      <td className="n">{line.qty}</td>
      <td className="n">{formatDecimal(lineSubtotalCents(line), locale)}</td>
    </tr>
  )
}

/** Representação HTML (não imagem) da frente de caixa, com a venda fictícia do hero. */
export function PdvWindow({ locale, copy }: PdvWindowProps) {
  return (
    <div className="jl-pdv" role="img" aria-label={copy.aria}>
      <div className="jl-pdv-top">
        <Seal small />
        {copy.top}
        <span className="jl-demo-tag">{copy.sample}</span>
      </div>
      <div className="jl-pdv-main">
        <table>
          <thead>
            <tr>
              <th>{copy.colProduct}</th>
              <th className="n">{copy.colQty}</th>
              <th className="n">{copy.colSubtotal}</th>
            </tr>
          </thead>
          <tbody>
            {HERO_SALE.map((line, index) => (
              <SaleRow key={line.productId} line={line} locale={locale} copy={copy} hideOnMobile={index === HERO_SALE.length - 1} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="jl-pdv-foot">
        <div>
          <span>{copy.total}</span>
          <b>{formatBrl(saleTotalCents(HERO_SALE), locale)}</b>
        </div>
        <div className="jl-pdv-cta">{copy.finish}</div>
      </div>
    </div>
  )
}
