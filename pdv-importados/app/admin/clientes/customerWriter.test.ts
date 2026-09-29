import { describe, expect, it, vi } from 'vitest'
import { buildClientePersistPayload, createCustomerWriter } from './customerWriter'
import { CUSTOMER_ERROR_CODES, type ClienteInput } from '@shared-core/src/customers'
import type { SupabaseClient } from '@supabase/supabase-js'

const base: ClienteInput = {
  nome: '  Maria  ',
  tipo: 'PF',
  documento: '123.456.789-01',
  email: ' a@b.co ',
  telefone: '(11) 98888-7777',
  endereco: '  Rua A  ',
  limite_crediario: 50,
}

describe('buildClientePersistPayload', () => {
  it('normaliza campos como a action legada', () => {
    expect(buildClientePersistPayload(base)).toEqual({
      nome: 'Maria',
      tipo: 'PF',
      documento: '12345678901',
      email: 'a@b.co',
      telefone: '11988887777',
      endereco: 'Rua A',
      limite_credito: 50,
    })
  })

  it('converte email/telefone/endereco vazios em null', () => {
    expect(
      buildClientePersistPayload({
        ...base,
        email: '  ',
        telefone: null,
        endereco: '',
      }),
    ).toMatchObject({ email: null, telefone: null, endereco: null })
  })
})

describe('createCustomerWriter — create()', () => {
  // Input já normalizado (sem espaços) — `validateClienteInput` não faz trim
  // antes de checar o formato do e-mail, diferente de `buildClientePersistPayload`.
  const validInput: ClienteInput = { ...base, nome: 'Maria', email: 'a@b.co', endereco: 'Rua A' }

  it('CPF/CNPJ duplicado (Postgres 23505) retorna code DOCUMENT_DUPLICATE, não o erro cru do banco', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: '23505',
                message:
                  'duplicate key value violates unique constraint "clientes_loja_documento_unique"',
              },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    const writer = createCustomerWriter(supabase)
    const result = await writer.create({ input: validInput, lojaId: 'loja-1' })

    expect(result).toEqual({
      ok: false,
      error: 'Já existe um cliente com este CPF/CNPJ nesta loja.',
      code: CUSTOMER_ERROR_CODES.DOCUMENT_DUPLICATE,
    })
  })

  it('erro de infraestrutura (não-23505) preserva a mensagem crua (comportamento legado)', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '08006', message: 'connection failure' },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    const writer = createCustomerWriter(supabase)
    const result = await writer.create({ input: validInput, lojaId: 'loja-1' })

    expect(result).toEqual({ ok: false, error: 'connection failure' })
  })
})
