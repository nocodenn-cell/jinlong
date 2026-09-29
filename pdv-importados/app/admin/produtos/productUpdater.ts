/**
 * Adapter ProductUpdater — Missão Products 6 / ADR-007.
 * Atualiza só catálogo (`produtos`). Sem estoque, sem movimentos, sem RPC 270.
 * Validação: shared-core codes; mensagem PT via productMessages (borda).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProductReader,
  ProductUpdater,
  UpdateCategoriaLoteCommand,
  UpdateCategoriaLoteResult,
  UpdateProductCommand,
  UpdateProductInput,
  UpdateProductResult,
} from '@shared-core/src/products'
import {
  PRODUCT_ERROR_CODES,
  validateUpdateProductCommand,
} from '@shared-core/src/products'
import { dualWriteFromStatus } from '@/core/catalog/statusPublicacao'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  buscarProdutoPorCodigoBarrasLoja,
  formatMensagemCodigoBarrasDuplicado,
  isProdutosCodigoBarrasLojaUniqueViolation,
} from '@/lib/gerente/produtoCodigoBarrasDuplicado'
import { createProductReader } from '@/app/admin/produtos/productReader'
import { resolveProductMessage } from '@/app/admin/produtos/productMessages'

/** @deprecated Preferir PRODUCT_ERROR_CODES + productMessages. */
export const MSG_UPDATE_SEM_ID = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID,
)
export const MSG_NOME_MIN = resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NAME_INVALID)
export const MSG_PRECO_VAREJO = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE,
)
export const MSG_CODIGO_BARRAS_MIN = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.BARCODE_TOO_SHORT,
)
export const MSG_PRECO_ATACADO = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.ATACADO_INVALID,
)
export const MSG_SAVE_FAIL = resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.SAVE_FAILED)

export type ProdutoUpdatePayload = {
  nome: string
  codigo_barras: string | null
  codigo_interno: string | null
  referencia_fornecedor: string | null
  nome_reduzido_pdv: string | null
  localizacao_prateleira: string | null
  preco_varejo: number
  preco_atacado?: number | null
  preco_custo: number | null
  permitir_abaixo_custo: boolean
  quantidade_gatilho_atacado?: number | null
  origem?: string
  tem_nf?: boolean
  unidade_medida: string
  observacao: string | null
  categoria_id: string | null
  marca_id: string | null
  fornecedor_id: string | null
  ncm: string | null
  cfop_produto: string | null
  csosn: string | null
  cest: string | null
  cst_pis: string | null
  cst_cofins: string | null
  icms_origem: string | null
  status_publicacao?: string
  ativo?: boolean
}

export type UpdateProdutoRowFn = (args: {
  id: string
  lojaId: string
  payload: ProdutoUpdatePayload
}) => Promise<{ error: { message: string; code?: string; details?: string } | null }>

export type ProductUpdaterDeps = {
  reader: Pick<ProductReader, 'getById'>
  updateRow: UpdateProdutoRowFn
}

/** Mapeia input de domínio → colunas de `produtos` (catálogo apenas). */
export function mapUpdateProductInputToRow(input: UpdateProductInput): ProdutoUpdatePayload {
  const row: ProdutoUpdatePayload = {
    nome: (input.nome ?? '').trim(),
    codigo_barras: input.codigoBarras?.trim() || null,
    codigo_interno: input.codigoInterno?.trim() || null,
    referencia_fornecedor: input.referenciaFornecedor?.trim() || null,
    nome_reduzido_pdv: input.nomeReduzidoPdv?.trim() || null,
    localizacao_prateleira: input.localizacaoPrateleira?.trim() || null,
    preco_varejo: Number(input.precoVarejo),
    preco_custo:
      input.precoCusto !== undefined && input.precoCusto !== null
        ? Number(input.precoCusto)
        : null,
    permitir_abaixo_custo: input.permitirAbaixoCusto ?? false,
    unidade_medida: input.unidadeMedida ?? 'UN',
    observacao: input.observacao?.trim() || null,
    categoria_id: input.categoriaId ?? null,
    marca_id: input.marcaId ?? null,
    fornecedor_id: input.fornecedorId ?? null,
    ncm: input.ncm ?? null,
    cfop_produto: input.cfopProduto ?? null,
    csosn: input.csosn ?? null,
    cest: input.cest ?? null,
    cst_pis: input.cstPis ?? null,
    cst_cofins: input.cstCofins ?? null,
    icms_origem: input.icmsOrigem ?? null,
  }

  // Atacado: chave AUSENTE = "não mexe". Só entram no payload quando o chamador
  // informou (mesmo que `null`, que significa "limpar" de propósito). Sem isto,
  // toda edição que não fala de atacado mandaria `null` e a RPC leria como
  // remoção do par (e desativaria a faixa do catálogo).
  if (input.precoAtacado !== undefined) {
    row.preco_atacado = input.precoAtacado === null ? null : Number(input.precoAtacado)
  }
  if (input.quantidadeGatilhoAtacado !== undefined) {
    row.quantidade_gatilho_atacado = input.quantidadeGatilhoAtacado ?? null
  }

  if (input.origem) row.origem = input.origem
  if (input.temNf !== undefined) row.tem_nf = input.temNf

  if (input.statusPublicacao) {
    const lifecycle = dualWriteFromStatus(input.statusPublicacao)
    row.status_publicacao = lifecycle.status_publicacao
    row.ativo = lifecycle.ativo
  }

  return row
}

