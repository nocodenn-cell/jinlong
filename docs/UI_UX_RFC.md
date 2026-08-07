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

---

## RFC-UX-011 — Compras: fim do dragon-glass / GerenteTable

| | |
|--|--|
| **Status** | Aceito · Sprint 3 |
| **Problema** | Lista de OC vive em `GerenteTable` + `dragon-glass-card` + `app-btn-*` + empty com glifo Han — terceira pele no admin. |
| **Consolidar?** | Tela permanece (job: ordens de compra ≠ recebimento ≠ NF-e). Não fundir com Financeiro. |
| **Arquitetura** | `PageShell` + `MetricCard` + filtros/chips DS + `EntityTable` + `EmptyState` + `Button`/`PaginationBar`. Modais OC já em DragonModal (S0). |
| **IDs** | UX-P0-06 |

---

## RFC-UX-012 — Comissões: FilterBar daterange + status na URL

| | |
|--|--|
| **Status** | Aceito · Sprint 3 |
| **Problema** | Página lê `de`/`ate`/`status` da URL mas **não expõe FilterBar** — operador não muda período sem hack. Empty com emoji. |
| **Arquitetura** | `PageShell` + `FilterBar` (`daterange` + pills status) + `EntityTable`/`EmptyState`. Detalhe permanece na mesma página (sheet/card) — sem rota nova. |
| **IDs** | UX-P0-07 |

---

## RFC-UX-013 — Importar NF-e: Stepper + FileDropzone

| | |
|--|--|
| **Status** | Aceito · Sprint 3 |
| **Problema** | Dropzone ad hoc + sem progresso de fases (upload → preview → conferência → concluído). |
| **Arquitetura** | `PageShell` + breadcrumb Estoque + `Stepper` + `FileDropzone` SSOT; lógica de import/conferência intacta. |
| **IDs** | UX-P1-09 |

---

## RFC-UX-014 — Estoque: hub de ações no header

| | |
|--|--|
| **Status** | Aceito · Sprint 3 |
| **Problema** | Só “Importar NF-e” no header; Recebimento/Transferências/Etiquetas exigem navegação lateral. |
| **Arquitetura** | `PageShell` + `PageActions`: primary implícito na lista; secondary links para NF-e, Recebimento, Transferências, Etiquetas. Sem nova tela hub. |
| **IDs** | UX-P1-12 |

---

## RFC-UX-015 — Funcionários: CrudListShell + EntityTable + confirmação

| | |
|--|--|
| **Status** | Aceito · Sprint 4 |
| **Problema** | Shell legado (`DataTablePage` + `GerenteTable`), filtros ad hoc, desativar sem `ConfirmDialog`, erro em `<p>` raw. |
| **Custo atual** | Último CRUD operacional com paradigma de tabela pré-S0; risco de desativar conta sem confirmação; inconsistência visual vs Clientes/Fornecedores. |
| **Proposta** | `PageShell` + `FilterBar` (busca + situação) + `CrudListShell` + `EntityTable` + `EmptyState`/`ErrorState`; desativar/reativar via `askConfirm`; feedback via `emitToast`. |
| **Consolidar?** | **Não** fundir com Configurações — Funcionários é cadastro de identidade/permissão (SSoT próprio), Config é loja/PDV. |
| **Impacto** | −1 `GerenteTable`; permissões (`funcionarioPolicies`) intactas. |
| **Risco** | Baixo — actions inalteradas. |
| **Ganho operacional** | Mesmo padrão de lista; desativação consciente; filtros URL compartilháveis. |
| **IDs** | UX-P1-13 |

---

## RFC-UX-016 — Categorias financeiras: taxonomia + paridade + atalho no hub

