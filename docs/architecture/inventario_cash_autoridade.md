# Inventário Cash — entidades e autoridade

| Campo | Valor |
|--------|--------|
| **Missão** | Cash 0 — Inventário e autoridade |
| **Data** | 2026-07-18 |
| **ADRs** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-CAIXA-002](../adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md) |
| **Escopo** | Diagnóstico factual — base para ADR-009 e scaffold `shared-core/cash` |

---

## 1. Diagnóstico executivo

Cash é o dono do **turno de caixa físico**: sessão (`caixas`), contador físico (`saldo_atual`), sangria/suprimento (`movimentacoes_caixa`) e leitura do esperado \(E(c)\).

| Dimensão | Estado | Implicação |
|----------|--------|------------|
| UI operacional | `/caixa` | Abertura/fechamento/movs no PDV |
| Autoridade \(E(c)\) | RPC `calcular_valor_sistema_dinheiro_caixa` | ADR-CAIXA-002 — nunca `saldo_atual` como esperado |
| Pagamentos de venda | **sales** (`vendas_pagamentos`) | Cash **não** owns |
| AR/AP | **financial** (satélite) | Separado |
| `shared-core/cash` | Inexistente (só helpers `shared-core/caixa`) | Scaffold na Missão Cash 2 |

---

## 2. Entidades

| Entidade | Artefato | Dono |
|----------|----------|------|
| Sessão de caixa | `caixas` | cash |
| Contador físico | `caixas.saldo_atual` | cash (A) |
| Esperado fechamento \(E(c)\) | função Postgres | cash (B) — leitura |
| Movimentações | `movimentacoes_caixa` | cash (D) |
| Pagamentos venda | `vendas_pagamentos` | **sales** (C) |

---

## 3. Writers

| Caminho | Mecanismo | App entry |
|---------|-----------|-----------|
| Abrir caixa | INSERT `caixas` | `abrirCaixaOperadorImpl` |
| Fechar caixa | RPC `fechar_caixa_atomico` | `fecharCaixaOperadorImpl` |
| Status | RPC `obter_status_caixa_operador` | `obterStatusCaixaOperadorImpl` |
| Registrar mov | RPC `registrar_movimentacao` | `registrarMovimentacaoImpl` |
| Aprovar mov | RPC `aprovar_movimentacao` | `autorizarMovimentacaoGerenteImpl` |
| Cancelar/estornar mov | RPCs respectivas | `caixaMovimentacoes.impl.ts` |
| `saldo_atual` pós-venda | sales-led cancel/devolver | **não** path cash app |

---

## 4. Fronteiras

| Domínio | Relação |
|---------|---------|
| Sales | Solicita efeito em `saldo_atual` no cancel/devolver; owns pagamentos |
| Inventory | Sem aresta |
| Financial | AR/AP independente do turno físico |
| Products | Sem aresta |

---

## 5. Dívidas

| ID | Descrição | Severidade |
|----|-----------|------------|
| D-C1 | Abertura = INSERT direto (não RPC) | Média |
| D-C2 | `recalcular_saldo_caixa` não usar em prod | Controlada |
| D-C3 | Revalidate `/gerente/caixas` (path legado) | Baixa |
| D-C4 | Helpers em `shared-core/caixa` ≠ pasta `cash/` | Naming — documentar |

---

## 6. GO / NO-GO

| Decisão | Resultado |
|---------|-----------|
| Congelar inventário Cash | **GO** |
| Prosseguir ADR-009 + scaffold | **GO** |
| Misturar AR/AP em cash | **NO-GO** |
| Tratar `saldo_atual` como \(E(c)\) | **NO-GO** |
