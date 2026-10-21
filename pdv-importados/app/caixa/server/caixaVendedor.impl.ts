import { createClient } from '@/lib/supabase/server'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { captureMessage } from '@/lib/sentry/vendaSentry'

export type VendedorCaixa = { id: string; nome: string }

/**
 * Vendedores da loja do operador para o seletor "Vendedor / 销售员".
 * Banco sem a migration 20261021200000 => lista vazia (o seletor some e a venda segue com o operador).
 */
export async function listarVendedoresCaixaImpl(): Promise<{ ok: true; vendedores: VendedorCaixa[] } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'SESSAO_EXPIRADA' }
    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const { data, error } = await supabase.rpc('listar_vendedores_loja', { p_loja_id: lojaId })
    if (error) return { ok: true, vendedores: [] }
    const vendedores = ((data ?? []) as Array<{ id: string | null; nome: string | null }>)
      .filter((v): v is { id: string; nome: string } => typeof v.id === 'string')
      .map((v) => ({ id: v.id, nome: v.nome ?? '—' }))
    return { ok: true, vendedores }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Grava o vendedor DEPOIS da venda concluída (a RPC canônica v4 não muda).
 * Falha aqui nunca desfaz a venda: a comissão fica com o operador e o gerente pode corrigir.
 */
export async function definirVendedorVendaCaixaImpl(vendaId: string, vendedorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('definir_vendedor_venda', { p_venda_id: vendaId, p_vendedor_id: vendedorId })
    if (error) {
      captureMessage('[caixa.vendedor.nao_aplicado]', { level: 'warning', extra: { vendaId, vendedorId, error: error.message } })
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
