# Reconciliação — `venda_finance_context`: MANTER vs RETIRAR

**Data:** 2026-08-13 · **Classificação:** 🟢 **NO PROD ACTION REQUIRED** *(atualizada — ver §6)*
**Fonte única de verdade** para este item. Supersede a seção de status de
`READY_FOR_HUMAN_APPLY_venda_finance_context.md`, que está **rebaixado a NÃO EXECUTAR**.

---

## 1. O gatilho

O dono reportou um `supabase db reset --local --yes` **verde** na branch `codex/reconcile-db-final`
(`C:\fastproduct\backend`), cuja sequência aplicada:

- **não contém** `20260808130200_24704_reapply_venda_finance_context_idempotent.sql`;
- **termina em** `20260810222702_retire_obsolete_venda_finance_context.sql`.

Isso inverte a decisão sobre a qual o pacote de apply foi construído.

## 2. Respostas com evidência

### 2.1 A migration `20260808130200` foi removida, renomeada, arquivada ou substituída?

**Neste repositório: NÃO.** Presente e inalterada.

```
git cat-file -e HEAD:backend/.../20260808130200_...sql                 → PRESENTE
git cat-file -e origin/main:backend/.../20260808130200_...sql          → PRESENTE
```

Última migration de `origin/main`: `20260809120837_finalize_v4_scope_guard_22args.sql`.

**Fora deste repositório: INDETERMINADO.** A remoção ocorreu em `codex/reconcile-db-final`, que
**não existe no `origin`**:

```
git ls-remote origin | grep -iE "codex|reconcile-db-final"   → (vazio)
```

E a migration de retirada **não existe em nenhuma ref** deste repositório:

```
git log --all --oneline --name-only --diff-filter=A | grep -i retire
→ backend/supabase/migrations/026_pdv_config_retire_default_gerente_hash.sql   (2026, sem relação)
```

Nenhum `20260810222702`. O `origin` não tem **nenhuma** migration com data ≥ 2026-08-10.

### 2.2 Qual commit tomou a decisão?

**Não determinável.** O commit não está neste repositório. Só é auditável depois de
`git push -u origin codex/reconcile-db-final`.

**Não vou inferir o autor, a data ou a justificativa a partir do nome do arquivo.** Nome de
migration não é evidência de intenção.

### 2.3 Por que a estratégia mudou de MANTER para RETIRAR?

**Não determinável com a evidência disponível** — e esta é a lacuna mais séria, porque
**contraria uma decisão documentada e formalmente fechada**.

`docs/FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md` §4.2 **rejeitou** descartar o espelho, com três
razões, e impôs uma condição explícita para qualquer reversão futura:

> *"Se produto **no futuro** decidir abandonar o espelho, exigir **ADR +** remoção/obsolescência
> explícita no repo **e** nota de tracking (fora do escopo 3.1)."*

**Nenhum ADR de retirada existe neste repositório.** `docs/adr/` tem 9 ADRs (005–011 + 2 nomeados);
nenhum trata de `venda_finance_context`. Portanto, ou o ADR está na branch não publicada, ou a
condição da FASE_3_1 não foi cumprida.

> **Decisão necessária do dono** — não escolho silenciosamente entre as duas:
> **(A)** a retirada é a decisão vigente → exige ADR formal superseding FASE_3_1, e este pacote
> é descartado; ou
> **(B)** FASE_3_1 continua vigente → a migration de retirada é que precisa ser revista.

### 2.4 Os documentos refletem a decisão vigente?

**Não.** Tudo em `origin/main` reflete **MANTER + idempotentizar**:

| Documento | O que afirma hoje | Status |
|---|---|---|
| `FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md` | Decisão: **MANTER + idempotentizar**; descarte **rejeitado** (§4.2) | ⚠️ Contrariado pela branch |
| `FASE_3_2_REAPPLY_VENDA_FINANCE_CONTEXT.md` | Entrega em git; prod sob **HUMAN GATE** (§4) | ⚠️ Idem |
| `FASE_3_RECONCILIACAO_SUPABASE_PLANO.md` | 3.1/3.2 concluídas; 3.3 (descarte) condicionado a 3.1 | ⚠️ Idem |
| `GO_LIVE_CERTIFICATION_REPORT.md` §5 | "Fase 3.2 `20260808130200` (git-only) — P2 — HUMAN GATE" | ⚠️ Idem |
| `READY_FOR_HUMAN_APPLY_venda_finance_context.md` | Pacote de apply | 🔴 **Rebaixado a NÃO EXECUTAR** |
| `migration-human-gates.json` | — | ❌ **Nunca existiu neste repo** (`git log --all --diff-filter=A` → vazio) |

### 2.5 Estado atual: produção × repo × catálogo

São **três** estados distintos hoje — essa é a raiz do problema:

