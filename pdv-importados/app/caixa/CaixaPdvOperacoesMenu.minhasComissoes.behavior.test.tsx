/** @vitest-environment jsdom */
/** Comissão (#607): o caixa tem caminho para /caixa/minhas-comissoes, para qualquer perfil. */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaPdvOperacoesMenu } from './CaixaPdvOperacoesMenu'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const noop = () => {}
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe.each(['pt', 'zh'] as const)('CaixaPdvOperacoesMenu — Minhas comissões (%s)', (idioma) => {
  it('mostra o link mesmo sem acesso ao painel, em nova aba', () => {
    const m = getMessages(idioma)
    act(() => {
      root.render(
        <CaixaPdvOperacoesMenu m={m} idioma={idioma} variant="classic" carregandoRegras={false} caixaStatus={null}
          caixaAberto={false} movimentandoCaixa={false} finalizando={false} validandoGerente={false}
          gerenteValidadoAte={null} podeReimprimir={false} onAbrirSuprimento={noop} onAbrirSangria={noop}
          onValidarGerente={noop} onHistorico={noop} onImprimirUltima={noop} onFecharCaixa={noop}
          onAbrirCaixa={noop} onConsultaRapida={noop} onSelecionarCliente={noop} movimentacoesPendentes={[]}
          onResolverPendencia={noop} painelGestaoHref={null} />,
      )
    })
    const gatilho = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === m.caixa.rail_titulo_operacoes) as HTMLButtonElement
    act(() => { gatilho.click() })
    const link = container.querySelector('[data-testid="caixa-menu-minhas-comissoes"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/caixa/minhas-comissoes')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.textContent).toContain(m.caixa.minhas_comissoes_link)
  })
})
