# Sprint — Foundation Hardening (pré–Cycle 1)

| Campo | Valor |
|--------|--------|
| **Status** | **Concluído** (types locais regenerados + contratos de Quality Level) |
| **Data** | 2026-07-19 |
| **Objetivo único** | Regenerar `database.types.ts`, verificar aderência, mapear divergências, validar ports Cycle 0 |
| **Pré-requisito** | [Cycle 0](./DECISION_INTELLIGENCE_CYCLE_0.md) · [DECISION_FACT_CATALOG](./DECISION_FACT_CATALOG.md) · [ADR-011](../adr/ADR-011-decision-intelligence.md) |
| **Desbloqueia** | Cycle 1 — Fact Providers (com Quality Level obrigatório) |

---

## 1. Análise da sprint (melhorias aplicadas)

| Ideia original | Melhoria |
|----------------|----------|
| Só regenerar types | + relatório local vs remoto + checklist DI |
| Abrir Cycle 1 depois | Gate `GATE_DATABASE_TYPES_STALE` → **SATISFIED** só após regen local |
| Quality Level na prosa | Contrato tipado `FactProviderSupportLevel` + `FactProviderDescriptor` + `evaluateProviderForRecommendation` |
| Providers sem status | `FactProviderPort.descriptor` **obrigatório** |
| Governança informal | Regras explícitas neste doc + README intelligence |

---

## 2. O que foi feito

### 2.1 Regeneração de `database.types.ts`

| Item | Valor |
|------|-------|
| **Fonte** | Schema **local** (`npx supabase gen types typescript --local` em `backend/`) |
| **Destino** | `pdv-importados/lib/supabase/database.types.ts` |
| **Motivo da fonte local** | Migrations do monorepo = SSoT de desenvolvimento DI; stack local estava UP |

### 2.2 Aderência às migrations (antes → depois)

| Artefato DI-crítico | Types antigos | Types regenerados (local) |
|---------------------|---------------|---------------------------|
| `venda_eventos` | ausente | **presente** |
| `vendas_em_espera` | ausente | **presente** |
| `estoque_reposicoes_devolucao` | ausente | **presente** |
| `v_clientes_gerente` | ausente | **presente** |
| `venda_finance_context` | presente | presente |
| `descontos_venda.operador_id` / `aplicado_em` | incompleto | **presente** |
| `clientes.tipo` / `endereco` | incompleto | **presente** (local) |

Tamanho aproximado: ~104 KB → ~136 KB.

### 2.3 Divergências local (migrations) × remoto (jinlong / `kbabmewnahysfvlybiak`)

Geração remota via MCP (`generate_typescript_types`) para comparação — **não** substituímos o arquivo da app pelo remoto.

| Artefato | Local (migrations) | Remoto produção |
|----------|--------------------|-----------------|
| `venda_eventos` | sim | sim |
| `vendas_em_espera` | sim | sim |
| `estoque_reposicoes_devolucao` | sim | sim |
| `v_clientes_gerente` | sim | sim |
| `venda_finance_context` | **sim** | **não** (drift) |
| `descontos_venda.aplicado_em` | sim | não detectado no dump remoto |

**Implicação:** Cycle 1 pode tipar contra **local**. Adapters apontados a **produção** devem tratar `venda_finance_context` como potencialmente ausente até `db push` / alinhamento — isso reforça `GATE_CUSTOMER_SALE_LINK` (não contornar).

### 2.4 Validação ports Cycle 0

| Port / contrato | Status |
|-----------------|--------|
| `FactProviderPort` | OK — acrescido `descriptor: FactProviderDescriptor` |
| `FactEnvelope` / Fact Registry | OK — ids do catálogo intactos |
| Recommendation / Alert / ActionPlan / Memory | OK — sem mudança de campos ADR-011 |
| Gates qualidade (3) | continuam **OPEN** |
| `GATE_DATABASE_TYPES_STALE` | **SATISFIED** |
| `isFactProviderIoAllowed()` | **true** |

Testes: `shared-core` → `intelligence.spec.ts` (inclui Quality Level).

---

## 3. Quality Level (convenção Cycle 1 — já tipada)

```
FactProvider
     ↓
descriptor.supportLevel
     ↓
SUPPORTED | PARTIAL | UNSUPPORTED | DEPRECATED
```

### Exemplos obrigatórios

