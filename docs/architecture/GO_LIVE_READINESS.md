# Go-Live Readiness — fechamento ERP (1º cliente)

> **SUPERSEDED como status atual (2026-08-27).** Este arquivo é o War Room de **19/07** (PR #220, SHA de outra era). O baseline do piloto é `e1327e62` — [piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](../piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md). Preservado como histórico. A matriz GO/NO-GO abaixo **não** descreve produção hoje.

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-19 |
| **Modo** | **War Room** — só bugs P0 da homologação (sem features) |
| **Aceite mensurável** | [GO_LIVE_ACEITE.md](./GO_LIVE_ACEITE.md) |
| **Backlog pós-War Room** | [GO_LIVE_BACKLOG_PRIORIDADES.md](./GO_LIVE_BACKLOG_PRIORIDADES.md) |
| **PR** | [#220](https://github.com/nocodenn-cell/fastproduct/pull/220) |
| **Branch** | `loop/1-p0-dados-homologacao` |
| **DI** | Congelada — não bloqueia ERP operacional deste PR |

## Matriz GO / NO-GO

| Módulo | Técnico | Homologação humana | Declaração |
|--------|---------|--------------------|------------|
| Cadastro | **GO** (telas + SSoT + P0-DADOS) | pendente loja real | **NO-GO** até P0-HOM |
| Venda / Caixa | **GO** (RPC finalize/cancel + desconto + sangria/suprimento) | pendente P0-VEN-PROOF | **NO-GO** até P0-HOM |
| Estoque | **GO** (admin estoque + NF-e + SSoT) | pendente prova pós-venda | **NO-GO** até P0-HOM |
| Financeiro | **GO** (AR liquidar + AP pagar/cancel + NF-e only) | pendente amostra real | **NO-GO** até P0-HOM |
| Fiscal Stub | **GO** (enqueue Stub + fila + aviso UI) | pendente smoke pós-venda | **NO-GO** até P0-HOM |
| Auditoria | **GO** (`/admin/auditoria`) | pendente eventos na prova | **NO-GO** até P0-HOM |
| Implantação | **GO** (checklist + evidência + timeline + execuções 1/2) | pendente autorizar GO | **NO-GO** até P0-HOM |
| Decision Intelligence | **GO** (branch própria, read-only) | fora deste PR | **N/A ERP** |
| Migrations / RLS / Guards | **GO** (legado main + `check:entity-ssot`) | — | **GO técnico** |
| CI GitHub Actions | **NO-GO infra** | spending limit | **human gate** |

**Critério de GO final:** técnico GO **e** War Room encerrado per [GO_LIVE_ACEITE.md](./GO_LIVE_ACEITE.md) — obrigatórios PASS com evidência, zero P0 abertos, roteiro **2× consecutivas** sem intervenção.

## Pendências P0 restantes

| ID | Item | Tipo | Dono |
|----|------|------|------|
| P0-HOM-UI | Executar ACEITE (2×) com evidência na UI `/admin/implantacao` | Humano | Ops / cliente |
| P0-CI | Reexecutar Actions após billing | Infra | Dono conta GitHub |

**Código / telas críticas:** sem P0 técnico aberto após fechamento P1 Implantação (evidência + timeline + execuções).

## Evidências técnicas (locais)

```bash
cd pdv-importados
npm run check:entity-ssot
npx vitest run \
  app/admin/implantacao/homologacaoDados.test.ts \
  app/admin/implantacao/implantacaoCatalog.test.ts \
  tests/p0-venda-homologacao.matrix.test.ts \
  tests/p0-roteiro-operacional.matrix.test.ts
```

## Estimativa objetiva para Go-Live

| Fase | Estimativa | Dependência |
|------|------------|-------------|
| Merge PR #220 (aceite gate CI) | 0,5 dia | Aceite humano do billing OU Actions verde |
| Homologação Onda 2 (loja dedicada) | **1–2 dias úteis** | Credenciais + dados P0-DADOS OK |
| Estabilização (só bugs da prova) | 0–1 dia | Achados da homologação |
| Autorizar GO na UI | mesmo dia do P0-HOM | Checklist completo |

**Janela típica até primeiro cliente operacional:** **2–4 dias úteis** após merge, limitada pela homologação humana (não por gaps de tela).
