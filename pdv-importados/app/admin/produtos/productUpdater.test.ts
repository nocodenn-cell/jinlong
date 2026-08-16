import { describe, expect, it, vi } from 'vitest'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { formatMensagemCodigoBarrasDuplicado } from '@/lib/gerente/produtoCodigoBarrasDuplicado'
import {
  PRODUCT_ERROR_CODES,
  validateUpdateProductCommand,
  type ProductCatalogBasics,
} from '@shared-core/src/products'
import { MSG_PRODUTO_NAO_ENCONTRADO } from './productReader'
import { resolveProductMessage } from './productMessages'
import {
  MSG_NOME_MIN,
  MSG_PRECO_VAREJO,
  MSG_UPDATE_SEM_ID,
  createProductUpdater,
  derivarFaixaAtacado,
  mapUpdateProductInputToRow,
} from './productUpdater'

const catalogRow: ProductCatalogBasics = {
  id: 'prod-1',
  codigoBarras: '789',
  codigoInterno: 'SKU',
  nome: 'Produto A',
  lojaId: 'loja-1',
  ativo: true,
  statusPublicacao: 'PUBLICADO',
  precoVarejo: 10,
  precoAtacado: 8,
  precoCusto: null,
  categoriaId: 'cat-1',
  marcaId: null,
  fornecedorId: null,
  imagemUrl: null,
}

describe('productUpdater — mapping', () => {
  it('mapUpdateProductInputToRow mapeia catálogo sem colunas de estoque', () => {
    const row = mapUpdateProductInputToRow({
      nome: '  Camiseta  ',
      codigoBarras: ' 789100 ',
      precoVarejo: 19.9,
      precoAtacado: 15,
      categoriaId: 'cat-1',
      statusPublicacao: 'PUBLICADO',
    })
    expect(row).toEqual({
      nome: 'Camiseta',
      codigo_barras: '789100',
      codigo_interno: null,
      referencia_fornecedor: null,
      nome_reduzido_pdv: null,
      localizacao_prateleira: null,
      preco_varejo: 19.9,
      preco_atacado: 15,
      preco_custo: null,
      permitir_abaixo_custo: false,
      quantidade_gatilho_atacado: null,
      unidade_medida: 'UN',
      observacao: null,
      categoria_id: 'cat-1',
      marca_id: null,
      fornecedor_id: null,
      ncm: null,
      cfop_produto: null,
      csosn: null,
      cest: null,
      cst_pis: null,
      cst_cofins: null,
      status_publicacao: 'PUBLICADO',
      ativo: true,
    })
    expect(row).not.toHaveProperty('estoque_inicial_quantidade')
    expect(row).not.toHaveProperty('quantidade')
  })

  it('omite lifecycle quando statusPublicacao não vem no input', () => {
    const row = mapUpdateProductInputToRow({
      nome: 'Ok',
      precoVarejo: 1,
    })
    expect(row.status_publicacao).toBeUndefined()
    expect(row.ativo).toBeUndefined()
  })
})

describe('productUpdater — validação (codes shared-core)', () => {
  it('rejeita id ausente', () => {
    expect(
      validateUpdateProductCommand({
        id: '',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 1 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID })
    expect(MSG_UPDATE_SEM_ID).toBe(
      resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID),
    )
  })

  it('rejeita nome curto com code NAME_INVALID', () => {
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'A', precoVarejo: 1 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.NAME_INVALID })
    expect(MSG_NOME_MIN).toBe(
      resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NAME_INVALID),
    )
  })

  it('rejeita preço inválido com code PRICE_NOT_POSITIVE', () => {
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 0 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE })
    expect(MSG_PRECO_VAREJO).toBe(
      resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE),
    )
  })
})

