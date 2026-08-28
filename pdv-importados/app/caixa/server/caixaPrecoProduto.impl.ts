import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import type { CalcularPrecoProdutoCaixaResult } from '@/app/caixa/caixaActionTypes'
import { quantidadeParaRpcPreco } from '@/lib/format/quantidadeCaixa'

type RpcRow = {
  preco: number | string | null
  tipo: string | null
  erro?: string | null
}

export async function calcularPrecoProdutoCaixaImpl(input: {
  produtoId: string
  quantidade: number
  lojaId?: string | null
}): Promise<CalcularPrecoProdutoCaixaResult> {
  try {
    const { userId, lojaId: lojaUsuario, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()

    const q = quantidadeParaRpcPreco(input.quantidade)
    if (q < 1) {
      return { ok: false, error: 'Quantidade inválida.' }
    }

    let lojaId = input.lojaId ?? null
    if (lojaId == null || lojaId === '') {
      lojaId = lojaUsuario ?? LOJA_MATRIZ_ID
    }

    const { data, error } = await supabase.rpc('calcular_preco_produto', {
      p_produto_id: input.produtoId,
      p_quantidade: q,
      p_loja_id: lojaId,
    })

    if (error) {
      return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
    }

    const row = data as RpcRow | null
    if (!row || row.erro === 'produto_nao_encontrado') {
      return { ok: false, error: 'Produto não encontrado ou inativo.' }
    }
    if (row.erro === 'quantidade_invalida') {
      return { ok: false, error: 'Quantidade inválida.' }
    }

    const precoNum = typeof row.preco === 'string' ? Number(row.preco) : row.preco
    if (precoNum == null || !Number.isFinite(precoNum) || precoNum < 0) {
      return { ok: false, error: 'Resposta de preço inválida do servidor.' }
    }

    const tipo = row.tipo === 'ATACADO' ? 'ATACADO' : 'VAREJO'
    return { ok: true, preco: Math.round(precoNum * 100) / 100, tipo }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível calcular o preço do produto.', await idiomaOperadorParaErro()),
    }
  }
}
