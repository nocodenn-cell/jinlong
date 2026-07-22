# Financial 100% — auditoria final (piloto)

| Campo | Valor |
|--------|--------|
| **Missão** | Fechamento comercial — Financial |
| **Data** | 2026-07-18 |
| **ADR** | [ADR-010](../adr/ADR-010-financial-domain-boundary.md) |

---

## Arquitetura

```
UI /admin/financeiro
  → facades gerente/financeiro (+ contas-pagar)
  → adapters admin/financeiro (Receivable* · PayablePayment)
  → @shared-core/financial
  → Postgres (contas_receber · RPCs liquidação/pagamento)
```

## Ports / Adapters

| Port | Adapter | Status |
|------|---------|--------|
| `ReceivableWriter` | `receivableWriter.ts` | Wire criar título |
| `ReceivableLiquidationService` | idem | Wire liquidar |
| `PayablePaymentService` | `payablePayment.ts` | Wire pagar/cancelar |
| `PayableReader` | `payableReader.ts` | Wire `buscarContasPagarAction` (2026-07-18) |
| `ReceivableReader` | `receivableReader.ts` | Wire `fetchContasReceberListagem` (2026-07-18) |

## Autoridade

| Conceito | Fonte |
|----------|-------|
| AR/AP | financial |
| Cliente | customers (D-F1: create inline legado) |
| Caixa físico | cash — sem aresta |

## Dívidas

| ID | Severidade | Nota |
|----|------------|------|
| D-F1 | P1 | `criarCliente` no financeiro — não expandir |
| D-F2 | P1 | Dual-layer gerente |
| D-F-READ | — | **Fechado** — PayableReader + ReceivableReader wire |

## Veredito

**GO** — Financial AR/AP pronto para piloto com dívidas P1 documentadas.