async function mapUpdateDbError(
  error: {
    message: string
    code?: string
    details?: string
  },
  ctx: { supabase: SupabaseClient; codigoBarras: string | null; lojaId: string; produtoId: string },
): Promise<{ error: string; code?: (typeof PRODUCT_ERROR_CODES)[keyof typeof PRODUCT_ERROR_CODES] }> {
  // A RPC transacional normaliza a unique violation em um token próprio antes
  // de propagar, então o 23505 cru não chega mais aqui no caminho de edição —
  // ambas as formas são aceitas (a crua ainda ocorre em escritas diretas).
  const rpcDuplicado = error.message?.includes('ATUALIZAR_PRODUTO_CODIGO_BARRAS_DUPLICADO')
  // Produto de outra loja (ou inexistente): a RPC devolve a MESMA mensagem nos
  // dois casos, de propósito — não confirma existência fora do escopo.
  if (error.message?.includes('ATUALIZAR_PRODUTO_NAO_ENCONTRADO')) {
    return {
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND),
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
    }
  }
  if (rpcDuplicado || isProdutosCodigoBarrasLojaUniqueViolation(error)) {
    // Best-effort: achar o nome do produto conflitante só enriquece a
    // mensagem. Se a busca falhar por qualquer motivo, cai na mensagem
    // genérica em vez de derrubar a resposta inteira do update.
    let nomeExistente: string | null = null
    if (ctx.codigoBarras) {
      try {
        const existente = await buscarProdutoPorCodigoBarrasLoja(
          ctx.supabase,
          ctx.codigoBarras,
          ctx.lojaId,
          ctx.produtoId,
        )
        nomeExistente = existente?.nome ?? null
      } catch {
        nomeExistente = null
      }
    }
    return {
      error: formatMensagemCodigoBarrasDuplicado(nomeExistente),
      code: PRODUCT_ERROR_CODES.BARCODE_DUPLICATE,
    }
  }
  return { error: mensagemErroComSecao('Produto', error.message) }
}

/**
 * Faixa de atacado implícita no payload do produto: quando preço de atacado e
 * quantidade-gatilho vêm preenchidos juntos, `precos_atacado` precisa refletir
 * exatamente esse par — é ele que a RPC `calcular_preco_produto` consulta na
 * venda. Derivar aqui (em vez de receber como parâmetro separado) mantém a
 * assinatura de `UpdateProductCommand` intacta.
 *
 * Tipo do parâmetro é estrutural (só os 2 campos usados), de propósito —
 * também reusado pelo CREATE (Onda 2 · Bloco 4, `criarProdutoComEstoqueInicialRpc.ts`)
 * sem precisar satisfazer o resto de `ProdutoUpdatePayload`. Mesma regra,
 * uma fonte só — SSOT do "o que conta como faixa derivada do catálogo".
 */
export function derivarFaixaAtacado(
  payload: Pick<ProdutoUpdatePayload, 'preco_atacado' | 'quantidade_gatilho_atacado'>,
): { quantidade_minima: number; preco_unitario: number } | null {
  const preco = payload.preco_atacado
  const gatilho = payload.quantidade_gatilho_atacado
  if (preco == null || preco <= 0) return null
  if (gatilho == null || gatilho <= 0) return null
  return { quantidade_minima: gatilho, preco_unitario: preco }
}

