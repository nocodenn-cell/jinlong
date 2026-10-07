# Estratégia de integração — stack #473…#478 (+ PR B)

> **Supersedido para decisão de merge:** usar [STACK_INTEGRACAO_473_479.md](./STACK_INTEGRACAO_473_479.md) (tip `#479`, estratégia 2 recomendada, rehearsal + gates).

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Objetivo** | Parar a cadeia infinita; base inequívoca para PR B; merge humano |

## Conteúdo por PR

| PR | Tipo | Necessário em `main`? | Notas |
|----|------|----------------------|--------|
| **#473** | Docs + governance | Sim (via tip) | Mapa/checklist/rule |
| **#474** | Docs auditoria | Sim (via tip) | Histórico NO-GO |
| **#475** | Código fiscal + mig | **Sim** | Cancelado Focus, stub, entity-ssot |
| **#476** | Código SSOT-001…004 | **Sim** | Migrations + contratos |
| **#477** | Docs decisão | Sim (via tip) | Pós-gate / próxima fase |
| **#478** | Código PR A | **Sim** | RPC por forma |
| **PR B** | Código UX + snapshot | **Sim** (este) | Base = tip #478 |

O tip de **#478** (`a412496a`) **já contém linearmente** todos os commits #473…#478. Não há conteúdo “só em #473” faltando no tip.

## Estratégia segura (sem merge cego)

1. **Não** abrir novos PRs empilhados após o PR B, salvo hotfix do próprio fechamento.
2. **PR B** parte do tip `#478` (base inequívoca com contratos + RPC).
3. Revisão humana da stack: preferir merge **bottom-up** `#473→…→#478→PR B` **ou** merge do **tip final** em `main` e fechar os pais como supersedidos **sem** re-aplicar os mesmos commits.
4. **Proibido:** cherry-pick duplicado; mergear #473 depois do tip; force-push destrutivo da stack.
5. Migrations no remoto Jinlong: janela/autorização humana separada.
6. Este agente **não** mergeia automaticamente.

## Risco de duplicata

Baixo se só o tip (ou a ordem linear) for mergeado. Alto se PRs intermediários forem mergeados **depois** do tip já integrado.