| | |
|--|--|
| **Status** | Aceito · Sprint 4 |
| **Problema** | UI sem tipo (RECEITA/DESPESA/AMBOS) apesar do schema exigir; strings hardcoded; emoji empty; `admin-v2-btn-*`; filtros de situação/tipo ignorados. |
| **Custo atual** | Criar categoria pode falhar validação; operador não entende taxonomia; tela “irmã pobre” vs categorias-produto. |
| **Proposta** | Paridade com categorias-produto (`PageShell`/`CrudListShell`/`DataTable`/i18n); filtros `tipo` + `situacao` + busca; create/edit com select de tipo; link secundário no hub Financeiro → `/admin/categorias-financeiras` (sem segundo CRUD). |
| **Consolidar?** | **Não** virar aba do Financeiro — taxonomia é cadastro de referência (como categorias de produto fora do Catálogo lista). Hub só aponta. |
| **Impacto** | Taxonomia legível; create alinhado ao schema. |
| **Risco** | Baixo. |
| **Ganho operacional** | Categorias corretas na origem; menos ida/volta lateral sem contexto. |
| **IDs** | UX-P1-14 |

---

## RFC-UX-017 — Relatórios: TabNav por domínio + FilterBar + donut honesto

| | |
|--|--|
| **Status** | Aceito · Sprint 4 |
| **Problema** | Scroll infinito de seções; form de período ad hoc; empty com emoji; donut “pagamentos” com fatia **Ajustes** fabricada (`concluidas * 0.08`). |
| **Custo atual** | Operador perde contexto; confiança nos números erodida; export ok mas filtros fora do contrato. |
| **Proposta** | `PageShell` + `FilterBar` daterange + `ExportAction`; `TabNav` URL (`sec=vendas\|estoque\|margem`); `EmptyState`/`ErrorState`/`InlineAlert`; donut = apenas concluídas vs canceladas (rótulo honesto). |
| **Consolidar?** | **Não** fundir com Dashboard — Dashboard = snapshot do dia; Relatórios = análise por período. |
| **Impacto** | Menos scroll; números honestos; FilterBar canônico. |
| **Risco** | Baixo — mesma action `carregarDadosRelatoriosGerente`. |
| **Ganho operacional** | Achados por domínio sem sair do período; CSV no header. |
| **IDs** | UX-P1-15 |

---

## RFC-UX-018 — Suspensão: rota própria (não fundir em Config) + IX-CONFIRM

| | |
|--|--|
| **Status** | Aceito · Sprint 4 |
| **Problema** | Alerts ad hoc; banner de sucesso paralelo; salvar suspensão sem confirmação; sem `PageShell`. |
| **Custo atual** | Ação de emergência altamente arriscada parece “form comum”; feedback fora de `emitToast`. |
| **Proposta** | Manter `/admin/suspensao` (visibilidade lateral para emergência). `PageShell` + `InlineAlert` de status + `askConfirm` ao suspender + `emitToast`. **Não** enterrar como aba de Config (modelo mental diferente: loja/PDV vs kill-switch operacional). |
| **Impacto** | Confirmação obrigatória ao suspender; feedback global. |
| **Risco** | Baixo — actions iguais. |
| **Ganho operacional** | Menos suspensão acidental; status óbvio. |
| **IDs** | UX-P1-16 |

---

## RFC-UX-019 — Toast viewport admin + fim de banners de sucesso paralelos (Config/Suspensão)

| | |
|--|--|
| **Status** | Aceito · Sprint 4 |
| **Problema** | Viewport ainda `GerenteToastViewport` no layout admin; Config/Suspensão usam banners verdes locais. |
| **Custo atual** | Dual naming; dois canais de sucesso no painel. |
| **Proposta** | Renomear para `AdminToastViewport` (alias deprecated `GerenteToastViewport`); Config e Suspensão → `emitToast` (PDV permanece EXC-02). |
| **Impacto** | Um canal de toast no admin. |
| **Risco** | Baixo — alias preserva imports. |
| **Ganho operacional** | Feedback previsível. |
| **IDs** | UX-P1-19 (+ superfície Config/Suspensão) |

---

## RFC-UX-020 — Config: TabNav URL + FormSection; /gerente sem flash

