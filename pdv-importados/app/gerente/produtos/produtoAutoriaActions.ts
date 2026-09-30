'use server'

import type { ProdutoAutoria } from '@/lib/gerente/produtos/produtoAutoriaTypes'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { assertProdutoDaLojaSessao } from '@/lib/gerente/assertProdutoDaLojaSessao'
import { resolverNomesAutores } from '@/lib/gerente/resolverNomesAutores'
import { mensagemErroComSecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

/**
 * Leitura de autoria do produto (`criado_por`/`atualizado_por`, migração
 * "produtos_autoria_criado_atualizado_por"). Cast pontual — essas colunas
 * ainda não estão no Database tipado gerado (mesmo padrão já usado em
 * `criarProdutoComEstoqueInicialRpc.ts` para a RPC 270/289).
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type { ProdutoAutoria }

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

  // Tenant gate ANTES de qualquer leitura: a RLS de `produtos` não tem
  // predicado de loja (gap conhecido — ver assertProdutoDaLojaSessao), então
  // sem isto um UUID de produto de outra loja retornaria autoria válida.
  const tenant = await assertProdutoDaLojaSessao(supabase, produtoId, {
    lojaId: auth.session.lojaId,
    perfil: auth.session.perfil,
  })
  if (!tenant.ok) return { success: false, error: tenant.error }

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
    return {
      success: true,
      data: {
        criadoPorNome: null,
        criadoEm: null,
        criadoPorIndisponivel: false,
        atualizadoPorNome: null,
        atualizadoEm: null,
        atualizadoPorIndisponivel: false,
      },
    }
  }

  // Client de sessão (RLS respeitada). `indisponivel` separa "a consulta
  // falhou" de "não há autor" — sem isso a UI afirma "usuário removido" para
  // uma indisponibilidade momentânea.
  const { nomes, indisponivel } = await resolverNomesAutores(supabase, [
    data.criado_por,
    data.atualizado_por,
  ])

  return {
    success: true,
    data: {
      criadoPorNome: data.criado_por ? (nomes.get(data.criado_por) ?? null) : null,
      criadoEm: data.created_at,
      criadoPorIndisponivel: data.criado_por != null && indisponivel,
      atualizadoPorNome: data.atualizado_por ? (nomes.get(data.atualizado_por) ?? null) : null,
      atualizadoEm: data.updated_at,
      atualizadoPorIndisponivel: data.atualizado_por != null && indisponivel,
    },
  }
}
