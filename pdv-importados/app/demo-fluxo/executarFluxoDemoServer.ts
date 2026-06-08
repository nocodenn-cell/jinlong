'use server'

import {
  abrirCaixaOperador,
  buscarProdutoComPrecoCaixa,
  fecharCaixaOperador,
  finalizarVendaCaixa,
  obterStatusCaixaOperador,
} from '@/app/caixa/actions'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import {
  DEMO_FLUXO_PRODUTO_CODIGO,
  DEMO_FLUXO_TROCO_INICIAL,
} from '@/lib/demo/isDemoFluxoEnabled'

export type DemoFluxoStepId = 'caixa' | 'venda' | 'fechamento'

export type DemoFluxoStepResult = {
  id: DemoFluxoStepId
  ok: boolean
  message: string
}

export type ExecutarFluxoDemoServerResult =
  | {
      ok: true
      caixaId: string
      vendaId: string
      produtoId: string
      estoqueAntes: number | null
      steps: DemoFluxoStepResult[]
    }
  | {
      ok: false
      error: string
      failedStep: DemoFluxoStepId
      steps: DemoFluxoStepResult[]
      caixaId?: string
    }

export async function executarFluxoDemoServer(input: {
  produtoId: string | null
  estoqueAtual: number | null
}): Promise<ExecutarFluxoDemoServerResult> {
  const steps: DemoFluxoStepResult[] = []
  let caixaId: string | undefined
  let produtoId = input.produtoId
  let estoqueAntes = input.estoqueAtual

  const pushStep = (step: DemoFluxoStepResult) => {
    steps.push(step)
  }

  pushStep({ id: 'caixa', ok: false, message: 'Abrindo caixa…' })
  let status = await obterStatusCaixaOperador()
  if (!status.ok) {
    pushStep({ id: 'caixa', ok: false, message: status.error })
    return { ok: false, error: status.error, failedStep: 'caixa', steps }
  }

  if (!status.aberto) {
    const abrir = await abrirCaixaOperador(DEMO_FLUXO_TROCO_INICIAL)
    if (!abrir.ok) {
      pushStep({ id: 'caixa', ok: false, message: abrir.error })
      return { ok: false, error: abrir.error, failedStep: 'caixa', steps }
    }
    caixaId = abrir.caixaId
    pushStep({
      id: 'caixa',
      ok: true,
      message: `Caixa aberto — troco R$ ${DEMO_FLUXO_TROCO_INICIAL.toFixed(2)}`,
    })
  } else {
    caixaId = status.caixaId
    pushStep({
      id: 'caixa',
      ok: true,
      message: `Caixa já aberto — saldo sistema R$ ${status.valorSistemaDinheiro.toFixed(2)}`,
    })
  }

  pushStep({ id: 'venda', ok: false, message: 'Buscando produto e finalizando venda…' })
  const prodRes = await buscarProdutoComPrecoCaixa(DEMO_FLUXO_PRODUTO_CODIGO, 1)
  if (!prodRes.ok) {
    pushStep({ id: 'venda', ok: false, message: prodRes.error })
    return { ok: false, error: prodRes.error, failedStep: 'venda', steps, caixaId }
  }
  if (prodRes.status !== 'encontrado') {
    const msg = `Produto demo não encontrado (${DEMO_FLUXO_PRODUTO_CODIGO}). Aplique migration 027.`
    pushStep({ id: 'venda', ok: false, message: msg })
    return { ok: false, error: msg, failedStep: 'venda', steps, caixaId }
  }

  produtoId = prodRes.produto.id
  estoqueAntes = prodRes.produto.quantidade_estoque

  const precoUnit = prodRes.precoCalculado
  const totalBruto = roundMoney2(precoUnit)
  const totalLiquido = totalBruto

  const fin = await finalizarVendaCaixa({
    idempotencyKey: crypto.randomUUID(),
    formaPagamento: 'DINHEIRO',
    totalBruto,
    totalDesconto: 0,
    totalLiquido,
    pagamentos: [{ formaPagamento: 'DINHEIRO', valor: totalLiquido }],
    itens: [
      {
        produtoId: prodRes.produto.id,
        quantidade: 1,
        precoOriginal: prodRes.produto.preco_varejo,
        precoUnitario: precoUnit,
        tipoPreco: prodRes.tipoPrecoCalculado,
      },
    ],
  })

  if (!fin.ok) {
    pushStep({ id: 'venda', ok: false, message: fin.error })
    return { ok: false, error: fin.error, failedStep: 'venda', steps, caixaId }
  }

  const vendaId = fin.vendaId
  pushStep({
    id: 'venda',
    ok: true,
    message: `Venda ${vendaId.slice(0, 8)}… — ${prodRes.produto.nome}`,
  })

  pushStep({ id: 'fechamento', ok: false, message: 'Fechando caixa…' })
  status = await obterStatusCaixaOperador()
  if (!status.ok || !status.aberto) {
    const msg = 'Caixa não está aberto após a venda.'
    pushStep({ id: 'fechamento', ok: false, message: msg })
    return { ok: false, error: msg, failedStep: 'fechamento', steps, caixaId }
  }

  if (!caixaId) caixaId = status.caixaId

  const fechar = await fecharCaixaOperador({ valorContado: status.valorSistemaDinheiro })
  if (!fechar.ok) {
    pushStep({ id: 'fechamento', ok: false, message: fechar.error })
    return { ok: false, error: fechar.error, failedStep: 'fechamento', steps, caixaId }
  }

  caixaId = fechar.caixaId
  pushStep({
    id: 'fechamento',
    ok: true,
    message: `Fechado — contado R$ ${fechar.valorContado.toFixed(2)}`,
  })

  return {
    ok: true,
    caixaId,
    vendaId,
    produtoId,
    estoqueAntes,
    steps,
  }
}
