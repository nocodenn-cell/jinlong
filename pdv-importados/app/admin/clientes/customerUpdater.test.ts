import { describe, expect, it, vi } from 'vitest'
import { createCustomerUpdater } from './customerUpdater'
import { CUSTOMER_ERROR_CODES, type ClienteInput } from '@shared-core/src/customers'
import type { SupabaseClient } from '@supabase/supabase-js'

const validInput: ClienteInput = {
  nome: 'Maria',
  tipo: 'PF',
  documento: '12345678901',
  email: 'a@b.co',
  telefone: '11988887777',
  endereco: 'Rua A',
  limite_crediario: 50,
}

function mockSupabaseUpdateError(error: { code: string; message: string }): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('createCustomerUpdater — update()', () => {
  it('CPF/CNPJ duplicado (Postgres 23505) retorna code DOCUMENT_DUPLICATE, não o erro cru do banco', async () => {
    const supabase = mockSupabaseUpdateError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "clientes_loja_documento_unique"',
    })
    const updater = createCustomerUpdater(supabase)
    const result = await updater.update({ id: 'c1', input: validInput })

    expect(result).toEqual({
      ok: false,
      error: 'Já existe um cliente com este CPF/CNPJ nesta loja.',
      code: CUSTOMER_ERROR_CODES.DOCUMENT_DUPLICATE,
    })
  })

  it('erro de infraestrutura (não-23505) preserva a mensagem crua (comportamento legado)', async () => {
    const supabase = mockSupabaseUpdateError({ code: '08006', message: 'connection failure' })
    const updater = createCustomerUpdater(supabase)
    const result = await updater.update({ id: 'c1', input: validInput })

    expect(result).toEqual({ ok: false, error: 'connection failure' })
  })
})
