# Sprint P0 — roteiro de execução (1º cliente)

| Campo | Valor |
|--------|--------|
| **Status** | Em execução (Engine Loop Go-Live) |
| **Gate** | APROVADO COM RESSALVAS (2026-07-19) |
| **DI** | Core v1.0 / Wave A congelados — sem Wave B |
| **Branch ciclo 1** | `loop/1-p0-dados-homologacao` |

## Ordem

1. Gate de Produto — **fechado** (Fiscal=Stub, AP=só NF-e)
2. **P0-DADOS** — `/admin/implantacao` → Validar dados
3. **P0-SSOT** — `npm run check:entity-ssot` exit 0
4. **P0-VEN-PROOF** — venda DINHEIRO + PIX → estoque → financeiro → auditoria
5. **P0-VEN-REV** — cancelamento + devolução revertem saldos
6. **P0-FIX** — só bugs que quebrem as provas
7. **P0-HOM** — homologação integrada + autorizar GO-LIVE

## Comandos de validação técnica

```bash
cd pdv-importados
npm run check:golive
```

(`check:entity-ssot` + matrizes P0-DADOS / venda / roteiro operacional Onda 2)

## Matriz GO / NO-GO (módulos críticos)

SSoT atualizado: [GO_LIVE_READINESS.md](./GO_LIVE_READINESS.md).

| Módulo | Técnico | Homologação humana | Declaração |
|--------|---------|--------------------|------------|
| Cadastro | **GO** | pendente | **NO-GO** até P0-HOM |
| Venda | **GO** | pendente P0-VEN-PROOF | **NO-GO** até P0-HOM |
| Estoque | **GO** | pendente | **NO-GO** até P0-HOM |
| Financeiro | **GO** | pendente | **NO-GO** até P0-HOM |
| Fiscal Stub | **GO** | pendente | **NO-GO** até P0-HOM |

**Critério de GO por módulo:** técnico GO **e** cenário humano do roteiro aprovado (P0-HOM).

## Engine Loop — Ciclo 1 (2026-07-19)

| Campo | Valor |
|--------|--------|
| **Missão** | Fechar gate P0-DADOS + P0-SSOT (sem feature nova) |
| **Cenário** | Avaliador de dados mínimos + item `homologacao.dados` + matriz canônica venda/cancel/devolução |
| **Resultado técnico** | **PASS** (15 testes + `check:entity-ssot` OK) |
| **Bugs P0** | nenhum |
| **Correções** | entrega do gate P0-DADOS (coleta + avaliação + UI Validar dados) |
| **Evidências** | vitest P0; `check:entity-ssot`; commit nesta branch |
| **CI GitHub Actions** | **bloqueado (human gate)** — jobs falham em ~3s com 0 steps / runner vazio (billing/spending limit) |
| **Vercel preview** | **READY** — `pdv-importados-git-loop-1-p0-dados-homologacao-jinlong.vercel.app` |
| **PR** | https://github.com/nocodenn-cell/fastproduct/pull/220 |
| **Próximo ciclo** | P0-VEN-PROOF em loja homologada (abrir caixa → venda DINHEIRO/PIX → estoque → financeiro → auditoria) — só após desbloquear Actions ou merge com aceite explícito do gate CI |

## Engine Loop — Ciclo fechamento Onda 1 (2026-07-19)

| Campo | Valor |
|--------|--------|
| **Missão** | Fechar P0s de código: roteiro Onda 2 automatizado + readiness |
| **Resultado** | **PASS** técnico — sem tela/RPC crítica ausente |
| **P0 restantes** | Homologação humana + CI billing (ver GO_LIVE_READINESS) |
| **Evidência** | `npm run check:golive` |

## Inventário Financeiro / Fiscal

Ver [GO_LIVE_FINANCEIRO_FISCAL.md](./GO_LIVE_FINANCEIRO_FISCAL.md) — telas canônicas EXISTS; ajustes no PR #220 (AP→NF-e, aviso Stub).

## Declaração GO dos módulos

Somente após **P0-HOM** bem-sucedido: Venda, Estoque, Financeiro e Cadastro = GO.

Decision Intelligence permanece fora deste PR (branch `feat/first-customer-go-live`); homologar cockpit somente leitura após deploy que a contenha.
