# Plano de testes de carga e concorrência (multiempresa / multi-loja)

## Hipóteses explícitas (sintéticas)

| Cenário | Empresas | Lojas | Operadores simultâneos | Vendas/min (pico) | Catálogo/loja | Histórico vendas |
|---|---|---|---|---|---|---|
| S1 | 2 | 2 | 4 | 10 | 1k | 10k |
| S2 | 10 | 20 | 40 | 60 | 5k | 200k |
| S3 | 50 | 100 | 150 | 200 | 10k | 2M |
| S4 | 100 | 200 | 300 | 400 | 20k | 10M |

**Não declarar suporte a S2+ sem evidência medida.**

## O que já foi executado (local)

Script: `scripts/benchmarks/multitenant-load-synth.mjs` (PGlite).

| Run | Env | Isolamento | p50 list / p95 list (ms) | Artifact |
|---|---|---|---|---|
| S1 reduzido | lojas=2, produtos=100, rounds=50 | cross_hits=0 **PASS** | ~0.48 / ~1.09 | `/opt/cursor/artifacts/multitenant-bench-lojas2.json` |
| Escala leve | lojas=10, produtos=50, rounds=30 | cross_hits=0 **PASS** | ~0.40 / ~0.88 | `/opt/cursor/artifacts/multitenant-bench-lojas10.json` |

Limites do script: sem RLS, sem rede, sem auth, sem sync-outbox, sem fiscal. Serve para regressão de filtro `loja_id` e baseline de query plana.

## Plano completo (autorização futura)

1. **Isolamento negativo** (Postgres local com RLS real / stack supabase local): fixtures 2 empresas × 2 lojas; testes XT-01…XT-07.  
2. **Concorrência financeira:** 2 caixas mesma loja; sangria/venda; locks (suítes já existentes + expansão).  
3. **Throughput PDV:** k6/Playwright stress só em homolog — **não** produção.  
4. **Sync:** provar que desktop loja A não recebe produtos B (hoje FAIL esperado).  
5. **Conexões:** monitorar pooler / `pg_stat_activity` sob S2.

## Métricas obrigatórias por run

- Latência p50/p95/p99 (RPC venda, list produtos, painel)  
- Throughput vendas/min  
- Erros 4xx/5xx / SQLSTATE  
- Locks waits  
- Conexões ativas  
- Invariantes: soma pagamentos = total; estoque não negativo; zero linhas cross-empresa  

## Estado

| Item | Status |
|---|---|
| Hipóteses documentadas | PASS (doc) |
| Bench sintético PGlite | executável — ver artifact |
| Capacidade S2/S3/S4 suportada | **NÃO VALIDADO** |
| Prova multiempresa RLS | **NÃO VALIDADO** (sem DDL empresas) |
