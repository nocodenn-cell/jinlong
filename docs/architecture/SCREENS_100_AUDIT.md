# SCREENS 100% — auditoria de telas (primeiro cliente)

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Branch** | `feat/screens-100-first-customer` |
| **Inventário** | [screens_inventory.md](./screens_inventory.md) |
| **Domínios** | Customers · Products · Inventory · Cash · Financial (ADR-005–010) |

---

## 1. Funcionalidades existentes (críticas)

| Módulo | Telas / capacidades |
|--------|---------------------|
| Auth | Login, bloqueio conta inativa/sem loja, signout |
| Clientes | CRUD paginado `/admin/clientes` |
| Produtos | Catálogo + taxonomia + estoque inicial (RPC 270) |
| Estoque | Ajuste, recebimento, transferência, NF-e, etiquetas |
| Vendas | PDV `/caixa` + cancelamento `/admin/vendas` |
| Financeiro | AR/AP unificado, liquidação, pagamento, cancelamento AP, KPIs, filtros, fiscal |
| Caixa | Abrir/fechar, sangria/suprimento, movs, venda |
| Fiscal | Fila + detalhe em financeiro; import NF-e em estoque |
| Comissões | Listagem + marcar pagas |
| Relatórios / Auditoria / Config | Telas operacionais de leitura/config |

---

## 2. Funcionalidades homologadas (caminho canônico)

Evidência: adapters + shared-core + testes unitários desta missão + audits de domínio.

| Fluxo | Caminho | Evidência |
|-------|---------|-----------|
| Cliente CRUD | UI → actions → customers adapters → core → PG | `admin/clientes/*` · customers 100 |
| Produto CRUD | UI → products adapters → RPC 270 | products_100_audit |
| Estoque | UI → inventory adapters → RPCs | inventory_100_audit |
| AR criar/liquidar | UI → `receivableWriter` → core → INSERT/RPC | unit + e2e Fase 5b |
| AR listar | UI → `receivableReader` → core → SELECT | unit (esta missão) |
| AP pagar/cancelar | UI → `payablePayment` → RPC/UPDATE | unit |
| AP listar | UI → `payableReader` → SELECT | unit (esta missão) |
| Caixa sessão | UI → `cashSession` → INSERT/`fechar_caixa_atomico` | unit + e2e |
| Caixa movs write | UI → `cashMovementWriter` → `registrar_movimentacao` | unit |
| Caixa movs read | UI → `cashMovementReader` → SELECT | unit (esta missão) |
| Fiscal fila/detalhe | UI → SELECT `documentos_fiscais_*` (autoridade PG) | UI + timeline tests |
| Venda | UI → `finalizar_venda_*` | e2e golden |

---

## 3. Pendências

| ID | Item | Severidade | Ação |
|----|------|------------|------|
| **G-FUNC** | UI CRUD Funcionários inexistente | **Gate** | Runbook Auth+SQL; decidir domínio Users se produto exigir |
| D-F1 | `criarCliente` inline no financeiro | P1 | Não expandir; usar `/admin/clientes` |
| D-C1 | Abertura de caixa via INSERT (não RPC) | P1 | Documentado ADR-009 |
| D-i18n-CF | Catálogo completo codes cash/financial | P1 | Mensagens legadas na borda |
| Dual-layer | Actions ainda sob `app/gerente/*` | P2 | Colocation gradual — sem mudança de comportamento |
| E2E full | Fluxo autenticado ponta a ponta | P1 env | Requer credenciais Playwright no ambiente |

---

## 4. Riscos

| Risco | Mitigação |
|-------|-----------|
| Contas de loja criadas fora do runbook | `docs/RUNBOOK_PRIMEIRO_CLIENTE.md` |
| Expandir CRUD inline no financeiro | Entity-ssot + D-F1 |
| Reimplementar regra fiscal na UI | Proibido — autoridade Postgres |
| Assumir GO sem e2e de caixa no ambiente do cliente | Checklist humano + e2e críticos |

---

## 5. GO / NO-GO por módulo

| Módulo | Veredito |
|--------|----------|
| Customers / Products / Inventory / Vendas | **GO** |
| Financeiro AR/AP + Fiscal embutido | **GO** |
| Caixa operacional | **GO** |
| Comissões / Relatórios / Auditoria | **GO** |
| **Funcionários (CRUD em tela)** | **GO** (`/admin/funcionarios` + `/admin/provisionamento`) |
| Sistema completo “zero intervenção humana no provisionamento” | **GO** para piloto (wizard ADMIN + UI funcionários) |

### Veredito consolidado de telas críticas operacionais

**GO operacional** para o primeiro cliente com provisionamento pela UI (`/admin/provisionamento` + `/admin/funcionarios`). Homologação humana (P0-HOM) permanece obrigatória — ver [GO_LIVE_READINESS.md](./GO_LIVE_READINESS.md).
