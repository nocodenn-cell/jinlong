'use server'

import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { periodoInicio } from '@/lib/admin/periodo'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import type { PeriodoMovimentacao } from './movimentacoesFiltros'

export type MovimentoLinha = { evento_id: string; ocorrido_em: string; tipo_codigo: string; quantidade_delta: number; observacao: string | null; produto_id: string; produto_nome: string }

export async function listarMovimentacoesEstoque(
  busca = '',
  sentido = '',
  pagina = 1,
  periodo: PeriodoMovimentacao = 'tudo',
) {
  const { session } = await loadAdminContext({ pathname: ROUTES.admin.estoque, resource: `route:${ROUTES.admin.estoque}` })
  if (!session.lojaId) throw new Error('Loja não identificada.')
  const db = await createClient()
  const filtro = busca.replace(/[,()%_\\]/g, ' ').trim().slice(0, 100)
  const produtos = filtro ? await db.from('produtos').select('id,nome', { count: 'exact' }).eq('loja_id', session.lojaId).or(`nome.ilike.%${filtro}%,codigo_barras.ilike.%${filtro}%`).limit(500) : null
  if (produtos?.error) throw new Error(produtos.error.message)
  if ((produtos?.count ?? 0) > 500) throw new Error(session.idioma === 'pt' ? 'Busca muito ampla. Informe mais caracteres.' : '搜索范围过大，请输入更多字符。')
  if (produtos && produtos.data?.length === 0) return { total: 0, rows: [] as MovimentoLinha[] }
  let query = db.from('v_kardex_unificado').select('evento_id,ocorrido_em,tipo_codigo,quantidade_delta,observacao,produto_id', { count: 'exact' }).eq('loja_id', session.lojaId)
  if (produtos) query = query.in('produto_id', (produtos.data ?? []).map((item) => item.id))
  if (sentido === 'entrada') query = query.gt('quantidade_delta', 0)
  if (sentido === 'saida') query = query.lt('quantidade_delta', 0)
  // Preset de período: recorte de leitura no fuso da loja (mesma regra de Vendas). "tudo" não recorta.
  if (periodo !== 'tudo') {
    const inicio = periodoInicio(periodo, new Date(), await getRelatorioTimezone(db))
    if (inicio) query = query.gte('ocorrido_em', inicio)
  }
  const page = Number.isFinite(pagina) ? Math.max(1, Math.floor(pagina)) : 1
  const result = await query.order('ocorrido_em', { ascending: false }).order('evento_id', { ascending: false }).range((page - 1) * 50, page * 50 - 1)
  if (result.error) throw new Error(result.error.message)
  const ids = [...new Set((result.data ?? []).map((row) => row.produto_id))]
  const nomes = ids.length ? await db.from('produtos').select('id,nome').eq('loja_id', session.lojaId).in('id', ids) : null
  if (nomes?.error) throw new Error(nomes.error.message)
  const map = new Map((nomes?.data ?? []).map((item) => [item.id, item.nome]))
  return { total: result.count ?? 0, rows: (result.data ?? []).map((row) => ({ ...row, quantidade_delta: Number(row.quantidade_delta), produto_nome: map.get(row.produto_id) ?? '—' })) as MovimentoLinha[] }
}
