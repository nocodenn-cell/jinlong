import { describe, expect, it } from 'vitest'
import {
  ROUTES,
  hrefComprasPorStatus,
  hrefImportacaoNfe,
} from '@shared-core/navigation/routes'
import { buildEstoqueHubTabs, type HubNavLabelSet } from './hubNavLabels'

const LABELS: HubNavLabelSet = {
  catalogoProdutos: 'Produtos',
  catalogoCategorias: 'Categorias',
  catalogoMarcas: 'Marcas',
  estoqueEntrada: 'Entrada',
  estoqueSaldos: 'Saldos',
  estoqueRecebimento: 'Recebimento',
  estoqueCompras: 'Compras',
  estoqueTransferencias: 'Transferências',
  estoqueImportarNfe: 'Importar NF-e',
  estoqueEtiquetas: 'Etiquetas',
  financeiroReceber: 'A receber',
  financeiroPagar: 'A pagar',
  financeiroFiscal: 'Fila fiscal',
  financeiroCategorias: 'Categorias',
}

describe('hub de Estoque — fluxo de suprimentos', () => {
  const tabs = buildEstoqueHubTabs(LABELS)
  const ids = tabs.map((t) => t.id)

  it('abre pela entrada de mercadoria — o operador começa pela pergunta, não pelo XML', () => {
    expect(ids[0]).toBe('entrada')
    expect(tabs[0].href).toBe(ROUTES.admin.estoqueEntrada)
  })

  it('traz Compras para dentro do hub (modelo mental do Bling: compra vive em Estoque)', () => {
    expect(ids).toContain('compras')
    expect(tabs.find((t) => t.id === 'compras')?.href).toBe(ROUTES.admin.compras)
  })

  it('mantém os destinos já existentes do hub', () => {
    expect(ids).toEqual(
      expect.arrayContaining(['saldos', 'recebimento', 'transferencias', 'importar-nfe', 'etiquetas']),
    )
  })
})

describe('atalhos entre Nota, Compra e Financeiro', () => {
  it('o atalho de ordens em trânsito já chega filtrado — não numa lista crua', () => {
    expect(hrefComprasPorStatus('EM_TRANSITO')).toBe(`${ROUTES.admin.compras}?status=EM_TRANSITO`)
  })

  it('o caminho de volta de Contas a pagar usa a rota canônica com ?id=', () => {
    const href = hrefImportacaoNfe('6f1d2c34-5678-4abc-9def-0123456789ab')

    expect(href).toBe(`${ROUTES.admin.importNfe}?id=6f1d2c34-5678-4abc-9def-0123456789ab`)
    // A rota legada /gerente/* perde a query no redirect — por isso não serve aqui.
    expect(href.startsWith('/gerente')).toBe(false)
  })
})
