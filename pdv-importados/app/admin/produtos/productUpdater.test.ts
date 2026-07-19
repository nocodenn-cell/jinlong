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
