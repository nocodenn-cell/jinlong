'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ROUTES } from '@/lib/navigation/routes'
import { actionImportacoes } from '@/lib/import/hub/gateImportacoes'
import { carregarOperacao } from '@/lib/import/hub/dadosImportacoes'
import { chaveErro } from '@/lib/import/hub/elegibilidade'
import { normalizarDecimal } from '@/lib/import/hub/decimais'
import { composicaoValorAduaneiro } from '@/lib/import/hub/inteligencia'
import type { ResultadoAcao } from './actions'

/**
 * P1 (CALC-001.1) — "Usar valor aduaneiro calculado" nos itens SEM valor informado.
 *
 * Por que persistir (e não enriquecer em memória): o motor (calcularLandedCost) não calcula VA e a
 * entrada é montada no SQL (_import_montar_entrada) e gravada com hash; o VA precisa estar NO ITEM
 * para eliminar a divergência bloqueante VALOR_ADUANEIRO_AUSENTE (contrato I-09).
 *
 * Regras: gate de servidor; recálculo a partir do banco (carregarOperacao: itens, câmbios, despesas)
 * pela fonte canônica (shared-core comporValorAduaneiro, critério fiscal VALOR_FOB — pendente de
 * validação); NUNCA sobrescreve VA informado; nada vem do navegador além do id da operação; com
 * qualquer pendência (sem câmbio, frete sem câmbio...) não grava nada (sem preenchimento parcial).
 * Grava pelo mesmo RPC do salvarItemAction (import_salvar_item), com 6 casas (escala do campo).
 */

const Uuid = z.string().uuid()
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }
type LeitorDocs = {
  from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => PromiseLike<{ data: { id: string; documento_id: string | null }[] | null; error: { message: string } | null }> } }
}

const falha = (erro: string, detalhe?: string) => ({ ok: false as const, erro, ...(detalhe ? { detalhe } : {}) })

export async function preencherValoresAduaneirosAction(operacaoId: string): Promise<ResultadoAcao<{ preenchidos: number }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const op = Uuid.safeParse(operacaoId)
  if (!op.success) return falha('erro_valor_invalido')
  const client = gate.ctx.client

  const dados = await carregarOperacao(client, op.data)
  if (!dados) return falha('erro_nao_autorizado')
  const comp = composicaoValorAduaneiro(dados.itens, dados.cambios, dados.despesas)
  if (comp.semBase.length > 0 || comp.pendencias.length > 0) {
    return falha('erro_va_pendencias', [...comp.pendencias, ...(comp.semBase.length ? ['SEM_CAMBIO'] : [])].join(', '))
  }
  const alvos = comp.itens.filter((x) => x.informado_brl === null)
  if (alvos.length === 0) return { ok: true, data: { preenchidos: 0 } }

  // import_salvar_item regrava documento_id: lê o vínculo atual para não desfazê-lo.
  const docs = await (client as unknown as LeitorDocs).from('import_itens').select('id, documento_id').eq('operacao_id', op.data)
  if (docs.error) return falha('erro_generico')
  const docPorItem = new Map((docs.data ?? []).map((d) => [d.id, d.documento_id]))

  let n = 0
  for (const alvo of alvos) {
    const it = dados.itens.find((i) => i.id === alvo.item_id)
    // Revalida no servidor que continua sem VA (nunca sobrescreve valor informado).
    if (!it || it.valor_aduaneiro_brl) continue
    const va = normalizarDecimal(alvo.valor_aduaneiro_brl, 6)
    if (!va) return falha('erro_valor_invalido', it.descricao)
    const p_item = {
      id: it.id, descricao: it.descricao, codigo_fornecedor: it.codigo_fornecedor, ncm: it.ncm, produto_id: it.produto_id,
      moeda: it.moeda, unidade_comercial: it.unidade_comercial, valor_mercadoria_moeda: it.valor_mercadoria_moeda,
      valor_aduaneiro_brl: va, quantidade_comercial: it.quantidade_comercial, fator_para_estoque: it.fator_para_estoque,
      quantidade_estoque: it.quantidade_estoque, peso_liquido_kg: it.peso_liquido_kg, peso_bruto_kg: it.peso_bruto_kg,
      volume_m3: it.volume_m3, documento_id: docPorItem.get(it.id) ?? null,
    }
    const { error } = await (client as unknown as Rpc).rpc('import_salvar_item', { p_operacao: op.data, p_item })
    if (error) {
      if (n > 0) revalidar(op.data)
      return falha(chaveErro(error.message), n > 0 ? `${n}/${alvos.length}` : undefined)
    }
    n++
  }
  revalidar(op.data)
  return { ok: true, data: { preenchidos: n } }
}

function revalidar(op: string) {
  revalidatePath(ROUTES.admin.importacoes)
  revalidatePath(`${ROUTES.admin.importacoes}/${op}`)
}
