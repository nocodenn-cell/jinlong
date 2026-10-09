# Auditoria de Navegação — Jinlong (Sprint UX-IA-01, Fase 0)

| Campo | Valor |
|---|---|
| Data | 2026-10-08 |
| Branch | `claude/jinlong-layout-flow-analysis-f72d7d` (worktree isolado; sem produção, sem migrations, sem deploy) |
| Natureza | **Somente leitura de código. Nenhuma alteração funcional.** |
| Método | Contagem por `find`/`grep` no código; leitura de `adminV2SidebarNav.ts`, `ExecutiveSidebarNav.tsx`, `*HubNav.ts`, `AdminHubTabNav.tsx`, `routes.ts`, `adminPolicy.ts`, `RelatoriosContent.tsx`, `financeiroTabId.ts`. Cliques **não** foram medidos em runtime (ver `JORNADAS_OPERACIONAIS.md`). |

## A. Contagens verificadas

| Item | Valor | Como foi contado |
|---|---|---|
| Arquivos `page.tsx` em `app/` | **45** | `find app -name page.tsx` |
| — dentro de `/admin` | **32** | idem, `app/admin` |
| — API routes | 7 | `find app/api -name route.ts` |
| Entradas na sidebar (total) | **23** = 5 Análises + 12 Operações + 6 Sistema | `adminV2SidebarNav.ts` |
| Entradas visíveis a GERENTE/DONO | **20** (3 do Sistema são `adminOnly`) | `showAdminOnlyItems = perfil === 'ADMIN'` |
| Rotas `/admin` distintas na sidebar | **18** (+ `/caixa`) — as 5 entradas de relatórios apontam para **1 rota** (`/admin/relatorios`) com `?view=` | contagem de `href` |
| Rotas `/admin` **fora** da sidebar (só por aba/link) | **14** | 32 − 18 |
| Abas Catálogo / Estoque / Financeiro | 4 / 5 / **9** (8 abas + "Categorias") | `catalogoHubNav.ts`, `estoqueHubNav.ts`, `FINANCEIRO_TAB_ORDER` + `AdminHubTabNav.tsx:73-80` |
| Abas Relatórios | 4 views executivas + 5 abas "legado" (Visão/Produtos/Estoque/Margem/Vendas) | `executiveViews.ts`, `RelatoriosContent.tsx:569-575` |
| Abas Configurações | 3 (Loja, Impostos, Preferências) | `ConfiguracoesContent.tsx:208-211` |
| Páginas com barra de hub | **12 de 32**: Catálogo/categorias/marcas (3), Estoque (6), Financeiro/categorias-fin./documento (3). As outras 20 não têm sub-navegação (inclui 3 redirects/home) | `grep -rl HubNav app` |
| Redirects legados `/gerente/*` | 31 entradas → `/admin/*` | `LEGACY_GERENTE_REDIRECTS` |
| Busca global / Ctrl+K | **Não existe** | grep `ctrl+k|cmdk|command palette` = 0 |

## B. Achados novos que corrigem análises anteriores

