# Relatório de Homologação e Matriz Final — Sprint UX-IA-01

| Campo | Valor |
|---|---|
| Data | 2026-10-08/09 |
| Escopo | PRs #509, #510, #511, #512 (empilhados) |
| Ambiente | **Local e isolado**: Supabase local (`supabase start`, 401 migrations + `seed.sql`) + `next dev` em `localhost:3000`. Usuários de teste do seed (`*.seed@local.test`) + um ADMIN criado só nesse banco. **Nenhuma produção, nenhuma migration remota, nenhum deploy, nenhum merge.** Stack, servidor e `.env.local` foram removidos ao final. |
| Limites | Dados de teste vazios (listas sem vendas/produtos reais). `next dev` compila por rota (tempos não representam produção). Perfil DONO foi exercitado só por API/RLS, **não por navegação visual**. Mobile verificado no layout abaixo do breakpoint `lg` (pane ~800 px, menu em gaveta), **não** em 375 px nem em dispositivo real. Leitor de tela e Mac (Cmd+K) não testados. |

## 1. O que foi verificado

### 1.1 Cobertura de rotas como GERENTE (HTML renderizado de cada rota, com sessão real)
26 rotas `/admin` consultadas; **todas devolveram 200**, com o destino correto ativo na sidebar e a barra de abas certa:

| Grupo | Resultado |
|---|---|
| Vendas · Caixas | destino **Vendas** ativo nas duas; aba correta marcada |
| Produtos · Categorias · Marcas · Etiquetas | destino **Produtos** ativo; aba correta |
| Estoque (Saldos, Entradas, Movimentações, Transferências, Etiquetas, Importar NF-e) | destino **Estoque** ativo; "Entradas" marcada também em Importar NF-e |
| Compras · Fornecedores | destino **Compras** ativo; aba correta |
| Clientes · Funcionários | destino **Pessoas** ativo; aba correta |
| Financeiro (`?tab=pagar`, `?tab=conciliacao`) e Categorias financeiras | destino **Financeiro** ativo; 9 controles de aba preservados (PR 5 ainda não implementado) |
| Comissões | sub-link **Comissões** ativo (grupo Financeiro aberto) |
| Relatórios (base e 3 views), Auditoria, Configurações, Suspensão | item/sub-link correto ativo |
| `/admin/financeiro/contas-pagar` | 200 (redirect para `?tab=pagar` mantido) |

### 1.2 Interação (navegador)
| Verificação | Resultado |
|---|---|
| Sidebar desktop do GERENTE: 9 destinos + "Abrir PDV" + "Buscar… Ctrl K"; sem grupo Interno | OK |
| Menu em gaveta (mobile) em PT e **ZH** (rótulos em chinês com português abaixo; botão 前往收银) | OK |
| Hub de abas em ZH (销售 / 收银历史) | OK |
| Ctrl+K em PT: "contas a pagar" → **A pagar · Financeiro** | OK |
| Ctrl+K em ZH digitando em português ("estoque") | **achava só 2 itens → corrigido** (ver §2) |
| Funcionários → link "Comissões" por linha (só OPERADOR/GERENTE; DONO sem link) → abre `/admin/comissoes?operador=…`, grupo Financeiro aberto | OK (operador sem comissão no período: abre a lista vazia, sem aviso — ver §3) |
| Configurações: atalhos "暂停销售 · 财务分类" sob o título, 3 abas preservadas | OK |
| ADMIN: grupo **Interno** (Provisionamento, Implantação, Diagnóstico) e paleta acha "Provisionamento" | OK |
| GERENTE em `/admin/provisionamento`: só a mensagem "somente ADMIN" (sem wizard) | OK |
| OPERADOR em `/admin/implantacao`, `/diagnostico-caixa`, `/comissoes`: redireciona para `/caixa` | OK |

### 1.3 Permissões reais (API/RLS, local)
Detalhe em `INVESTIGACAO_AUTORIZACAO_IMPLANTACAO_DIAGNOSTICO.md`. Resumo: anon e OPERADOR bloqueados no Diagnóstico e no checklist; isolamento entre lojas preservado; **GERENTE consegue gravar `go_autorizado` direto na API (risco MÉDIO, fora do escopo de UX)**; Implantação e Diagnóstico abrem por URL para GERENTE (por desenho atual).

## 2. Defeitos encontrados na homologação e corrigidos

