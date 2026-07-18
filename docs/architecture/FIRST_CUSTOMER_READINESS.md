# First Customer Readiness — FastProduct

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Missão** | Fechamento das telas — Autonomia Total |
| **Branch** | `feat/screens-100-first-customer` |
| **Docs irmãos** | [screens_inventory.md](./screens_inventory.md) · [SCREENS_100_AUDIT.md](./SCREENS_100_AUDIT.md) · [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) |

---

## 1. Funcionalidades existentes

Arquitetura oficial de domínios ligada às telas canônicas:

```
Login → Admin/PDV
  Clientes (customers)
  Catálogo (products)
  Estoque (inventory)
  Caixa + venda (cash + sales RPC)
  Financeiro AR/AP + fiscal (financial + PG)
  Comissões / Relatórios / Auditoria
```

Provisionamento de loja e usuários: **manual** ([RUNBOOK_PRIMEIRO_CLIENTE.md](../RUNBOOK_PRIMEIRO_CLIENTE.md)).

## 2. Funcionalidades homologadas

| Domínio / tela | Homologação | Notas |
|----------------|-------------|-------|
| Customers | 100% | Adapters Reader/Writer/Updater/Exclusion |
| Products | 100% | RPC 270 único create |
| Inventory | 100% | Adapters leitura/escrita |
| Cash | GO piloto | Session + Movement writer/reader |
| Financial | GO piloto | Writer/Liquidation/Payment + Readers |
| Fiscal (fila/detalhe/NF-e) | GO | Autoridade Postgres preservada |
| Fluxo operacional mapeado | Parcial e2e | Specs âncora em `fluxo_operacional_prova.md` |

### Evidência objetiva desta missão

- `ReceivableReader` / `PayableReader` em shared-core + adapters admin
- `CashMovementReader` + DTO path único para timeline
- Inventário de rotas com GO/NO-GO por tela
- Typecheck + guard:domain + vitest readers verdes

## 3. Pendências

1. **Gate Funcionários:** sem tela CRUD; runbook permanece SSoT.
2. Dívidas P1 documentadas (D-F1, D-C1, i18n catálogo cash/financial).
3. Homologação humana do checklist go-live no ambiente do cliente.
4. Colocation `gerente/` → `admin/` (dívida estrutural, não bloqueia piloto).

## 4. Riscos

| Risco | Impacto | Status |
|-------|---------|--------|
| Esperar self-service de funcionários | Operação / suporte | **Ativo — gate** |
| Conta Auth sem linha `usuarios` | Login impossível | Mitigado no código |
| Caminhos paralelos nos hot-paths | Drift | Hot-paths migrados; legado dual-layer documentado |
| E2E sem credenciais | Falsa sensação de cobertura | Documentado |

## 5. GO / NO-GO

| Pergunta | Resposta |
|----------|----------|
| Telas críticas de operação (exceto CRUD funcionários) estão funcionais, integradas e no caminho canônico? | **GO** |
| O sistema permite onboarding 100% self-service sem Auth/SQL? | **NO-GO** |
| Pronto para primeiro cliente com aceite do runbook de usuários? | **GO CONDICIONAL** |

### Decisão final

**GO CONDICIONAL para o primeiro cliente.**

Condições:

1. Checklist humano em [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) §3 assinado.
2. Usuários provisionados exclusivamente via runbook.
3. E2E críticos de caixa executados no ambiente alvo (ou aceite de risco documentado).
4. Nenhuma exigência de UI de funcionários nesta release.

**Interromper / não declarar GO pleno** se o cliente exigir cadastro de funcionários na UI — isso é **nova feature + novo domínio**, fora do escopo desta missão.
