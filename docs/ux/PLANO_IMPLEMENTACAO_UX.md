# Plano de Implementação UX (PRs incrementais)

**Pré-condição:** aprovação explícita deste conjunto de documentos. Nada abaixo foi implementado.
**Regras:** branch por PR a partir de `main`; sem merge automático; sem migrations; sem mudança em `lib/admin/policy/*`, RPCs, preços, estoque, caixa ou comissões; rotas e `?tab=`/`?view=` preservados.
Esforço: P (< 1 dia) · M (1–3 dias) · G (> 3 dias) — estimativa de engenharia, não medida.

Este plano **reordena** a sugestão da missão com base nas dependências reais: a fonte de verdade da sidebar (`adminV2SidebarNav.ts`) e os hubs (`HubTabDef`) já existem, então o ganho vem primeiro de reorganizá-los.

| PR | Escopo | Arquivos principais | Risco | Esforço | Critérios de aceite |
|---|---|---|---|---|---|
| **1 — Sidebar** | 9 destinos + "Abrir PDV" destacado; grupo "Interno" (só ADMIN) recolhido; rótulos de grupo e aria **via i18n PT/ZH** (hoje fixos em PT); remover item "Relatórios (detalhe)" **da sidebar** (a rota fica); 5 itens de relatórios → 1 | `adminV2SidebarNav.ts`, `ExecutiveSidebarNav.tsx`, `pt.json`/`zh.json`, testes `adminV2SidebarNav.test.ts`, `isAdminNavActive.test.ts`, `SidebarNav.behavior.test.tsx` | Baixo | M | Todas as 32 rotas continuam alcançáveis (teste que percorre `ROUTES`); GERENTE não vê "Interno"; ZH sem texto PT; sidebar ≤ 10 itens; nenhum diff em policy |
| **2 — Hubs novos + barra única de Relatórios** | Hubs Vendas (Vendas+Caixas), Compras (Pedidos+Fornecedores), Pessoas (Clientes+Funcionários), Configurações (+ atalhos). Remover barra interna duplicada de views. Etiquetas sai do hub Estoque (atalho mantido) | `lib/navigation/*HubNav.ts` (novos, mesmo padrão), `AdminHubTabNav.tsx`, páginas dos módulos (1 linha cada), `ExecutiveVisaoGeralStub.tsx` | Baixo–Médio | M | Cada página nova tem a barra do hub; `hubOperationalPaths.test.ts` e `hubNavLabels` atualizados; aba ativa correta em subrotas |
| **3 — Links contextuais faltantes** | Funcionário↔Comissões; Auditoria→produto/Kardex; Caixas→vendas do turno; Configurações→Suspensão/Cat. financeiras; Financeiro "Resultado"↔DRE | helpers em `routes.ts`, `AuditoriaTimeline.tsx`, `FuncionariosListClient.tsx`, `ComissoesDetailSheet.tsx`, `CaixasHistoricoTable.tsx` | Baixo | M | Cada link tem teste de href; sem consulta nova ao banco |
| **4 — Busca de destinos (Ctrl+K)** | Paleta com destinos e ações de navegação; lista **derivada do mesmo arquivo da sidebar**; filtrada por `canAccessRoute`; PT + ZH; acessível (aria, foco) | `AdminV2Shell.tsx`, novo `CommandPalette` em `components/ui/admin-v2` | Baixo | M | Sem chamada ao backend; teste: item negado por policy não aparece; funciona por teclado e leitor de tela |
| **5 — Financeiro: 9 → 6 controles** | Agrupar Contas/PIX-cartões/Conciliação com seletor secundário; Resultado como atalho/seção do Resumo; Comissões como aba que linka a rota | `FinanceiroHubNav` em `AdminHubTabNav.tsx`, `financeiroTabId.ts`, `FinanceiroWorkspace.tsx` | **Médio** (componente grande, testes de comportamento) | M–G | Todas as URLs `?tab=` antigas ainda abrem a vista certa; testes `Financeiro*.behavior.test.tsx` verdes sem alterar asserts de regra |
| **6 — Receber mercadoria (porta única)** | Tela de entrada com 3 caminhos; renomear "Entradas"; **sem tocar** nas ações/RPCs de conferência | `estoqueHubNav.ts`, `recebimento/page.tsx`, texto i18n | Médio | M | Nenhuma RPC/Action alterada (diff vazio em `actions.ts`/migrations); os 3 caminhos funcionam como hoje |
| **7 — Relatórios + Auditoria** | Tabela de equivalência aba-legado → painel; aposentar abas duplicadas só onde os dados coincidem; separar "CRM" e "Auditoria"; manter redirect de `?tab=` | `RelatoriosContent.tsx`, `executiveViews.ts` | Médio | G | Tabela de equivalência anexada ao PR e aprovada; nenhuma métrica perdida |
| **8 — Início: "Precisa de atenção"** (feature, não navegação) | Cartão com pendências usando leitores existentes (estoque baixo, vencidos, NF-e pendentes, caixas abertos) | `dashboard/page.tsx`, componentes de dashboard | Médio | M–G | Só leituras existentes; loja isolada por RLS; falha de uma fonte não derruba a página |
| **9 — Polimento** | Acessibilidade (foco, contraste, aria), ZH (quebras de layout, termos), performance, regressão visual | transversal | Baixo | M | Checklists de `PLANO_TESTES_USABILIDADE.md` |

## Dependências
1 → 2 → 3 (3 também pode ir logo após 1). 4 depende de 1 (fonte única). 5, 6, 7 são independentes entre si após 2. 8 independente. **PRs 1–3 entregam ~todo o ganho de achar-e-navegar com risco baixo.**

## Reversibilidade
Cada PR altera só *configuração de navegação* e componentes de apresentação; reverter = `git revert` do PR. Nenhum PR muda dado, contrato de API ou migration.

## Conflitos conhecidos a vigiar
- `scripts/boundary-ratchet-guard.mjs` e a regra "proibido `/admin/*` fora de `routes.ts`": usar sempre `ROUTES`.
- Testes de navegação existentes (listados no PR 1/2) codificam a estrutura atual; atualizá-los **no mesmo PR**.
- Há PR/branches de outras sessões tocando `lib/navigation/*` (verificar `git log` antes de abrir cada PR).
