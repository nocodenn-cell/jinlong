import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_ITENS_POS_PROVISION,
  PDV_CONFIG_DEFAULTS,
  slugCodigoLoja,
} from './provisionamentoDefaults'

describe('provisionamentoDefaults', () => {
  it('não habilita NFC-e automática por padrão', () => {
    expect(PDV_CONFIG_DEFAULTS.auto_enqueue_fiscal).toBe(false)
  })

  it('marca loja, pdv e dono no checklist pós-provision', () => {
    expect(CHECKLIST_ITENS_POS_PROVISION).toEqual(['loja.criada', 'loja.pdv', 'usuarios.dono'])
  })

  it('gera código estável a partir do nome', () => {
    expect(slugCodigoLoja('Loja Jinlong')).toBe('LOJA_JINLONG')
    expect(slugCodigoLoja('Café & Cia')).toMatch(/^CAFE/)
  })
})
