'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { CommandCenterCopy } from '@/lib/content/types'
import type { SiteLocale } from '@/lib/locales'
import {
  CLOSING_FIGURES,
  CRITICAL_STOCK_LIMIT,
  DAY_BARS,
  DEMO_PRODUCTS,
  HERO_SALE,
  OVERVIEW_FIGURES,
  TOP_SELLERS,
  averageTicketCents,
  closingTotalCents,
  findProduct,
  lineSubtotalCents,
  productName,
  saleTotalCents,
} from '@/lib/products'
import { WHOLESALE_EXAMPLE, formatBrl } from '@/lib/wholesale'

const SCENES = ['overview', 'pos', 'stock', 'wholesale', 'reports'] as const
type SceneKey = (typeof SCENES)[number]

interface Props {
  locale: SiteLocale
  copy: CommandCenterCopy
}

const ICONS: Record<SceneKey, ReactNode> = {
  overview: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  pos: <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
  stock: <path d="M4 7l8-4 8 4-8 4-8-4zM4 7v10l8 4 8-4V7M12 11v10" />,
  wholesale: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  reports: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" />,
}

function Overview({ locale, copy }: Props) {
  const o = copy.overview
  return (
    <>
      <div className="jl-tiles">
        <div className="jl-tile">
          <small>{o.sales}</small>
          <strong>{formatBrl(OVERVIEW_FIGURES.salesCents, locale)}</strong>
          <span>↗ {o.salesNote}</span>
        </div>
        <div className="jl-tile">
          <small>{o.ticket}</small>
          <strong>{formatBrl(averageTicketCents(), locale)}</strong>
          <span>● {o.ticketNote}</span>
        </div>
        <div className="jl-tile">
          <small>{o.low}</small>
          <strong>{String(OVERVIEW_FIGURES.lowStockItems).padStart(2, '0')}</strong>
          <span className="warn">↗ {o.lowNote}</span>
        </div>
      </div>
      <div className="jl-dash-bottom">
        <div className="jl-dash-panel">
          <h4>{o.movement}</h4>
          <div className="jl-bars" aria-hidden="true">
            {DAY_BARS.map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="jl-dash-panel">
          <h4>{o.top}</h4>
          {TOP_SELLERS.map((item) => (
            <div className="jl-dash-row" key={item.productId}>
              <span>{productName(findProduct(item.productId), locale)}</span>
              <b>
                {item.qty} {o.unit}
              </b>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Pos({ locale, copy }: Props) {
  const p = copy.pos
  return (
    <div className="jl-pos">
      <div className="jl-pos-head">
        <span>{p.sale}</span>
        <span className="ok">● {p.open}</span>
      </div>
      {HERO_SALE.map((line) => {
        const product = findProduct(line.productId)
        return (
          <div className="jl-pos-row" key={line.productId}>
            <span>
              {productName(product, locale)}
              <small className={line.wholesale ? 'ok' : undefined}>
                {line.wholesale ? `● ${p.wholesaleBadge}` : `${formatBrl(product.retailCents, locale)} ${p.perUnit}`}
              </small>
            </span>
            <span>{line.qty}</span>
            <span>{formatBrl(lineSubtotalCents(line), locale)}</span>
          </div>
        )
      })}
      <div className="jl-pos-total">
        <span>{p.total}</span>
        <strong>{formatBrl(saleTotalCents(HERO_SALE), locale)}</strong>
      </div>
      <div className="jl-pos-finish" aria-hidden="true">
        {p.finish} ↗
      </div>
    </div>
  )
}

function Stock({ locale, copy }: Props) {
  const s = copy.stock
  return (
    <table className="jl-stock">
      <thead>
        <tr>
          <th scope="col">{s.product}</th>
          <th scope="col">{s.retail}</th>
          <th scope="col">{s.wholesale}</th>
          <th scope="col">{s.stock}</th>
        </tr>
      </thead>
      <tbody>
        {DEMO_PRODUCTS.slice(0, 4).map((product) => (
          <tr key={product.id}>
            <th scope="row">{productName(product, locale)}</th>
            <td>{formatBrl(product.retailCents, locale)}</td>
            <td>
              {product.wholesaleCents === null ? (
                '—'
              ) : (
                <>
                  {formatBrl(product.wholesaleCents, locale)}
                  <small>
                    {s.from} {product.wholesaleMin}
                  </small>
                </>
              )}
            </td>
            <td className={product.stock <= CRITICAL_STOCK_LIMIT ? 'low' : 'good'}>
              {product.stock} {s.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Wholesale({ locale, copy }: Props) {
  const w = copy.wholesale
  return (
    <div className="jl-tiers">
      <div className="jl-tier">
        <small>{w.retailTier}</small>
        <strong>{formatBrl(WHOLESALE_EXAMPLE.retailCents, locale)}</strong>
        <span>{w.unitPrice}</span>
      </div>
      <div className="jl-tier is-active">
        <small>{w.wholesaleTier}</small>
        <strong>{formatBrl(WHOLESALE_EXAMPLE.wholesaleCents, locale)}</strong>
        <span>{w.unitPrice}</span>
      </div>
      <p className="jl-tier-note">✓ {w.note}</p>
    </div>
  )
}

function Reports({ locale, copy }: Props) {
  const r = copy.reports
  const rows: ReadonlyArray<readonly [string, number]> = [
    [r.cash, CLOSING_FIGURES.cashCents],
    [r.pix, CLOSING_FIGURES.pixCents],
    [r.debit, CLOSING_FIGURES.debitCents],
    [r.credit, CLOSING_FIGURES.creditCents],
  ]
  const total = closingTotalCents()
  return (
    <div className="jl-report">
      <div className="jl-pos-head">
        <span>{r.title}</span>
        <span className="ok">✓ {r.status}</span>
      </div>
      <div className="jl-report-row muted">
        <span>{r.opening}</span>
        <b>{formatBrl(CLOSING_FIGURES.openingCents, locale)}</b>
      </div>
      {rows.map(([label, cents]) => (
        <div className="jl-report-row" key={label}>
          <span>{label}</span>
          <i aria-hidden="true">
            <i style={{ width: `${Math.round((cents / total) * 100)}%` }} />
          </i>
          <b>{formatBrl(cents, locale)}</b>
        </div>
      ))}
      <div className="jl-pos-total">
        <span>{r.total}</span>
        <strong>{formatBrl(total, locale)}</strong>
      </div>
    </div>
  )
}

const RENDER: Record<SceneKey, (props: Props) => ReactNode> = {
  overview: Overview,
  pos: Pos,
  stock: Stock,
  wholesale: Wholesale,
  reports: Reports,
}

/**
 * Centro de comando: abas acessíveis (roving tabindex, setas, Home/End) com cenas ilustrativas.
 * Dados fictícios em memória; nenhuma chamada de rede.
 */
export function CommandCenter({ locale, copy }: Props) {
  const [index, setIndex] = useState(0)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const key = SCENES[index] ?? 'overview'
  const scene = copy.scenes[key]
  const Scene = RENDER[key]

  const select = (next: number, focus = false) => {
    const target = (next + SCENES.length) % SCENES.length
    setIndex(target)
    if (focus) tabs.current[target]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: SCENES.length - 1,
    }
    const next = moves[event.key]
    if (next === undefined) return
    event.preventDefault()
    select(next, true)
  }

  return (
    <div className="jl-cc">
      <div className="jl-cc-side">
        <span className="jl-cc-brand" lang="zh-CN" aria-hidden="true">
          龍
        </span>
        <div className="jl-cc-tabs" role="tablist" aria-label={copy.tabsLabel} aria-orientation="vertical" onKeyDown={onKeyDown}>
          {SCENES.map((sceneKey, i) => (
            <button
              key={sceneKey}
              ref={(el) => {
                tabs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`cc-tab-${sceneKey}`}
              aria-selected={i === index}
              aria-controls="cc-panel"
              tabIndex={i === index ? 0 : -1}
              className="jl-cc-tab"
              onClick={() => select(i)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                {ICONS[sceneKey]}
              </svg>
              <span>{copy.scenes[sceneKey].tab}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="jl-cc-main" role="tabpanel" id="cc-panel" aria-labelledby={`cc-tab-${key}`}>
        <div className="jl-cc-toolbar">
          <div>
            <span className="jl-cc-crumb">
              Jinlong / <span>{scene.crumb}</span>
            </span>
            <h3>{scene.title}</h3>
          </div>
          <span className="jl-cc-user">
            <span className="jl-dot" aria-hidden="true" /> {copy.demoBadge}
            <span className="jl-avatar" aria-hidden="true">
              JL
            </span>
          </span>
        </div>
        <div className="jl-cc-content" key={key}>
          <Scene locale={locale} copy={copy} />
        </div>
      </div>
      <aside className="jl-cc-insight" aria-live="polite">
        <span className="jl-insight-label">{copy.insightLabel}</span>
        <span className="jl-insight-count" aria-hidden="true">
          {String(index + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
        </span>
        <h3>{scene.insightTitle}</h3>
        <p>{scene.insightBody}</p>
        <div className="jl-cc-switch">
          <button type="button" aria-label={copy.prev} onClick={() => select(index - 1)}>
            ←
          </button>
          <button type="button" aria-label={copy.next} onClick={() => select(index + 1)}>
            →
          </button>
        </div>
        <small>{copy.illustrative}</small>
      </aside>
    </div>
  )
}
