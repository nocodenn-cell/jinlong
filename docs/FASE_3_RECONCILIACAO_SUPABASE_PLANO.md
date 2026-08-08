# Fase 3 — Reconciliação Supabase (plano de execução)

**Branch:** `cursor/reconciliacao-supabase-audit-633a` · **PR:** [#267](https://github.com/nocodenn-cell/fastproduct/pull/267)  
**Pré-requisito documental:** Fases 1–2 concluídas (`docs/RECONCILIACAO_SUPABASE_PRODUCAO_REPOSITORIO.md` §13)  
**Início Fase 3 (planejamento):** 2026-08-08 (UTC)  
**Regra inviolável:** nenhum `apply_migration` / `db push` / repair em **produção** sem gate humano explícito e staging verde.

---

## 1. Objetivo

Fechar o drift **tracking × catálogo** e consolidar SSOT git para o pacote prod-only já backportado (Fase 1), sem replay cego de versões colidentes.

## 2. Entregáveis Fase 3 (ordem)

| # | Entrega | Tipo | Bloqueio |
|---|---------|------|----------|
| 3.1 | Decisão produto: **manter** ou **descartar** `venda_finance_context` | Governança | **Concluída** — ver `docs/FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md` (**MANTER + idempotentizar**) |
| 3.2 | Se manter: **nova** migration timestamp com DDL idempotente derivado de `252_venda_finance_context_mirror.sql` (nunca reexecutar chave `252` em prod) | Git + staging | **Desbloqueada** (aguarda implementação; gate humano prod) |
| 3.3 | Se descartar: ADR + `migration repair` / nota em runbook (somente após aprovação) | Doc + ops | 3.1 |
| 3.4 | Classificar captures `20260618011821` / `20260618011922` no manifesto SSOT | Git/doc | — |
| 3.5 | Diff SQL automatizado para pares em `phase2-collisions.json` (253/255/268/278…) | Script read-only | — |
| 3.6 | Staging: `supabase db reset` + smoke RPCs P0 (venda, estoque, fiscal) pós-3.2 | CI/local | 3.2 |

## 3. Forense 252 (resumo)

- Produção: versão **252** tracked, objetos **ausentes** (`phase2-forensic-252.json`).
- App: **zero** runtime dependente hoje.
- Recomendação Fase 2: **reconstruir** via migration nova, não replay.

## 4. Gates obrigatórios (cada PR Fase 3)

| Gate | Comando | Estado baseline (2026-08-08) |
|------|---------|------------------------------|
| Backport Fase 1 | `node backend/supabase/scripts/validate-phase1-backport.mjs` | **30/30 OK** |
| Sequência | `npm run guard:migrations` | **OK** |
| Inventário | `node backend/supabase/scripts/reconcile-prod-repo-inventory.mjs` | **267 repo / 263 prod / onlyRepo=4 / onlyProd=0** |

## 5. Fora de escopo Fase 3

- Alterar RPCs de venda/fiscal além do necessário ao espelho 252 (se aprovado).
- UI/UX Admin V2 (fechado em PR #268).
- Merge administrativo na `main`.

## 6. Próximo passo imediato (agente)

1. ~~Obter decisão **3.1** (manter vs descartar espelho).~~ **Feito** — **MANTER + idempotentizar** (`docs/FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md`).
2. Implementar **3.2** (migration timestamp idempotente) + **3.5** / **3.4** em paralelo conforme capacidade — staging antes de prod.

---
