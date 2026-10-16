import { describe, expect, it } from 'vitest'
import { buildAbrirGavetaEscPos, buildReciboEscPos } from './escpos'
import { buildReciboLabels, type ReciboVenda } from '@/lib/caixa/reciboTypes'
import { getMessages } from '@/i18n/getMessages'

const labels = buildReciboLabels(getMessages('pt'))

const vendaBase: ReciboVenda = {
  vendaId: 'venda-teste-0001',
  data: new Date('2026-08-27T12:00:00Z'),
  clienteNome: null,
  itens: [
    { nome: 'Produto teste', quantidade: 2, precoUnitario: 10, precoOriginal: 10, tipoPreco: 'VAREJO' },
  ],
  pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 20 }],
  totalBruto: 20,
  totalDesconto: 0,
  totalLiquidoComGerente: 20,
  descontoGerentePercentual: 0,
  valorDescontoGerente: 0,
  moeda: 'R$',
}

// Decodifica só a faixa imprimível (CP1252 ~= Latin-1 nos bytes que este
// builder efetivamente emite) — suficiente para localizar texto nos testes,
// sem duplicar a tabela de acentuação de `encodeCp1252`.
function decode(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => String.fromCharCode(b))
    .join('')
}

describe('buildReciboEscPos — cliente no cabeçalho (fechamento S6)', () => {
  it('venda com cliente: o texto decodificado do buffer contém "Cliente: <nome>"', () => {
    const venda: ReciboVenda = { ...vendaBase, clienteNome: 'Maria Silva' }
    const texto = decode(buildReciboEscPos(venda, labels))
    expect(texto).toContain(`${labels.cliente}: Maria Silva`)
  })

  it('venda sem cliente (anônima): nenhuma linha de cliente aparece, recibo continua válido', () => {
    const texto = decode(buildReciboEscPos(vendaBase, labels))
    expect(texto).not.toContain(`${labels.cliente}:`)
    // corpo do cupom continua íntegro
    expect(texto).toContain('Produto teste')
    expect(texto).toContain(labels.titulo)
  })

  it('reimpressão sem cliente disponível (clienteNome null) também não quebra o recibo', () => {
    const venda: ReciboVenda = { ...vendaBase, clienteNome: null }
    const texto = decode(buildReciboEscPos(venda, labels))
    expect(texto).not.toContain(`${labels.cliente}:`)
    expect(texto).toContain('#' + venda.vendaId.slice(0, 8).toUpperCase())
  })

  it('nome de cliente maior que a largura da coluna é truncado, sem quebrar a formatação de duas colunas', () => {
    const nomeLongo = 'Nome de Cliente Extremamente Longo Que Excede A Largura Da Bobina'
    const venda: ReciboVenda = { ...vendaBase, clienteNome: nomeLongo }
    const buffer = buildReciboEscPos(venda, labels, 32)
    const texto = decode(buffer)
    const linhaCliente = `${labels.cliente}: ${nomeLongo}`.slice(0, 32)
    expect(texto).toContain(linhaCliente)
    expect(texto).not.toContain(nomeLongo) // versão integral (não truncada) não deve aparecer
  })

  it('não altera nenhum outro conteúdo do recibo (itens, totais, pagamentos, rodapé) em relação à venda sem cliente', () => {
    const semCliente = decode(buildReciboEscPos(vendaBase, labels))
    const comCliente = decode(
      buildReciboEscPos({ ...vendaBase, clienteNome: 'João' }, labels),
    )

    // Remove só a linha do cliente (e o LF que a segue) da versão "com cliente"
    // e as duas strings devem ficar idênticas — prova que nada mais mudou.
    const linhaClienteComLf = `${labels.cliente}: João\n`
    expect(comCliente).toContain(linhaClienteComLf)
    expect(comCliente.replace(linhaClienteComLf, '')).toBe(semCliente)
  })
})

describe('buildReciboEscPos — descontos (sem duplicidade com o desconto do gerente)', () => {
  it('desconto de item + gerente: "Desconto produtos" mostra só a parte dos itens', () => {
    const venda: ReciboVenda = {
      ...vendaBase,
      totalBruto: 100,
      totalDesconto: 15, // já inclui os 5 do gerente
      valorDescontoGerente: 5,
      descontoGerentePercentual: 5,
      totalLiquidoComGerente: 85,
    }
    const texto = decode(buildReciboEscPos(venda, labels, 48))
    const linhas = texto.split('\n')
    const linhaProdutos = linhas.find((l) => l.includes(labels.descontoProdutos))
    const linhaGerente = linhas.find((l) => l.includes(labels.descontoGerente))
    expect(linhaProdutos?.trimEnd().endsWith('- R$ 10.00')).toBe(true)
    expect(linhaGerente?.trimEnd().endsWith('- R$ 5.00')).toBe(true)
    expect(texto).not.toContain('- R$ 15.00')
  })

  it('só desconto do gerente: a linha "Desconto produtos" não é impressa', () => {
    const venda: ReciboVenda = {
      ...vendaBase,
      totalBruto: 100,
      totalDesconto: 5,
      valorDescontoGerente: 5,
      descontoGerentePercentual: 5,
      totalLiquidoComGerente: 95,
    }
    const texto = decode(buildReciboEscPos(venda, labels))
    expect(texto).not.toContain(labels.descontoProdutos)
    expect(texto).toContain(labels.descontoGerente)
  })

  it('sem desconto: nenhuma linha de desconto nem subtotal', () => {
    const texto = decode(buildReciboEscPos(vendaBase, labels))
    expect(texto).not.toContain(labels.descontoProdutos)
    expect(texto).not.toContain(labels.descontoGerente)
    expect(texto).not.toContain(labels.subtotal)
  })
})

describe('buildReciboEscPos — cabeçalho: loja e 2ª via', () => {
  it('com loja: o nome da loja abre o cabeçalho, antes do título', () => {
    const texto = decode(buildReciboEscPos({ ...vendaBase, lojaNome: 'Loja Centro' }, labels))
    expect(texto).toContain('Loja Centro')
    expect(texto.indexOf('Loja Centro')).toBeLessThan(texto.indexOf(labels.titulo))
  })

  it('nome de loja maior que a bobina é truncado', () => {
    const longo = 'Loja Com Um Nome Absurdamente Grande Para A Bobina'
    const texto = decode(buildReciboEscPos({ ...vendaBase, lojaNome: longo }, labels, 32))
    expect(texto).toContain(longo.slice(0, 32))
    expect(texto).not.toContain(longo)
  })

  it('segunda via: imprime a marca; original não imprime', () => {
    const via = decode(buildReciboEscPos({ ...vendaBase, segundaVia: true }, labels))
    const original = decode(buildReciboEscPos(vendaBase, labels))
    expect(via).toContain(labels.segundaVia)
    expect(original).not.toContain(labels.segundaVia)
  })

  it('sem loja e sem 2ª via: cabeçalho idêntico ao anterior (só título, data e id)', () => {
    const texto = decode(buildReciboEscPos(vendaBase, labels))
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
  })
})


describe('gaveta de dinheiro — comando isolado', () => {
  it('gera ESC p para o pino 2 com pulso delimitado', () => {
    expect(Array.from(buildAbrirGavetaEscPos())).toEqual([0x1b, 0x70, 0, 50, 50])
  })

  it('não abre a gaveta na impressão ou reimpressão do cupom', () => {
    for (const segundaVia of [false, true]) {
      const data = Array.from(buildReciboEscPos({ ...vendaBase, segundaVia }, labels))
      expect(data.join(',')).not.toContain(Array.from(buildAbrirGavetaEscPos()).join(','))
    }
  })
})
