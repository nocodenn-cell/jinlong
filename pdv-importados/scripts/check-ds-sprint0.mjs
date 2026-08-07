#!/usr/bin/env node
/**
 * Sprint 0 / UX-S0-26 — gate de interação do Design System.
 *
 * 1) Primitivos S0 devem existir como exports.
 * 2) ConfirmActionButton não pode usar confirm nativo.
 * 3) Código novo (fora allowlist) não pode introduzir:
 *    - window.confirm / globalThis.confirm
 *    - empty com emoji em EmptyState local
 *    - dialog `fixed inset-0` fora do SSOT / legado conhecido
 *
 * Uso: npm run check:ds-sprint0
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports', '.git', 'storybook-static'])

const REQUIRED_EXPORTS = [
  ['components/ui/admin-v2/PageShell.tsx', 'export function PageShell'],
  ['components/ui/ConfirmDialog.tsx', 'export function ConfirmDialog'],
  ['components/ui/DetailSheet.tsx', 'export function DetailSheet'],
  ['components/ui/admin-v2/TabNav.tsx', 'export function TabNav'],
  ['components/ui/Stepper.tsx', 'export function Stepper'],
  ['components/ui/FileDropzone.tsx', 'export function FileDropzone'],
  ['components/ui/BulkActionBar.tsx', 'export function BulkActionBar'],
  ['components/ui/ExportAction.tsx', 'export function ExportAction'],
  ['components/ui/forms/EntityLookup.tsx', 'export function EntityLookup'],
  ['components/ui/EntityTable.tsx', 'export function EntityTable'],
  ['components/ui/MoneyText.tsx', 'export function MoneyText'],
  ['components/ui/KeyHint.tsx', 'export function KeyHint'],
  ['components/ui/FormSection.tsx', 'export function FormSection'],
  ['components/ui/InlineAlert.tsx', 'export function InlineAlert'],
  ['components/ui/PaginationBar.tsx', "mode: 'infinite'"],
  ['components/ui/FilterBar.tsx', "type: 'daterange'"],
  ['lib/gerente/toast.ts', 'export const emitToast'],
]

/** Confirm nativo deve ser zero. Allowlist vazia = IX-CONFIRM 100%. */
const CONFIRM_ALLOWLIST = new Set()

const FIXED_DIALOG_ALLOWLIST = new Set([
  'components/ui/DetailSheet.tsx',
  'components/ui/DragonModal.tsx',
  // Sheets de entidade legados — migrar para DetailSheet em S1+
  'app/admin/financeiro/_components/DocumentoFiscalDetailSheet.tsx',
  'app/admin/auditoria/_components/AuditoriaTimeline.tsx',
  'app/admin/vendas/_components/VendaDetailSheet.tsx',
  'app/gerente/compras/OcFormModal.tsx',
  'app/gerente/compras/OcDetalheModal.tsx',
  // PDV / nav (EXC drawer) — não são DetailSheet de entidade
  'app/caixa/CaixaReciboModal.tsx',
  'app/caixa/CaixaHistoricoSheet.tsx',
  'components/gerente/ActivityRailDrawer.tsx',
  'components/gerente/GerenteMobileNavDrawer.tsx',
])

const violations = []

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (SKIP.has(name)) continue
      walk(p, files)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

for (const [rel, needle] of REQUIRED_EXPORTS) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    violations.push(`missing: ${rel}`)
    continue
  }
  const text = readFileSync(abs, 'utf8')
  if (!text.includes(needle)) {
    violations.push(`export/contract missing in ${rel}: expected "${needle}"`)
  }
}

// Cobre window.confirm, globalThis.confirm e confirm( bare.
const confirmCallRe = /(?:(?:window|globalThis)\.)?confirm\s*\(/
const confirmBtn = readFileSync(join(ROOT, 'components/gerente/ConfirmActionButton.tsx'), 'utf8')
if (confirmCallRe.test(confirmBtn)) {
  violations.push('ConfirmActionButton ainda usa confirm nativo (IX-CONFIRM)')
}
if (!confirmBtn.includes('ConfirmDialog')) {
  violations.push('ConfirmActionButton deve usar ConfirmDialog')
}

if (existsSync(join(ROOT, 'components/gerente/cadastro/CadastroPageShell.tsx'))) {
  violations.push('órfão CadastroPageShell.tsx ainda presente (UX-S0-02)')
}
if (existsSync(join(ROOT, 'components/forms/PendingSubmitButton.tsx'))) {
  violations.push('órfão PendingSubmitButton.tsx ainda presente (UX-S0-02)')
}
if (existsSync(join(ROOT, 'components/ui/card.tsx'))) {
  violations.push('órfão card.tsx ainda presente (UX-S0-02)')
}

const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib'))]

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const text = readFileSync(file, 'utf8')

  if (confirmCallRe.test(text) && !CONFIRM_ALLOWLIST.has(rel)) {
    violations.push(`${rel}: confirm nativo fora da allowlist (use ConfirmDialog)`)
  }

  const isFixedDialog =
    /fixed inset-0/.test(text) && /role=["']dialog["']|aria-modal/.test(text)
  if (isFixedDialog && !FIXED_DIALOG_ALLOWLIST.has(rel) && !rel.startsWith('components/ui/')) {
    violations.push(`${rel}: fixed inset-0 dialog fora SSOT/allowlist (use DetailSheet/DragonModal)`)
  }

  // Empty emoji em código de lista/admin novo — bloqueia padrões tipo "📭 Nenhum"
  if (
    /EmptyState|nenhum registro|Nenhum /i.test(text) &&
    /['"`][^'"`]*[📭📂📁🛒💸📦🔍✨][^'"`]*['"`]/.test(text) &&
    rel.startsWith('components/ui/')
  ) {
    violations.push(`${rel}: empty com emoji no DS (use EmptyState sem emoji)`)
  }
}

// FilterBar deve resetar page
const filterBar = readFileSync(join(ROOT, 'components/ui/FilterBar.tsx'), 'utf8')
if (!filterBar.includes("params.delete('page')")) {
  violations.push('FilterBar deve resetar `page` em mudanças de filtro (UX-S0-25)')
}

if (violations.length) {
  console.error('[check:ds-sprint0] FALHOU\n')
  for (const v of violations) console.error(` - ${v}`)
  process.exit(1)
}

console.log('[check:ds-sprint0] OK — primitivos S0 + gates IX presentes')
