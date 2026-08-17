# ADR-012 — Aposentadoria do espelho `venda_finance_context`

| Campo | Valor |
|--------|--------|
| **ID** | ADR-012 |
| **Título** | Retirar o espelho financeiro passivo `venda_finance_context` |
| **Status** | Aceito |
| **Data** | 2026-08-10 (decisão) · 2026-08-13 (formalização) |
| **Decisor** | `nocodenn-cell <nocodenn@gmail.com>` — dono do projeto |
| **Supersede** | [`FASE_3_1`](../FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md) (MANTER + idempotentizar), [`FASE_3_2`](../FASE_3_2_REAPPLY_VENDA_FINANCE_CONTEXT.md), [`FASE_3_RECONCILIACAO_SUPABASE_PLANO`](../FASE_3_RECONCILIACAO_SUPABASE_PLANO.md) §3.2 |
| **Relacionados** | [ADR-011](./ADR-011-ssot-unico-migrations.md) · [RECONCILIACAO 2026-08-13](../RECONCILIACAO_venda_finance_context_2026-08-13.md) |

---

## Contexto

`FASE_3_1` (2026-08-08) decidiu **MANTER + idempotentizar** o espelho, rejeitando explicitamente o
descarte (§4.2) e condicionando qualquer reversão futura a *"**ADR +** remoção/obsolescência
explícita no repo **e** nota de tracking"*.

Dois dias depois, o dono tomou a decisão oposta, direto em código:

| Campo | Valor |
|---|---|
| Commit | `17890230c7e92b1320eaa4580bb100b313ac20ed` — *"fix(db): retire obsolete venda finance context"* |
| Autor | `nocodenn-cell <nocodenn@gmail.com>` |
| Data | 2026-08-10 19:39:48 -0300 |
| Branch | `codex/reconcile-db-final` (publicada em 2026-08-13, `eb6c5c4`) |

O commit **remove** `20260808130200_24704_reapply_venda_finance_context_idempotent.sql` (203 linhas)
e **adiciona** `20260810222702_retire_obsolete_venda_finance_context.sql` (25 linhas), junto com o
smoke e o validador da aposentadoria, aposentando também `validate-phase3-2.mjs`.

**Este ADR é a peça que faltava.** A decisão é do dono e é autoritativa; o que não existia era o
registro exigido pela própria `FASE_3_1`. Sem ele, o repositório carregava uma decisão de fato
contradizendo uma decisão registrada, sem trilha.

## Decisão

**Aposentar** `venda_finance_context`. As autoridades financeiras permanecem em
`vendas_pagamentos`, `contas_receber` e caixa — como já eram na prática.

A migration `20260810222702` derruba, **nesta ordem deliberada**, triggers → funções de trigger →
função de sincronização → tabela. Toda operação é `IF EXISTS`, e **sem `CASCADE`**: uma dependência
externa inesperada deve interromper a migration para revisão humana, não ser removida em silêncio.

A migration histórica **`252` permanece imutável**. A tombstone existe justamente para que um
replay greenfield (que aplica a `252` e cria os objetos) convirja para o mesmo estado da produção
(que não os tem).

## Evidência que sustenta

Verificação **somente leitura** em produção (`jinlong` / `kbabmewnahysfvlybiak`), 2026-08-13:

| Objeto | Produção |
|---|---|
| Tabela `venda_finance_context` | **ausente** |
| `sincronizar_finance_context_venda` + funções de trigger | **ausentes** |
| Triggers `trg_finance_context_*` | **ausentes** |
| Ledger `252` (`venda_finance_context_mirror`) | presente |
| Ledger `20260808130200` / `20260810222702` | ausentes |

E no código: **zero** referências a `venda_finance_context` em `pdv-importados`, `pdv-local`,
`shared-core` e Edge Functions — apenas em `lib/supabase/database.types.ts` (tipos gerados).

Ou seja: aposentar formaliza o que já é verdade. Aplicar o caminho anterior criaria em produção
objetos que ninguém consome.

## Consequências

**Em produção: nenhuma ação.** Os objetos já não existem; derrubar o ausente é no-op. Classificação
do item: **`NO PROD ACTION REQUIRED`**.

**A linha `252` do ledger não deve ser reparada.** `FASE_3_1` §4.1 proíbe, e a proibição segue
válida: o ledger registra o que executou, não o estado do catálogo.

**Ambientes greenfield** aplicam `252` (cria) e depois `20260810222702` (remove) — convergindo ao
schema canônico. É o comportamento pretendido, não desperdício.

**Dívida remanescente:** `20260808130200` foi removida em `codex/reconcile-db-final`, mas **ainda
existe em `origin/main`**. Enquanto as duas branches não convergirem, `main` carrega uma migration
que este ADR declara obsoleta. Resolver no merge — não por remoção avulsa.

## Alternativa rejeitada

**Manter + idempotentizar** (`FASE_3_1` §4.3). O argumento original era que o SSOT git manteria a
`252` no replay de novos ambientes, deixando produção permanentemente divergente do baseline. A
tombstone resolve isso melhor: em vez de fazer produção convergir para o espelho, faz o replay
convergir para produção — sem criar objeto que ninguém usa.
