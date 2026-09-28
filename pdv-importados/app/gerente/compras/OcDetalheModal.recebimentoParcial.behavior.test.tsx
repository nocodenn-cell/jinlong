/** @vitest-environment jsdom */
/**
 * UX-04 — modal do pedido de compra com recebimento parcial.
 *
 * A regra (saldo, excesso, lock, idempotência) é do banco e é provada em SQL
 * (`backend/scripts/ux04-oc-recebimento-parcial.test.sql` + `...concorrencia.sh`). Aqui se prova o que
 * a TELA promete ao operador: pedido / recebido / pendente por item, "Faltam 40 unidades.",
 * uma ação primária clara, "encerrar com falta" com motivo, cancelar só sem recebimento e a MESMA
 * chave de idempotência num reenvio idêntico (duplo clique/retry não credita duas vezes).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterDetalheMock = vi.fn()
const receberMock = vi.fn()
const encerrarMock = vi.fn()
const statusMock = vi.fn()
const toastMock = vi.fn()

vi.mock('./actions', () => ({
  obterOrdemCompraDetalhe: (id: string) => obterDetalheMock(id),
  atualizarStatusOC: (...a: unknown[]) => statusMock(...a),
  registrarRecebimentoOC: (...a: unknown[]) => receberMock(...a),
  encerrarOrdemCompraComFalta: (...a: unknown[]) => encerrarMock(...a),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: (...a: unknown[]) => toastMock(...a) }))

const { OcDetalheModal } = await import('./OcDetalheModal')

const OC_ID = 'oc-1234567890'

type Over = {
  status?: string
  recebida?: number
  quantidade?: number
  encerrada_com_falta?: boolean
  motivo?: string | null
  entradas?: unknown[]
}

function oc(o: Over = {}) {
  const quantidade = o.quantidade ?? 100
  const recebida = o.recebida ?? 0
  const pendente = Math.max(quantidade - recebida, 0)
  return {
    id: OC_ID,
    fornecedor_id: 'f1',
    fornecedor_nome: 'Fornecedor Alfa',
    status: o.status ?? 'EM_TRANSITO',
    data_emissao: '2026-09-01',
    data_prevista_chegada: null,
    observacao: null,
    created_at: '2026-09-01T00:00:00Z',
    total_itens: 1,
    valor_total: quantidade * 3,
    pedido_total: quantidade,
    recebido_total: recebida,
    pendente_total: pendente,
    encerrada_com_falta: o.encerrada_com_falta ?? false,
    encerramento_motivo: o.motivo ?? null,
    itens: [
      {
        id: 'it-1',
        produto_id: 'p-1',
        produto_nome: 'Produto A',
        descricao: null,
        quantidade,
        preco_unitario: 3,
        quantidade_recebida: recebida,
        saldo_pendente: pendente,
        unidade_medida: 'UN',
      },
    ],
    entradas: o.entradas ?? [],
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  obterDetalheMock.mockReset()
  receberMock.mockReset()
  encerrarMock.mockReset()
  statusMock.mockReset()
  toastMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function abrir(o: Over = {}, onStatusChanged: () => void = () => {}) {
  obterDetalheMock.mockResolvedValue({ success: true, data: oc(o) })
  await act(async () => {
    root.render(
      <OcDetalheModal
        idioma="pt"
        ocId={OC_ID}
        onClose={() => {}}
        onEditar={() => {}}
        onStatusChanged={onStatusChanged}
      />,
    )
  })
}

function digitar(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  setter.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const qtdAgora = () => container.querySelector('#oc-agora-it-1') as HTMLInputElement
const btnReceber = () => container.querySelector('[data-testid="oc-btn-registrar-recebimento"]') as HTMLButtonElement
const btnEncerrar = () => container.querySelector('[data-testid="oc-btn-encerrar-falta"]') as HTMLButtonElement | null
const textoBotoes = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim())

describe('OcDetalheModal — pedido / recebido / pendente (UX-04)', () => {
  it('100 pedidas, 60 recebidas: mostra os três números por item e "Faltam 40 unidades."', async () => {
    await abrir({ recebida: 60 })

    const item = container.querySelector('[data-testid="oc-item-it-1"]')!
    expect(item.textContent).toContain('Pedido')
    expect(item.textContent).toContain('100')
    expect(item.textContent).toContain('Recebido')
    expect(item.textContent).toContain('60')
    expect(item.textContent).toContain('Pendente')
    expect(item.textContent).toContain('40')
    expect(container.querySelector('[data-testid="oc-resumo-saldo"]')?.textContent).toBe('Faltam 40 unidades.')
    expect(container.querySelector('[data-testid="oc-resumo-recebimento"]')?.textContent).toContain('Recebido 60 de 100')
  })

  it('primeira entrega parcial NÃO fecha o pedido: segue em trânsito, com ação primária "Registrar recebimento"', async () => {
    await abrir({ recebida: 60 })

    expect(container.textContent).toContain('Em trânsito')
    expect(btnReceber()).toBeTruthy()
    expect(container.querySelector('[data-testid="oc-resumo-saldo"]')?.textContent).not.toContain('totalmente')
  })

  it('pedido totalmente recebido: "Pedido totalmente recebido.", sem ação de receber/encerrar/cancelar', async () => {
    await abrir({ status: 'RECEBIDA', recebida: 100 })

    expect(container.querySelector('[data-testid="oc-resumo-saldo"]')?.textContent).toBe('Pedido totalmente recebido.')
    expect(btnReceber()).toBeNull()
    expect(btnEncerrar()).toBeNull()
    expect(textoBotoes()).not.toContain('Cancelar ordem')
    expect(container.querySelector('[data-testid="oc-aviso-recebimento-duplicidade"]')).toBeNull()
  })

  it('pedido legado encerrado por um recebimento único abaixo do pedido: NÃO diz "totalmente recebido"', async () => {
    await abrir({ status: 'RECEBIDA', recebida: 70, encerrada_com_falta: false })

    const saldo = container.querySelector('[data-testid="oc-resumo-saldo"]')?.textContent
    expect(saldo).toContain('recebimento incompleto')
    expect(saldo).toContain('faltaram 30 unidades')
    expect(saldo).not.toContain('totalmente')
    expect(btnReceber()).toBeNull()
  })

  it('lista as entradas ligadas ao pedido (origem + itens), reconstruídas do razão', async () => {
    await abrir({
      recebida: 100,
      status: 'RECEBIDA',
      entradas: [
        {
          entrada_id: 'e1',
          origem: 'ORDEM_COMPRA',
          created_at: '2026-09-05T10:00:00Z',
          legado: false,
          total: 60,
          itens: [{ item_id: 'it-1', nome: 'Produto A', quantidade: 60 }],
        },
        {
          entrada_id: 'e2',
          origem: 'NFE',
          created_at: '2026-09-08T10:00:00Z',
          legado: false,
          total: 40,
          itens: [{ item_id: 'it-1', nome: 'Produto A', quantidade: 40 }],
        },
      ],
    })

    const hist = container.querySelector('[data-testid="oc-entradas"]')!
    expect(hist.textContent).toContain('Recebimento pelo pedido')
    expect(hist.textContent).toContain('Produto A: +60')
    expect(hist.textContent).toContain('NF-e')
    expect(hist.textContent).toContain('Produto A: +40')
  })
})

describe('OcDetalheModal — registrar recebimento parcial (UX-04)', () => {
  it('sem quantidade informada o botão fica desabilitado (recebimento zerado não é enviado)', async () => {
    await abrir({ recebida: 60 })

    expect(btnReceber().disabled).toBe(true)
    await act(async () => btnReceber().click())
    expect(receberMock).not.toHaveBeenCalled()
  })

  it('acima do que falta: alerta na linha, botão desabilitado e nada enviado', async () => {
    await abrir({ recebida: 60 })

    await act(async () => digitar(qtdAgora(), '41'))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('não pode passar do que falta receber')
    expect(btnReceber().disabled).toBe(true)
    expect(receberMock).not.toHaveBeenCalled()
  })

  it('"Preencher com o que falta" põe o saldo em cada item', async () => {
    await abrir({ recebida: 60 })

    await act(async () => (container.querySelector('[data-testid="oc-preencher-saldo"]') as HTMLButtonElement).click())
    expect(qtdAgora().value).toBe('40')
    expect(btnReceber().disabled).toBe(false)
  })

  it('envia só o que chegou nesta entrega, com chave de idempotência, e mostra estoque + saldo novo', async () => {
    const aoMudar = vi.fn()
    receberMock.mockResolvedValue({
      success: true,
      data: {
        oc_id: OC_ID,
        status: 'EM_TRANSITO',
        pedido_total: 100,
        recebido_total: 60,
        pendente_total: 40,
        itens_pendentes: 1,
        encerrada: false,
        encerrada_com_falta: false,
        replay: false,
        entrada_id: 'e1',
        quantidade_creditada: 60,
        mensagem: 'x',
      },
    })
    await abrir({}, aoMudar)
    obterDetalheMock.mockResolvedValue({ success: true, data: oc({ recebida: 60 }) })

    await act(async () => digitar(qtdAgora(), '60'))
    await act(async () => btnReceber().click())

    expect(receberMock).toHaveBeenCalledTimes(1)
    const [ocId, itens, chave] = receberMock.mock.calls[0] as [string, unknown[], string]
    expect(ocId).toBe(OC_ID)
    expect(itens).toEqual([{ item_id: 'it-1', quantidade_recebida: 60 }])
    expect(typeof chave).toBe('string')
    expect(chave.length).toBeGreaterThan(8)

    const aviso = container.querySelector('[data-testid="oc-aviso-ultima-entrada"]')
    expect(aviso?.textContent).toContain('Estoque atualizado: +60.')
    expect(aviso?.textContent).toContain('Pedido: 60 de 100 recebidas. Faltam 40 unidades.')
    // o modal permanece aberto mostrando o saldo novo, e a lista/KPIs são atualizados
    expect(container.querySelector('[data-testid="oc-resumo-saldo"]')?.textContent).toBe('Faltam 40 unidades.')
    expect(aoMudar).toHaveBeenCalled()
  })

  it('reenvio idêntico após falha usa a MESMA chave; mudar a quantidade gera chave nova', async () => {
    receberMock.mockResolvedValue({ success: false, error: 'Falha de rede.' })
    await abrir({ recebida: 60 })

    await act(async () => digitar(qtdAgora(), '30'))
    await act(async () => btnReceber().click())
    await act(async () => btnReceber().click())
    expect(receberMock).toHaveBeenCalledTimes(2)
    const k1 = (receberMock.mock.calls[0] as unknown[])[2]
    const k2 = (receberMock.mock.calls[1] as unknown[])[2]
    expect(k2).toBe(k1)

    await act(async () => digitar(qtdAgora(), '31'))
    await act(async () => btnReceber().click())
    const k3 = (receberMock.mock.calls[2] as unknown[])[2]
    expect(k3).not.toBe(k1)
  })

  it('replay do servidor: avisa que já estava registrado e que o estoque não foi creditado de novo', async () => {
    receberMock.mockResolvedValue({
      success: true,
      data: {
        oc_id: OC_ID,
        status: 'EM_TRANSITO',
        pedido_total: 100,
        recebido_total: 60,
        pendente_total: 40,
        itens_pendentes: 1,
        encerrada: false,
        encerrada_com_falta: false,
        replay: true,
        entrada_id: 'e1',
        quantidade_creditada: 0,
        mensagem: 'x',
      },
    })
    await abrir({ recebida: 60 })
    await act(async () => digitar(qtdAgora(), '40'))
    await act(async () => btnReceber().click())

    expect(container.querySelector('[data-testid="oc-aviso-ultima-entrada"]')?.textContent).toContain(
      'não foi creditado de novo',
    )
  })

  it('erro do banco (ex.: acima do saldo por concorrência) aparece como erro e não como sucesso', async () => {
    receberMock.mockResolvedValue({ success: false, error: 'A quantidade informada é maior do que ainda falta receber deste pedido.' })
    await abrir({ recebida: 60 })
    await act(async () => digitar(qtdAgora(), '40'))
    await act(async () => btnReceber().click())

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error', message: expect.stringContaining('maior do que ainda falta') }),
    )
    expect(container.querySelector('[data-testid="oc-aviso-ultima-entrada"]')).toBeNull()
  })
})

describe('OcDetalheModal — encerrar com falta e cancelar (UX-04)', () => {
  it('com algo recebido e algo pendente: oferece "Encerrar com falta" e NÃO oferece cancelar', async () => {
    await abrir({ recebida: 60 })

    expect(btnEncerrar()).toBeTruthy()
    expect(textoBotoes()).not.toContain('Cancelar ordem')
    expect(container.querySelector('[data-testid="oc-cancelar-bloqueado"]')?.textContent).toContain('Encerrar com falta')
  })

  it('nada recebido: oferece cancelar e NÃO oferece encerrar com falta', async () => {
    await abrir({ recebida: 0 })

    expect(btnEncerrar()).toBeNull()
    expect(textoBotoes()).toContain('Cancelar ordem')
  })

  it('encerrar exige motivo (mín. 5) e confirmação; envia o motivo e atualiza o pedido', async () => {
    const aoMudar = vi.fn()
    encerrarMock.mockResolvedValue({ success: true, data: { status: 'RECEBIDA', encerrada_com_falta: true } })
    await abrir({ recebida: 60 }, aoMudar)

    await act(async () => btnEncerrar()!.click())
    const painel = container.querySelector('[data-testid="oc-encerrar-falta"]')!
    expect(painel.textContent).toContain('As 40 unidades pendentes deixam de ser esperadas')
    const confirmar = Array.from(painel.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar encerramento'),
    ) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)

    const motivo = painel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => digitar(motivo, 'abc'))
    expect(confirmar.disabled).toBe(true)

    obterDetalheMock.mockResolvedValue({
      success: true,
      data: oc({ status: 'RECEBIDA', recebida: 60, encerrada_com_falta: true, motivo: 'fornecedor não envia o restante' }),
    })
    await act(async () => digitar(motivo, 'fornecedor não envia o restante'))
    expect(confirmar.disabled).toBe(false)
    await act(async () => confirmar.click())

    expect(encerrarMock).toHaveBeenCalledWith(OC_ID, 'fornecedor não envia o restante')
    expect(aoMudar).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="oc-motivo-encerramento"]')?.textContent).toContain(
      'fornecedor não envia o restante',
    )
    expect(container.querySelector('[data-testid="oc-resumo-saldo"]')?.textContent).toBe(
      'Pedido encerrado com falta de 40 unidades.',
    )
  })

  it('pedido encerrado com falta: sem ações, com o motivo visível e a situação "Encerrada com falta"', async () => {
    await abrir({ status: 'RECEBIDA', recebida: 60, encerrada_com_falta: true, motivo: 'fornecedor descontinuou' })

    expect(container.textContent).toContain('Encerrada com falta')
    expect(container.querySelector('[data-testid="oc-motivo-encerramento"]')?.textContent).toContain('fornecedor descontinuou')
    expect(btnReceber()).toBeNull()
    expect(btnEncerrar()).toBeNull()
  })
})
