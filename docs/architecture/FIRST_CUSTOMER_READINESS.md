# First Customer Readiness — FastProduct

> **2026-08-27:** snapshot de 18/07. SHA atual do piloto: `e1327e62`.
> [piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](../piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).

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

Provisionamento de loja + DONO: wizard interno `/admin/provisionamento` (ADMIN). Demais usuários: `/admin/funcionarios`. Fallback SQL: [RUNBOOK_PRIMEIRO_CLIENTE.md](../RUNBOOK_PRIMEIRO_CLIENTE.md).

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

1. Dívidas P1 documentadas (D-F1, D-C1, i18n catálogo cash/financial).
2. Homologação humana do checklist go-live no ambiente do cliente (`/admin/implantacao`).
3. Colocation `gerente/` → `admin/` (dívida estrutural, não bloqueia piloto).

## 4. Riscos

| Risco | Impacto | Status |
|-------|---------|--------|
| Conta Auth sem linha `usuarios` | Login impossível | Mitigado (wizard + login bloqueia) |
| Dados de teste na loja do cliente | Operação | Mitigado — loja nova no wizard |
| Caminhos paralelos nos hot-paths | Drift | Hot-paths migrados; legado dual-layer documentado |
| E2E sem credenciais | Falsa sensação de cobertura | Documentado |

## 5. GO / NO-GO

| Pergunta | Resposta |
|----------|----------|
| Telas críticas de operação + funcionários + provisionamento estão no caminho canônico? | **GO** |
| Onboarding de loja+DONO sem SQL/Studio (equipe ADMIN)? | **GO** (`/admin/provisionamento`) |
| Pronto para primeiro cliente com checklist `/admin/implantacao`? | **GO** (Fase 1 encerrada) |

### Decisão final

**GO para Fase 1.** Homologar o primeiro cliente com checklist humano em [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) §3 e autorização GO-LIVE na UI.

Próximo: **Fase 2 — UX/UI Freeze** (sem funcionalidade nova / sem mudança de domínio).
