# Arquitetura — PDV Importados

## Camadas

| Pasta | Papel |
|-------|--------|
| **`core/`** | Domínio puro: preços, carrinho (tipos), vendas/caixa (esboço), portas e serviços. Sem React, Next ou Supabase. |
| **`lib/adapters/`** | Implementações de infraestrutura (ex.: `supabase/produtoRepository.ts`). |
| **`lib/supabase/`** | Clientes browser/server Supabase. |
| **`app/`** | Next.js App Router: páginas e Server Actions (orquestram auth + serviços + adapters). |
| **`stores/`** | Estado UI (Zustand) — importa apenas `core/`. |

## Futuro: PDV desktop (Tauri)

- Reutilizar **`core/**`** (pricing, cart, vendas, caixa).
- SQLite local + fila de sync → ver **`core/sync/TAURI_SYNC.md`**.

## Imports recomendados

- Motor de preço: `@/core/pricing/PricingService`.
- Tipos de carrinho: `@/core/cart/types`.
- Novo caso de uso produto: `criarProdutoComEstoque` + `createProdutoRepository(supabase)`.
