import type { SupabaseClient } from '@supabase/supabase-js'
import type { PerfilUsuario } from '@/idioma/normalizePerfilUsuario'

/**
 * Autorização de tenant produto→loja, na camada de aplicação.
 *
 * POR QUE NA APLICAÇÃO E NÃO NA RLS: hoje `produtos_leitura` usa
 * `auth.role() = 'authenticated'` e `produtos_escrita` só checa perfil —
 * nenhuma das duas tem predicado de loja. Isso é um gap conhecido e
 * documentado (`docs/AUTHORIZATION_MATRIX.md`, linha `produtos`: "avaliar
 * hardening multi-loja futuro"; `docs/RLS_POLICY_DIAGNOSTIC.md` item 3), e o
 * plano executivo o classifica como backlog que "exige decisão de produto".
 * Mudar a cardinalidade da RLS altera o comportamento de PDV, catálogo,
 * relatórios e transferências de uma vez só — fora do escopo desta sprint.
 *
 * Este guard fecha a superfície nova (as actions de autoria e histórico de
 * preços criadas nesta sprint) sem tocar na RLS: um `produtoId` de outra loja
 * passa a ser recusado antes de qualquer leitura. Não substitui o hardening
 * de RLS — quem falar direto com o PostgREST continua alcançando a tabela.
 *
 * SEMÂNTICA: alinhada à função `auth_usuario_gerencial_loja(p_loja_id)` que já
 * existe no banco e é usada pela RLS de `usuarios` — ADMIN é global, os demais
 * perfis ficam restritos à própria loja. Mantido igual de propósito: quando a
 * RLS de `produtos` for endurecida, as duas camadas concordam sem
 * reinterpretação. (DONO tem "visão macro" documentada em vendas/estoque/
 * caixas, mas não há regra equivalente para `produtos`; na dúvida, restringe.)
 */

export type ProdutoTenantResult = { ok: true } | { ok: false; error: string }

export const MSG_PRODUTO_FORA_DA_LOJA = 'Produto não encontrado nesta loja.'
export const MSG_PRODUTO_SEM_LOJA_SESSAO = 'Não foi possível identificar a loja da sessão.'

type ProdutoLojaRow = { loja_id: string | null }

export async function assertProdutoDaLojaSessao(
  supabase: SupabaseClient,
  produtoId: string,
  session: { lojaId: string | null; perfil: PerfilUsuario },
): Promise<ProdutoTenantResult> {
  // ADMIN é o único perfil global (espelha auth_usuario_gerencial_loja).
  if (session.perfil === 'ADMIN') return { ok: true }

  if (!session.lojaId) return { ok: false, error: MSG_PRODUTO_SEM_LOJA_SESSAO }

  const { data, error } = await supabase
    .from('produtos')
    .select('loja_id')
    .eq('id', produtoId)
    .maybeSingle<ProdutoLojaRow>()

  // Erro de infraestrutura NÃO vira "autorizado". Falha fechada.
  if (error) return { ok: false, error: MSG_PRODUTO_FORA_DA_LOJA }

  // Mesma mensagem para "não existe" e "existe em outra loja": não confirmar
  // a existência de um produto que o solicitante não pode ver (evita usar a
  // própria mensagem de erro como oráculo de enumeração).
  if (!data || data.loja_id !== session.lojaId) {
    return { ok: false, error: MSG_PRODUTO_FORA_DA_LOJA }
  }

  return { ok: true }
}
