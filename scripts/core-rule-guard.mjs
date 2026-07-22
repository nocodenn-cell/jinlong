#!/usr/bin/env node
/**
 * CORE RULE GUARD — regra de negócio só existe no core.
 *
 * Falha se detectar DECISÃO de negócio (não mera leitura/exibição) nas camadas
 * de apresentação (UI cliente): comparar/atribuir status_publicacao, decidir
 * vendabilidade ou ramificar por `ativo` em components/hooks/stores ou em
 * arquivos `'use client'` de app/.
 *
 * Princípio: UI apresenta e envia intenção; CORE decide; SERVER executa.
 * Não é "detectar string" — é detectar regra de negócio fora de /core
 * (por isso casamos padrões de decisão, não menções de coluna).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdv = path.join(root, 'pdv-importados')

// Camadas de UID/apresentação sempre escaneadas por inteiro.
const UI_DIRS = [
  path.join(pdv, 'components'),
  path.join(pdv, 'hooks'),
  path.join(pdv, 'stores'),
]
// app/ só é escaneado nos arquivos client ('use client') — server actions/
// components legitimamente leem essas colunas (camada de execução).
const APP_DIR = path.join(pdv, 'app')

// Exceções documentadas (apresentação pura, sem decidir regra de negócio).
const ALLOWLIST = new Set(
  [
    // Mapeia status atual → qual botão (Publicar/Inativar) mostrar. A regra de
    // publicar/inativar vive nas server actions (publicarProduto/inativarProduto).
    'pdv-importados/app/admin/catalogo/_components/CatalogoPublicacaoActions.tsx',
    // Mapeia status → chip visual (label/hint/tom de cor) do formulário de produto.
    // Pura apresentação: a regra de publicação vive nas server actions.
    'pdv-importados/components/gerente/produtos/produtoFormStatusChip.ts',
  ].map((p) => path.normalize(path.join(root, p))),
)

// Padrões de DECISÃO de negócio (não simples menção de coluna).
const RULES = [
  { re: /===\s*['"](PUBLICADO|DRAFT|INATIVO)['"]/, msg: "comparação literal de status_publicacao" },
  { re: /['"](PUBLICADO|DRAFT)['"]/, msg: "literal de status_publicacao (PUBLICADO/DRAFT)" },
  { re: /status_publicacao\s*===/, msg: "branch por status_publicacao" },
  { re: /\bis(Produto)?Vendavel\s*\(/, msg: "lógica de vendabilidade na UI" },
  { re: /\.ativo\s*===\s*(true|false)\b/, msg: "branch por produto.ativo" },
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports'])

function walk(dir, pred) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      out.push(...walk(p, pred))
    } else if (/\.(ts|tsx)$/.test(ent.name) && !/\.(test|spec)\.(ts|tsx)$/.test(ent.name)) {
      if (pred(p)) out.push(p)
    }
  }
  return out
}

const isClientFile = (file) => {
  const head = fs.readFileSync(file, 'utf8').slice(0, 200)
  return /^\s*['"]use client['"]/.test(head)
}

const targets = [
  ...UI_DIRS.flatMap((d) => walk(d, () => true)),
  ...walk(APP_DIR, isClientFile),
]

const violations = []
for (const file of targets) {
  const norm = path.normalize(file)
  if (ALLOWLIST.has(norm)) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const { re, msg } of RULES) {
    if (re.test(text)) {
      violations.push(`${path.relative(root, file)}: ${msg}`)
    }
  }
}

if (violations.length > 0) {
  console.error('[core-rule-guard] FAIL — regra de negócio fora do core (UI deve só apresentar):\n')
  for (const v of [...new Set(violations)]) console.error(`  - ${v}`)
  console.error('\n  → Mova a decisão para /core (ex.: core/systemRules.ts) e deixe a UI só enviar intenção.')
  process.exit(1)
}

console.log('[core-rule-guard] OK — nenhuma regra de negócio detectada na UI (core decide, UI apresenta)')
