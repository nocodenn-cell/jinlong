/**
 * Adapter ProductWriter — Missão Products 5 / ADR-007.
 * Create via RPC `criar_produto_com_estoque_inicial` (mig. 270).
 * Estoque inicial = efeito inventory na mesma TX; não controla saldo contínuo.
 * Validação: shared-core codes; mensagem PT via productMessages (borda).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import type {
  CreateProductCommand,
  CreateProductInput,
  CreateProductResult,
  ProductReader,
  ProductWriter,
} from '@shared-core/src/products'
import {
  PRODUCT_ERROR_CODES,
  validateCreateProductCommand,
} from '@shared-core/src/products'
import type { CriarProdutoEstoqueInput } from '@/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc'
import {
  executarCriarProdutoComEstoqueInicial,
  mensagemErroCriarProdutoRpc,
} from '@/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc'
import { createProductReader } from '@/app/admin/produtos/productReader'
import { resolveProductMessage } from '@/app/admin/produtos/productMessages'

export type CreateProductRpcFn = typeof executarCriarProdutoComEstoqueInicial

export type ProductWriterDeps = {
  createRpc: CreateProductRpcFn
  reader: Pick<ProductReader, 'getById'>
}

/** @deprecated Preferir PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED + productMessages. */
export const MSG_RELOAD_POS_CREATE = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED,
)

/**
 * Mapeia contrato shared-core → payload legado da RPC 270.
 * Defaults de origem/tem_nf alinhados ao cadastro manual humano.
 */
export function mapCreateProductInputToRpc(input: CreateProductInput): CriarProdutoEstoqueInput {
  return {
    nome: (input.nome ?? '').trim(),
    codigo_barras: input.codigoBarras?.trim() || null,
    codigo_interno: input.codigoInterno?.trim() || null,
    referencia_fornecedor: input.referenciaFornecedor?.trim() || null,
    nome_reduzido_pdv: input.nomeReduzidoPdv?.trim() || null,
    localizacao_prateleira: input.localizacaoPrateleira?.trim() || null,
    preco_varejo: Number(input.precoVarejo),
    preco_atacado:
      input.precoAtacado !== undefined && input.precoAtacado !== null
        ? Number(input.precoAtacado)
        : null,
    preco_custo:
      input.precoCusto !== undefined && input.precoCusto !== null
        ? Number(input.precoCusto)
        : null,
    permitir_abaixo_custo: input.permitirAbaixoCusto ?? false,
    quantidade_gatilho_atacado: input.quantidadeGatilhoAtacado ?? null,
    origem: input.origem ?? 'china_manual',
    tem_nf: input.temNf ?? false,
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
    ...(input.statusPublicacao ? { status_publicacao: input.statusPublicacao } : {}),
    ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    estoque_inicial_quantidade:
      input.estoqueInicial !== undefined && input.estoqueInicial !== null
        ? Number(input.estoqueInicial)
        : 0,
    estoque_inicial_minimo:
      input.estoqueInicialMinimo !== undefined && input.estoqueInicialMinimo !== null
        ? Number(input.estoqueInicialMinimo)
        : 0,
    client_request_id: input.clientRequestId?.trim() || null,
  }
}

function defaultDeps(supabase: SupabaseClient): ProductWriterDeps {
  return {
    createRpc: executarCriarProdutoComEstoqueInicial,
    reader: createProductReader(supabase),
  }
}

function mapCreateCatchError(e: unknown): string {
  if (e instanceof Error) return mensagemErroCriarProdutoRpc(e.message)
  return resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.SAVE_FAILED)
}

/**
 * `criado_por` fica NULL na própria RPC 270/289 — ela roda como service_role,
 * sem `auth.uid()` no contexto. Preenchida aqui com um UPDATE de
 * acompanhamento pelo client de sessão (tem `auth.uid()`), usando o
 * `atorId` que a RPC já recebe. Best-effort no sentido de "não falha o
 * create por causa de um campo de auditoria" — mas a falha em si NUNCA é
 * engolida em silêncio: o Supabase JS client não lança em erro de UPDATE
 * (resolve com `{ error }` no corpo), então só o try/catch original não
 * pegava nada — uma RLS negando ou um erro de constraint sumia sem rastro.
 * Cast pontual — `criado_por` ainda não está no Database tipado gerado
 * (mesmo motivo do cast em `criarProdutoComEstoqueInicialRpc.ts`).
 */
/**
 * Referência anônima e estável de um identificador, para telemetria.
 *
 * O Sentry recebia `produto_id` e `atorId` crus. Nenhum dos dois é necessário
 * para diagnosticar: o que se precisa é correlacionar eventos do MESMO produto
 * ou do MESMO ator, e um prefixo de hash faz isso sem exportar o identificador
 * real para um fornecedor terceiro. Não é reversível e não colide na prática
 * para o volume desta base.
 */
