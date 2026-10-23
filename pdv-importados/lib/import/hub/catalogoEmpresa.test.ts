import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALIQUOTAS_UF, CATALOGO_TRIBUTARIO_DEMO, CATALOGO_TRIBUTARIO_PESQUISADO_PE, CATALOGO_TRIBUTARIO_VERSAO } from '@shared-core/src/import'
import { parametrosDaEmpresa, type DadosCatalogoEmpresa } from './catalogoEmpresa'
import { sugerirTributos } from './inteligencia'

const cfg = (uf: string, extra: Partial<NonNullable<DadosCatalogoEmpresa['config']>> = {}): DadosCatalogoEmpresa => ({
  config: { uf_importador: uf, porto_padrao: 'Porto do Recife', modal_padrao: 'MARITIMO', icms_efetivo_pct: null, regime_incentivo_nome: null, aviso_aceito_em: '2026-10-21T00:00:00Z', ...extra },
  overrides: [], tabela: [],
})
const item = { id: 'i1', operacao_id: 'o', descricao: 'Fictício', ncm: '85161000', moeda: 'BRL', valor_mercadoria_moeda: '1000', valor_aduaneiro_brl: null } as never

describe('catálogo por empresa', () => {
  it('sem configuração ⇒ catálogo de demonstração, exatamente como no #601', () => {
    const a = parametrosDaEmpresa(null)
    expect(a).toEqual({ parametros: [...CATALOGO_TRIBUTARIO_DEMO], versao: CATALOGO_TRIBUTARIO_VERSAO, nacional: false })
    expect(sugerirTributos([item], [], 'SP', '2026-10-21', a.parametros, a.versao)).toEqual(sugerirTributos([item], [], 'SP', '2026-10-21'))
    expect(parametrosDaEmpresa({ config: null, overrides: [], tabela: [] }).nacional).toBe(false)
  })
  it('PE configurado ⇒ ICMS/PIS/COFINS idênticos ao catálogo PE do #601', () => {
    const n = parametrosDaEmpresa(cfg('PE'))
    const r = sugerirTributos([item], [], 'PE', '2026-10-21', n.parametros, n.versao)
    const r0 = sugerirTributos([item], [], 'PE', '2026-10-21', CATALOGO_TRIBUTARIO_PESQUISADO_PE)
    for (const t of ['PIS_IMPORTACAO', 'ICMS']) {
      const s = (x: typeof r) => x.sugestoes.find((y) => y.tributo === t)
      expect(s(r)).toEqual(s(r0))
    }
    expect(r.totais.COFINS_IMPORTACAO).toBe(r0.totais.COFINS_IMPORTACAO)
  })
  it('% efetivo só vale para a UF do importador', () => {
    const d = cfg('SC', { icms_efetivo_pct: '2.6000' })
    expect(parametrosDaEmpresa(d).parametros.some((p) => p.id === 'cli-icms-efetivo')).toBe(true)
    expect(parametrosDaEmpresa(d, 'SP').parametros.some((p) => p.id === 'cli-icms-efetivo')).toBe(false)
  })
  it('seed da migração = constante embarcada (27 UFs, mesmos valores e vigências)', () => {
    const sql = readFileSync(join(__dirname, '../../../../backend/supabase/migrations/20261021210000_import_nacional_uf.sql'), 'utf8')
    const linhas = [...sql.matchAll(/\('pesq-icms-(\w\w)-modal', '(\w\w)', ([\d.]+), ([\d.]+), DATE '([\d-]+)', NULL, 'PESQUISADO'/g)]
    expect(linhas).toHaveLength(27)
    for (const a of ALIQUOTAS_UF) {
      const l = linhas.find((m) => m[2] === a.uf)!
      expect([l[3], l[4], l[5]]).toEqual([a.icms_modal_pct, a.fcp_geral_pct, a.vigencia_inicio])
    }
  })
})
