# Cash 100% — auditoria final (piloto)

| Campo | Valor |
|--------|--------|
| **Missão** | Fechamento comercial — Cash |
| **Data** | 2026-07-18 |
| **ADR** | [ADR-009](../adr/ADR-009-cash-domain-boundary.md) · [ADR-CAIXA-002](../adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md) |

---

## Arquitetura

```
UI /caixa
  → actions (caixa/actions.ts)
  → impl (caixaSessaoOperador / caixaMovimentacoes)
  → adapters cashSession · cashMovementWriter
  → @shared-core/cash
  → Postgres (INSERT caixas · fechar_caixa_atomico · registrar_movimentacao · …)
```

## Ports / Adapters

| Port | Adapter | Status |
|------|---------|--------|
| `CashSessionReader` | `cashSession.ts` | Wire status |
| `CashSessionWriter` | `cashSession.ts` | Wire abrir/fechar |
| `CashMovementWriter` | `cashMovementWriter.ts` | Wire registrar |
| `CashMovementReader` | `cashMovementReader.ts` | Wire `obterMovimentacoesCaixaImpl` (2026-07-18) |

## Autoridade

| Conceito | Fonte |
|----------|-------|
| \(E(c)\) | `calcular_valor_sistema_dinheiro_caixa` |
| `saldo_atual` | movs + efeitos sales-led |
| Pagamentos venda | **sales** — não cash |

## Dívidas

| ID | Severidade | Nota |
|----|------------|------|
| D-C1 | P1 | Abertura INSERT (não RPC) |
| D-C-MOV-R | — | **Fechado** — CashMovementReader + DTO path único |
| D-C3 | P2 | revalidate path legado |

## Veredito

**GO** — Cash operacional pronto para piloto (contrato ADR-CAIXA-002 preservado).
