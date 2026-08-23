#!/usr/bin/env node
/**
 * Assert estático (sem DB): descontos_venda RLS isola por loja do caixa.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const guardName = '20260811110000_descontos_venda_rls_loja_scope.sql'
const legacy = ['008_descontos_venda_rls.sql', '044_usuario_perfil_admin_rls.sql']

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
const guardIdx = files.indexOf(guardName)

function fail(msg) {
  console.error(`[assert-descontos-venda-rls-loja] FAIL — ${msg}`)
  process.exit(1)
}

if (guardIdx < 0) fail(`${guardName} ausente`)
for (const name of legacy) {
  const idx = files.indexOf(name)
  if (idx < 0) fail(`${name} ausente`)
  if (guardIdx <= idx) fail(`${guardName} deve ordenar depois de ${name}`)
}

const src = fs.readFileSync(path.join(migrationsDir, guardName), 'utf8')
const required = [
  'descontos_venda_select_gerente_dono',
  'descontos_venda_insert_gerente_dono',
  'descontos_venda_update_gerente_dono',
  'descontos_venda_delete_gerente_dono',
  'JOIN public.caixas c ON c.id = v.caixa_id',
  'u.loja_id = c.loja_id',
  "(SELECT auth.uid())",
]

for (const needle of required) {
  if (!src.includes(needle)) fail(`migration não contém: ${needle}`)
}

console.log('[assert-descontos-venda-rls-loja] OK — policies com escopo vendas→caixas.loja_id')
