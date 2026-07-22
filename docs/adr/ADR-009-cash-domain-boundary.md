# ADR-009 — Cash: fronteira de domínio e autoridade

| Campo | Valor |
|--------|--------|
| **ID** | ADR-009 |
| **Título** | Fronteira do domínio Cash (turno físico) |
| **Status** | Aceito |
| **Data** | 2026-07-18 |
| **Missão** | Fechamento comercial — Cash |
| **Relacionados** | ADR-005 · ADR-CAIXA-002 · ADR-008 · [inventario_cash_autoridade.md](../architecture/inventario_cash_autoridade.md) |

---

## Decisão

### 1. Owns

| Owns | Inclui |
|------|--------|
| Sessão de caixa | `caixas` (abrir/fechar) |
| Contador físico | `saldo_atual` (via movs / efeitos sales-led documentados) |
| Movimentações | `movimentacoes_caixa` (sangria/suprimento/estorno) |
| Esperado \(E(c)\) | Leitura via `calcular_valor_sistema_dinheiro_caixa` |

### 2. Não owns

| Não owns | Dono |
|----------|------|
| `vendas_pagamentos` | sales |
| Contas a receber/pagar | financial |
| Estoque | inventory |
| Helpers PDV barcode/preço | `shared-core/caixa` (utilitário — **não** é o domínio `cash/`) |

### 3. Fonte de verdade

| Conceito | Fonte |
|----------|-------|
| Esperado fechamento | Postgres \(E(c)\) — ADR-CAIXA-002 |
| Contador físico | `caixas.saldo_atual` |
| Histórico movs | `movimentacoes_caixa` |

### 4. Contracts futuros (implementados na mesma trilha)

| Port | Responsabilidade |
|------|------------------|
| `CashSessionReader` | Status / \(E(c)\) |
| `CashSessionWriter` | Abrir / fechar |
| `CashMovementWriter` | Registrar / aprovar / cancelar / estornar mov |
| `CashMovementReader` | Listar movs do turno |

### 5. Pasta

`@fastproduct/shared-core/src/cash/` — **não** confundir com `shared-core/src/caixa/` (helpers PDV).

---

## GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Aceitar ADR-009 | **GO** |
| Scaffold + adapters na trilha comercial | **GO** |
| Misturar financial em cash | **NO-GO** |