| # | Defeito | Onde | Correção |
|---|---|---|---|
| H1 | Em chinês, as **dicas (tooltip)** dos itens da sidebar saíam em **português** (`item.hint` tinha prioridade sobre o dicionário traduzido). Dica de Relatórios descrevia a estrutura antiga. | PR 1 (#509) | Em ZH vale o dicionário; PT usa o hint do item; dica de Relatórios atualizada. Teste novo. Propagado por merge nos PRs #510–#512. |
| H2 | Com a UI em chinês, digitar "estoque" na paleta não achava as abas do Estoque (grupo só em chinês). | PR 4 (#512) | Entradas carregam o nome do grupo em português como termo de busca. Teste novo. |

Nenhum dos dois seria pego pelos testes unitários originais — foram achados vendo a tela e a árvore de acessibilidade.

## 3. Achados NÃO corrigidos (registrados)

| # | Achado | Tipo | Encaminhamento |
|---|---|---|---|
| N1 | `go_autorizado` forjável por GERENTE (RLS) | Segurança, **médio** | PR de segurança separado com migration revisada (`INVESTIGACAO…` §5) |
| N2 | Implantação/Diagnóstico abrem por URL para GERENTE | Decisão de produto | Decidir restringir ou documentar |
| N3 | Ir a Comissões por um funcionário sem comissão no período abre lista vazia, sem dizer que o funcionário foi pedido | UX menor | Aviso "sem comissões deste funcionário no período" (PR pequeno, sem dado novo) |
| N4 | Botão "Sair" do cabeçalho e "Sair" em ZH ficam em português; título da página Financeiro ("Financeiro e fiscal") difere do menu ("Financeiro"); `/admin/vendas` tem h1 "Vendas e caixa" × aba "Vendas" | Consistência pré-existente | Polimento (PR 9), com cuidado: o e2e usa o h1 "Vendas e caixa" |
| N5 | Sub-link "Suspensão de vendas" aparece na sidebar **e** como atalho na página de Configurações | Redundância leve | Manter até decidir (PR 9) |
| N6 | Teste de integração `produtosFiscalEdicao.integration.test.ts` ativa-se sozinho quando existe `.env.local` e falha com `fetch failed` | Dívida de teste | Não relacionado; foi removido o `.env.local`. Vale tornar o teste explícito (`RUN_INTEGRATION`) |

## 4. Matriz final

| PR | Escopo | Testes (vitest/tsc/eslint) | Verificação em homologação | Regressões | Riscos | Dependências | Decisão |
|---|---|---|---|---|---|---|---|
| **#509** PR 1 | Sidebar de 9 destinos + Abrir PDV + Interno | Suíte completa verde (351 arq./2.179 testes na abertura); +2 testes do fix H1; `tsc`/`eslint` limpos | GERENTE desktop e gaveta PT/ZH; ADMIN; OPERADOR redirecionado | H1 (tooltip ZH) — **corrigido** | Rótulos ZH novos sem revisão nativa; e2e não executados | Nenhuma (primeiro da fila) | **GO COM RESSALVAS** (revisão ZH) |
| **#510** PR 2 | Hubs Vendas/Compras/Pessoas; barra única de Relatórios | 352 arq./2.189 testes; +10 | 26 rotas com item ativo e aba certa | — | Barra de views removida de Relatórios (permanece no Início) | #509 | **GO** |
| **#511** PR 3 | Funcionários→Comissões; atalhos em Configurações | 355 arq./2.201 testes; +13 | Link por perfil e deep-link; atalhos em ZH | N3 (UX menor) | `?operador=` só escolhe qual detalhe abrir; mesma leitura de dados | #510 | **GO** |
| **#512** PR 4 | Ctrl+K (destinos e ações, sem banco) | 357 arq./2.228 testes na abertura; +1 teste do fix H2 | PT, ZH, ADMIN | H2 — **corrigido** | Atalho interceptado em todo `/admin`; Cmd+K e leitor de tela não testados | #511 | **GO COM RESSALVAS** (testar Mac e leitor de tela) |
| **PR 5** Financeiro 9→6 | — | — | — | — | Médio (`FinanceiroWorkspace`) | Aprovar D3–D5 da tabela de equivalência | **NO-GO** até aprovação |
| **PR 6** Receber mercadoria | **Cancelado** — já existe ("Como chegou?", `?modo=pedido&oc=`) | — | Verificado no código e em `/admin/estoque/recebimento` (200, aba Entradas ativa) | — | — | — | **N/A** |
| **PR 7** Relatórios | — | — | — | — | Médio-alto: 6 conteúdos sem equivalente (R2, R6, R7, R8, R11, R14) | Aprovar D1–D2; migrar os conteúdos | **NO-GO** |
| **PR 8** "Precisa de atenção" | Funcionalidade, não navegação | — | — | — | Médio | Independente | **Não iniciado** |
| **PR 9** Polimento | N3–N5 + i18n/acessibilidade | — | — | — | Baixo | Após #509–#512 | **Pendente** |
| **Segurança** (separado) | N1/N2 | — | Reproduzido localmente | — | **Médio** | Decisão de produto + migration com gate humano | **GO para abrir PR de segurança próprio** |

### Ordem de merge
`#509 → #510 → #511 → #512`. Após cada merge, retarget do PR seguinte para `main`. **Antes de #509:** revisão dos termos ZH e olhada visual da sidebar por alguém do produto.

### Check do Vercel
O check vermelho `Vercel – jinlong-site` é externo a esta sprint: o projeto aponta para o Root Directory `site`, que não existe nestas branches (também falha no `main`). O projeto `pdv-importados` é "Canceled by Ignored Build Step", portanto **não há preview do painel**; esta homologação local supre a verificação.

## 5. A sprint está concluída?

**Não, e não por causa do número de itens da sidebar.** Resultado por jornada:

| Jornada | Antes | Agora | Falta |
|---|---|---|---|
| A Venda (PDV) | 1 tela | inalterada (intencional) | — |
| B Produto novo | 2 módulos | inalterada; ainda esconde o preço de atacado em "Mais detalhes" | tornar o atacado visível (fora da navegação) |
| C Comprar/receber | 4 módulos | o recebimento já era porta única; Compras e Fornecedores agora na mesma barra; Ctrl+K "receber mercadoria" | Vínculo Compras↔Financeiro a verificar |
| D Fechar caixa | 2 telas | Caixas ao lado de Vendas | **Caixa→vendas do turno** (precisa de filtro no banco) |
| E Funcionários | 2 telas, sem link | link Funcionários→Comissões | Comissões→Funcionário |
| F Dono | 4–5 módulos | Início com atalhos para as análises | cartão "Precisa de atenção" (PR 8) |
| G Auditoria | 2 telas | Auditoria dentro de Relatórios; Kardex↔Auditoria já existia | — |

**Cliques e tempos não foram medidos.** A meta de −25% continua sem baseline; o teste de usabilidade (`PLANO_TESTES_USABILIDADE.md`) segue pendente.
