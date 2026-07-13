# Plano técnico — Autoridade #1 (preço) · PR #182

**Status:** PLANO ONLY — não implementar código. **#182 permanece bloqueada.**  
**Objetivo:** `PRICE_RESOLUTION_CHAIN` / RPC `calcular_preco_produto` = única autoridade de preço automático em Web **e** Local.

> **Observação (migrations):** Migration Postgres **não é necessária** identificada neste momento; confirmar após inventário completo dos inputs da RPC (secção 2 — inventário fechado abaixo; nenhuma lacuna exigiu nova tabela/coluna no Postgres).

---

## 1. Mapa — onde o Local usa PricingService / regras_preco

| Ponto | Arquivo | Uso atual |
|-------|---------|-----------|
| Add item | `pdv-local/src/App.tsx` | `pricingService.calcularPrecoItem(..., regrasRef.current, pricingCtx)` |
| Change qty | `pdv-local/src/lib/recalcularPrecoItemLocal.ts` | Idem via `pricingService` |
| Cache regras | `pdv-local/src/hooks/usePdvLocalCatalogo.ts` | `mapRegraPrecoRow` sobre payload sync → `regrasRef` / `setRegras` |
| Mapper | `shared-core/src/caixa/mapRegrasPreco.ts` | `PRODUTO`→`VAREJO`, `CATEGORIA`→`ATACADO` (colapso indevido) |
| Motor | `shared/pricing/PricingService.ts` | ATACADO/PROMOCAO por regras; **sem** fallback catálogo RPC; usa qty decimal direta |
| Persistência SQLite | `pdv-local/src-tauri/src/db.rs` | `produtos_cache` (sem `preco_atacado`); `regras_preco_cache`; `pdv_config_cache` (sem min atacado); **sem** `loja_id` do device |
| Sync Edge | `backend/.../sync-outbox/index.ts` `handleCatalogoSync` | produtos **sem** `preco_atacado`; `regras_preco` ativas; **sem** `precos_atacado` |
| Config sync | `handlePdvConfigSync` | só `gerente_id`, `max_desconto_gerente_percentual` |
| Golden | `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` | Exige paridade; aproxima tiers via %; sem catálogo/loja |

**Web (já alinhado):** `caixaPrecoProduto.impl` / `caixaPrecoAutoritativoServer` / scan → RPC.  
`carregarRegrasPrecoCaixa` → `setRegras` = caminho morto para preço (limpeza futura).

---

## 2. Inventário — inputs da `PRICE_RESOLUTION_CHAIN` / RPC

RPC `calcular_preco_produto(p_produto_id, p_quantidade integer, p_loja_id)` — migração 250.

| Input consolidado | O que a RPC usa | Origem Web | Existe no Local hoje? | Lacuna |
|-------------------|-----------------|------------|----------------------|--------|
| **SKU** | `produtos.id` + `ativo=true` | Auth + catálogo online | `produtos_cache.id`, `ativo` | Parcial OK |
| **Quantidade** | `p_quantidade` **integer** via `quantidadeParaRpcPreco` = `max(1, floor(q))` | `caixaPrecoProduto.impl` | PricingService usa qty decimal **sem** FLOOR | **Ausente** — risco de faixa diferente em fracionados |
| **Loja** | `p_loja_id` filtra `precos_atacado` (`NULL` global OR `= loja`) | `getUsuarioAtual` / `LOJA_MATRIZ_ID` | Sem `loja_id` no sync/cache/device tipado | **Ausente** |
| **Catálogo varejo** | `produtos.preco_varejo` | Postgres | `produtos_cache.preco_varejo` | OK |
| **Catálogo atacado** | `produtos.preco_atacado` + `pdv_config.quantidade_minima_atacado_padrao` | Postgres | **Nem** no SELECT sync **nem** no SQLite/DTO config | **Ausente** |
| **Tiers** | `precos_atacado` (`preco_unitario`, `quantidade_minima`, `loja_id`, `ativo`) | Postgres | **Não** sincronizado | **Ausente** |
| **Preço atacado (resultado)** | Saída absoluta do tier ou do catálogo | RPC | Local só desconto %/fixo via regras | Algoritmo errado |
| **Vigência** | Só `produtos.ativo` e `precos_atacado.ativo` — **sem** `data_validade` na cadeia | — | Local aplica `data_validade` de `regras_preco` (fora da cadeia) | Ruído; não faz parte da SSoT |
| **Regras aplicáveis (SSoT)** | **Não** usa `regras_preco` | — | Local alimenta motor com `regras_preco` | **Divergência estrutural** |

