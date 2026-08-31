import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260830110000_fix_confirmar_nfe_margem_nao_bloqueia_estoque.sql',
  import.meta.url,
)
const sql = readFileSync(migrationUrl, 'utf8')

/** Espelho do predicado SQL (IS NOT TRUE em varejo + atacado NULL-safe). */
function custoPodeAtualizar(p, novoCusto) {
  if (p.permitirAbaixoCusto) return true
  const varejoEstoura = p.precoVarejo != null && p.precoVarejo < novoCusto
  const atacadoEstoura = p.precoAtacado != null && p.precoAtacado < novoCusto
  return !varejoEstoura && !atacadoEstoura
}

test('migration guarda FOR UPDATE, conferência pendente e predicado de margem', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirmar_importacao_nfe/)
  assert.match(sql, /FOR UPDATE/)
  assert.match(sql, /IMPORT_NFE_CONFERENCIA_PENDENTE/)
  assert.match(sql, /permitir_abaixo_custo/)
  assert.match(sql, /preco_varejo < v_it\.custo_unitario\) IS NOT TRUE/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.confirmar_importacao_nfe\(uuid\) FROM anon/)
})

test('cenário concreto: atacado 60 < custo nota 80 < varejo 100 — não atualiza custo', () => {
  assert.equal(
    custoPodeAtualizar({ permitirAbaixoCusto: false, precoVarejo: 100, precoAtacado: 60 }, 80),
    false,
  )
})

test('mesmo produto com override permitir_abaixo_custo — atualiza custo', () => {
  assert.equal(
    custoPodeAtualizar({ permitirAbaixoCusto: true, precoVarejo: 100, precoAtacado: 60 }, 80),
    true,
  )
})

test('varejo e atacado cabem o novo custo — atualiza custo', () => {
  assert.equal(
    custoPodeAtualizar({ permitirAbaixoCusto: false, precoVarejo: 200, precoAtacado: 150 }, 80),
    true,
  )
})

test('varejo abaixo do novo custo (sem atacado) — não atualiza', () => {
  assert.equal(
    custoPodeAtualizar({ permitirAbaixoCusto: false, precoVarejo: 50, precoAtacado: null }, 80),
    false,
  )
})

test('varejo NULL não estoura (mesmo IS NOT TRUE do trigger 125)', () => {
  assert.equal(
    custoPodeAtualizar({ permitirAbaixoCusto: false, precoVarejo: null, precoAtacado: null }, 80),
    true,
  )
})
