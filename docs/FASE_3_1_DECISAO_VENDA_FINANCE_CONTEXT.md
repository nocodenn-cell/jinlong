# Fase 3.1 — Decisão: `venda_finance_context`

**Data:** 2026-08-08 (UTC)  
**Branch / PR:** `cursor/reconciliacao-supabase-audit-633a` · [#267](https://github.com/nocodenn-cell/fastproduct/pull/267)  
**Projeto Supabase prod:** jinlong (ref omitido — dashboard Supabase)  
**Modo:** análise read-only — **produção não alterada** · **sem replay da migration 252**

---

## 1. Decisão (executiva)

| Campo | Valor |
|-------|--------|
| **Decisão** | **MANTER + idempotentizar** |
| **Próximo passo** | **Fase 3.2** — nova migration **timestamp** com DDL derivado de `252_venda_finance_context_mirror.sql` |
| **Proibido** | Reexecutar / “re-aplicar” a chave **`252`** em produção (já registrada em `schema_migrations`) |
| **Prod (esta entrega)** | Nenhum DDL/DML |

**Descartar formalmente** o espelho foi **rejeitado** nesta análise (§5).

---

## 2. Comparativo produção × repositório

### 2.1 Repositório (SSOT git)

| Item | Evidência |
|------|-----------|
| Arquivo | `backend/supabase/migrations/252_venda_finance_context_mirror.sql` |
| SHA256 | `96f45cd68c54521ee5ce557a2cd172ba73c556c2458f1f0d23327a3eac2ac295` |
| Conteúdo | Tabela espelho, RLS SELECT, `sincronizar_finance_context_venda`, triggers em `vendas_pagamentos` / `contas_receber`, backfill vendas `CONCLUIDA` |
| Idempotência | `CREATE IF NOT EXISTS`, `DROP … IF EXISTS`, `CREATE OR REPLACE` |
| Papel | Espelho **passivo** — não substitui caixa nem `contas_receber` (comentários no próprio arquivo) |

### 2.2 Produção (read-only, 2026-08-08)

Consultas via Supabase MCP `execute_sql`:

| Objeto | Produção |
|--------|----------|
| `public.venda_finance_context` | **Ausente** |
| `sincronizar_finance_context_venda` | **Ausente** |
| `trg_finance_context_via_pagamento` / `_conta` | **Ausentes** |
| Triggers `trg_finance_context_*` | **Ausentes** (nenhum trigger `%finance%` em `vendas_pagamentos` / `contas_receber`) |
| Policy RLS na tabela | **N/A** (tabela inexistente) |

| Tracking | Produção |
|----------|----------|
| `schema_migrations.version = '252'` | **Presente** |
| `name` | `venda_finance_context_mirror` |
| `statements` | **22** blocos; prefixo alinhado ao header do repo |
| Drops posteriores da tabela/função | **0** ocorrências em `statements` de todas migrations |

**Conclusão comparativa:** drift **tracking × catálogo** — produção declara 252 **applied**, mas o catálogo está como se a migration **nunca tivesse criado objetos** (ou objetos removidos fora do histórico versionado, sem evidência em `statements`).

Artefato machine-readable: `backend/supabase/reports/phase3-1-decision-venda-finance-context.json`  
Forense Fase 2: `backend/supabase/reports/phase2-forensic-252.json`

---

## 3. Uso em runtime (aplicação)

| Superfície | Referência a `venda_finance_context` |
|------------|--------------------------------------|
| `pdv-importados` | Apenas `lib/supabase/database.types.ts` (tipos gerados) |
| `pdv-local` | **Nenhuma** |
| `shared-core` | **Nenhuma** |
| RPC `finalizar_venda_transacional_canonica_v4` | **Sem dependência hard** — menções “PASSO 7” são **comentários** em `24702`, `268`, `272`, `274` |

Operação atual em prod **não consulta** o espelho; ausência dos objetos **não explica** falhas PDV conhecidas.

---

## 4. Opções avaliadas

### 4.1 Replay cego da migration 252

**Rejeitada.** A versão `252` já ocupa PK em `supabase_migrations.schema_migrations`. Replay manual ou repair sem nova versão não é caminho SSOT e viola a regra desta fase.

### 4.2 Descartar formalmente o espelho

**Rejeitada** para o FastProduct neste ciclo, porque:

1. O SSOT git **mantém** 252 no replay de `db reset` / novos ambientes — descarte de produto sem remover ou obsoletar o arquivo deixaria prod **permanentemente** divergente do baseline local.
2. O tracking prod **já marca** 252 como applied — descarte não corrige a inconsistência; apenas aceita mentira no ledger.
3. A intenção arquitetural (espelho passivo documentado) permanece válida para reconciliação financeira futura e alinhamento com comentários da cadeia v4.

Se produto **no futuro** decidir abandonar o espelho, exigir **ADR +** remoção/obsolescência explícita no repo **e** nota de tracking (fora do escopo 3.1).

### 4.3 Manter + idempotentizar (nova timestamp) — **APROVADA**

**Aprovada** como decisão 3.1:

- Corpo SQL reutilizado de 252 (já idempotente), publicado como **nova versão** (ex. `20260808130000_*` ou próximo livre `24704` conforme guard).
- Staging: `db reset` + smoke P0 **antes** de qualquer gate em produção.
- Produção: somente após review humano explícito (Fase 3.2), **sem** tocar na linha 252 existente.

---

## 5. Riscos e mitigação (Fase 3.2, não executada aqui)

| Risco | Mitigação |
|-------|-----------|
| Backfill de vendas `CONCLUIDA` pesado | Medir em staging; opcional batch / limitar janela na migration 3.2 |
| Triggers extras em pagamentos/contas | Escopo limitado a espelho; sem alteração de totais/RPC v4 |
| Regressão app | Zero queries hoje — smoke RPC + vendas homologação |

---

## 6. Gates desta entrega (3.1)

| Gate | Resultado |
|------|-----------|
| Produção mutada | **Não** |
| Replay 252 | **Não** |
| Evidência prod fresh MCP | **Sim** (§2.2) |
| Decisão documentada | **Sim** (este arquivo + JSON) |

---

## 7. Relação com PR #268 (UI/UX)

Fase UI/UX permanece **encerrada** e **independente** — PR [#268](https://github.com/nocodenn-cell/fastproduct/pull/268) ready for review/merge; nenhuma alteração de UI nesta entrega 3.1.
