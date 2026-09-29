/** @vitest-environment jsdom */
/**
 * Autocomplete de produto do recebimento — Enter e leitor de código de barras.
 *
 * O leitor digita o código e envia Enter em poucos milissegundos, antes do debounce (260 ms) trazer
 * resultados. Antes, esse Enter caía no envio nativo do formulário com produto vazio ("selecione um
 * produto"). Agora o Enter nunca envia o formulário a partir deste campo: escolhe o que a lista
 * mostra ou busca na hora, e só escolhe sozinho quando o resultado é inequívoco. Também não pode
 * escolher o 1º item de uma busca ANTERIOR (produto errado) quando o termo mudou.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const buscarMock = vi.fn()

vi.mock('./actions', () => ({
  buscarProdutosRecebimento: (termo: string) => buscarMock(termo),
}))

const { ProdutoRecebimentoAutocomplete } = await import('./ProdutoRecebimentoAutocomplete')

const CANECA = { id: 'p-caneca', nome: 'Caneca 300ml', codigo_barras: '7891000100103' }
const COPO = { id: 'p-copo', nome: 'Copo Azul', codigo_barras: '7891000100202' }
const CODIGO_LONGO = { id: 'p-longo', nome: 'Caneca Premium', codigo_barras: '78910001001030' }

let container: HTMLDivElement
let root: Root
const aoSelecionar = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  buscarMock.mockReset()
  buscarMock.mockResolvedValue({ success: true, data: [] })
  aoSelecionar.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

async function renderizar(valorInicial: typeof CANECA | null = null) {
  await act(async () => {
    root.render(
      <form>
        <ProdutoRecebimentoAutocomplete
          placeholder="Busque"
          semResultadosLabel="Nenhum produto encontrado."
          minimoLabel="Digite ao menos 2 caracteres."
          limparLabel="Trocar"
          valorInicial={valorInicial}
          onChange={aoSelecionar}
        />
      </form>,
    )
  })
}

function campo(): HTMLInputElement {
  return container.querySelector('input[role="combobox"]') as HTMLInputElement
}

function hidden(): string {
  return (container.querySelector('input[name="produto_id"]') as HTMLInputElement).value
}

function digitar(valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    campo().dispatchEvent(new Event('focus', { bubbles: true }))
    setter.call(campo(), valor)
    campo().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function enter(): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await act(async () => {
    campo().dispatchEvent(ev)
    await Promise.resolve()
    await Promise.resolve()
  })
  return ev
}

async function esperarDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ProdutoRecebimentoAutocomplete — Enter e leitor de código de barras', () => {
  it('leitor: código + Enter ANTES do debounce escolhe o único resultado e não envia o formulário', async () => {
    buscarMock.mockResolvedValue({ success: true, data: [CANECA] })
    await renderizar()

    digitar(CANECA.codigo_barras)
    const ev = await enter() // sem esperar os 260 ms

    expect(ev.defaultPrevented).toBe(true)
    expect(buscarMock).toHaveBeenCalledWith(CANECA.codigo_barras)
    expect(hidden()).toBe('p-caneca')
    expect(aoSelecionar).toHaveBeenLastCalledWith(CANECA)
  })

  it('sem resultado: Enter não envia o formulário, não escolhe nada e mostra "nenhum produto"', async () => {
    buscarMock.mockResolvedValue({ success: true, data: [] })
    await renderizar()

    digitar('0000000000000')
    const ev = await enter()

    expect(ev.defaultPrevented).toBe(true)
    expect(hidden()).toBe('')
    expect(container.textContent).toContain('Nenhum produto encontrado.')
  })

  it('vários candidatos sem código exato: não escolhe sozinho, mostra a lista para o operador decidir', async () => {
    buscarMock.mockResolvedValue({ success: true, data: [CANECA, COPO] })
    await renderizar()

    digitar('78910001')
    const ev = await enter()

    expect(ev.defaultPrevented).toBe(true)
    expect(hidden()).toBe('')
    expect(container.querySelectorAll('button[role="option"]')).toHaveLength(2)
  })

  it('vários candidatos, um com o código de barras exato: escolhe o exato', async () => {
    buscarMock.mockResolvedValue({ success: true, data: [CODIGO_LONGO, CANECA] })
    await renderizar()

    digitar(CANECA.codigo_barras)
    await enter()

    expect(hidden()).toBe('p-caneca')
  })

  it('lista já carregada para o termo digitado: Enter escolhe o primeiro, como antes', async () => {
    buscarMock.mockResolvedValue({ success: true, data: [CANECA, COPO] })
    await renderizar()

    digitar('ca')
    await esperarDebounce()
    expect(buscarMock).toHaveBeenCalledTimes(1)
    const ev = await enter()

    expect(ev.defaultPrevented).toBe(true)
    expect(hidden()).toBe('p-caneca')
    // usou a lista que já estava na tela: nenhuma busca extra
    expect(buscarMock).toHaveBeenCalledTimes(1)
  })

  it('termo mudou depois da lista: Enter NÃO escolhe o 1º item da busca anterior (produto errado)', async () => {
    buscarMock.mockImplementation(async (termo: string) =>
      termo === 'ca' ? { success: true, data: [CANECA, COPO] } : { success: true, data: [COPO] },
    )
    await renderizar()

    digitar('ca')
    await esperarDebounce() // lista de "ca": [CANECA, COPO]
    digitar(COPO.codigo_barras) // leitor sobrescreve o termo e envia Enter em seguida
    await enter()

    expect(buscarMock).toHaveBeenLastCalledWith(COPO.codigo_barras)
    expect(hidden()).toBe('p-copo')
  })

  it('operador continua digitando enquanto a busca do Enter volta: resultado antigo é descartado', async () => {
    let resolver: (v: unknown) => void = () => {}
    buscarMock.mockImplementationOnce(
      () => new Promise((res) => {
        resolver = res
      }),
    )
    await renderizar()

    digitar('78910001')
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => {
      campo().dispatchEvent(ev)
    })
    digitar('7891000100103') // termo mudou antes da resposta
    await act(async () => {
      resolver({ success: true, data: [COPO] })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(hidden()).toBe('')
  })

  it('produto já escolhido: Enter também não envia o formulário (evita confirmação acidental)', async () => {
    await renderizar(CANECA)
    expect(hidden()).toBe('p-caneca')

    const ev = await enter()

    expect(ev.defaultPrevented).toBe(true)
    expect(buscarMock).not.toHaveBeenCalled()
    expect(hidden()).toBe('p-caneca')
  })

  it('termo curto (menos de 2 caracteres): Enter não busca nem envia', async () => {
    await renderizar()
    digitar('a')
    const ev = await enter()

    expect(ev.defaultPrevented).toBe(true)
    expect(buscarMock).not.toHaveBeenCalled()
  })

  it('"Trocar" avisa o formulário que não há mais produto escolhido', async () => {
    await renderizar(CANECA)

    const trocar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Trocar'),
    ) as HTMLButtonElement
    act(() => trocar.click())
    expect(aoSelecionar).toHaveBeenLastCalledWith(null)
    expect(hidden()).toBe('')
  })
})
