# Estratégia de integração — stack #473…#479

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Tip consolidado** | `9f72ce56` — `cursor/fechamento-caixa-por-forma-pr-b-7da4` (PR **#479**) |
| **Commits exclusivos vs `main`** | 21 (linear) |
| **Conflitos com `main`** | Nenhum (`git merge-tree` → tree limpa) |
| **Merge automático** | **Proibido** — decisão humana |

## Tabela da cadeia

| PR | Base | Head | Conteúdo | Necessário em `main`? | Estratégia |
|----|------|------|----------|----------------------|------------|
| **#473** | `main` | `…governanca…` (`4c9021bf`) | Docs governança + mapa SSoT | Sim (via tip) | Não mergear isolado após tip |
| **#474** | #473 | `…auditoria…` (`93579573`) | Auditoria NO-GO | Sim (via tip) | Idem |
| **#475** | #474 | `…go-condicional…` (`0173ff44`) | Fiscal cancelado + entity-ssot | **Sim** | Contido no tip |
| **#476** | #475 | `…remediacao-ssot…` (`1292520e`) | SSOT-001…004 + migrations | **Sim** | Contido no tip |
| **#477** | #476 | `…proxima-fase…` (`b3cfc86d`) | Docs pós-gate / próxima capacidade | Sim (via tip) | Idem |
| **#478** | #477 | `…pr-a…` (`a412496a`) | RPC por forma (PR A) | **Sim** | Contido no tip |
| **#479** | #478 | `…pr-b…` (`9f72ce56`) | UX + snapshot fechamento | **Sim** | **Tip a mergear** |

Todos os PRs estavam `MERGEABLE` / `CLEAN` na inspeção. O tip de **#479** contém linearmente os 21 commits desde `main`.

## Estratégia escolhida (menor risco)

### Estratégia 2 — integração pelo tip consolidado (**recomendada**)

1. Revisar e mergear **#479** em `main` (ou abrir PR tip→`main` se o GitHub exigir base `main`).
2. Fechar #473…#478 como **supersedidos** **sem** re-mergear os mesmos commits.
3. Aplicar migrations no remoto Jinlong só com **autorização humana** e janela própria.

### Estratégia 1 — merge bottom-up (aceitável, mais lento)

`#473 → #474 → #475 → #476 → #477 → #478 → #479`, atualizando base de cada filho após o pai. Mesmo conteúdo final; mais cliques e risco operacional de “Update branch” errado.

### Proibido

- Cherry-pick duplicado; reaplicar migration; recriar commits; force-push destrutivo.
- Resolver conflito descartando regra financeira/fiscal.
- Mergear automaticamente sem autorização humana.
- Mergear um PR intermediário **depois** do tip já em `main`.

## Migrations da cadeia (ordem)

| Version | Tema |
|---------|------|
| `20261007161220` | Fiscal cancelado SSoT |
| `20261007163000`…`63200` | SSOT-001…004 |
| `20261007170000` / `171000` | Provas / guard cancel |
| `20261007180000` | `calcular_valor_sistema_por_forma_caixa` |
| `20261007190000` | Snapshot `caixas_fechamento_formas` |

Rehearsal local (banco limpo + stubs storage/auth): **PASS** até `190000`.

## Decisão

`STACK_READY_TO_MERGE` — conteúdo linear, tip único, sem conflitos com `main`, regressões locais verdes. **Não mergeado por este agente.**
