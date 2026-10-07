/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const atualizarMock = vi.fn()
const consultarMock = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/gerente/estoque/actions', () => ({
  atualizarEstoqueProduto: (...args: unknown[]) => atualizarMock(...args),
  consultarSaldoEstoqueProduto: (...args: unknown[]) => consultarMock(...args),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { AjusteSaldoModal } = await import('./AjusteSaldoModal')

const baseLabels = {
  titulo: 'Ajustar',
  saldoAtual: 'Saldo atual',
  estoqueMinimo: 'Mínimo',
  motivo: 'Motivo',
  observacao: 'Obs',
  cancelar: 'Cancelar',
  salvar: 'Salvar',
  salvando: 'Salvando',
  motivos: [{ value: 'ACERTO_INVENTARIO', label: 'Inventário' }],
  quantidadeRetirar: 'Quantidade a retirar',
  quantidadeContada: 'Quantidade contada',
  saldoAnterior: 'Saldo anterior',
  referenciaDoc: 'Referência',
  referenciaDocHint: 'Opcional',
  confirmarRetirada: 'Confirmar retirada',
  confirmarAjuste: 'Confirmar ajuste',
  erroRetiradaInvalida: 'Informe uma quantidade positiva a retirar.',
  erroRetiradaExcede: 'Não é possível retirar mais que o saldo atual.',
  erroConcorrencia:
    'O estoque deste produto foi alterado enquanto esta tela estava aberta. Atualizamos as informações; confira a quantidade e tente novamente.',
  codigoLabel: 'Código',
  unidadeLabel: 'Unidade',
  produtoLabel: 'Produto',
  resumoTitulo: 'Resumo da operação',
  resumoSaldoAtual: 'Saldo atual',
  resumoRetirada: 'Retirada',
  resumoSaldoApos: 'Saldo após retirada',
  resumoSistema: 'Quantidade no sistema',
  resumoContagem: 'Quantidade contada',
  resumoDiferenca: 'Diferença',
  resumoNovoSaldo: 'Novo saldo',
}

