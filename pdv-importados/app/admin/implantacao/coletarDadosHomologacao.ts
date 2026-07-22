/**
 * Coleta contagens da loja para P0-DADOS (I/O Supabase).
 * Falhas de query propagam — não mascarar como zero (falso gap).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DadosHomologacaoSnapshot } from './homologacaoDados'

async function countEq(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string | boolean | number>,
): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v)
  }
  const { count, error } = await q
  if (error) {
    throw new Error(`P0-DADOS: falha ao contar ${table}: ${error.message}`)
  }
  return count ?? 0
}

export async function coletarDadosHomologacao(
  supabase: SupabaseClient,
  lojaId: string,
): Promise<DadosHomologacaoSnapshot> {
  const [
    donosAtivos,
    gerentesAtivos,
    operadoresAtivos,
    categoriasProduto,
    produtosPublicados,
    clientes,
    fornecedores,
  ] = await Promise.all([
    countEq(supabase, 'usuarios', { loja_id: lojaId, perfil: 'DONO', ativo: true }),
    countEq(supabase, 'usuarios', { loja_id: lojaId, perfil: 'GERENTE', ativo: true }),
    countEq(supabase, 'usuarios', { loja_id: lojaId, perfil: 'OPERADOR', ativo: true }),
    countEq(supabase, 'categorias', { ativo: true }),
    countEq(supabase, 'produtos', {
      loja_id: lojaId,
      status_publicacao: 'PUBLICADO',
    }),
    countEq(supabase, 'clientes', { loja_id: lojaId }),
    countEq(supabase, 'fornecedores', { loja_id: lojaId }),
  ])

  const { count: estoqueCount, error: estoqueErr } = await supabase
    .from('estoque')
    .select('id', { count: 'exact', head: true })
    .eq('loja_id', lojaId)
    .gt('quantidade_atual', 0)

  if (estoqueErr) {
    throw new Error(`P0-DADOS: falha ao contar estoque: ${estoqueErr.message}`)
  }

  const { data: pdv, error: pdvErr } = await supabase
    .from('pdv_config')
    .select('loja_id')
    .eq('loja_id', lojaId)
    .maybeSingle()

  if (pdvErr) {
    throw new Error(`P0-DADOS: falha ao ler pdv_config: ${pdvErr.message}`)
  }

  const { data: loja, error: lojaErr } = await supabase
    .from('lojas')
    .select('id, nome')
    .eq('id', lojaId)
    .maybeSingle()

  if (lojaErr) {
    throw new Error(`P0-DADOS: falha ao ler loja: ${lojaErr.message}`)
  }

  return {
    donosAtivos,
    gerentesAtivos,
    operadoresAtivos,
    categoriasProduto,
    produtosPublicados,
    produtosComEstoque: estoqueCount ?? 0,
    clientes,
    fornecedores,
    temPdvConfig: Boolean(pdv?.loja_id),
    formasPagamentoOk: true,
    impostosMinimosOk: Boolean(loja?.id && loja.nome),
  }
}
