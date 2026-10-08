#!/usr/bin/env node
/**
 * Wrapper de apply seletivo: recusa qualquer versão listada em
 * supabase/forbidden-migrations.json antes de invocar o comando real.
 *
 * Uso:
 *   node scripts/guard-apply-migrations.mjs --versions 20261007163200,20261007170000 -- echo dry-run
 *   node scripts/guard-apply-migrations.mjs --versions 20261006120000 -- echo nunca
 *
 * Limite: não intercepta `psql`/`apply_migration` MCP fora deste wrapper.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertNotInAutomatedApplyList,
  loadForbiddenRegistry,
} from './assert-forbidden-migrations.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FORBIDDEN_FILE = path.join(__dirname, '..', 'supabase', 'forbidden-migrations.json')

function parseArgs(argv) {
  const versionsIdx = argv.indexOf('--versions')
  if (versionsIdx < 0 || !argv[versionsIdx + 1]) {
    throw new Error('Uso: guard-apply-migrations.mjs --versions v1,v2 -- <comando...>')
  }
  const versions = argv[versionsIdx + 1]
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const sep = argv.indexOf('--')
  if (sep < 0 || sep === argv.length - 1) {
    throw new Error('Informe comando após --')
  }
  return { versions, command: argv.slice(sep + 1) }
}

function main(argv = process.argv.slice(2)) {
  const { versions, command } = parseArgs(argv)
  const { entries } = loadForbiddenRegistry(fs.readFileSync(FORBIDDEN_FILE, 'utf8'))
  assertNotInAutomatedApplyList(versions, entries)
  const [bin, ...args] = command
  const result = spawnSync(bin, args, { stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    main()
  } catch (err) {
    console.error(String(err?.message || err))
    process.exit(1)
  }
}
