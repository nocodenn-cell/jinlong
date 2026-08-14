# Fase 3.2 — Migration timestamp `venda_finance_context`

> **HISTÓRICO / OBSOLETO desde 2026-08-10.** Este documento registra a decisão
> anterior de reativar o espelho. **Não executar os comandos de apply abaixo.**
> A migration `20260808130200` foi aposentada sem ter sido aplicada no projeto
> Jinlong. A convergência oficial futura é
> `20260810222702_retire_obsolete_venda_finance_context.sql`, ainda sujeita ao
> fluxo remoto e à autorização humana normais.

**Data:** 2026-08-08 (UTC)  
**Branch / PR:** `cursor/reconciliacao-supabase-audit-633a` · [#267](https://github.com/nocodenn-cell/fastproduct/pull/267)  
**Decisão 3.1:** `docs/FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md` (**MANTER + idempotentizar**)

---

## 1. Entrega

| Item | Valor |
|------|--------|
| **Arquivo** | `backend/supabase/migrations/20260808130200_24704_reapply_venda_finance_context_idempotent.sql` |
| **Versão tracking (nova)** | `20260808130200` |
| **Chave 252** | **Não reutilizada** — permanece apenas como histórico / replay local sequencial |
| **Corpo** | Derivado de `252_venda_finance_context_mirror.sql` (mesma semântica, DDL idempotente) |
| **Produção** | **Não alterada nesta etapa** |

---

## 2. Validações executadas

| Gate | Comando | Resultado |
|------|---------|-----------|
| Sequência migrations | `npm run guard:migrations` | **OK** (268 arquivos `.sql`) |
| Fase 1 backport | `node backend/supabase/scripts/validate-phase1-backport.mjs` | **30/30** |
| Fase 3.2 gate | `node backend/supabase/scripts/validate-phase3-2.mjs` | **OK** |
| P0 app (sem RPC alterada) | `npm test -- --run p0-venda-homologacao p0-roteiro-operacional` (pdv-importados) | **23/23** |
| **`supabase db reset` (stack local)** | `cd backend && npx supabase db reset --local --yes` | **Não executado** no agente cloud — **Docker indisponível** (`LegacyDockerLifecycleInspectError`) |
| **Smoke staging isolado** | Stubs `phase3-2-smoke-stubs.sql` + **2×** apply da migration + `verify-venda-finance-context-catalog.sql` | **10/10 checks OK** — ver `backend/supabase/reports/phase3-2-catalog-verify.json` |

### 2.1 Comparativo catálogo vs expectativa 252

| Objeto | Esperado (252) | Staging smoke |
|--------|----------------|---------------|
| Tabela `venda_finance_context` | Sim | OK |
| Índices loja/status/conta | Sim | OK |
| Policy `venda_finance_context_select_loja` | Sim | OK |
| `sincronizar_finance_context_venda` | Sim | OK |
| Funções/triggers pagamento e conta | Sim | OK |

Idempotência: **segunda aplicação** da mesma migration completou sem erro (NOTICEs `already exists` / `DROP IF EXISTS`).

---

## 3. Drift residual

| Área | Estado |
|------|--------|
| **Produção** | Migration **252** tracked; objetos **ausentes** — **inalterado** até HUMAN GATE |
| **Repo vs prod tracking** | Nova linha **`20260808130200`** existe só no git até apply remoto |
| **Replay local** | Ambientes que rodam 252 + 24704: 24704 deve ser **no-op** estrutural (idempotente) |
| **`db reset` completo** | Dev/CI com Docker: obrigatório antes do apply prod — ver §5 |

---

## 4. HUMAN GATE histórico — NÃO aplicar esta migration

**STOP:** `20260808130200` não deve ser aplicada por `apply_migration`, `db push`,
SQL manual ou repair. A decisão foi substituída pela aposentadoria forward. Não
reexecutar a chave histórica `252`. O próximo artefato oficial, quando houver
autorização remota, é a tombstone `20260810222702`.

---

## 5. Comandos úteis (dev/staging)

Os comandos e scripts da reaplicação foram aposentados. Para validar a
convergência atual, use `npm run check:venda-finance-context-retirement
--workspace backend` e o verificador de catálogo atual.

---

## 6. PR #268 (UI/UX)

Sem alteração — permanece ready for review/merge, escopo separado.
