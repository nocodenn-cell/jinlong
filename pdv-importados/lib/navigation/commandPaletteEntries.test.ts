import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { flattenAdminV2Nav } from '@/lib/navigation/adminV2SidebarNav'
import {
  buildCommandEntries,
  normalizeForSearch,
  searchCommandEntries,
  type CommandEntry,
} from './commandPaletteEntries'

function entries(idioma: 'pt' | 'zh', admin: boolean): CommandEntry[] {
  const m = getMessages(idioma)
  return buildCommandEntries({
    admin: m.admin,
    chineseLanguage: idioma === 'zh',
    adminUi: m.admin_ui,
    showAdminOnlyItems: admin,
  })
}
const hrefs = (e: CommandEntry[]) => e.map((x) => x.href)

describe('paleta de comandos — entradas', () => {
  it('não repete destino (um href = uma entrada)', () => {
    const h = hrefs(entries('pt', true))
    expect(new Set(h).size).toBe(h.length)
  })

  it('só aponta para rotas do painel ou do PDV (nada externo)', () => {
    for (const e of entries('pt', true)) {
      expect(e.href.startsWith('/admin') || e.href === ROUTES.caixa.home, e.href).toBe(true)
    }
  })

  it('inclui tudo que a sidebar do gerente mostra', () => {
    const h = new Set(hrefs(entries('pt', false)))
    for (const item of flattenAdminV2Nav().filter((i) => !i.adminOnly)) {
      expect(h.has(item.href), item.href).toBe(true)
    }
  })

  it('alcança as páginas que só existem em barras de abas', () => {
    const h = new Set(hrefs(entries('pt', false)))
    for (const href of [
      ROUTES.admin.caixas,
      ROUTES.admin.fornecedores,
      ROUTES.admin.funcionarios,
      ROUTES.admin.categoriasProdutos,
      ROUTES.admin.marcasProdutos,
      ROUTES.admin.estoqueRecebimento,
      ROUTES.admin.estoqueMovimentacoes,
      ROUTES.admin.estoqueTransferencias,
      ROUTES.admin.estoqueImprimirEtiquetas,
      ROUTES.admin.importNfe,
      ROUTES.admin.categoriasFinanceiras,
      '/admin/financeiro?tab=pagar',
      '/admin/financeiro?tab=conciliacao',
    ]) {
      expect(h.has(href), href).toBe(true)
    }
  })

  it('ferramentas internas só aparecem para ADMIN (mesma regra da sidebar)', () => {
    const internos = [ROUTES.admin.provisionamento, ROUTES.admin.implantacao, ROUTES.admin.diagnosticoCaixa]
    const gerente = new Set(hrefs(entries('pt', false)))
    const admin = new Set(hrefs(entries('pt', true)))
    for (const href of internos) {
      expect(gerente.has(href), `gerente ${href}`).toBe(false)
      expect(admin.has(href), `admin ${href}`).toBe(true)
    }
  })

  it('traz a ação "Novo produto" apontando para o cadastro', () => {
    const e = entries('pt', false).find((x) => x.href === ROUTES.admin.catalogoNovo)
    expect(e?.label).toBe('Novo produto')
    expect(e?.kind).toBe('acao')
  })

  it('em chinês os rótulos saem em chinês e o português vira texto secundário', () => {
    const inicio = entries('zh', false).find((x) => x.href === ROUTES.admin.dashboard)
    expect(inicio?.label).toBe('首页')
    expect(inicio?.secondary).toBe('Início')
  })
})

describe('paleta de comandos — busca', () => {
  const pt = entries('pt', false)

  it('consulta vazia devolve tudo', () => {
    expect(searchCommandEntries(pt, '  ')).toHaveLength(pt.length)
  })

  it('ignora acento e caixa', () => {
    expect(normalizeForSearch('Funcionários')).toBe('funcionarios')
    expect(searchCommandEntries(pt, 'COMISSOES').map((e) => e.href)).toContain(ROUTES.admin.comissoes)
    expect(searchCommandEntries(pt, 'funcionario').map((e) => e.href)).toContain(ROUTES.admin.funcionarios)
  })

  it('prefixo do rótulo vem primeiro', () => {
    expect(searchCommandEntries(pt, 'caix')[0]?.href).toBe(ROUTES.admin.caixas)
  })

  it('todos os termos precisam casar (E, não OU)', () => {
    const r = searchCommandEntries(pt, 'contas pagar')
    expect(r.length).toBeGreaterThan(0)
    for (const e of r) {
      const hay = normalizeForSearch(`${e.label} ${e.secondary} ${e.group} ${e.keywords}`)
      expect(hay.includes('contas') && hay.includes('pagar')).toBe(true)
    }
  })

  it('busca por grupo: "financeiro" lista as abas do Financeiro', () => {
    const h = searchCommandEntries(pt, 'financeiro').map((e) => e.href)
    expect(h).toContain('/admin/financeiro?tab=receber')
    expect(h).toContain(ROUTES.admin.comissoes)
  })

  it('acha pelo jeito que o lojista fala (sinônimos)', () => {
    const top = (q: string) => searchCommandEntries(pt, q)[0]?.href
    expect(top('contas a pagar')).toBe('/admin/financeiro?tab=pagar')
    expect(top('fiado')).toBe('/admin/financeiro?tab=receber')
    expect(top('sangria')).toBe(ROUTES.admin.caixas)
    expect(top('xml')).toBe(ROUTES.admin.importNfe)
    expect(top('codigo de barras')).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
  })

  it('com a UI em chinês, digitar o grupo em português acha as abas dele (ex.: "estoque")', () => {
    const zh = entries('zh', false)
    const h = searchCommandEntries(zh, 'estoque').map((e) => e.href)
    expect(h).toContain(ROUTES.admin.estoqueMovimentacoes)
    expect(h).toContain(ROUTES.admin.estoqueTransferencias)
  })

  it('sem resultado devolve lista vazia', () => {
    expect(searchCommandEntries(pt, 'zzzxxx')).toEqual([])
  })

  it('com a UI em chinês, ainda acha digitando em português', () => {
    const zh = entries('zh', false)
    expect(searchCommandEntries(zh, 'estoque').map((e) => e.href)).toContain(ROUTES.admin.estoque)
    expect(searchCommandEntries(zh, '库存').map((e) => e.href)).toContain(ROUTES.admin.estoque)
  })
})
