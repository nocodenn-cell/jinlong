# k6 — capacidade (Jinlong)

**NÃO executar contra produção.** Guards abortam se a URL não for `localhost`/`127.0.0.1` (local) ou staging allowlisted.

## CAP-02 — carga progressiva local (`fastproduct-capacity`)

Alvo exclusivo: `http://127.0.0.1:54421` (project Docker `fastproduct-capacity`).

```bash
# 1) Stack capacity já up + seed synthetic 1/5/10
# 2) Preparar 10 lojas × 2 caixas (senhas locais; nunca .env.local)
sg docker -c 'CAPACITY_LOJAS=10 CAPACITY_CAIXAS_POR_LOJA=2 node scripts/capacity/prepare-capacity-k6.mjs'

# 3) Cenários (só avança se gate anterior verde)
bash scripts/capacity/run-cap02-scenario.sh T00   # 1 caixa, 1 venda/min, 5m
bash scripts/capacity/run-cap02-scenario.sh T01   # 1 caixa, 60/h, 15m
bash scripts/capacity/run-cap02-scenario.sh T02   # 2 caixas, 120/h total, 15m
bash scripts/capacity/run-cap02-scenario.sh T03   # 2 caixas, 240/h total, 15m
bash scripts/capacity/run-cap02-scenario.sh T04   # 5×2, 600/h total, 15m
bash scripts/capacity/run-cap02-scenario.sh T05   # 10×2, 1200/h total, 15m
```

Fluxo real por VU (sessão própria por caixa, login no `setup`):

1. `calcular_preco_produto` (bipagem no `/caixa`)
2. `GET produtos?id=in.(...)` (pré-validação autoritativa)
3. RPC `finalizar_venda_transacional_canonica_v4` → `vendas`/`itens_venda`/`vendas_pagamentos`/`estoque`/`movimentos_estoque_log`/`caixas.saldo_atual`
4. Read-back independente: venda `CONCLUIDA`, total e pagamentos conferem (itens não legíveis por perfil CAIXA — policy `itens_gerente`; validados no SQL)

Venda só conta como confirmada se 1–4 passarem; HTTP 200 sozinho não aprova.

Métricas:

| Métrica | Significado |
|---|---|
| `finalize_duration` / `http_req_duration{op:finalize_v4}` | latência HTTP da RPC (Kong → PostgREST → PG) |
| `venda_completa_duration` | soma das etapas 1–3 (operação de venda no backend, sem Next.js) |
| `pg_stat_statements` (resources-after) | tempo de execução da RPC dentro do Postgres |

Pacing: `constant-vus` + `sleep(3600/taxa)` — os VUs disparam **em rajada sincronizada** (todos os caixas no mesmo segundo). É mais severo que chegada uniforme: concorrência de pico = nº de caixas.

Artefatos por cenário em `/opt/cursor/artifacts/cap02-<t>-*`: `baseline`, `reconcile`, `latency` (p50/p95/p99, erros por etapa, timeouts, vendas/min, degradação 1º vs último terço, picos de recursos), `samples.tsv` (CPU/RAM/PG a cada 15 s), `summary`, `metrics`.

O monitor (`sample-capacity-resources.sh`) é encerrado pelo `trap` do runner, sai sozinho se o runner morrer (watchdog do PID pai) e tem teto de 1500 s. Limitação: `SIGKILL` no runner deixa o k6 órfão até o fim da duração do cenário.

Tabela comparativa: `node scripts/capacity/report-cap02.mjs` → `cap02-comparativo.md`.

Variáveis vêm do `supabase status` do workdir capacity — **não** de `NEXT_PUBLIC_*` / `.env.local`.

## Esqueleto legado

`scenarios/smoke.js` e `peak.js` permanecem como reachability/pacing; o caminho canônico CAP-02 é `cap02-progressive.js`.
