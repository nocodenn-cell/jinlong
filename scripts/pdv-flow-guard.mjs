#!/usr/bin/env node
/**
 * PDV FLOW GUARD — protege o fluxo de venda canônico:
 *   adicionar_item → validar_sku → calcular_total → finalizar_venda
 *
 * Falha se um guard rail essencial do PDV for removido (regressão estrutural):
 *  - snapshot imutável validado antes de finalizar (finalizar_venda)
 *  - gate de hidratação (React #418) no checkout
 *  - try/catch na finalização (venda sempre finaliza OU falha com motivo)
 *  - store de carrinho expõe adicionar/alterar e a totalização canônica
 *
 * Não valida comportamento em runtime (isso é dos testes vitest/e2e); valida que
 * as travas continuam presentes — barato e determinístico.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdv = path.join(root, 'pdv-importados')
const shared = path.join(root, 'shared-core')

const checks = [
  {
    file: path.join(pdv, 'app', 'caixa', 'CaixaPageClient.tsx'),
    must: [
      // Montagem do payload (snapshot + validação fail-fast + troco) foi extraída
      // para buildFinalizarVendaPayload.ts (Fase 1 — Aggregate); o guard rail em
      // si é checado no bloco abaixo, dedicado a esse arquivo. Aqui só garantimos
      // que o componente de fato chama o ponto único de montagem.
      { token: 'buildFinalizarVendaPayload', why: 'chamada ao ponto único de montagem do payload de venda' },
      { token: 'useHasMounted', why: 'gate de hidratação (React #418)' },
      { token: 'try {', why: 'try/catch na finalização' },
      { token: 'catch', why: 'tratamento de erro na finalização (motivo claro)' },
    ],
  },
  {
    file: path.join(pdv, 'app', 'caixa', 'buildFinalizarVendaPayload.ts'),
    must: [
      { token: 'buildCheckoutSnapshot', why: 'snapshot imutável de venda' },
      { token: 'validateCheckoutSnapshot', why: 'validação fail-fast antes de finalizar' },
    ],
  },
  {
    file: path.join(shared, 'src', 'stores', 'unifiedCartStore.ts'),
    must: [
      { token: 'adicionarItem', why: 'adicionar_item' },
      { token: 'alterarQuantidade', why: 'alterar quantidade' },
      { token: 'recalcularTotais', why: 'calcular_total (totalização canônica)' },
    ],
  },
  {
    file: path.join(shared, 'src', 'caixa', 'checkoutSnapshot.ts'),
    must: [{ token: 'validateCheckoutSnapshot', why: 'guard rail de finalização existe' }],
  },
]

const violations = []
for (const { file, must } of checks) {
  if (!fs.existsSync(file)) {
    violations.push(`${path.relative(root, file)}: arquivo essencial do fluxo PDV ausente`)
    continue
  }
  const text = fs.readFileSync(file, 'utf8')
  for (const { token, why } of must) {
    if (!text.includes(token)) {
      violations.push(`${path.relative(root, file)}: faltou "${token}" — ${why}`)
    }
  }
}

if (violations.length > 0) {
  console.error('[pdv-flow-guard] FAIL — guard rail do fluxo de venda removido/quebrado:\n')
  for (const v of violations) console.error(`  - ${v}`)
  console.error('\n  → Qualquer mudança no PDV precisa manter: adicionar → validar → totalizar → finalizar.')
  process.exit(1)
}

console.log('[pdv-flow-guard] OK — guard rails do fluxo de venda presentes (snapshot, #418, try/catch, totais)')
