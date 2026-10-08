#!/usr/bin/env node
// Manifesto de sanidade do backup, calculado a partir do próprio data.sql
// (supabase db dump --data-only --use-copy). Conta linhas por COPY, sem
// conexão com o banco e sem emitir dado sensível: só contagens.
//
// Uso: node backup-manifest.mjs <data.sql>  → JSON em stdout
// Falha (exit 1) se uma tabela crítica estiver ausente do dump.
import { readFileSync } from 'node:fs'

const COPY_HEAD = /^COPY "([a-z0-9_]+)"\."([a-z0-9_]+)" \(/
const CRITICAL = {
  vendas: 'public.vendas',
  caixas: 'public.caixas',
  produtos: 'public.produtos',
  usuarios: 'public.usuarios',
  auth_users: 'auth.users',
}

function countCopyRows(sql) {
  const counts = new Map()
  let current = null
  for (const line of sql.split('\n')) {
    const head = COPY_HEAD.exec(line)
    if (head) {
      current = `${head[1]}.${head[2]}`
      counts.set(current, 0)
    } else if (line === '\\.') {
      current = null
    } else if (current) {
      counts.set(current, counts.get(current) + 1)
    }
  }
  return counts
}

const file = process.argv[2]
if (!file) {
  console.error('Uso: backup-manifest.mjs <data.sql>')
  process.exit(2)
}
const counts = countCopyRows(readFileSync(file, 'utf8'))
const manifest = { generated_at: new Date().toISOString() }
const missing = []
for (const [key, table] of Object.entries(CRITICAL)) {
  if (!counts.has(table)) missing.push(table)
  manifest[key] = counts.get(table) ?? 0
}
console.log(JSON.stringify(manifest))
if (missing.length > 0) {
  console.error(`Tabelas críticas ausentes do dump: ${missing.join(', ')}`)
  process.exit(1)
}
