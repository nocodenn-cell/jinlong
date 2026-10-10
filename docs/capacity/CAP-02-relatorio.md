# CAP-02 — Carga progressiva local (fastproduct-capacity)

Data: 2026-10-10 (UTC). Alvo exclusivo: Docker local `fastproduct-capacity` (API `127.0.0.1:54421`, DB `127.0.0.1:54422`).
Sem acesso a produção, staging remoto ou AgeGuard. Nenhuma regra de firewall nova; nenhum `.env.local` tocado.
Resultados **não** extrapoláveis para Supabase Cloud / Vercel (sem Next.js, sem rede WAN, sem pooler gerenciado).

## Fluxo testado por venda

1. `calcular_preco_produto` (bipagem) → 2. `GET produtos` (pré-validação) → 3. RPC `finalizar_venda_transacional_canonica_v4` → 4. read-back da venda (status/total/pagamentos).
Venda confirmada só se 1–4 passarem (T00 v2, T04, T05). T01–T03 rodaram com o harness v1 (só etapa 3 + verificação `CONCLUIDA`).
Em todos os cenários a aprovação exige reconciliação SQL independente (não apenas HTTP 200).

Pacing: os caixas disparam **em rajada sincronizada** (todos no mesmo segundo, a cada 60 s/30 s).
T04 = 15 rajadas de 10 vendas simultâneas (spread ≤ 68 ms); T05 = 15 rajadas de 20 simultâneas (spread ≤ 239 ms).

## Comparativo

| Cen. | Config | Taxa total | Tent./Conf./Persist. | Vendas/min | Erros / timeouts | RPC HTTP p50/p95/p99 ms | RPC no PG média/máx ms | Venda completa p95/p99 ms | CPU host méd/máx | RAM disp. mín | PG conns/locks máx | Reconciliação | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T00 | 1 caixa, 5 min | 60/h | 5/5/5 | 1 | 0 / 0 | 28.6 / 35.8 / 35.8 | 24.6 / 29.8 | 71.0 / 71.0 | 2.9% / 3.4% | 2548 MB | 14 / 0 | OK | PASS |
| T01 | 1 caixa, 15 min | 60/h | 15/15/15 | 1 | 0 / 0 | 47.4 / 62.0 / 62.0 | n/m | n/m (harness v1) | n/m (snapshot) | 2.9 GiB (snapshot) | 13 / 0 | OK | PASS* |
| T02 | 2 caixas, 15 min | 120/h | 30/30/30 | 2 | 0 / 0 | 47.2 / 71.8 / 74.6 | 30.3 / 42.6 | n/m (harness v1) | n/m (snapshot) | 2.9 GiB (snapshot) | 14 / 0 | OK (baseline) | PASS* |
| T03 | 2 caixas, 15 min | 240/h | 60/60/60 | 4 | 0 / 0 | 45.8 / 61.0 / 86.8 | 30.3 / 50.3 | n/m (harness v1) | load1 ≤ 0.5 | 2460 MB | 14 / 0 | OK (baseline) | PASS* |
| T04 | 5 lojas × 2 caixas, 15 min | 600/h | 150/150/150 | 10 | 0 / 0 | 64.8 / 98.9 / 110.6 | 55.8 / 103.1 | 144.7 / 164.8 | 3.4% / 5.7% | 2394 MB | 22 / 0 | OK (baseline) | PASS |
| T05 | 10 lojas × 2 caixas, 15 min | 1200/h | 300/300/300 | 20 | 0 / 0 | 59.8 / 130.0 / 149.7 | 35.5 / 140.4 | 195.6 / 246.6 | 3.6% / 7.4% | 6328 MB | 22 / 0 | OK (baseline) | PASS |

\* PASS com ressalva de observabilidade: harness v1 (sem latência de venda completa nem amostragem contínua de CPU). Os critérios funcionais (persistência, estoque, caixa, isolamento) foram verificados em SQL. T04/T05 cobrem os mesmos fluxos com observabilidade completa e carga maior.

