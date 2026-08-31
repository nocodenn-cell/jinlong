/** @vitest-environment jsdom */
/**
 * Quick-create de marca (modo completo) vs refresh de `opcoesIniciais` enquanto
 * o modal permanece aberto — merge por id preserva a opção local e a seleção.
 * Paridade com ProdutoFormModal.categoriaOpcoes.behavior.test.tsx (IDs 121/122).
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

import { ProdutoFormModal } from '@/components/gerente/produtos/ProdutoFormModal'

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
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderCom(opcoes: Opcoes, open = true) {
  flushSync(() =>
    root.render(
      <ProdutoFormModal
        open={open}
        onOpenChange={vi.fn()}
        m={m}
        opcoes={opcoes}
        produto={null}
        onSaved={vi.fn()}
      />,
    ),
  )
}

async function abrirModoCompleto() {
  const marcaJaVisivel = () =>
    Array.from(container.querySelectorAll('select')).some((sel) =>
      Array.from(sel.options).some((o) => (o.textContent ?? '') === p.nenhuma_marca),
    )
  if (marcaJaVisivel()) return

  await vi.waitFor(() => {
    if (marcaJaVisivel()) return
    const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(p.modo_completo),
    )
    expect(toggle).toBeTruthy()
  })
  if (marcaJaVisivel()) return
  const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(p.modo_completo),
  ) as HTMLButtonElement
  flushSync(() => toggle.click())
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
  await abrirModoCompleto()
  const plus = Array.from(container.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === p.cadastro_rapido_marca,
  ) as HTMLButtonElement
  expect(plus).toBeTruthy()
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

describe('ProdutoFormModal — marca quick-create vs refresh de opções', () => {
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
        <ProdutoFormModal
          open
          onOpenChange={vi.fn()}
          m={m}
          opcoes={{ categorias: [], marcas: [], fornecedores: [] }}
          produto={null}
          onSaved={vi.fn()}
        />,
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
        <ProdutoFormModal
          open
          onOpenChange={vi.fn()}
          m={m}
          opcoes={{
            categorias: [],
            marcas: [{ id: MARCA_ID, nome: 'Jinlong Tools', ativo: true }],
            fornecedores: [],
          }}
          produto={null}
          onSaved={vi.fn()}
        />,
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

  it('fechar/reabrir modal → reconstrói opções a partir das props (sem fantasma local)', async () => {
    renderCom(opcoesVazias)
    await criarMarcaRapida('Jinlong Tools')
    await vi.waitFor(() => expect(selectMarca().value).toBe(MARCA_ID))

    renderCom(opcoesVazias, false)
    renderCom(
      {
        categorias: [],
        marcas: [{ id: 'marca-servidor', nome: 'Só servidor', ativo: true }],
        fornecedores: [],
      },
      true,
    )

    // Aguarda o reset de abertura (modoCompleto=false) — paint stale pode
    // ainda mostrar ComercialSection por um tick.
    await vi.waitFor(() => {
      const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes(p.modo_completo),
      )
      expect(toggle).toBeTruthy()
    })
    flushSync(() => {
      const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes(p.modo_completo),
      ) as HTMLButtonElement
      toggle.click()
    })

    await vi.waitFor(() => {
      const ids = Array.from(selectMarca().options).map((o) => o.value)
      expect(ids).toContain('marca-servidor')
      expect(ids).not.toContain(MARCA_ID)
    })
  })
})
