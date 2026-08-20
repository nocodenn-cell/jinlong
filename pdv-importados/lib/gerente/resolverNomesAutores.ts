import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve nomes de autores (`usuarios.id` → `usuarios.nome`) para telas de
 * auditoria, distinguindo três estados que antes colapsavam em um só.
 *
 * HISTÓRICO: a primeira versão usava `createAdminClient()` (service_role) para
 * escapar da RLS `gerente_select_mesma_loja` — a justificativa era que um autor
 * de outra loja apareceria como "usuário removido". Isso foi revertido: usar
 * service_role para contornar a única RLS de tenant que de fato funciona
 * amplia a exposição em vez de reduzi-la, e o problema real era a UI afirmar
 * "removido" para qualquer nome não resolvido. Agora o client de sessão é
 * usado (RLS respeitada) e o estado ambíguo é reportado como tal.
 *
 * Os três estados:
 *   - id não consta no retorno e a consulta teve sucesso → autor removido de
 *     `usuarios` (o `ON DELETE SET NULL` das FKs cobre auth.users, mas a linha
 *     em `usuarios` pode ter sumido antes) OU está fora do alcance da RLS;
 *   - consulta falhou (`error`) → `indisponivel: true`, nada é afirmado sobre
 *     o autor; a UI mostra "indisponível", não "removido";
 *   - id resolve → nome.
 */

export type NomesAutores = {
  nomes: Map<string, string>
  /** true quando a consulta falhou — nome ausente NÃO significa removido. */
  indisponivel: boolean
}

type UsuarioNomeRow = { id: string; nome: string | null }

export async function resolverNomesAutores(
  supabase: SupabaseClient,
  ids: readonly (string | null | undefined)[],
): Promise<NomesAutores> {
  const unicos = Array.from(new Set(ids.filter((id): id is string => id != null && id !== '')))
  const nomes = new Map<string, string>()
  if (unicos.length === 0) return { nomes, indisponivel: false }

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome')
    .in('id', unicos)
    .returns<UsuarioNomeRow[]>()

  if (error) return { nomes, indisponivel: true }

  for (const u of data ?? []) {
    if (u.nome != null) nomes.set(String(u.id), String(u.nome))
  }
  return { nomes, indisponivel: false }
}
