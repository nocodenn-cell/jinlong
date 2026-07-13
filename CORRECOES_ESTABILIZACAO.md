# Correções de Estabilização — FastProduct Enterprise

**Data:** 2026-07-12  
**Escopo:** Prioridade 1 (base estável) + higiene pós-auditoria  
**Status:** ✅ Base compilável, typecheck verde, 439/439 testes Vitest

---

## 1. Conflitos de merge resolvidos

| Arquivo | Decisão | Justificativa |
|---------|---------|---------------|
| `shared-core/navigation/routes.ts` | `admin.compras` canônico; financeiro contas-pagar via `?tab=pagar`; removidas chaves duplicadas `clientes`/`fornecedores` | SSoT de rotas única em `shared-core` |
| `pdv-importados/lib/navigation/adminV2SidebarNav.ts` | Compras com `ClipboardList`; fornecedores sem duplicata | Alinhar sidebar ao SSoT de rotas |
| `pdv-importados/app/admin/clientes/page.tsx` | `PageHeader` + `ClientesListClient` | Padrão Admin V2 |
| `pdv-importados/app/admin/fornecedores/page.tsx` | Idem clientes | Consistência UI |
| `pdv-importados/app/admin/financeiro/page.tsx` | `kpiSection` + `FinanceiroContent` | Merge quebrado corrigido; removidos `panelLabels` extras não tipados |
| `pdv-importados/app/admin/vendas/page.tsx` | Lookup `usuarios.nome` para vendedor | Coluna operador na listagem |
| `pdv-importados/app/admin/vendas/_components/VendasTable.tsx` | `toVendaListRow` + `operador_id` | Tipagem e dados de vendedor |
| `pdv-importados/app/caixa/CaixaPdvOperadorTabs.tsx` | Layout linear com `PagamentoPanel` | Abas legadas removidas (código morto pós-merge) |
| `pdv-importados/app/gerente/financeiro/actions.ts` | Ambos `revalidatePath` (page + layout + documento) | Cache Next.js após mutações |

**Evidência:** `rg '<<<<<<<'` no repositório → 0 ocorrências.

---

## 2. Código morto e higiene

| Ação | Arquivo | Motivo |
|------|---------|--------|
| Removido | `pdv-importados/app/admin/financeiro/_components/FinanceiroPanels.tsx` | Substituído por `FinanceiroContent`; teste `consolidacao-post-audit` exigia remoção |
| Renomeado | `255_vendas_em_espera_*` → `247c_vendas_em_espera_e_consulta_rapida.sql` | Sequência de migrations 247a/b/c coerente |
| Adicionado ao CI | `package.json` → `guard:all` inclui `check:entity-ssot` | Enforcement SSoT de entidades em PRs |

---

## 3. Typecheck (63 → 0 erros)

| Correção | Arquivo |
|----------|---------|
| Excluir `e2e/` do `tsconfig` principal | `pdv-importados/tsconfig.json` — specs Playwright não são app TS |
| Stub `User` completo para testes auth | `pdv-importados/tests/helpers/mockSupabaseUser.ts` (novo) |
| Import path corrigido | `lib/admin/auth/sessionConsistency.test.ts` |
| Narrow de union `PipelineOutcome` | `tests/admin-auth-resilience.test.ts` |
| `operador_id: null` em mock | `VendaDetailSheet.tsx` |
| Remoção props inválidas | `admin/financeiro/page.tsx` |

**Comando:** `npx tsc --noEmit` em `pdv-importados` → exit 0

---

## 4. Testes restaurados (436 → 439 passando)

| Teste | Problema | Correção |
|-------|----------|----------|
| `finalizarVendaCaixa.integration.test.ts` | Validação Fase 5b (cliente obrigatório em pagamento parcial) precede mensagem Zod antiga | Separado em 2 casos: excedente → Zod; parcial → cliente |
| `transferencias/actions.test.ts` | Timeout intermitente no cold import em suite paralela | `beforeAll` preload do módulo `actions` |

**Comando:** `npm run test -w pdv-importados` → 86 arquivos, 439 testes OK

---

## 5. Build de produção

**Comando:** `npm run build -w pdv-importados` → exit 0  
Rotas geradas incluem `/admin/compras`, `/admin/financeiro/contas-pagar`, `/caixa`, etc.

---

## 6. Guards CI

| Guard | Status |
|-------|--------|
| `guard:routes` | ✅ 23 rotas /admin |
| `consolidacao-post-audit` | ✅ 18/18 |
| `check:entity-ssot` | ✅ (incluído em `guard:all`) |
| `guard:core` | ❌ **dívida legada** — `ProdutoFormModal.tsx`, `LoginForm.tsx` com regra de negócio na UI |

