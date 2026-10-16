# Auditoria de redundâncias e simplificação — OpenCode

Data: 2026-10-11. Branch `audit/opencode-ux-simplificacao`, criada a partir de `origin/main` (`76d4b400`, já com o UX-01 mesclado no PR #538), num worktree separado (`C:\Naturecode\fastproduct-opencode-ux`). O checkout principal estava em `audit/ux-01-conclusao` com `LanguageToggle.tsx` e `actions.ts` modificados e não commitados; nada lá foi tocado.

Fora do escopo, por instrução: `page.paginacao.test.ts`, a RPC de produtos, migrations e qualquer banco remoto.

## Método

Leitura de código em `pdv-importados`, contagem de consumidores por `rg` e testes Vitest. Não houve sessão autenticada no browser, então nada abaixo foi conferido na tela. Cada item diz se a evidência é **código** (comprovado) ou **visual** (precisa ser validado na tela).

Skills usadas: `frontend-design` e `react-best-practices`. Não existem neste ambiente: `ui-ux-audit`, `information-architecture`, `design-system`, `accessibility-audit`.

A sprint UX-01 (`docs/ux/SPRINT-UX-01-*.md`) já resolveu o Limpar do catálogo, os atalhos repetidos de cabeçalho, os placeholders de compras e fornecedores, os chips sem `aria-label` e o vazio da fila fiscal. Esses itens não se repetem aqui.

## Classificação

- **P0**: o operador pode registrar algo errado ou não consegue concluir a tarefa.
- **P1**: retrabalho, operação duplicada ou idioma errado em texto visível.
- **P2**: inconsistência, acessibilidade ou manutenção.

## 1. Componentes redundantes e código morto

| ID | Sev. | Achado | Evidência | O que preservar |
|----|------|--------|-----------|-----------------|
| R-01 | P2 | A pasta `components/gerente/cadastro/` inteira não tem consumidor: `CadastroFormModal`, `CadastroRapidoBlock`, `CadastroRowActions`, `ConfirmExcluirCadastroModal`, `FiltroLateralCadastro`, `useCadastroListState`. Só o `index.ts` e o relatório `reports/jscpd` os citam. | código | As telas de categorias, marcas e funcionários já usam `CrudListShell` + `DataTable` + `Button size="icon"`. A pasta pode ser removida depois de confirmação. |
| R-02 | P2 | `app/gerente/vendas/VendaActionsMenu.tsx` não tem consumidor. É o único `MoreVertical` do app. | código | O menu de linha do catálogo (`CatalogoTable.tsx`, `MoreHorizontal` + `role="menuitem"`) é o padrão atual. |
| R-03 | P2 | `OperationalQuickActions.tsx` sem consumidor. Já anotado no UX-01, que decidiu não apagar. | código | — |
| R-04 | P2 | `OriginBadge` e `DeltaChip` em `components/ui/badges.tsx` são exportados e não usados. | código | Manter `VendaStatusBadge`, `PaymentBadge`, `FiscalBadge`, que têm consumidores. |
| R-05 | P2 | Três famílias de selo de status: `StatusChip` (11 arquivos), `StatusBadge` de tom do admin-v2 (6), e `<span className="admin-v2-badge-*">` montado à mão (10 arquivos, por exemplo categorias financeiras e compras). | código | `StatusBadge` do admin-v2 para telas `/admin`. `StatusChip` pode continuar onde o status vem de enum do domínio. Os spans soltos deveriam virar `StatusBadge`. |
| R-06 | P2 | Duas buscas com aparência diferente: `SearchControl` interno do `FilterBar` (URL, debounce, estilos inline) e `SearchInput` de `forms` (`fp-search`, estado local). Compras usa um `<input>` cru (`ComprasContent.tsx:301`). | código + visual | **Não é duplicação funcional**: uma grava na URL, a outra filtra estado local. O que diverge é o visual. Unificar só o estilo, apontando o `SearchControl` para as classes `fp-search`. |
| R-07 | P2 | Três padrões de confirmação destrutiva: `window.confirm` (`FinanceiroContas.tsx:178`, exclusão em lote em `FornecedoresListClient.tsx:209`, descartar em `ClienteEditarModal.tsx:98` e `FornecedorEditarModal.tsx:47`), `ConfirmActionButton` (fornecedores, detalhe fiscal) e `DragonModal` (clientes). | código | `DragonModal` com texto traduzido. `window.confirm` mostra o título do navegador e não segue o idioma do operador. |
| R-08 | P2 | Editar usa `Edit2` em categorias, marcas e OC, e `Pencil` em catálogo, clientes, fornecedores e funcionários. | código | `Pencil`, que é o da maioria e o das telas de maior uso. |

Não classificado como redundância:

- `FilterBar` e `SearchInput`: consultas diferentes (ver R-06).
- `PageHeader` e `ExecutivePageHeader`: o segundo só aparece em dashboard e relatórios, com período e KPIs. Contrato diferente.
- Abas de etiquetas no catálogo e no estoque: o mesmo destino é intencional (`hubNavEtiquetas.regression.test.ts`).

## 2. Experiência operacional por módulo

### Financeiro

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| F-01 | P1 | **Mesma operação em três lugares na aba "A pagar"**. Pagar um título: botão "Pagar" das ações rápidas (`FinanceiroAcoesRapidas.tsx:160`, `BAIXAR_AP`), botão por linha com `PagamentoModal` (`ContasPagarListClient.tsx:581`, `:609`) e formulário "Pagar" no fim da página (`FinanceiroTitulosOperations.tsx:28`, `BAIXAR_AP`). Criar despesa: ações rápidas (`FinanceiroAcoesRapidas.tsx:176`, `CRIAR_AP`) e "Nova despesa" no fim (`FinanceiroTitulosOperations.tsx:11`, `CRIAR_AP`). | código |
| F-02 | P1 | **"Receber" por linha manda o operador rolar e escolher o título de novo**. O botão da tabela é um link para `#baixa-conta-financeira` (`ContasReceberTable.tsx:141`), que é o formulário do fim da página com um `<select>` "Título desta página". O título clicado não chega pré-selecionado. As ações rápidas oferecem o mesmo `BAIXAR_AR`. | código |
| F-03 | P1 | `FinanceiroTitulosOperations.tsx` tem todos os rótulos fixos em português ("Nova despesa", "Pagar", "Classificar título", "Título desta página"). Aparece nas abas Receber e Pagar (`FinanceiroContent.tsx:198`). | código |
| F-04 | P1 | Categorias financeiras com todo o texto fixo em português e o tipo cru do banco (`DESPESA`). **Corrigido nesta entrega** (seção 4). | código |
| F-05 | P2 | Categorias financeiras mostra "Página 1 de N" quando há mais de 50, sem controle de página. A página carrega `pageSize: 50` e o resto fica inacessível. | código |
| F-06 | P2 | Na mesma tela, o formulário de edição aparece no topo do card, longe da linha clicada. | visual |

Recomendação para F-01/F-02: manter o botão por linha como caminho principal (o operador já está no título), abrir a baixa com o título pré-selecionado e retirar o formulário de baixa do fim da página. As ações rápidas continuam como atalho para quem chega sem um título em mente. Antes, confirmar que `PagamentoModal` e `BAIXAR_AP` gravam pelo mesmo writer. Isso toca o Financeiro e precisa de teste de regressão de baixa, por isso não entrou nesta entrega.

### Produtos (catálogo)

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| P-01 | — | Depois do UX-01, a linha tem Editar, Etiqueta e o menu (Duplicar, Excluir). Os botões têm `aria-label` com o nome do produto. Sem achado novo. | código |
| P-02 | P2 | Duas barras de filtro (`CatalogoFiltrosBar.tsx:44` e `:69`). O UX-01 alinhou o Limpar. Vale validar se a barra avançada disputa espaço com a tabela em telas de 1366px. | visual |

### Estoque

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| E-01 | P1 | Até quatro botões com texto por linha (Repor, Ajuste, Kardex, Etiquetas), em `flex-wrap` (`EstoqueTable.tsx:214-282`). Com nomes longos, ou em chinês com fonte maior, a coluna de ações pode quebrar em duas linhas e empurrar saldo e mínimo. | código + visual |

Recomendação: manter Ajuste e Repor visíveis (são as ações do estoque) e mover Kardex e Etiquetas para o menu de linha no mesmo padrão do catálogo. Só depois de ver a tela.

### Clientes

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| C-01 | P2 | Editar e Excluir só com ícone, mas com `aria-label` e `title` traduzidos (`ClientesListClient.tsx:424-438`). Exclusão confirma em `DragonModal`. Bom padrão, serve de referência. | código |
| C-02 | P2 | Descartar alterações do modal usa `confirm()` nativo (`ClienteEditarModal.tsx:98`). Ver R-07. | código |

### Vendas

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| V-01 | P1 | Continua sem busca textual por cliente ou código. Depende da RPC `listar_vendas_gerente`, adiada no UX-01 por exigir migration. | código |

### Compras

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| O-01 | P2 | Busca é `<input>` cru, fora do `FilterBar` e do `SearchInput` (`ComprasContent.tsx:301`). Ver R-06. | código |

### Componentes compartilhados

| ID | Sev. | Problema | Evidência |
|----|------|----------|-----------|
| S-01 | P2 | `FilterBar` ainda tem texto acessível fixo em português: `aria-label="Limpar busca"` (`FilterBar.tsx:327`) e o sufixo `" (ativo)"` nas pills (`:208`). O sufixo também é redundante, porque `aria-pressed` já anuncia o estado. Leitor de tela em chinês lê português. | código |

## 3. O que exige validação visual

E-01, F-06 e P-02 dependem da tela renderizada, em português e em chinês, em 1366px e em tablet. O resto da tabela acima vem do código.

## 4. Melhoria implementada

**Tradução da tela `/admin/categorias-financeiras`** (F-04).

Escolha. Era o único problema comprovado no código que (a) mostra texto errado ao operador em chinês, não só ao leitor de tela, (b) se resolve sem nova abstração, porque `getMessages` já mescla `cadastro_comum` em `categorias_financeiras` e nenhuma tela usava esse resultado, e (c) não toca escrita financeira. F-01 e F-02 têm mais impacto, mas mexem em baixa de títulos e pedem validação de writer e de tela.

O que mudou:

- `page.tsx` lê o idioma da sessão, usa `admin_ui.financeiro_titulo` no cabeçalho (o mesmo do hub Financeiro) e repassa `idioma` ao cliente, no mesmo padrão de `marcas-produtos/page.tsx`.
- `CategoriasFinanceirasContent.tsx` troca todo o texto fixo por chaves existentes: colunas, tipo traduzido em vez de `DESPESA`, situação, "Inativar/Ativar" (o mesmo verbo de marcas e categorias de produto, que antes era "Desativar"), "Incluir categoria", rótulos e placeholders, salvar, cancelar.
- Botões só com ícone ganharam `title` traduzido e `type="button"`. Os ícones ficaram `aria-hidden`.
- O vazio com emoji 💰 virou `EmptyState`, como a fila fiscal no UX-01. O texto antigo mandava "usar o campo acima", que só existe depois de clicar em Incluir.
- Quatro chaves novas em `categorias_financeiras`, nos dois JSON: `subtitulo`, `status_ativa`, `status_inativa`, `paginacao_resumo`.

Não mudou: actions, consultas, permissões, a lógica de criar/editar/inativar, a paginação (F-05 continua aberto) e a mensagem de erro que vem do servidor.

Critérios de qualidade:

| Pergunta | Resposta |
|----------|----------|
| Resolve um problema comprovado? | Sim. O teste novo falha nos 5 casos contra o código anterior. |
| Reduz complexidade? | Tira os textos fixos e o bloco de `<option>` repetido nos formulários de criar e editar. Usa o mecanismo de i18n que já existia. |
| Melhora a experiência do operador? | O operador em chinês passa a ler a tela no idioma dele. O verbo de inativar fica igual ao das telas irmãs. |
| Preserva a arquitetura? | Sim. Mesmo padrão de idioma da tela de marcas. Nenhum componente ou dependência nova. |
| Evita regressões? | Teste de comportamento novo e suítes do financeiro e i18n verdes. |

## 5. Testes executados

Comandos em `pdv-importados`, nesta sessão, no worktree da branch.

| Comando | Resultado |
|---------|-----------|
| `npx vitest run app/admin/categorias-financeiras` com o componente antigo (stash temporário) | 5 de 5 falharam, como esperado. |
| `npx vitest run app/admin/categorias-financeiras src/lib/i18n app/admin/configuracoes/.../ConfiguracoesContent.trocaAba.behavior.test.tsx app/admin/financeiro` | 14 arquivos, 72 testes, todos passaram. |
| `npm run typecheck` | saiu 0. |
| `npm run lint` | saiu 0. |
| `npm run check:entity-ssot` | OK, 0 avisos. |
| `npm test` (suíte completa) | 372 arquivos passaram, 2 ignorados, 1 falhou. 2354 testes passaram, 7 ignorados. |

A falha da suíte completa é `app/admin/produtos/productUpdater.semRpc.integracao.test.ts`: `insert produto: Expected 3 parts in JWT; got 1`. Ela falha igual no `main` sem as minhas mudanças (conferido com `git stash -u`). O teste aponta para o Supabase local fixo (`127.0.0.1:54321`) e usa a chave placeholder quando `SUPABASE_SERVICE_ROLE_KEY` não está definida. A falha acontece no insert (linha 140), antes do `DROP FUNCTION` da linha 147, então a RPC local não foi removida. O arquivo pertence à correção da RPC de produtos e não foi alterado.

Não executado:

- Comparação visual antes e depois. Não havia sessão autenticada nem servidor de desenvolvimento confiável (o UX-01 registrou o `next dev` antigo travado na porta 3000).
- Playwright.
- `npm run build`.

## 6. Arquivos modificados

Commit `36e51f9f` — `fix(i18n): traduz a tela de categorias financeiras`

- `pdv-importados/app/admin/categorias-financeiras/page.tsx`
- `pdv-importados/app/admin/categorias-financeiras/_components/CategoriasFinanceirasContent.tsx`
- `pdv-importados/app/admin/categorias-financeiras/_components/CategoriasFinanceirasContent.behavior.test.tsx` (novo)
- `pdv-importados/src/lib/i18n/pt.json`
- `pdv-importados/src/lib/i18n/zh.json`

Este relatório vai num commit separado, logo depois.

## 7. Próximas recomendações

1. **F-01/F-02 (P1)**: um caminho só para baixar título no Financeiro, com o título pré-selecionado a partir da linha. Começar confirmando que `PagamentoModal` e `BAIXAR_AP` usam o mesmo writer.
2. **F-03 (P1)**: traduzir `FinanceiroTitulosOperations.tsx`, ou removê-lo se o item 1 for feito.
3. **E-01 (P1)**: validar a coluna de ações do estoque na tela, em chinês, e só então decidir o menu de linha.
4. **S-01 (P2)**: passar o texto acessível do `FilterBar` por prop, como o UX-01 já fez com `ariaLabel` e `clearAriaLabel`, e retirar o sufixo `(ativo)`.
5. **R-01 a R-04 (P2)**: remover o código morto, com confirmação explícita, conforme a regra de governança.
6. **R-07 (P2)**: trocar os `window.confirm` restantes por `DragonModal` traduzido.
7. **F-05 (P2)**: paginação real em categorias financeiras, ou deixar de prometer "Página 1 de N".
