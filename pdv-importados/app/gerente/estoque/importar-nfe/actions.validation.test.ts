import { describe, expect, it } from 'vitest'
import {
  ConfirmarImportacaoNfePayloadSchema,
  ImportNfePayloadSchema,
  RegistrarConferenciaNfePayloadSchema,
} from './actions.validation'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('ImportNfePayloadSchema', () => {
  const base = {
    chave_acesso: '3'.repeat(44),
    numero_nf: 'NF-1',
    emitente_cnpj: '12345678000199',
    emitente_nome: 'Fornecedor',
    atualizar_custo_padrao: true,
    duplicatas: [],
    linhas: [
      {
        nome_produto: 'Produto',
        gtin: null,
        ref_fornecedor: 'REF-1',
        ncm: null,
        u_com: 'UN',
        q_com: 10,
        v_un_com: 5,
        fator: 1,
        atualizar_custo: true,
        acao: 'CRIAR' as const,
        produto_id_destino: null,
      },
    ],
  }

  it('aceita payload mínimo válido', () => {
    expect(ImportNfePayloadSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita linha VINCULAR sem produto_id_destino', () => {
    const r = ImportNfePayloadSchema.safeParse({
      ...base,
      linhas: [{ ...base.linhas[0], acao: 'VINCULAR', produto_id_destino: null }],
    })
    expect(r.success).toBe(false)
  })

  it('rejeita linha CRIAR com produto_id_destino preenchido', () => {
    const r = ImportNfePayloadSchema.safeParse({
      ...base,
      linhas: [{ ...base.linhas[0], acao: 'CRIAR', produto_id_destino: UUID }],
    })
    expect(r.success).toBe(false)
  })

  it('rejeita chave de acesso com tamanho errado', () => {
    expect(ImportNfePayloadSchema.safeParse({ ...base, chave_acesso: '123' }).success).toBe(false)
  })
})

describe('RegistrarConferenciaNfePayloadSchema (FLX-05)', () => {
  it('aceita conferência com quantidade igual à nota (sem observação)', () => {
    const r = RegistrarConferenciaNfePayloadSchema.safeParse({
      importacao_id: UUID,
      itens: [{ item_id: UUID, quantidade_conferida: 10, divergencia_obs: null }],
    })
    expect(r.success).toBe(true)
  })

  it('aceita conferência divergente com observação', () => {
    const r = RegistrarConferenciaNfePayloadSchema.safeParse({
      importacao_id: UUID,
      itens: [{ item_id: UUID, quantidade_conferida: 8, divergencia_obs: 'faltaram 2 unidades' }],
    })
    expect(r.success).toBe(true)
  })

  it('rejeita observação vazia (string em branco) em vez de null', () => {
    const r = RegistrarConferenciaNfePayloadSchema.safeParse({
      importacao_id: UUID,
      itens: [{ item_id: UUID, quantidade_conferida: 8, divergencia_obs: '   ' }],
    })
    expect(r.success).toBe(false)
  })

  it('rejeita quantidade conferida negativa', () => {
    const r = RegistrarConferenciaNfePayloadSchema.safeParse({
      importacao_id: UUID,
      itens: [{ item_id: UUID, quantidade_conferida: -1, divergencia_obs: null }],
    })
    expect(r.success).toBe(false)
  })

  it('rejeita NaN e Infinity (mesma classe de defeito fechada pela D0-03 em remessas)', () => {
    for (const valor of [NaN, Infinity, -Infinity]) {
      const r = RegistrarConferenciaNfePayloadSchema.safeParse({
        importacao_id: UUID,
        itens: [{ item_id: UUID, quantidade_conferida: valor, divergencia_obs: null }],
      })
      expect(r.success).toBe(false)
    }
  })

  it('rejeita lista de itens vazia', () => {
    const r = RegistrarConferenciaNfePayloadSchema.safeParse({ importacao_id: UUID, itens: [] })
    expect(r.success).toBe(false)
  })

  it('rejeita importacao_id que não é uuid', () => {
    const r = RegistrarConferenciaNfePayloadSchema.safeParse({
      importacao_id: 'nao-e-uuid',
      itens: [{ item_id: UUID, quantidade_conferida: 1, divergencia_obs: null }],
    })
    expect(r.success).toBe(false)
  })
})

describe('ConfirmarImportacaoNfePayloadSchema (FLX-05)', () => {
  it('aceita importacao_id válido', () => {
    expect(
      ConfirmarImportacaoNfePayloadSchema.safeParse({ importacao_id: UUID }).success,
    ).toBe(true)
  })

  it('rejeita ausência de importacao_id', () => {
    expect(ConfirmarImportacaoNfePayloadSchema.safeParse({}).success).toBe(false)
  })
})
