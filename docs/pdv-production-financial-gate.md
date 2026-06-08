# Protocolo de validação financeira — Gate de produção PDV

**Versão:** 1.0 (baseline ledger `fdaf75e`…`6395a27`)  
**Referência:** [`pdv-silent-revenue-failure-map.md`](./pdv-silent-revenue-failure-map.md)  
**Natureza:** gate determinístico de risco financeiro — não substitui testes funcionais gerais.

---

## 1. Definição do gate

### Pergunta que este gate responde

> **“Esse PDV pode ir para produção com risco financeiro controlado?”**

### Regra binária (sem exceções)

O sistema **só pode ir para produção** se **TODOS** os 5 testes críticos abaixo resultarem em **PASS**.

| Resultado | Significado |
|-----------|-------------|
| **PASS** | Critério atendido com **0 divergência** (tolerância numérica: ±R$ 0,00; contagem: ±0). |
| **FAIL** | Qualquer divergência, erro silencioso, duplicata ou inconsistência detectada. |
| **NO-GO** | Um ou mais testes em FAIL → **bloqueio de produção**. |
| **GO** | Os 5 testes em PASS → liberação condicionada ao checklist de pré-requisitos. |

**Não há** “warning aceitável”, “falso positivo tolerado” ou “passa com ressalva” neste gate.

### Escopo do gate

| Incluído | Excluído |
|----------|----------|
| Web caixa (`pdv-importados`) | Refatoração ou correção de bugs |
| Ledger `venda_eventos` + RPCs 228–231 | Novos serviços ou layers |
| Gerente `/gerente/vendas` (ledger) | Testes de UX não financeiros |
| Stress tools `dev-tools/` | pdv-local outbox (gate separado se híbrido) |

### Pré-requisitos bloqueantes (antes dos 5 testes)

Se qualquer item falhar, o gate é **NO-GO** sem executar os testes.

| # | Verificação | Como validar |
|---|-------------|--------------|
| P1 | Migrations **228, 229, 230, 231** aplicadas no Supabase alvo | `backend/scripts/p0-migration-status.mjs` ou SQL `SELECT version FROM supabase_migrations.schema_migrations` |
| P2 | Tabela `venda_eventos` existe e RPC `kpis_venda_eventos_gerente` responde | SQL de sanidade (Apêndice A.0) |
| P3 | `USE_UNIFIED_SALES_FLOW=true` no ambiente web | `pdv-importados` env / Vercel |
| P4 | `pdv-importados/.env.local` com credenciais de staging alvo | `npm run seed:demo-fluxo` OK |
| P5 | Operador demo com caixa aberto | seed `e2e-operador@localhost.test` |

---

## 2. Os 5 testes obrigatórios (críticos)

Cada teste mapeia um risco do TOP 5 do mapa de falhas silenciosas.

---

### Teste 1 — Duplicação de receita (cross-source)

| | |
|--|--|
| **Risco** | B1 — `web_caixa:{sale_id}` e `sync_outbox:{sale_id}` geram dois `SALE_REGISTERED` |
| **Hipótese** | Mesmo `sale_id` registrado pela web e replay pelo canal sync não duplica faturamento no ledger |

#### Procedimento

1. Anotar `LOJA_ID` alvo (ex.: Matriz `a0000001-0000-4000-8000-000000000001`).
2. Executar venda web de prova:
   ```bash
   npm run stress:pdv -- duplicate
   ```
   Anotar `saleId` do bloco `Meta` do cenário `stressDuplicateSale`.
3. Simular replay sync (service_role), **mesmo `sale_id`**, venda já `CONCLUIDA`:
   ```sql
   -- Apêndice A.1: replay sync_outbox idempotente
   SELECT public.ensure_venda_evento_registrado('<SALE_ID>'::uuid, 'sync_outbox');
   ```
4. Executar verificação de duplicata:
   ```sql
   -- Apêndice A.2: duplicata por sale_id
   ```

#### Critério PASS

| Métrica | Esperado |
|---------|----------|
| `COUNT(*)` em `vendas` WHERE `id = sale_id` | **1** |
| `COUNT(*)` em `venda_eventos` WHERE `sale_id = ?` AND `event_type = 'SALE_REGISTERED'` | **1** |
| `COUNT(DISTINCT idempotency_key)` para esse `sale_id` em `SALE_REGISTERED` | **1** |

