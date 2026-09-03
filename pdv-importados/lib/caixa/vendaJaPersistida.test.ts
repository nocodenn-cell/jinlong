import { describe, expect, it } from 'vitest'
import {
  acaoPosFalhaFinalizar,
  deveAbrirRecuperacaoAntesDeFinalizar,
  isVendaJaPersistidaMensagem,
  MSG_VENDA_JA_PERSISTIDA,
  RPC_VENDA_RETRY_PAYLOAD_DIVERGENTE,
} from './vendaJaPersistida'

describe('vendaJaPersistida', () => {
  it('reconhece o código RPC cru e as mensagens operador (PT/ZH)', () => {
    expect(isVendaJaPersistidaMensagem(RPC_VENDA_RETRY_PAYLOAD_DIVERGENTE)).toBe(true)
    expect(
      isVendaJaPersistidaMensagem(
        `${RPC_VENDA_RETRY_PAYLOAD_DIVERGENTE}: total_bruto`,
      ),
    ).toBe(true)
    expect(isVendaJaPersistidaMensagem(MSG_VENDA_JA_PERSISTIDA.pt)).toBe(true)
    expect(isVendaJaPersistidaMensagem(MSG_VENDA_JA_PERSISTIDA.zh)).toBe(true)
  })

  it('não classifica falhas reais de persistência como venda já gravada', () => {
    expect(isVendaJaPersistidaMensagem('FINALIZAR_VENDA_CANONICA_ESTOQUE:SEM_SALDO')).toBe(
      false,
    )
    expect(isVendaJaPersistidaMensagem('FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES')).toBe(
      false,
    )
    expect(isVendaJaPersistidaMensagem('Não foi possível concluir. Tente novamente.')).toBe(
      false,
    )
    expect(isVendaJaPersistidaMensagem('')).toBe(false)
  })

  it('bloqueia novo finalize enquanto o desfecho da tentativa anterior é desconhecido', () => {
    expect(deveAbrirRecuperacaoAntesDeFinalizar(true)).toBe(true)
    expect(deveAbrirRecuperacaoAntesDeFinalizar(false)).toBe(false)
  })

  it('mantém recuperação quando o servidor diz que o venda_id já concluiu', () => {
    expect(acaoPosFalhaFinalizar(MSG_VENDA_JA_PERSISTIDA.pt)).toBe('manter_recuperacao')
    expect(acaoPosFalhaFinalizar(RPC_VENDA_RETRY_PAYLOAD_DIVERGENTE)).toBe(
      'manter_recuperacao',
    )
  })

  it('libera reenvio só quando a transação de fato não gravou', () => {
    expect(acaoPosFalhaFinalizar('Estoque insuficiente para um ou mais itens.')).toBe(
      'liberar_reenvio',
    )
  })
})
