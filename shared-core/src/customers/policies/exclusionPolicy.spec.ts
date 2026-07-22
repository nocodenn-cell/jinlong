import { describe, expect, it } from 'vitest'
import { CUSTOMER_ERROR_CODES } from '../errorCodes'
import {
  CLIENTE_ANONIMIZACAO_PAYLOAD,
  CLIENTE_NOME_ANONIMIZADO,
  decideClienteExclusion,
  mensagemCrediarioAberto,
} from './exclusionPolicy'

describe('exclusionPolicy', () => {
  describe('mensagemCrediarioAberto', () => {
    it('preserva formato exato da action legada', () => {
      expect(mensagemCrediarioAberto('João')).toBe(
        'Cliente "João" possui crediário aberto. Quite o saldo antes de excluir.',
      )
    })
  })

  describe('CLIENTE_ANONIMIZACAO_PAYLOAD', () => {
    it('espelha campos da action legada', () => {
      expect(CLIENTE_NOME_ANONIMIZADO).toBe('CLIENTE_ANONIMIZADO_LGPD')
      expect(CLIENTE_ANONIMIZACAO_PAYLOAD).toEqual({
        nome: 'CLIENTE_ANONIMIZADO_LGPD',
        documento: null,
        telefone: null,
        email: null,
        endereco: null,
        ativo: false,
      })
    })
  })

  describe('decideClienteExclusion', () => {
    it('reject quando saldo_crediario > 0 (prioridade sobre histórico)', () => {
      const d = decideClienteExclusion({
        nome: 'Ana',
        saldoCrediario: 10,
        temHistoricoContasReceber: true,
      })
      expect(d).toEqual({
        action: 'reject',
        code: CUSTOMER_ERROR_CODES.HAS_OPEN_CREDIT,
        error: mensagemCrediarioAberto('Ana'),
        params: { nome: 'Ana' },
      })
    })

    it('reject com saldo numérico string-like via Number()', () => {
      const d = decideClienteExclusion({
        nome: 'B',
        saldoCrediario: Number('5.5'),
        temHistoricoContasReceber: false,
      })
      expect(d.action).toBe('reject')
    })

    it('anonymize quando saldo zerado e há histórico', () => {
      expect(
        decideClienteExclusion({
          nome: 'C',
          saldoCrediario: 0,
          temHistoricoContasReceber: true,
        }),
      ).toEqual({ action: 'anonymize' })
    })

    it('delete quando saldo zerado e sem histórico', () => {
      expect(
        decideClienteExclusion({
          nome: 'D',
          saldoCrediario: 0,
          temHistoricoContasReceber: false,
        }),
      ).toEqual({ action: 'delete' })
    })

    it('não rejeita saldo exatamente 0', () => {
      const d = decideClienteExclusion({
        nome: 'E',
        saldoCrediario: 0,
        temHistoricoContasReceber: false,
      })
      expect(d.action).not.toBe('reject')
    })
  })
})
