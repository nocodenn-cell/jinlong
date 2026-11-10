# FASE 2 — Plano de Ensaios (reproduzível)

**Data:** 2026-10-09  
**Status:** plano — **não executar** até FASE 3 (ambiente isolado aprovado)  
**Ferramenta principal proposta:** [k6](https://k6.io/) + harness existente `dev-tools/` para invariantes  
**Alvo:** apenas homologação isolada (nunca produção / nunca `jinlong` prod)

---

## 0. Pré-condições absolutas (gate)

| # | Condição | Bloqueia |
|---|----------|----------|
| G1 | Projeto Supabase **separado** de produção, com migrations aplicadas via `db reset`/`db push` a partir do Git | FASE 3+ |
| G2 | App web apontando **somente** para esse projeto (URL preview/homolog) | FASE 3+ |
| G3 | Seeds sintéticos (lojas L1…L50, operadores, produtos, estoque) — **zero** PII de cliente | FASE 3+ |
| G4 | `CAPACITY_ENV=staging` + `CAPACITY_ALLOWED_PROJECT_REF` + `guard:capacity-target` + `guard:no-prod-target` (ver STG-01) | Scripts |
| G5 | Credenciais de produção **ausentes** do shell de teste | Scripts |
| G6 | Observabilidade mínima: Sentry staging, logs Supabase, métricas Vercel do preview | Medição |

Se G1 falhar: **parar**. Não há extrapolação segura a partir de laptop + DB local para 50 lojas SaaS — resultados locais são **só** para validar scripts.

---

## 1. Modelo de carga (cenários comerciais)

Premissa operacional (proposta, não comprovada): **2 caixas/loja**, **30 vendas/hora/caixa** no pico (= 1 venda / 2 min / caixa).

| Cenário | Lojas | Caixas | Vendas/hora pico | Vendas/s médio | VU k6 sugeridos* | Fase custo zero |
|---------|-------|--------|------------------|----------------|------------------|-----------------|
| Piloto | 1 | 2 | 60 | 0,017 | 2 | **Sim — prioridade** |
| Expansão | 5 | 10 | 300 | 0,083 | 10 | **Sim — prioridade** |
| Comercialização | 10 | 20 | 600 | 0,167 | 20 | **Sim — teto inicial** |
| Crescimento | 25 | 50 | 1.500 | 0,417 | 50 | Adiado (R$ 0 / Free) |
| Escala | 50 | 100 | 3.000 | 0,833 | 100 | Adiado (R$ 0 / Free) |

\* VU = virtual users = caixas simulados. Cada VU executa o ciclo de venda com `sleep` calibrado para ~30 vendas/h (≈ 120 s entre finalizações) + trabalho de busca/bipagem.

**STG-01 rev. custo zero:** executar só 1 → 5 → 10; Next + k6 locais; sem Vercel Preview; resultados = camada C2 (não C3 produção). Ver `STG01_HOMOLOGACAO_ISOLADA.md` §2.

### 1.1 Mix de operações por VU (ciclo de 2 minutos)

| Operação | Peso | Endpoint / caminho |
|----------|------|--------------------|
| Busca produto / bipagem GTIN | 3–8× antes da venda | Server Action scan ou RPC produto+preço |
| Finalização de venda | 1× | `finalizarVendaCaixa` / RPC v4 direta (modo API) |
| Pagamento | 1× por venda | DINHEIRO 40% / PIX 35% / CARTÃO 25% (ajustável) |
| Consulta status caixa | 1× pós-venda | `obter_status_caixa_operador` |
| Sangria/suprimento | 2%/hora | movimentação com idempotencyKey |
| Relatório / admin leve | 5% dos VU “gerente” | SELECT agregados admin (VU separados) |

### 1.2 Modos de ensaio

| Modo | Duração | Objetivo |
|------|---------|----------|
| **Smoke** | 5 min | Scripts + auth + 1 venda |
| **Pico** | 30–60 min | Cenário alvo com rampa 5 min |
| **Sustentado (soak)** | **8–12 h** | Vazamento memória/conexões, DLQ, degradação — **adiado sob orçamento R$ 0 / Free** |
| **Estresse** | 30 min | 2× pico do cenário; achar ponto de quebra |
| **Spike** | 10 min | 0 → 2× em 1 min → sustentado |
| **Continuidade** | ver §4 | Falhas injetadas |
| **Isolamento** | 30 min | 2+ lojas; assert RLS cruzado = 0 |

Ordem de execução: Smoke → Piloto → Expansão → … → Escala. **Abortar** se o cenário N falhar critérios §5; não pular para N+1.

---

## 2. Arquitetura do harness k6

### 2.1 Layout proposto

```
docs/capacity/k6/
  README.md                 # como rodar (staging only)
  lib/env-guard.js          # aborta se URL parecer prod
  lib/auth.js               # login operador por loja
  lib/sale.js               # payload + idempotencyKey
  scenarios/smoke.js
  scenarios/peak-pilot.js   # 1 loja / 2 caixas
  scenarios/peak-N.js       # parametrizado STAGES / LOJAS
  scenarios/soak-8h.js
  scenarios/stress-2x.js
  scenarios/isolation-rls.js
  scenarios/continuity-*.js # orquestrado com chaos
```

Esqueleto inicial versionado em `docs/capacity/k6/` (não executa sem env de staging).

### 2.2 Duas camadas de medição

| Camada | O que mede | Prós | Contras |
|--------|------------|------|---------|
| **A — RPC direta** (service role ou JWT operador → PostgREST RPC v4) | Capacidade do Postgres + RPC | Isola DB | Subestima custo Next/Auth/Vercel |
| **B — Server Action / HTTP app** | Caminho real do caixa web | Realismo | Precisa cookies/CSRF Next |

**Recomendação:** rodar **A e B** no mesmo cenário Piloto/Expansão. Gargalo = o pior dos dois.

### 2.3 Reuso de `dev-tools/`

Após cada cenário k6:

```bash
# Somente com SUPABASE_URL de staging
GATE_ENV=staging npm run stress:pdv:check
# ou script de consistência multi-loja a criar na FASE 3
```

Invariantes pós-carga:

- vendas `CONCLUIDA` == eventos de ledger esperados;
- `estoque` ≥ 0;
- zero `estoque_baixas` duplicadas;
- zero vendas com mesmo `id` e payloads divergentes;
- contagens por `loja_id` batem com VU daquela loja.

### 2.4 Métricas a coletar

**k6 (obrigatório):**

- `http_req_duration` p50 / p95 / p99 (tag `op:finalize`)
- `http_req_failed` / thresholds
- `vendas_ok`, `vendas_dup_retry`, `estoque_insuficiente`, `timeout_cliente`
- `vus`, `iterations`

**Infra (obrigatório em staging):**

- CPU / mem Postgres (Supabase dashboard ou `pg_stat_activity`)
- `numbackends` vs `max_connections`
- locks (`pg_locks` waiters em `estoque` / advisory)
- queries lentas (`pg_stat_statements` se habilitado)
- erros 5xx Vercel + Edge
- profundidade fila fiscal + falhas Focus (se ligado)
- conexões Realtime abertas

**Continuidade:**

- tempo até primeira venda após falha (RTO operacional)
- vendas locais não sincronizadas (desktop)
- necessidade de intervenção manual (sim/não)

---

## 3. Scripts de cenário (especificação)

### 3.1 Variáveis de ambiente

```bash
export CAPACITY_ENV=staging
export K6_SUPABASE_URL=https://<STAGING_REF>.supabase.co
export K6_ANON_KEY=...
export K6_LOJAS=10
export K6_CAIXAS_POR_LOJA=2
export K6_VENDAS_POR_HORA_POR_CAIXA=30
export K6_DURATION=45m
export K6_PRODUTO_CODIGO=7898512340004   # seed sintético
# Abortar se URL contiver fragmento de prod — ver lib/env-guard.js
```

### 3.2 Thresholds iniciais (calibrar após Piloto)

Alinhados às metas propostas (ainda **não validadas**):

```javascript
thresholds: {
  'http_req_duration{op:finalize}': ['p(95)<2000', 'p(99)<5000'],
  'http_req_failed': ['rate<0.001'],
  'vendas_duplicadas': ['count==0'],
  'vazamento_entre_lojas': ['count==0'],
}
```

### 3.3 Rampas

| Cenário | stages |
|---------|--------|
| Piloto | 2m → 2 VU; hold 30m; ramp-down 2m |
| Expansão | 5m → 10 VU; hold 45m |
| Comercialização | 8m → 20 VU; hold 60m |
| Crescimento | 10m → 50 VU; hold 60m |
| Escala | 15m → 100 VU; hold 60m |
| Soak (no maior cenário aprovado) | hold **8–12 h** com VU do cenário |

---

## 4. Ensaios de continuidade (FASE 4 — especificação)

Executar **só em staging**, com observadores humanos + k6/chaos.

| # | Ensaio | Como injetar | Invariantes |
|---|--------|--------------|-------------|
| C1 | Queda de internet no caixa web | DevTools offline / proxy drop após POST | Pendente → verificação; 0 cobrança dupla |
| C2 | Indisponibilidade Supabase | Pausar projeto staging / firewall | Erro tipado; sem corrupção |
| C3 | Timeout finalize | Delay > 30 s no PostgREST (toxiproxy) | Modal pendente; retry idempotente |
| C4 | Resposta perdida pós-commit | Drop response após 200 no DB | Reconsulta por `idempotencyKey` acha venda |
| C5 | Reenvio mesma venda | k6 duplicate POST mesmo UUID | 1 venda; replay OK |
| C6 | Reinício PDV web | Reload com `vendaFinalizacaoPendente` | Recupera fluxo |
| C7 | Falha sync offline | Desktop vende; Edge 500; depois OK | Outbox drena; estoque coerente |
| C8 | Último item, 2 caixas | Estoque=1; 2 finalize paralelos | 1 OK + 1 `ESTOQUE_INSUFICIENTE` |
| C9 | Fechar caixa sob carga | `fechar_caixa_atomico` durante vendas | Vendas in-flight concluem ou falham limpo; caixa fecha |
| C10 | Reconciliação pós-conectividade | Combinar C1+C7 | Ledger = vendas; 0 fantasma |
| C11 | Isolamento lojas | Op. loja A lê dados loja B | 0 linhas |
| C12 | Restore backup | Restore em DB scratch | RTO medido; app sobe |

Orquestração: `dev-tools/network-simulator.ts` + `gate-chaos-layer.ts` para parte dos casos; toxiproxy/k6 para HTTP.

---

## 5. Critérios de liberação (por cenário)

Um cenário só é **APROVADO** se:

| Indicador | Meta inicial |
|-----------|--------------|
| Vendas confirmadas sem perda | 100% das iterações ok (exceto erros de negócio esperados: estoque) |
| Vendas duplicadas por retry | 0 |
| Vazamento entre lojas | 0 |
| Finalize p95 | ≤ 2 s |
| Finalize p99 | ≤ 5 s |
| Erros sob carga nominal | < 0,1% |
| Recuperação transitória (C3–C5) | Sem intervenção DBA; operador no máximo confirma modal |
| `numbackends` pico | < 80% de `max_connections` |
| Soak 8 h | Sem crescimento monotônico de conexões/erros; sem OOM |

Se falhar: registrar **primeiro gargalo**, classificar P0/P1, **não** subir de cenário.

---

## 6. Extrapolação e limites do método

| Ambiente de ensaio | O que se pode afirmar | O que **não** se pode afirmar |
|--------------------|----------------------|-------------------------------|
| Supabase local (Docker) | Scripts corretos; locks/idempotência | Capacidade SaaS / Vercel / rede real |
| Staging ≈ plano Free/Micro | Limite **conservador** inferior | Limite em Pro/Compute maior |
| Staging = mesmo compute que prod | Capacidade **comparável** | — |
| Sem soak 8 h | Pico curto | Estabilidade diária |

**Regra comercial:** limite recomendado = maior cenário APROVADO ÷ **2** (margem pico + crescimento), arredondado para baixo. Ex.: se Comercialização (10 lojas) passa e Crescimento falha → limite conservador **5 lojas** até novo ensaio.

---

## 7. Entregáveis da FASE 5 (após execução)

Preencher tabela (hoje: N/A):

| # | Métrica | Valor |
|---|---------|-------|
| 1 | Lojas simultâneas efetivamente testadas | _pendente_ |
| 2 | Caixas simultâneos suportados | _pendente_ |
| 3 | Throughput vendas/s e /h | _pendente_ |
| 4 | Latência p50/p95/p99 | _pendente_ |
| 5 | Taxa de erro por cenário | _pendente_ |
| 6 | CPU/mem/conexões DB | _pendente_ |
| 7 | Primeiro gargalo | _pendente_ |
| 8 | Comportamento em falhas | _pendente_ |
| 9 | Tempo real de recuperação | _pendente_ |
| 10 | Capacidade estimada vs comprovada | _pendente_ |
| 11 | Limite conservador de novas lojas | _pendente_ |
| 12 | Custos/mudanças para ampliar | _pendente_ |

Decisão final: **GO** / **GO CONDICIONAL** / **NO-GO** com restrições explícitas.

---

## 8. Cronograma técnico de execução (sem estimativa de calendário)

1. Gate humano: staging provisionado + secrets + seeds.  
2. Implementar scripts k6 completos + CI job `workflow_dispatch` (staging only).  
3. Smoke + Piloto + consistência.  
4. Escada de cenários até falha ou Escala.  
5. Soak no maior aprovado.  
6. Bateria de continuidade C1–C12.  
7. Relatório FASE 5 + decisão comercial.  
8. **Só então** autorizar correções estruturais priorizadas pelo gargalo medido.

---

## 9. Relação com tooling atual

Não substituir `stress:pdv` / `gate:pdv` — eles cobrem **corretude**.  
k6 cobre **capacidade**. Ambos são necessários para GO comercial.