> O fail de `guard:core` é pré-existente (não introduzido nesta estabilização). Correção exige extrair branches para `core/systemRules.ts` — escopo Prioridade 2.

---

## 7. Decisões arquiteturais

1. **Rotas:** `shared-core/navigation/routes.ts` permanece SSoT; Admin V2 consome via `ROUTES.admin.*`.
2. **Financeiro:** painel unificado em `FinanceiroContent` com tabs query-string; páginas filhas (`contas-pagar`, `documento/[id]`) como rotas dedicadas.
3. **Caixa Fase 5b:** pagamento parcial exige `clienteId` antes da RPC — regra em `caixaVendas.impl.ts`, não no Zod (intencional: depende de caixa aberto).
4. **E2E:** mantidos fora do typecheck app; validação via Playwright separada.
5. **Migrations:** `backend/supabase/migrations/` é SSoT; renumerar 247c evita colisão com 255.

---

## 8. Melhorias incorporadas (Fase 5b — já na branch)

| Melhoria | Origem conceitual | Implementação nativa |
|----------|-------------------|----------------------|
| Contas a receber automáticas na finalização | ERPNext/Odoo — AR na venda a prazo | `247b_finalizar_venda_v4_contas_receber_automatico.sql` |
| Idempotência CR por venda | Padrão POS enterprise (retry-safe) | `247a_contas_receber_idempotencia_unique_venda.sql` |
| Seleção de cliente no PDV | POS Awesome / Saleor — customer on credit sale | `CaixaSelecionarClienteModal.tsx` + validação parcial |
| Vendas em espera + consulta rápida | Hold/recall de carrinho (POS padrão) | `247c_vendas_em_espera_e_consulta_rapida.sql` |
| Admin Compras | Módulo compras ERP | `/admin/compras` |
| Reprocessar documento fiscal | Observabilidade fiscal | `ReprocessarDocumentoButton.tsx` |

---

## 9. Fora de escopo (nesta missão)

| Item | Motivo |
|------|--------|
| Devolução/troca pós-venda | Aguarda base estável ✅ — próximo P0 de ROI |
| Inventário cíclico, reservas, variações SKU | Requer modelagem de domínio em `shared-core` |
| Command palette | Feature UX — sem blocker |
| Audit log campo-a-campo | Infra existe; expansão de cobertura é sprint dedicado |
| Paridade offline `pdv-local` | Monorepo separado; sync contract a definir |
| Extrair `app/gerente/*` → `modules/*` | Refactor grande; risco de regressão |
| `guard:core` violações legadas | Fora do diff de estabilização |
| E2E Playwright completo | Não executado nesta sessão (requer ambiente + credenciais) |
| Commit / push | Não solicitado pelo usuário |

---

## 10. Evidências (comandos executados)

```text
npx tsc --noEmit          → exit 0
npm run build -w pdv-importados → exit 0
npm run test -w pdv-importados  → 439/439 passed
npm run guard:routes            → OK
tests/consolidacao-post-audit     → 18/18
```

---

## Próximo passo recomendado

**Sprint C — Vínculo troca↔nova venda + PDV `/caixa`:** completar fluxo "Return + new sale linked" e atalho F6 no caixa.

---

## Sprint B — Devolução/Troca (implementado)

**Migration:** `backend/supabase/migrations/248_devolver_ou_trocar_venda.sql`

| Componente | Detalhe |
|------------|---------|
| RPC | `devolver_ou_trocar_venda` — idempotente por `p_idempotency_key` |
| Tabelas | `venda_pos_venda_operacoes`, `venda_pos_venda_itens`, `estoque_reposicoes_devolucao` |
| Kardex | `ENTRADA_DEVOLUCAO_CLIENTE` em `v_kardex_unificado` |
| Ledger | `SALE_PARTIAL_RETURN` em `venda_eventos` |
| Financeiro | `devolucoes` + caixa (DINHEIRO) + `contas_receber` (CREDITO_CLIENTE) |
| Cancel patch | `cancelar_venda_transacional` cancela `contas_receber` vinculada |

**UI:** `/admin/vendas` → detalhe da venda → **Devolver / trocar itens** (`VendaDevolucaoModal`)

**Actions:** `devolverOuTrocarVendaAction` → `devolverOuTrocarVendaImpl`

**Testes:** `parseDevolverVendaForm.test.ts` (2 casos)
