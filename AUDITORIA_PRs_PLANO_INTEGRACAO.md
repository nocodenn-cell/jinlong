# Auditoria de PRs Abertas e Plano de Integração para Go-Live

**Data:** 11 de julho de 2026  
**Total de PRs Abertas:** 20  
**Analisadas em Detalhe:** 8  
**Status:** Pronto para planejamento de integração

---

## Sumário Executivo

| Categoria | Count | PRs |
|-----------|-------|-----|
| ✅ Pronto para Merge Imediato | 1 | #156 |
| ⏳ Depende de Outra PR | 4 | #161, #159, #158, #152 |
| 🔄 Precisa Rebase | 3 | #162, #155, #150 |
| ⚠️ Deve Ser Consolidada | 2 | #159 ↔ #161 |
| 📋 Sem Info Detalhada | 10 | #128-#140 (exceto analisadas) |

**Recomendação:** Sequência de integração em 4 fases com validação entre cada uma.

---

## Análise Detalhada por PR

### 🟢 Pronto para Merge Imediato

#### #156: Admin Screen Consolidation
**Status:** ✅ Ready (não é draft)  
**Objetivo:** Consolidar telas admin, unificar financeiro, SSOT de entidades

**Arquivos Principais:**
- `pdv-importados/app/admin/*` (clientes, fornecedores, financeiro, catálogo)
- `shared-core/navigation/routes.ts` (redirects)
- 101 arquivos alterados, +16,614 -8,098

**Mudanças Críticas:**
- Restore `/admin/clientes` e `/admin/fornecedores` (reutiliza gerente lists)
- Consolidar `/admin/financeiro` (abas: receber/pagar/fiscal)
- Linear PDV flow (busca + pagamento em uma coluna)
- Entity SSOT guard (`check:entity-ssot`)

**Conflitos Potenciais:** ⚠️ ALTO
- Mergeable State: `dirty` (possui conflitos)
- Risco: 101 arquivos alterados = alta probabilidade de conflito com outras PRs

**Dependências:** ❌ Nenhuma (pode ir direto)

**Recomendação:** 🔴 **REBASE ANTES DE MERGE** 
- Rebase sobre `main` para resolver conflitos
- Depois: Merge via squash (reduz 6 commits)
- Validar: `npm run check:entity-ssot`, typecheck, build

---

### 🟡 Depende de Outra PR

#### #161: Employee Registration + P0 Blockers
**Status:** ⏳ Draft  
**Objetivo:** Sistema completo de cadastro de funcionários + 3 P0 fixes

**Arquivos Principais:**
- `backend/supabase/migrations/259_funcionarios_meta_crud.sql` (nova tabela + RPC)
- `backend/supabase/functions/send-employee-invite/` (Edge Function)
- `pdv-importados/app/admin/funcionarios/page.tsx` (nova rota)
- `pdv-importados/app/gerente/funcionarios/actions.ts` (Server actions)

**Mudanças Críticas:**
- Tabela `funcionarios_meta` (companion a `usuarios`)
- 7 RPCs de CRUD + comissão
- RLS policies para OPERADOR/GERENTE/DONO
- 2,478 linhas novas

**P0 Fixes Inclusos:**
1. Silent cleanup failures → console.error logging
2. DONO bypassed by RLS → auth_usuario_eh_dono() check
3. Cross-loja security gap → loja_id validation