describe('createProductUpdater', () => {
  it('update válido: UPDATE + reload → ProductCatalogBasics', async () => {
    const updated = { ...catalogRow, nome: 'Produto B', precoVarejo: 12 }
    const getById = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, product: catalogRow })
      .mockResolvedValueOnce({ ok: true as const, product: updated })
    const updateRow = vi.fn(async () => ({ error: null }))
    const updater = createProductUpdater({} as never, {
      reader: { getById },
      updateRow,
    })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto B', precoVarejo: 12, precoAtacado: 8 },
    })

    expect(r).toEqual({ ok: true, product: updated })
    expect(updateRow).toHaveBeenCalledWith({
      id: 'prod-1',
      lojaId: 'loja-1',
      payload: expect.objectContaining({
        nome: 'Produto B',
        preco_varejo: 12,
        preco_atacado: 8,
      }),
    })
    expect(getById).toHaveBeenCalledTimes(2)
  })

  it('produto inexistente não chama UPDATE', async () => {
    const getById = vi.fn(async () => ({
      ok: false as const,
      error: MSG_PRODUTO_NAO_ENCONTRADO,
      notFound: true,
    }))
    const updateRow = vi.fn()
    const updater = createProductUpdater({} as never, {
      reader: { getById },
      updateRow,
    })

    const r = await updater.update({
      id: 'missing',
      lojaId: 'loja-1',
      input: { nome: 'Ok', precoVarejo: 1 },
    })

    expect(r).toEqual({
      ok: false,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND),
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
      notFound: true,
    })
    expect(updateRow).not.toHaveBeenCalled()
  })

  it('erro de validação não chama I/O', async () => {
    const getById = vi.fn()
    const updateRow = vi.fn()
    const updater = createProductUpdater({} as never, {
      reader: { getById },
      updateRow,
    })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'X', precoVarejo: 1 },
    })

    expect(r).toEqual({
      ok: false,
      code: PRODUCT_ERROR_CODES.NAME_INVALID,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NAME_INVALID),
    })
    expect(getById).not.toHaveBeenCalled()
    expect(updateRow).not.toHaveBeenCalled()
  })

  it('erro de infraestrutura preserva mensagem com seção Produto', async () => {
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updateRow = vi.fn(async () => ({
      error: { message: 'connection reset', code: '57014' },
    }))
    const updater = createProductUpdater({} as never, {
      reader: { getById },
      updateRow,
    })

    await expect(
      updater.update({
        id: 'prod-1',
        lojaId: 'loja-1',
        input: { nome: 'Ok', precoVarejo: 1 },
      }),
    ).resolves.toEqual({
      ok: false,
      error: mensagemErroComSecao('Produto', 'connection reset'),
    })
  })

  it('unique de código de barras preserva mensagem existente', async () => {
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updateRow = vi.fn(async () => ({
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
      },
    }))
    const updater = createProductUpdater({} as never, {
      reader: { getById },
      updateRow,
    })

    await expect(
      updater.update({
        id: 'prod-1',
        lojaId: 'loja-1',
        input: { nome: 'Ok', precoVarejo: 1, codigoBarras: '111' },
      }),
    ).resolves.toEqual({
      ok: false,
      error: formatMensagemCodigoBarrasDuplicado(null),
      code: PRODUCT_ERROR_CODES.BARCODE_DUPLICATE,
    })
  })

  it('unique de código de barras SEM supabase funcional cai no fallback genérico (consulta complementar falhando)', async () => {
    // supabase = {} força buscarProdutoPorCodigoBarrasLoja a estourar (sem .from) —
    // prova que a falha da consulta de enriquecimento não derruba a resposta do
    // update nem propaga um erro cru pro chamador; cai na mensagem genérica.
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updateRow = vi.fn(async () => ({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
      },
    }))
    const updater = createProductUpdater({} as never, { reader: { getById }, updateRow })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Ok', precoVarejo: 1, codigoBarras: '111' },
    })

    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ code: PRODUCT_ERROR_CODES.BARCODE_DUPLICATE })
    // Mensagem genérica (sem nome) — não crasha, não vaza o erro interno da consulta.
    expect(r.error).toBe(formatMensagemCodigoBarrasDuplicado(null))
  })

  it('unique de código de barras COM supabase funcional enriquece a mensagem com o nome do produto conflitante', async () => {
    const calls: { table?: string; eq: Array<[string, string]>; neq?: [string, string] } = { eq: [] }
    const fakeSupabase = {
      from: (table: string) => {
        calls.table = table
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              calls.eq.push([col, val])
              return {
                eq: (col2: string, val2: string) => {
                  calls.eq.push([col2, val2])
                  return {
                    limit: () => ({
                      neq: (col3: string, val3: string) => {
                        calls.neq = [col3, val3]
                        return { maybeSingle: async () => ({ data: { id: 'outro-produto-id', nome: 'Caixa Amarela' } }) }
                      },
                      maybeSingle: async () => ({ data: { id: 'outro-produto-id', nome: 'Caixa Amarela' } }),
                    }),
                  }
                },
              }
            },
          }),
        }
      },
    }
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updateRow = vi.fn(async () => ({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
      },
    }))
    const updater = createProductUpdater(fakeSupabase as never, { reader: { getById }, updateRow })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Ok', precoVarejo: 1, codigoBarras: '0012366665' },
    })

    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ error: expect.stringContaining('Caixa Amarela') })
    // Isolamento por loja: a busca do conflito usa a loja do comando (do usuário
    // que está editando), não algum outro valor.
    expect(calls.table).toBe('produtos')
    expect(calls.eq).toContainEqual(['loja_id', 'loja-1'])
    expect(calls.eq).toContainEqual(['codigo_barras', '0012366665'])
    // Exclui o próprio produto sendo editado — "manter o próprio código" nunca
    // se autodenuncia (mesmo que este teste force um 23505, em uso real isso só
    // dispara se OUTRO produto já tiver esse código).
    expect(calls.neq).toEqual(['id', 'prod-1'])
  })

  it('não chama a busca de duplicidade quando o update tem sucesso (manter o próprio código não gera I/O extra)', async () => {
    const fromSpy = vi.fn()
    const fakeSupabase = { from: fromSpy }
    const after: ProductCatalogBasics = { ...catalogRow, nome: 'Ok' }
    const getById = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, product: catalogRow })
      .mockResolvedValueOnce({ ok: true as const, product: after })
    const updateRow = vi.fn(async () => ({ error: null }))
    const updater = createProductUpdater(fakeSupabase as never, { reader: { getById }, updateRow })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      // mesmo código de barras que o produto já tinha (catalogRow.codigoBarras = '789')
      input: { nome: 'Ok', precoVarejo: 1, codigoBarras: '789' },
    })

    expect(r.ok).toBe(true)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('retorno pós-update inclui identidade + preços de cadastro', async () => {
    const after: ProductCatalogBasics = {
      ...catalogRow,
      nome: 'Atualizado',
      precoVarejo: 22,
      precoAtacado: 18,
    }
    const getById = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, product: catalogRow })
      .mockResolvedValueOnce({ ok: true as const, product: after })
    const updateRow = vi.fn(async () => ({ error: null }))
    const updater = createProductUpdater({} as never, {
      reader: { getById },
      updateRow,
    })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Atualizado', precoVarejo: 22, precoAtacado: 18 },
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.product.id).toBe('prod-1')
    expect(r.product.lojaId).toBe('loja-1')
    expect(r.product.nome).toBe('Atualizado')
    expect(r.product.precoVarejo).toBe(22)
    expect(r.product.precoAtacado).toBe(18)
    expect(r.product.statusPublicacao).toBe('PUBLICADO')
  })
})

