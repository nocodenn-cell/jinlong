# Plano técnico — Autoridade #1 (preço) · PR #182

**Status:** IMPLEMENTADO nesta branch (`loop/ba-011-precos-atacado-sync`).  
**Objetivo:** `PRICE_RESOLUTION_CHAIN` / RPC `calcular_preco_produto` = única autoridade de preço automático em Web **e** Local.

## Inputs canônicos (fechados)

| Input | Uso |
|-------|-----|
| SKU (`produto_id` + `ativo`) | Catálogo |
| Quantidade (FLOOR → integer ≥ 1) | Faixa de tier / min padrao |
| `loja_id` | Filtro tiers (`NULL` global OR = loja) |
| `produtos.preco_varejo` | Fallback |
| `produtos.preco_atacado` | Fallback atacado catálogo |
| `pdv_config.quantidade_minima_atacado_padrao` | Gatilho catálogo |
| `precos_atacado` (ativo, qty min, preco, loja) | Prioridade 1 |

## O que mudou

1. **`calcularPrecoCanonico`** (`shared-core`) = porta TypeScript = migração 250.
2. **Sync Edge:** `preco_atacado` + array `precos_atacado` (global ∪ loja via `x-loja-id` / `DEFAULT_PDV_LOJA_ID` / `PDV_LOJA_ID`) + `quantidade_minima_atacado_padrao`. **Sem** projetar tiers em `regras_preco`.
3. **SQLite:** `preco_atacado`, `precos_atacado_cache`, min padrao + `loja_id` no config.
4. **Runtime Local:** `App` / `recalcularPrecoItemLocal` → canônico. `PricingService` só PROMOCAO.
5. **Golden** Web≡Local com diff=0 (varejo, tiers, catálogo, fracionado, sem atacado).

## Fora de escopo (mantido)

- Venda em espera / cliente  
- BA-012 estoque Local  
- UX não relacionada a preço  
