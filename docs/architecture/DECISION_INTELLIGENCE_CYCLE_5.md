# Missão — Decision Intelligence Cycle 5: Alert Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (core puro) |
| **Data** | 2026-07-19 |
| **Checkpoint anterior** | tag `di-cycle-4` (`cecac058`) |
| **Código previsto** | `shared-core/src/intelligence/alerts/` |
| **Fluxo** | Recommendation + Urgency + Context → Alert priorizado — **sem** executar ações |

---

## Objetivo

Transformar recomendações em **alertas priorizados** sem executar ações.

```
Recommendation  ("existe oportunidade de revisão")
      +
Urgency rules
      +
Time / context
      ↓
Alert  ("merece atenção agora")
```

## Regra principal

**Recommendation ≠ Alert**

- Recommendation = opção de revisão explicável  
- Alert = atenção priorizada no tempo — **não** cópia da Recommendation  

Um Alert **precisa** de:

| Ingrediente | Papel |
|-------------|--------|
| Recommendation | Origem (`sourceRecommendationIds`) |
| Urgency | Prioridade temporal / score |
| Context | Janela, tendência, escopo |
| Confidence | Propagada — **nunca** inflada pela urgência |

### Exemplo

```
Recommendation: REVIEW_MARGIN_DRIVERS

Alert:
  titleCode → margem caiu X% nos últimos 30 dias
  severity: WARNING | CRITICAL
  urgency.score / urgency.reason
```

## Contrato inicial sugerido

Alinha-se ao espírito ADR-011; implementação pode estender `Alert` existente ou introduzir alias `DecisionAlert`:

```ts
type DecisionAlert = {
  id: string

  severity: 'INFO' | 'WARNING' | 'CRITICAL'

  sourceRecommendationIds: string[]

  titleCode: string

  evidence: Evidence[]

  operationalConfidence: OperationalConfidence

  urgency: {
    score: number
    reason: string
  }

  createdAt?: string
}
```

Notas de implementação (quando codar):

- `sourceRecommendationIds` **não vazio** (sempre aponta para Recommendation).
- `operationalConfidence` ≤ min das Recommendations de origem (weakest link).
- `urgency` e `confidence` são **dimensões ortogonais**.
- Persistidos no `DecisionSnapshot.alerts` com `detectorId` / `detectorVersion` (rastreio).

## Estrutura de pastas (mesmo padrão C3/C4)

```
alerts/
  ├── alert-engine.ts
  ├── registry.ts
  ├── rules/
  ├── types.ts
  └── (determinism / guards)
```

## Guards do Cycle 5

| Gate | Norma |
|------|--------|
| Alert **não** cria Recommendation | **GO** |
| Alert **não** executa Action | **GO** |
| Alert **sempre** aponta para Recommendation (`sourceRecommendationIds`) | **GO** |
| Severity precisa de **justificativa** (evidence / urgency.reason) | **GO** |
| **Urgency não pode aumentar confidence** | **GO** |
| Sem banco / Supabase / UI `/admin` DI | **GO** |

### Anti-padrão (confidence)

```
Dados ruins → confidence 0.4
     ↓
CRITICAL alert → confidence 0.9   ← NO-GO
```

Urgência alta + dados fracos = alerta crítico **com confiança baixa** (explícito), nunca “melhorado” pela severidade.

## Anti–piloto automático

Alert **não** dispara mutação operacional, purchase order, reprice, etc.  
Action Plan = Cycle 6 (humano / entity-ssot).

## Dívida arquitetural conhecida (não é bug) — mantida no v1.0 (W8)

**Urgency C5 deriva do tier da Recommendation (`P0`–`P3`), não de delta temporal real.**

Aceitável no core v1.0 (pipeline + guards + confidence ortogonal).  
**Não** implementar tendência temporal neste hardening — senão mistura escopo.  
**Não** deve virar dependência permanente — senão Alert vira só uma “cópia colorida” da Recommendation.

### Alvo futuro (pós–C5 / quando Facts de tendência existirem)

```
Urgency =
  Impacto
  + Tempo
  + Persistência
  + Contexto operacional
```

e **não** apenas `Recommendation.urgency`.

Rastreio: `alerts/urgency.ts` · este doc. Evoluir sem quebrar `sourceRecommendationIds` nem a regra urgency ↛ inflar confidence.

## Fora de escopo nesta missão

- `/admin` UI agregadora  
- Action Plan engine  
- Persistência SQL de alertas  
- Integração push/notificação  
- Urgency rica (impacto + tempo + persistência) — ver dívida acima  

## Ordem

1. ✅ Push + tag `di-cycle-4`  
2. ✅ Este documento + Alert Engine  
3. Checkpoint `di-cycle-5`  
4. Cycle 6 Action Plan (mission doc → engine)  

UI `/admin` DI só depois de Analysis + Recommendation + Alert estáveis.