| Provider | Status | Dependencies | Gate |
|----------|--------|--------------|------|
| `StockPositionFact` | **SUPPORTED** | inventory | — |
| `CustomerPurchaseFact` | **UNSUPPORTED** | sales, customers | `GATE_CUSTOMER_SALE_LINK` |
| `MarginFact` | **PARTIAL** | sales | `GATE_MARGIN_COST_RELIABLE` |
| `StockCapitalFact` | **PARTIAL** / **UNSUPPORTED** até política de custo | inventory, products | `GATE_STOCK_CAPITAL_KARDEX_COST` |
| `CashMovementFact` | **UNSUPPORTED** para KPI empresarial (CONTEXT) | cash | — (contexto de turno) |

### Regra do Recommendation Engine (Cycle 4)

Antes de emitir qualquer `Recommendation`:

1. Resolver `descriptor` de cada Fact usado.  
2. Chamar `evaluateProviderForRecommendation`.  
3. Se `UNSUPPORTED` / `DEPRECATED` → **não emitir**; expor `messageCode`  
   (ex.: *"Não foi possível calcular risco de churn porque CustomerPurchaseFact está UNSUPPORTED."*).  
4. Se `PARTIAL` → emitir só com `confidence ≤ MEDIUM` + `limitations[]`.

Código: `shared-core/src/intelligence/contracts/provider-support.ts`.

---

## 4. Governança (a partir de agora)

### G1 — Catálogo primeiro

> **Nenhum novo Fact** pode ser criado sem registro prévio em [`DECISION_FACT_CATALOG.md`](./DECISION_FACT_CATALOG.md) (fonte, colunas, owner, KPIs, readiness).

### G2 — Qualidade classificada

> **Nenhuma Recommendation** pode consumir um Fact que não esteja:
> 1. no catálogo, e  
> 2. classificado no provider como `SUPPORTED` | `PARTIAL` | `UNSUPPORTED` | `DEPRECATED`.

### G3 — Sem contorno de gate

> Proibido inventar fonte/fórmula temporária para “desbloquear” `PARTIAL`/`UNSUPPORTED`.

### G4 — Types

> Após migrations que toquem Facts DI: regenerar `database.types.ts` (preferência: `--local` com migrations aplicadas) e revalidar este hardening checklist.

---

## 5. Sequência disciplinada (estado)

| Etapa | Status |
|-------|--------|
| ADRs (incl. ADR-011) | ✅ |
| Catálogo semântico | ✅ |
| Cycle 0 foundation | ✅ |
| **Foundation Hardening (types)** | ✅ |
| Cycle 1 Fact Providers | ⏳ [duas ondas + confidence](./DECISION_INTELLIGENCE_CYCLE_1.md) — I/O tipado liberado |
| KPI → Analysis → Recommendation → … | ⏳ |

---

## 6. Checklist Cycle 1 (ao abrir)

- [ ] Todo provider implementa `FactProviderPort` com `descriptor`  
- [ ] `supportLevel` coerente com registry + gates abertos  
- [ ] Nenhum Fact novo fora do catálogo  
- [ ] Não emitir churn/LTV enquanto `CustomerPurchaseFact` = UNSUPPORTED  
- [ ] Não emitir margem HIGH enquanto `MarginFact` = PARTIAL + gate OPEN  
- [ ] Adapters produção: checar drift `venda_finance_context`  
- [ ] Sem SQL / regras dentro de `shared-core/intelligence` além de contratos

---

## 7. GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Aceitar types regenerados do **local** como base DI | **GO** |
| Marcar `GATE_DATABASE_TYPES_STALE` SATISFIED | **GO** |
| Abrir Cycle 1 Fact Providers | **GO** (com Quality Level) |
| Contornar gates de qualidade | **NO-GO** |
| Assumir remoto = local sem checagem | **NO-GO** (`venda_finance_context` drift) |
| Começar dashboard/IA antes dos providers | **NO-GO** |

---

## 8. Comando de regeneração (runbook)

```powershell
cd C:\fastproduct\backend
npx supabase start   # se necessário
npx supabase gen types typescript --local -o ..\pdv-importados\lib\supabase\database.types.ts
```

(Alternativa se `-o` falhar: redirecionar stdout para o arquivo com encoding UTF-8 sem BOM.)

Comparar remoto (opcional): MCP `generate_typescript_types` project `kbabmewnahysfvlybiak` ou `supabase gen types typescript --project-id <ref>`.
