# ADR-010 — Financial: fronteira de domínio e autoridade

| Campo | Valor |
|--------|--------|
| **ID** | ADR-010 |
| **Título** | Fronteira do domínio Financial (AR/AP + satélites) |
| **Status** | Aceito |
| **Data** | 2026-07-18 |
| **Missão** | Fechamento comercial — Financial |
| **Relacionados** | ADR-005 · ADR-009 · entity-ssot · [inventario_financial_autoridade.md](../architecture/inventario_financial_autoridade.md) |

---

## Decisão

### 1. Owns

| Owns | Inclui |
|------|--------|
| Contas a receber | `contas_receber`, liquidações |
| Contas a pagar | `contas_pagar`, pagamentos |
| Satélites | categorias financeiras, comissões (marcar pago) |
| UI SSoT | `/admin/financeiro` |

### 2. Não owns

| Não owns | Dono |
|----------|------|
| Turno / `saldo_atual` / \(E(c)\) | cash |
| Cadastro completo de cliente | customers |
| Cadastro fornecedor | suppliers (UI `/admin/fornecedores`) |
| Pagamentos da venda | sales |

### 3. Contracts

| Port | Responsabilidade |
|------|------------------|
| `ReceivableReader` | Listagem / KPIs AR |
| `ReceivableWriter` | Criar título |
| `ReceivableLiquidationService` | Liquidar via RPC |
| `PayableReader` | Listagem AP |
| `PayablePaymentService` | Pagar / cancelar AP |

### 4. Exceções

- CR criado na finalização parcial de venda = **sales-led** (RPC venda).
- `criarCliente` em `gerente/financeiro` = **legado D-F1** — não expandir; preferir `/admin/clientes`.

---

## GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Aceitar ADR-010 | **GO** |
| Scaffold + adapters | **GO** |
| Financial dono de caixa | **NO-GO** |
