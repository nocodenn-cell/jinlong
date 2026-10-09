# Plano de Layout e Navegação — Painel Jinlong (`/admin`)

> **SUPERADO (2026-10-08).** Este documento é a 1ª passada. Contém dois números errados (corrigidos abaixo) e uma arquitetura de 8 destinos que a auditoria completa ajustou para 9. A versão vigente é `ARQUITETURA_INFORMACAO_PROPOSTA.md`; veja `RELATORIO_GO_NO_GO.md` seção I.


| Campo | Valor |
|---|---|
| Data | 2026-10-08 |
| Escopo | Navegação do painel gerente (`pdv-importados`): sidebar, hubs, abas |
| Natureza | Análise + plano. **Nenhum código alterado.** |
| Fontes | `lib/navigation/adminV2SidebarNav.ts`, `catalogoHubNav.ts`, `estoqueHubNav.ts`, `financeiroTabId.ts`, `executiveViews.ts`, `ExecutiveSidebarNav.tsx`, `RelatoriosContent.tsx`, `ConfiguracoesContent.tsx`, `audit-fluxos_operacionais_jinlong.md` |

---

## 1. Diagnóstico: por que ninguém acha nada

### 1.1 Números

| Camada | Itens |
|---|---|
| Sidebar — Análises | 5 |
| Sidebar — Operações | 12 |
| Sidebar — Sistema | 6 (4 para o gerente; 2 extras só ADMIN interno) |
| **Total na sidebar** | **23 entradas** (**20** visíveis para o gerente — corrigido) |
| Abas dentro dos hubs | Catálogo 4 · Estoque 5 · Financeiro 8 · Relatórios 4 views + 5 abas legadas · Configurações 3 |
| Páginas `/admin/*` | **32** `page.tsx` (corrigido; antes dizia 40) |

Há **dois níveis de navegação ao mesmo tempo**: uma sidebar com 21+ itens *e* abas dentro de cada hub. O usuário nunca sabe se o que procura é um item de menu ou uma aba.

### 1.2 O mesmo assunto aparece em vários lugares

| Assunto | Onde aparece hoje |
|---|---|
| **Vendas** | "Vendas & Caixas" (Análises) · "Vendas" (Operações) · "Caixas" (Operações) · Relatórios legado → aba Vendas |
| **Relatórios** | 4 views executivas na sidebar **+** "Relatórios (detalhe)" (legado) com 5 abas próprias: Visão/Produtos/Estoque/Margem/Vendas — sobrepõe as views |
| **Produtos e estoque** | "Produtos & Estoque" (Análises) · Catálogo · Estoque · Relatórios legado → abas Produtos/Estoque/Margem |
| **Financeiro** | "DRE & Financeiro" (Análises) · "Financeiro e fiscal" (Operações) com 8 abas, uma delas "Resultado" — outro DRE |
| **Auditoria** | item "Auditoria" (Operações) **e** view "CRM & Auditoria" (Análises) |
| **Etiquetas** | aba "Imprimir Etiquetas" no hub Catálogo **e** no hub Estoque (mesma rota) |
| **Compras / recebimento** | "Fornecedores" · "Compras" (itens soltos) · Estoque → "Entradas" (recebimento manual + Importar NF-e). Três módulos para o mesmo processo; o audit já registra que Compras e Recebimento manual **não se comunicam** (risco de lançamento duplicado) |
| **Pessoas** | Clientes · Funcionários · Fornecedores · Comissões — quatro itens separados, sem agrupamento |
| **Configuração** | "Configurações" (3 abas) · "Suspensão de vendas" · "Categorias financeiras" (só alcançável por dentro do Financeiro) · Marcas/Categorias de produto (dentro do Catálogo) |

### 1.3 Problemas estruturais

