import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D5 — o parser passou a preservar zeros à esquerda (cProd "000123", cEAN "0789…").
 * Vínculos gravados antes da correção estão na forma antiga ("123", "789…").
 * O preview precisa: (1) reconhecer como antes via forma legada, marcando LEGADA;
 * (2) preferir o vínculo exato; (3) não usar o legado quando dois códigos da nota colidem.
 * Usa o parser REAL; só o Supabase é simulado.
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))

import { previewImportacaoNfe } from './actions'
import { referenciasLegadasAmbiguas } from '@/lib/nfe/referenciasLegadas'

type Vinculo = { ref_fornecedor: string; produto_id: string; produtos: { id: string; nome: string } }
type Produto = { id: string; nome: string; codigo_barras: string | null }

function supabaseFake(vinculos: Vinculo[], produtos: Produto[]) {
  const consultas: { tabela: string; refs?: string[] }[] = []
  const builder = (tabela: string) => {
    let filtroIn: string[] = []
    const q = {
      select: () => q,
      eq: () => q,
      in: (_c: string, v: string[]) => {
        filtroIn = v
        consultas.push({ tabela, refs: v })
        return q
      },
      or: () => q,
      maybeSingle: async () => (tabela === 'fornecedores' ? { data: { id: 'forn-1' }, error: null } : { data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => {
        if (tabela === 'vinculos_fornecedor_produto') {
          return Promise.resolve(res({ data: vinculos.filter((v) => filtroIn.includes(v.ref_fornecedor)), error: null }))
        }
        if (tabela === 'produtos') return Promise.resolve(res({ data: produtos, error: null }))
        return Promise.resolve(res({ data: [], error: null }))
      },
    }
    return q
  }
  return { client: { from: builder }, consultas }
}

const nfe = (dets: { cProd: string; cEAN?: string; xProd: string }[]) => `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe35200114349292000184550010000000101234567890">
  <ide><nNF>10</nNF></ide>
  <emit><CNPJ>14349292000184</CNPJ><xNome>Forn</xNome></emit>
  ${dets
    .map(
      (d, i) => `<det nItem="${i + 1}"><prod><cProd>${d.cProd}</cProd><cEAN>${d.cEAN ?? 'SEM GTIN'}</cEAN>
      <xProd>${d.xProd}</xProd><NCM>85444200</NCM><uCom>UN</uCom><qCom>1</qCom><vUnCom>1.00</vUnCom></prod></det>`,
    )
    .join('\n')}
</infNFe></NFe></nfeProc>`

async function preview(xml: string, vinculos: Vinculo[], produtos: Produto[] = []) {
  const fake = supabaseFake(vinculos, produtos)
  createClient.mockResolvedValue(fake.client)
  const r = await previewImportacaoNfe(xml)
  if (!r.success) throw new Error(r.error)
  const linhas = (r as unknown as { data: { linhas: { ref_fornecedor: string; status_produto: string; produto_id: string | null; referencia_match?: string }[] } }).data.linhas
  return { linhas, consultas: fake.consultas }
}

describe('preview NF-e — compatibilidade com vínculos legados (D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
    getGerenteLojaId.mockResolvedValue('loja-a')
  })

  it('reconhece pelo vínculo legado (mesmo resultado de antes) e marca LEGADA', async () => {
    const { linhas, consultas } = await preview(nfe([{ cProd: '000123', xProd: 'Parafuso' }]), [
      { ref_fornecedor: '123', produto_id: 'p-legado', produtos: { id: 'p-legado', nome: 'Parafuso' } },
    ])
    expect(linhas[0]).toMatchObject({ ref_fornecedor: '000123', status_produto: 'RECONHECIDO_DEPARA', produto_id: 'p-legado', referencia_match: 'LEGADA' })
    expect(consultas.find((c) => c.tabela === 'vinculos_fornecedor_produto')?.refs).toEqual(expect.arrayContaining(['000123', '123']))
  })

  it('prefere o vínculo exato quando os dois existem', async () => {
    const { linhas } = await preview(nfe([{ cProd: '000123', xProd: 'Parafuso' }]), [
      { ref_fornecedor: '123', produto_id: 'p-legado', produtos: { id: 'p-legado', nome: 'Legado' } },
      { ref_fornecedor: '000123', produto_id: 'p-exato', produtos: { id: 'p-exato', nome: 'Exato' } },
    ])
    expect(linhas[0]).toMatchObject({ produto_id: 'p-exato', referencia_match: 'EXATA' })
  })

  it('colisão na mesma nota ("0123" e "123"): não usa o legado e exige conferência', async () => {
    const { linhas } = await preview(
      nfe([
        { cProd: '0123', xProd: 'Item zero' },
        { cProd: '00123', xProd: 'Item dois zeros' },
      ]),
      [{ ref_fornecedor: '123', produto_id: 'p-legado', produtos: { id: 'p-legado', nome: 'Legado' } }],
    )
    expect(linhas.map((l) => [l.status_produto, l.referencia_match])).toEqual([
      ['DESCONHECIDO', 'AMBIGUA'],
      ['DESCONHECIDO', 'AMBIGUA'],
    ])
  })

  it('GTIN com zero à esquerda reconhece produto cadastrado na forma legada', async () => {
    const { linhas } = await preview(nfe([{ cProd: 'SKU-9', cEAN: '07891234567895', xProd: 'X' }]), [], [
      { id: 'p-ean', nome: 'X', codigo_barras: '7891234567895' },
    ])
    expect(linhas[0]).toMatchObject({ status_produto: 'RECONHECIDO_EAN', produto_id: 'p-ean', referencia_match: 'LEGADA' })
  })

  it('código sem zeros continua EXATA', async () => {
    const { linhas } = await preview(nfe([{ cProd: 'ABC-1', xProd: 'Y' }]), [
      { ref_fornecedor: 'ABC-1', produto_id: 'p1', produtos: { id: 'p1', nome: 'Y' } },
    ])
    expect(linhas[0]).toMatchObject({ produto_id: 'p1', referencia_match: 'EXATA' })
  })
})

describe('referenciasLegadasAmbiguas', () => {
  it('só marca legado com mais de um código atual distinto', () => {
    expect(
      referenciasLegadasAmbiguas([
        { atual: '0123', legado: '123' },
        { atual: '0123', legado: '123' },
        { atual: '00123', legado: '123' },
        { atual: 'A', legado: 'A' },
        { atual: null, legado: null },
      ]),
    ).toEqual(new Set(['123']))
  })
})
