// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { caixaErroOperador } from '@/app/caixa/server/caixaErroOperador'

describe('caixaErroOperador', () => {
  it('não expõe rpcErr nem fetch_failed', () => {
    expect(caixaErroOperador('rpcErr: connection failed')).toBe(
      'Não foi possível concluir. Tente novamente.',
    )
    expect(caixaErroOperador('fetch_failed: CAIXA_NOT_FOUND')).toBe(
      'Não foi possível concluir. Tente novamente.',
    )
  })

  it('mapeia movimentações pendentes', () => {
    expect(caixaErroOperador('FECHAR_CAIXA_MOVIMENTACOES_PENDENTES')).toBe(
      'Há movimentações de caixa pendentes. Resolva as pendências antes de fechar.',
    )
  })

  // A versão zh ficou de fora quando o texto pt foi corrigido e passou meses
  // dizendo «有待完成的销售。» ("há vendas pendentes") para um bloqueio que é de
  // fluxo de caixa — mandando o operador chinês procurar uma venda inexistente.
  it('mapeia movimentações pendentes em zh — fluxo de caixa, não venda', () => {
    const zh = caixaErroOperador('FECHAR_CAIXA_MOVIMENTACOES_PENDENTES', 'zh')
    expect(zh).toContain('流水')
    expect(zh).not.toContain('销售')
  })

  it('oculta mensagens de migration', () => {
    expect(
      caixaErroOperador('function calcular_valor does not exist — Aplique migrations 048'),
    ).toBe('Caixa indisponível no momento.')
  })

  it('mapeia estoque insuficiente da RPC canônica', () => {
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_ESTOQUE:SEM_SALDO')).toBe(
      'Estoque insuficiente para um ou mais itens. Ajuste o carrinho e tente novamente.',
    )
  })

  it('mapeia saldo de caixa insuficiente no cancelamento — dinheiro, não estoque (PT e 中文)', () => {
    // A string contém "INSUFICIENTE"; sem a regra própria cairia na mensagem de
    // estoque e mandaria o operador "ajustar o carrinho" de uma venda que ele
    // está tentando cancelar.
    const pt = caixaErroOperador('CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE')
    expect(pt).toContain('Dinheiro em caixa insuficiente')
    expect(pt).toContain('suprimento')
    expect(pt).not.toContain('carrinho')

    const zh = caixaErroOperador('CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE', 'zh')
    expect(zh).toContain('现金不足')
    expect(zh).not.toMatch(/[a-zA-Z]/)
  })

  it('mapeia divergência de preço', () => {
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:abc')).toContain(
      'preços do carrinho mudaram',
    )
  })

  it('mapeia saldo pendente sem cliente', () => {
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_SALDO_PENDENTE_EXIGE_CLIENTE')).toContain(
      'cliente',
    )
  })

  // Regressão: caixaVendas.impl.ts (guarda de caixa fechado ao finalizar
  // venda, quando a query de "caixa aberto" não retorna linha, sem erro de
  // banco) roteia por este texto para reaproveitar a tradução já existente
  // em vez de manter um literal PT hardcoded fora do pipeline.
  it('mapeia caixa fechado ao finalizar venda (PT e 中文)', () => {
    expect(caixaErroOperador('caixa fechado ao finalizar venda')).toBe(
      'Caixa fechado. Abra o caixa antes de finalizar a venda.',
    )
    expect(caixaErroOperador('caixa fechado ao finalizar venda', 'zh')).toBe(
      '收银台已关闭。请先开启收银台再完成销售。',
    )
  })

  it('mapeia BR-01 limite de crédito (excedido, token obrigatório, inválido e já usado) para a mesma mensagem acionável', () => {
    const esperado = 'Venda excede o limite de crédito do cliente — autorização do gerente necessária.'
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_EXCEDIDO:100/50')).toBe(esperado)
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_OBRIGATORIO')).toBe(esperado)
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO')).toBe(esperado)
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_JA_USADO')).toBe(esperado)
  })

  it('mapeia VENDAS_SUSPENSAS como regra, não como falha transitória (PT e 中文)', () => {
    const pt = caixaErroOperador('VENDAS_SUSPENSAS')
    expect(pt).toContain('suspensas')
    expect(pt).not.toContain('Tente novamente')
    expect(caixaErroOperador('FINALIZAR_VENDA_VENDAS_SUSPENSAS', 'zh')).toContain('暂停销售')
  })

  it("mapeia fechamento com vendas em espera (D-06) — PT e 中文, sem vazar o código", () => {
    const pt = caixaErroOperador("FECHAR_CAIXA_VENDAS_EM_ESPERA", "pt")
    expect(pt).toContain("vendas em espera")
    expect(pt).not.toContain("FECHAR_CAIXA")
    expect(caixaErroOperador("FECHAR_CAIXA_VENDAS_EM_ESPERA", "zh")).toContain("挂起的销售")
  })
})

