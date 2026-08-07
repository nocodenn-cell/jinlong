'use server'

import { revalidarDominio } from '@/lib/navigation/revalidarDominio'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  actionFail,
  runServerActionWithObservability,
  type ActionResult,
} from '@/lib/observability/runServerAction'
import { createInventoryMovementWriter } from '@/app/admin/estoque/inventoryMovementWriter'

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
      const writer = createInventoryMovementWriter(supabase, input.loja_origem_id)
      const result = await writer.transfer({
        lojaOrigemId: input.loja_origem_id,
        lojaDestinoId: input.loja_destino_id,
        productId: input.produto_id,
        quantity: quantidade,
        observacao: input.observacao?.trim() || null,
        idempotencyKey: input.idempotency_key.trim(),
        saldoEsperado: estoqueAtual.quantidadeDisponivel,
      })
      if (!result.ok) {
        throw new Error(mensagemErroComSecao('Transferência de estoque', result.error))
      }

      revalidarDominio('estoque.transferido')
      return { transferenciaId: result.transferenciaId }
    },
    'transferir_estoque_seguro',
  )
}

export type ProdutoTransferenciaBusca = {
  id: string
  nome: string
  unidade_medida: string
  codigo_barras: string | null
}

/** Busca async de produto para Transferências (IX-LOOKUP — sem payload 500). */
export async function buscarProdutosTransferencia(
  termo: string,
): Promise<
  | { success: true; data: ProdutoTransferenciaBusca[] }
  | { success: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const t = (termo ?? '').replace(/[,()%_\\]/g, ' ').trim().slice(0, 120)
  if (t.length < 2) return { success: true, data: [] }

  const supabase = await createClient()
  const digitos = t.replace(/\D/g, '')
  const ors = [`nome.ilike.%${t}%`, `codigo_interno.ilike.%${t}%`]
  if (digitos) ors.push(`codigo_barras.like.%${digitos}%`)

  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, unidade_medida, codigo_barras')
    .eq('ativo', true)
    .or(ors.join(','))
    .order('nome', { ascending: true })
    .limit(20)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Produtos', error.message) }
  }

  return {
    success: true,
    data: (data ?? []).map((p) => ({
      id: p.id,
      nome: p.nome,
      unidade_medida: p.unidade_medida ?? 'UN',
      codigo_barras: p.codigo_barras,
    })),
  }
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