#### Critério FAIL

Qualquer contagem **> 1** em `SALE_REGISTERED` para o mesmo `sale_id`, ou duas chaves `web_caixa:*` + `sync_outbox:*` coexistindo.

#### Integração stress

| Comando | Papel |
|---------|-------|
| `npm run stress:pdv -- duplicate` | Cria venda web (`web_caixa`) idempotente |
| SQL Apêndice A.1–A.2 | Validação cross-source (não automatizada no script) |
| `pdv-consistency-check` → `duplicacao` | Deve ser **0** após o teste |

---

### Teste 2 — Split brain (gerente vs vendas vs dashboard)

| | |
|--|--|
| **Risco** | C1 — `/gerente/vendas` usa ledger; dashboard/relatórios usam `vendas` |
| **Hipótese** | Após stress + refresh, todas as leituras gerenciais de faturamento coincidem |

#### Procedimento

1. Baseline SQL **antes** do stress (Apêndice A.3 — três totais).
2. Executar bateria completa:
   ```bash
   npm run stress:pdv
   ```
3. Baseline SQL **depois** do stress (mesmo Apêndice A.3).
4. UI (sessão gerente real):
   - Abrir `/gerente/vendas` → anotar KPI **Faturado** e quantidade.
   - Abrir `/gerente/dashboard` (ou home gerente) → anotar faturamento do dia.
   - **Hard refresh** (Ctrl+F5) em ambas.
5. Comparar os três números com SQL.

#### Critério PASS

Para a `LOJA_ID` alvo, após refresh:

| Fonte | Métrica |
|-------|---------|
| SQL — ledger `SUM(total)` `SALE_REGISTERED` | `L` |
| SQL — `vendas` CONCLUIDA via `caixas.loja_id` | `V` |
| SQL — `kpis_venda_eventos_gerente.faturado` | `K` |
| UI — `/gerente/vendas` KPI faturado | `U1` |
| UI — dashboard faturamento hoje | `U2` |

**PASS** somente se: `L = V = K = U1 = U2` (±R$ 0,00).

#### Critério FAIL

Qualquer par com diferença ≥ R$ 0,01 ou contagem de vendas divergente; UI mostra valor diferente do SQL; dashboard ≠ lista de vendas.

#### Integração stress

| Comando / check | Papel |
|-----------------|-------|
| `npm run stress:pdv` | Gera volume conhecido de vendas |
| `npm run stress:pdv:check` | `Ledger drift` + detalhes (ver nota abaixo) |
| SQL Apêndice A.3 | **Autoridade** para split brain (corrige join `caixas`) |
| UI manual gerente | Obrigatório — detecta KPI silencioso zerado |

> **Nota:** `pdv-consistency-check` usa `.eq('loja_id')` em `vendas` (coluna inexistente). Para este gate, **SQL Apêndice A.3 é obrigatório**; não confiar apenas no exit code do check para Teste 2.

---

### Teste 3 — Race condition (fechamento vs venda)

| | |
|--|--|
| **Risco** | Venda em caixa já fechado — receita no ledger, fora do fechamento |
| **Hipótese** | Concorrência fechar + vender não perde nem duplica receita |

#### Procedimento

```bash
npm run stress:pdv -- concurrent
```

Anotar do `Meta`: `saleId`, `caixaBefore`, `saleOk`, `closeOk`.

Em seguida, SQL Apêndice A.4 (venda vs status do caixa).

#### Critério PASS

| Métrica | Esperado |
|---------|----------|
| `[PDV STRESS REPORT]` Idempotência | **OK** |
| Duplicação | **0** |
| Ledger drift | **OK** |
| `vendas` para `sale_id` do cenário | **0 ou 1** (nunca > 1) |
| Se venda **existe**: `caixas.status` do `caixa_id` da venda | **ABERTO** no momento do teste aceitável* |

\* **PASS estrito:** venda concluída **somente** se caixa ainda `ABERTO`. Se venda gravada em caixa `FECHADO` → **FAIL** (perda silenciosa no fechamento).

#### Critério FAIL

- `duplicacao > 0` ou `ledgerDrift = FAIL`
- Venda `CONCLUIDA` com `caixa_id` apontando para caixa `FECHADO` no instante da validação
- Duas linhas em `vendas` para intenção única

#### Integração stress

