# Matriz de autoridades P1 (núcleo PDV)

| # | Conceito | Autoridade | Web | Local | Status |
|---|----------|------------|-----|-------|--------|
| 1 | Preço atacado (automático) | `calcular_preco_produto` ≡ `PRICE_RESOLUTION_CHAIN` / `calcularPrecoCanonico` | RPC | Canônico offline + sync dados | **Implementada (#182)** — validar CI/merge |
| 2 | Pagamento parcial / CR | Fase 5b (RPC + UI) | `caixaPagamentoSaldo` | — | Ver #180 |

`regras_preco` **não** é SSoT de atacado automático.