/**
 * Transacionalidade produto + faixa de atacado (migration
 * `atualizar_produto_com_faixa_atacado`). O que é provado no banco de verdade
 * — atomicidade e rollback — está em
 * `backend/scripts/rls-produtos-tenant-rest-smoke.mjs`, contra o PostgREST
 * real. Aqui cobre-se o contrato do lado da aplicação: o que é derivado do
 * payload e como os erros da RPC viram mensagem de usuário.
 */
describe('derivarFaixaAtacado', () => {
  const base = mapUpdateProductInputToRow({ nome: 'X', precoVarejo: 10 })

  it('deriva a faixa quando preço de atacado e gatilho vêm juntos', () => {
    expect(
      derivarFaixaAtacado({ ...base, preco_atacado: 30, quantidade_gatilho_atacado: 10 }),
    ).toEqual({ quantidade_minima: 10, preco_unitario: 30 })
  })

  it('sem gatilho não há faixa a sincronizar (preço de atacado sozinho não define faixa)', () => {
    expect(
      derivarFaixaAtacado({ ...base, preco_atacado: 30, quantidade_gatilho_atacado: null }),
    ).toBeNull()
  })

  it('sem preço de atacado não há faixa', () => {
    expect(
      derivarFaixaAtacado({ ...base, preco_atacado: null, quantidade_gatilho_atacado: 10 }),
    ).toBeNull()
  })

  it('valores não positivos não geram faixa (a RPC rejeitaria)', () => {
    expect(
      derivarFaixaAtacado({ ...base, preco_atacado: 0, quantidade_gatilho_atacado: 10 }),
    ).toBeNull()
    expect(
      derivarFaixaAtacado({ ...base, preco_atacado: 30, quantidade_gatilho_atacado: 0 }),
    ).toBeNull()
    expect(
      derivarFaixaAtacado({ ...base, preco_atacado: 30, quantidade_gatilho_atacado: -5 }),
    ).toBeNull()
  })
})