1. **Minha afirmação anterior "40 rotas" estava errada: são 32 páginas `/admin`.** Corrigido em `PLANO_LAYOUT_NAVEGACAO_JINLONG.md`.
2. **O audit de 17/09 (`audit-fluxos_operacionais_jinlong.md`) está parcialmente desatualizado.** Já implementado no código: linhas de Relatórios linkam produto/venda (`RelatoriosContent.tsx:209-533`); `VendaDetailSheet` mostra cliente e saldo a receber com link ao Financeiro (`:203,230-242`); recibo do PDV mostra cliente (`CaixaReciboModal.tsx:186`); estoque tem botão "Repor" → recebimento já com o produto (`EstoqueTable.tsx:225`); Fornecedores → Compras/Contas a pagar (`FornecedoresListClient.tsx:341,354`); contas a pagar legado redireciona para a aba (`financeiro/contas-pagar/page.tsx`). **Itens 5.1, 5.2, 4.1, 7.1, 8.1 daquele documento não devem ser reabertos.**
3. **A navegação dos relatórios é duplicada dentro da própria tela.** Além dos 5 itens da sidebar, o componente `ExecutiveAnalyticsHubNav` renderiza as mesmas 5 views como barra interna (`ExecutiveVisaoGeralStub.tsx:5`; `RelatoriosContent.tsx:693`). Mesmo destino, dois controles.
4. **"adminOnly" é só visual para Implantação e Diagnóstico do Caixa.** A sidebar os esconde de GERENTE, mas `adminPolicy.ts` lista `route:/admin/implantacao` e `route:/admin/diagnostico-caixa` como `ALL_ADMIN_PROFILES`. Acesso por URL direta é permitido a GERENTE/DONO (Implantação protege apenas as *ações* de autorizar GO com `DONO|ADMIN`, `implantacao/page.tsx:26`). Só `provisionamento` é de fato restrito a ADMIN. **Risco de autorização, não de UX — não corrigir dentro desta sprint; registrar para decisão.**
5. **O modelo de perfis é pequeno e fixo:** `PerfilUsuario = 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'` (`lib/auth/perfil.ts:1`). O painel `/admin` só admite GERENTE, DONO e ADMIN (`painelGerencial.ts:9`); **todos veem exatamente as mesmas telas** (exceto as de ADMIN). Não existem perfis Estoquista nem Financeiro, nem tela de "Perfis e permissões". Ver `MATRIZ_PERMISSOES_NAVEGACAO.md`.
6. **Funções citadas na missão que não existem no código** (grep sem resultado): inventário/contagem de estoque como tela (existe só ajuste: `estoque/inventoryAdjustment.ts`), histórico de preços, importação de produtos em massa, tela de impressoras, tela de integrações. Não devem constar na navegação proposta como se existissem.
7. **Componentes de telas "admin" vivem em `app/gerente/*`** (ex.: `FornecedoresListClient`, `ImportarNfePageClient`, `ContasPagarListClient`), importados por páginas de `/admin`. Dívida de organização, sem impacto de UX; não mexer agora.
8. **i18n:** `pt.json` e `zh.json` têm as mesmas 3.176 chaves (0 faltando). 193 valores são idênticos em PT e ZH (possivelmente não traduzidos; amostra não revisada). Porém **a sidebar não é totalmente i18n**: rótulos de grupo ("Análises", "Operações", "Sistema") e o aria-label "Operações expandido/recolhido" são strings PT fixas (`ExecutiveSidebarNav.tsx:~108-130`), e vários itens usam `labelOverridePt` em vez de chave de dicionário. Inconsistência: o item é "Catálogo" em PT-override, mas a chave do dicionário é "Produtos" (商品).

## C. Matriz de rotas `/admin` (32)

Legenda — **Perfil**: G = GERENTE, D = DONO, A = ADMIN. **Prof.**: 1 = item da sidebar; 2 = aba/link a partir de um item; 3 = a partir de uma tela de nível 2.
Todas as rotas passam por `adminPolicy` (G, D, A) exceto onde indicado.

