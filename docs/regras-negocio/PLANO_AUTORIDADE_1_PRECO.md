# Plano técnico — Autoridade #1 (preço) · PR #182

**Status:** PLANO ONLY — não implementar neste passo.  
**Objetivo:** `PRICE_RESOLUTION_CHAIN` / RPC `calcular_preco_produto` = única autoridade de preço automático em Web **e** Local.

---

## 1. Mapa — onde o Local usa PricingService / regras_preco

| Ponto | Arquivo | Uso atual |
|-------|---------|-----------|
| Add item | `pdv-local/src/App.tsx` | `pricingService.calcularPrecoItem(..., regrasRef.current, pricingCtx)` |
| Change qty | `pdv-local/src/lib/recalcularPrecoItemLocal.ts` | Idem via `pricingService` |
| Cache regras | `pdv-local/src/hooks/usePdvLocalCatalogo.ts` | `mapRegraPrecoRow` sobre payload sync → `regrasRef` / `setRegras` |
| Mapper | `shared-core/src/caixa/mapRegrasPreco.ts` | `PRODUTO`→`VAREJO`, `CATEGORIA`→`ATACADO` (colapso indevido) |
| Motor | `shared/pricing/PricingService.ts` | ATACADO/PROMOCAO por regras; **sem** fallback catálogo RPC |
| Persistência SQLite | `pdv-local/src-tauri/src/db.rs` | `produtos_cache` (sem `preco_atacado`); `regras_preco_cache`; `pdv_config_cache` (sem min atacado) |
| Sync Edge | `backend/.../sync-outbox/index.ts` `handleCatalogoSync` | produtos **sem** `preco_atacado`; `regras_preco` ativas; **sem** `precos_atacado` (main) |
| Config sync | `handlePdvConfigSync` | gerente/max desconto — **sem** `quantidade_minima_atacado_padrao` no DTO Local tipado |
| Golden | `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` | Exige paridade com RPC, mas via % aproximado / sem catálogo-loja |

**Web (já alinhado à autoridade):**  
`caixaPrecoProduto.impl.ts`, `caixaPrecoAutoritativoServer.ts`, scan `buscarProdutoComPrecoCaixa` → RPC.  
`carregarRegrasPrecoCaixa` → `setRegras` permanece como **caminho morto** para preço (limpeza futura, fora do #182 crítico).

---

## 2. Caminho para PRICE_RESOLUTION_CHAIN única

```
Fase A — Contrato compartilhado
  shared-core (ou shared/pricing):
    calcularPrecoCanonico(produto, tiers, qty, minPadraoCatalogo, lojaId?)
    = porta fiel de calcular_preco_produto (mig 250)
  Exportar/consumir PRICE_RESOLUTION_CHAIN + testes de paridade bit-a-bit com fixtures SQL/RPC.

Fase B — Inputs no sync (mesmos da RPC)
  GET catalogo:
    produtos: + preco_atacado
    precos_atacado: ativo AND (loja_id IS NULL OR loja_id = :device_loja)
    NÃO alimentar motor de ATACADO com regras_preco
  GET pdv_config (ou catalogo):
    + quantidade_minima_atacado_padrao

Fase C — Cache Local (SQLite / DTO)
  produtos_cache.preco_atacado
  nova tabela/faixa precos_atacado_cache (id, produto_id, loja_id, qtd_min, preco_unitario, ativo)
  pdv_config_cache.quantidade_minima_atacado_padrao
  regras_preco_cache: deixar de dirigir preço ATACADO (opcional: manter só se promo futura tiver contrato)

Fase D — Runtime Local
  App.tsx / recalcularPrecoItemLocal → calcularPrecoCanonico
  PricingService: depreciar ramo ATACADO baseado em regras_preco OU reduzir a wrapper do canônico
  Reescrever golden: catálogo, multi-tier, loja, ausência de CATEGORIA no motor

Fase E — Guardrails
  Atualizar pricing-rpc-guard / golden CI
  Fechar/reescrever #182 sob este plano; não mergear o BA-011 parcial atual
```

**Não** reintroduzir `regras_preco` na RPC. Se promoções forem requisito, contrato **novo** alinhado Web/Local — não CATEGORIA→ATACADO.

---

## 3. Migrations / cache / sync necessários

| Camada | Necessário? | Notas |
|--------|-------------|-------|
| Postgres novas tabelas | **Não** para espelho | `precos_atacado`, `produtos.preco_atacado`, `pdv_config` já existem |
| Migration SQL | Só se precisar RPC helper de “export catalogo pricing” | Opcional; sync service_role já lê tabelas |
| Edge `sync-outbox` | **Sim** | Expandir payload; filtrar loja; parar de misturar ATACADO legado |
| SQLite schema | **Sim** | Colunas/tabelas acima (migration local Tauri) |
| `pdv_config` sync | **Sim** | Expor min atacado padrão ao Local |
| Seed/backfill | Auditar se há `regras_preco` CATEGORIA ativas em prod que alteram preço Local hoje | Antes de cortar: inventário + comunicação |

---

## 4. Critério de pronto (Autoridade 1)

- Mesmo SKU + qty + loja → mesmo preço unitário em fixture Web-RPC e Local-canônico.
- `regras_preco` não participa do resultado ATACADO.
- Golden ampliado verde; #182 reescrito ou substituído; matriz P1 atualizada para “Canônica”.

## 5. Fora de escopo (explícito)

- Venda em espera / cliente (Fase 7).
- Estoque Local BA-012.
- Implementação neste commit/plano — só desenho.
