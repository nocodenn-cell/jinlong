/** @vitest-environment jsdom */
/**
 * UX-009 — mapa único de atalhos do PDV.
 * Prova: (1) nenhuma tecla pertence a duas ações; (2) cada atalho do mapa executa a ação certa no handler;
 * (3) ajuda (F1) e menu Operações exibem exatamente o que o mapa define; (4) guards de campo de texto/diálogo
 * continuam valendo.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CAIXA_ATALHOS, atalhoCombina, atalhoRotulo, type CaixaAtalho, type CaixaTecla } from './caixaAtalhos'
import { useCaixaKeyboardShortcuts } from './hooks/useCaixaKeyboardShortcuts'
import { CaixaKeyboardShortcutsReference } from './CaixaKeyboardShortcutsReference'
import { CaixaPdvOperacoesMenu } from './CaixaPdvOperacoesMenu'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = getMessages('pt')

/** Todas as ações do mapa, achatadas: [id, atalho]. `metodoPagamento` vira metodoPagamento.1..4. */
function acoes(): Array<[string, CaixaAtalho]> {
  const out: Array<[string, CaixaAtalho]> = []
  for (const [id, valor] of Object.entries(CAIXA_ATALHOS)) {
    if (id === 'metodoPagamento') {
      ;(valor as readonly CaixaAtalho[]).forEach((a, i) => out.push([`metodoPagamento.${i + 1}`, a]))
    } else {
      out.push([id, valor as CaixaAtalho])
    }
  }
  return out
}

/** Evento sintético que satisfaz exatamente a tecla (modificadores obrigatórios ligados, os demais desligados). */
function eventoDe(t: CaixaTecla, code?: string) {
  return {
    code: code ?? (typeof t.code === 'string' ? t.code : t.code[0]),
    ctrlKey: t.ctrl === true,
    shiftKey: t.shift === true,
    altKey: t.alt === true,
    metaKey: t.meta === true,
  }
}

