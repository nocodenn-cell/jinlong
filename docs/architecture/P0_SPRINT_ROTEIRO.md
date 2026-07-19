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
npm run check:entity-ssot
npx vitest run app/admin/implantacao/homologacaoDados.test.ts app/admin/implantacao/implantacaoCatalog.test.ts tests/p0-venda-homologacao.matrix.test.ts
```

## Matriz GO / NO-GO (módulos críticos)

| Módulo | Técnico (paths/guards) | Homologação humana (UI) | Declaração |
|--------|------------------------|-------------------------|------------|
| Cadastro | PASS (P0-DADOS + SSoT) | pendente loja real | **NO-GO** |
| Venda | PASS (matriz caminhos) | pendente P0-VEN-PROOF | **NO-GO** |
| Estoque | PASS (guard SSoT) | pendente prova pós-venda | **NO-GO** |
| Financeiro | PASS (caminhos + readers) | pendente AR/AP na prova | **NO-GO** |

**Critério de GO por módulo:** técnico PASS **e** cenário humano do roteiro aprovado (P0-HOM).

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

## Declaração GO dos módulos

Somente após **P0-HOM** bem-sucedido: Venda, Estoque, Financeiro e Cadastro = GO.
