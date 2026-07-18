# Inventário de telas — primeiro cliente (FastProduct)

| Campo | Valor |
|--------|--------|
| **Missão** | Fechamento das telas — Autonomia Total |
| **Data** | 2026-07-18 |
| **App** | `pdv-importados` (piloto web) |
| **Branch base** | `feat/fechamento-comercial-cash-financial` → `feat/screens-100-first-customer` |
| **ADRs** | 005–010 · CAIXA-002 · entity-ssot |

---

## Legenda

| Coluna | Significado |
|--------|-------------|
| **Status** | `100%` · `Parcial` · `Não iniciada` |
| **UI** | Shell/página utilizável |
| **Backend** | Actions / RPCs / SELECT reais (não mock) |
| **Shared-core** | Domínio canônico + ports |
| **Integração** | UI → action → adapter → core → Postgres |
| **Testes** | Unit/adapter e/ou e2e âncora |
| **GO / NO-GO** | Pronto para piloto do 1º cliente nesta rota |

---

## 1. Auth / shell

| Rota | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|------|--------|----|---------|-------------|------------|--------|------------|
| `/login` | 100% | Sim | Auth + `usuarios` | navigation | Canônica | e2e login | **GO** |
| `/` | 100% | Redirect | — | routes | — | — | **GO** |
| `/admin` → dashboard | 100% | Sim | KPIs SELECT | — | Leitura | parcial | **GO** |
| `/admin/dashboard` | 100% | Sim | SELECT multi | — | Leitura | parcial | **GO** |
| `/auth/signout` | 100% | Route | session | — | Canônica | — | **GO** |

---

## 2. Domínios comerciais fechados (Customers / Products / Inventory)

| Rota | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|------|--------|----|---------|-------------|------------|--------|------------|
| `/admin/clientes` | 100% | Sim | CRUD + paginação | `customers` | adapters Reader/Writer/Updater/Exclusion | unit + pattern | **GO** |
| `/admin/catalogo` | 100% | Sim | CRUD + CSV/lote | `products` | adapters + RPC 270 | unit + behavior | **GO** |
| `/admin/catalogo/novo` | 100% | Entrada modal/query | idem | `products` | Canônica | behavior | **GO** |
| `/admin/categorias-produtos` | 100% | Sim | taxonomia | products (satélite) | actions gerente | parcial | **GO** |
| `/admin/fornecedores` | 100% | Sim | CRUD | cadastro (fora writers core) | actions | parcial | **GO** |
| `/admin/estoque` | 100% | Sim | ajuste/kardex | `inventory` | adapters | unit | **GO** |
| `/admin/estoque/recebimento` | 100% | Sim | recebimento | `inventory` | actions | parcial | **GO** |
| `/admin/estoque/transferencias` | 100% | Sim | transferência | `inventory` | actions | parcial | **GO** |
| `/admin/estoque/importar-nfe` | 100% | Sim | RPC NF-e | inventory (+ products) | orquestrador PG | parcial | **GO** |
| `/admin/estoque/imprimir-etiquetas` | 100% | Sim | etiquetas | satélite | actions | parcial | **GO** |
| `/admin/vendas` | 100% | Sim | list/cancel | sales (RPC) | orquestrador PG | e2e cancel | **GO** |

---

## 3. Financeiro (Prioridade 2)

| Rota / capacidade | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|-------------------|--------|----|---------|-------------|------------|--------|------------|
| `/admin/financeiro` (Receber) | 100% | Sim | list/KPI/criar/liquidar | `financial` | Writer/Liquidation/Reader wire | unit adapters + e2e Fase 5b | **GO** |
| Contas a receber — filtros/paginação/KPIs | 100% | Sim | `ReceivableReader` | `financial` | Canônica | unit | **GO** |
| Contas a receber — liquidação | 100% | Sim | RPC `registrar_liquidacao_receber` | `ReceivableLiquidationService` | adapter | unit | **GO** |
| Contas a receber — histórico | 100% | Via listagem + status | SELECT | financial | Canônica | parcial | **GO** |
| `/admin/financeiro/contas-pagar` | 100% | Sim | pagar/cancelar + list | `PayablePaymentService` + `PayableReader` | Canônica | unit | **GO** |
| Contas a pagar — paginação/filtros | 100% | Sim | action → `PayableReader` | `financial` | Canônica | unit | **GO** |
| Cancelamento AP | 100% | Sim | adapter cancel | `PayablePaymentService` | Canônica | parcial | **GO** |
| Aba Fiscal (fila) | 100% | Sim | `documentos_fiscais_*` | autoridade PG | SELECT + reprocess | timeline unit | **GO** |
| `/admin/financeiro/documento/[id]` | 100% | Sim | detalhe + eventos | PG | action admin | parcial | **GO** |
| `/admin/categorias-financeiras` | 100% | Sim | taxonomia | satélite | actions | parcial | **GO** |
| i18n financeiro | Parcial | UI pt/zh | codes core | `financial` errorCodes | borda + legado | parcial | **GO parcial** |
| revalidate paths | 100% | — | admin+gerente | — | actions | — | **GO** |

\* Dívida documentada D-F-READ (readers tipados) e D-F1 (`criarCliente` inline legado — não expandir).

**Dívida bloqueante de domínio novo:** nenhuma para AR/AP operacional.

---

## 4. Caixa / PDV (Prioridade 2)