1. **Lista plana de 12 em "Operações"**, sem hierarquia: Caixas, Auditoria e Comissões têm o mesmo peso visual que Vendas e Catálogo.
2. **Ordem não segue o fluxo de trabalho.** Fornecedores e Compras ficam depois de Auditoria; Funcionários entre Clientes e Estoque.
3. **Análises no topo.** Cinco itens de BI ocupam o lugar mais nobre da sidebar, acima do que o lojista usa todo dia (vender, estoque, contas).
4. **Financeiro com 8 abas.** Resumo · A receber · A pagar · Contas e saldos · PIX e cartões · Conciliação · Resultado · Fiscal misturam rotina diária (receber/pagar) com tarefas de fechamento e de contador.
5. **Rótulos que não dizem o que é:** "Entradas" (é recebimento + NF-e), "Movimentações" vs "Transferências", "Relatórios (detalhe)" / "Hub analítico legado", "Financeiro e fiscal".
6. **Dado já existe, mas a tela não leva até ele** (achado central do audit: relatórios sem links, vendas sem cliente/saldo, estoque crítico sem ação de reposição). Reorganizar menu sozinho não resolve — precisa de links de contexto (Fase 3).

---

## 2. Princípios do novo layout

1. **Organizar por tarefa do lojista, não por tabela do banco.** Perguntas-guia: "vou vender", "vou cadastrar/ver produto", "chegou mercadoria", "quanto tenho a receber/pagar", "como foi o mês".
2. **Um único nível de menu na sidebar; abas só dentro do módulo** e no máximo 5 por hub.
3. **Cada assunto mora em um lugar só.** Os demais lugares viram *link* (atalho), não cópia.
4. **Máximo de 8 destinos na sidebar**, ordenados pela frequência de uso.
5. **Rotas e SSOT não mudam** (`ROUTES` permanece). Só muda *como se chega* nelas. Isso mantém testes e deep-links.
6. **Interno/ADMIN fora da vista do gerente** (já funciona via `adminOnly` — manter).

---

## 3. Proposta: sidebar de 8 destinos

```
 INÍCIO
 ├─ Visão geral                      /admin/dashboard

 VENDER
 ├─ Vendas  (abas: Vendas | Caixas)  /admin/vendas · /admin/caixas
 └─ [Ir para o PDV]                  botão fixo, destaque, topo da sidebar

 PRODUTOS
 └─ Catálogo (abas: Produtos | Categorias | Marcas | Etiquetas)

 ESTOQUE E COMPRAS
 └─ Estoque  (abas: Saldos | Receber mercadoria | Movimentações | Transferências)
    Compras  (abas: Pedidos de compra | Fornecedores)

 FINANCEIRO
 └─ Financeiro (abas: A receber | A pagar | Contas e conciliação | Fiscal)

 PESSOAS
 └─ Clientes · Funcionários · Comissões   (abas dentro de "Pessoas")

 RELATÓRIOS
 └─ Relatórios (abas: Vendas | Financeiro (DRE) | Produtos e estoque | Clientes e equipe | Auditoria)

 CONFIGURAÇÕES
 └─ Loja · Impostos · Preferências · Suspensão de vendas · Categorias financeiras
 
 ─ Interno (só ADMIN): Provisionamento · Implantação · Diagnóstico do Caixa
```

Resultado: **8 itens de sidebar** (antes 21), cada um com 2–5 abas. Total de destinos alcançáveis **permanece o mesmo** — nada é removido, só reagrupado.

### 3.1 Mapa antigo → novo

