import { createClient } from '@/lib/supabase/server'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
}

export type ItemEntradaFinalizacao = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  tipoPreco: ItemAutoritativo['tipoPreco']
}

const EPS_PRECO = 0.02

/** Mesma convenção do caixa ao chamar `calcular_preco_produto` (inteiro). */
function quantidadeInteiraParaRpcPreco(q: number): number {
  const n = Number(q)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(1, Math.floor(n))
}

function parseCalcularPrecoProdutoRpc(
  data: unknown,
): { preco: number; tipo: 'VAREJO' | 'ATACADO' } | null {
  if (data == null) return null
  let row: Record<string, unknown>
  if (typeof data === 'string') {
    try {
      row = JSON.parse(data) as Record<string, unknown>
    } catch {
      return null
    }
  } else {
    row = data as Record<string, unknown>
  }
  if (row.erro === 'produto_nao_encontrado' || row.erro === 'quantidade_invalida') return null
  const precoRaw = row.preco
  const precoNum = typeof precoRaw === 'string' ? Number(precoRaw) : Number(precoRaw)
  if (!Number.isFinite(precoNum) || precoNum < 0) return null
  const tipo = row.tipo === 'ATACADO' ? 'ATACADO' : 'VAREJO'
  return { preco: Math.round(precoNum * 100) / 100, tipo }
}

/**
 * Monta os itens persistidos na venda com o mesmo preço visto no carrinho:
 * — VAREJO / ATACADO: confere com a RPC `calcular_preco_produto` (anti-fraude + faixas `precos_atacado`).
 * — MANUAL / PROMOCAO: usa o snapshot enviado pelo cliente (sem RPC).
 */
export async function recalcularItensNoServidor(
  supabase: SupabaseServerClient,
  itensInput: ItemEntradaFinalizacao[],
  lojaId: string,
): Promise<{ ok: true; itens: ItemAutoritativo[] } | { ok: false; error: string }> {
  const produtosIds = Array.from(new Set(itensInput.map((i) => i.produtoId)))
  const { data: produtosRows, error: prodErr } = await supabase
    .from('produtos')
    .select('id, preco_varejo, ativo')
    .in('id', produtosIds)
    .eq('ativo', true)

  if (prodErr) return { ok: false, error: mensagemErroComSecao('Produtos', prodErr.message) }
  const produtos = new Map((produtosRows ?? []).map((p) => [p.id as string, p]))
  if (produtos.size !== produtosIds.length) {
    return { ok: false, error: 'Há itens inválidos/inativos no carrinho. Atualize e tente novamente.' }
  }

  const itens: ItemAutoritativo[] = []

  for (const i of itensInput) {
    const p = produtos.get(i.produtoId)!
    const varejo = roundMoney2(Number(p.preco_varejo))

    if (i.tipoPreco === 'MANUAL' || i.tipoPreco === 'PROMOCAO') {
      const precoOriginal = roundMoney2(i.precoOriginal)
      const precoUnitario = roundMoney2(i.precoUnitario)
      if (precoUnitario > precoOriginal + EPS_PRECO) {
        return {
          ok: false,
          error: 'Item com preço unitário acima do preço de referência. Atualize o cupom e tente novamente.',
        }
      }
      itens.push({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        precoOriginal,
        precoUnitario,
        descontoUnitario: roundMoney2(precoOriginal - precoUnitario),
        tipoPreco: i.tipoPreco,
      })
      continue
    }

    const qRpc = quantidadeInteiraParaRpcPreco(i.quantidade)
    if (qRpc < 1) {
      return { ok: false, error: 'Quantidade inválida para cálculo de preço.' }
    }

    const { data, error: rpcErr } = await supabase.rpc('calcular_preco_produto', {
      p_produto_id: i.produtoId,
      p_quantidade: qRpc,
      p_loja_id: lojaId,
    })

    if (rpcErr) {
      return { ok: false, error: mensagemErroComSecao('Preço do produto', rpcErr.message) }
    }

    const esperado = parseCalcularPrecoProdutoRpc(data)
    if (!esperado) {
      return {
        ok: false,
        error: 'Não foi possível validar o preço do produto no servidor. Tente novamente.',
      }
    }

    if (esperado.tipo !== i.tipoPreco) {
      return {
        ok: false,
        error:
          'O tipo de preço (varejo/atacado) mudou em relação ao cupom. Atualize as quantidades ou refaça a busca do produto.',
      }
    }

    if (Math.abs(esperado.preco - roundMoney2(i.precoUnitario)) > EPS_PRECO) {
      return {
        ok: false,
        error:
          'O preço unitário diverge do cadastro (possível alteração após o cupom). Recalcule o cupom e finalize novamente.',
      }
    }

    if (i.tipoPreco === 'VAREJO') {
      if (Math.abs(varejo - roundMoney2(i.precoOriginal)) > EPS_PRECO) {
        return {
          ok: false,
          error: 'Preço de referência (varejo) inconsistente. Atualize o cupom.',
        }
      }
    } else if (i.tipoPreco === 'ATACADO') {
      if (Math.abs(varejo - roundMoney2(i.precoOriginal)) > EPS_PRECO) {
        return {
          ok: false,
          error: 'Preço de referência para atacado inconsistente. Atualize o cupom.',
        }
      }
    }

    const precoOriginal = roundMoney2(i.precoOriginal)
    const precoUnitario = roundMoney2(i.precoUnitario)
    itens.push({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal,
      precoUnitario,
      descontoUnitario: roundMoney2(precoOriginal - precoUnitario),
      tipoPreco: i.tipoPreco,
    })
  }

  return { ok: true, itens }
}