| Comando | Papel |
|---------|-------|
| `npm run stress:pdv -- concurrent` | Cenário principal |
| `pdv-consistency-check` pós-cenário | Embutido no stress report |
| SQL Apêndice A.4 | Validação estrita caixa ABERTO |

---

### Teste 4 — KPI drift silencioso

| | |
|--|--|
| **Risco** | KPI RPC diverge do ledger; ou retorna zero em erro |
| **Hipótese** | `kpis_venda_eventos_gerente` = agregação SQL pura do ledger, tolerância zero |

#### Procedimento

1. Após `npm run stress:pdv`, executar:
   ```bash
   npm run stress:pdv:check
   ```
2. Executar SQL Apêndice A.5 (comparação KPI vs ledger).
3. Opcional reforço: inspecionar `details` no relatório — linha `Gerente KPIs: faturado=…`.

#### Critério PASS

| Métrica | Esperado |
|---------|----------|
| `kpis.faturado` | `= SUM(venda_eventos.total)` FILTER `SALE_REGISTERED` |
| `kpis.qtd_concluidas` | `= COUNT(*)` FILTER `SALE_REGISTERED` |
| Diferença absoluta | **0** (monetário e contagem) |
| RPC error | **nenhum** |

#### Critério FAIL

Qualquer Δ ≥ R$ 0,01 ou Δ contagem ≥ 1; `kpis_venda_eventos_gerente` retorna erro; UI gerente mostra R$ 0,00 com ledger > 0 (ver Teste 2).

#### Integração stress

| Comando / campo | Papel |
|-----------------|-------|
| `npm run stress:pdv:check` | Roda `kpis_venda_eventos_gerente` internamente (`gerenteVsLedger`) |
| SQL Apêndice A.5 | **Autoridade** (campo `gerenteVsLedger` não está no exit code nem no print padrão) |

> **Nota:** O exit code de `stress:pdv:check` **não** inclui `gerenteVsLedger`. Operador do gate **deve** executar SQL A.5 ou ler `details` manualmente.

---

### Teste 5 — Under-reporting por falha silenciosa

| | |
|--|--|
| **Risco** | Venda commitada sem ledger; retry/timeout perde evento; UI erro pós-sucesso |
| **Hipótese** | Toda venda bem-sucedida tem exatamente um evento; falha é explícita |

#### Procedimento

1. Cenário retry:
   ```bash
   npm run stress:pdv -- retry
   ```
2. Cenário duplicate (reforço idempotência):
   ```bash
   npm run stress:pdv -- duplicate
   ```
3. SQL Apêndice A.6 (drift global vendas × ledger por loja).
4. Verificar relatórios stress:
   - Idempotência: **OK**
   - Ledger drift: **OK**
   - `watched sale_id`: `vendas = 1`, ledger `SALE_REGISTERED = 1`

#### Critério PASS

| Métrica | Esperado |
|---------|----------|
| Cada `sale_id` de teste | 1 linha `vendas CONCLUIDA` ↔ 1 `SALE_REGISTERED` |
| `SUM(total_liquido)` vendas (join caixas) | `= SUM(total)` ledger `SALE_REGISTERED` |
| Resposta stress `retry` | `secondPostOk: true`, idempotência OK |
| UI web (amostra manual 1 venda) | Recibo exibido **somente** se `eventId` presente (sem falso erro) |

#### Critério FAIL

- Venda em `vendas` sem par no ledger
- Evento no ledger sem venda `CONCLUIDA`
- `Idempotência: FAIL` ou `Ledger drift: FAIL`
- Operador vê erro genérico mas SQL mostra venda criada (under-reporting + UX silenciosa)

#### Integração stress

| Comando | Papel |
|---------|-------|
| `npm run stress:pdv -- retry` | Timeout simulado + retry mesma venda |
| `npm run stress:pdv -- duplicate` | Paralelismo mesmo `sale_id` |
| `npm run stress:pdv:check` | Drift global |
| SQL Apêndice A.6 | Autoridade vendas × ledger |

---

## 3. Critérios PASS/FAIL (consolidado)

```
FAIL  :=  ∃ teste ∈ {1,2,3,4,5} : critério violado
        ∨  ∃ pré-requisito ∈ {P1..P5} : não atendido

PASS  :=  ∀ teste ∈ {1,2,3,4,5} : critério atendido com tolerância zero
        ∧  ∀ pré-requisito ∈ {P1..P5} : atendido

GO    :=  PASS
NO-GO :=  FAIL
```

