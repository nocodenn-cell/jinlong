import { describe, expect, it } from 'vitest'
import { provisionamentoAutomaticoHabilitado } from './provisionamentoAutomatico'

describe('provisionamento automático — fail closed até o hub ser homologado', () => {
  it('ausente, vazio ou qualquer valor diferente de "true" ⇒ bloqueado', () => {
    for (const v of [undefined, '', 'false', '1', 'TRUE', 'yes', 'habilitado']) {
      expect(provisionamentoAutomaticoHabilitado({ PROVISIONAMENTO_AUTOMATICO_HABILITADO: v })).toBe(false)
    }
  })
  it('só "true" libera', () => {
    expect(provisionamentoAutomaticoHabilitado({ PROVISIONAMENTO_AUTOMATICO_HABILITADO: 'true' })).toBe(true)
  })
})
