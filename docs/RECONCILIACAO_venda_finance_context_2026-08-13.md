# Reconciliação — `venda_finance_context`: MANTER vs RETIRAR

**Data:** 2026-08-13 · **Classificação:** 🔴 **BLOCKED** (bloqueio de evidência, não técnico)
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

## 4. Classificação

### 🔴 BLOCKED

**Bloqueado por evidência, não por técnica.** O trabalho técnico está completo e verde; o que falta
é a branch que contradiz a premissa.

**Desbloqueio — um comando:**

```bash
git push -u origin codex/reconcile-db-final
```

Com a branch publicada, fecho em uma passagem: commit e autor da decisão, presença ou ausência de
ADR, diff real da migration de retirada, impacto no ledger de produção, e reclassificação para
`NO PROD ACTION REQUIRED` (provável, se a retirada valer) ou `READY FOR HUMAN APPLY` (se FASE_3_1
for reconfirmada).

## 5. Lição estrutural

Este episódio é a mesma classe de falha que o ADR-011 fechou: **duas fontes de verdade para
schema**. Lá eram dois diretórios de migrations no mesmo repo; aqui são dois repositórios — o
publicado e a cópia local do dono — divergindo na mesma tabela.

O ADR-011 protege contra a primeira. Contra a segunda, a proteção é de processo: **decisão de
schema que muda uma decisão registrada em ADR/FASE precisa ser publicada antes de ser executada**,
mesmo que só localmente. Um `db reset` local verde numa branch invisível não é evidência
compartilhável — foi exatamente o que quase levou a um apply em produção baseado em plano superseded.