describe('caixaErroOperador: registro do fallback genérico', () => {
  it('registra no servidor o detalhe bruto quando cai no fallback, sem alterar a mensagem', () => {
    const logs: string[] = []
    const original = console.error
    console.error = (msg: unknown) => {
      logs.push(String(msg))
    }
    try {
      const texto = caixaErroOperador('Database connection error.')
      expect(texto).toBe('Não foi possível concluir. Tente novamente.')
      expect(logs).toHaveLength(1)
      const evento = JSON.parse(logs[0])
      expect(evento.evento).toBe('caixa.erro_operador.fallback')
      expect(evento.motivo).toBe('nao_mapeado')
      expect(evento.detalhe).toBe('Database connection error.')
    } finally {
      console.error = original
    }
  })

  it('registra motivo "vazio" quando não há detalhe', () => {
    const logs: string[] = []
    const original = console.error
    console.error = (msg: unknown) => {
      logs.push(String(msg))
    }
    try {
      expect(caixaErroOperador(null)).toBe('Não foi possível concluir. Tente novamente.')
      expect(JSON.parse(logs[0]).motivo).toBe('vazio')
    } finally {
      console.error = original
    }
  })

  it('não registra quando a mensagem é mapeada', () => {
    const logs: string[] = []
    const original = console.error
    console.error = (msg: unknown) => {
      logs.push(String(msg))
    }
    try {
      caixaErroOperador('fechar_caixa_movimentacoes_pendentes')
      expect(logs).toHaveLength(0)
    } finally {
      console.error = original
    }
  })

  // Sprint UX 2026-11-27: códigos do banco que não são transitórios não podem cair em
  // "tente novamente" — o operador repetiria uma ação que nunca vai passar.
  describe('códigos não transitórios têm mensagem própria (pt e zh)', () => {
    const PADRAO_PT = 'Não foi possível concluir. Tente novamente.'
    const PADRAO_ZH = '当前无法完成该操作。请稍后再试。'
    const casos: Array<[string, string]> = [
      ['PAGAMENTO_SEM_CONTA_FINANCEIRA', 'conta financeira'],
      ['CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO', 'Abra o caixa'],
      ['CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO', 'mais de um caixa aberto'],
      ['CANCELAR_VENDA_JA_CANCELADA', 'já foi cancelada'],
      ['CANCELAR_VENDA_NAO_ENCONTRADA', 'não encontrada'],
      ['CANCELAR_VENDA_SEM_PERMISSAO', 'permissão'],
      ['FECHAR_CAIXA_SEM_PERMISSAO', 'permissão'],
      ['CANCELAR_VENDA_MOTIVO_OBRIGATORIO', 'motivo'],
      ['motivo_obrigatorio', 'motivo'],
      ['FECHAR_CAIXA_EM_USO_OUTRO_OPERADOR', 'outro operador'],
      ['FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE', 'já foi fechado'],
      ['FECHAR_CAIXA_SESSAO_EXPIRADA', 'Sessão expirada'],
      ['CANCELAR_VENDA_AUTH', 'Sessão expirada'],
    ]
    it.each(casos)('%s → mensagem acionável', (codigo, trecho) => {
      const pt = caixaErroOperador(`ERROR: ${codigo}`)
      expect(pt).not.toBe(PADRAO_PT)
      expect(pt).toContain(trecho)
      expect(caixaErroOperador(codigo, 'zh')).not.toBe(PADRAO_ZH)
    })

    it('estorno sem caixa aberto não vira "caixa fechado" de finalizar venda', () => {
      expect(caixaErroOperador('CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO')).not.toContain('finalizar')
    })

    it('saldo de caixa insuficiente no estorno continua com a saída de suprimento', () => {
      expect(caixaErroOperador('CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE')).toContain('suprimento')
    })
  })
})