**Tolerância financeira:** ±R$ 0,00. **Tolerância de contagem:** 0.

---

## 4. Saída padrão do gate

Ao concluir os 5 testes, o operador preenche e cola no log de release (CI, runbook ou ticket):

```
[PDV PRODUCTION GATE]
Ambiente: <staging|produção>
Data/hora: <ISO-8601>
Executor: <nome>
LOJA_ID: <uuid>
Migrations 228-231: OK|FAIL

Duplicação:       PASS|FAIL   (Teste 1 — cross-source sale_id=<uuid>)
Split brain:      PASS|FAIL   (Teste 2 — L=V=K=U1=U2)
Race condition:   PASS|FAIL   (Teste 3 — concurrent + caixa ABERTO)
KPI drift:        PASS|FAIL   (Teste 4 — Δ faturado=0, Δ qtd=0)
Under-reporting:  PASS|FAIL   (Teste 5 — retry+duplicate+drift SQL)

FINAL RESULT: GO|NO-GO
```

### Regras de preenchimento

- Cada linha **PASS** ou **FAIL** — não existe `WARN` ou `SKIP`.
- **FINAL RESULT: GO** apenas se as 5 linhas forem **PASS** e pré-requisitos OK.
- Anexar evidência: stdout de `npm run stress:pdv`, screenshots UI Teste 2, resultado SQL A.3/A.5/A.6.

---

## 5. Integração com stress test (mapa completo)

### Sequência recomendada (uma execução de gate)

```bash
# 0. Pré-requisitos
cd pdv-importados && npm run seed:dev-users && npm run seed:demo-fluxo
cd .. && node backend/scripts/p0-migration-status.mjs   # se disponível

# 1. Teste 1 (início) + 5 (retry/duplicate embutidos)
npm run stress:pdv -- duplicate    # anotar saleId
# → SQL A.1 replay sync + A.2 duplicata

# 2. Teste 3
npm run stress:pdv -- concurrent

# 3. Teste 5 (retry dedicado)
npm run stress:pdv -- retry

# 4. Bateria completa (Teste 2 volume)
npm run stress:pdv

# 5. Testes 2, 4, 5 — validação SQL
npm run stress:pdv:check
# → SQL A.3, A.5, A.6 obrigatórios
# → UI gerente Teste 2
```

### Matriz comando → teste

| Teste | `npm run stress:pdv` | `npm run stress:pdv:check` | SQL manual | UI manual |
|-------|---------------------|----------------------------|------------|-----------|
| 1 Duplicação cross-source | `-- duplicate` | `duplicacao`, `idempotencia` | **A.1, A.2** | — |
| 2 Split brain | `all` | `ledgerDrift` (parcial) | **A.3** | **/gerente/vendas + dashboard** |
| 3 Race | `-- concurrent` | pós-cenário embutido | **A.4** | — |
| 4 KPI drift | `all` (pré-check) | `gerenteVsLedger` (não no exit code) | **A.5** | — |
| 5 Under-reporting | `-- retry`, `-- duplicate` | `ledgerDrift`, `idempotencia` | **A.6** | 1 venda amostra |

### Campos `[PDV STRESS REPORT]` usados pelo gate

| Campo | Testes |
|-------|--------|
| `Idempotência: OK` | 1, 3, 5 |
| `Duplicação: 0` | 1, 3 |
| `Ledger drift: OK` | 2, 3, 5 |
| `Orphans: 0` | 3, 5 |
| `Caixa vs Ledger: MATCH` | 3 (informativo; não substitui A.4) |

---

## Apêndice A — SQL de validação (autoridade do gate)

Substituir `<LOJA_ID>` e `<SALE_ID>` conforme ambiente.

### A.0 — Sanidade pré-gate

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'venda_eventos'
) AS tem_venda_eventos;

