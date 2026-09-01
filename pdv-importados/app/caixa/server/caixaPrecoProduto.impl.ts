import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'
import type { CalcularPrecoProdutoCaixaResult } from '@/app/caixa/caixaActionTypes'
import { quantidadeParaRpcPreco } from '@/lib/format/quantidadeCaixa'

type RpcRow = {
  preco: number | string | null
  tipo: string | null
  quantidade_minima?: number | string | null
  erro?: string | null
}

export async function calcularPrecoProdutoCaixaImpl(input: {
  produtoId: string
  quantidade: number
  lojaId?: string | null
}): Promise<CalcularPrecoProdutoCaixaResult> {
  try {
    const { userId, lojaId: lojaUsuario, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    const supabase = await createClient()

    const q = quantidadeParaRpcPreco(input.quantidade)
    if (q < 1) {
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_qtd_invalida') }
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
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_produto_inativo') }
    }
    if (row.erro === 'quantidade_invalida') {
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_qtd_invalida') }
    }

    const precoNum = typeof row.preco === 'string' ? Number(row.preco) : row.preco
    if (precoNum == null || !Number.isFinite(precoNum) || precoNum < 0) {
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_preco_resposta_invalida') }
    }

    const tipo = row.tipo === 'ATACADO' ? 'ATACADO' : 'VAREJO'
    const qtdMinNum =
      typeof row.quantidade_minima === 'string' ? Number(row.quantidade_minima) : row.quantidade_minima
    const quantidadeMinima =
      tipo === 'ATACADO' && qtdMinNum != null && Number.isFinite(qtdMinNum) ? qtdMinNum : null
    return { ok: true, preco: Math.round(precoNum * 100) / 100, tipo, quantidadeMinima }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_calcular_preco'), await idiomaOperadorParaErro()),
    }
  }
}