| Rota / capacidade | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|-------------------|--------|----|---------|-------------|------------|--------|------------|
| `/caixa` — abrir turno | 100% | Sim | INSERT `caixas` | `CashSessionWriter` | adapter | e2e + unit | **GO** |
| `/caixa` — sessão/status | 100% | Sim | reader status | `CashSessionReader` | adapter | unit | **GO** |
| Sangria / suprimento | 100% | Sim | RPC `registrar_movimentacao` | `CashMovementWriter` | adapter | e2e | **GO** |
| Movimentações (timeline) | 100% | Sim | SELECT movs | `CashMovementReader` | adapter | unit | **GO** |
| Aprovar / cancelar / estornar mov | 100% | Sim | RPCs | cash (impl) | RPC PG | e2e | **GO** |
| Fechar caixa | 100% | Sim | `fechar_caixa_atomico` | `CashSessionWriter` | adapter | e2e | **GO** |
| Venda / pagamentos | 100% | Sim | `finalizar_venda_*` | sales + pricing core | orquestrador | e2e golden | **GO** |
| Histórico / auditoria turno | 100% | UI + `/admin/auditoria` | eventos | — | leitura | parcial | **GO** |
| `/admin/diagnostico-caixa` | 100% | Sim | checklist | cash ops | actions | parcial | **GO** |

\* D-C1 (abertura sem RPC) e D-C-MOV (approve ainda no impl) são P1 documentados — não bloqueiam piloto.

---

## 5. Funcionários (Prioridade 2) — GATE ARQUITETURAL

| Rota / capacidade | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|-------------------|--------|----|---------|-------------|------------|--------|------------|
| Cadastro / edição / exclusão de funcionários | **Não iniciada** | **Não existe** | Runbook Auth + SQL `usuarios` | **sem domínio** | fora do app | — | **NO-GO UI** |
| Permissões (perfil) | Parcial | Login/middleware | `usuarios.perfil` | — | enforcement | e2e auth | **GO enforcement** |
| Comissão | Parcial | `/admin/comissoes` + config % | RPC/actions | satélite | UI comissões | parcial | **GO satélite** |
| Histórico de operador | Parcial | vendas/auditoria | SELECT | — | leitura | parcial | **GO leitura** |
| Integração com vendas | 100% | PDV usa `operador_id` | sales RPC | — | Canônica | e2e | **GO** |

**Decisão (interrupção autorizada):** fechar Funcionários “no padrão Customers” exigiria **novo domínio + nova tela + Auth Admin API**. Isso viola as restrições da missão (*não criar funcionalidades novas / não iniciar novos domínios*). Processo canônico vigente: [`docs/RUNBOOK_PRIMEIRO_CLIENTE.md`](../RUNBOOK_PRIMEIRO_CLIENTE.md) (Auth + `public.usuarios`).

---

## 6. Fiscal (Prioridade 2)

| Rota / capacidade | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|-------------------|--------|----|---------|-------------|------------|--------|------------|
| Fila fiscal em `/admin/financeiro?tab=fiscal` | 100% | Sim | `documentos_fiscais_pendentes` | autoridade PG | SELECT + reprocess | timeline unit | **GO** |
| Detalhe documento | 100% | Sim | doc + eventos | PG | action | parcial | **GO** |
| Import NF-e estoque | 100% | `/admin/estoque/importar-nfe` | RPC | inventory | orquestrador | parcial | **GO** |
| Regras fiscais na UI | N/A | — | **proibido reimplementar** | — | Postgres | — | **GO (autoridade PG)** |

---

## 7. Satélites / ops

| Rota | Status | UI | Backend | Shared-core | Integração | Testes | GO / NO-GO |
|------|--------|----|---------|-------------|------------|--------|------------|
| `/admin/comissoes` | 100% | Sim | marcar pagas | satélite | actions | parcial | **GO** |
| `/admin/compras` | 100% | Sim | compras | satélite | actions | parcial | **GO** |
| `/admin/relatorios` | 100% | Sim | agregações | — | leitura | parcial | **GO** |
| `/admin/auditoria` | 100% | Sim | timeline | — | actions | parcial | **GO** |
| `/admin/configuracoes` | 100% | Sim | loja/config | — | actions | parcial | **GO** |
| `/admin/suspensao` | 100% | Sim | licença | — | actions | parcial | **GO** |
| `/demo-fluxo` | Parcial | demo | demo actions | — | não produção | — | **NO-GO prod** |
| `/gerente/*` | 100% | Redirect | — | routes | legado | — | **GO redirect** |

---

## 8. Resumo executivo

| Área | Classificação | Veredito piloto |
|------|---------------|-----------------|
| Customers / Products / Inventory / Vendas | 100% | **GO** |
| Financeiro AR/AP + Fiscal embutido | 100% | **GO** com D-F1 |
| Caixa operacional | 100% | **GO** com D-C1 |
| Comissões / Relatórios / Auditoria | 100% UI operacional | **GO** |
| **Funcionários (CRUD UI)** | **Não iniciada** | **NO-GO** — gate humano/arquitetural |
| Fluxo E2E autenticado completo | Parcial (env) | Homologação humana |

### Critérios de interrupção acionados

1. **Funcionários:** depende de domínio inexistente + UI inexistente; runbook SQL é SSoT atual.
2. Nenhuma regra de negócio conflitante encontrada nos hot-paths Cash/Financial.
3. Sem risco de perda de dados nas migrações de adapters (só relocalização de I/O).

---

## 9. Entregas desta missão

1. ~~Readers Financial~~ — `payableReader` / `receivableReader` wire.
2. ~~CashMovementReader~~ — wire em `obterMovimentacoesCaixaImpl`.
3. Documentos finais: `SCREENS_100_AUDIT.md`, `GO_LIVE_CHECKLIST.md`, `FIRST_CUSTOMER_READINESS.md`.
4. **Não** implementar CRUD de funcionários sem decisão explícita de produto.
