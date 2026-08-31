import { describe, expect, it } from 'vitest'
import {
  deveBuscarSugestoes,
  pareceLeituraBarcode,
  sugestoesDeResultadoBusca,
} from './caixaBuscaSugestoes'
import type { ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

const PRODUTO: ProdutoCaixaDTO = {
  id: 'p1',
  nome: 'Cadeira Vermelha',
  codigo_barras: '789',
  codigo_interno: 'CAD-V',
  preco_varejo: 100,
  preco_atacado: null,
  categoria_id: null,
  origem: 'brasil_nf',
  tem_nf: true,
  observacao: null,
  quantidade_estoque: 2,
  estoque_minimo: 1,
}

describe('caixaBuscaSugestoes', () => {
  it('pareceLeituraBarcode: só dígitos longos (scanner)', () => {
    expect(pareceLeituraBarcode('7891000000002')).toBe(true)
    expect(pareceLeituraBarcode('123456')).toBe(true)
    expect(pareceLeituraBarcode('12345')).toBe(false)
    expect(pareceLeituraBarcode('cadeira v')).toBe(false)
    expect(pareceLeituraBarcode('CAD-01')).toBe(false)
  })

  it('deveBuscarSugestoes: min 2 chars e não barcode', () => {
    expect(deveBuscarSugestoes('')).toBe(false)
    expect(deveBuscarSugestoes('c')).toBe(false)
    expect(deveBuscarSugestoes('ca')).toBe(true)
    expect(deveBuscarSugestoes('cadeira v')).toBe(true)
    expect(deveBuscarSugestoes('7891000000002')).toBe(false)
  })

  it('sugestoesDeResultadoBusca: ambiguo → lista; unico → 1 item; vazio → null', () => {
    expect(
      sugestoesDeResultadoBusca(
        { ok: true, status: 'ambiguo', mensagem: 'vários', candidatos: [PRODUTO] },
        'único',
      ),
    ).toEqual({ mensagem: 'vários', itens: [PRODUTO] })

    expect(
      sugestoesDeResultadoBusca({ ok: true, status: 'encontrado', produto: PRODUTO }, 'único'),
    ).toEqual({ mensagem: 'único', itens: [PRODUTO] })

    expect(sugestoesDeResultadoBusca({ ok: true, status: 'nao_encontrado' }, 'único')).toBeNull()
    expect(
      sugestoesDeResultadoBusca(
        { ok: true, status: 'ambiguo', mensagem: 'colisão', candidatos: [] },
        'único',
      ),
    ).toBeNull()
  })
})
