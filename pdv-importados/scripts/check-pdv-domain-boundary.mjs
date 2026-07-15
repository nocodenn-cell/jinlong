#!/usr/bin/env node
/**
 * PDV DOMAIN BOUNDARY GUARD — fachadas de domínio vizinho (Fase 0 da
 * Arquitetura Canônica do PDV, ver ARQUITETURA_CANONICA_PDV.md seção 4b).
 *
 * O PDV (Sales) não deve acessar tabelas de Catalog (produtos, categorias),
 * Inventory (estoque) ou Financial (contas_receber, vendas_pagamentos)
 * diretamente — só através dos módulos `server/*.impl.ts`/`*Server.ts` já
 * reconhecidos como o port de cada domínio (`caixaCatalogo.impl.ts`,
 * `caixaPrecoAutoritativoServer.ts`, `caixaEstoqueServer.ts`,
 * `caixaTurnoResumo.impl.ts`, `caixaClientesSearch.impl.ts`,
 * `caixaConsultaRapida.impl.ts`, `caixaVendaEspera.impl.ts`,
 * `registrarAlertasLevesVenda.ts`).
 *
 * Escrita em Financial/Fiscal (contas_receber, documentos_fiscais_pendentes)
 * ainda vive dentro da RPC congelada `finalizar_venda_transacional_canonica_v4`
 * — exceção aceita e documentada (não é violação deste guard; não há chamada
 * de app-code a auditar aqui, é lógica interna do banco).
 *
 * Uso: node scripts/check-pdv-domain-boundary.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CAIXA_APP = join(ROOT, 'app', 'caixa')
const CAIXA_SERVER = join(CAIXA_APP, 'server')

/** Tabelas de domínio vizinho — Sales só pode lê-las via os ports abaixo. */
const NEIGHBOR_TABLE_PATTERNS = [
  { re: /\.from\(\s*['"]produtos['"]\s*\)/, table: 'produtos (Catalog)' },
  { re: /\.from\(\s*['"]categorias['"]\s*\)/, table: 'categorias (Catalog)' },
  { re: /\.from\(\s*['"]estoque['"]\s*\)/, table: 'estoque (Inventory)' },
  { re: /\.from\(\s*['"]contas_receber['"]\s*\)/, table: 'contas_receber (Financial)' },
  { re: /\.from\(\s*['"]vendas_pagamentos['"]\s*\)/, table: 'vendas_pagamentos (Financial)' },
  { re: /\.from\(\s*['"]clientes['"]\s*\)/, table: 'clientes (Customer)' },
]

/**
 * Arquivos sancionados como port de um domínio vizinho — só eles podem
 * conter as queries acima. Caminhos relativos a `app/caixa/server/`.
 */
const ALLOWED_PORT_FILES = new Set([
  'caixaCatalogo.impl.ts',
  'caixaPrecoAutoritativoServer.ts',
  'caixaEstoqueServer.ts',
  'caixaTurnoResumo.impl.ts',
  'caixaClientesSearch.impl.ts',
  'caixaConsultaRapida.impl.ts',
  'caixaVendaEspera.impl.ts',
  'registrarAlertasLevesVenda.ts',
])

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, files)
      continue
    }
    if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|integration\.test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

const files = walk(CAIXA_APP)
let failed = false

for (const file of files) {
  const norm = normalize(file)
  const isSanctionedPort =
    norm.startsWith(normalize(CAIXA_SERVER)) &&
    ALLOWED_PORT_FILES.has(relative(CAIXA_SERVER, norm))

  if (isSanctionedPort) continue

  const content = readFileSync(file, 'utf8')
  for (const { re, table } of NEIGHBOR_TABLE_PATTERNS) {
    if (re.test(content)) {
      console.error(
        `[pdv-domain-boundary] ${relative(ROOT, file)} acessa ${table} diretamente — use o port em app/caixa/server/, não .from() solto.`,
      )
      failed = true
    }
  }
}

if (failed) {
  console.error(
    '\n  → Toda leitura de domínio vizinho do PDV deve passar por um dos arquivos port em app/caixa/server/ (ver ARQUITETURA_CANONICA_PDV.md seção 4b).',
  )
  process.exit(1)
}

console.log('check-pdv-domain-boundary: OK — nenhum acesso direto a domínio vizinho fora dos ports')
