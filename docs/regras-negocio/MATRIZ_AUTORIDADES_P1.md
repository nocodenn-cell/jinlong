# Matriz de autoridades P1 (núcleo PDV)

| # | Conceito | Autoridade | Web | Local | Status |
|---|----------|------------|-----|-------|--------|
| 1 | Preço atacado (automático) | `calcular_preco_produto` ≡ `PRICE_RESOLUTION_CHAIN` / `calcularPrecoCanonico` | RPC | Canônico offline + sync | **Mergeada e validada (#182)** |
| 2 | Pagamento parcial / CR | Fase 5b (RPC + UI) / `caixaPagamentoSaldo` | Web | — | **#180** — merge pendente (CI billing) |
| 3 | Fechamento Local | `fechar_caixa_pdv_atomico` via sync-outbox | — | Local | **Mergeada (#181)** |

`regras_preco` **não** é SSoT de atacado automático.

> Esta matriz cobre o **preço automático** (Autoridade #1). O **preço final** completo
> (automático + desconto manual + desconto de gerente + travas), incluindo tetos,
> travas e exceções Web/Local, é definido no contrato canônico
> [MATRIZ_PRECO_FINAL.md](./MATRIZ_PRECO_FINAL.md).
