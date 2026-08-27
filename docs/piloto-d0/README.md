# Piloto D0 — fonte canônica

Esta pasta registra a definição funcional, divergências, backlog e provas do
piloto D0.

## Baseline de go-live (2026-08-27)

| Campo | Valor |
|---|---|
| **SHA** | `e1327e62312d53bb005e0614801b8725b485b2ee` |
| **Decisão** | **GO** |
| **Produção** | Mesmo SHA da `main` |
| **Certificação** | [CERTIFICACAO_GO_LIVE_E1327E62.md](./CERTIFICACAO_GO_LIVE_E1327E62.md) |
| **Próxima sprint (proposta)** | [PROXIMA_SPRINT.md](./PROXIMA_SPRINT.md) |

`origin/main` é a fonte oficial da release do piloto. Não tratar candidatas
históricas (`codex/piloto-d0-main-clean`, SHA `ede1f459`) como linha de release.

## Estado

- **GO autorizado** para o piloto web na linha `e1327e62`.
- SSRA verde; E2E crítico PASS; testes promovidos: shared-core 8, pdv-importados 33.
- Playwright completo: residual vermelho classificado como flake/infra — **não**
  é regressão D0 comprovada e **não** autoriza patch de produto.
- Homologação na **máquina da cliente**, restore de backup e matriz negativa
  remota: **ainda pendentes** (não reabrem o GO de código; são a próxima sprint).
- Feature freeze de **features novas** (Fiscal real, WhatsApp, orçamentos)
  permanece: [FEATURE_FREEZE_PILOTO.md](../FEATURE_FREEZE_PILOTO.md).

O runbook financeiro histórico continua omitido desta pasta por conter
procedimentos de rollback vinculados a um estado antigo do schema. Ver
`docs/go-live/` para o plano do *primeiro cliente pagante* (evento distinto).

## Ordem de leitura

1. [CERTIFICACAO_GO_LIVE_E1327E62.md](./CERTIFICACAO_GO_LIVE_E1327E62.md) — **começar aqui**
2. [DEFINICAO_FUNCIONAL_D0.md](./DEFINICAO_FUNCIONAL_D0.md)
3. [DIVERGENCIAS_E_DECISOES.md](./DIVERGENCIAS_E_DECISOES.md)
4. [MATRIZ_RASTREABILIDADE_D0.md](./MATRIZ_RASTREABILIDADE_D0.md)
5. [BACKLOG_VALIDADO_D0.md](./BACKLOG_VALIDADO_D0.md)
6. [PLANO_DE_PROVAS_D0.md](./PLANO_DE_PROVAS_D0.md)
7. [PREFLIGHT_ROLLOUT_PRICING_D0.md](./PREFLIGHT_ROLLOUT_PRICING_D0.md)
8. [PROXIMA_SPRINT.md](./PROXIMA_SPRINT.md)
9. [SPRINT_ESTABILIZACAO_P0.md](./SPRINT_ESTABILIZACAO_P0.md) — execução P0 (oficial)
10. [P0-2_BACKUP_EVIDENCIA.md](./P0-2_BACKUP_EVIDENCIA.md) — **FAIL** (backup não comprovável)
11. [P0-3_HUMAN_GATE.md](./P0-3_HUMAN_GATE.md) — restore **não autorizado**
12. [CHANGELOG_AUDITORIA.md](./CHANGELOG_AUDITORIA.md)
13. [HANDOFF_CANDIDATA_MAIN.md](./HANDOFF_CANDIDATA_MAIN.md) — **superseded** (histórico `ede1f459`)

## Vocabulário de estado

- **Corrigido:** código ou migration aditiva na `main`.
- **Validado localmente:** prova reproduzida no ambiente local e registrada.
- **Homologado:** prova executada no ambiente de homologação autorizado.
- **Aplicado remotamente:** migration ou deploy efetivamente executado no alvo.
- **GO:** release `e1327e62` alinhada à produção; não implica todas as PV-* na loja.

Um estado não implica o seguinte. Em particular, validação local não equivale
a homologação na máquina da cliente nem a restore ensaiado.
