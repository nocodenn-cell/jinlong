/**
 * P0-3 (PDV): decisão de recuperação do cupom persistido ao abrir o PDV.
 * Cada cenário trava uma regra: nada de cupom antigo sem vínculo ao turno,
 * finalização pendente nunca descartada em silêncio, espera devolvida ao descartar.
 */
import { describe, expect, it } from 'vitest'
import {
  CARRINHO_VALIDADE_MS,
  decidirRecuperacaoCarrinho,
  type CarrinhoPersistidoRecuperacao,
  type ContextoCaixaRecuperacao,
} from './recuperacaoCarrinho'

const AGORA = Date.parse('2026-11-22T12:00:00.000Z')
const RECENTE = new Date(AGORA - 5 * 60 * 1000).toISOString()
const ABERTO: ContextoCaixaRecuperacao = { status: 'aberto', caixaId: 'caixa-1' }

function cupom(extra: Partial<CarrinhoPersistidoRecuperacao> = {}): CarrinhoPersistidoRecuperacao {
  return {
    itens: [{ id: 'linha-1', quantidade: 1 }],
    cartOwnerUserId: 'op-a',
    cartLojaId: 'loja-1',
    caixaId: 'caixa-1',
    atualizadoEm: RECENTE,
    vendaFinalizacaoPendente: false,
    vendaIdempotencyKey: null,
    vendaEmEsperaOrigemId: null,
    ...extra,
  }
}

const base = { userId: 'op-a', lojaId: 'loja-1', agora: AGORA, caixa: ABERTO }

describe('decidirRecuperacaoCarrinho', () => {
  it('cupom do mesmo operador, mesmo turno e recente é restaurado', () => {
    expect(decidirRecuperacaoCarrinho(cupom(), base)).toEqual({ acao: 'restaurar' })
  })

  it('aguarda enquanto o status do caixa carrega ou está em erro (nada é decidido)', () => {
    expect(decidirRecuperacaoCarrinho(cupom(), { ...base, caixa: { status: 'carregando' } })).toEqual({
      acao: 'aguardar',
    })
    expect(decidirRecuperacaoCarrinho(cupom(), { ...base, caixa: { status: 'erro' } })).toEqual({
      acao: 'aguardar',
    })
  })

  it('cupom de sessão anterior sem caixa/atualização (legado v1) é descartado, não restaurado', () => {
    const legado = cupom({ caixaId: null, atualizadoEm: null })
    expect(decidirRecuperacaoCarrinho(legado, base)).toEqual({
      acao: 'descartar',
      motivo: 'outro_turno',
      devolverEsperaId: null,
    })
  })

  it('cupom de outro turno é descartado mesmo sendo do mesmo operador', () => {
    const outroTurno = cupom({ caixaId: 'caixa-antigo' })
    expect(decidirRecuperacaoCarrinho(outroTurno, base)).toMatchObject({
      acao: 'descartar',
      motivo: 'outro_turno',
    })
  })

  it('caixa fechado descarta o cupom aberto', () => {
    expect(decidirRecuperacaoCarrinho(cupom(), { ...base, caixa: { status: 'fechado' } })).toMatchObject({
      acao: 'descartar',
      motivo: 'caixa_fechado',
    })
  })

  it('cupom de outro operador é descartado; cupom sem dono também', () => {
    expect(decidirRecuperacaoCarrinho(cupom({ cartOwnerUserId: 'op-b' }), base)).toMatchObject({
      acao: 'descartar',
      motivo: 'outro_operador',
    })
    expect(decidirRecuperacaoCarrinho(cupom({ cartOwnerUserId: null }), base)).toMatchObject({
      acao: 'descartar',
      motivo: 'sem_dono',
    })
  })

  it('sem sessão de usuário nenhum cupom com dono é restaurado', () => {
    expect(decidirRecuperacaoCarrinho(cupom(), { ...base, userId: null })).toMatchObject({
      acao: 'descartar',
      motivo: 'outro_operador',
    })
  })

  it('cupom de outra loja é descartado quando a loja atual é conhecida', () => {
    expect(decidirRecuperacaoCarrinho(cupom({ cartLojaId: 'loja-2' }), base)).toMatchObject({
      acao: 'descartar',
      motivo: 'outra_loja',
    })
    // Loja atual desconhecida (PDV ainda não vinculou): não bloqueia por loja.
    expect(decidirRecuperacaoCarrinho(cupom({ cartLojaId: 'loja-2' }), { ...base, lojaId: undefined })).toEqual({
      acao: 'restaurar',
    })
  })

  it('cupom além da validade (12 h) ou sem data válida é descartado como expirado', () => {
    const antigo = new Date(AGORA - CARRINHO_VALIDADE_MS - 1000).toISOString()
    expect(decidirRecuperacaoCarrinho(cupom({ atualizadoEm: antigo }), base)).toMatchObject({
      acao: 'descartar',
      motivo: 'expirado',
    })
    expect(decidirRecuperacaoCarrinho(cupom({ atualizadoEm: 'não-é-data' }), base)).toMatchObject({
      acao: 'descartar',
      motivo: 'expirado',
    })
  })

  it('no limite exato da validade ainda restaura', () => {
    const noLimite = new Date(AGORA - CARRINHO_VALIDADE_MS).toISOString()
    expect(decidirRecuperacaoCarrinho(cupom({ atualizadoEm: noLimite }), base)).toEqual({ acao: 'restaurar' })
  })

  it('finalização pendente vai à verificação pelo servidor, mesmo com dono/turno divergentes', () => {
    const pendente = cupom({
      vendaFinalizacaoPendente: true,
      vendaIdempotencyKey: 'chave-1',
      cartOwnerUserId: 'op-b',
      caixaId: 'caixa-antigo',
      atualizadoEm: null,
    })
    expect(decidirRecuperacaoCarrinho(pendente, base)).toEqual({ acao: 'verificar_finalizacao' })
  })

  it('finalização pendente não é descartada nem com o caixa fechado', () => {
    const pendente = cupom({ vendaFinalizacaoPendente: true, vendaIdempotencyKey: 'chave-1' })
    expect(decidirRecuperacaoCarrinho(pendente, { ...base, caixa: { status: 'fechado' } })).toEqual({
      acao: 'verificar_finalizacao',
    })
  })

  it('cupom sem itens vai a vazio e devolve a espera reservada, se houver', () => {
    expect(decidirRecuperacaoCarrinho(cupom({ itens: [] }), base)).toEqual({
      acao: 'vazio',
      devolverEsperaId: null,
    })
    expect(
      decidirRecuperacaoCarrinho(cupom({ itens: [], vendaEmEsperaOrigemId: 'espera-9' }), base),
    ).toEqual({ acao: 'vazio', devolverEsperaId: 'espera-9' })
  })

  it('descarte de cupom com espera reservada devolve a espera (não a perde)', () => {
    expect(
      decidirRecuperacaoCarrinho(cupom({ caixaId: 'caixa-antigo', vendaEmEsperaOrigemId: 'espera-9' }), base),
    ).toEqual({ acao: 'descartar', motivo: 'outro_turno', devolverEsperaId: 'espera-9' })
  })
})
