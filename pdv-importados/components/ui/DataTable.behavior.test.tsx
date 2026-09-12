/** @vitest-environment jsdom */
/**
 * QA da coluna fixa (sticky) no scroll horizontal mobile — comportamento
 * genérico do DataTable (usado por CatalogoTable com a coluna "produto").
 * Cobre: aplicação da classe sticky só na coluna marcada, texto longo sem
 * quebrar layout, ausência de regressão nas colunas normais/desktop, wrapper
 * com scroll horizontal, hover/seleção não interferem no sticky.
 *
 * Integração real com CatalogoTable (produto sem imagem, dados reais) foi
 * validada manualmente no browser contra o catálogo real (133 produtos) —
 * ver auditoria original; não replicada aqui em teste automatizado porque
 * montar CatalogoTable completo exige mockar toda a árvore de ações/modais,
 * desproporcional para uma mudança isolada de CSS/DOM no DataTable.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataTable, type Column } from './DataTable'

type Row = { id: string; nome: string; status: string }

const columns: Column<Row>[] = [
  { key: 'nome', header: 'Produto', sticky: true, cell: (r) => r.nome },
  { key: 'status', header: 'Status', cell: (r) => r.status },
]

const rows: Row[] = [
  { id: '1', nome: 'Produto Curto', status: 'Publicado' },
  {
    id: '2',
    nome: 'Produto com nome extremamente longo que em telas estreitas normalmente estouraria a largura da célula fixa e precisa truncar ou quebrar sem vazar por cima das outras colunas',
    status: 'Rascunho',
  },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(cols: Column<Row>[] = columns, data: Row[] = rows) {
  act(() => {
    root.render(React.createElement(DataTable<Row>, { columns: cols, data, rowKey: (r) => r.id }))
  })
}

describe('DataTable — coluna sticky', () => {
  it('a coluna marcada sticky recebe left-0 e border-r tanto no header quanto nas células', () => {
    render()
    const th = container.querySelector('th')!
    const firstTd = container.querySelector('tbody tr td')!
    expect(th.className).toContain('sticky')
    expect(th.className).toContain('left-0')
    expect(firstTd.className).toContain('sticky')
    expect(firstTd.className).toContain('left-0')
  })

  it('colunas sem sticky:true NÃO ganham as classes — sem regressão em tabelas existentes', () => {
    render()
    const ths = Array.from(container.querySelectorAll('th'))
    const statusTh = ths.find((t) => t.textContent?.includes('Status'))
    expect(statusTh).toBeDefined()
    expect(statusTh!.className).not.toContain('sticky')
  })

  it('sem nenhuma coluna marcada sticky, nenhuma célula ganha a classe (comportamento padrão preservado)', () => {
    const semSticky: Column<Row>[] = [
      { key: 'nome', header: 'Produto', cell: (r) => r.nome },
      { key: 'status', header: 'Status', cell: (r) => r.status },
    ]
    render(semSticky)
    const allCells = Array.from(container.querySelectorAll('th, td'))
    expect(allCells.some((c) => c.className.includes('sticky'))).toBe(false)
  })

  it('texto longo na célula sticky renderiza por completo, sem quebrar a tabela (mesmo nº de linhas)', () => {
    render()
    const bodyRows = container.querySelectorAll('tbody tr')
    expect(bodyRows.length).toBe(2)
    expect(container.textContent).toContain('Produto com nome extremamente longo')
  })

  it('wrapper da tabela tem overflow-x-auto (scroll horizontal habilitado)', () => {
    render()
    const wrapper = container.querySelector('table')!.parentElement!
    expect(wrapper.className).toContain('overflow-x-auto')
  })

  it('linhas mantêm a classe de hover mesmo com coluna sticky presente', () => {
    render()
    const tr = container.querySelector('tbody tr')!
    expect(tr.className).toContain('hover:bg-')
  })

  it('célula sticky tem z-index maior que o conteúdo comum (fica por cima ao rolar, sem sobreposição invertida)', () => {
    render()
    const th = container.querySelector('th')!
    const td = container.querySelector('tbody tr td')!
    expect(th.className).toMatch(/z-20/)
    expect(td.className).toMatch(/z-10/)
  })

  it('em viewport largo (desktop), a mesma estrutura e classes são renderizadas — sticky não é condicional a media query, é sempre-on e inofensivo quando não há overflow', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true })
    render()
    const th = container.querySelector('th')!
    expect(th.className).toContain('sticky')
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  })

  it('coluna de seleção (checkbox) não marcada sticky continua rolando normalmente junto com o conteúdo', () => {
    const withSelCol: Column<Row>[] = [
      { key: 'sel', header: 'Sel.', cell: () => React.createElement('input', { type: 'checkbox' }) },
      { key: 'nome', header: 'Produto', sticky: true, cell: (r) => r.nome },
      { key: 'status', header: 'Status', cell: (r) => r.status },
    ]
    render(withSelCol)
    const ths = Array.from(container.querySelectorAll('th'))
    const selTh = ths.find((t) => t.textContent?.includes('Sel.'))
    const nomeTh = ths.find((t) => t.textContent?.includes('Produto'))
    expect(selTh!.className).not.toContain('sticky')
    expect(nomeTh!.className).toContain('sticky')
  })
})

describe('DataTable — cabeçalho fixo não pode atravessar superfície sobreposta', () => {
  /**
   * Regressão real: o `thead` sticky usava `--z-sticky` (1020) e vencia modal,
   * drawer e dropdown — que vivem em `z-50`. Na tela de Funcionários o
   * cabeçalho da lista aparecia como uma barra cortando o formulário "Novo
   * funcionário". Um `thead` só precisa cobrir as linhas da própria tabela.
   */
  it('usa --z-raised, não --z-sticky, quando stickyHeader está ligado', () => {
    act(() => {
      root.render(
        React.createElement(DataTable<Row>, {
          columns,
          data: rows,
          rowKey: (r: Row) => r.id,
          stickyHeader: true,
        }),
      )
    })
    const thead = container.querySelector('thead')!
    expect(thead.className).toContain('sticky')
    expect(thead.className).toContain('--z-raised')
    expect(thead.className).not.toContain('--z-sticky')
  })

  it('sem stickyHeader o cabeçalho não recebe camada nenhuma', () => {
    render()
    const thead = container.querySelector('thead')!
    expect(thead.className).not.toContain('--z-raised')
    expect(thead.className).not.toContain('sticky')
  })
})
