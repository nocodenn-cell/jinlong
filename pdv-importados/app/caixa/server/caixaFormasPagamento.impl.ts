import { createClient } from '@/lib/supabase/server'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

export type FormaPagamentoCaixaRow = {
  codigo: string
  nome: string
}

/**
 * F1-05: lista as formas de pagamento ativas da loja do operador, direto do
 * cadastro (`formas_pagamento`) que agora é a autoridade de validação em
 * finalizar_venda_transacional_canonica_v4 — não mais um enum fixo no código.
 */
export async function listarFormasPagamentoCaixaImpl(): Promise<
  | { ok: true; formas: FormaPagamentoCaixaRow[] }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const { data, error } = await supabase
      .from('formas_pagamento')
      .select('codigo,nome')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .order('created_at', { ascending: true })

    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      formas: (data ?? []).map((f) => ({
        codigo: String(f.codigo),
        nome: String(f.nome),
      })),
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Falha ao carregar formas de pagamento.',
    }
  }
}
