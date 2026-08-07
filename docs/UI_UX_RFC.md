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
