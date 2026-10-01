/** @vitest-environment jsdom */
/** UX-013 — filtro de período único: ordem canônica, ativo marcado, hrefs por tela e vocabulário. */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { PERIODOS } from '@/lib/admin/periodo'
import { PeriodFilter, periodoLabelsAdmin } from './PeriodFilter'

const ui = getMessages('pt').admin_ui
const labels = periodoLabelsAdmin(ui)

describe('periodoLabelsAdmin', () => {
  it('vocabulário único: Hoje · Ontem · 7 dias · 30 dias · Mês atual · Todos (nada de "7d" cru)', () => {
    expect(labels).toEqual({
      hoje: 'Hoje',
      ontem: 'Ontem',
      '7d': '7 dias',
      '30d': '30 dias',
      mes: 'Mês atual',
      tudo: 'Todos',
    })
  })
})

describe('PeriodFilter', () => {
  it('renderiza na ordem canônica mesmo recebendo as opções embaralhadas, com href por período', () => {
    const html = renderToStaticMarkup(
      <PeriodFilter
        options={['tudo', 'mes', 'hoje', '30d', '7d', 'ontem']}
        active="7d"
        labels={labels}
        hrefFor={(p) => `/x?periodo=${p}`}
      />,
    )
    const ordem = [...html.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1])
    expect(ordem).toEqual(['Hoje', 'Ontem', '7 dias', '30 dias', 'Mês atual', 'Todos'])
    expect(html).toContain('href="/x?periodo=30d"')
  })

  it('marca só o período ativo', () => {
    const html = renderToStaticMarkup(
      <PeriodFilter options={PERIODOS} active="hoje" labels={labels} hrefFor={(p) => `/x?periodo=${p}`} />,
    )
    expect(html.match(/data-active="true"/g)).toHaveLength(1)
    expect(html).toMatch(/data-active="true"[^>]*aria-current="true"|aria-current="true"[^>]*data-active="true"/)
  })

  it('só mostra as opções que a tela oferece', () => {
    const html = renderToStaticMarkup(
      <PeriodFilter options={['hoje', 'tudo']} active="hoje" labels={labels} hrefFor={() => '/x'} />,
    )
    expect(html).toContain('Hoje')
    expect(html).toContain('Todos')
    expect(html).not.toContain('30 dias')
  })
})
