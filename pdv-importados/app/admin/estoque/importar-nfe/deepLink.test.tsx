/**
 * BP-A3 — a página de destino precisa LER `?importacao=`. O builder sozinho
 * não basta: o mesmo defeito (link montado, destino que ignora o parâmetro) já
 * apareceu em Relatórios→Catálogo. Este teste cobre as duas pontas.
 */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { adminImportNfeImportacaoQuery, ROUTES } from '@shared-core/navigation/routes'

vi.mock('@/lib/admin/auth/loadAdminContext', () => ({
  loadAdminContext: vi.fn(async () => ({ session: { idioma: 'pt' } })),
}))
vi.mock('@/components/ui/admin-v2/EstoqueHubNav', () => ({
  EstoqueHubNav: () => null,
}))
vi.mock('@/app/gerente/estoque/importar-nfe/ImportarNfePageClient', () => ({
  ImportarNfePageClient: () => null,
}))

const { default: AdminEstoqueImportarNfePage } = await import('./page')
const { ImportarNfePageClient } = await import(
  '@/app/gerente/estoque/importar-nfe/ImportarNfePageClient'
)

function propsDoClient(el: React.ReactElement): Record<string, unknown> {
  const filhos = React.Children.toArray((el.props as { children: React.ReactNode }).children)
  const client = filhos.find(
    (c) => React.isValidElement(c) && c.type === ImportarNfePageClient,
  ) as React.ReactElement | undefined
  expect(client).toBeTruthy()
  return client!.props as Record<string, unknown>
}

describe('adminImportNfeImportacaoQuery (BP-A3)', () => {
  it('monta a URL canônica do admin com a importação na query string', () => {
    expect(adminImportNfeImportacaoQuery('imp-1')).toBe(`${ROUTES.admin.importNfe}?importacao=imp-1`)
  })

  it('nunca usa a árvore legada /gerente (o catch-all descarta a query)', () => {
    expect(adminImportNfeImportacaoQuery('imp-1').startsWith('/gerente')).toBe(false)
  })

  it('não adiciona query string para id vazio', () => {
    expect(adminImportNfeImportacaoQuery('')).toBe(ROUTES.admin.importNfe)
    expect(adminImportNfeImportacaoQuery('   ')).toBe(ROUTES.admin.importNfe)
  })
})

describe('/admin/estoque/importar-nfe — leitura de ?importacao= (BP-A3)', () => {
  it('repassa o id do link ao client', async () => {
    const el = (await AdminEstoqueImportarNfePage({
      searchParams: Promise.resolve({ importacao: 'imp-42' }),
    })) as React.ReactElement
    expect(propsDoClient(el).importacaoInicialId).toBe('imp-42')
  })

  it('sem parâmetro (ou vazio): não abre importação nenhuma', async () => {
    const semParam = (await AdminEstoqueImportarNfePage({
      searchParams: Promise.resolve({}),
    })) as React.ReactElement
    expect(propsDoClient(semParam).importacaoInicialId).toBeNull()

    const vazio = (await AdminEstoqueImportarNfePage({
      searchParams: Promise.resolve({ importacao: '   ' }),
    })) as React.ReactElement
    expect(propsDoClient(vazio).importacaoInicialId).toBeNull()
  })
})
