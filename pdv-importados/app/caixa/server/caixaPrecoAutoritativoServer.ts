import { createClient } from '@/lib/supabase/server'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  filtrarSomenteProdutosVendaveis,
} from '@/lib/catalog/aplicarFiltroProdutoVendavel'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
  /** Observabilidade visual (não usado em cálculo): snapshot de produtos.preco_custo. */
  custoUnitarioSnap: number | null
  /** Observabilidade visual (não usado em cálculo): id da faixa/regra usada como referência. */
  regraAplicadaId: string | null
}

export type ItemEntradaFinalizacao = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  tipoPreco: ItemAutoritativo['tipoPreco']
}

const EPS_PRECO = 0.02

/**
 * Concorrência das RPCs de revalidação de preço na finalização.
 * Limitado de propósito: o projeto roda em Supabase FREE (teto de conexões /
 * pool pequeno do PostgREST) e já saturou por chamadas concorrentes. Disparar
 * 1 RPC por item em paralelo ilimitado (carrinho grande) reabriria esse risco.
 */
const PRECO_REVALIDACAO_CONCORRENCIA = 5

/** Mesma convenção do caixa ao chamar `calcular_preco_produto` (inteiro). */
function quantidadeInteiraParaRpcPreco(q: number): number {
  const n = Number(q)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(1, Math.floor(n))
}

/** `map` com no máximo `limit` promessas em voo; preserva a ordem do índice. */
async function mapComConcorrencia<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = next++
      if (idx >= items.length) return
      results[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

function parseCalcularPrecoProdutoRpc(
  data: unknown,
): { preco: number; tipo: 'VAREJO' | 'ATACADO'; regraId: string | null } | null {
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
  const regraId = typeof row.regra_id === 'string' ? row.regra_id : null
  return { preco: Math.round(precoNum * 100) / 100, tipo, regraId }
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
    .select('id, preco_varejo, preco_custo, ativo, status_publicacao')
    .in('id', produtosIds)

  if (prodErr) return { ok: false, error: mensagemErroComSecao('Produtos', prodErr.message) }
  const vendaveis = filtrarSomenteProdutosVendaveis(
    (produtosRows ?? []) as {
      id: string
      preco_varejo: number
      preco_custo: number | null
      ativo: boolean
      status_publicacao: string | null
    }[],
  )
  const produtos = new Map(vendaveis.map((p) => [p.id as string, p]))
  if (produtos.size !== produtosIds.length) {
    return { ok: false, error: 'Há itens inválidos/inativos no carrinho. Atualize e tente novamente.' }
  }

  /**
   * Pré-busca dos preços autoritativos em paralelo (concorrência limitada).
   * Antes era N+1: um `await rpc` por item dentro do loop, sequencial — um carrinho
   * de 10 itens custava 10 round-trips em série. Agora as RPCs disparam em lotes de
   * `PRECO_REVALIDACAO_CONCORRENCIA` e o loop só valida os resultados já resolvidos.
   * MANUAL/PROMOCAO não consultam a RPC (usam o snapshot do cliente).
   */
  type PrecoPrefetch =
    | { kind: 'snapshot' }
    | { kind: 'qty_invalid' }
    | { kind: 'rpc'; data: unknown; error: { message: string } | null }

  const precoPrefetch = await mapComConcorrencia<ItemEntradaFinalizacao, PrecoPrefetch>(
    itensInput,
    PRECO_REVALIDACAO_CONCORRENCIA,
    async (i): Promise<PrecoPrefetch> => {
      if (i.tipoPreco === 'MANUAL' || i.tipoPreco === 'PROMOCAO') {
        return { kind: 'snapshot' }
      }
      const qRpc = quantidadeInteiraParaRpcPreco(i.quantidade)
      if (qRpc < 1) {
        return { kind: 'qty_invalid' }
      }
      const { data, error } = await supabase.rpc('calcular_preco_produto', {
        p_produto_id: i.produtoId,
        p_quantidade: qRpc,
        p_loja_id: lojaId,
      })
      return { kind: 'rpc', data, error }
    },
  )

  const itens: ItemAutoritativo[] = []

  for (let idx = 0; idx < itensInput.length; idx++) {
    const i = itensInput[idx]
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
        custoUnitarioSnap: p.preco_custo == null ? null : roundMoney2(Number(p.preco_custo)),
        regraAplicadaId: null,
      })
      continue
    }

    const prefetch = precoPrefetch[idx]
    if (prefetch.kind === 'qty_invalid') {
      return { ok: false, error: 'Quantidade inválida para cálculo de preço.' }
    }
    // `snapshot` só ocorre para MANUAL/PROMOCAO (já tratados acima); guarda defensiva.
    if (prefetch.kind !== 'rpc') {
      return {
        ok: false,
        error: 'Não foi possível validar o preço do produto no servidor. Tente novamente.',
      }
    }

    if (prefetch.error) {
      return { ok: false, error: mensagemErroComSecao('Preço do produto', prefetch.error.message) }
    }

    const esperado = parseCalcularPrecoProdutoRpc(prefetch.data)
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
      custoUnitarioSnap: p.preco_custo == null ? null : roundMoney2(Number(p.preco_custo)),
      regraAplicadaId: esperado.regraId,
    })
  }

  return { ok: true, itens }
}
