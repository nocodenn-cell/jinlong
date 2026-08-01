/**
 * Onda B — recebimento auditável: contratos estáticos.
 *
 * Travam as três garantias da onda contra regressão:
 *   1. a quantidade esperada nunca é usada como se fosse conferida;
 *   2. confirmar exige ter passado pela conferência;
 *   3. a action não grava contagem no INSERT dos itens.
 *
 * Contexto: docs/ONDA_B_RECEBIMENTO.md
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '..', 'backend', 'supabase', 'migrations')
const MIGRATION_B = '20260801120000_recebimento_conferencia_explicita.sql'

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const migration = (nome: string) => fs.readFileSync(path.join(MIGRATIONS, nome), 'utf8')

describe('Onda B — conferência de recebimento é etapa real', () => {
  it('confirmar_remessa_entrada não usa mais a quantidade esperada como conferida', () => {
    const sql = migration(MIGRATION_B)
    const corpoConfirmar = sql.slice(sql.indexOf('FUNCTION public.confirmar_remessa_entrada'))

    // O COALESCE era o mecanismo exato que creditava o esperado sem contagem.
    expect(corpoConfirmar).not.toContain('COALESCE(i.quantidade_conferida, i.quantidade_esperada)')
    expect(corpoConfirmar).toContain('i.quantidade_conferida AS qtd')
  })

  it('confirmar exige status de conferência e nenhum item pendente', () => {
    const sql = migration(MIGRATION_B)
    const corpoConfirmar = sql.slice(sql.indexOf('FUNCTION public.confirmar_remessa_entrada'))

    expect(corpoConfirmar).toContain("v_status NOT IN ('CONFERIDO', 'DIVERGENTE')")
    expect(corpoConfirmar).toContain('RECEBIMENTO_CONFERENCIA_PENDENTE')
    expect(corpoConfirmar).toContain('i.quantidade_conferida IS NULL')
  })

  it('registrar_conferencia_remessa deriva o status dos itens', () => {
    const sql = migration(MIGRATION_B)
    expect(sql).toContain('FUNCTION public.registrar_conferencia_remessa')
    // Status é calculado, nunca recebido por parâmetro.
    expect(sql).toContain("v_novo_status := 'EM_CONFERENCIA'")
    expect(sql).toContain("v_novo_status := 'DIVERGENTE'")
    expect(sql).toContain("v_novo_status := 'CONFERIDO'")
    // Zero é contagem válida; negativo não.
    expect(sql).toContain('IF v_qtd IS NULL OR v_qtd < 0 THEN')
    expect(sql).toContain('RECEBIMENTO_QTD_CONFERIDA_INVALIDA')
  })

  it('CHECK de status inclui CONFERIDO e DIVERGENTE', () => {
    const sql = migration(MIGRATION_B)
    expect(sql).toContain(
      "CHECK (status IN ('RASCUNHO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CONCLUIDA', 'CANCELADA'))",
    )
  })

  it('origem vira coluna, sem transformar NF-e e OC em fluxos separados', () => {
    const sql = migration(MIGRATION_B)
    expect(sql).toContain("CHECK (origem_tipo IN ('NFE', 'ORDEM_COMPRA', 'SEM_DOCUMENTO'))")
    // As duas RPCs de origem seguem intocadas nesta onda.
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.importar_nfe_transacao')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.receber_ordem_compra')
  })

  it('a action abre, confere e confirma — nessa ordem', () => {
    const src = read('app/gerente/recebimento/actions.ts')
    const iInsert = src.indexOf(".from('remessa_itens')")
    const iConferir = src.indexOf('registrarConferenciaRemessa(')
    const iConfirmar = src.indexOf('confirmRemessaEntrada(')

    expect(iInsert).toBeGreaterThan(-1)
    expect(iConferir).toBeGreaterThan(iInsert)
    expect(iConfirmar).toBeGreaterThan(iConferir)
  })

  it('o INSERT dos itens não grava contagem', () => {
    const src = read('app/gerente/recebimento/actions.ts')
    const rows = src.slice(src.indexOf('const rows = input.itens.map'), src.indexOf(".from('remessa_itens')"))

    expect(rows).toContain('quantidade_esperada')
    // Gravar aqui seria repor o atalho: contagem só entra pela RPC de conferência.
    expect(rows).not.toContain('quantidade_conferida')
  })

  it('a tela existente continua enviando esperado e conferido no mesmo passo', () => {
    // Compatibilidade: a Onda B não mexe na UI. O operador segue com um clique;
    // o que mudou é o rastro no banco.
    const src = read('app/gerente/recebimento/RecebimentoGerentePageClient.tsx')
    expect(src).toContain('quantidade_esperada')
    expect(src).toContain('quantidade_conferida')
  })
})