describe('integridade do mapa', () => {
  it('nenhuma combinação de teclas aciona duas ações ao mesmo tempo', () => {
    const lista = acoes()
    for (const [id, atalho] of lista) {
      for (const tecla of atalho) {
        const codes = typeof tecla.code === 'string' ? [tecla.code] : tecla.code
        for (const code of codes) {
          const evento = eventoDe(tecla, code)
          const casam = lista.filter(([, outro]) => atalhoCombina(outro, evento)).map(([oid]) => oid)
          expect(casam, `${tecla.label} (${id}) aciona ${casam.join(' e ')}`).toEqual([id])
        }
      }
    }
  })

  it('Alt+C é o atalho de cliente e não de pagamento (conflito apontado na auditoria)', () => {
    expect(atalhoRotulo(CAIXA_ATALHOS.cliente)).toBe('Alt+C')
    expect(atalhoRotulo(CAIXA_ATALHOS.pagamento)).toBe('Alt+B')
    const alt = (code: string) => ({ code, ctrlKey: false, shiftKey: false, altKey: true, metaKey: false })
    expect(atalhoCombina(CAIXA_ATALHOS.cliente, alt('KeyC'))).toBe(true)
    expect(atalhoCombina(CAIXA_ATALHOS.pagamento, alt('KeyC'))).toBe(false)
  })

  it('rótulos preservam o que o operador já conhece', () => {
    expect(atalhoRotulo(CAIXA_ATALHOS.finalizar)).toBe('F4 / F9')
    expect(atalhoRotulo(CAIXA_ATALHOS.buscar)).toBe('F2 / Ctrl+B')
    expect(atalhoRotulo(CAIXA_ATALHOS.novoCupom)).toBe('F8')
    expect(atalhoRotulo(CAIXA_ATALHOS.suprimento)).toBe('Ctrl+Shift+S')
    expect(atalhoRotulo(CAIXA_ATALHOS.sangria)).toBe('Ctrl+Shift+R')
  })
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function montarHandler() {
  const cb = {
    onAbrirSuprimento: vi.fn(),
    onAbrirSangria: vi.fn(),
    onFinalizar: vi.fn(),
    onFecharCaixa: vi.fn(),
    onFocarBusca: vi.fn(),
    onNovoCupom: vi.fn(),
    onReimprimir: vi.fn(),
    onConsultaRapida: vi.fn(),
    onDesfazerRemocao: vi.fn(),
    onSelecionarMetodo: vi.fn(),
    onAbrirReferencia: vi.fn(),
    excluirVenda: vi.fn(),
    finalizarClassico: vi.fn(),
    focoProduto: vi.fn(),
    cliente: vi.fn(),
    pgto: vi.fn(),
  }
  const pdvClassicAtalhos = {
    onExcluirVenda: cb.excluirVenda,
    onFinalizarVenda: cb.finalizarClassico,
    abas: { produto: cb.focoProduto, cliente: cb.cliente, pgto: cb.pgto },
  }
  function Harness() {
    useCaixaKeyboardShortcuts({
      caixaAberto: true,
      movimentandoCaixa: false,
      onAbrirSuprimento: cb.onAbrirSuprimento,
      onAbrirSangria: cb.onAbrirSangria,
      onFinalizar: cb.onFinalizar,
      onFecharCaixa: cb.onFecharCaixa,
      onFocarBusca: cb.onFocarBusca,
      onNovoCupom: cb.onNovoCupom,
      onReimprimir: cb.onReimprimir,
      onConsultaRapida: cb.onConsultaRapida,
      onDesfazerRemocao: cb.onDesfazerRemocao,
      onSelecionarMetodo: cb.onSelecionarMetodo,
      onAbrirReferencia: cb.onAbrirReferencia,
      pdvClassicAtalhos,
    })
    return <input data-testid="campo" />
  }
  flushSync(() => root.render(<Harness />))
  return cb
}

function tecla(t: CaixaTecla, code?: string, alvo: EventTarget = window) {
  alvo.dispatchEvent(
    new KeyboardEvent('keydown', {
      code: code ?? (typeof t.code === 'string' ? t.code : t.code[0]),
      ctrlKey: t.ctrl === true,
      shiftKey: t.shift === true,
      altKey: t.alt === true,
      metaKey: t.meta === true,
      bubbles: true,
    }),
  )
}

describe('handler consome o mapa: cada atalho executa a ação certa', () => {
  const casos: Array<[keyof ReturnType<typeof montarHandler>, CaixaAtalho]> = [
    ['onAbrirReferencia', CAIXA_ATALHOS.ajuda],
    ['onFocarBusca', CAIXA_ATALHOS.buscar],
    ['onConsultaRapida', CAIXA_ATALHOS.consultaRapida],
    ['onFinalizar', CAIXA_ATALHOS.finalizar],
    ['onFecharCaixa', CAIXA_ATALHOS.fecharCaixa],
    ['onNovoCupom', CAIXA_ATALHOS.novoCupom],
    ['onReimprimir', CAIXA_ATALHOS.reimprimir],
    ['onDesfazerRemocao', CAIXA_ATALHOS.desfazerRemocao],
    ['onAbrirSuprimento', CAIXA_ATALHOS.suprimento],
    ['onAbrirSangria', CAIXA_ATALHOS.sangria],
    ['focoProduto', CAIXA_ATALHOS.focoProduto],
    ['cliente', CAIXA_ATALHOS.cliente],
    ['pgto', CAIXA_ATALHOS.pagamento],
    ['excluirVenda', CAIXA_ATALHOS.excluirVenda],
    ['finalizarClassico', CAIXA_ATALHOS.finalizarClassico],
  ]

  it.each(casos)('%s dispara com todas as teclas do seu atalho e só ele', (acao, atalho) => {
    const cb = montarHandler()
    for (const t of atalho) {
      tecla(t)
      for (const [nome, fn] of Object.entries(cb)) {
        const esperado = nome === acao ? 1 : 0
        const chamadas = (fn as ReturnType<typeof vi.fn>).mock.calls.length
        if (nome === acao) expect(chamadas, `${acao} após ${t.label}`).toBeGreaterThanOrEqual(esperado)
        else expect(chamadas, `${nome} não deveria disparar com ${t.label}`).toBe(0)
      }
      Object.values(cb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear())
    }
  })

  it('teclas 1–4 selecionam Dinheiro, PIX, Crédito, Débito (índices 1..4)', () => {
    const cb = montarHandler()
    CAIXA_ATALHOS.metodoPagamento.forEach((a) => tecla(a[0]))
    expect(cb.onSelecionarMetodo.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4])
  })

  it('NÃO dispara com o foco em campo de texto', () => {
    const cb = montarHandler()
    const campo = container.querySelector('[data-testid="campo"]') as HTMLInputElement
    campo.focus()
    for (const [, atalho] of casos) tecla(atalho[0], undefined, campo)
    CAIXA_ATALHOS.metodoPagamento.forEach((a) => tecla(a[0], undefined, campo))
    for (const fn of Object.values(cb)) expect(fn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })
})

describe('ajuda e menu exibem o que o mapa define', () => {
  it('ajuda (F1) lista cada atalho com o rótulo do mapa; Alt+C = cliente, Alt+B = pagamento', () => {
    act(() => {
      root.render(<CaixaKeyboardShortcutsReference m={m} open onOpenChange={() => {}} />)
    })
    const linhas = Array.from(document.querySelectorAll('kbd')).map((k) => k.closest('.grid'))
    const porTecla = new Map<string, string>()
    for (const l of linhas) {
      if (!l) continue
      const keys = l.querySelector('kbd')!.textContent!.trim()
      const label = l.querySelector('span.font-medium')?.textContent?.trim() ?? ''
      porTecla.set(keys, label)
    }
    const esperadas: Array<[CaixaAtalho, string]> = [
      [CAIXA_ATALHOS.finalizar, m.caixa.finalizar_venda],
      [CAIXA_ATALHOS.novoCupom, m.caixa.novo_cupom],
      [CAIXA_ATALHOS.ajuda, m.caixa.atalho_ajuda],
      [CAIXA_ATALHOS.focoProduto, m.caixa.pdv_tab_produto],
      [CAIXA_ATALHOS.pagamento, m.caixa.pdv_tab_pgto],
      [CAIXA_ATALHOS.cliente, m.caixa.selecionar_cliente_titulo],
      [CAIXA_ATALHOS.consultaRapida, m.caixa.operacoes_consulta_rapida],
      [CAIXA_ATALHOS.fecharCaixa, m.caixa.fechar],
      [CAIXA_ATALHOS.suprimento, m.caixa.suprimento],
      [CAIXA_ATALHOS.sangria, m.caixa.sangria],
      [CAIXA_ATALHOS.excluirVenda, m.caixa.cart_bar_excluir_venda],
      [CAIXA_ATALHOS.finalizarClassico, m.caixa.finalizar_venda],
    ]
    for (const [atalho, label] of esperadas) {
      expect(porTecla.get(atalhoRotulo(atalho)), atalhoRotulo(atalho)).toBe(label)
    }
    // Nenhuma entrada antiga "Alt+B / Alt+C" atribuindo pagamento ao Alt+C
    expect(porTecla.has('Alt+B / Alt+C')).toBe(false)
    // cada teclado listado na ajuda existe no mapa (sem atalho fantasma)
    const rotulosDoMapa = new Set(acoes().map(([, a]) => atalhoRotulo(a)))
    const metodos = CAIXA_ATALHOS.metodoPagamento.map(atalhoRotulo).join(' / ')
    for (const k of porTecla.keys()) {
      expect(rotulosDoMapa.has(k) || k === metodos, `ajuda lista "${k}" que não está no mapa`).toBe(true)
    }
  })

  it('menu Operações mostra os atalhos do mapa', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    const noop = () => {}
    act(() => {
      root.render(
        <CaixaPdvOperacoesMenu
          m={m}
          idioma="pt"
          variant="classic"
          carregandoRegras={false}
          caixaStatus={null}
          caixaAberto
          movimentandoCaixa={false}
          finalizando={false}
          validandoGerente={false}
          gerenteValidadoAte={null}
          podeReimprimir
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
        />,
      )
    })
    const gatilho = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === m.caixa.rail_titulo_operacoes,
    ) as HTMLButtonElement
    act(() => gatilho.click())
    const texto = document.body.textContent ?? ''
    for (const a of [
      CAIXA_ATALHOS.consultaRapida,
      CAIXA_ATALHOS.cliente,
      CAIXA_ATALHOS.suprimento,
      CAIXA_ATALHOS.sangria,
      CAIXA_ATALHOS.reimprimir,
      CAIXA_ATALHOS.fecharCaixa,
    ]) {
      expect(texto).toContain(atalhoRotulo(a))
    }
  })
})
