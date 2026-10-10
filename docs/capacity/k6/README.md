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

Fluxo real por VU: login password → RPC `finalizar_venda_transacional_canonica_v4` autenticada → persistência em `vendas`/`estoque`/`caixas`.

Variáveis vêm do `supabase status` do workdir capacity — **não** de `NEXT_PUBLIC_*` / `.env.local`.

## Esqueleto legado

`scenarios/smoke.js` e `peak.js` permanecem como reachability/pacing; o caminho canônico CAP-02 é `cap02-progressive.js`.