describe('AjusteSaldoModal — Retirar / Ajustar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    atualizarMock.mockReset()
    consultarMock.mockReset()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('retirar: resumo 10 − 3 = 7 e CTA Confirmar retirada', () => {
    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: 'p1',
            produtoNome: 'Parafuso',
            quantidadeAtual: 10,
            estoqueMinimo: 2,
            codigoBarras: '789',
            unidade: 'UN',
            modo: 'retirar',
          }}
          onClose={() => {}}
          labels={{
            ...baseLabels,
            titulo: 'Retirar',
            motivos: [
              { value: 'PERDA', label: 'Perda' },
              { value: 'QUEBRA', label: 'Quebra' },
              { value: 'OUTRO', label: 'Outro' },
            ],
          }}
        />,
      )
    })

    expect(container.textContent).toContain('Confirmar retirada')
    expect(container.querySelector('[data-testid="ajuste-produto-contexto"]')?.textContent).toContain('Parafuso')
    const input = container.querySelector('input[name="quantidade_retirar"]') as HTMLInputElement
    act(() => {
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      native.call(input, '3')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="ajuste-previa"]')!.textContent).toBe('7')
    expect(container.textContent).toMatch(/Retirada/)
    const select = container.querySelector('select[name="motivo"]') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['PERDA', 'QUEBRA', 'OUTRO'])
  })

  it('retirar: bloqueia 0 e 11 quando saldo é 10', () => {
    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: 'p1',
            produtoNome: 'X',
            quantidadeAtual: 10,
            estoqueMinimo: 0,
            modo: 'retirar',
          }}
          onClose={() => {}}
          labels={{
            ...baseLabels,
            titulo: 'Retirar',
            motivos: [{ value: 'PERDA', label: 'Perda' }],
          }}
        />,
      )
    })

    const form = container.querySelector('#ajuste-saldo-form') as HTMLFormElement
    const input = container.querySelector('input[name="quantidade_retirar"]') as HTMLInputElement
    const setQtd = (v: string) => {
      act(() => {
        const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
        native.call(input, v)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    setQtd('0')
    act(() => {
      form.requestSubmit()
    })
    expect(container.textContent).toContain('Informe uma quantidade positiva a retirar.')

    setQtd('11')
    act(() => {
      form.requestSubmit()
    })
    expect(container.textContent).toContain('Não é possível retirar mais que o saldo atual.')
    expect(atualizarMock).not.toHaveBeenCalled()
  })

  it('ajustar: diferença −3 / +3 / 0 e sem motivo COMPRA', () => {
    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: 'p1',
            produtoNome: 'Cadeira',
            quantidadeAtual: 10,
            estoqueMinimo: 2,
            modo: 'ajustar',
          }}
          onClose={() => {}}
          labels={{
            ...baseLabels,
            titulo: 'Ajustar quantidade',
            motivos: [
              { value: 'ACERTO_INVENTARIO', label: 'Inventário' },
              { value: 'OUTRO', label: 'Outro' },
            ],
          }}
        />,
      )
    })

    expect(container.textContent).toContain('Confirmar ajuste')
    expect(container.textContent).toContain('Quantidade contada')
    const select = container.querySelector('select[name="motivo"]') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['ACERTO_INVENTARIO', 'OUTRO'])
    expect(Array.from(select.options).map((o) => o.value)).not.toContain('COMPRA')

    const input = container.querySelector('input[name="quantidade_atual"]') as HTMLInputElement
    const setVal = (v: string) => {
      act(() => {
        const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
        native.call(input, v)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    setVal('7')
    expect(container.querySelector('[data-testid="ajuste-diferenca"]')!.textContent).toBe('−3')
    setVal('13')
    expect(container.querySelector('[data-testid="ajuste-diferenca"]')!.textContent).toBe('+3')
    setVal('10')
    expect(container.querySelector('[data-testid="ajuste-diferenca"]')!.textContent).toBe('0')
  })

  it('ajustar: só mínimo envia snapshot canônico (quantidade_esperada/minimo_esperado)', async () => {
    atualizarMock.mockResolvedValue({ ok: true, data: null })
    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: '11111111-1111-1111-1111-111111111111',
            produtoNome: 'Cadeira',
            quantidadeAtual: 10,
            estoqueMinimo: 2,
            modo: 'ajustar',
          }}
          onClose={() => {}}
          labels={{
            ...baseLabels,
            titulo: 'Ajustar quantidade',
            motivos: [
              { value: 'ACERTO_INVENTARIO', label: 'Inventário' },
              { value: 'OUTRO', label: 'Outro' },
            ],
          }}
        />,
      )
    })

    const min = container.querySelector('input[name="estoque_minimo"]') as HTMLInputElement
    const qtd = container.querySelector('input[name="quantidade_atual"]') as HTMLInputElement
    act(() => {
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      native.call(min, '3')
      min.dispatchEvent(new Event('input', { bubbles: true }))
      native.call(qtd, '10')
      qtd.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      ;(container.querySelector('#ajuste-saldo-form') as HTMLFormElement).requestSubmit()
    })

    expect(atualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantidade_atual: 10,
        estoque_minimo: 3,
        quantidade_esperada: 10,
        minimo_esperado: 2,
        motivo: 'ACERTO_INVENTARIO',
      }),
    )
    expect(atualizarMock.mock.calls[0][0]).not.toHaveProperty('saldo_esperado')
  })

  it('stale stock: mostra mensagem, consulta saldo e atualiza base (10→9)', async () => {
    atualizarMock.mockResolvedValue({
      ok: false,
      error:
        'O estoque deste produto foi alterado enquanto esta tela estava aberta. Atualizamos as informações; confira a quantidade e tente novamente.',
    })
    consultarMock.mockResolvedValue({ ok: true, data: { quantidade: 9, minimo: 2 } })

    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: '11111111-1111-1111-1111-111111111111',
            produtoNome: 'X',
            quantidadeAtual: 10,
            estoqueMinimo: 2,
            modo: 'ajustar',
          }}
          onClose={() => {}}
          labels={baseLabels}
        />,
      )
    })

    await act(async () => {
      ;(container.querySelector('#ajuste-saldo-form') as HTMLFormElement).requestSubmit()
    })

    expect(atualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantidade_esperada: 10,
        minimo_esperado: 2,
      }),
    )
    expect(container.textContent).toContain('foi alterado enquanto esta tela estava aberta')
    expect(consultarMock).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="ajuste-saldo-atual"]')?.textContent).toContain('9')
  })

  it('retirar: envia Doc + snapshot quantidade_esperada/minimo_esperado', async () => {
    atualizarMock.mockResolvedValue({ ok: true, data: null })
    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: '11111111-1111-1111-1111-111111111111',
            produtoNome: 'X',
            quantidadeAtual: 10,
            estoqueMinimo: 1,
            modo: 'retirar',
          }}
          onClose={() => {}}
          labels={{
            ...baseLabels,
            titulo: 'Retirar',
            motivos: [{ value: 'PERDA', label: 'Perda' }],
          }}
        />,
      )
    })

    const qtd = container.querySelector('input[name="quantidade_retirar"]') as HTMLInputElement
    const ref = container.querySelector('input[name="referencia_doc"]') as HTMLInputElement
    const obs = container.querySelector('input[name="observacao"]') as HTMLInputElement
    act(() => {
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      native.call(qtd, '3')
      qtd.dispatchEvent(new Event('input', { bubbles: true }))
      native.call(ref, 'OS-9')
      ref.dispatchEvent(new Event('input', { bubbles: true }))
      native.call(obs, 'quebrado')
      obs.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      ;(container.querySelector('#ajuste-saldo-form') as HTMLFormElement).requestSubmit()
    })

    expect(atualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantidade_atual: 7,
        estoque_minimo: 1,
        quantidade_esperada: 10,
        minimo_esperado: 1,
        observacao: '[Doc: OS-9] quebrado',
        motivo: 'PERDA',
      }),
    )
  })

  it('modo genérico: snapshot original mesmo ao editar apenas o mínimo', async () => {
    atualizarMock.mockResolvedValue({ ok: false, error: 'Conflito sintético' })
    act(() => {
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: '11111111-1111-1111-1111-111111111111',
            produtoNome: 'Sintético',
            quantidadeAtual: 9,
            estoqueMinimo: 2,
          }}
          onClose={() => {}}
          labels={baseLabels}
        />,
      )
    })
    const min = container.querySelector('input[name="estoque_minimo"]') as HTMLInputElement
    act(() => {
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      native.call(min, '3')
      min.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;(container.querySelector('#ajuste-saldo-form') as HTMLFormElement).requestSubmit()
    })
    expect(atualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantidade_atual: 9,
        estoque_minimo: 3,
        quantidade_esperada: 9,
        minimo_esperado: 2,
      }),
    )
    expect(container.textContent).toContain('Conflito sintético')
  })
})
