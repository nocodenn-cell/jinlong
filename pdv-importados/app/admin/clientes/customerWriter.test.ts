import { describe, expect, it } from 'vitest'
import { buildClientePersistPayload } from './customerWriter'
import type { ClienteInput } from '@shared-core/src/customers'

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