| Ambiente | `venda_finance_context` | Tracking | Fonte |
|---|---|---|---|
| **Produção** | objetos **ausentes** do catálogo | `252` marcada **applied**; `20260808130200` **não** aplicada | `phase2-forensic-252.json` (MCP read-only, 2026-08-08) |
| **Repo `origin/main`** | migration presente, **nunca aplicada** em prod | — | `git cat-file` (§2.1) |
| **Local do dono** (`codex/reconcile-db-final`) | espelho **retirado** por `20260810222702` | reset local verde | Relato do dono |

O drift original (**tracking × catálogo**) em produção **permanece exatamente como estava**. Nada
mudou em produção — o `db reset` foi local.

### 2.6 Ainda é necessária alguma operação em produção?

**INDETERMINADO — e nenhuma deve ser feita agora.**

- Se vale **(A) retirar**: provavelmente **nenhuma** operação. Os objetos já estão ausentes do
  catálogo de produção; retirar algo ausente é no-op. Restaria só a decisão sobre a linha `252` no
  ledger — que a FASE_3_1 §4.1 já proíbe reparar.
- Se vale **(B) manter**: o apply de `20260808130200` volta à mesa, com o pacote já validado.

Executar qualquer um dos dois antes de decidir é o pior caminho: aplicar (B) e depois (A) cria e
destrói objetos em produção sem ganho algum.

## 3. Validadores executados nesta reconciliação

Todos sobre `HEAD` desta branch (270 `.sql`):

| Validador | Resultado |
|---|---|
| `node backend/supabase/scripts/validate-phase3-2.mjs` | ✅ exit 0 — "Phase 3.2 validation OK" |
| `node backend/supabase/scripts/validate-phase1-backport.mjs` | ✅ exit 0 — **30/30** backport files |
| `node scripts/migration-sequence-guard.mjs` | ✅ exit 0 — sem colisão; SSOT único |
| `node backend/supabase/scripts/reconcile-prod-repo-inventory.mjs` | ✅ exit 0 (snapshot 2026-08-08: 267 repo / 263 prod / onlyProd=0) |

> Os validadores passam porque avaliam **este** repositório, que é internamente consistente. Eles
> **não** detectam a divergência: nenhum deles enxerga uma branch não publicada. Passar aqui **não**
> valida a decisão de retirada.

### 3.1 Prova direta da divergência — `db reset` nas duas branches