**Conflitos Potenciais:** ⚠️ MÉDIO
- Migration 259 numeração (outras PRs também usam 259)
- Base: `4f39afe` (mesmo que #162)
- Status: unstable

**Dependências:** 
- ❌ Bloqueia: #159 (Employee Commission System)
- ✅ Pode seguir: #162

**Recomendação:** 🟡 **MERGE APÓS #156, ANTES DE #159**
- Rebase para `main` atual
- Validar migration numbering (não colidir com #159, #158, #152)
- Merge com squash (19 commits → 1)

---

#### #159: Employee Commission System
**Status:** ⏳ Draft  
**Objetivo:** Sistema de comissão por funcionário + UI fixes

**Arquivos Principais:**
- Migrations 259-261 (comissões_regras_*, histórico)
- `pdv-importados/app/gerente/funcionarios/` (UI fixes)
- `ComissaoRulesEditor`, `ComissaoHistoricoList` (novos componentes)

**Mudanças Críticas:**
- Tabela `comissoes_regras_funcionario` (produto/categoria/margem)
- Audit trigger para histórico imutável
- Prioridade de regras: produto → categoria → margem → padrão
- Congelamento de percentual na venda

**UI Fixes:**
- Conexão de `ComissaoRulesEditor` (existia morto)
- Suporte a edição de regras (`atualizarComissaoRegra` novo)
- Erro de listagem agora mostra mensagem real
- Modal fecha + lista recarrega após sucesso

**Conflitos Potenciais:** 🔴 ALTO
- **Depende TOTALMENTE de #161** (tabela `funcionarios_meta`)
- Migrations 259-261 (colisão numeração com #161, #158, #152)
- Base: `625836826` (diferente de #161)
- Status: unstable

**Dependências:**
- 🔴 **BLOQUEADO por:** #161 (Employee Registration)
- ✅ Deve seguir: #152 (PDV × Gerente gaps)

**Recomendação:** 🔴 **MERGE SOMENTE APÓS #161 COMPLETO**
- Rebase sobre branch mesclada de #161
- Renumerar migrations (265-267 em vez de 259-261)
- Validar sem conflitos com #161

---

#### #158: P0/P1 Blocker Fixes
**Status:** ⏳ Draft  
**Objetivo:** Resolver 2 de 3 bloqueadores críticos de operação

**Arquivos Principais:**
- `backend/supabase/migrations/259_vendas_cliente_id.sql` (nova coluna)
- `backend/supabase/migrations/260_finalizar_venda_v4_com_cliente.sql` (RPC update)
- `backend/supabase/scripts/VALIDACAO_SECRETS_SYNC_OUTBOX.md` (docs)
- `pdv-importados/app/caixa/finalizarVendaValidation.ts` (validação)

**Mudanças Críticas:**
- Adiciona `vendas.cliente_id` (referência a `clientes`)
- Atualiza RPC `finalizar_venda_transacional_canonica_v4` para aceitar cliente
- Validação de secrets SYNC_KEY (checklist + script)
- Bloqueador #1 ✅ resolvido (cliente no PDV)
- Bloqueador #2 ✅ resolvido (secrets validation)
- Bloqueador #3 ❌ pendente (estoque órfão — race condition)

**Conflitos Potenciais:** 🔴 ALTO
- Migration 259 (colisão com #161, #159)
- Migration 260 (pode colidir com #152)
- RPC `finalizar_venda_v4` (base canônica)
- Status: dirty (mergeable_state)

**Dependências:**
- ✅ Depende de: Nada específico
- 🔴 Conflita com: #161, #159, #152 (migrations)
- ✅ Pode seguir: #156

**Recomendação:** 🟡 **MERGE APÓS #156, ANTES DE #161**
- Rebase sobre `main`
- Consolidar com #161 em uma **Super-PR de Funcionários** (vide consolidação)
- Validar migrations não colidem

---

#### #152: P0/P1/P3 PDV × Gerente Gaps
**Status:** ⏳ Draft  
**Objetivo:** Fechar gaps de integração entre PDV e modo Gerente

**Arquivos Principais:**
- `backend/supabase/migrations/259_finalizar_venda_v4_guard_suspensao.sql` (guard)
- Removes: `pdv-importados/supabase/migrations/` (diretório órfão)
- Fixes: `caixaVendas.impl.ts`, `gerente/produtos/actions.ts`

**Mudanças Críticas:**
- **P0:** Reintroduz guard de `vendas_suspensas` em v4 (era só client-side)
- **P1:** Remove diretório migrations órfão (colisão numeração)
- **P1:** Conecta cancelamento de venda (`/admin/vendas`)
- **P3:** Corrige `revalidatePath` para rotas `/admin/*`

**Conflitos Potenciais:** 🔴 MUITO ALTO
- Migration 259 (novamente!)
- Remove `pdv-importados/supabase/migrations/` (diretório inteiro)
- Risco: Se #158 ou #161 foram merged, haverá conflito

**Dependências:**
- ✅ Depende de: #156 (admin consolidation)
- 🔴 Conflita com: #161, #159, #158 (migrations)
- ❌ Bloqueador #3 ainda pendente (estoque órfão)

**Recomendação:** 🟡 **MERGE APÓS #161 + #159 + #158**
- Rebase sobre merged main
- Renumerar migration 259 → 262 ou posterior
- Validar remoção do diretório órfão não quebra nada

---

### 🔄 Precisa Rebase

#### #162: Unify StatusPublicacao Type
**Status:** ✅ Estável em Vercel, Pronto  
**Objetivo:** Fixar incompatibilidade de tipo StatusPublicacao

**Arquivos Principais:**
- `shared-core/src/product/statusRules.ts` (remove definição local)
- `pdv-importados/components/gerente/produtos/ProdutoFormModal.tsx` (import correto)
- `scripts/core-rule-guard.mjs` (allowlist)

**Mudanças Críticas:**
- Remove duplicação de tipo (importa de `productEngine.ts`)
- 6 arquivos, 708 linhas

**Conflitos Potenciais:** ✅ NENHUM (mudanças isoladas)

**Dependências:** ❌ Nenhuma

**Status:** ✅ Build READY, TypeScript correto, pronto para merge

**Recomendação:** ✅ **MERGE IMEDIATAMENTE**
- Rebase sobre `main`
- Squash 7 commits
- Validar typecheck + build

---

#### #155: PDV History with Drill-down
**Status:** ⏳ Not Draft (mas incomplete)  
**Objetivo:** Completar histórico com drill-down e ferramentas PDV

**Arquivos Principais:**
- PDV history features (25 arquivos)

**Status:** ⏸️ INCOMPLETE
- Descrição vazia (apenas template)
- Checklist não preenchido
- Base: `c2955b9` (diferente de main)

**Conflitos Potenciais:** ⚠️ DESCONHECIDO (sem detalhes)

**Dependências:** ❌ Desconhecida

**Recomendação:** 🔴 **FECHAR OU COMPLETAR**
- Autor precisa preencher descrição e checklist
- Ou: Fechar e reabrir com mais contexto

---

#### #150: UX/Design Audit + Quick Wins
**Status:** ⏳ Draft  
**Objetivo:** Consolidar UX issues + implementar quick wins

**Arquivos Principais:**
- `docs/AUDITORIA_UX_MODULOS_JINLONG.md` (diagnóstico)
- `/admin/clientes` (nova rota)
- `/admin/estoque/imprimir-etiquetas` (nova rota)
- `AdminRouteLoading` (dragão dourado)

**Mudanças Críticas:**
- 10 arquivos, +428 -5
- Quick wins: clientes, etiquetas, loading, bordas de input
- Reusa código existente (sem query nova)

**Conflitos Potenciais:** ⚠️ MÉDIO
- Base: `8c2c046` (antiga, vai precisar rebase)
- Colide com #156 (rotas `/admin/clientes`, `/admin/*`)

**Dependências:**
- ✅ Depende de: Nada (quick wins independentes)
- 🔄 Colide com: #156 (admin consolidation)

**Recomendação:** 🟡 **MERGE ANTES DE #156 OU CONSOLIDAR COM DELA**
- Opção A: Merge agora, depois #156 cuida de conflitos
- Opção B: Consolidar mudanças com #156 (reuse melhor)

---

## Consolidação Recomendada

### Super-PR: Employee Management + Commission System

**Motivo:** #159 depende totalmente de #161, mesma área (RH)

**Consolidar:**
- #158 (P0: cliente_id, secrets validation)
- #161 (Employee Registration - base)
- #159 (Commission System - depende de #161)

**Novo Branch:** `feature/employee-management-complete`

**Esforço de Consolidação:** 2h
1. Rebase #158 sobre `main`
2. Merge #158 → branch temp
3. Rebase #161 sobre temp
4. Merge #161 → branch temp
5. Rebase #159 sobre temp
6. Merge #159 → branch temp
7. Renumerar migrations para evitar conflitos
8. Single PR para review/merge

**Validações:**
- Migration sequence: 259-264 (respeitando ordem de dependência)
- RPC canônicas não quebradas
- RLS policies coerentes
- Guards passam: `guard:all`

---

## Sequência de Integração Recomendada (Menor Risco)

### Fase 1: Foundation Fixes (Sem Dependências)

**PRs:**
1. **#162** (StatusPublicacao type fix) ✅
   - Status: Estável, ready
   - Risco: Nenhum
   - Tempo: ~10 min

**Ações:**
- Rebase sobre `main`
- Merge com squash
- Validar: typecheck, build, Preview READY

---

### Fase 2: Admin Consolidation

**PRs:**
2. **#156** (Admin screen consolidation) ✅
   - Status: Dirty, precisa rebase
   - Risco: Alto (101 arquivos)
   - Tempo: ~30 min

**Ações:**
- Rebase sobre `main` (resolve conflitos)
- Validar: entity-ssot guard, typecheck, build
- Merge com squash
- Validar: `/admin/clientes`, `/admin/fornecedores`, `/admin/financeiro`

---

### Fase 3: UX Quick Wins

**PRs:**
3. **#150** (UX/Design audit quick wins) ⏳
   - Status: Draft, old base
   - Risco: Médio (bordas com #156)
   - Tempo: ~20 min

**Ações:**
- Rebase sobre main (após #162, #156)
- Validar: loading institucional, bordas de input
- Merge com squash
- Manual test: `/admin/clientes`, bordas no tema

---

### Fase 4: Employee Management (Super-PR Consolidada)

**PRs:**
4. **#158 + #161 + #159** (Consolidated Employee Management)
   - Status: Draft, múltiplas dependências
   - Risco: Muito alto (migrations, RPC canônicas)
   - Tempo: ~2h (consolidação) + 1h (validação)

**Pré-requisitos:**
- Phases 1-3 concluídas e merged

**Ações:**
1. **Consolidar em novo branch:**
   ```bash
   git checkout -b feature/employee-management-complete main
   # Merge sequencial: #158 → #161 → #159
   ```

2. **Resolver conflitos de migrations:**
   - Renumerar: 259→259, 260→260, 261→261 (já ordenado)
   - Ou se houver colisão: 259→259, 260→260, 261→261... (deixar sequencial)

3. **Validações críticas:**
   - `npm run guard:all` (core, pdv, routes, rpc, pricing, deps, migrations)
   - `npm run typecheck`
   - `npm run build`
   - E2E: Create employee → assign commission → finalize sale

4. **Merge único:**
   - Merge com rebase (mantém histórico)
   - Ou squash (mais limpo, mais fácil de reverter)

---

### Fase 5: PDV × Gerente Gaps (Se #152 ainda aberta)

**PRs:**
5. **#152** (PDV × Gerente integration gaps) ⏳
   - Status: Draft, after Phases 1-4
   - Risco: Médio (remove diretório, revalidatePath)
   - Tempo: ~30 min

**Pré-requisitos:**
- Phases 1-4 concluídas
- #161/#159 merged (migration 259-261 already in)

**Ações:**
- Rebase sobre main (após todas as anteriores)
- Renumerar migration 259 → 262 (já que 259-261 ocupadas)
- Validar remoção de `pdv-importados/supabase/migrations/` não quebra CI
- Merge com squash

---

## Checklist de Validação por Fase

### Validação Padrão (Toda PR antes de merge)
- [ ] Rebase sobre `main` atual
- [ ] Sem conflitos (ou resolvidos)
- [ ] `npm run typecheck` passa (ou TS5101 é único erro esperado)
- [ ] `npm run build` passa (local: sem Sentry blocker)
- [ ] Vercel Preview: READY ou no mínimo não ERROR
- [ ] Não há segredos (`.env`, chaves)
- [ ] Squash ou rebase antes do merge

### Validação Funcional (PRs com mudanças criticas)
- [ ] **Migrations:** `migration-sequence-guard` passa
- [ ] **RPC:** `rpc-gate-guard` passa
- [ ] **Routes:** `route-guard` passa
- [ ] **Entidades:** `check:entity-ssot` passa (se aplicável)
- [ ] **PDV Pipeline:** `check:pdv-invariant-boundary` passa (se toca pipeline)

### Validação Manual (Fase 2-4 antes de sign-off)
- [ ] **#156:** Navegar `/admin/clientes`, `/admin/fornecedores`, `/admin/financeiro`
- [ ] **#150:** Confirmar loader institucional, bordas de input
- [ ] **#158+#161+#159:** Create employee, assign commission, finalize sale com cliente

---

## PRs Sem Análise Detalhada (Pendentes)

| PR | Branch | Status | Próxima Ação |
|:---|--------|--------|-------------|
| #128-#130 | ? | ? | Investigar/analisar |
| #131 | ? | ? | Investigar/analisar |
| #133 | ? | ? | Investigar/analisar |
| #135 | ? | ? | Investigar/analisar |
| #137-#140 | ? | ? | Investigar/analisar |
| #148-#149 | ? | ? | Investigar/analisar |
| #155 | feature/cadastro-produto-melhorias | Incomplete | **Fechar ou Completar** |

**Recomendação:** Investigar próxima semana. Por enquanto, foco nas 8 analisadas acima.

---

## Sumário de Risco

| Fase | PRs | Risco | Bloqueadores | Tempo Total |
|------|-----|-------|--------------|------------|
| 1 | #162 | Baixo | Nenhum | 10 min |
| 2 | #156 | Alto | Conflitos (resolvíveis) | 30 min |
| 3 | #150 | Médio | Base antiga | 20 min |
| 4 | #158+#161+#159 | Muito Alto | Consolidação, migrations | 3h |
| 5 | #152 | Médio | Fase 4 completa | 30 min |

**Total:** ~4.5h de trabalho, com validações em cada fase

---

## Recomendação Final para Go-Live

✅ **Timeline Recomendado:**

1. **Hoje:** Merge #162 + #156 (foundation)
2. **Amanhã:** Merge #150 (UX polish)
3. **Próx. Sprint:** Consolidar + Merge #158+#161+#159 (Employee management)
4. **Próx. Sprint:** Merge #152 (PDV gaps)

**Veredito:** Com sequência acima, chegamos a Go-Live em ~1 semana com risco controlado.

---

**Documento Gerado:** 2026-07-11 21:30 UTC  
**Análise de:** 8 PRs de 20 abertas  
**Status:** Pronto para execução
