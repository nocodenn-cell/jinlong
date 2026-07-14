 Plano t├®cnico ÔÇö Autoridade #1 (pre├ºo) ┬À PR #182

**Status:** IMPLEMENTADO nesta branch (`loop/ba-011-precos-atacado-sync`).  
**Objetivo:** `PRICE_RESOLUTION_CHAIN` / RPC `calcular_preco_produto` = ├║nica autoridade de pre├ºo autom├ítico em Web **e** Local.

## Inputs can├┤nicos (fechados)

| Input | Uso |
|-------|-----|
| SKU (`produto_id` + `ativo`) | Cat├ílogo |
| Quantidade (FLOOR ÔåÆ integer ÔëÑ 1) | Faixa de tier / min padrao |
| `loja_id` | Filtro tiers (`NULL` global OR = loja) |
| `produtos.preco_varejo` | Fallback |
| `produtos.preco_atacado` | Fallback atacado cat├ílogo |
| `pdv_config.quantidade_minima_atacado_padrao` | Gatilho cat├ílogo |
| `precos_atacado` (ativo, qty min, preco, loja) | Prioridade 1 |

## O que mudou

1. **`calcularPrecoCanonico`** (`shared-core`) = porta TypeScript = migra├º├úo 250.
2. **Sync Edge:** `preco_atacado` + array `precos_atacado` (global Ôê¬ loja via `x-loja-id` / `DEFAULT_PDV_LOJA_ID` / `PDV_LOJA_ID`) + `quantidade_minima_atacado_padrao`. **Sem** projetar tiers em `regras_preco`.
3. **SQLite:** `preco_atacado`, `precos_atacado_cache`, min padrao + `loja_id` no config.
4. **Runtime Local:** `App` / `recalcularPrecoItemLocal` ÔåÆ can├┤nico. `PricingService` s├│ PROMOCAO.
5. **Golden** WebÔëíLocal com diff=0 (varejo, tiers, cat├ílogo, fracionado, sem atacado).

## Fora de escopo (mantido)

- Venda em espera / cliente  
- BA-012 estoque Local  
- UX n├úo relacionada a pre├ºo  
