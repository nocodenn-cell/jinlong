/** @vitest-environment jsdom */
/**
 * PDV → painel: o PDV não tinha nenhum caminho de volta ao ambiente
 * administrativo (só "Sair"). O atalho existe apenas quando o PDV recebe o
 * destino — o que só acontece para perfis com acesso ao painel — e abre em nova
 * aba para não interromper venda em andamento nem o turno aberto.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaPdvOperacoesMenu } from './CaixaPdvOperacoesMenu'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = getMessages('pt')
const noop = () => {}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // O menu usa requestAnimationFrame ao fechar (devolve o foco ao gatilho).
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function renderMenu(painelGestaoHref?: string | null) {
  act(() => {
    root.render(
      <CaixaPdvOperacoesMenu
        m={m}
        idioma="pt"
        variant="classic"
        carregandoRegras={false}
        caixaStatus={null}
        caixaAberto={false}
        movimentandoCaixa={false}
        finalizando={false}
        validandoGerente={false}
        gerenteValidadoAte={null}
        podeReimprimir={false}
        onAbrirSuprimento={noop}
        onAbrirSangria={noop}
        onValidarGerente={noop}
        onHistorico={noop}
        onImprimirUltima={noop}
        onFecharCaixa={noop}
        onAbrirCaixa={noop}
        onConsultaRapida={noop}
        onSelecionarCliente={noop}
        movimentacoesPendentes={[]}
        onResolverPendencia={noop}
        painelGestaoHref={painelGestaoHref}
      />,
    )
  })
}

function abrirMenu() {
  const gatilho = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === m.caixa.rail_titulo_operacoes,
  ) as HTMLButtonElement
  expect(gatilho).toBeTruthy()
  act(() => {
    gatilho.click()
  })
}

describe('CaixaPdvOperacoesMenu — atalho "Painel de gestão"', () => {
  it('com destino: mostra o link, para o painel, em nova aba e sem vazar o opener', () => {
    renderMenu('/admin/dashboard')
    abrirMenu()

    const link = container.querySelector('[data-testid="caixa-menu-painel-gestao"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.textContent).toContain('Painel de gestão')
    expect(link.getAttribute('href')).toBe('/admin/dashboard')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('role')).toBe('menuitem')
  })

  it('sem destino (operador): o menu não tem o atalho', () => {
    renderMenu(null)
    abrirMenu()

    expect(container.querySelector('[data-testid="caixa-menu-painel-gestao"]')).toBeNull()
    expect(container.textContent).not.toContain('Painel de gestão')
  })

  it('omitido: comportamento anterior preservado (as demais operações continuam)', () => {
    renderMenu(undefined)
    abrirMenu()

    expect(container.querySelector('[data-testid="caixa-menu-painel-gestao"]')).toBeNull()
    expect(container.textContent).toContain(m.caixa.operacoes_historico)
  })

  it('clicar no atalho fecha o menu', () => {
    renderMenu('/admin/dashboard')
    abrirMenu()
    const link = container.querySelector('[data-testid="caixa-menu-painel-gestao"]') as HTMLAnchorElement
    // jsdom não navega; só garante o fechamento do menu após o clique.
    link.addEventListener('click', (e) => e.preventDefault())

    act(() => {
      link.click()
    })

    expect(container.querySelector('[role="menu"]')).toBeNull()
  })
})
