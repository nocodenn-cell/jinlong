# Go-Live — status atual (PR #267)

**Atualizado:** 2026-08-08 (UTC) · branch `cursor/reconciliacao-supabase-audit-633a`  
**Decisão:** ver seção 6 — revalidar após CI verde em `supabase db reset` + E2E crítico.

---

## 1. P0 — Greenfield `supabase db reset`

| Item | Status | Evidência |
|------|--------|-----------|
| Ordem SSOT 270–289 antes backports `202608*` | **DONE** | Renomeação → `20260731200300`…`20260731202200` (20 arquivos) |
| Mig `298` DROP overload inexistente | **DONE** | `DROP FUNCTION IF EXISTS` (21 e 20 args) |
| Mig `295` / `304` DROP sem IF EXISTS | **DONE** | `DROP FUNCTION IF EXISTS` |
| Terminadores `;` backports (ex. `20260801120000`) | **DONE** | commits anteriores + `08ff4fb7` |
| Mig `20260730093000` guards replace | **DONE** | `4f8d88ab` |
| `db reset --local` agente cloud | **BLOCKED** | Overlay Docker indisponível no pod (whiteout) |
| `db reset` CI GitHub Actions | **P0** | Aguardar run pós-commit de reordenação |

**Causa raiz ordem:** migrations `270_*` … `289_*` ordenavam **depois** dos timestamps `202608*` (comparação lexicográfica `"272" > "202608"`). Backports assumiam estado pós-272/274.

**Fase 3.2:** `20260808130200_*` **inalterada**. Drift **informativo** (`p0-migration-status.mjs`). **HUMAN GATE** produção — não aplicar via agente.

### Piloto vs Fase 3.2

- **Primeiro piloto comercial:** não depende do apply remoto da 3.2 se objetos `venda_finance_context` continuarem ausentes em prod (decisão 3.1: manter + idempotentizar **quando** houver janela).
- **Recomendação:** aplicar 3.2 em **janela controlada pós-piloto** ou quando espelho financeiro for requisito explícito do cliente — não bloqueia caixa/venda/estoque do piloto se app não consome a view hoje.

---

## 2. P0 — E2E crítico

| Item | Status | Evidência |
|------|--------|-----------|
| Causa `UNAUTHORIZED` smoke sync | **DONE** | Nonce não-UUID + HMAC sem `device` → `7b8c0f7b`, `14928ef8` |
| `smoke:sync-edge` PASS no CI | **P0** | Revalidar run pós-fix (run `31267812923` inconcluso no fechamento anterior) |
| Playwright caixa/sync pós-smoke | **P1** | Depende de smoke + secrets staging (`docs/E2E.md`) |

---

## 3. CI / gates PR #267

| Gate | Último estado conhecido | Classificação |
|------|-------------------------|---------------|
| `migration-remote-drift` | PASS (retry pooler) | P0 |
| `anti-replay-diagnostic-gate` | PASS | P1 |
| `Supabase local gates (RLS + scope + REST)` | FAIL → correções pushed | **P0** |
| `build-and-test` (pdv-importados) | PASS | P0 |
| E2E crítico | FAIL / inconcluso | **P0** |
| Fase 3.2 validate (git) | OK | P2 |

---

## 4. Checklist integração Go-Live (manual)

Executar **somente após** CI local gates + E2E crítico verdes.

| Fluxo | Status |
|-------|--------|
| Auth / RBAC | **P1** — não certificado nesta rodada |
| Cadastro produto (`/admin/catalogo`) | **P1** |
| Venda / caixa | **P1** |
| Estoque | **P1** |
| Financeiro | **P1** |
| Outbox / sync / `SYNC_KEY` | **P1** — anti-replay OK; smoke E2E pendente PASS |
| Edge Functions | **P2** — typecheck OK |
| Fiscal / NF-e piloto | **P2** — ambiente-dependent |

---

## 5. Pendências por prioridade

| ID | Prioridade | Descrição |
|----|------------|-----------|
| GF-RESET | **P0** | CI `supabase start` + reset até HEAD sem erro SQL |
| E2E-SMOKE | **P0** | Log CI com `[smoke-sync] OK` |
| BP-PROTECT | **P1** | Confirmar required checks apontam para job consolidado `Supabase local gates…` |
| INT-MANUAL | **P1** | Roteiro manual pós-CI |
| F32-HUMAN | **P2** | Decisão humana apply `20260808130200` em prod |
| GATE-PDV | **P1** | `npm run gate:pdv` (bloqueante go-live, fora Playwright) |

---

## 6. Decisão objetiva

**`BLOCKED`** até evidência:

1. Run CI: job **Supabase local gates** = success (incl. RLS smoke + `test:rls-scope` + REST local).
2. Run CI: **E2E crítico** = success com `smoke:sync-edge` OK.

Quando (1)+(2) verdes e checklist P1 executado → reclassificar **`NOT READY`** (piloto com riscos P1 documentados) ou **`READY`** se gate PDV + integração manual OK.

**Não declarar `READY` enquanto P0 acima estiver vermelho.**
