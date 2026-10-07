/**
 * Matriz de evidência SSOT-001..004 — testes estruturais (fonte versionada).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')
const mig = (name: string) =>
  readFileSync(join(ROOT, 'backend/supabase/migrations', name), 'utf8')
const app = (rel: string) => readFileSync(join(ROOT, 'pdv-importados', rel), 'utf8')
const docs = (rel: string) =>
  readFileSync(join(ROOT, 'docs/regras-negocio', rel), 'utf8')

describe('SSOT-001 — painel PDV usa E(c)', () => {
  const fix = mig('20261007163000_ssot_001_002_painel_ec_cache.sql')
  const violation = mig('20261005004647_financeiro_loja_contas_ledger.sql')

  it('documento classifica saldo_atual como cache', () => {
    const d = docs('SSOT_CAIXA_SALDO_CONTRATO.md')
    expect(d).toMatch(/projeção|cache/i)
    expect(d).toContain('valor_sistema_dinheiro')
    expect(d).toMatch(/não é source of truth/i)
  })

  it('achado histórico: painel original somava saldo_atual', () => {
    expect(violation).toContain('sum(saldo_atual)')
  })

  it('fix: patch troca saldo_pdv para internal.valor_sistema_dinheiro', () => {
    expect(fix).toContain('internal.valor_sistema_dinheiro')
    expect(fix).toContain('sum(saldo_atual)')
    expect(fix).toContain('SSOT-001 PROVA FAIL')
  })
})

describe('SSOT-002 — writers de cache derivados de E(c)', () => {
  const fix = mig('20261007163000_ssot_001_002_painel_ec_cache.sql')
  const movAr = mig('20261007170000_ssot_002_mov_ar_ec_cache.sql')

  it('trigger de venda usa sincronizar_saldo_cache', () => {
    expect(fix).toContain('PERFORM internal.sincronizar_saldo_cache(v_caixa_id)')
  })

  it('cancelar_venda guarda por E(c) e sincroniza cache', () => {
    const start = fix.indexOf('CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional')
    const end = fix.indexOf('$function$;', start)
    const body = fix.slice(start, end)
    expect(body).toContain('internal.valor_sistema_dinheiro(v_caixa.id)')
    expect(body).toContain('PERFORM internal.sincronizar_saldo_cache(v_caixa.id)')
    expect(body).toContain('CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE')
    expect(body).not.toContain('UPDATE public.caixas c SET saldo_atual')
  })

  it('sangria/suprimento/aprovação não incrementam saldo_atual; usam E(c)+sync', () => {
    expect(movAr).toContain('valor_sistema_dinheiro')
    expect(movAr).toContain('sincronizar_saldo_cache')
    expect(movAr).toContain('SSOT-002 PROVA FAIL: registrar_movimentacao ainda incrementa saldo_atual')
    expect(movAr).toContain('SSOT-002 PROVA FAIL: aprovar_movimentacao ainda incrementa saldo_atual')
  })

  it('liquidação/estorno AR materializam cache sem UPDATE incremental', () => {
    expect(movAr).toContain('SSOT-002 PROVA FAIL: liquidacao ainda UPDATE saldo_atual')
    expect(movAr).toContain('SSOT-002 PROVA FAIL: estorno AR ainda UPDATE saldo_atual')
  })

  it('contrato: saldo_atual é cache; SoT = E(C)', () => {
    const d = docs('SSOT_CAIXA_SALDO_CONTRATO.md')
    expect(d).toContain('E(C)')
    expect(d).toMatch(/projeção|cache/i)
    expect(d).toContain('sincronizar_saldo_cache')
    expect(d).toMatch(/não fonte canônica|não é source of truth/i)
  })
})

describe('SSOT-003 — obrigação financeira na aquisição', () => {
  const fix = mig('20261007163100_ssot_003_nfe_obrigacao_duplicata.sql')
  const policy = docs('SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md')

  it('política distingue OC/remessa sem obrigação vs NF-e com duplicatas', () => {
    expect(policy).toContain('ENTRADA_OC')
    expect(policy).toMatch(/sem.*obrigação/i)
    expect(policy).toContain('IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA')
    expect(policy).toContain('nfe_importacao_id')
    expect(policy).toMatch(/rastreio|Rastreio/i)
  })

  it('documenta resposta NF-e sem duplicatas (rejeição, não zona cinzenta)', () => {
    expect(policy).toMatch(/IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA/)
    expect(policy).toMatch(/não.*conclui|rejeit/i)
  })

  it('confirm NF-e rejeita econômico > 0 sem duplicatas', () => {
    expect(fix).toContain('IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA')
    expect(fix).toContain('v_econ > 0 AND v_n_dup = 0')
  })

  it('AP continua com origem nfe_importacao_id', () => {
    expect(fix).toContain('nfe_importacao_id')
    expect(fix).toContain('importacoes_nfe_duplicatas')
  })

  it('OC documentada como sem AP', () => {
    expect(fix).toContain('receber_ordem_compra')
    expect(fix).toContain('Sem obrigação financeira')
  })
})

describe('SSOT-004 — enqueue fiscal canônico', () => {
  const revoke = mig('20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql')
  const prior = mig('20261007161220_fiscal_cancelado_ssot.sql')
  const actions = app('app/gerente/financeiro/actions.ts')
  const gate = app('scripts/check-entity-ssot-boundary.mjs')
  const enqueue = app('app/caixa/server/caixaFiscalEnqueueServer.ts')

  it('stub enfileirarDocFiscalStub ausente das actions', () => {
    expect(actions).not.toContain('enfileirarDocFiscalStub')
    expect(actions).not.toContain(".from('documentos_fiscais_pendentes').insert")
  })

  it('gate check-entity-ssot proíbe reintroduzir stub e INSERT direto', () => {
    expect(gate).toContain("symbol: 'enfileirarDocFiscalStub'")
    expect(gate).toContain("table: 'documentos_fiscais_pendentes'")
  })

  it('enqueue canônico via RPC fiscal_enfileirar_documento_venda', () => {
    expect(enqueue).toContain("rpc('fiscal_enfileirar_documento_venda'")
  })

  it('sync-outbox também enfileira só via RPC canônica', () => {
    const sync = readFileSync(
      join(ROOT, 'backend/supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.ts'),
      'utf8',
    )
    expect(sync).toContain('fiscal_enfileirar_documento_venda')
    expect(sync).toMatch(/\.rpc\s*\(\s*["']fiscal_enfileirar_documento_venda["']/)
    expect(sync).not.toMatch(/\.from\s*\(\s*["']documentos_fiscais_pendentes["']\s*\)\s*\.insert/)
  })

  it('REVOKE INSERT authenticated presente (idempotente)', () => {
    expect(revoke).toContain('REVOKE INSERT ON public.documentos_fiscais_pendentes')
    expect(prior).toContain('REVOKE INSERT ON public.documentos_fiscais_pendentes')
    expect(revoke).toContain('SSOT-004 PROVA FAIL')
  })

  it('hotfix GRANT INSERT é anterior aos REVOKE SSOT-004 (ordem lexicográfica)', () => {
    const hotfix = '20260903180000_fiscal_hotfix_codex_review.sql'
    const r1 = '20261007161220_fiscal_cancelado_ssot.sql'
    const r2 = '20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql'
    expect(hotfix < r1).toBe(true)
    expect(r1 < r2).toBe(true)
    const hotfixSql = mig(hotfix)
    expect(hotfixSql).toContain('GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated')
    expect(revoke).toContain(
      "privilege_type = 'INSERT'",
    )
    expect(revoke).toContain("grantee = 'authenticated'")
  })
})

describe('Matriz REMEDIACAO documentada', () => {
  it('arquivo de validação existe com as quatro linhas', () => {
    const path = join(ROOT, 'docs/regras-negocio/REMEDIACAO_SSOT_001_004.md')
    expect(existsSync(path)).toBe(true)
    const md = readFileSync(path, 'utf8')
    for (const id of ['SSOT-001', 'SSOT-002', 'SSOT-003', 'SSOT-004']) {
      expect(md).toContain(id)
    }
    expect(md).toMatch(/\bGO\b|\bNO-GO\b/)
  })
})
