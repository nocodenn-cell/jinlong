import { createClient } from '@/lib/supabase/server'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgOperador } from '@/app/caixa/server/caixaMensagensServidor'

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
    return { ok: false, error: await caixaMsgOperador( 'err_srv_busca_cliente_min') }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: await caixaMsgOperador( 'err_srv_sessao_expirada') }

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
      error: mensagemErroDeExcecao(
        e,
        await caixaMsgOperador('err_srv_concluir'),
        await idiomaOperadorParaErro(),
      ),
    }
  }
}

/**
 * Resolve um cliente por id na loja do operador. `vendas_em_espera` guarda só
 * `cliente_id` (o vínculo autoritativo), então ao retomar uma venda o PDV precisa
 * disto para exibir o nome — sem duplicar o nome no banco.
 */
export async function obterClienteCaixaImpl(
  clienteId: string,
): Promise<
  | { ok: true; cliente: ClienteCaixaRow | null }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: await caixaMsgOperador( 'err_srv_sessao_expirada') }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const { data, error } = await supabase
      .from('clientes')
      .select('id,nome,documento')
      .eq('loja_id', lojaId)
      .eq('id', clienteId)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: true, cliente: null }
    return {
      ok: true,
      cliente: {
        id: String(data.id),
        nome: String(data.nome),
        documento: data.documento ? String(data.documento) : null,
      },
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Falha ao carregar cliente.',
    }
  }
}
