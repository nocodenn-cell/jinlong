import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_ITENS_POS_PROVISION,
  FORMAS_PAGAMENTO_PADRAO,
  linhasFormasPagamentoPadrao,
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

  // Sem estas linhas a loja provisionada não vende: a RPC de venda só aceita
  // forma ativa cadastrada para a loja (smoke-fase1 teste 4, CI do PR #556).
  it('semeia as quatro formas de pagamento padrão para a loja nova', () => {
    expect(FORMAS_PAGAMENTO_PADRAO.map((f) => f.codigo)).toEqual([
      'DINHEIRO',
      'PIX',
      'CARTAO_DEBITO',
      'CARTAO_CREDITO',
    ])
    const linhas = linhasFormasPagamentoPadrao('loja-1')
    expect(linhas).toHaveLength(4)
    expect(linhas.every((l) => l.loja_id === 'loja-1')).toBe(true)
  })

  it('nunca semeia fiado/crediário (bloqueados por CHECK na tabela)', () => {
    const proibidos = ['FIADO', 'CREDIARIO', 'CREDITO_LOJA', 'FIADO_LOJA']
    expect(FORMAS_PAGAMENTO_PADRAO.some((f) => proibidos.includes(f.codigo))).toBe(false)
    expect(FORMAS_PAGAMENTO_PADRAO.every((f) => /^[A-Z0-9_]+$/.test(f.codigo))).toBe(true)
  })
})