Reconciliação (todos os cenários, janela real `since`→`until`): 0 vendas sem itens, 0 itens duplicados, 0 pagamentos divergentes, 0 divergências de kardex (`movimentos_estoque_log` = −quantidade vendida), 0 estoques negativos, 0 divergências de `caixas.saldo_atual` (absoluto e vs baseline), 0 vendas com operador/caixa/produto de outra loja. Integridade acumulada (573 vendas, 10 lojas): `cap02-all-reconcile.json` OK.
Isolamento RLS: operador de loja CAP só enxerga as vendas do próprio caixa; venda da MATRIZ retorna `[]` (`cap02-isolamento-rls.txt`).
Degradação (p95 do último terço / p95 do primeiro terço): T01 0.88, T02 0.84, T03 0.67, T04 0.90, T05 0.78. Nenhuma degradação progressiva.
PG: 0 rollbacks, 0 deadlocks, 0 locks aguardando nas amostras (15 s) de T04/T05.

`movimentos_financeiros` não recebe lançamento por venda nesse fluxo (delta 0 em todos os cenários). O financeiro do caixa aberto é `vendas_pagamentos` + `caixas.saldo_atual`, ambos reconciliados. Consolidação financeira no fechamento de caixa **não** foi exercitada.

## Gargalos e causas prováveis

Nenhum componente saturou. O primeiro sinal de sensibilidade à carga é a **RPC `finalizar_venda_transacional_canonica_v4` dentro do Postgres**:
- RPC HTTP p95 sobe com a concorrência da rajada: 36 → 62 → 99 → 130 ms (1 → 2 → 10 → 20 simultâneas).
- Tempo no PG (`pg_stat_statements`) 25–30 ms com 1–2 caixas; 36–56 ms média e até 140 ms máx com 10–20 simultâneas.
- CPU do container `db` chega a 35–43% de um core no pico da rajada; demais (rest, kong, auth) ≤ 12%.
- Causa provável: concorrência de escrita na mesma linha de `estoque` (2 caixas de cada loja vendem o mesmo produto) e de `caixas` por rajada, mais o custo de triggers da venda. Sem espera de lock observável nas amostras; locks são curtos (< rajada).

Limites do ambiente (não do Jinlong): host com ~11 GiB não atribuíveis a processos (memória disponível oscilou 2.4–6.3 GiB). Host CPU ≤ 7.4%.

## Capacidade máxima demonstrada localmente

20 caixas (10 lojas × 2), 1200 vendas/h (20 vendas/min), 15 min, em rajadas de 20 vendas simultâneas: 300/300 vendas confirmadas e reconciliadas, 0 erros, 0 timeouts, venda completa p99 247 ms.
O teto real não foi atingido.

## GO/NO-GO — soak de 12 h

**NO-GO para iniciar agora com o harness atual. GO condicional após 3 ajustes de harness/dados (não estruturais):**
1. **JWT expira em 3600 s** (`jwt_expiry`): o harness faz login uma vez no `setup` → todas as vendas falhariam com 401 após ~1 h. Ajuste: refresh de token por VU antes da expiração.
2. **Estoque insuficiente**: produtos das lojas CAP têm 940–970 un.; ao ritmo T05 (120/h por loja) acabam em ~7.8 h. Ajuste: reabastecer via fluxo oficial de estoque no seed local (≥ 2000 un./produto) antes do soak.
3. **Monitor com teto de 1500 s**: parametrizar para 12 h + intervalo 60 s.
Recomendado: soak em ritmo T04 (600/h) ou T05 com o gate de memória (800 MB) mantido; limitação conhecida: `SIGKILL` no runner deixa o k6 órfão até o fim da duração.

## Evidências

`/opt/cursor/artifacts/`: `cap02-<t>-{baseline,reconcile,latency,summary}.json`, `cap02-<t>-samples.tsv`, `cap02-<t>-resources-{before,after}.txt` (inclui top statements), `cap02-<t>-console.log`, `cap02-comparativo.md`, `cap02-all-reconcile.json`, `cap02-isolamento-rls.txt`, `cap02-interrupt-{sigint,sigkill}-*` (teste do monitor), `cap02-t02-aborted-*` (execução interrompida descartada), `cap02-t00-v1-*` (T00 original, harness v1).
