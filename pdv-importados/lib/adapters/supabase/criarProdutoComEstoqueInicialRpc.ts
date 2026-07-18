import { createAdminClient } from '@/lib/supabase/admin'
import type { NovoProdutoInput } from '@/core/ports/produto'
import { defaultStatusNovoProduto } from '@/core/catalog/statusPublicacao'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { mensagemErroAjusteEstoqueManual } from '@/lib/gerente/estoqueInicialCadastro'

export type CriarProdutoEstoqueInput = NovoProdutoInput & {
  estoque_inicial_quantidade?: number
  estoque_inicial_minimo?: number
  client_request_id?: string | null
}

const CRIAR_MSGS: Record<string, string> = {
  CRIAR_PRODUTO_AUTH: 'Sessão inválida para cadastrar produto. Faça login novamente.',
  CRIAR_PRODUTO_PERFIL:
    'Seu perfil não pode cadastrar produto. Use operador (PDV relâmpago) ou gerente/dono/admin.',
  CRIAR_PRODUTO_LOJA: 'Não foi possível identificar a loja da sessão.',
  CRIAR_PRODUTO_NOME: 'Informe um nome de produto válido (mín. 2 caracteres).',
  CRIAR_PRODUTO_PRECO: 'Preço de varejo inválido.',
  CRIAR_PRODUTO_ORIGEM: 'Origem do produto inválida.',
  CRIAR_PRODUTO_STATUS: 'Status de publicação inválido.',
  CRIAR_PRODUTO_ESTOQUE_INVALIDO: 'Estoque inicial ou mínimo inválido.',
  CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO:
    'Código de barras já cadastrado nesta loja. Busque o produto existente no catálogo.',
}

export function mensagemErroCriarProdutoRpc(detalhe: string): string {
  const raw = (detalhe ?? '').trim()
  if (!raw) return 'Não foi possível salvar o produto. Tente de novo.'
  for (const code of Object.keys(CRIAR_MSGS)) {
    if (raw.includes(code)) return CRIAR_MSGS[code]!
  }
  if (raw.includes('AJUSTE_ESTOQUE_')) {
    return mensagemErroAjusteEstoqueManual(raw)
  }
  return mensagemErroComSecao('Cadastro de produto', raw)
}

function buildPayload(input: CriarProdutoEstoqueInput): Record<string, unknown> {
  const lifecycle = defaultStatusNovoProduto(input)
  const qty = Number(input.estoque_inicial_quantidade ?? 0)
  const min = Number(input.estoque_inicial_minimo ?? 0)
  return {
    nome: input.nome,
    codigo_barras: input.codigo_barras?.trim() || null,
    codigo_interno: input.codigo_interno?.trim() || null,
    referencia_fornecedor: input.referencia_fornecedor?.trim() || null,
    nome_reduzido_pdv: input.nome_reduzido_pdv?.trim() || null,
    localizacao_prateleira: input.localizacao_prateleira?.trim() || null,
    preco_varejo: input.preco_varejo,
    preco_atacado:
      input.preco_atacado !== undefined && input.preco_atacado !== null
        ? Number(input.preco_atacado)
        : null,
    preco_custo:
      input.preco_custo !== undefined && input.preco_custo !== null
        ? Number(input.preco_custo)
        : null,
    permitir_abaixo_custo: input.permitir_abaixo_custo ?? false,
    quantidade_gatilho_atacado: input.quantidade_gatilho_atacado ?? null,
    origem: input.origem,
    tem_nf: input.tem_nf,
    unidade_medida: input.unidade_medida ?? 'UN',
    observacao: input.observacao ?? null,
    categoria_id: input.categoria_id ?? null,
    marca_id: input.marca_id ?? null,
    fornecedor_id: input.fornecedor_id ?? null,
    ncm: input.ncm ?? null,
    cfop_produto: input.cfop_produto ?? null,
    csosn: input.csosn ?? null,
    cest: input.cest ?? null,
    cst_pis: input.cst_pis ?? null,
    cst_cofins: input.cst_cofins ?? null,
    ativo: lifecycle.ativo,
    status_publicacao: lifecycle.status_publicacao,
    estoque_inicial_quantidade: Number.isFinite(qty) && qty > 0 ? qty : 0,
    estoque_inicial_minimo: Number.isFinite(min) && min > 0 ? min : 0,
  }
}

/**
 * Cria produto + estoque (+ kardex se qty/min > 0) via RPC atômica (service_role + p_ator_id).
 */
export async function executarCriarProdutoComEstoqueInicial(opts: {
  input: CriarProdutoEstoqueInput
  atorId: string
}): Promise<
  { ok: true; id: string; replayed: boolean; estoqueAplicado: boolean } | { ok: false; message: string }
> {
  if (!opts.atorId) {
    return { ok: false, message: mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_AUTH') }
  }

  const admin = createAdminClient()
  const requestId = opts.input.client_request_id?.trim() || null
  // RPC 270 ainda não está no Database tipado gerado — cast pontual.
  const { data, error } = await (
    admin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  ).rpc('criar_produto_com_estoque_inicial', {
    p_payload: buildPayload(opts.input),
    p_ator_id: opts.atorId,
    p_request_id: requestId,
  })

  if (error) {
    return { ok: false, message: mensagemErroCriarProdutoRpc(error.message) }
  }

  const row = data as {
    produto_id?: string
    replayed?: boolean
    estoque_aplicado?: boolean
  } | null

  const id = row?.produto_id
  if (!id) {
    return { ok: false, message: 'Não foi possível salvar o produto. Tente de novo.' }
  }

  return {
    ok: true,
    id: String(id),
    replayed: Boolean(row?.replayed),
    estoqueAplicado: Boolean(row?.estoque_aplicado),
  }
}