O CI desta branch executou o **mesmo comando** que o dono rodou localmente, com resultado oposto
([job 94569341772](https://github.com/nocodenn-cell/fastproduct/actions/runs/31736472990/job/94569341772), ✅ success):

| | `claude/jinlong-doc-assimilation-f155hr` (CI, verificável) | `codex/reconcile-db-final` (local do dono, relatado) |
|---|---|---|
| Comando | `npx supabase db reset --local --yes` | idem |
| Resultado | `Finished supabase db reset on branch claude/jinlong-doc-assimilation-f155hr.` | `Finished supabase db reset on branch codex/reconcile-db-final.` |
| `20260808130200` | **aplicada** (`Applying migration 20260808130200_24704_reapply…`) | **ausente** |
| `20260810222702_retire_obsolete…` | **0 ocorrências no log** | **última da sequência** |
| Pós-reset | `RLS_REST_SMOKE_OK` | — |

Duas branches, o mesmo comando, **conjuntos de migrations diferentes**. Não é ambiguidade de
leitura: é divergência de conteúdo, e só uma das duas pode ser a intenção vigente.

**Efeito colateral positivo:** o pré-requisito do Passo 1 do pacote de apply (`db reset` completo
verde com a migration na cadeia) está **fechado com evidência de CI**. O que falta é decisão, não
validação técnica.

## 4. Estado de produção — verificado ao vivo (2026-08-13)

Consulta **somente leitura** ao projeto `jinlong` (`kbabmewnahysfvlybiak`), via Supabase MCP.
Nenhuma mutação. Isto substitui a forense de 2026-08-08 como evidência mais recente.

```sql
SELECT to_regclass('public.venda_finance_context') IS NOT NULL;      -- false
SELECT proname FROM pg_proc … 'sincronizar_finance_context_venda',
       'trg_finance_context_via_pagamento','trg_finance_context_via_conta';   -- 0 linhas
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_finance_context%';       -- 0 linhas
SELECT version,name FROM supabase_migrations.schema_migrations
 WHERE version IN ('252','20260808130200','20260810222702')
    OR name ILIKE '%finance_context%';        -- só: 252 | venda_finance_context_mirror
```

| Objeto | Produção |
|---|---|
| Tabela `venda_finance_context` | **ausente** |
| `sincronizar_finance_context_venda` + funções de trigger | **ausentes** |
| Triggers `trg_finance_context_*` | **ausentes** |
| Ledger `252` (`venda_finance_context_mirror`) | **presente** |
| Ledger `20260808130200` (reapply) | **ausente** |
| Ledger `20260810222702` (retire) | **ausente** |

O drift tracking × catálogo **persiste e é atual**: o ledger afirma que a `252` rodou; o catálogo
não tem nada do que ela criaria.

## 5. As 7 perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Qual commit introduziu a aposentadoria | ⛔ **Indeterminável** — está em `codex/reconcile-db-final`, não publicada |
| 2 | Qual ADR autorizou | ⛔ **Nenhum ADR existe** em ref publicada. `FASE_3_1` §4.2 exige um para reverter o MANTER |
| 3 | A `20260808130200` ainda existe | ✅ **Sim** — presente em `origin/main` e nesta branch, inalterada |
| 4 | O runtime depende do objeto | ✅ **Não** — zero referências em `pdv-importados`, `pdv-local`, `shared-core` e Edge Functions; só em `lib/supabase/database.types.ts` (tipos gerados) |
| 5 | Produção tem objetos relacionados | ✅ **Não** — zero, verificado ao vivo (§4) |
| 6 | Alguma ação remota é necessária | ✅ **Não** — ver §6 |
| 7 | Quais documentos ficaram superseded | ✅ `FASE_3_1`, `FASE_3_2`, `FASE_3_RECONCILIACAO_SUPABASE_PLANO`, `GO_LIVE_CERTIFICATION_REPORT` §5 e o pacote de apply — todos já marcados |

## 6. Classificação

### 🟢 NO PROD ACTION REQUIRED

Vale sob **qualquer** das duas decisões, e é por isso que a classificação pode ser única mesmo com
a autoria da mudança ainda indeterminada:

- **Se aposentar** (direção da branch do dono): produção **já não tem** os objetos. Retirar o que
  está ausente é no-op. Nada a executar.
- **Se manter**: o apply da `20260808130200` deixou de ser ação pendente — está contestado por
  decisão posterior e explicitamente bloqueado. Não é pendência, é proposta em disputa.

Em ambos os casos: **nenhuma operação em produção**. E a linha `252` do ledger **não deve ser
reparada** — `FASE_3_1` §4.1 já proíbe, e a proibição segue válida.

### Por que a direção de aposentar é a coerente com a evidência

Não é decisão minha, mas a evidência aponta para um lado: produção tem zero objetos, o runtime tem
zero dependência, e o único argumento registrado a favor de manter (`FASE_3_1` §4.2 — "o SSOT git
mantém 252 no replay para novos ambientes") é justamente o que a migration de aposentadoria
resolve. Aplicar o reapply criaria em produção objetos que ninguém consome, para que uma migration
seguinte os removesse.

### ✅ Formalização concluída — [ADR-012](./adr/ADR-012-aposentadoria-venda-finance-context.md)

A branch foi publicada em 2026-08-13 (`eb6c5c4`), o que permitiu fechar as duas perguntas antes
indetermináveis:

| # | Pergunta | Resposta auditada |
|---|---|---|
| 1 | Commit da aposentadoria | `17890230c7e92b1320eaa4580bb100b313ac20ed` — *"fix(db): retire obsolete venda finance context"*, autor **`nocodenn-cell <nocodenn@gmail.com>`** (dono), 2026-08-10 19:39:48 -0300 |
| 2 | ADR que autorizou | **Não existia** — nenhum dos 5 commits da branch toca `docs/`. Lacuna suprida agora por **ADR-012** |

O commit remove `20260808130200` (203 linhas), adiciona `20260810222702` (25 linhas), mais smoke e
validador da aposentadoria, e aposenta `validate-phase3-2.mjs`.

A decisão é do dono e é **autoritativa** — o que faltava era o registro exigido pela própria
`FASE_3_1` §4.2. Com o ADR-012, não há mais decisão de fato sem trilha.

**Item encerrado.** Classificação final inalterada: **`NO PROD ACTION REQUIRED`**.

### Único resíduo — a resolver no merge, não avulso

`20260808130200` foi removida em `codex/reconcile-db-final` mas **ainda existe em `origin/main`**.
Enquanto as branches não convergirem, `main` carrega uma migration que o ADR-012 declara obsoleta.
Não removê-la isoladamente: isso é trabalho de merge entre as duas branches.

## 5. Lição estrutural

Este episódio é a mesma classe de falha que o ADR-011 fechou: **duas fontes de verdade para
schema**. Lá eram dois diretórios de migrations no mesmo repo; aqui são dois repositórios — o
publicado e a cópia local do dono — divergindo na mesma tabela.

O ADR-011 protege contra a primeira. Contra a segunda, a proteção é de processo: **decisão de
schema que muda uma decisão registrada em ADR/FASE precisa ser publicada antes de ser executada**,
mesmo que só localmente. Um `db reset` local verde numa branch invisível não é evidência
compartilhável — foi exatamente o que quase levou a um apply em produção baseado em plano superseded.
