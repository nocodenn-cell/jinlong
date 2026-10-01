/** @vitest-environment jsdom */
/**
 * UX-017 — Cadastro Completo: "permitir abaixo do custo" e custo médio ficam junto dos preços (não numa
 * seção Compra distante) e a barra Cancelar/Salvar fica fixa no rodapé (sticky) durante a rolagem.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'

const uploadImagemProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  atualizarDadosProdutoGerente: vi.fn().mockResolvedValue({ success: true, data: null }),
  criarProduto: vi.fn().mockResolvedValue({ success: true, data: { id: 'p-1' } }),
  uploadImagemProduto: (...args: unknown[]) => uploadImagemProdutoMock(...args),
  removerImagemProduto: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

vi.mock('@/app/gerente/produtos/precosAtacadoActions', () => ({
  criarFaixaAtacado: vi.fn().mockResolvedValue({ success: true, data: null }),
  listarFaixasAtacado: vi.fn().mockResolvedValue({ success: true, data: [] }),
  atualizarFaixaAtacado: vi.fn().mockResolvedValue({ success: true, data: null }),
  inativarFaixaAtacado: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

vi.mock('@/app/gerente/produtos/historicoPrecosActions', () => ({
  listarHistoricoPrecos: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

const routerMock = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

import { ProdutoFormCompletoClient } from '@/components/gerente/produtos/ProdutoFormCompletoClient'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

const produto = {
  id: 'prod-1',
  nome: 'Caneca Térmica',
  codigo_barras: '7891234567890',
  codigo_interno: null,
  referencia_fornecedor: null,
  nome_reduzido_pdv: null,
  localizacao_prateleira: null,
  preco_varejo: 25,
  preco_atacado: null,
  preco_custo: 10,
  preco_custo_medio: 10,
  estoque_minimo: 1,
  permitir_abaixo_custo: false,
  quantidade_gatilho_atacado: null,
  quantidade_atual: 5,
  origem: 'china_manual',
  tem_nf: false,
  ativo: true,
  status_publicacao: 'PUBLICADO',
  imagem_url: null,
  categoria_id: null,
  marca_id: null,
  fornecedor_id: null,
  unidade_medida: 'UN',
  observacao: null,
  tags: null,
  ncm: null,
  cfop_produto: null,
  csosn: null,
  cest: null,
  cst_pis: null,
  cst_cofins: null,
} as unknown as ProdutoGerenteRow

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  uploadImagemProdutoMock.mockReset()
  uploadImagemProdutoMock.mockResolvedValue({
    success: true,
    data: { imagem_url: 'https://cdn.exemplo/nova.png' },
  })
  routerMock.push.mockReset()
  routerMock.replace.mockReset()
  routerMock.refresh.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})


function montar() {
  flushSync(() =>
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <ProdutoFormCompletoClient produtoInicial={produto} opcoes={opcoes} m={m} idioma="pt" />
      </AdminV2SessionProvider>,
    ),
  )
}

describe('ProdutoFormCompletoClient — UX-017', () => {
  it('abaixo do custo e custo médio ficam DENTRO da seção de precificação', () => {
    montar()
    const precos = container.querySelector('#produto-secao-precos') as HTMLElement
    const bloco = precos.querySelector('[data-testid="precos-compra"]') as HTMLElement
    expect(bloco).toBeTruthy()
    expect(bloco.textContent).toContain(m.produtos.permitir_abaixo_custo)
    expect(bloco.textContent).toContain(m.produtos.custo_medio_label)
    expect(bloco.textContent).toContain('R$')
  })

  it('não existe mais a seção "Compra" separada', () => {
    montar()
    expect(container.querySelector('#produto-secao-compra')).toBeNull()
  })

  it('a barra de ações com Salvar é sticky no rodapé', () => {
    montar()
    const barra = container.querySelector('[data-testid="produto-completo-acoes"]') as HTMLElement
    expect(barra.className).toContain('sticky')
    expect(barra.className).toContain('bottom-0')
    const salvar = Array.from(barra.querySelectorAll('button')).find((b) => b.textContent === m.produtos.editar_modal_salvar)
    expect(salvar).toBeTruthy()
  })

  it('o checkbox continua alterando o estado do formulário', () => {
    montar()
    const check = container.querySelector('[data-testid="precos-compra"] input[type="checkbox"]') as HTMLInputElement
    expect(check.checked).toBe(false)
    flushSync(() => check.click())
    expect((container.querySelector('[data-testid="precos-compra"] input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
  })
})
