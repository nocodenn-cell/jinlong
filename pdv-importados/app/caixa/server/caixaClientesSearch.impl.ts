import { createClient } from '@/lib/supabase/server'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

export type ClienteCaixaRow = {
  id: string
  nome: string
  documento: string | null
}

/**
 * Busca somente-leitura de clientes da loja do operador (Fase 5b / BA-001).
 * Não usa assertGerente — PDV precisa selecionar cliente sem CRUD.
 */
export async function buscarClientesCaixaImpl(
  termo: string,
): Promise<
  | { ok: true; clientes: ClienteCaixaRow[] }
  | { ok: false; error: string }
> {
  const q = termo.trim()
  if (q.length < 2) {
    return { ok: false, error: 'Informe ao menos 2 caracteres para buscar.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const safe = q.replace(/[%_,]/g, ' ').trim()

    const { data, error } = await supabase
      .from('clientes')
      .select('id,nome,documento')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .or(`nome.ilike.%${safe}%,documento.ilike.%${safe}%`)
      .order('nome', { ascending: true })
      .limit(20)

    if (error) return { ok: false, error: error.message }
    return {
      ok: true,
      clientes: (data ?? []).map((c) => ({
        id: String(c.id),
        nome: String(c.nome),
        documento: c.documento ? String(c.documento) : null,
      })),
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Falha ao buscar clientes.',
    }
  }
}
