#!/usr/bin/env node
// Filtra um data.sql (supabase db dump --data-only --use-copy) mantendo apenas
// os blocos COPY de tabelas permitidas. Usado no restore drill: o schema auth/
// storage de um Postgres vazio/local pode ser mais antigo que o de produção
// (colunas/tabelas gerenciadas pelo GoTrue/Storage), e um COPY incompatível
// abortaria a transação inteira. Dados de negócio (public) e contas
// (auth.users, auth.identities) são o que importa para a recuperação.
//
// Quando recebe o arquivo de colunas do destino (linhas "schema.tabela.coluna"),
// cada COPY é projetado só nas colunas que o destino tem: as demais são removidas
// da lista e dos valores. Colunas de produção ausentes na imagem do drill (ex.:
// auth.users.email_confirmed_at) deixam de quebrar o restore; ficam registradas.
//
// Uso: node filter-data-dump.mjs <entrada.sql> <saida.sql> [regex-permitida] [colunas-destino.txt]
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DEFAULT_ALLOW = '^(public\\.[a-z0-9_]+|auth\\.(users|identities))$'
const COPY_HEAD = /^COPY "([a-z0-9_]+)"\."([a-z0-9_]+)" \((.*)\) FROM stdin;$/

function parseColumns(list) {
  return list.split(', ').map((c) => c.replace(/^"|"$/g, ''))
}

/** Conjunto "schema.tabela" -> Set(colunas) a partir do texto "schema.tabela.coluna" por linha. */
export function parseTargetColumns(text) {
  const map = new Map()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const dot = line.lastIndexOf('.')
    const table = line.slice(0, dot)
    const col = line.slice(dot + 1)
    if (!map.has(table)) map.set(table, new Set())
    map.get(table).add(col)
  }
  return map
}

export function filterDump(sql, allow, targetColumns = null) {
  const out = []
  let keep = true
  let skipped = 0
  let projection = null // { keepIdx: number[] } enquanto dentro de um COPY projetado
  const dropped = []
  for (const line of sql.split('\n')) {
    if (projection === null) {
      const head = COPY_HEAD.exec(line)
      if (head) {
        const table = `${head[1]}.${head[2]}`
        keep = allow.test(table)
        if (!keep) skipped += 1
        else if (targetColumns && targetColumns.has(table)) {
          const cols = parseColumns(head[3])
          const target = targetColumns.get(table)
          const keepIdx = []
          const keepCols = []
          cols.forEach((c, i) => {
            if (target.has(c)) { keepIdx.push(i); keepCols.push(c) }
            else dropped.push(`${table}.${c}`)
          })
          projection = { keepIdx }
          out.push(`COPY "${head[1]}"."${head[2]}" (${keepCols.map((c) => `"${c}"`).join(', ')}) FROM stdin;`)
          continue
        }
      }
      if (keep) out.push(line)
      if (line === '\\.') keep = true
      continue
    }
    // dentro do bloco projetado
    if (line === '\\.') {
      out.push(line)
      projection = null
      keep = true
      continue
    }
    out.push(projection.keepIdx.map((i) => line.split('\t')[i] ?? '\\N').join('\t'))
  }
  return { text: out.join('\n'), skipped, dropped }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const [input, output, allowArg, targetArg] = process.argv.slice(2)
  if (!input || !output) {
    console.error('Uso: filter-data-dump.mjs <entrada.sql> <saida.sql> [regex] [colunas-destino.txt]')
    process.exit(2)
  }
  const target = targetArg ? parseTargetColumns(readFileSync(targetArg, 'utf8')) : null
  const { text, skipped, dropped } = filterDump(readFileSync(input, 'utf8'), new RegExp(allowArg ?? DEFAULT_ALLOW), target)
  writeFileSync(output, text)
  console.log(`blocos COPY ignorados: ${skipped}`)
  if (dropped.length) console.log(`colunas de produção ausentes no destino (removidas do COPY): ${dropped.join(', ')}`)
}

