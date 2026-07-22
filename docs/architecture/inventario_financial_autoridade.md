# Inventário Financial — entidades e autoridade

| Campo | Valor |
|--------|--------|
| **Missão** | Financial 0 — Inventário e autoridade |
| **Data** | 2026-07-18 |
| **ADRs** | ADR-005 · entity-ssot · ADR-CAIXA-002 (fronteira cash) |
| **Escopo** | Contas a receber/pagar, liquidações, comissões, fiscal UI — **não** caixa físico |

---

## 1. Diagnóstico executivo

Financial é o domínio de **títulos e liquidações** (AR/AP), com satélites: comissões, categorias financeiras e fila fiscal na UI `/admin/financeiro`.

| Dimensão | Estado | Implicação |
|----------|--------|------------|
| UI SSoT | `/admin/financeiro` (+ abas pagar/fiscal) | entity-ssot |
| Writers TS | `gerente/financeiro/*` | Dual-layer admin ↔ gerente |
| Caixa físico | **Não** owns | cash |
| Pagamentos na venda | **sales** | Criação CR parcial via RPC venda (Fase 5b) |
| `shared-core/financial` | Inexistente | Scaffold Missão Financial 2 |

---

## 2. Entidades

| Entidade | Artefato | Dono |
|----------|----------|------|
| Título a receber | `contas_receber` | financial |
| Liquidação AR | `liquidacoes_receber` + RPC | financial |
| Conta a pagar | `contas_pagar` | financial |
| Pagamento AP | RPC `registrar_pagamento_contas_pagar` | financial |
| Categorias | `categorias_financeiras` | financial (satélite) |
| Comissões | RPCs `resumo_*` / `marcar_comissoes_pagas` | financial (satélite) |
| Fila fiscal | `documentos_fiscais_*` | fiscal (UI no financeiro) |

---

## 3. Writers

| Caminho | Mecanismo | App entry |
|---------|-----------|-----------|
| Criar título AR | INSERT `contas_receber` | `criarTituloReceber` |
| Liquidar AR | RPC `registrar_liquidacao_receber` | `liquidarTitulo` |
| Pagar AP | RPC `registrar_pagamento_contas_pagar` | `registrarPagamentoAction` |
| Cancelar AP | UPDATE status | `cancelarContaPagarAction` |
| Comissões pagas | RPC `marcar_comissoes_pagas` | `marcarComissoesPagas` |
| Cliente inline | INSERT `clientes` | `criarCliente` — **dívida entity-ssot** |
| CR na venda parcial | RPC venda | sales-led |

---

## 4. Fronteiras

| Domínio | Relação |
|---------|---------|
| Customers | Identidade do cliente — create oficial em `/admin/clientes` |
| Cash | Sem aresta de escrita |
| Sales | Pode criar título AR na finalização parcial |
| Inventory | Sem aresta |

---

## 5. Dívidas

| ID | Descrição | Severidade |
|----|-----------|------------|
| D-F1 | `criarCliente` no financeiro viola entity-ssot | Alta (migração) |
| D-F2 | Dual-layer gerente actions | Alta (migração) |
| D-F3 | Commission RPCs fora de `database.types.ts` | Média |
| D-F4 | Fiscal misturado na UI financeiro | Aceitável piloto |

---

## 6. GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Congelar inventário Financial | **GO** |
| Prosseguir ADR-010 + scaffold | **GO** |
| Cash dono de AR/AP | **NO-GO** |
| Financeiro criar cliente completo (código novo) | **NO-GO** (legado D-F1) |
