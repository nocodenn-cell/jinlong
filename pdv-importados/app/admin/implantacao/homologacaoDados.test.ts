import { describe, expect, it } from 'vitest'
import {
  avaliarDadosHomologacao,
  formatarGapsHomologacao,
  type DadosHomologacaoSnapshot,
} from './homologacaoDados'

function snapOk(
  override: Partial<DadosHomologacaoSnapshot> = {},
): DadosHomologacaoSnapshot {
  return {
    donosAtivos: 1,
    gerentesAtivos: 1,
    operadoresAtivos: 2,
    categoriasProduto: 2,
    produtosPublicados: 5,
    produtosComEstoque: 4,
    clientes: 2,
    fornecedores: 1,
    temPdvConfig: true,
    formasPagamentoOk: true,
    impostosMinimosOk: true,
    ...override,
  }
}

describe('avaliarDadosHomologacao (P0-DADOS)', () => {
  it('ok quando todos os mínimos são atingidos', () => {
    const r = avaliarDadosHomologacao(snapOk())
    expect(r.ok).toBe(true)
    expect(r.gaps).toHaveLength(0)
  })

  it('falha sem produtos/estoque suficientes', () => {
    const r = avaliarDadosHomologacao(
      snapOk({ produtosPublicados: 1, produtosComEstoque: 0 }),
    )
    expect(r.ok).toBe(false)
    expect(r.gaps.map((g) => g.id)).toEqual(
      expect.arrayContaining(['cadastro.produtos', 'estoque.saldo']),
    )
  })

  it('falha sem operador ou pdv_config', () => {
    const r = avaliarDadosHomologacao(
      snapOk({ operadoresAtivos: 0, temPdvConfig: false }),
    )
    expect(r.ok).toBe(false)
    expect(r.gaps.map((g) => g.id)).toEqual(
      expect.arrayContaining(['usuarios.operadores', 'loja.pdv']),
    )
  })

  it('formata gaps para observação do checklist', () => {
    const r = avaliarDadosHomologacao(snapOk({ clientes: 0 }))
    expect(formatarGapsHomologacao(r.gaps)).toContain('cadastro.clientes')
    expect(formatarGapsHomologacao([])).toContain('OK')
  })
})
