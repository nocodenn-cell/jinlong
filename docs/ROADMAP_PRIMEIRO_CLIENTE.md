# Roadmap — Primeiro Cliente Pagante (revisado)

Roadmap operacional após auditoria crítica. Detalhe de fases em `FEATURE_FREEZE_PILOTO.md` e execução em `CHECKLIST_EXECUCAO_GO_LIVE.md`.

## Fase 0 — Congelamento do Produto

- **Objetivo:** Escopo IN/OUT assinado.
- **Saída:** `FEATURE_FREEZE_PILOTO.md` acordado com comercial.
- **Esforço:** 0,5–1 dia | **P0**

## Fase 1 — Correções críticas obrigatórias

- **Objetivo:** Dinheiro e schema do ambiente do piloto confiáveis.
- **Saída:** `verify_p0_producao.sql` OK; financial gate 5/5 PASS; smoke caixa §4b; flags `USE_UNIFIED_SALES_FLOW=true`.
- **Esforço:** 3–6 dias | **P0**

## Fase 2 — Operação comercial mínima

- **Objetivo:** Loja opera o dia; time implanta sem herói.
- **Saída:** Onboarding pack; catálogo (cadastro + CSV); ajuste estoque; contas pagar acessível; runbook cliente.
- **Implementado no repo:** import/export CSV admin, salvar e continuar, página contas a pagar.
- **Esforço:** 3–5 dias | **P0 comercial**

## Fase 3 — Homologação

- **Objetivo:** GO/NO-GO com evidências.
- **Saída:** `CHECKLIST_EXECUCAO_GO_LIVE.md` + `DONE_DEFINITION_PILOTO.md` marcados.
- **Esforço:** 2–4 dias | **P0**

## Fase 4 — Primeiro cliente

- **Objetivo:** Produção + cobrança + war room 48–72h.
- **Saída:** Vendas reais sem incidente P0.
- **Esforço:** 1–2 dias corte + acompanhamento | **P0**

## Fase 5 — Evolução pós-go-live

- Hold, kardex UI completo, Focus real, inventário — **um epic por sprint**, gate financeiro regressivo.
- **Esforço:** contínuo | **P1/P2**

## Caminho crítico

```
Fase 0 → verify + gate → smoke caixa → onboarding → homologação → corte → (Fase 5)
```

Não bloqueia: kardex unificado UI, hold, redesign, squash migrations.