export function refAnonima(id: string | null | undefined): string {
  if (!id) return 'nulo'
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  }
  return `r${(h >>> 0).toString(36)}`
}

/**
 * Só códigos de erro conhecidos do Postgres/PostgREST passam. A mensagem crua
 * do banco ia inteira para o Sentry e pode carregar nome de constraint, trecho
 * de linha e detalhe de schema — informação interna que não ajuda no
 * diagnóstico além do que o código já diz.
 */
const CODIGOS_ERRO_PERMITIDOS = new Set([
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '23502', // not_null_violation
  '23514', // check_violation
  '42501', // insufficient_privilege (RLS)
  '42P01', // undefined_table
  '42883', // undefined_function
  'PGRST202', // função ausente no schema cache
  '57014', // query_canceled
  '08006', // connection_failure
])

export function codigoErroPermitido(codigo: string | null | undefined): string {
  if (!codigo) return 'desconhecido'
  return CODIGOS_ERRO_PERMITIDOS.has(codigo) ? codigo : 'nao_catalogado'
}

async function registrarCriadoPor(
  supabase: SupabaseClient,
  produtoId: string,
  atorId: string,
): Promise<void> {
  try {
    const { error } = await (
      supabase as unknown as {
        from: (table: string) => {
          update: (values: Record<string, unknown>) => {
            eq: (
              col: string,
              value: string,
            ) => {
              is: (
                col: string,
                value: null,
              ) => Promise<{ error: { message: string; code?: string } | null }>
            }
          }
        }
      }
    )
      .from('produtos')
      .update({ criado_por: atorId })
      .eq('id', produtoId)
      // Guarda de idempotência: só grava se ainda não houver autor. Sem isto,
      // um replay (mesmo `client_request_id`) — potencialmente disparado por
      // OUTRO ator — reescreveria `criado_por` e falsificaria a trilha. O
      // caminho normal de create sempre cai aqui com a coluna NULL, porque a
      // RPC 270/289 roda como service_role (sem `auth.uid()`), então a guarda
      // não custa nada no fluxo feliz.
      .is('criado_por', null)

    if (error) {
      Sentry.captureMessage('produto.criado_por: UPDATE de acompanhamento falhou', {
        level: 'warning',
        tags: { modulo: 'produtos-autoria', produto_ref: refAnonima(produtoId) },
        extra: { ator_ref: refAnonima(atorId), dbErrorCode: codigoErroPermitido(error.code) },
      })
    }
  } catch (e) {
    Sentry.captureException(e, {
      level: 'warning',
      tags: { modulo: 'produtos-autoria', produto_ref: refAnonima(produtoId) },
      extra: { ator_ref: refAnonima(atorId), contexto: 'registrarCriadoPor lançou exceção' },
    })
  }
}

async function createViaRpc(
  command: CreateProductCommand,
  deps: ProductWriterDeps,
  supabase: SupabaseClient,
): Promise<CreateProductResult> {
  const created = await deps.createRpc({
    input: mapCreateProductInputToRpc(command.input),
    atorId: command.atorId,
  })
  if (!created.ok) return { ok: false, error: created.message }

  // Replay (mesmo `client_request_id`) não é uma criação: o produto já existe
  // e já tem seu autor original. Reexecutar o follow-up aqui só criaria ruído
  // — e, com um ator diferente, tentaria reescrever a autoria.
  if (!created.replayed) {
    await registrarCriadoPor(supabase, created.id, command.atorId)
  }

  const reload = await deps.reader.getById(created.id)
  if (!reload.ok) {
    return {
      ok: false,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED),
      code: PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED,
    }
  }
  return { ok: true, product: reload.product }
}

/**
 * Factory ProductWriter — orquestra RPC 270 + reload ProductReader.
 */
export function createProductWriter(
  supabase: SupabaseClient,
  deps?: Partial<ProductWriterDeps>,
): ProductWriter {
  const resolved = { ...defaultDeps(supabase), ...deps }

  return {
    async create(command: CreateProductCommand): Promise<CreateProductResult> {
      const validation = validateCreateProductCommand(command)
      if (!validation.ok) {
        return {
          ok: false,
          code: validation.code,
          error: resolveProductMessage('pt-BR', validation.code),
        }
      }
      try {
        return await createViaRpc(command, resolved, supabase)
      } catch (e) {
        return { ok: false, error: mapCreateCatchError(e) }
      }
    },
  }
}
