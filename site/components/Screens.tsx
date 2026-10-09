import type { HomeContent } from '@/lib/content'
import type { SiteLocale } from '@/lib/locales'
import {
  CLOSING_FIGURES,
  CRITICAL_STOCK_LIMIT,
  DEMO_PRODUCTS,
  PANEL_BARS,
  PANEL_KPIS,
  closingTotalCents,
  productName,
} from '@/lib/products'
import { formatBrl, formatDecimal } from '@/lib/wholesale'
import { Seal } from './Brand'

interface ScreensProps {
  locale: SiteLocale
  content: HomeContent
}

function StockTable({ locale, content }: ScreensProps) {
  const { stock } = content.screens
  return (
    <figure className="jl-screen" style={{ margin: 0 }}>
      <div className="jl-screen-bar">
        <Seal small />
        {stock.bar}
        <small>{content.screens.represent}</small>
      </div>
      <div className="jl-screen-body">
        <table className="jl-stock">
          <thead>
            <tr>
              <th scope="col">{stock.colProduct}</th>
              <th scope="col" className="n">{stock.colRetail}</th>
              <th scope="col" className="n">{stock.colWholesale}</th>
              <th scope="col" className="n">{stock.colStock}</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_PRODUCTS.map((product) => (
              <tr key={product.id}>
                <td>{productName(product, locale)}</td>
                <td className="n">{formatDecimal(product.retailCents, locale)}</td>
                <td className="n">
                  {product.wholesaleCents === null ? (
                    '—'
                  ) : (
                    <>
                      {formatDecimal(product.wholesaleCents, locale)} <small>≥{product.wholesaleMin}</small>
                    </>
                  )}
                </td>
                <td className={product.stock <= CRITICAL_STOCK_LIMIT ? 'n jl-qty-low' : 'n'}>{product.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="jl-screen-cap">
        <h3>{stock.captionTitle}</h3>
        <p>{stock.captionBody}</p>
      </figcaption>
    </figure>
  )
}

function ClosingTable({ locale, content }: ScreensProps) {
  const { close } = content.screens
  const rows: ReadonlyArray<readonly [string, number]> = [
    [close.opening, CLOSING_FIGURES.openingCents],
    [close.cash, CLOSING_FIGURES.cashCents],
    [close.pix, CLOSING_FIGURES.pixCents],
    [close.debit, CLOSING_FIGURES.debitCents],
    [close.credit, CLOSING_FIGURES.creditCents],
  ]
  return (
    <figure className="jl-screen" style={{ margin: 0 }}>
      <div className="jl-screen-bar">
        {close.bar}
        <small>{content.screens.represent}</small>
      </div>
      <div className="jl-screen-body">
        <table className="jl-stock">
          <tbody>
            {rows.map(([label, cents]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="n">{formatBrl(cents, locale)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <b>{close.total}</b>
              </td>
              <td className="n">
                <b>{formatBrl(closingTotalCents(), locale)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <figcaption className="jl-screen-cap">
        <h3>{close.captionTitle}</h3>
        <p>{close.captionBody}</p>
      </figcaption>
    </figure>
  )
}

function PanelScreen({ locale, content }: ScreensProps) {
  const { panel } = content.screens
  const kpis: ReadonlyArray<readonly [string, string]> = [
    [panel.kpiSales, formatBrl(closingTotalCents(), locale)],
    [panel.kpiItems, String(PANEL_KPIS.itemsSold)],
    [panel.kpiCritical, String(PANEL_KPIS.criticalItems)],
  ]
  return (
    <figure className="jl-screen" style={{ margin: 0 }}>
      <div className="jl-screen-bar">
        {panel.bar}
        <small>{content.screens.represent}</small>
      </div>
      <div className="jl-screen-body">
        <div className="jl-kpis">
          {kpis.map(([label, value]) => (
            <div key={label} className="jl-kpi">
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="jl-bars" aria-hidden="true">
          {PANEL_BARS.map((height, index) => (
            <i key={index} className={index === PANEL_BARS.length - 2 ? 'on' : undefined} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
      <figcaption className="jl-screen-cap">
        <h3>{panel.captionTitle}</h3>
        <p>{panel.captionBody}</p>
      </figcaption>
    </figure>
  )
}

export function Screens({ locale, content }: ScreensProps) {
  const { screens } = content
  return (
    <section className="jl-section" id="funcionalidades" aria-labelledby="h-in">
      <div className="jl-wrap">
        <span className="jl-eyebrow">{screens.eyebrow}</span>
        <h2 className="jl-h2" id="h-in">
          {screens.title}
        </h2>
        <p className="jl-lead">{screens.lead}</p>
        <div className="jl-screens">
          <StockTable locale={locale} content={content} />
          <div className="jl-stack">
            <ClosingTable locale={locale} content={content} />
            <PanelScreen locale={locale} content={content} />
          </div>
        </div>
      </div>
    </section>
  )
}
