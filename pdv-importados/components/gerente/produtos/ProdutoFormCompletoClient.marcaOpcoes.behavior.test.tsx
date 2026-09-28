/** @vitest-environment jsdom */
/**
 * Quick-create de marca (Cadastro Completo) vs refresh de `opcoes` enquanto a
 * página permanece montada — merge por id preserva a opção local e a seleção.
 * Marca só existe no Completo desde a reforma Rápido/Completo — ver
 * `docs/PLANO_CADASTRO_PRODUTO_UX.md` (v2). Paridade com
 * ProdutoFormModal.categoriaOpcoes.behavior.test.tsx (categoria, que continua
 * no Rápido).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: vi.fn(),
  atualizarDadosProdutoGerente: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

const routerMock = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

const criarMarcaMock = vi.fn()

vi.mock('@/app/gerente/marcas-produtos/actions', () => ({
  criarMarcaProduto: (...args: unknown[]) => criarMarcaMock(...args),
}))

vi.mock('@/app/gerente/categorias-produtos/actions', () => ({
  criarCategoriaProduto: vi.fn(),
}))

vi.mock('@/app/gerente/fornecedores/actions', () => ({
  salvarFornecedorAction: vi.fn(),
  buscarFornecedoresPaginadosAction: vi.fn().mockResolvedValue({
    success: true,
    data: { rows: [], total: 0, page: 1, pageSize: 20 },
  }),
}))

import { ProdutoFormCompletoClient } from '@/components/gerente/produtos/ProdutoFormCompletoClient'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

const m = getMessages('pt')
const p = m.produtos
const MARCA_ID = 'marca-nova-uuid'

type Opcoes = {
  categorias: { id: string; nome: string; ativo?: boolean }[]
  marcas: { id: string; nome: string; ativo?: boolean }[]
  fornecedores: { id: string; nome: string }[]
}

const opcoesVazias: Opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarMarcaMock.mockReset()
  criarMarcaMock.mockResolvedValue({ success: true, data: { id: MARCA_ID } })
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

function renderCom(opcoes: Opcoes) {
  flushSync(() =>
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <ProdutoFormCompletoClient
          produtoInicial={null}
          opcoes={opcoes}
          m={m}
          idioma="pt"
        />
      </AdminV2SessionProvider>,
    ),
  )
}

function selectMarca(): HTMLSelectElement {
  const vazio = p.nenhuma_marca
  const found = Array.from(container.querySelectorAll('select')).find((sel) =>
    Array.from(sel.options).some((o) => (o.textContent ?? '') === vazio),
  ) as HTMLSelectElement | undefined
  expect(found, 'select de marca').toBeTruthy()
  return found!
}

async function criarMarcaRapida(nome: string) {
  const plus = Array.from(container.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === p.cadastro_rapido_marca,
  ) as HTMLButtonElement
  expect(plus, 'botão de cadastro rápido de marca').toBeTruthy()
  flushSync(() => plus.click())

  const nomeInput = container.querySelector('#cadastro-rapido-nome') as HTMLInputElement
  expect(nomeInput).toBeTruthy()
  setInputValue(nomeInput, nome)

  const salvarRapido = Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === m.comum.salvar && !b.disabled,
  ) as HTMLButtonElement
  expect(salvarRapido).toBeTruthy()
  flushSync(() => salvarRapido.click())
  await vi.waitFor(() => expect(criarMarcaMock).toHaveBeenCalled())
}

describe('ProdutoFormCompletoClient — marca quick-create vs refresh de opções', () => {
  it('criar marca → aparece imediatamente e fica selecionada', async () => {
    renderCom(opcoesVazias)
    await criarMarcaRapida('Jinlong Tools')
    await vi.waitFor(() => {
      const sel = selectMarca()
      expect(Array.from(sel.options).map((o) => o.value)).toContain(MARCA_ID)
      expect(sel.value).toBe(MARCA_ID)
    })
  })

  it('refresh com props sem a marca → continua disponível e selecionada', async () => {
    renderCom(opcoesVazias)
    await criarMarcaRapida('Jinlong Tools')
    await vi.waitFor(() => expect(selectMarca().value).toBe(MARCA_ID))

    flushSync(() =>
      root.render(
        <AdminV2SessionProvider idioma="pt">
          <ProdutoFormCompletoClient
            produtoInicial={null}
            opcoes={{ categorias: [], marcas: [], fornecedores: [] }}
            m={m}
            idioma="pt"
          />
        </AdminV2SessionProvider>,
      ),
    )

    await vi.waitFor(() => {
      const sel = selectMarca()
      expect(Array.from(sel.options).map((o) => o.value)).toContain(MARCA_ID)
      expect(sel.value).toBe(MARCA_ID)
    })
  })

  it('refresh posterior com marca no servidor → não duplica', async () => {
    renderCom(opcoesVazias)
    await criarMarcaRapida('Jinlong Tools')
    await vi.waitFor(() => expect(selectMarca().value).toBe(MARCA_ID))

    flushSync(() =>
      root.render(
        <AdminV2SessionProvider idioma="pt">
          <ProdutoFormCompletoClient
            produtoInicial={null}
            opcoes={{
              categorias: [],
              marcas: [{ id: MARCA_ID, nome: 'Jinlong Tools', ativo: true }],
              fornecedores: [],
            }}
            m={m}
            idioma="pt"
          />
        </AdminV2SessionProvider>,
      ),
    )

    await vi.waitFor(() => {
      const ids = Array.from(selectMarca().options)
        .map((o) => o.value)
        .filter(Boolean)
      expect(ids.filter((id) => id === MARCA_ID)).toHaveLength(1)
      expect(selectMarca().value).toBe(MARCA_ID)
    })
  })

  it('nova montagem da página (navegação) → reconstrói opções a partir das props (sem fantasma local)', async () => {
    renderCom(opcoesVazias)
    await criarMarcaRapida('Jinlong Tools')
    await vi.waitFor(() => expect(selectMarca().value).toBe(MARCA_ID))

    // Simula sair da página e entrar de novo (unmount + mount), equivalente
    // a uma navegação real entre `/admin/catalogo/novo/completo` em duas idas.
    flushSync(() => root.unmount())
    root = createRoot(container)
    renderCom({
      categorias: [],
      marcas: [{ id: 'marca-servidor', nome: 'Só servidor', ativo: true }],
      fornecedores: [],
    })

    await vi.waitFor(() => {
      const ids = Array.from(selectMarca().options).map((o) => o.value)
      expect(ids).toContain('marca-servidor')
      expect(ids).not.toContain(MARCA_ID)
    })
  })
})
