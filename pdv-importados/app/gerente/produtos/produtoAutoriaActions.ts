'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

/**
 * Leitura de autoria do produto (`criado_por`/`atualizado_por`, migração
 * "produtos_autoria_criado_atualizado_por"). Cast pontual — essas colunas
 * ainda não estão no Database tipado gerado (mesmo padrão já usado em
 * `criarProdutoComEstoqueInicialRpc.ts` para a RPC 270/289).
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type ProdutoAutoria = {
  criadoPorNome: string | null
  criadoEm: string | null
  atualizadoPorNome: string | null
  atualizadoEm: string | null
}

const SECAO = 'Autoria do produto'

type ProdutoAutoriaRow = {
  criado_por: string | null
  atualizado_por: string | null
  created_at: string | null
  updated_at: string | null
}

export async function obterAutoriaProduto(produtoId: string): Promise<ActionResult<ProdutoAutoria>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const idValido = z.string().uuid().safeParse(produtoId)
  if (!idValido.success) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod('ID do produto inválido.', idioma) }
  }

  const supabase = await createClient()
  const { data, error } = await (
    supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => {
            maybeSingle: () => Promise<{ data: ProdutoAutoriaRow | null; error: { message: string } | null }>
          }
        }
      }
    }
  )
    .from('produtos')
    .select('criado_por, atualizado_por, created_at, updated_at')
    .eq('id', produtoId)
    .maybeSingle()

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroComSecao(SECAO, error.message, idioma) }
  }
  if (!data) {
    return { success: true, data: { criadoPorNome: null, criadoEm: null, atualizadoPorNome: null, atualizadoEm: null } }
  }

  const ids = Array.from(
    new Set([data.criado_por, data.atualizado_por].filter((id): id is string => id != null)),
  )
  const nome = new Map<string, string>()
  if (ids.length > 0) {
    // Client admin só para este lookup: a RLS de `usuarios` restringe leitura
    // a "mesma loja" (GERENTE) — um produto pode ter sido criado/editado por
    // alguém de outra loja (a escrita em `produtos` não é RLS-scoped por
    // loja) ou por alguém depois REALOCADO de loja. Com o client de sessão,
    // esses casos silenciosamente caem no fallback "usuário removido" — o
    // que é enganoso (o usuário existe, só não está visível pra este
    // observador). Nome de usuário aqui é baixo-sensibilidade e a tela já é
    // GERENTE/DONO/ADMIN-only (assertGerenteSession acima), então o
    // bypass é seguro. Achado em teste multi-loja no ambiente isolado
    // (2026-08-16).
    const admin = createAdminClient()
    const { data: usuarios } = await admin.from('usuarios').select('id, nome').in('id', ids)
    for (const u of usuarios ?? []) {
      if (u.nome != null) nome.set(String(u.id), String(u.nome))
    }
  }

  return {
    success: true,
    data: {
      criadoPorNome: data.criado_por ? (nome.get(data.criado_por) ?? null) : null,
      criadoEm: data.created_at,
      atualizadoPorNome: data.atualizado_por ? (nome.get(data.atualizado_por) ?? null) : null,
      atualizadoEm: data.updated_at,
    },
  }
}
