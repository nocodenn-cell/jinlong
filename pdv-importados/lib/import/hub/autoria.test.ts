import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { carregarOperacao } from './dadosImportacoes'
import type { ClienteImport } from '@/lib/import/importIntelligence'

/**
 * CALC-001.1 / P8 — autoria exibida no histórico.
 * O nome mostrado vem de `public.usuarios.nome` do id persistido (`criado_por`, `por`, `enviado_por`);
 * nada é fixo no código. Um nome de perfil "Dono Demo" aparece se — e só se — for o cadastro desse id.
 */
const DONO = 'ac5baea3-0000-4000-8000-000000000001'
const OUTRO = 'bbbbbbbb-0000-4000-8000-000000000002'

function clienteFalso(tabelas: Record<string, unknown[]>) {
  const consultas: { tabela: string; filtros: [string, string, unknown][] }[] = []
  const from = (tabela: string) => ({
    select: () => {
      const reg = { tabela, filtros: [] as [string, string, unknown][] }
      consultas.push(reg)
      const resolver = () => {
        let linhas = (tabelas[tabela] ?? []) as Record<string, unknown>[]
        for (const [op, c, v] of reg.filtros) {
          linhas = linhas.filter((l) => (op === 'eq' ? l[c] === v : (v as unknown[]).includes(l[c])))
        }
        return linhas
      }
      const q: Record<string, unknown> = {
        eq: (c: string, v: unknown) => (reg.filtros.push(['eq', c, v]), q),
        in: (c: string, v: unknown[]) => (reg.filtros.push(['in', c, v]), q),
        order: () => q,
        limit: () => q,
        maybeSingle: () => Promise.resolve({ data: resolver()[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve({ data: resolver(), error: null }).then(ok, ko),
      }
      return q
    },
  })
  const rpc = () => Promise.resolve({ data: [], error: null })
  return { client: { from, rpc } as unknown as ClienteImport, consultas }
}

const operacao = { id: 'op1', criado_por: DONO, loja_importadora_id: 'l1', fornecedor_id: null }

describe('P8 — autoria: identidade persistida → nome exibido', () => {
  it('resolve o nome pelo id persistido em todas as trilhas (operação, apuração, aprovação, auditoria, documento)', async () => {
    const { client, consultas } = clienteFalso({
      import_operacoes: [operacao],
      import_apuracoes: [{ operacao_id: 'op1', criado_por: DONO }],
      import_aprovacoes: [{ operacao_id: 'op1', por: DONO }],
      import_auditoria: [{ operacao_id: 'op1', por: DONO }, { operacao_id: 'op1', por: OUTRO }],
      import_documentos: [{ operacao_id: 'op1', enviado_por: DONO }],
      usuarios: [{ id: DONO, nome: 'Fulano Real' }, { id: OUTRO, nome: 'Ciclano' }, { id: 'zz', nome: 'Dono Demo' }],
    })
    const r = await carregarOperacao(client, 'op1')
    expect(r?.usuarios).toEqual({ [DONO]: 'Fulano Real', [OUTRO]: 'Ciclano' })
    // Só busca nomes dos ids persistidos — nunca um usuário "padrão" ou de demonstração.
    const busca = consultas.find((c) => c.tabela === 'usuarios')!
    expect(busca.filtros).toEqual([['in', 'id', [DONO, OUTRO]]])
  })

  it('o nome exibido é o cadastro do próprio id: perfil chamado "Dono Demo" aparece como tal (dado, não código)', async () => {
    const { client } = clienteFalso({
      import_operacoes: [operacao],
      import_auditoria: [{ operacao_id: 'op1', por: DONO }],
      usuarios: [{ id: DONO, nome: 'Dono Demo' }],
    })
    const r = await carregarOperacao(client, 'op1')
    expect(r?.usuarios[DONO]).toBe('Dono Demo')
  })

  it('sem cadastro visível, não inventa nome (a tela cai no prefixo do id)', async () => {
    const { client } = clienteFalso({ import_operacoes: [operacao], usuarios: [] })
    const r = await carregarOperacao(client, 'op1')
    expect(r?.usuarios).toEqual({})
  })
})
