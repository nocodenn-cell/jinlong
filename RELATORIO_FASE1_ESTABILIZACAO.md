# Relatório Técnico — Ciclo Fase 1 (Estabilização)

**Data:** 2026-07-12  
**Branch:** `feat/admin-screen-consolidation`  
**Papel:** Principal Software Architect — missão Enterprise (ordem obrigatória)

---

## Decisão do ciclo

**Fase 1 concluída no código** (árvore utilizável, typecheck/build/guards verdes no que depende do repo).  
**Fase 2+ ainda não iniciadas** (sem features novas neste ciclo).  
**CI remoto** permanece bloqueado por billing GitHub (fora do código) — ver `docs/GITHUB_ACTIONS_BILLING_UNBLOCK.md`.

---

## 1. Estado inicial → ações

| Critério Fase 1 | Antes | Depois |
|-----------------|-------|--------|
| Conflitos de merge | Nenhum (`NO_MERGE`) | Mantido |
| Marcadores `<<<<<<<` | 0 | 0 |
| Typecheck | — | **PASS** |
| Build `pdv-importados` | — | **PASS** |
| Teste consolidação | 1 FAIL (LEGACY contas-pagar) | **18/18 PASS** |
| `guard:routes` | OK | OK |
| `guard:migrations` | 247a/b/c **invisíveis** ao guard | **24701/02/03** visíveis; OK |
| Rotas compras duplicadas semanticamente | `compras` → recebimento | `compras` → `/admin/compras` |
| Git status | sujo (`pdv-local` + untracked) | `pdv-local` restaurado; untracked restantes documentados |

---

## 2. Correções implementadas (com justificativa)

### 2.1 Migrations `247a/b/c` → `24701/02/03`

**Problema:** CLI Supabase e `migration-sequence-guard` usam `^(\d+)_`. Sufixo letteral fazia `Skipping migration…`.  
**Decisão:** renomear para IDs numéricos `24701`, `24702`, `24703` (ordenam antes de `248`).  
**Inspiração:** disciplina de migration ordering (OFBiz/ERPNext: versions monotônicas sem ambiguidade).  
**Risco:** remoto `jinlong` pode ter aplicado versões com outros nomes — promote exige reconciliação manual (já no Go-Live Report).

### 2.2 SSoT de navegação — compras e contas a pagar

**Problema:** `GERENTE_NAV_HREF.compras` apontava para recebimento (destino errado). LEGACY contas-pagar vs teste `?tab=pagar` divergiam.  
**Decisão arquitetural:** canônico = `ROUTES.admin.compras` e `ROUTES.admin.financeiroContasPagar` (página dedicada já existente).  
**Justificativa:** uma entidade/ação → uma rota; query-string `?tab=` continua válida como atalho interno do painel unificado, mas deep-link/legado usam a rota dedicada.  
**Inspiração:** Saleor/Medusa — canonical URLs para recursos admin.

### 2.3 Teste consolidação alinhado ao SSoT

Atualizado `consolidacao-post-audit.test.ts` para esperar `financeiroContasPagar`.

### 2.4 Higiene de working tree

`pdv-local/*` diffs restaurados (fora do escopo deste ciclo; não commitados).  
`pages/_error.jsx` na raiz permanece **untracked** (scaffold Sentry Pages Router fora do app App Router) — quarentena adiada para não misturar limpeza documental sem aprovação.

---

## 3. Evidências de validação

```text
npm run typecheck -w pdv-importados     → exit 0
npm run build -w pdv-importados         → exit 0
vitest consolidacao-post-audit          → 18/18
npm run guard:routes                    → OK (23 rotas)
npm run guard:migrations                → OK (próximo livre 24704)
```

---

## 4. Benchmark (Fase 3 — só pesquisa neste ciclo)

Não incorporamos features novas. Referências usadas apenas para decisões de estabilização:

| Conceito | Fonte | Adaptação FastProduct |
|----------|-------|------------------------|
| Versões de migration monotônicas | ERPNext / Frappe | Rename `2470x` numérico |
| Canonical admin URLs | Saleor Dashboard | `ROUTES.admin.*` SSoT |
| Separar compra vs recebimento | Odoo (Purchase vs Receipt) | `compras` ≠ `estoqueRecebimento` |

---

## 5. Pendências (bloqueiam “Fase 1 100% enterprise”)

| ID | Item | Owner |
|----|------|-------|
| P1-CI | Billing GitHub Actions | Conta |
| P1-HOMOL | Homolog remota Sprint B (Pro / slot Free) | PO |
| P1-DRIFT | Reconciliar `schema_migrations` em `jinlong` vs `24701/02/03/248` | Backend |
| P1-ORPHAN | Decidir destino de `pages/_error.jsx` e `.cursor/plans/` | Arch |
| P1-GUARD-CORE | `guard:core` legado (ProdutoFormModal / LoginForm) | Fase 2 |

---

## 6. Backlog atualizado (pós Fase 1)

1. **Fase 2** — `guard:core`, acoplamento `admin→gerente`, drift migrations remoto  
2. **Homolog remota 248** (já smoke local OK)  
3. **Fase 4** — devolução já em branch; inventário cíclico / reservas / SKU / command palette  
4. **Fase 5** — `modules/*`  
5. **Sprint C** — ainda bloqueada pelo gate de homologação

---

## 7. O que NÃO foi feito (de propósito)

- Nenhuma feature nova (Fase 4)  
- Sprint C  
- Apply migration em `jinlong`  
- Refactor amplo `modules/*`

---

*Próximo ciclo sugerido: Fase 2 (arquitetura) começando por `guard:core` + inventário de acoplamento admin/gerente, em paralelo ao desbloqueio de CI/homolog remota.*
