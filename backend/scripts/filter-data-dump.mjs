#!/usr/bin/env node
// Filtra um data.sql (supabase db dump --data-only --use-copy) mantendo apenas
// os blocos COPY de tabelas permitidas. Usado no restore drill: o schema auth/
// storage de um Postgres vazio/local pode ser mais antigo que o de produção
// (colunas/tabelas gerenciadas pelo GoTrue/Storage), e um COPY incompatível
// abortaria a transação inteira. Dados de negócio (public) e contas
// (auth.users, auth.identities) são o que importa para a recuperação.
//
// Uso: node filter-data-dump.mjs <entrada.sql> <saida.sql> [regex-permitida]
import { readFileSync, writeFileSync } from 'node:fs'

const DEFAULT_ALLOW = '^(public\\.[a-z0-9_]+|auth\\.(users|identities))$'
const COPY_HEAD = /^COPY "([a-z0-9_]+)"\."([a-z0-9_]+)" \(/

function filterDump(sql, allow) {
  const out = []
  let keep = true
  let skipped = 0
  for (const line of sql.split('\n')) {
    const head = COPY_HEAD.exec(line)
    if (head) {
      keep = allow.test(`${head[1]}.${head[2]}`)
      if (!keep) skipped += 1
    }
    if (keep) out.push(line)
    if (line === '\\.') keep = true
  }
  return { text: out.join('\n'), skipped }
}

const [input, output, allowArg] = process.argv.slice(2)
if (!input || !output) {
  console.error('Uso: filter-data-dump.mjs <entrada.sql> <saida.sql> [regex]')
  process.exit(2)
}
const { text, skipped } = filterDump(readFileSync(input, 'utf8'), new RegExp(allowArg ?? DEFAULT_ALLOW))
writeFileSync(output, text)
console.log(`blocos COPY ignorados: ${skipped}`)