SELECT public.kpis_venda_eventos_gerente('<LOJA_ID>'::uuid);
```

### A.1 — Replay sync no mesmo sale_id (Teste 1)

```sql
SELECT public.ensure_venda_evento_registrado('<SALE_ID>'::uuid, 'sync_outbox') AS event_id;
```

### A.2 — Duplicata SALE_REGISTERED por sale_id (Teste 1)

```sql
SELECT sale_id, COUNT(*) AS n, array_agg(idempotency_key) AS keys
FROM public.venda_eventos
WHERE event_type = 'SALE_REGISTERED' AND sale_id = '<SALE_ID>'::uuid
GROUP BY sale_id;
-- PASS: n = 1
```

### A.3 — Split brain: ledger vs vendas vs KPI (Teste 2)

```sql
WITH ledger AS (
  SELECT COALESCE(SUM(e.total), 0)::numeric(10,2) AS faturado,
         COUNT(*)::bigint AS qtd
  FROM public.venda_eventos e
  WHERE e.loja_id = '<LOJA_ID>'::uuid AND e.event_type = 'SALE_REGISTERED'
),
vendas_loja AS (
  SELECT COALESCE(SUM(v.total_liquido), 0)::numeric(10,2) AS faturado,
         COUNT(*)::bigint AS qtd
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE c.loja_id = '<LOJA_ID>'::uuid AND v.status = 'CONCLUIDA'
),
kpi AS (
  SELECT faturado, qtd_concluidas AS qtd
  FROM public.kpis_venda_eventos_gerente('<LOJA_ID>'::uuid)
)
SELECT
  l.faturado AS ledger_faturado,
  v.faturado AS vendas_faturado,
  k.faturado AS kpi_faturado,
  l.qtd AS ledger_qtd,
  v.qtd AS vendas_qtd,
  k.qtd AS kpi_qtd,
  (l.faturado = v.faturado AND l.faturado = k.faturado
   AND l.qtd = v.qtd AND l.qtd = k.qtd) AS gate_pass
FROM ledger l, vendas_loja v, kpi k;
-- PASS: gate_pass = true
```

### A.4 — Venda em caixa fechado (Teste 3)

```sql
SELECT v.id AS sale_id, v.caixa_id, c.status AS caixa_status, v.status AS venda_status
FROM public.vendas v
JOIN public.caixas c ON c.id = v.caixa_id
WHERE v.id = '<SALE_ID>'::uuid;
-- PASS estrito: sem linha OU caixa_status = 'ABERTO'
-- FAIL: venda_status = 'CONCLUIDA' AND caixa_status = 'FECHADO'
```

### A.5 — KPI drift (Teste 4)

```sql
-- Idêntico ao bloco kpi/ledger em A.3; gate_pass deve ser true com tolerância 0
```

### A.6 — Drift global under-reporting (Teste 5)

```sql
WITH ledger AS (
  SELECT COUNT(*) AS n, COALESCE(SUM(total), 0)::numeric(10,2) AS s
  FROM public.venda_eventos
  WHERE loja_id = '<LOJA_ID>'::uuid AND event_type = 'SALE_REGISTERED'
),
vendas_loja AS (
  SELECT COUNT(*) AS n, COALESCE(SUM(v.total_liquido), 0)::numeric(10,2) AS s
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE c.loja_id = '<LOJA_ID>'::uuid AND v.status = 'CONCLUIDA'
),
orphan_vendas AS (
  SELECT v.id FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE c.loja_id = '<LOJA_ID>'::uuid AND v.status = 'CONCLUIDA'
    AND NOT EXISTS (
      SELECT 1 FROM public.venda_eventos e
      WHERE e.sale_id = v.id AND e.event_type = 'SALE_REGISTERED'
    )
),
orphan_ledger AS (
  SELECT e.sale_id FROM public.venda_eventos e
  WHERE e.loja_id = '<LOJA_ID>'::uuid AND e.event_type = 'SALE_REGISTERED'
    AND NOT EXISTS (
      SELECT 1 FROM public.vendas v WHERE v.id = e.sale_id AND v.status = 'CONCLUIDA'
    )
)
SELECT
  l.n AS ledger_n, vl.n AS vendas_n,
  l.s AS ledger_sum, vl.s AS vendas_sum,
  (SELECT COUNT(*) FROM orphan_vendas) AS vendas_sem_ledger,
  (SELECT COUNT(*) FROM orphan_ledger) AS ledger_sem_venda,
  (l.n = vl.n AND l.s = vl.s
   AND (SELECT COUNT(*) FROM orphan_vendas) = 0
   AND (SELECT COUNT(*) FROM orphan_ledger) = 0) AS gate_pass
