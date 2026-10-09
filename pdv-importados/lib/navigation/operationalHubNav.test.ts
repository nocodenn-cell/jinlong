import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { resolveActiveHubTabId } from './hubNavModel'
import {
  OPERATIONAL_HUB_IDS,
  buildOperationalHubTabs,
  type OperationalHubLabelSet,
} from './operationalHubNav'

const L: OperationalHubLabelSet = {
  vendasVendas: 'Vendas',
  vendasCaixas: 'Caixas',
  comprasPedidos: 'Pedidos de compra',
  comprasFornecedores: 'Fornecedores',
  pessoasClientes: 'Clientes',
  pessoasFuncionarios: 'Funcionários',
}

describe('hubs operacionais (UX-IA-01 PR 2)', () => {
  it('cada hub tem 2 abas com rótulo e rota canônica (ROUTES)', () => {
    for (const hub of OPERATIONAL_HUB_IDS) {
      const tabs = buildOperationalHubTabs(hub, L)
      expect(tabs).toHaveLength(2)
      for (const t of tabs) {
        expect(t.label).toBeTruthy()
        expect(t.href.startsWith('/admin/')).toBe(true)
      }
    }
  })

  it.each([
    ['vendas', ROUTES.admin.vendas, 'vendas'],
    ['vendas', ROUTES.admin.caixas, 'caixas'],
    ['compras', ROUTES.admin.compras, 'pedidos'],
    ['compras', ROUTES.admin.fornecedores, 'fornecedores'],
    ['pessoas', ROUTES.admin.clientes, 'clientes'],
    ['pessoas', ROUTES.admin.funcionarios, 'funcionarios'],
  ] as const)('hub %s: %s marca a aba %s', (hub, path, esperado) => {
    expect(resolveActiveHubTabId(path, buildOperationalHubTabs(hub, L))).toBe(esperado)
  })

  it('nenhuma rota pertence a dois hubs operacionais', () => {
    const hrefs = OPERATIONAL_HUB_IDS.flatMap((h) => buildOperationalHubTabs(h, L).map((t) => t.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
