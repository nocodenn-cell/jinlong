#!/usr/bin/env node
/**
 * Diagnóstico da sonda direta Temporary Access (sem rede obrigatória, sem segredo no stdout).
 * Substituição literal do PAT — o valor nunca entra em regex nem em delimitador de sed.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { promises as dns } from 'node:dns'
import { pathToFileURL } from 'node:url'

export const MIN_SECRET_LENGTH = 8

const AUTH_RE = /PAM authentication failed|password authentication failed/i
const TIMEOUT_RE = /timeout expired|connection timed out|could not connect to server: timeout/i
const UNREACHABLE_RE = /network is unreachable/i

export function redactSecrets(text, secrets) {
  const source = String(text ?? '')
  const list = Array.isArray(secrets) ? secrets : []
  return list.reduce((out, secret) => replaceLiteral(out, secret), source)
}

export function suppressIfLeaked(text, secrets) {
  if (!containsSecret(text, secrets)) return text
  return '[stderr suprimido: redacao incompleta]'
}

export function classifyDirectProbe(facts) {
  const stderr = String(facts?.stderr ?? '')
  const aaaa = Number(facts?.aaaaCount) > 0
  const route = facts?.ipv6DefaultRoute === true
  if (AUTH_RE.test(stderr)) return reason('autenticacao', 'host alcancado; PAT recusado.')
  if (routeBlocksDirect(aaaa, route, stderr)) return routeReason()
  if (!aaaa) return missingAaaaReason(Number(facts?.aCount) > 0)
  if (TIMEOUT_RE.test(stderr)) return reason('timeout', 'psql estourou o tempo de conexao.')
  return reason('outro', 'falha nao classificada; ver stderr redigido.')
}

export function formatDirectFailure(facts) {
  const result = classifyDirectProbe(facts)
  const a = toCount(facts?.aCount)
  const aaaa = toCount(facts?.aaaaCount)
  const route = facts?.ipv6DefaultRoute ? 1 : 0
  return `direct: motivo=${result.motivo} dns_a=${a} dns_aaaa=${aaaa} rota_ipv6_default=${route} detalhe=${result.detalhe}`
}

export async function countFamily(host, family, lookup = dns.lookup) {
  if (!host || (family !== 4 && family !== 6)) return 0
  try {
    const rows = await lookup(host, { all: true, family })
    const list = Array.isArray(rows) ? rows : [rows]
    return new Set(list.map((row) => row.address)).size
  } catch {
    return 0
  }
}

function routeBlocksDirect(aaaa, route, stderr) {
  if (!aaaa) return false
  if (!route) return true
  return UNREACHABLE_RE.test(stderr)
}

function missingAaaaReason(hasA) {
  const detalhe = hasA
    ? 'DNS do host direto sem AAAA (existe registro A).'
    : 'DNS do host direto sem AAAA e sem A.'
  return reason('sem_aaaa', detalhe)
}

function routeReason() {
  return reason(
    'sem_rota_ipv6',
    'host direto tem AAAA e o runner nao tem rota IPv6 util, ou o connect retornou network unreachable. Grant JIT atual so cobre 0.0.0.0/0.',
  )
}

function reason(motivo, detalhe) {
  return { motivo, detalhe }
}

function replaceLiteral(text, secret) {
  if (!usableSecret(secret) || !text.includes(secret)) return text
  return text.split(secret).join('***')
}

function containsSecret(text, secrets) {
  const list = Array.isArray(secrets) ? secrets : []
  return list.some((secret) => usableSecret(secret) && text.includes(secret))
}

function usableSecret(secret) {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH
}

function toCount(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) return 0
  return n
}

function readFlag(argv, name) {
  const index = argv.indexOf(name)
  if (index === -1 || index + 1 >= argv.length) return undefined
  return argv[index + 1]
}

function cap(text) {
  if (text.length <= 8000) return text
  return `${text.slice(0, 8000)}\n[stderr truncado]`
}

function secretsFromEnv() {
  return [process.env.JIT_PAT, process.env.JIT_PAT_ENC]
}

function safeStderr(file) {
  const raw = readFileSync(file, 'utf8')
  const secrets = secretsFromEnv()
  return cap(suppressIfLeaked(redactSecrets(raw, secrets), secrets))
}

async function printDnsCount(argv) {
  const host = readFlag(argv, '--host')
  const familyName = readFlag(argv, '--family')
  const family = familyName === 'AAAA' ? 6 : 4
  const count = familyName === 'A' || familyName === 'AAAA' ? await countFamily(host, family) : 0
  process.stdout.write(`${count}\n`)
}

function printRedacted(argv) {
  const file = readFlag(argv, '--err')
  if (!file) {
    process.stdout.write('[stderr ausente]\n')
    return
  }
  process.stdout.write(`${safeStderr(file)}\n`)
}

function printClassified(argv) {
  const file = readFlag(argv, '--err')
  const stderr = file ? safeStderr(file) : ''
  const facts = {
    stderr,
    aCount: readFlag(argv, '--a-count'),
    aaaaCount: readFlag(argv, '--aaaa-count'),
    ipv6DefaultRoute: readFlag(argv, '--ipv6-route') === '1',
  }
  process.stdout.write(`${formatDirectFailure(facts)}\n`)
  if (stderr) process.stdout.write(`${stderr}\n`)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--print-dns')) {
    await printDnsCount(argv)
    return
  }
  if (argv.includes('--redact-only')) {
    printRedacted(argv)
    return
  }
  printClassified(argv)
}

function invokedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  main().catch(() => {
    console.error('backup-jit-direct-failure: falha interna; stderr suprimido.')
    process.exit(1)
  })
}
