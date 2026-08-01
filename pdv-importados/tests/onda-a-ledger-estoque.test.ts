/**
 * Onda A — invariantes do ledger de estoque.
 *
 * Não corrigem divergência histórica: impedem que apareça divergência NOVA.
 * Todos são contratos estáticos (leem arquivo), sem banco — rodam em CI barato.
 *
 * Contexto: docs/AUDITORIA_ARQUITETURA_EVENTOS_JINLONG.md §6.1
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '..', 'backend', 'supabase', 'migrations')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function readMigration(nome: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, nome), 'utf8')
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome)
    if (fs.statSync(p).isDirectory()) {
      if (['node_modules', '.next', 'coverage', 'test-results'].includes(nome)) continue
      walk(p, acc)
    } else if (/\.tsx?$/.test(nome) && !/\.(test|spec)\.tsx?$/.test(nome)) {
      acc.push(p)
    }
  }
  return acc
}

describe('Onda A — saldo de estoque explicável pelo ledger', () => {
  it('criação de produto com saldo inicial delega à RPC que grava movimento', () => {
    // Nunca escrever saldo direto: quem move saldo é ajustar_estoque_manual, que
    // grava movimentos_estoque_log na mesma transação.
    const sql = readMigration('270_criar_produto_com_estoque_inicial.sql')
    expect(sql).toContain('PERFORM public.ajustar_estoque_manual(')

    // O INSERT em estoque da criação é a linha zerada (0,0) — saldo zero sem
    // movimento é consistente, soma vazia = 0.
    expect(sql).toContain('INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)')
    expect(sql).toContain('VALUES (v_produto_id, v_loja_id, 0, 0)')
  })

  it('ajustar_estoque_manual grava o DELTA, não o valor absoluto', () => {
    const sql = readMigration('269_ajustar_estoque_manual_service_ator.sql')
    expect(sql).toContain('v_delta := p_quantidade_atual - v_atual')
    expect(sql).toContain('INSERT INTO public.movimentos_estoque_log')
    // Movimento zero não é registrado — não polui o ledger.
    expect(sql).toContain('IF v_delta <> 0 THEN')
  })

  it('exclusão de produto é bloqueada quando há movimento de estoque', () => {
    // Por isso o DELETE em `estoque` da exclusão não destrói histórico: só roda
    // para produto sem nenhum movimento.
    const policy = fs.readFileSync(
      path.resolve(ROOT, '..', 'shared-core', 'src', 'products', 'policies', 'exclusionPolicy.ts'),
      'utf8',
    )
    expect(policy).toContain('facts.temMovimentosEstoque')
    expect(read('app/admin/produtos/productExclusion.ts')).toContain(
      "countByProdutoId(supabase, 'movimentos_estoque_log', id)",
    )
  })

  it('view de divergência existe e trata ausência de movimento como zero', () => {
    const sql = readMigration('20260801090000_v_estoque_ledger_divergencia.sql')
    expect(sql).toContain('CREATE OR REPLACE VIEW public.v_estoque_ledger_divergencia')
    expect(sql).toContain('COALESCE(l.soma_delta, 0)')
    // Sem security_invoker a view furaria a RLS de estoque/produtos.
    expect(sql).toContain('security_invoker = true')
  })

  /**
   * Guarda principal da onda: a lista de arquivos autorizados a escrever em
   * `estoque` fora das RPCs. Crescer esta lista é como divergência nova entra.
   */
  it('nenhum novo caminho de escrita direta em estoque', () => {
    const AUTORIZADOS = [
      // Cria a linha zerada de produtos legados (saldo 0 = consistente sem movimento).
      'app/gerente/estoque/actions.ts',
      // DELETE de compensação: produto recém-criado em lote que falhou.
      'app/gerente/produtos/actions.ts',
      // DELETE na exclusão de produto — bloqueada se houver movimento.
      'app/admin/produtos/productExclusion.ts',
    ]

    const encontrados = new Set<string>()
    for (const abs of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]) {
      const src = fs.readFileSync(abs, 'utf8')
      if (!/\.from\(\s*'estoque'\s*\)\s*\.(insert|update|delete|upsert)/.test(src)) continue
      encontrados.add(path.relative(ROOT, abs).split(path.sep).join('/'))
    }

    expect([...encontrados].sort()).toEqual([...AUTORIZADOS].sort())
  })

  it('nenhum caminho da aplicação faz UPDATE de saldo fora das RPCs', () => {
    // UPDATE de quantidade_atual é privativo das RPCs — só elas gravam o
    // movimento correspondente na mesma transação.
    const infratores: string[] = []
    for (const abs of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]) {
      const src = fs.readFileSync(abs, 'utf8')
      if (/\.from\(\s*'estoque'\s*\)\s*\.update/.test(src)) {
        infratores.push(path.relative(ROOT, abs).split(path.sep).join('/'))
      }
    }
    expect(infratores).toEqual([])
  })
})