| Módulo | Rota | Tela / Função | Perfil | Origem | Prof. | Duplicidade | Recomendação |
|---|---|---|---|---|---|---|---|
| Início | `/admin` | redirect → dashboard | G D A | — | — | — | Manter (redirect) |
| Início | `/admin/dashboard` | Visão Geral (KPIs, pedidos recentes, atalho Caixa) | G D A | Sidebar "Visão Geral" | 1 | Também 1ª view na barra `ExecutiveAnalyticsHubNav` | Manter como "Início" |
| Relatórios | `/admin/relatorios` | 4 views (`?view=`) + 5 abas legado (`?tab=`) | G D A | 5 itens da sidebar + barra interna | 1 | 5 entradas → 1 rota; abas legado sobrepõem views | **Consolidar** navegação em um controle |
| Vendas | `/admin/vendas` | Lista de vendas, detalhe, cancelamento (info), reimpressão, export | G D A | Sidebar "Vendas" | 1 | Mesma informação em view "Vendas & Caixas" e aba legado Vendas | Manter operacional; relatório = análise |
| Vendas | `/admin/caixas` | Caixas abertos e histórico de turnos | G D A | Sidebar "Caixas" | 1 | "Vendas & Caixas" (análise de caixas) | Manter; agrupar com Vendas |
| Catálogo | `/admin/catalogo` | Lista de produtos, modal novo, ações | G D A | Sidebar "Catálogo" | 1 | — | Manter |
| Catálogo | `/admin/catalogo/novo`, `/novo/completo`, `/[id]/completo` | Cadastro rápido / completo / edição | G D A | Botão "Novo", linha, Relatórios | 2 | Duas formas de cadastrar (modal e página completa) | Manter; explicar quando usar cada |
| Catálogo | `/admin/categorias-produtos` | Categorias | G D A | Aba do hub | 2 | — | Manter |
| Catálogo | `/admin/marcas-produtos` | Marcas | G D A | Aba do hub | 2 | — | Manter |
| Estoque | `/admin/estoque` | Saldos, Kardex, ajuste | G D A | Sidebar (com badge) | 1 | "Produtos & Estoque" (análise) | Manter |
| Estoque | `/admin/estoque/movimentacoes` | Movimentações | G D A | Aba | 2 | Auditoria lê mesma fonte | Manter |
| Estoque | `/admin/estoque/recebimento` | Recebimento manual | G D A | Aba "Entradas" | 2 | Fluxo paralelo a Compras/OC e NF-e | **Conectar**, não fundir |
| Estoque | `/admin/estoque/importar-nfe` | Importação NF-e (4 fases) | G D A | Alias de "Entradas" | 2–3 | idem | Dar entrada própria na aba |
| Estoque | `/admin/estoque/transferencias` | Transferências | G D A | Aba | 2 | — | Manter |
| Estoque | `/admin/estoque/imprimir-etiquetas` | Etiquetas | G D A | Aba em **Catálogo e Estoque** | 2 | **Duplicidade de navegação** | Um dono (Produtos); atalho no Estoque |
| Compras | `/admin/compras` | Ordens de compra | G D A | Sidebar | 1 | Recebimento paralelo | Manter |
| Compras | `/admin/fornecedores` | Fornecedores | G D A | Sidebar | 1 | — | Manter |
| Financeiro | `/admin/financeiro` | 8 abas (resumo, receber, pagar, contas, PIX/cartões, conciliação, resultado, fiscal) | G D A | Sidebar | 1 | "Resultado" × view "DRE & Financeiro" | **Reduzir exposição** (agrupar) |
| Financeiro | `/admin/financeiro/contas-pagar` | redirect → `?tab=pagar` | G D A | URL antiga | — | Já resolvido | Manter redirect |
| Financeiro | `/admin/financeiro/documento/[id]` | Documento fiscal | G D A | Aba Fiscal | 3 | — | Manter |
| Financeiro | `/admin/categorias-financeiras` | Categorias financeiras | G D A | Só pelo hub Financeiro (9ª aba) | 2 | Parece cadastro de configuração | Mover acesso para Configurações (manter rota) |
| Pessoas | `/admin/clientes` | Clientes | G D A | Sidebar | 1 | — | Manter |
| Pessoas | `/admin/funcionarios` | Funcionários (perfil OPERADOR/GERENTE) | G D A | Sidebar | 1 | Sem link para comissões | Manter + link contextual |
| Pessoas | `/admin/comissoes` | Apuração e liquidação | G D A (`sensitive:comissoes`) | Sidebar | 1 | Sem link para funcionário | Mover para Financeiro/Pessoas; decidir |
| Auditoria | `/admin/auditoria` | Linha do tempo de eventos | G D A | Sidebar | 1 | View "CRM & Auditoria" mistura RFV com perdas | Manter única; separar de CRM |
| Config | `/admin/configuracoes` | Loja, Impostos, Preferências | G D A | Sidebar | 1 | — | Manter |
| Config | `/admin/suspensao` | Suspensão de vendas | G D A | Sidebar "Sistema" | 1 | — | Mover acesso para Configurações |
| Interno | `/admin/implantacao` | Gate GO-LIVE | **na prática G D A** (sidebar esconde) | Sidebar (ADMIN) / URL | 1 | — | Ver B.4 |
| Interno | `/admin/diagnostico-caixa` | Checklist pré-produção | **na prática G D A** | Sidebar (ADMIN) / URL | 1 | — | Ver B.4 |
| Interno | `/admin/provisionamento` | Criar loja + DONO | **A** (policy + página) | Sidebar (ADMIN) | 1 | — | Manter restrito |

Rotas fora de `/admin`: `/caixa` (PDV, único `page.tsx`), `/gerente` + `[...path]` (redirects), `/login`, `/auth/*` (3), `/termos`, `/privacidade`, `/demo-fluxo`.

## D. Problemas comprovados (resumo)

| # | Problema | Evidência |
|---|---|---|
| P1 | 20 itens visíveis na sidebar sem hierarquia entre cotidiano e raro | `adminV2SidebarNav.ts:99-192` (12 itens "Operações") |
| P2 | Análises (5 itens) ocupam o topo, acima do uso diário | `ExecutiveSidebarNav.tsx` ordem Análises → Operações → Sistema |
| P3 | Navegação das views duplicada (sidebar + barra interna) | `ExecutiveVisaoGeralStub.tsx`, `RelatoriosContent.tsx:693` |
| P4 | Item "Relatórios (detalhe)" rotulado como "legado" na própria sidebar | `adminV2SidebarNav.ts:185-191` |
| P5 | Financeiro com 9 controles de aba | `AdminHubTabNav.tsx` |
| P6 | Etiquetas em dois hubs | `catalogoHubNav.ts:15`, `estoqueHubNav.ts:20` |
| P7 | 20 de 32 páginas sem sub-navegação (3 são redirect/home); o usuário depende só do menu para mudar de contexto | `grep -rl HubNav app` |
| P8 | Sem busca global | grep |
| P9 | Rótulos de grupo e aria fixos em PT | `ExecutiveSidebarNav.tsx` |
| P10 | Falta de links entre Funcionários↔Comissões, Auditoria→Produto, Caixas→Vendas/Fechamento, Configurações→Suspensão | grep de links (seção B do `DUPLICIDADES_FRAGMENTACAO.md`) |