| Hoje | Passa a ser |
|---|---|
| Visão Geral | **Início** |
| Vendas & Caixas (análise) | Relatórios → aba *Vendas* |
| DRE & Financeiro (análise) | Relatórios → aba *Financeiro (DRE)* |
| Produtos & Estoque (análise) | Relatórios → aba *Produtos e estoque* |
| CRM & Auditoria (análise) | Relatórios → abas *Clientes e equipe* + *Auditoria* |
| Relatórios (detalhe) — legado | **Removido da sidebar**; 5 abas absorvidas pelas abas de Relatórios (redirect do `?tab=` antigo) |
| Vendas | **Vender → Vendas** |
| Caixas | **Vender → Caixas** (aba) |
| Catálogo | **Produtos** (4 abas; Etiquetas só aqui + atalho no Estoque) |
| Clientes / Funcionários / Comissões | **Pessoas** (3 abas) |
| Estoque | **Estoque** (Saldos · Receber mercadoria · Movimentações · Transferências) |
| Fornecedores / Compras | **Compras** (Pedidos · Fornecedores) |
| Financeiro e fiscal (8 abas) | **Financeiro** (4 abas — ver 3.2) |
| Auditoria | Relatórios → aba *Auditoria* |
| Configurações / Suspensão / Categorias financeiras | **Configurações** (5 abas) |
| Ir para PDV | Botão fixo no topo da sidebar |

### 3.2 Financeiro: de 8 para 4 abas

| Nova aba | Absorve |
|---|---|
| **A receber** (padrão) | A receber + vínculo com a venda de origem |
| **A pagar** | A pagar (hoje também em `/admin/financeiro/contas-pagar`) |
| **Contas e conciliação** | Contas e saldos + PIX e cartões + Conciliação — como seções/sub-filtro, não abas |
| **Fiscal** | Fiscal |

*Resumo* vira o cabeçalho (cartões de KPI: vencido, a vencer hoje, saldo) fixo acima das abas. *Resultado* sai: já existe como DRE em Relatórios; fica um link "Ver resultado do período".

### 3.3 Estoque e Compras: um processo, não três

Rótulo "Entradas" → **"Receber mercadoria"**, com 3 caminhos explícitos na mesma tela:
1. *Contra um pedido de compra* (puxa a OC)
2. *Importar NF-e (XML)*
3. *Entrada manual*

Isso é também a correção do risco P0/P1 do audit (dois recebimentos sem vínculo): a tela passa a perguntar "tem pedido?" antes de abrir o formulário manual.

---

## 4. Layout dentro de cada tela

Padrão único para todo módulo (hoje há variações):

```
┌ Título do módulo ──────────────── [ação primária] ┐
│ Aba 1 · Aba 2 · Aba 3 · Aba 4        (máx. 5)     │
├───────────────────────────────────────────────────┤
│ Filtros (1 linha; avançados atrás de "Mais")      │
│ Conteúdo                                          │
└───────────────────────────────────────────────────┘
```

- **Uma ação primária por tela**, sempre no canto superior direito (ex.: "Novo produto", "Receber mercadoria", "Nova conta a pagar").
- **Busca global (Ctrl+K)** no topo do shell: busca produto, cliente, venda, fornecedor e leva direto. Resolve "tenho tantas telas que não encontro" sem depender do menu.
- **Sidebar recolhível em ícones** e com o grupo atual expandido; sem grupo colapsado escondendo itens (o "Mais" antigo já causou perda de Comissões).
- **Breadcrumb curto** (`Estoque › Receber mercadoria`) para mostrar o lugar.
- **Links de contexto** no lugar de telas novas: linha de relatório → produto/venda; venda → título a receber; estoque crítico → "Repor" (Compras/Receber mercadoria já com o produto). Ver audit seção E.

---

## 5. Plano de execução (fases independentes)

Cada fase é entregável e reversível sozinha. **Nenhuma altera rotas nem banco.**

