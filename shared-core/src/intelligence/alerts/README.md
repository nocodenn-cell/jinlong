# Alert Engine (Cycle 5)

`Recommendation + Urgency + Context → Alert` — atenção priorizada, **sem** Action.

| Faz | Não faz |
|-----|---------|
| Priorizar atenção a partir de Recommendations | Criar / mutar Recommendations |
| Propagar `operationalConfidence` (weakest link) | Inflar confidence via urgency |
| Exigir evidence + severity justification | Executar mutações operacionais |

Contrato: `../contracts/alert.ts` (`DecisionAlert` = `Alert`).
