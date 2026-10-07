/**
 * PR B — gates estruturais: UI consome RPC; sem recalcular PIX no React;
 * fechamento cego não pré-expõe por-forma.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

describe('PR B fechamento por forma — estrutural', () => {
  const mig = read(
    'backend/supabase/migrations/20261007190000_caixas_fechamento_formas_snapshot.sql',
  )
  const panel = read('pdv-importados/app/caixa/CaixaFechamentoFormasPanel.tsx')
  const page = read('pdv-importados/app/caixa/CaixaPageClient.tsx')
  const impl = read('pdv-importados/app/caixa/server/fechamentoPorForma.impl.ts')
  const topBar = read('pdv-importados/app/caixa/CaixaPdvTopBar.tsx')

  it('snapshot é auditável e não SSoT', () => {
    expect(mig).toContain('SNAPSHOT_AUDITAVEL')
    expect(mig).toContain('caixas_fechamento_formas')
    expect(mig).toContain('persistir_fechamento_formas')
    expect(mig).toContain('ON CONFLICT (caixa_id, forma_pagamento) DO NOTHING')
  })

  it('fechar_caixa_atomico persiste snapshot no mesmo TX', () => {
    expect(mig).toContain('PERFORM internal.persistir_fechamento_formas')
    expect(mig).toContain('FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE')
  })

  it('UI não soma vendas_pagamentos / PIX no client', () => {
    expect(panel).not.toMatch(/vendas_pagamentos/)
    expect(page).not.toMatch(/vendas_pagamentos/)
    expect(impl).toContain('listar_caixas_fechamento_formas')
    expect(impl).not.toMatch(/\.from\(['\"]vendas_pagamentos['\"]\)/)
  })

  it('linguagem nega saldo bancário / liquidação', () => {
    expect(panel).toContain('fechamento_forma_registrado_jinlong')
    expect(panel).toContain('fechamento_formas_nota_nao_banco')
  })

  it('fechamento cego: topbar continua ocultando fundo quando blind', () => {
    expect(topBar).toContain('blindClosureEnabled')
    expect(topBar).toMatch(/!caixaStatus\.blindClosureEnabled/)
  })

  it('página não chama listar/por_forma antes do fechar', () => {
    // Pré-fechamento só abre modal de valor contado; snapshot vem do resultado do fechar.
    expect(page).toContain('formas: res.formas')
    expect(page).not.toMatch(/calcular_valor_sistema_por_forma_caixa/)
  })
})
