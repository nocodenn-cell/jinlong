# Missão — Decision Intelligence Cycle 6: Action Plan Engine

| Campo | Valor |
|--------|--------|
| **Status** | **Especificado** (doc; implementação ainda não iniciada) |
| **Data** | 2026-07-19 |
| **Checkpoint anterior** | tag `di-cycle-5` |
| **Código previsto** | `shared-core/src/intelligence/` (action-plan / organizers) |
| **Fluxo** | Alerts + Recommendations (+ Findings) → Action Plan **agregado** — **sem** executar operações |

---

## Princípio (topo)

**Action Plan organiza trabalho; não toma decisões nem executa operações.**

```
Recommendation  ("oportunidade de revisão")
      ↓
Alert           ("merece atenção agora")
      ↓
Action Plan     ("trabalho sugerido, agregado por objetivo")
```

A execução continua pertencendo ao **usuário** ou a outro **subsistema autorizado** (entity-ssot / rotas oficiais).  
Decision Intelligence **não** escreve preços, estoque, pedidos ou financeiro.

## Agregação por objetivo (anti–explosão combinatória)

**Action Plans devem ser agregados por objetivo, não por alerta individual.**

Cada Alert gerando N tarefas → explosão (10 Alerts → 50 planos) → degrada utilidade.

### Errado (1 Alert → 1 plano / 1 tarefa solta)

```
Alert A → Revisar margem produto X
Alert B → Revisar margem produto Y
Alert C → Revisar margem produto Z
```

### Correto (um plano por objetivo)

```
Objetivo: Revisar margens dos produtos críticos
  Itens:
  • Produto X
  • Produto Y
  • Produto Z
```

O plano **organiza** trabalho; não multiplica tarefas paralelas sem necessidade.

Chave de agregação sugerida (implementação): `objectiveCode` estável  
(ex.: `REVIEW_CRITICAL_MARGINS`) — vários Alerts/Recommendations com o mesmo objetivo → **um** `ActionPlan`.

## Rastreabilidade completa (obrigatória)

Cada Action Plan **deve** referenciar a cadeia inteira (sem perda de contexto):

```ts
sourceAlertIds: string[]
sourceRecommendationIds: string[]
sourceFindingIds: string[]
```

```
Fact → KPI → Finding → Recommendation → Alert → Action Plan
```

Itens do plano podem apontar entidades (produto, etc.); o **plano** preserva os IDs de origem agregados.

## O que o plano é / não é

### É (organizador)

```
Plano (objetivo: REVIEW_CRITICAL_MARGINS):
1. Revisar produtos de menor margem.   ← itens = X, Y, Z
2. Validar custos de compra.
3. Conferir promoções ativas.
```

### Não é (piloto automático)

```
Atualizar preços.
Criar pedido de compra.
Liquidar estoque.
```

Códigos de item / passo devem ser **tarefas de revisão / validação / conferência**, alinhadas a deep-links entity-ssot — nunca mutações embutidas no core.

## Entradas e saídas

| Entrada | Uso |
|---------|-----|
| Alerts (priorizados) | Escopo, urgência, agrupamento por objetivo |
| Recommendations | Opções / causes / `sourceFindingIds` |
| Findings (via Rec) | Completar `sourceFindingIds[]` |
| Confidence | Propagada (min / weakest link — não inflada pelo plano) |

| Saída | Contrato |
|-------|----------|
| `ActionPlan` | `objectiveCode`, itens agregados, `sourceAlertIds` / `sourceRecommendationIds` / `sourceFindingIds` |
| Snapshot | Campo no `DecisionSnapshot` (definir na implementação) |

Contratos base em `contracts/action-plan.ts` (Cycle 0) — **evoluir** no Cycle 6 para incluir agregação + rastreio completo, sem quebrar o espírito ADR-011.

## Guards do Cycle 6

| Gate | Norma |
|------|--------|
| Action Plan **não** executa operações | **GO** |
| Action Plan **não** toma decisão comercial final | **GO** |
| Itens apontam para revisão / validação — não `update_price` | **GO** |
| **Agregação por objetivo** (não 1:1 Alert→Plan) | **GO** |
| `sourceAlertIds[]` + `sourceRecommendationIds[]` + `sourceFindingIds[]` não vazios quando houver origem | **GO** |
| Confidence não sobe no caminho | **GO** |
| Sem banco / UI `/admin` DI nesta missão (salvo se missão explicitar read-model) | **GO** |

## Separação mantida

| Camada | Faz |
|--------|-----|
| Analysis | Identifica problema |
| Recommendation | Sugere opção de revisão |
| Alert | Prioriza atenção |
| **Action Plan** | **Organiza trabalho agregado por objetivo** |
| Humano / ops | Decide e executa nas telas SSoT |

## Fora de escopo (até decisão explícita)

- UI `/admin` agregadora DI  
- Persistência SQL do plano  
- Webhooks / automação que muta domínio operacional  
- “Fechar” itens automaticamente após sync  
- Memory (Cycle 7) / Executive (Cycle 8)

## Ordem

1. ✅ Cycle 5 Alert + tag `di-cycle-5`  
2. ✅ Este documento (especificação; commit docs-only)  
3. Implementar Action Plan Engine puro + testes (agregação + rastreio)  
4. Wire no Engine Loop  
5. Read model / API → UI `/admin` DI (só com Analysis + Rec + Alert + Plan estáveis)  