| Fase | O que muda | Risco | Arquivos principais |
|---|---|---|---|
| **0 — Rótulos** (1 PR, horas) | "Entradas"→"Receber mercadoria"; "Relatórios (detalhe)"→removido do texto; "Financeiro e fiscal"→"Financeiro"; tirar "Etiquetas" duplicada do hub Estoque (deixar atalho) | Muito baixo | `estoqueHubNav.ts`, `adminV2SidebarNav.ts`, i18n |
| **1 — Sidebar de 8 itens** | Reescrever `ADMIN_V2_*_ITEMS` em 8 grupos; "Ir para PDV" fixo no topo; Análises sai do topo e vira "Relatórios" | Baixo — afeta `adminV2SidebarNav.test.ts`, `isAdminNavActive` | `adminV2SidebarNav.ts`, `ExecutiveSidebarNav.tsx` + testes |
| **2 — Hubs novos** (reuso de `HubTabDef`/`AdminHubTabNav`) | Criar hubs **Vender** (Vendas+Caixas), **Pessoas** (Clientes+Func.+Comissões), **Compras** (Pedidos+Fornecedores), **Configurações** (+Suspensão +Cat. financeiras). Só adiciona uma barra de abas nas páginas existentes | Baixo — padrão já existe em Catálogo/Estoque | `lib/navigation/*HubNav.ts`, `AdminHubTabNav.tsx` |
| **3 — Financeiro 8→4** | Resumo vira cabeçalho de KPIs; Contas+PIX/cartões+Conciliação em uma aba com seções; remover "Resultado" (link para DRE) | Médio — `FinanceiroWorkspace.tsx` é grande e tem testes de comportamento | `financeiroTabId.ts`, `financeiroTabs.ts`, `FinanceiroWorkspace.tsx` |
| **4 — Relatórios unificado** | Absorver as 5 abas legadas nas 4 views + Auditoria; redirect de `?tab=` antigo | Médio — `RelatoriosContent.tsx` + `ExecutiveDomainView` | `executiveViews.ts`, `RelatoriosContent.tsx` |
| **5 — Busca global Ctrl+K** | Command palette no shell | Baixo (aditivo) | `AdminV2Shell.tsx` |
| **6 — Links de contexto** (audit seção E) | Linhas de relatório clicáveis; venda↔financeiro; crítico→repor | Baixo, alto valor | `RelatoriosContent.tsx`, `VendaDetailSheet.tsx`, `receivableReader.ts` |

**Ordem recomendada:** 0 → 1 → 2 já resolve o "não acho nada" (20 → ~10 itens) com o menor risco. Fases 3–4 reduzem abas. Fases 5–6 dão o ganho de fluxo.

---

## 6. Como medir se melhorou

- Contagem de cliques até as 10 tarefas mais comuns (vender, ver venda de ontem, cadastrar produto, receber mercadoria, ver contas a pagar vencidas, fechar caixa, etc.): meta **≤ 2 cliques** a partir de qualquer tela.
- Teste com o lojista: pedir 5 tarefas sem explicar o menu; anotar onde hesita.
- Itens de sidebar visíveis ao gerente: **20 → 10**. Abas por hub: **máx. 5**.

---

## 7. Decisões que dependem de você

1. **Pessoas** como grupo único (Clientes + Funcionários + Comissões) está ok? Alternativa: Comissões dentro de Funcionários.
2. **Auditoria** dentro de Relatórios é aceitável, ou o gerente precisa dela como item próprio?
3. **Financeiro de 4 abas** — o contador usa *Conciliação* e *Resultado* com frequência a ponto de justificar aba própria?
4. **Idioma ZH**: a sidebar tem rótulos em chinês (`labelCn`); os novos grupos precisam de tradução — quem revisa?

---

## 8. Riscos e cuidados

- Testes de navegação (`adminV2SidebarNav.test.ts`, `hubNavModel.test.ts`, `isAdminNavActive.test.ts`, `hubOperationalPaths.test.ts`) vão precisar ser atualizados junto — é onde o contrato atual está travado.
- Manter redirects dos parâmetros antigos (`?tab=`, `?view=`) para não quebrar favoritos e links de e-mail.
- O guard `boundary-ratchet-guard.mjs` e a regra "proibido `/admin/*` fora de `routes.ts`" continuam valendo: usar sempre `ROUTES`.