describe('mapeamento dos erros da RPC transacional', () => {
  const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))

  it('ATUALIZAR_PRODUTO_NAO_ENCONTRADO (produto de outra loja) → NOT_FOUND', async () => {
    const updateRow = vi.fn(async () => ({
      error: { message: 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO' },
    }))
    const updater = createProductUpdater({} as never, { reader: { getById }, updateRow })
    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto Valido', precoVarejo: 10 },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe(PRODUCT_ERROR_CODES.NOT_FOUND)
  })

  it('ATUALIZAR_PRODUTO_CODIGO_BARRAS_DUPLICADO → mensagem amigável de duplicidade', async () => {
    const updateRow = vi.fn(async () => ({
      error: { message: 'ATUALIZAR_PRODUTO_CODIGO_BARRAS_DUPLICADO' },
    }))
    const updater = createProductUpdater({} as never, { reader: { getById }, updateRow })
    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto Valido', precoVarejo: 10, codigoBarras: '789' },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe(PRODUCT_ERROR_CODES.BARCODE_DUPLICATE)
  })
})

/**
 * Sequenciamento app ↔ banco: esta versão da aplicação não pode quebrar a
 * edição de produto quando publicada ANTES da migration que cria a RPC
 * transacional. Ver docs/PROMOCAO_PRODUTOS_HARDENING.md §3.
 */
describe('fallback quando a RPC transacional ainda não existe no banco', () => {
  const catalogPayload = mapUpdateProductInputToRow({ nome: 'Produto A', precoVarejo: 10 })

  function fakeSupabaseSemRpc(codigo: string, mensagem: string) {
    const updateSpy = vi.fn(async () => ({ error: null }))
    const supabase = {
      rpc: vi.fn(async () => ({ error: { code: codigo, message: mensagem } })),
      from: () => ({
        update: (payload: unknown) => ({
          eq: (_c1: string, _v1: string) => ({
            eq: (_c2: string, _v2: string) => updateSpy(payload),
          }),
        }),
      }),
    }
    return { supabase, updateSpy }
  }

  it('PGRST202 (função fora do schema cache) → cai no UPDATE direto', async () => {
    const { supabase, updateSpy } = fakeSupabaseSemRpc(
      'PGRST202',
      'Could not find the function public.atualizar_produto_com_faixa_atacado',
    )
    const { createProductUpdater: criar } = await import('./productUpdater')
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updater = criar(supabase as never, { reader: { getById } })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto A', precoVarejo: 10 },
    })

    expect(r.ok).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Produto A' }))
  })

  it('42883 (undefined_function no Postgres) → cai no UPDATE direto', async () => {
    const { supabase, updateSpy } = fakeSupabaseSemRpc(
      '42883',
      'function public.atualizar_produto_com_faixa_atacado(...) does not exist',
    )
    const { createProductUpdater: criar } = await import('./productUpdater')
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updater = criar(supabase as never, { reader: { getById } })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto A', precoVarejo: 10 },
    })

    expect(r.ok).toBe(true)
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('erro REAL da RPC (não "ausente") NÃO cai no fallback — não mascara falha', async () => {
    const updateSpy = vi.fn(async () => ({ error: null }))
    const supabase = {
      rpc: vi.fn(async () => ({
        error: { code: 'P0001', message: 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO' },
      })),
      from: () => ({
        update: () => ({ eq: () => ({ eq: () => updateSpy() }) }),
      }),
    }
    const { createProductUpdater: criar } = await import('./productUpdater')
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updater = criar(supabase as never, { reader: { getById } })

    const r = await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto A', precoVarejo: 10 },
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe(PRODUCT_ERROR_CODES.NOT_FOUND)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('o payload enviado à RPC carrega a faixa derivada', async () => {
    const rpcSpy = vi.fn(async () => ({ error: null }))
    const supabase = { rpc: rpcSpy, from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) }
    const { createProductUpdater: criar } = await import('./productUpdater')
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const updater = criar(supabase as never, { reader: { getById } })

    await updater.update({
      id: 'prod-1',
      lojaId: 'loja-1',
      input: { nome: 'Produto A', precoVarejo: 50, precoAtacado: 30, quantidadeGatilhoAtacado: 10 },
    })

    expect(rpcSpy).toHaveBeenCalledWith(
      'atualizar_produto_com_faixa_atacado',
      expect.objectContaining({
        p_produto_id: 'prod-1',
        p_faixa: { quantidade_minima: 10, preco_unitario: 30 },
      }),
    )
    expect(catalogPayload.nome).toBe('Produto A')
  })
})