FROM ledger l, vendas_loja vl;
-- PASS: gate_pass = true
```

---

## Apêndice B — Ambiente híbrido (pdv-local)

Se produção incluir **pdv-local + sync-outbox**, este gate web é **necessário mas não suficiente**. Adicionar:

- Outbox `dlq = 0` e `pendentes_total = 0` após sync forçado
- Repetir Teste 1 com venda originada no local (mesmo `venda_id` no payload sync)

Sem isso → **NO-GO** para deploy híbrido.

---

## Apêndice C — Registro de decisão

| Campo | Valor |
|-------|-------|
| Gate version | 1.0 |
| Baseline git | `6395a27` ou posterior com migrations 228–231 |
| Documento de risco | `pdv-silent-revenue-failure-map.md` |
| Ferramentas | `dev-tools/pdv-stress-test.ts`, `dev-tools/pdv-consistency-check.ts` |

---

## 7. Automação total (simulador)

O gap de SQL manual e inspeção UI foi fechado pelo simulador programático:

```bash
# Modo determinístico (padrão)
npm run gate:pdv

# Modo híbrido + caos (staging obrigatório)
GATE_ENV=staging npm run gate:pdv:hybrid

# Modo completo: deterministic + hybrid + model drift
GATE_ENV=staging GATE_SEED=12345 GATE_CHAOS_SEED=999 npm run gate:pdv:full
```

**Arquivos:**

| Arquivo | Papel |
|---------|-------|
| `pdv-production-gate-simulator.ts` | Orquestrador — modos `deterministic` / `hybrid` / `full` |
| `gate-test-suite.ts` | 5 testes compartilhados entre modos |
| `gate-validation-engine.ts` | Validação ledger + `evaluateModelDrift` |
| `gate-chaos-layer.ts` | Injeção de caos real (latência, timeout, retry) |
| `gate-staging-guard.ts` | Bloqueia `hybrid_mode` fora de staging |
| `pdv-gate-client.ts` | RPCs reais (`v3`, `fechar_caixa_atomico`, cancel) |
| `gate-deterministic-rng.ts` | Seed fixa para replay previsível |

**Modos de execução:**

| Modo | `GATE_MODE` / CLI | Backend | Caos |
|------|-------------------|---------|------|
| Determinístico (padrão) | `deterministic` | Real (staging) | Retry simulado fixo |
| Híbrido | `hybrid` / `--mode=hybrid` | Real (staging obrigatório) | `GateChaosLayer` |
| Completo | `full` / `--mode=full` | Real | Determinístico + caos + comparação |

**Comparação tripla (modo full):**

| Fonte | Papel |
|-------|-------|
| Simulador determinístico | Previsão esperada (modelo) |
| Execução híbrida | Realidade sob caos |
| Snapshot ledger | Verdade final |

**MODEL DRIFT FAILURE (NO-GO automático):** quando um teste é **PASS** no determinístico e **FAIL** no híbrido → `Model Drift: FAIL` → `FINAL RESULT: NO-GO`, mesmo que o determinístico tenha passado sozinho.

**Saída determinística:** `[PDV SIMULATED PRODUCTION GATE]` com `FINAL RESULT: GO|NO-GO`

**Saída híbrida (modo full):**

```
[PDV HYBRID PRODUCTION GATE]

Deterministic: GO|NO-GO
Hybrid: GO|NO-GO
Model Drift: PASS|FAIL

FINAL RESULT: GO|NO-GO
```

**Caos (`gate-chaos-layer.ts`):** latência 50–2000ms (p95/p99), timeout forçado 5–10%, early-timeout fire-and-forget, retry real com limite fixo `CHAOS_MAX_RETRIES=4`, verificação de partial failure (OK sem ledger em ~2%), concorrência paralela sem seed. Todos os logs marcam `CHAOS_INJECTION=true`.

**Segurança:** `hybrid_mode` exige `GATE_ENV=staging` (ou URL local/staging). URLs com fragmentos `production`/`prod-` são bloqueadas. Override local apenas com `GATE_ALLOW_HYBRID_ANYWHERE=true`.

**Exit code:** `0` = GO, `1` = NO-GO (CI-ready)

O simulador substitui SQL A.1–A.6 por queries Supabase programáticas, gera vendas `web_caixa` + `sync_outbox`, cancel, retry e race — sem mockar resposta RPC no modo híbrido.

---

*Protocolo formal — não altera código de produção. Atualizar versão do gate quando migrations ou stress tools mudarem.*