/**
 * A RPC não existe no banco (ainda não promovida, ou rollback da migration).
 * PostgREST devolve `PGRST202` quando não acha a função no schema cache;
 * o Postgres devolve `42883` (undefined_function) quando a chamada chega ao
 * banco. Qualquer um dos dois significa "banco antigo", não "erro de dados".
 */
function rpcAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const msg = error.message ?? ''
  return (
    msg.includes('atualizar_produto_com_faixa_atacado') &&
    (msg.includes('does not exist') || msg.includes('Could not find the function'))
  )
}

/**
 * Atualização de produto com a faixa de atacado, via RPC transacional.
 *
 * BANCO SEM A RPC: NÃO existe fallback que escreva. A versão anterior tentava
 * emular a RPC com `UPDATE produtos` seguido da sincronização da faixa e, se a
 * segunda etapa falhasse, devolvia erro — mas a alteração do produto JÁ ESTAVA
 * PERSISTIDA. Teste real contra o banco (não mock) mostrou o produto com
 * gatilho 20 e a faixa ativa ainda em 10: exatamente o estado parcial que esta
 * entrega existe para eliminar. Devolver erro não desfaz escrita.
 *
 * Sem transação — e o PostgREST não oferece uma para múltiplas instruções — a
 * única forma de garantir "ou tudo, ou nada" contra um banco antigo é NÃO
 * ESCREVER. Então:
 *
 *   - edição que NÃO altera o par de atacado → `UPDATE produtos` direto é uma
 *     única instrução, atômica por si, e segue permitida;
 *   - edição que ALTERA `preco_atacado` ou `quantidade_gatilho_atacado` →
 *     recusada, com mensagem explícita, sem gravar nada.
 *
 * SEQUENCIAMENTO APP ↔ BANCO: isto refuta a afirmação anterior de que qualquer
 * ordem serviria. A ordem correta é BANCO PRIMEIRO. Publicar o app antes não
 * corrompe dado algum, mas bloqueia a edição de preço de atacado até a
 * migration entrar. Ver `docs/PROMOCAO_PRODUTOS_HARDENING.md` §3.
 */
export const MSG_ATACADO_REQUER_MIGRATION =
  'A edição de preço/quantidade de atacado está indisponível: o banco ainda não recebeu a atualização desta versão. ' +
  'As demais alterações do produto continuam funcionando. Tente novamente após a migração do banco.'

/** O par (preço, gatilho) do catálogo — a invariante que a RPC protege. */
function parAtacado(p: {
  preco_atacado?: number | null
  quantidade_gatilho_atacado?: number | null
}) {
  return {
    preco: p.preco_atacado ?? null,
    gatilho: p.quantidade_gatilho_atacado ?? null,
  }
}

function defaultUpdateRow(supabase: SupabaseClient): UpdateProdutoRowFn {
  return async ({ id, lojaId, payload }) => {
    const { data: atual, error: erroLeitura } = await supabase
      .from('produtos')
      .select('preco_atacado, quantidade_gatilho_atacado')
      .eq('id', id)
      .eq('loja_id', lojaId)
      .maybeSingle()
    if (erroLeitura) return { error: erroLeitura }

    const antes = parAtacado(atual ?? {})
    const depois = parAtacado(payload)
    // Payload sem NENHUMA das duas chaves = o chamador não falou de atacado:
    // não é mudança (comparar com `null` a leria como remoção).
    const falouDeAtacado =
      'preco_atacado' in payload || 'quantidade_gatilho_atacado' in payload
    const mudaAtacado =
      falouDeAtacado && (antes.preco !== depois.preco || antes.gatilho !== depois.gatilho)
    const payloadRpc = { ...payload }
    if (!mudaAtacado) {
      // Reenvio do catálogo não deve recriar nem inativar faixas do editor.
      delete payloadRpc.preco_atacado
      delete payloadRpc.quantidade_gatilho_atacado
    }
    const { error } = await supabase.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: id,
      p_payload: payloadRpc,
      // `p_ator_id` NÃO é enviado: este é o client de sessão, então a RPC
      // resolve o ator por `auth.uid()`. Enviar `null` explicitamente divergia
      // do tipo gerado (que aceita ausente ou string) sem que o typecheck
      // pudesse acusar, porque o client é genérico.
      p_faixa: derivarFaixaAtacado(payloadRpc),
    })

    if (!rpcAusente(error)) return { error }

    // ── Banco ainda sem a RPC ────────────────────────────────────────────────
    // Só recusa se o par de atacado for REALMENTE mudar. Comparar com o valor
    // atual (em vez de olhar só a presença das chaves) evita bloquear edições
    // que apenas reenviam o mesmo atacado — o formulário sempre manda o estado
    // completo, então as chaves estão sempre presentes.
    if (mudaAtacado) {
      // Recusa ANTES de qualquer escrita: nada é persistido, logo não há
      // estado parcial possível.
      return { error: { message: MSG_ATACADO_REQUER_MIGRATION, code: 'ATACADO_REQUER_MIGRATION' } }
    }

    // Instrução única — atômica por si.
    const { error: erroDireto } = await supabase
      .from('produtos')
      .update(payloadRpc)
      .eq('id', id)
      .eq('loja_id', lojaId)
    return { error: erroDireto }
  }
}

