# UI/UX RFC — decisões arquiteturais

| Campo | Valor |
|--------|--------|
| **Projeto** | Jīn Lóng ERP / FastProduct |
| **Início** | 2026-08-07 (Sprint 1) |
| **Regra** | Toda decisão relevante de consolidação/eliminação/reorganização de tela registra-se aqui **antes ou junto** da implementação. |

---

## RFC-UX-001 — Aceite Sprint 0 e abertura Sprint 1

| | |
|--|--|
| **Status** | Aceito |
| **Data** | 2026-08-07 |
| **Contexto** | Sprint 0 entregou primitivos SSOT + IX-CONFIRM/SHEET/LOOKUP; DoD técnico completo. |
| **Decisão** | Sponsor assina DoD §3.3; Sprint 0 **ENCERRADA**; Sprint 1 **ABERTA** no Engineering Loop (hot-path). |
| **Não-fazer** | Abrir Sprint 2 antes do fechamento documentado da Sprint 1. |

---

## RFC-UX-002 — Vendas: FilterBar canônico + empty/erro DS (não fundir com Dashboard)

| | |
|--|--|
| **Status** | Aceito · Sprint 1 |
| **Problema** | Params `status`/`pagamento` já filtravam no servidor, mas a UI só expunha pills de período. Empty usava emoji ad hoc; erro era `div` raw. Título da lista fixo em “Vendas hoje” mentia o período. |
| **Consolidar?** | **Não.** Dashboard = overview; Vendas = lookup operacional + KPIs do filtro + detalhe/cancelamento. Fundir aumentaria densidade sem job único. |
| **Arquitetura** | `PageShell` + `FilterBar` (periodo / status / pagamento) + `ErrorState` + `EmptyState` na tabela; título da lista = rótulo do período ativo. |
| **Impacto / risco / ganho** | Baixo risco (URL já wired). Alto ganho: achar venda cancelada/PIX sem hack de URL; zero mentira de período. |
| **IDs** | UX-P0-01, UX-P0-02 |

---

## RFC-UX-003 — Catálogo: 1 CTA primário + menu Importar (sem nova rota)

| | |
|--|--|
| **Status** | Aceito · Sprint 1 |
| **Problema** | Quatro CTAs no header (NF-e, CSV, Export, Novo), dois `primary` — operador não tem hierarquia. Actions estavam no slot `filters`. |
| **Consolidar?** | Import CSV permanece modal na tela; Import NF-e continua link para `/admin/estoque/importar-nfe` (Entity-SSOT). Não criar tela de “hub importação”. |
| **Arquitetura** | `PageShell` + `CrudListShell`; **Novo** = único `primary`; **Importar** = secondary com menu (NF-e + CSV); Export secondary. Hint de volume vira `InlineAlert` info, não faixa solta. |
| **Impacto / risco / ganho** | Baixo risco. Menos ruído visual e menos cliques errados no hot-path de cadastro. |
| **IDs** | UX-P1-06, UX-P1-07 |

---

## RFC-UX-004 — Transferências: lookup async real (eliminar payload 500)

| | |
|--|--|
| **Status** | Aceito · Sprint 1 |
| **Problema** | `EntityLookup` filtrava client-side sobre 500 produtos pré-carregados — catálogo maior fica invisível; risco de produto errado. |
| **Consolidar?** | Tela permanece (job: mover saldo entre lojas). Não misturar com Recebimento (job diferente: conferência de remessa). |
| **Arquitetura** | `buscarProdutosTransferencia` server-side (como recebimento); page carrega só lojas; meta unidade/limite continua via RPC de estoque. `PageShell` + breadcrumb. |
| **Impacto / risco / ganho** | Médio (nova action read-only). Ganho alto em lojas com catálogo >500. |
| **IDs** | UX-P0-03 |

---

## RFC-UX-005 — PDV F3 permanece consulta rápida (não “add to cart”)

