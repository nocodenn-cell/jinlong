'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

type R =
  | { success: true; transferenciaId: string }
  | { success: false; error: string }

export async function executarTransferencia(input: {
  loja_origem_id: string
  loja_destino_id: string
  produto_id: string
  quantidade: number
  observacao?: string
  idempotency_key: string
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  if (input.loja_origem_id === input.loja_destino_id) {
    return { success: false, error: 'Lojas origem e destino devem ser diferentes.' }
  }
  if (!input.quantidade || input.quantidade <= 0) {
    return { success: false, error: 'Quantidade inválida.' }
  }
  if (!input.idempotency_key?.trim()) {
    return { success: false, error: 'Chave de idempotência ausente.' }
  }

  const supabase = await createClient()
  const estoqueAtual = await obterEstoqueDisponivelTransferencia(input.loja_origem_id, input.produto_id)
  if (!estoqueAtual.success) return estoqueAtual

  const quantidade = Number(input.quantidade)
  if (estoqueAtual.quantidadeDisponivel < quantidade) {
    return {
      success: false,
      error: `Saldo insuficiente na origem. Disponível: ${estoqueAtual.quantidadeDisponivel.toFixed(3)}, solicitado: ${quantidade.toFixed(3)}.`,
    }
  }
  if (quantidade > estoqueAtual.limiteObservacao && !input.observacao?.trim()) {
    return {
      success: false,
      error: `Observação obrigatória para transferências acima de ${estoqueAtual.limiteObservacao.toFixed(3)} unidades.`,
    }
  }

  const { data, error } = await supabase.rpc('transferir_estoque_seguro', {
    p_loja_origem: input.loja_origem_id,
    p_loja_destino: input.loja_destino_id,
    p_produto_id: input.produto_id,
    p_quantidade: quantidade,
    p_observacao: input.observacao?.trim() || null,
    p_idempotency_key: input.idempotency_key.trim(),
    p_saldo_esperado: estoqueAtual.quantidadeDisponivel,
  })
  if (error) return { success: false, error: mensagemErroComSecao('Transferência de estoque', error.message) }

  const transferenciaId = typeof data === 'string' ? data : null
  if (!transferenciaId) {
    return { success: false, error: 'Falha ao concluir transferência: ID não retornado.' }
  }

  revalidatePath('/gerente/transferencias')
  revalidatePath('/gerente/estoque')
  return { success: true, transferenciaId }
}

/** Quantidade atual na origem (para validação de UI antes da RPC). */
export async function obterEstoqueDisponivelTransferencia(
  lojaId: string,
  produtoId: string,
): Promise<
  | { success: true; quantidadeDisponivel: number; unidadeMedida: string; limiteObservacao: number }
  | { success: false; error: string }
> {
  const auth = await assertGerenteOuDono()
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
