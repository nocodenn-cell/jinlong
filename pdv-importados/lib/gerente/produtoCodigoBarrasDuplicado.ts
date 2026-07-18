import type { SupabaseClient } from '@supabase/supabase-js'
import type { IdiomaErro } from '@/shared/mensagemErroUsuario'

const CONSTRAINT = 'produtos_codigo_barras_loja_unique'

type PgUniqueError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

function idiomaErro(idioma?: string): IdiomaErro {
  return idioma === 'zh' ? 'zh' : 'pt'
}

export function isProdutosCodigoBarrasLojaUniqueViolation(error: PgUniqueError): boolean {
  if (error.code !== '23505') return false
  const blob = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  return blob.includes(CONSTRAINT)
}

export function formatMensagemCodigoBarrasDuplicado(
  existenteNome: string | null,
  idiomaInput?: string,
): string {
  const idioma = idiomaErro(idiomaInput)
  if (existenteNome) {
    return idioma === 'zh'
      ? `该门店已存在此条形码的商品：「${existenteNome}」。请打开该商品进行编辑。`
      : `Código de barras já cadastrado nesta loja: "${existenteNome}". Abra o produto existente para editar.`
  }
  return idioma === 'zh'
    ? '该门店已存在此条形码的商品。请在目录中搜索并打开已有商品。'
    : 'Código de barras já cadastrado nesta loja. Busque o produto existente no catálogo.'
}

export async function buscarProdutoPorCodigoBarrasLoja(
  supabase: SupabaseClient,
  codigoBarras: string,
  lojaId: string,
  excludeProdutoId?: string,
): Promise<{ id: string; nome: string } | null> {
  const codigo = codigoBarras.trim()
  if (!codigo) return null

  let query = supabase
    .from('produtos')
    .select('id, nome')
    .eq('loja_id', lojaId)
    .eq('codigo_barras', codigo)
    .limit(1)

  if (excludeProdutoId) {
    query = query.neq('id', excludeProdutoId)
  }

  const { data } = await query.maybeSingle()
  if (!data?.id || !data.nome) return null
  return { id: String(data.id), nome: String(data.nome) }
}

export async function mensagemErroCodigoBarrasDuplicado(opts: {
  supabase: SupabaseClient
  error: PgUniqueError
  codigoBarras: string | null | undefined
  lojaId: string
  excludeProdutoId?: string
  idioma?: string
}): Promise<string | null> {
  if (!isProdutosCodigoBarrasLojaUniqueViolation(opts.error)) return null

  const codigo = opts.codigoBarras?.trim() ?? ''
  const existente = codigo
    ? await buscarProdutoPorCodigoBarrasLoja(
        opts.supabase,
        codigo,
        opts.lojaId,
        opts.excludeProdutoId,
      )
    : null

  return formatMensagemCodigoBarrasDuplicado(existente?.nome ?? null, opts.idioma)
}