| | |
|--|--|
| **Status** | Aceito · Sprint 1 |
| **Problema** | Backlog UX-P1-03 dizia “F3 → adicionar ao carrinho”, mas o contrato operacional vigente (`caixaAtalhos` + `useCaixaKeyboardShortcuts`) é **consulta rápida sem alterar o carrinho**. |
| **Decisão** | **Não mudar o atalho.** Enter continua adicionando; F3 = consulta. Documentar KeyHint/referência; polish = barcode na busca + realce da última linha do carrinho. |
| **Risco de mudar** | Quebra memória muscular de operadores em produção. |
| **IDs** | UX-P1-02 (já parcial), UX-P1-03 (reescopo), UX-P1-04, UX-P1-05 |

---

## RFC-UX-006 — Recebimento: PageShell + breadcrumb + InlineAlert

| | |
|--|--|
| **Status** | Aceito · Sprint 1 |
| **Problema** | Página herdada do gerente: header inconsistente, “← Início” genérico, alerta de catálogo vazio ad hoc. |
| **Consolidar?** | Não fundir no Estoque (formulário + remessas recentes tem job próprio). Breadcrumb aponta Estoque. |
| **Arquitetura** | `PageShell` + link breadcrumb Estoque → Recebimento; `InlineAlert` warning quando sem produtos (CTA Catálogo Entity-SSOT). |
| **IDs** | UX-P1-10 |

---

## RFC-UX-007 — Financeiro: um hub, três abas, um paradigma

| | |
|--|--|
| **Status** | Aceito · Sprint 2 |
| **Problema** | Três paradigmas convivem: (1) tabs locais ad hoc, (2) Contas a Pagar em `GerenteTable`/`DataTablePage`/`dragon-glass`/`app-btn-*`, (3) Receber com `DataTable` + fila fiscal duplicada na lateral. Rota `/admin/financeiro/contas-pagar` é segunda porta para o mesmo job. |
| **Consolidar?** | **Sim.** `/contas-pagar` → redirect canônico `?tab=pagar`. Fila fiscal **sai** da aba Receber (só vive em `tab=fiscal`) — uma fonte, um lugar. |
| **Arquitetura** | `PageShell` + `TabNav` URL (`tab=receber\|pagar\|fiscal`) · fetch por aba · Receber: FilterBar + EntityTable · Pagar: EntityTable + MetricCard + ExportAction (sem GerenteTable) · Fiscal: InlineAlert stub + lista/EmptyState + DetailSheet. |
| **Impacto / risco / ganho** | Médio (migração visual + redirect). Alto ganho: zero dual-track financeiro; menos cliques; menos carga (dados só da aba ativa). |
| **IDs** | UX-P0-04, UX-P1-11 |

---

## RFC-UX-008 — Documento fiscal: PageShell + InlineAlert (fim do dragon-glass)

| | |
|--|--|
| **Status** | Aceito · Sprint 2 |
| **Problema** | Detalhe de documento usa `dragon-glass-card`, `GerenteStatusBadge`, `app-btn-danger` — pele legado dentro do admin. |
| **Consolidar?** | Página permanece (timeline auditável precisa de URL estável). Lista continua via DetailSheet no hub. |
| **Arquitetura** | `PageShell` + `SectionCard` + `StatusChip` + `InlineAlert` (erro) + `ConfirmActionButton`/`ConfirmDialog` para reprocessar. |
| **IDs** | UX-P0-05 |

---

## RFC-UX-009 — Catálogo S2: contratos S0 já no hot-path (sem nova tela)

| | |
|--|--|
| **Status** | Aceito · Sprint 2 |
| **Problema** | Risco de reintroduzir CTAs/bulk/export paralelos fora do SSOT. |
| **Decisão** | Manter PageShell/CrudListShell + 1 primary + menu Importar (S1). Bulk = `BulkActionBar`; export = `ExportAction`. Sem GerenteTable/DataTablePage no catálogo. Sem nova rota. |
| **IDs** | UX-P1-06/07 (confirmação S2) |

---

## RFC-UX-010 — PDV S2: atalho F3 visível no empty (só polish com ganho)

| | |
|--|--|
| **Status** | Aceito · Sprint 2 |
| **Problema** | Empty do carrinho lista Enter/Ctrl+B/F4 mas omite F3 (consulta) — operador não descobre o atalho no momento de idle. |
| **Decisão** | Incluir F3 nos chips do empty. Sem mudar contrato de teclado (RFC-005). |
| **IDs** | polish S2 |
