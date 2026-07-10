/**
 * Matriz de integração dos 4 pilares — contratos estáticos (próxima fase de auditoria).
 *
 * Cada linha aponta o elo de código que deve ser validado em testes de integração.
 * Expandir com testes RPC/E2E conforme a maturação do ambiente Supabase.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

function resolveArtefato(rel: string): string {
  return rel.startsWith('../') ? path.join(ROOT, rel) : path.join(ROOT, rel)
}

type PilarRow = Readonly<{
  origem: string
  destino: string
  validar: string
  artefatos: readonly { path: string; mustContain?: readonly string[] }[]
}>

const MATRIZ: readonly PilarRow[] = [
  {
    origem: 'PDV',
    destino: 'Venda',
    validar: 'baixa correta de estoque + registro CONCLUIDA',
    artefatos: [
      {
        path: 'app/caixa/server/caixaVendas.impl.ts',
        mustContain: ['finalizar_venda_transacional_canonica_v4'],
      },
      { path: 'app/caixa/finalizarVendaValidation.ts', mustContain: ['finalizarVendaInputSchema'] },
    ],
  },
  {
    origem: 'Venda',
    destino: 'Estoque',
    validar: 'saída de quantidade por item vendido',
    artefatos: [
      {
        path: 'app/caixa/server/caixaVendas.impl.ts',
        mustContain: ['estoque_baixado'],
      },
    ],
  },
  {
    origem: 'Venda',
    destino: 'Financeiro',
    validar: 'recebimento / fila fiscal enfileirada',
    artefatos: [
      {
        path: 'app/caixa/server/caixaVendas.impl.ts',
        mustContain: ['p_fiscal_auto_enqueue'],
      },
    ],
  },
  {
    origem: 'Cancelamento',
    destino: 'Estoque',
    validar: 'reposição + estoque_reposicoes_cancelamento',
    artefatos: [
      {
        path: 'app/caixa/server/caixaVendas.impl.ts',
        mustContain: ['cancelar_venda_transacional'],
      },
      {
        path: '../backend/supabase/migrations/229_venda_eventos_rpc_hooks.sql',
        mustContain: ['quantidade_atual = e.quantidade_atual +'],
      },
    ],
  },
  {
    origem: 'Cancelamento',
    destino: 'Caixa',
    validar: 'estorno saldo_atual + devolucoes',
    artefatos: [
      { path: 'app/caixa/server/cancelarVendaContrato.integration.test.ts', mustContain: ['devolucoes'] },
      {
        path: '../backend/supabase/migrations/229_venda_eventos_rpc_hooks.sql',
        mustContain: ['saldo_atual', 'devolucoes'],
      },
    ],
  },
  {
    origem: 'NF-e',
    destino: 'Produto',
    validar: 'criação ou associação de produto na importação',
    artefatos: [{ path: 'app/admin/estoque/importar-nfe/page.tsx' }],
  },
  {
    origem: 'NF-e',
    destino: 'Estoque',
    validar: 'entrada de quantidade pós-importação',
    artefatos: [{ path: 'app/gerente/estoque/importar-nfe/actions.ts' }],
  },
  {
    origem: 'Produto',
    destino: 'Etiqueta',
    validar: 'preço/código na impressão',
    artefatos: [
      {
        path: 'app/admin/estoque/imprimir-etiquetas/page.tsx',
        mustContain: ['ImprimirEtiquetasPageClient'],
      },
      {
        path: '../shared-core/navigation/routes.ts',
        mustContain: ['adminEtiquetasProdutoQuery'],
      },
    ],
  },
]

describe('Matriz pilares — integração (contratos estáticos)', () => {
  it.each(MATRIZ.map((row) => [row.origem, row.destino, row] as const))(
    '%s → %s',
    (_origem, _destino, row) => {
      for (const { path: artefato, mustContain } of row.artefatos) {
        const resolved = resolveArtefato(artefato)
        expect(fs.existsSync(resolved), `artefato ausente: ${artefato}`).toBe(true)
        if (mustContain?.length) {
          const src = fs.readFileSync(resolved, 'utf8')
          for (const needle of mustContain) {
            expect(src, `${artefato} deve referenciar ${needle}`).toContain(needle)
          }
        }
      }
    },
  )

  it('teste de integração dedicado ao cancelamento existe', () => {
    expect(exists('app/caixa/server/cancelarVendaContrato.integration.test.ts')).toBe(true)
    const src = read('app/caixa/server/cancelarVendaContrato.integration.test.ts')
    expect(src).toContain('ESTOQUE_APOS_CANCELAMENTO')
    expect(src).toContain('devolucoes')
  })
})
