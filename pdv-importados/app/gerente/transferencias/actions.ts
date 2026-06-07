'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  actionFail,
  runServerActionWithObservability,
  type ActionResult,
} from '@/lib/observability/runServerAction'

export async function executarTransferencia(input: {
  loja_origem_id: string
  loja_destino_id: string
  produto_id: string
  quantidade: number
  observacao?: string
  idempotency_key: string
}): Promise<ActionResult<{ transferenciaId: string }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return actionFail(auth.error, { errorCode: 'UNAUTHORIZED' })

  if (input.loja_origem_id === input.loja_destino_id) {
    return actionFail('Lojas origem e destino devem ser diferentes.', { errorCode: 'VALIDATION_FAILED' })
  }
  if (!input.quantidade || input.quantidade <= 0) {
    return actionFail('Quantidade inválida.', { errorCode: 'VALIDATION_FAILED' })
  }
  if (!input.idempotency_key?.trim()) {
    return actionFail('Chave de idempotência ausente.', { errorCode: 'VALIDATION_FAILED' })
  }

  const supabase = await createClient()
  const estoqueAtual = await obterEstoqueDisponivelTransferencia(input.loja_origem_id, input.produto_id)
  if (!estoqueAtual.success) return actionFail(estoqueAtual.error, { errorCode: 'VALIDATION_FAILED' })

  const quantidade = Number(input.quantidade)
  if (estoqueAtual.quantidadeDisponivel < quantidade) {
    return actionFail(
      `Saldo insuficiente na origem. Disponível: ${estoqueAtual.quantidadeDisponivel.toFixed(3)}, solicitado: ${quantidade.toFixed(3)}.`,
      { errorCode: 'VALIDATION_FAILED' },
    )
  }
  if (quantidade > estoqueAtual.limiteObservacao && !input.observacao?.trim()) {
    return actionFail(
      `Observação obrigatória para transferências acima de ${estoqueAtual.limiteObservacao.toFixed(3)} unidades.`,
      { errorCode: 'VALIDATION_FAILED' },
    )
  }

  return runServerActionWithObservability(
    'gerente/transferencia/executar',
    async () => {
      const { data, error } = await supabase.rpc('transferir_estoque_seguro', {
        p_loja_origem: input.loja_origem_id,
        p_loja_destino: input.loja_destino_id,
        p_produto_id: input.produto_id,
        p_quantidade: quantidade,
        p_observacao: input.observacao?.trim() || null,
        p_idempotency_key: input.idempotency_key.trim(),
        p_saldo_esperado: estoqueAtual.quantidadeDisponivel,
      })
      if (error) {
        throw new Error(mensagemErroComSecao('Transferência de estoque', error.message))
      }

      const transferenciaId = typeof data === 'string' ? data : null
      if (!transferenciaId) {
        throw new Error('Falha ao concluir transferência: ID não retornado.')
      }

      revalidatePath('/gerente/transferencias')
      revalidatePath('/gerente/estoque')
      return { transferenciaId }
    },
    'transferir_estoque_seguro',
  )
}

/** Quantidade atual na origem (para validação de UI antes da RPC). */
export async function obterEstoqueDisponivelTransferencia(
  lojaId: string,
  produtoId: string,
): Promise<
  | { success: true; quantidadeDisponivel: number; unidadeMedida: string; limiteObservacao: number }
  | { success: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('obter_estoque_disponivel_transferencia', {
    p_loja_id: lojaId,
    p_produto_id: produtoId,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Transferência de estoque', error.message) }

  const row = Array.isArray(data) ? data[0] : data
  return {
    success: true,
    quantidadeDisponivel: Number(row?.quantidade_disponivel ?? 0),
    unidadeMedida: String(row?.unidade_medida ?? 'UN'),
    limiteObservacao: Number(row?.limite_observacao ?? 50),
  }
}
