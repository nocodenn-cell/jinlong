import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('caixa monta a fila PALM', () => {
  const src = readFileSync(join(__dirname, 'CaixaPageClient.tsx'), 'utf8')

  it('usa o hook isolado e não chama a finalização canônica por conta própria', () => {
    expect(src).toContain('usePalmPedidosCaixa')
    expect(src).not.toContain('finalizar_venda_transacional_canonica')
  })

  it('mostra a seção no trilho largo e no bloco estreito', () => {
    const trilho = src.slice(src.indexOf('rail_titulo_em_aberto'), src.indexOf('md:hidden'))
    const estreito = src.slice(src.indexOf('md:hidden'))
    expect(trilho).toContain('{secaoPedidosPalm}')
    expect(estreito).toContain('{secaoPedidosPalm}')
  })
})
