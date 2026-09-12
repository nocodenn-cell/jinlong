/** @vitest-environment jsdom */
/**
 * O que a lista de ordens de compra tem de mostrar e de permitir.
 *
 * Três coisas guardadas aqui:
 * 1. **Contexto na URL** — situação, busca e a ordem aberta. Antes eram estado
 *    local: voltar do detalhe ou recarregar perdia o filtro, e não havia como
 *    apontar para uma ordem específica.
 * 2. **Vínculo visível** — a NF-e ligada à ordem e o título gerado existiam no
 *    banco e não apareciam em Compras.
 * 3. **Dupla entrada explicada antes do clique** — com a nota já confirmada, o
 *    banco recusa o recebimento (`OC_NFE_JA_CREDITADA`); a tela precisa dizer
 *    isso em vez de deixar o operador esbarrar no erro.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replaceSpy = vi.fn()
const refreshSpy = vi.fn()
let paramsAtuais = new URLSearchParams()

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) => React.createElement('a', { href, ...rest }, children),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, refresh: refreshSpy, push: vi.fn() }),
  usePathname: () => '/admin/compras',
  useSearchParams: () => paramsAtuais,
}))

vi.mock('@/app/gerente/compras/actions', () => ({
  listarOrdensCompra: vi.fn(async () => ({ rows: [], total: 0 })),
  atualizarStatusOC: vi.fn(async () => ({ success: true, data: null })),
  obterOrdemCompraDetalhe: vi.fn(async () => ({ success: true, data: null })),
}))

vi.mock('@/app/gerente/compras/OcFormModal', () => ({
  OcFormModal: () => React.createElement('div', { 'data-testid': 'oc-form' }),
}))
vi.mock('@/app/gerente/compras/OcDetalheModal', () => ({
  OcDetalheModal: ({ ocId }: { ocId: string }) =>
    React.createElement('div', { 'data-testid': 'oc-detalhe', 'data-oc': ocId }),
}))

const { ComprasContent } = await import('@/app/admin/compras/_components/ComprasContent')
// `PageHeader` monta a barra utilitária, que lê o idioma do contexto do shell.
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

type Props = React.ComponentProps<typeof ComprasContent>
type Oc = Props['inicial']['rows'][number]

function oc(over: Partial<Oc> = {}): Oc {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    fornecedor_id: 'f1',
    fornecedor_nome: 'Importadora Yiwu',
    status: 'EM_TRANSITO',
    data_emissao: '2026-09-01',
    data_prevista_chegada: '2026-09-20',
    data_vencimento: '2026-10-01',
    observacao: null,
    total_itens: 3,
    valor_total: 600,
    created_at: '2026-09-01T10:00:00Z',
    nfe_id: null,
    nfe_numero: null,
    nfe_status: null,
    titulo_id: null,
    titulo_status: null,
    titulo_valor: null,
    ...over,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  replaceSpy.mockClear()
  refreshSpy.mockClear()
  paramsAtuais = new URLSearchParams()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function render(rows: Oc[], extra: Partial<Props> = {}) {
  flushSync(() => {
    root.render(
      React.createElement(
        AdminV2SessionProvider,
        { idioma: 'pt' },
        React.createElement(ComprasContent, {
          idioma: 'pt',
          kpisIniciais: {
            total_rascunho: 1,
            total_confirmadas: 2,
            total_em_transito: 3,
            valor_em_transito: 900,
          },
          inicial: { rows, total: rows.length },
          fornecedores: [],
          produtos: [],
          ...extra,
        } as Props),
      ),
    )
  })
}

function textoDaTabela(): string {
  return (container.querySelector('table')?.textContent ?? '').replace(/\s+/g, ' ')
}

function abrirMenu(indice = 0): HTMLElement[] {
  const g = Array.from(
    container.querySelectorAll<HTMLButtonElement>('tbody button[aria-haspopup="menu"]'),
  )[indice]
  expect(g).toBeDefined()
  flushSync(() => g.click())
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

describe('vencimento na lista', () => {
  it('mostra o prazo, que é o campo que decide se nasce conta a pagar', () => {
    render([oc()])
    expect(textoDaTabela()).toContain('01/10/2026')
  })

  it('ordem sem prazo é marcada como "sem prazo", não como campo vazio', () => {
    render([oc({ data_vencimento: null })])
    expect(textoDaTabela()).toContain('sem prazo')
  })
})

describe('vínculos visíveis', () => {
  it('sem NF-e e sem título, a coluna de vínculo fica explicitamente vazia', () => {
    render([oc()])
    expect(textoDaTabela()).toContain('—')
  })

  it('NF-e vinculada aparece com o número da nota', () => {
    render([oc({ nfe_id: 'imp-1', nfe_numero: '23577', nfe_status: 'EM_CONFERENCIA' })])
    expect(textoDaTabela()).toContain('NF-e #23577')
  })

  it('título gerado aparece com o valor', () => {
    render([oc({ status: 'RECEBIDA', titulo_id: 'ap-1', titulo_status: 'PENDENTE', titulo_valor: 600 })])
    const texto = textoDaTabela()
    expect(texto).toContain('Conta a pagar')
    expect(texto).toContain('600,00')
  })
})

describe('ações de linha por situação', () => {
  it('rascunho oferece confirmar, editar e cancelar', () => {
    render([oc({ status: 'RASCUNHO' })])
    const rotulos = abrirMenu().map((el) => el.textContent)
    expect(rotulos).toEqual([
      'Abrir detalhe',
      'Confirmar ordem',
      'Editar ordem',
      'Cancelar ordem',
    ])
  })

  it('confirmada oferece marcar em trânsito', () => {
    render([oc({ status: 'CONFIRMADA' })])
    expect(abrirMenu().map((el) => el.textContent)).toContain('Marcar em trânsito')
  })

  it('em trânsito oferece conferir e receber', () => {
    render([oc({ status: 'EM_TRANSITO' })])
    expect(abrirMenu().map((el) => el.textContent)).toContain('Conferir e receber')
  })

  it('recebida não oferece nenhuma transição, só leitura', () => {
    render([oc({ status: 'RECEBIDA' })])
    expect(abrirMenu().map((el) => el.textContent)).toEqual(['Abrir detalhe'])
  })

  it('atalhos para a NF-e e para o título aparecem quando existem', () => {
    render([
      oc({
        status: 'RECEBIDA',
        nfe_id: 'imp-1',
        nfe_numero: '23577',
        nfe_status: 'CONCLUIDA',
        titulo_id: 'ap-1',
      }),
    ])
    const rotulos = abrirMenu().map((el) => el.textContent)
    expect(rotulos).toContain('Abrir NF-e vinculada')
    expect(rotulos).toContain('Abrir conta a pagar gerada')
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'))
    expect(links.some((a) => a.getAttribute('href')?.includes('id=imp-1'))).toBe(true)
  })
})

describe('guarda de dupla entrada', () => {
  it('com a NF-e já confirmada, receber fica desabilitado e explicado', () => {
    render([oc({ status: 'EM_TRANSITO', nfe_id: 'imp-1', nfe_numero: '23577', nfe_status: 'CONCLUIDA' })])
    const receber = abrirMenu().find((el) => el.textContent === 'Conferir e receber') as HTMLButtonElement
    expect(receber.disabled).toBe(true)
    expect(receber.getAttribute('title')).toContain('já entrou pela NF-e')
  })

  it('com a nota ainda em conferência, receber continua disponível', () => {
    render([oc({ status: 'EM_TRANSITO', nfe_id: 'imp-1', nfe_status: 'EM_CONFERENCIA' })])
    const receber = abrirMenu().find((el) => el.textContent === 'Conferir e receber') as HTMLButtonElement
    expect(receber.disabled).toBe(false)
  })
})

describe('contexto na URL', () => {
  it('escolher uma situação escreve o filtro na URL e volta para a primeira página', () => {
    render([oc()])
    const chip = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Em trânsito',
    )
    flushSync(() => chip?.click())
    expect(replaceSpy).toHaveBeenCalledWith('/admin/compras?status=EM_TRANSITO', { scroll: false })
  })

  it('abrir o detalhe endereça a ordem na URL', () => {
    render([oc()])
    const detalhe = abrirMenu().find((el) => el.textContent === 'Abrir detalhe')
    flushSync(() => detalhe?.click())
    expect(replaceSpy).toHaveBeenCalledWith(
      '/admin/compras?oc=aaaaaaaa-1111-4111-8111-111111111111',
      { scroll: false },
    )
  })

  it('com `?oc=` na URL, o detalhe já abre no carregamento', () => {
    paramsAtuais = new URLSearchParams({ oc: 'aaaaaaaa-1111-4111-8111-111111111111' })
    render([oc()])
    const detalhe = container.querySelector('[data-testid="oc-detalhe"]')
    expect(detalhe?.getAttribute('data-oc')).toBe('aaaaaaaa-1111-4111-8111-111111111111')
  })

  it('limpar filtros remove situação e busca da URL', () => {
    paramsAtuais = new URLSearchParams({ status: 'RASCUNHO', q: 'yiwu' })
    render([oc({ status: 'RASCUNHO' })])
    const limpar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Limpar filtros'),
    )
    flushSync(() => limpar?.click())
    expect(replaceSpy).toHaveBeenCalledWith('/admin/compras', { scroll: false })
  })
})

describe('cancelamento', () => {
  it('declara as consequências e não pede um motivo que seria descartado', () => {
    render([oc({ status: 'CONFIRMADA' })])
    const cancelar = abrirMenu().find((el) => el.textContent === 'Cancelar ordem')
    flushSync(() => cancelar?.click())

    const modal = document.querySelector('[data-testid="cancelar-oc-modal"]')
    expect(modal).not.toBeNull()
    expect(modal?.textContent).toContain('Nada é retirado do estoque')
    // `ordens_compra` não tem coluna de motivo: nenhum campo de texto aqui.
    expect(modal?.querySelector('textarea')).toBeNull()
    // …e, por isso, o modal não pode prometer que um motivo fica registrado.
    expect(modal?.textContent).not.toContain('motivo')
  })

  it('avisa que o cancelamento é irreversível, porque CANCELADA não tem volta', () => {
    render([oc({ status: 'CONFIRMADA' })])
    const cancelar = abrirMenu().find((el) => el.textContent === 'Cancelar ordem')
    flushSync(() => cancelar?.click())

    const modal = document.querySelector('[data-testid="cancelar-oc-modal"]')
    expect(modal?.textContent).toContain('Não dá para reabrir a ordem depois')
  })
})
