/** @vitest-environment jsdom */
/**
 * A linha só abre o escritor do destino escolhido, com o título daquela linha.
 * Cancelar não chama escritor. Repetir o mesmo envio reusa a chave.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { baixasAutorizadas, opcoesComFoco } from './baixaLinha'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const executarFinanceiroLoja = vi.hoisted(() => vi.fn())
const registrarPagamentoAction = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('../financeiroLojaActions', () => ({
  executarFinanceiroLoja: (...args: unknown[]) => executarFinanceiroLoja(...args),
  executarFinanceiroOperacional: vi.fn(),
}))
vi.mock('@/app/gerente/financeiro/contas-pagar/actions', () => ({
  registrarPagamentoAction: (...args: unknown[]) => registrarPagamentoAction(...args),
  buscarContasPagarAction: vi.fn(),
  cancelarContaPagarAction: vi.fn(),
  exportarContasPagarParaCSVAction: vi.fn(),
  buscarCaixasAbertosPagamentoAction: vi.fn(async () => ({ ok: true, caixas: [] })),
  listarPagamentosContaAction: vi.fn(async () => ({ ok: true, pagamentos: [] })),
}))
vi.mock('@/app/caixa/actions', () => ({
  obterLimiteSangriaSemGerente: vi.fn(async () => ({ ok: true, limite: 200 })),
  validarGerenteDesconto: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

const { ContasReceberTable } = await import('./ContasReceberTable')
const { FinanceiroTitulosOperations } = await import('./FinanceiroTitulosOperations')
const { FinanceiroAcoesRapidas } = await import('./FinanceiroAcoesRapidas')
const { ContasPagarListClient } = await import('@/app/gerente/financeiro/contas-pagar/ContasPagarListClient')

const labelsAcoes = {
  faixaAria: 'Operações',
  registrarVenda: 'Registrar venda',
  receber: 'Receber',
  pagar: 'Pagar / Registrar despesa',
  transferir: 'Transferir',
  vendaTitulo: 'Registrar venda',
  vendaTexto: 'Use o PDV',
  vendaPdv: 'Abrir PDV',
  vendaBuscar: 'Buscar venda',
  receberTitulo: 'Receber',
  pagarTitulo: 'Pagar',
  transferirTitulo: 'Transferir',
  avulsoHint: 'Priorize título',
  confirmarReceber: 'Confirmar',
  confirmarPagar: 'Confirmar',
  confirmarTransferir: 'Confirmar',
}

const focoAp = { tipo: 'AP' as const, id: 'ap-linha', rotulo: 'Fornecedor Alfa · Compra de mercadoria' }

const labelsReceber = {
  colCliente: 'Cliente',
  colVencimento: 'Vencimento',
  colTotal: 'Total',
  colPago: 'Pago',
  colAberto: 'Em aberto',
  colStatus: 'Status',
  statusAberto: 'Aberto',
  statusParcial: 'Parcial',
  statusQuitado: 'Quitado',
  vazioTitulo: 'Sem títulos',
  vazioSub: 'Nada',
  verVenda: 'Ver venda',
  locale: 'pt-BR',
  receberCaixa: 'Receber no caixa',
  receberConta: 'Receber na conta financeira',
}

const contaReceber = {
  id: 'ar-linha',
  cliente_nome: 'Maria',
  valor_total: 80,
  valor_aberto: 80,
  valor_pago: 0,
  status: 'ABERTO',
  vencimento: '2026-10-10',
  descricao: 'Fiado',
  loja_id: 'loja-1',
  venda_id: null,
}

const contaPagar = {
  id: 'ap-linha',
  fornecedor_id: 'f1',
  fornecedor_nome: 'Fornecedor Alfa',
  descricao: 'Compra de mercadoria',
  valor_total: 100,
  valor_pago: 0,
  vencimento: '2026-10-10',
  status: 'PENDENTE' as const,
  nfe_numero: null,
  nfe_importacao_id: null,
  criado_em: '2026-10-05T12:00:00Z',
  loja_id: 'loja-1',
  atrasado: false,
}

const painel = {
  hoje: '2026-10-11',
  saldo: 1000,
  saldo_pdv: 0,
  pagina: 1,
  contas: [{ id: 'banco-1', nome: 'Banco', tipo: 'BANCO', ativo: true, saldo: 1000 }],
  categorias: [],
  clientes: [],
  fornecedores: [],
  pagar: [],
  receber: [],
  movimentos: [],
  recebiveis: [],
  extratos: [],
  movimentos_caixa: [],
  contagens: { pagar: 0, receber: 0, recebiveis: 0, movimentos: 0, extratos: 0 },
  fluxo: [],
  alertas: { sem_previsao: 0, ar_sem_vencimento: 0, caixas_incompletos: 0, sem_categoria: 0 },
  resultado_caixa: [],
  resultado_gerencial: {
    receita_vendas: 0,
    custo_conhecido: 0,
    itens_sem_custo: 0,
    despesas_manuais: 0,
    taxas_conferidas: 0,
    taxas_pendentes: 0,
  },
} as FinanceiroPainel

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  executarFinanceiroLoja.mockResolvedValue({ ok: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function definir(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('autorização da linha', () => {
  it('OPERADOR não recebe caixa nem conta; GERENTE, DONO e ADMIN recebem os dois', () => {
    expect(baixasAutorizadas('OPERADOR')).toEqual({ caixa: false, conta: false })
    expect(baixasAutorizadas(null)).toEqual({ caixa: false, conta: false })
    for (const perfil of ['GERENTE', 'DONO', 'ADMIN']) {
      expect(baixasAutorizadas(perfil)).toEqual({ caixa: true, conta: true })
    }
  })

  it('a linha a receber de OPERADOR não oferece baixa', () => {
    act(() => {
      root.render(
        <ContasReceberTable
          contas={[contaReceber]}
          labels={labelsReceber}
          perfil="OPERADOR"
          actorLojaId="loja-1"
          onReceberCaixa={vi.fn()}
          onReceberConta={vi.fn()}
        />,
      )
    })
    expect(container.querySelector('button[aria-label^="Receber"]')).toBeNull()
  })

  it('a linha a pagar de OPERADOR não oferece baixa', async () => {
    await act(async () => {
      root.render(
        <ContasPagarListClient
          idioma="pt"
          locale="pt-BR"
          contasIniciais={[contaPagar]}
          hasMoreInicial={false}
          fornecedoresOpts={[]}
          statusInicial="todos"
          periodoInicial=""
          actorLojaId="loja-1"
          perfil="OPERADOR"
          onPagarConta={vi.fn()}
        />,
      )
    })
    expect(container.querySelector('button[aria-label^="Pagar"]')).toBeNull()
    expect(registrarPagamentoAction).not.toHaveBeenCalled()
  })
})

describe('título da linha', () => {
  it('receber na conta e no caixa devolvem o id da linha clicada', () => {
    const noCaixa = vi.fn()
    const naConta = vi.fn()
    act(() => {
      root.render(
        <ContasReceberTable
          contas={[contaReceber]}
          labels={labelsReceber}
          perfil="GERENTE"
          actorLojaId="loja-1"
          onReceberCaixa={noCaixa}
          onReceberConta={naConta}
        />,
      )
    })
    const caixa = container.querySelector('button[aria-label="Receber no caixa — Maria"]') as HTMLButtonElement
    const conta = container.querySelector('button[aria-label="Receber na conta financeira — Maria"]') as HTMLButtonElement
    act(() => caixa.click())
    act(() => conta.click())
    expect(noCaixa).toHaveBeenCalledWith(expect.objectContaining({ id: 'ar-linha' }))
    expect(naConta).toHaveBeenCalledWith(expect.objectContaining({ id: 'ar-linha' }))
  })

  it('pagar pela conta devolve o id da linha e não chama o pagamento de caixa', async () => {
    const naConta = vi.fn()
    await act(async () => {
      root.render(
        <ContasPagarListClient
          idioma="pt"
          locale="pt-BR"
          contasIniciais={[contaPagar]}
          hasMoreInicial={false}
          fornecedoresOpts={[]}
          statusInicial="todos"
          periodoInicial=""
          actorLojaId="loja-1"
          perfil="GERENTE"
          onPagarConta={naConta}
        />,
      )
    })
    const conta = container.querySelector(
      'button[aria-label="Pagar pela conta financeira — Compra de mercadoria"]',
    ) as HTMLButtonElement
    act(() => conta.click())
    expect(naConta).toHaveBeenCalledWith(expect.objectContaining({ id: 'ap-linha' }))
    expect(registrarPagamentoAction).not.toHaveBeenCalled()
  })

  it('inclui na lista o título da linha quando ele não está na página do painel', () => {
    const foco = { tipo: 'AP' as const, id: 'ap-linha', rotulo: 'Fornecedor Alfa · Compra de mercadoria' }
    const opcoes = opcoesComFoco([], foco, 'AP', { id: foco.id, rotulo: foco.rotulo })
    expect(opcoes).toEqual([{ id: 'ap-linha', rotulo: foco.rotulo }])
    expect(opcoesComFoco(opcoes, foco, 'AR', { id: foco.id, rotulo: foco.rotulo })).toEqual(opcoes)
  })
})

describe('formulário da conta financeira (modal de Pagar)', () => {
  // O modal de Pagar já vem aberto com o título da linha: o formulário permanente saiu da página.
  function montar(idioma?: 'pt' | 'zh') {
    const painelModal = (
      <FinanceiroAcoesRapidas
        data={painel}
        labels={labelsAcoes}
        mostrar={['pagar']}
        acao="pagar"
        onAcao={() => {}}
        foco={focoAp}
      />
    )
    act(() => {
      root.render(idioma ? <AdminV2SessionProvider idioma={idioma}>{painelModal}</AdminV2SessionProvider> : painelModal)
    })
  }

  function formBaixa(): HTMLFormElement {
    const form = Array.from(container.querySelectorAll('form')).find(
      (f) => f.querySelector('select[name="titulo_id"]') && f.querySelector('select[name="conta_id"]'),
    )
    if (!form) throw new Error('formulário de baixa não encontrado')
    return form
  }

  it('pré-seleciona o título da linha e, sem envio, não chama o escritor', () => {
    montar()
    const select = formBaixa().querySelector('select[name="titulo_id"]') as HTMLSelectElement
    expect(select.value).toBe('ap-linha')
    expect(executarFinanceiroLoja).not.toHaveBeenCalled()
  })

  it('o modal mostra conta, valor, data e nova despesa no idioma da sessão', () => {
    montar('zh')
    const texto = container.textContent ?? ''
    expect(texto).toContain('付款账户')
    expect(texto).toContain('金额 (R$)')
    expect(texto).toContain('实际日期')
    expect(texto).toContain('新费用')
    expect(texto).not.toContain('Conta de origem')
  })

  it('a página não tem mais formulário de baixa permanente; a classificação continua', () => {
    act(() => {
      root.render(<FinanceiroTitulosOperations data={painel} tipo="AP" />)
    })
    expect(container.querySelector('select[name="conta_id"]')).toBeNull()
    expect(container.querySelector('select[name="titulo_id"]')).not.toBeNull()
    expect(container.textContent ?? '').toContain('Título desta página')
  })

  it('bloqueia o segundo envio enquanto o primeiro está pendente e reabilita ao concluir', async () => {
    let liberar: (valor: { ok: true }) => void = () => {}
    executarFinanceiroLoja.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve }),
    )
    montar()
    const form = formBaixa()
    definir(form.querySelector('select[name="conta_id"]') as HTMLSelectElement, 'banco-1')
    definir(form.querySelector('input[name="valor"]') as HTMLInputElement, '40')
    const enviar = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await act(async () => {
      enviar()
      enviar()
    })

    expect(executarFinanceiroLoja).toHaveBeenCalledTimes(1)
    const primeira = executarFinanceiroLoja.mock.calls[0][0] as {
      tipo: string
      requestId: string
      dados: Record<string, unknown>
    }
    expect(primeira.tipo).toBe('BAIXAR_AP')
    expect(primeira.dados.titulo_id).toBe('ap-linha')
    expect(primeira.dados.conta_id).toBe('banco-1')
    expect(primeira.dados).not.toHaveProperty('caixa_id')
    const botao = form.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(botao.textContent).toContain('Registrando')
    await act(async () => { liberar({ ok: true }) })
    expect(botao.disabled).toBe(false)
    expect(botao.textContent).not.toContain('Registrando')
  })

  it('depois de um erro, o mesmo payload reusa a chave e o botão volta a aceitar envio', async () => {
    executarFinanceiroLoja.mockResolvedValue({ ok: false, error: 'saldo insuficiente' })
    montar()
    const form = formBaixa()
    definir(form.querySelector('select[name="conta_id"]') as HTMLSelectElement, 'banco-1')
    definir(form.querySelector('input[name="valor"]') as HTMLInputElement, '40')
    const enviar = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await act(async () => { enviar() })
    const botao = form.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(botao.disabled).toBe(false)
    expect(container.textContent).toContain('saldo insuficiente')

    await act(async () => { enviar() })
    expect(executarFinanceiroLoja).toHaveBeenCalledTimes(2)
    const [primeira, segunda] = executarFinanceiroLoja.mock.calls.map((c) => c[0] as { requestId: string })
    expect(segunda.requestId).toBe(primeira.requestId)
  })
})
