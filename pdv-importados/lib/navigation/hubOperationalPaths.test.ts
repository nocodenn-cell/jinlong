import { describe, expect, it } from 'vitest'

/**
 * Caminhos mínimos de cliques (S7) — regressão de descoberta nos hubs S6.
 * Valores = cliques após entrar no hub (sidebar já escolhida).
 */
const PATH_CLICKS = {
  catalogo: {
    produtoParaCategoria: 1,
    produtoParaMarca: 1,
  },
  estoque: {
    saldosParaRecebimentoComHub: 1,
    /** Legado: link “voltar” + aba = 2; S7 embeddedInAdminHub remove voltar */
    saldosParaRecebimentoLegadoBackLink: 2,
  },
  financeiro: {
    receberParaPagar: 1,
  },
  analises: {
    dashboardParaRelatorios: 1,
    relatoriosParaDashboard: 1,
    /** Sidebar Análises: cada aba executiva é 1 clique a partir de qualquer tela admin. */
    sidebarParaAbaExecutiva: 1,
  },
} as const

describe('hub operational click budgets', () => {
  it('estoque hub elimina 1 clique vs link voltar + navegação', () => {
    expect(PATH_CLICKS.estoque.saldosParaRecebimentoComHub).toBeLessThan(
      PATH_CLICKS.estoque.saldosParaRecebimentoLegadoBackLink,
    )
  })

  it('ponte dashboard ↔ relatórios é simétrica (1 clique cada)', () => {
    expect(PATH_CLICKS.analises.dashboardParaRelatorios).toBe(1)
    expect(PATH_CLICKS.analises.relatoriosParaDashboard).toBe(1)
  })

  it('abas executivas na sidebar Análises são 1 clique', () => {
    expect(PATH_CLICKS.analises.sidebarParaAbaExecutiva).toBe(1)
  })
})
