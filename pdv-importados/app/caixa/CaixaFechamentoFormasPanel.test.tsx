import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CaixaFechamentoFormasPanel } from '@/app/caixa/CaixaFechamentoFormasPanel'
import { getMessages } from '@/i18n/getMessages'

const m = getMessages('pt')

describe('CaixaFechamentoFormasPanel', () => {
  it('erro RPC não vira R$ 0,00', () => {
    const html = renderToStaticMarkup(
      <CaixaFechamentoFormasPanel
        linhas={null}
        erro="timeout RPC"
        m={m}
        moeda="R$"
      />,
    )
    expect(html).toContain('data-testid="fechamento-formas-erro"')
    expect(html).toContain('timeout RPC')
    expect(html).not.toMatch(/R\$\s*0,00/)
  })

  it('DINHEIRO mostra esperado/informado; PIX só registrado Jinlong', () => {
    const html = renderToStaticMarkup(
      <CaixaFechamentoFormasPanel
        linhas={[
          {
            formaPagamento: 'DINHEIRO',
            metrica: 'E_C_AUTORIDADE',
            valorSistemaSnapshot: 115,
            valorInformado: 110,
            diferenca: -5,
            origemRegra: 'calcular_valor_sistema_por_forma_caixa',
          },
          {
            formaPagamento: 'PIX',
            metrica: 'REGISTRADO_JINLONG',
            valorSistemaSnapshot: 60,
            valorInformado: null,
            diferenca: null,
            origemRegra: 'calcular_valor_sistema_por_forma_caixa',
          },
        ]}
        erro={null}
        m={m}
        moeda="R$"
      />,
    )
    expect(html).toContain('fechamento-forma-DINHEIRO')
    expect(html).toContain('Esperado no caixa')
    expect(html).toContain('fechamento-forma-PIX')
    expect(html).toContain('Registrado no Jinlong')
    expect(html).toMatch(/não é saldo bancário/i)
  })
})