| | |
|--|--|
| **Status** | Aceito · Sprint 4 |
| **Problema** | Tabs locais (não `TabNav`); sucesso inline; `/gerente` ainda montava `GerenteLayoutShell` antes do redirect. |
| **Custo atual** | Deep-link de aba impossível; flash visual legado. |
| **Proposta** | Config: `PageShell` + `TabNav` `?tab=` + `FormSection` + `InlineAlert` erro + `emitToast` sucesso. `/gerente/*`: redirect no middleware (e layout sem shell) via `legacyGerenteRedirect`. |
| **Impacto** | Abas bookmarkable; zero flash gerente. |
| **Risco** | Médio-baixo no middleware — cobrir com mapa LEGACY existente. |
| **Ganho operacional** | Config compartilhável por aba; bookmarks `/gerente` caem direto no admin. |
| **IDs** | UX-P1-20, UX-P1-18 |

---

## RFC-UX-021 — Sprint 5: aceitar S4 e abrir polish/entropia

| | |
|--|--|
| **Status** | Aceito · Sprint 5 |
| **Problema** | S0–S4 migraram hot-path, mas resíduos mortos (GerenteTable/DataTablePage/shell gerente) e padrões locais ainda poluem burndown e confusão. |
| **Custo atual** | Dual-track mental; allowlist de overlays fantasmas; métrica de aderência esconde órfãos. |
| **Proposta** | Sprint 5 = inventário A/B/C + eliminação de A + polish de densidade/a11y/nav. Sem abrir “S6”. |
| **Não-fazer** | Declarar 100% artificial; tocar EXC-01..07 sem RFC. |

---

## RFC-UX-022 — Remover stack morta GerenteTable / DataTablePage / GerenteLayoutShell

| | |
|--|--|
| **Status** | Aceito · Sprint 5 |
| **Problema** | `GerenteTable`, `DataTablePage`, `TabelaCadastroPadrao`, `FiltroLateralCadastro`, `CadastroFormModal`, `GerenteLayoutShell`+nav/drawers **sem consumidores de rota** após S4 (`/gerente` → redirect edge). |
| **Custo atual** | Burndown mentiroso; allowlist `fixed inset-0` para drawers mortos; risco de alguém reintroduzir. |
| **Proposta** | Apagar arquivos + testes órfãos; atualizar `check:ds-sprint0` allowlist; manter `CadastroRapidoBlock` (ainda usado em Recebimento) sem `dragon-glass-card`. |
| **Risco** | Baixo — zero imports de app. |
| **Ganho** | `GerenteTable` hits → 0; menos entropia. |

---

## RFC-UX-023 — Cadastros auxiliares: FilterBar + PageShell (categorias/marcas/clientes/fornecedores)

| | |
|--|--|
| **Status** | Aceito · Sprint 5 |
| **Problema** | Categorias/marcas usam SearchInput+pills locais; clientes/fornecedores usam `PageHeader` sem `PageShell`. |
| **Proposta** | `PageShell` + `FilterBar` URL (busca/situação) nas 4 superfícies; conteúdo só lista/CTA. |
| **Risco** | Baixo. |

---

## RFC-UX-024 — Financeiro receber: EntityLookup de cliente (fim do `<select>` truncado)

| | |
|--|--|
| **Status** | Aceito · Sprint 5 |
| **Problema** | `FinanceiroReceberExtras` usa `<select>` com página 1 de clientes — esconde o restante do cadastro. |
| **Proposta** | `EntityLookup` async via `buscarClientesPaginadosAction`; botões `Button` SSOT. |
| **Risco** | Baixo — entity-SSoT: não cria cliente inline. |

---

## RFC-UX-025 — Diagnóstico / Etiquetas / Auditoria empty: InlineAlert + EmptyState + emitToast

| | |
|--|--|
| **Status** | Aceito · Sprint 5 |
| **Problema** | Diagnóstico com `admin-v2-btn/alert`; etiquetas com `alert()`; auditoria empty com emoji. |
| **Proposta** | Tokens DS; `emitToast` no PDF; `EmptyState` na timeline. EXC-07 permanece para densidade utilitária, mas com primitivos. |