### 2.1 Comparativo Local detalhado

| Camada | O que há | O que falta para paridade |
|--------|----------|---------------------------|
| **sync-outbox `catalogo`** | `preco_varejo`, regras_preco | `preco_atacado`; lista `precos_atacado` (global ∪ loja device); opcional filtrar regras do motor ATACADO |
| **sync-outbox `pdv_config`** | gerente / max desconto | `quantidade_minima_atacado_padrao` |
| **SQLite `produtos_cache`** | id, nome, barras, varejo, cat, ativo… | coluna `preco_atacado` |
| **SQLite** | `regras_preco_cache` | tabela `precos_atacado_cache`; `pdv_config_cache.quantidade_minima_atacado_padrao`; `loja_id` do device |
| **Payload TS/Rust DTO** | `ProdutoSupabaseRow` sem atacado | Campos acima + `EdgeCatalogoResponse.precos_atacado?` |
| **PricingService / mapper** | Motor paralelo + CATEGORIA→ATACADO | Substituir por porta canônica; não usar regras_preco para ATACADO |
| **Qty** | decimal direto | Espelhar `quantidadeParaRpcPreco` antes da cadeia |

### 2.2 Tabelas/campos necessários

| Onde | Mudança |
|------|---------|
| **Postgres** | Nenhuma nova tabela/coluna identificada (já existem `precos_atacado`, `produtos.preco_atacado`, `pdv_config.quantidade_minima_atacado_padrao`). |
| **Edge sync** | Expandir SELECTs/payload; aceitar `loja_id` do device (header/query). |
| **SQLite + Rust DTO** | Colunas/tabelas listadas em 2.1. |
| **shared-core** | `calcularPrecoCanonico` + testes = migração 250. |

### 2.3 Riscos de paridade Web ≡ Local

1. Tiers por loja omitidos → preço global ≠ loja no Web.  
2. Fallback catálogo omitido → Local em varejo enquanto Web em ATACADO_CATALOGO.  
3. `regras_preco` CATEGORIA aplicando “ATACADO” só no Local.  
4. Qty fracionada sem FLOOR → faixa errada.  
5. Device sem `loja_id` → impossível filtrar tiers.  
6. Golden atual mascara drift (converte tier absoluto em %).

---

## 3. Caminho para PRICE_RESOLUTION_CHAIN única

```
Fase A — calcularPrecoCanonico (porta RPC 250) + testes bit-a-bit
Fase B — sync: preco_atacado + precos_atacado(global|loja) + min_padrao; loja do device
Fase C — SQLite/DTO espelham inputs; regras_preco fora do motor ATACADO
Fase D — App/recalcular → canônico; deprecar ramo ATACADO do PricingService
Fase E — golden ampliado; reescrever #182; matriz P1 → Canônica
```

---

## 4. Critério de pronto (Autoridade 1 — definição, antes de implementar)

- [x] Algoritmo único definido (`PRICE_RESOLUTION_CHAIN` / RPC 250).  
- [x] Dados/inputs inventariados (secção 2).  
- [x] Caminho de migração (sync → cache → runtime) definido (Fases A–E).  
- [ ] Implementação (próximo ciclo, pós-#180 na main).

## 5. Fora de escopo

- Venda em espera / cliente (Fase 7).  
- Estoque Local BA-012.  
- Qualquer código neste passo.