function defaultDeps(supabase: SupabaseClient): ProductUpdaterDeps {
  return {
    reader: createProductReader(supabase),
    updateRow: defaultUpdateRow(supabase),
  }
}

async function updateCatalog(
  command: UpdateProductCommand,
  deps: ProductUpdaterDeps,
  supabase: SupabaseClient,
): Promise<UpdateProductResult> {
  const existing = await deps.reader.getById(command.id)
  if (!existing.ok) {
    return {
      ok: false,
      error: existing.notFound
        ? resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND)
        : existing.error,
      code: existing.notFound ? PRODUCT_ERROR_CODES.NOT_FOUND : undefined,
      notFound: existing.notFound,
    }
  }
  if (existing.product.lojaId !== command.lojaId) {
    return {
      ok: false,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND),
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
      notFound: true,
    }
  }

  const { error } = await deps.updateRow({
    id: command.id,
    lojaId: command.lojaId,
    payload: mapUpdateProductInputToRow(command.input),
  })
  if (error) {
    const mapped = await mapUpdateDbError(error, {
      supabase,
      codigoBarras: command.input.codigoBarras ?? null,
      lojaId: command.lojaId,
      produtoId: command.id,
    })
    return { ok: false, error: mapped.error, code: mapped.code }
  }

  const reload = await deps.reader.getById(command.id)
  if (!reload.ok) return { ok: false, error: reload.error }
  return { ok: true, product: reload.product }
}

async function updateCategoriaLoteRows(
  supabase: SupabaseClient,
  command: UpdateCategoriaLoteCommand,
): Promise<UpdateCategoriaLoteResult> {
  const { data, error } = await supabase
    .from('produtos')
    .update({ categoria_id: command.categoriaId })
    .in('id', command.ids)
    .eq('loja_id', command.lojaId)
    .select('id')
  if (error) {
    return {
      ok: false,
      error: PRODUCT_ERROR_CODES.SAVE_FAILED,
      code: PRODUCT_ERROR_CODES.SAVE_FAILED,
    }
  }
  const rows = data as { id: string }[] | null
  return { ok: true, atualizados: rows?.length ?? 0 }
}

/**
 * Factory ProductUpdater — UPDATE catálogo + reload ProductReader.
 */
export function createProductUpdater(
  supabase: SupabaseClient,
  deps?: Partial<ProductUpdaterDeps>,
): ProductUpdater {
  const resolved = { ...defaultDeps(supabase), ...deps }

  return {
    async update(command: UpdateProductCommand): Promise<UpdateProductResult> {
      const validation = validateUpdateProductCommand(command)
      if (!validation.ok) {
        return {
          ok: false,
          code: validation.code,
          error: resolveProductMessage('pt-BR', validation.code),
        }
      }
      try {
        return await updateCatalog(command, resolved, supabase)
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : MSG_SAVE_FAIL,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },

    async updateCategoriaLote(
      command: UpdateCategoriaLoteCommand,
    ): Promise<UpdateCategoriaLoteResult> {
      try {
        return await updateCategoriaLoteRows(supabase, command)
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.SAVE_FAILED,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },
  }
}

/** Reexport para testes que ainda importam validate do adapter. */
export { validateUpdateProductCommand }
