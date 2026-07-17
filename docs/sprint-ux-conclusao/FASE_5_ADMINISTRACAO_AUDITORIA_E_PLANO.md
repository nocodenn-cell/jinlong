# Fase 5 — Administração: auditoria completa e plano de execução

**Status: FECHADA — 100% (código; nenhuma migração de banco necessária nesta fase).**
Autorizada e executada em 2026-07-17.

> ✅ Todas as 8 entregas foram concluídas.
> Ver seção "Fechamento" ao final deste documento para evidências.

Fases anteriores (Produtos, Estoque, Financeiro, Clientes) já estão 100%
fechadas (código + banco). Esta fase cobre os 7 sub-módulos do Admin V2 sob
`/admin/*` (com seus pares de implementação em `/gerente/*`): Auditoria,
Categorias de Produtos, Categorias Financeiras, Comissões, Configurações,
Diagnóstico de Caixa e Suspensão de Vendas.

Auditoria feita com uma combinação de agente de pesquisa (read-only,
checklist de bug-patterns já estabelecido nesta sessão) sobre os 7
sub-módulos (3.053 LOC) e verificação direta (leitura completa dos arquivos)
do achado de maior severidade (Suspensão).

## 1. Funcionalidades previstas (o que já existe hoje)

| Funcionalidade | Onde | Status |
|---|---|---|
| Timeline de auditoria (eventos de venda/estoque/financeiro/usuário) | `app/admin/auditoria/` (869 LOC) | Completo, sem i18n |
| CRUD de categorias de produtos | `app/admin/categorias-produtos/` (302 LOC) | Completo, sem delete/busca/paginação real |
| CRUD de categorias financeiras | `app/admin/categorias-financeiras/` (278 LOC) | Completo, sem busca/paginação real |
| Listagem e pagamento de comissões | `app/admin/comissoes/` (418 LOC) | Completo, i18n já feito, sem filtro real de período/status |
| Configurações da loja/PDV (dados fiscais, preferências) | `app/admin/configuracoes/` (628 LOC) | Completo, exceto `tema_padrao` (inacessível) |
| Diagnóstico de caixa pré-produção | `app/admin/diagnostico-caixa/` (430 LOC) | Completo, ferramenta técnica p/ engenheiros |
| Suspensão global de vendas (kill-switch) | `app/admin/suspensao/` (128 LOC) | Completo, mas com bug crítico de leitura silenciosa |

## 2. Dependências (quem consome o módulo)

- **Suspensão de vendas** é lida pelo fluxo de checkout do Caixa/PDV antes de
  permitir finalizar uma venda — é o único sub-módulo desta fase com
  potencial de bloquear operação de loja em tempo real caso o estado fique
  inconsistente.
- **Categorias de Produtos/Financeiras** são referenciadas por FK em
  `produtos.categoria_id` e `contas_pagar/contas_receber.categoria_id` —
  qualquer UI de exclusão precisa respeitar a mesma regra de integridade já
  aplicada no backend (a ação `excluirCategoriaProduto` já existe e já trata
  isso; só falta rota que a chame).
- **Comissões** lê de `venda_comissoes`/`vendedores`, gerado a partir de
  vendas já finalizadas — somente leitura + ação de marcar como pago.
- **Auditoria** é somente leitura sobre `venda_eventos`, `estoque_eventos`,
  tabelas de log — não escreve em nada.
- **Configurações** grava em `lojas`/`pdv_config`, lido pelo Caixa/PDV
  (formas de pagamento habilitadas, dados fiscais no cupom) — mudanças aqui
  afetam checkout em produção assim que salvas.
- **Diagnóstico de Caixa** é uma ferramenta interna de pré-produção, sem
  consumidor downstream.
- **`pdv-local` (Tauri/desktop):** nenhuma dependência direta — nenhum dos 7
  sub-módulos desta fase tem equivalente no cliente desktop.

Nenhum consumidor depende de um contrato que este plano altere: todas as
correções abaixo são de exposição de erro, i18n, acessibilidade ou UI
ausente — nenhuma remove/renomeia coluna, função ou rota já usada por outro
módulo.

## 3. Bugs/gaps reais encontrados (evidência, arquivo:linha)

### Suspensão de Vendas — maior severidade da fase
1. **`app/admin/suspensao/page.tsx:12-13`** — `const status = res.success ? res.data : { suspensas: false, motivo: '' }`. Uma falha de carga de qualquer tipo (RLS, rede, timeout) renderiza "Vendas estão ATIVAS" sem qualquer indicação de erro, independente do estado real. Verificado por leitura direta do arquivo completo (15 linhas).
2. **Consequência de escrita real, não só UX:** se o admin clicar "Salvar" nesse estado (achando que está confirmando o estado atual), `SuspensaoContent.tsx:26` chama `atualizarSuspensaoVendas(false, '')` — reativa vendas ativamente, podendo desfazer uma suspensão real que existia por um motivo operacional legítimo. É uma escrita que corrompe estado de negócio disparada por um erro de leitura silenciado, não um mero nitpick visual.
3. **`app/gerente/suspensao/actions.ts:26` e `:57`** — `if (error) return { success: false, error: error.message }` devolve o erro Postgres bruto, ao contrário de todo módulo irmão que roteia por `mensagemErroComSecao`/`mensagemErroParaUsuario`. Renderizado verbatim em `SuspensaoContent.tsx:28,91-93`. Confirmado por leitura direta (primeiras ~100 linhas do arquivo).
4. **Zero i18n** — confirmado (nenhuma namespace `suspensao` existe em `pt.json`/`zh.json`; leitura direta confirma zero `import` de i18n em `SuspensaoContent.tsx`).

### Categorias de Produtos
5. **`page.tsx:36`** — `res.success ? res.data : { rows: [], total: 0 }` — nem sequer existe uma variável `loadError` (pior que os demais módulos: nenhum banner é possível hoje).
6. **`CategoriasProdutosContent.tsx:134-142`** — botão de Editar é ícone-apenas, sem `aria-label`/`title` (o botão de toggle-ativo ao lado, linha 130, tem `title`; inconsistência local).
7. **`CategoriasProdutosContent.tsx:245-249`** — rodapé de paginação hardcoda "Página 1 de X" sempre; `page.tsx:25,31` já lê/passa o parâmetro `page` para o servidor, mas o client nunca oferece next/prev — categorias além das primeiras 50 são inatingíveis pela UI.
8. **`page.tsx:26-27`** lê `sp.situacao`/`sp.q` e passa para a action, mas `CategoriasProdutosContent.tsx` não renderiza campo de busca nem filtro de status — funcionalidade already-wired no servidor, inatingível na UI.
9. **`excluirCategoriaProduto`** (`app/gerente/categorias-produtos/actions.ts:101-143`) existe e é exportada, mas seu único chamador é o componente morto `CategoriasProdutosPageClient.tsx` (ver item 23) — hoje não existe **nenhum** caminho na aplicação para excluir uma categoria de produto.

### Categorias Financeiras (bugs-gêmeos, mesmas linhas relativas)
10. **`page.tsx:31`** — mesmo padrão de erro-descartado do item 5.
11. **`CategoriasFinanceirasContent.tsx:115-124`** — botão Editar ícone-apenas sem nome acessível.
12. **`CategoriasFinanceirasContent.tsx:226-230`** — "Página 1" hardcoded, sem next/prev.
13. **`page.tsx:23`** — filtro `busca` parseado no servidor, sem campo de busca na UI.
14. **Zero i18n** confirmado.

### Comissões
15. **`page.tsx:47`** — `res.success ? res.data : []` — falha na carga inicial da página é silenciada (só ações client-side de marcar-como-pago/detalhe têm tratamento de erro em `ComissoesContent.tsx`).
16. **`page.tsx:42-44,69-71`** calcula período/status e até os exibe como texto somente-leitura (`ComissoesContent.tsx:197`, "Período: ... · Status: ..."), mas não existe date picker/dropdown/prop `filters` em lugar nenhum — gerente fica preso em "últimos 30 dias, todos os status" a menos que edite a URL manualmente.

### Configurações (628 LOC — precisa decisão de produto)
17. **`page.tsx:29-52`** — as duas queries iniciais (`Promise.all` de `lojas`/`pdv_config`) nunca desestruturam `error`; falha de carga inicial renderiza formulário vazio/default silenciosamente (só falhas de *submit* têm `lojaErro`/`pdvErro`).
18. **`tema_padrao` é totalmente inacessível na UI** apesar de ter i18n completo já cabeado ponta a ponta (`labels.prefs.tema` em `page.tsx:110`, tipo em `ConfiguracoesContent.tsx:62`, labels de enum em `page.tsx:128-131`) — a aba Preferências só renderiza um `<input type="hidden">` fixo (`ConfiguracoesContent.tsx:344,414`); confirmado via grep que não existe `<select>` em lugar nenhum do arquivo. **Decisão de produto, não de engenharia:** construir o seletor real ou remover os labels mortos.
19. Dois checkboxes placeholder permanentemente `disabled` sem explicação (`checkLembrete`/`checkResumo`, `ConfiguracoesContent.tsx:448-455`) — severidade mínima.

### Diagnóstico de Caixa (prioridade baixa)
20. **`loadAdminContext` chamado duas vezes por carregamento de página** — `page.tsx:9-12` e novamente dentro de `executarDiagnosticoCaixaPreProducao` (`diagnosticoCaixa.impl.ts:186-189`) — redundância de baixa severidade, sem impacto funcional.
21. Zero i18n confirmado, mas julgado baixa prioridade: é uma ferramenta técnica de diagnóstico pré-produção para engenheiros, não uma tela operacional de loja. O texto de erro Postgres bruto em `diagnosticoCaixa.impl.ts:174` foi deliberadamente **não** sinalizado como bug pelo mesmo motivo.

### Auditoria (869 LOC — maior volume de i18n da fase)
22. **`app/admin/auditoria/actions.ts:141,144` (e 183-184, 240-241, 278-279, 312-313)** — 5 blocos de query separados fazem `const rows = error ? [] : (data ?? [])`, descartando o erro por-fonte mesmo com `page.tsx` já tendo um banner `loadError` pronto e cabeado — uma falha real numa fonte aparece silenciosamente como "0 eventos" naquela categoria, sem sinalizar a falha real.
23. **`AuditoriaTimeline.tsx:166-252` (`AuditoriaDetailSheet`)** é um dialog artesanal (`role="dialog"`, Escape, scroll-lock) sem focus-trap real (sem foco inicial, sem restauração de foco, Tab não é contido) — deveria usar `DragonModal`, como os componentes irmãos `KardexSheet.tsx`/`DocumentoFiscalDetailSheet.tsx` já fazem.
24. Zero i18n confirmado em ambos os arquivos — maior volume de tradução pendente da fase inteira.

### Cross-cutting: código morto confirmado
25. `npm run check:entity-ssot -w pdv-importados` tem uma lista `@legacy` que cobre apenas `compras`/`financeiro`/`produtos`/`relatorios`/`vendas` sob `/gerente` — **não** cobre `app/gerente/categorias-produtos/CategoriasProdutosPageClient.tsx`, `app/gerente/categorias-financeiras/CategoriasFinanceirasPageClient.tsx` nem `app/gerente/suspensao/SuspensaoPageClient.tsx`. Confirmado via `ls` que nenhuma dessas três pastas tem `page.tsx` (rota não existe) e via `grep -rln` que cada componente tem zero importadores em todo o repo — código morto de fato, ao contrário dos arquivos `@legacy` rastreados (que continuam roteáveis). Notavelmente, os PageClients mortos são **mais completos** que os ports atuais do Admin (usam `CadastroFormModal`, `ConfirmExcluirCadastroModal`, filtros reais) — o que explica diretamente por que os novos ports do Admin estão sem delete/busca/paginação (itens 6, 7, 12, 13, 15). **Decisão de produto, não de engenharia:** minerar esses 3 arquivos pela UI que falta antes de excluí-los, ou excluir direto e reconstruir do zero.

## 4. Riscos técnicos

- **Suspensão (item 1-3):** único risco de severidade real da fase — bug de leitura silenciosa que pode levar a uma escrita destrutiva de estado de negócio (reativar vendas suspensas por engano). Prioridade máxima.
- **Configurações (item 17):** mesmo padrão de erro-descartado, mas a superfície de escrita subsequente (`handleSalvar` de cada aba) sempre envia o formulário inteiro, então o pior caso é salvar valores default por cima de valores reais — grave, mas exige uma ação humana adicional (clicar Salvar) para se concretizar, ao contrário da Suspensão que é 1 clique.
- **Categorias (Produtos/Financeiras):** risco puramente de UX/funcionalidade ausente (paginação, busca, delete) — nenhum risco de corrupção de dado, pois as ações que existem já são seguras; as que faltam simplesmente não existem ainda na UI.
- **Auditoria:** módulo somente-leitura — risco zero de corrupção de dado; risco é de auditabilidade (evento real perdido/oculto por erro descartado).
- **Item de dead-code (25):** risco zero em manter como está; risco de decisão errada é excluir sem minerar a UI mais completa, perdendo trabalho de referência.
- **Nenhum item desta fase requer migração de banco** — todos os 25 achados são de código de aplicação (páginas, actions, componentes), não de schema/RPC/RLS.

## 5. Migrações necessárias

**Nenhuma.** Todos os achados desta fase são de código de aplicação. Ao
contrário da Fase 4 (que exigiu uma migration de view), a Fase 5 não tem
nenhuma superfície de banco a alterar — o que reduz significativamente o
risco de execução desta fase inteira.

## 6. Impactos

- **Arquitetura:** nenhum. Nenhuma tabela/função/rota nova é criada; o único
  "novo caminho" possível (a rota de exclusão de categoria, item 9) já
  existe como server action, só falta o botão que a chame.
- **UX:** melhora pura em honestidade de erro (itens 1, 5, 10, 15, 17, 22),
  acessibilidade (itens 6, 11), paridade de idioma (itens 4, 14, 24), e
  funcionalidade já implementada no servidor mas inacessível na UI (itens
  7, 8, 9, 12, 13, 16, 18).
- **Domínio:** a única entrega com risco de mudar comportamento de negócio
  observável é a correção da Suspensão (item 1-2) — e o objetivo é
  justamente fazer o comportamento observável (mensagem exibida) bater com
  o estado real do banco, não mudar a regra de suspensão em si.
- **Duas decisões de produto explícitas**, sinalizadas para o usuário e não
  decididas unilateralmente aqui:
  - (a) **Item 25:** minerar `CategoriasProdutosPageClient.tsx` /
    `CategoriasFinanceirasPageClient.tsx` / `SuspensaoPageClient.tsx` pela UI
    mais completa (delete/busca/paginação) antes de excluir, versus excluir
    direto e reconstruir a UI faltante do zero nos ports atuais do Admin.
  - (b) **Item 18:** construir o `<select>` real para `tema_padrao` (já tem
    i18n pronto) versus remover as labels/enum mortos e a coluna do banco
    permanece sem uso na UI.

## 7. Plano de execução — entregas incrementais

### Entrega 1 — Suspensão: `loadError` honesto + bloqueio de escrita em estado desconhecido
- **Objetivo:** falha de carga do estado de suspensão nunca deve renderizar "Vendas ATIVAS" como se fosse um fato confirmado, e o botão Salvar não deve permitir gravar um estado que o admin nunca viu de verdade.
- **Arquivos:** `app/admin/suspensao/page.tsx`, `app/admin/suspensao/_components/SuspensaoContent.tsx`.
- **Risco:** baixo — puramente aditivo (banner de erro + desabilitar Salvar até carregar com sucesso); não muda a lógica de `atualizarSuspensaoVendas` em si.
- **Rollback:** reverter o commit; nenhuma migração envolvida.
- **Critérios de aceite:** falha simulada de carga mostra banner de erro explícito, não "Vendas ATIVAS"; botão Salvar fica desabilitado até um carregamento bem-sucedido.
- **Testes obrigatórios:** teste de comportamento cobrindo carga com sucesso vs. falha (mesmo padrão de `ClientesListClient.behavior.test.tsx`).

### Entrega 2 — Suspensão: erro amigável em vez de Postgres bruto + i18n
- **Objetivo:** `app/gerente/suspensao/actions.ts` roteia erros por `mensagemErroComSecao`/`mensagemErroParaUsuario` como os demais módulos; namespace `suspensao` criada em `pt.json`/`zh.json`.
- **Arquivos:** `app/gerente/suspensao/actions.ts`, `SuspensaoContent.tsx`, `pt.json`, `zh.json`.
- **Risco:** baixo — muda só o texto de caminhos de erro já existentes.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** nenhuma mensagem Postgres bruta chega à UI; `idioma=zh` mostra tudo em chinês.
- **Testes obrigatórios:** teste unitário da action cobrindo o mapeamento de erro (mesmo padrão de `actions.test.ts` de Clientes).

### Entrega 3 — Categorias de Produtos e Financeiras: `loadError`, busca, paginação real, exclusão
- **Objetivo:** fechar os 4 gaps gêmeos (erro descartado, botão sem nome acessível, paginação fake, busca/filtro invisível) e ligar `excluirCategoriaProduto`/equivalente financeiro a um botão real.
- **Arquivos:** `app/admin/categorias-produtos/page.tsx`, `CategoriasProdutosContent.tsx`, `app/admin/categorias-financeiras/page.tsx`, `CategoriasFinanceirasContent.tsx`.
- **Risco:** médio — é a entrega com mais superfície de UI nova (paginação real, busca real, confirmação de exclusão); depende da decisão de produto (item 25) sobre reusar UI dos PageClients mortos como referência.
- **Rollback:** reverter o commit; nenhuma migração envolvida (a action de exclusão já existe e já é segura).
- **Critérios de aceite:** navegação entre páginas funciona além da primeira; busca/filtro de status filtra de fato; botão de exclusão existe, pede confirmação (`ConfirmExcluirCadastroModal` ou `DragonModal`) e respeita a integridade referencial já garantida no backend; botões de editar têm `aria-label`.
- **Testes obrigatórios:** testes de comportamento para paginação (próxima/anterior), busca e fluxo de exclusão (confirmar → sucesso, confirmar → erro de FK em uso).

### Entrega 4 — Comissões: `loadError` na carga inicial + filtros reais de período/status
- **Objetivo:** falha de carga inicial vira banner; período/status deixam de ser texto read-only e viram controles reais (date range + dropdown), reaproveitando os enums já traduzidos.
- **Arquivos:** `app/admin/comissoes/page.tsx`, `ComissoesContent.tsx`.
- **Risco:** baixo-médio — nova interatividade de filtro precisa preservar o comportamento default atual (últimos 30 dias, todos os status) quando nada é selecionado.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** falha de carga mostra banner; alterar período/status refiltra a lista sem reload de página; URL sem parâmetros continua com o comportamento default de hoje.
- **Testes obrigatórios:** teste de comportamento cobrindo mudança de filtro e o banner de erro.

### Entrega 5 (decisão de produto — item 18) — Configurações: `loadError` na carga inicial + decisão sobre `tema_padrao`
- **Objetivo:** (i) `loadError` honesto nas duas queries iniciais (`lojas`/`pdv_config`); (ii) **decisão do usuário**: construir o `<select>` de tema ou remover as labels/enum mortos.
- **Arquivos:** `app/admin/configuracoes/page.tsx`, `ConfiguracoesContent.tsx`.
- **Risco:** baixo para (i); baixo para (ii) em qualquer uma das duas direções, mas exige a decisão antes de codar para não retrabalhar.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** falha de carga inicial mostra banner; `tema_padrao` passa a ter um `<select>` funcional OU os labels/enum mortos são removidos (conforme decisão).
- **Testes obrigatórios:** teste de comportamento para o banner; se optar por construir o seletor, teste cobrindo troca de tema e persistência.

### Entrega 6 — Auditoria: `loadError` por-fonte + migração do sheet de detalhe para `DragonModal` + i18n completo
- **Objetivo:** os 5 blocos de query passam a propagar erro por-fonte para o banner já existente; `AuditoriaDetailSheet` migra para `DragonModal` (focus-trap real); todo o módulo ganha i18n.
- **Arquivos:** `app/admin/auditoria/actions.ts`, `app/admin/auditoria/page.tsx`, `AuditoriaTimeline.tsx`, `pt.json`, `zh.json`.
- **Risco:** médio — é a maior entrega da fase em volume de i18n e a única com migração de padrão de dialog (mesmo trabalho já feito antes nesta sprint para outros sheets); precisa preservar comportamento de Escape/scroll-lock que `DragonModal` já garante.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** falha em uma única fonte de evento mostra erro específico daquela categoria, não silenciosamente "0 eventos"; abrir o detalhe move o foco para dentro do modal e o restaura ao fechar; Tab não escapa do modal; `idioma=zh` cobre 100% do módulo.
- **Testes obrigatórios:** teste de comportamento para o banner por-fonte; teste de foco (mesmo padrão usado para validar `DragonModal` em outros módulos, se existir um precedente no repo — senão, teste manual documentado).

### Entrega 7 (baixa prioridade) — Diagnóstico de Caixa: remover chamada duplicada de `loadAdminContext`
- **Objetivo:** eliminar a segunda chamada redundante de `loadAdminContext` dentro de `executarDiagnosticoCaixaPreProducao`.
- **Arquivos:** `diagnosticoCaixa.impl.ts`.
- **Risco:** baixíssimo — é uma ferramenta interna, sem consumidor externo.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** diagnóstico continua funcionando idêntico, com uma chamada a menos.
- **Testes obrigatórios:** nenhum teste dedicado necessário além dos já existentes para o diagnóstico.

### Entrega 8 (decisão de produto — item 25) — Excluir ou minerar os 3 componentes órfãos
- **Objetivo:** resolver o código morto identificado (`CategoriasProdutosPageClient.tsx`, `CategoriasFinanceirasPageClient.tsx`, `SuspensaoPageClient.tsx`) de acordo com a decisão do usuário.
- **Arquivos:** os 3 arquivos órfãos; potencialmente arquivos da Entrega 3 se a decisão for minerar UI antes de excluir.
- **Risco:** nulo a excluir (zero importadores confirmado via grep); esta entrega deveria vir **antes** da Entrega 3 se a decisão for "minerar", para servir de referência.
- **Rollback:** reverter o commit (arquivos vêm do histórico git se precisar recuperar).
- **Critérios de aceite:** nenhum importador quebrado (`grep -rln` confirma zero referências antes de excluir); `check:entity-ssot` continua verde.
- **Testes obrigatórios:** nenhum (remoção de código morto não testado).

## 8. Checklist "reduz complexidade / dívida / SSOT / observabilidade / arquitetura / acoplamento / testabilidade / reversibilidade"

| Entrega | Reduz complexidade? | Reduz dívida? | Fortalece SSOT? | Observabilidade? | Preserva arquitetura? | Reduz acoplamento? | Testável? | Reversível fácil? |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 — Suspensão loadError + bloqueio | Sim | Sim | Sim | Sim (crítico) | Sim | Neutro | Sim | Sim |
| 2 — Suspensão erro amigável + i18n | Sim | Sim | Sim | Sim | Sim | Neutro | Sim | Sim |
| 3 — Categorias paginação/busca/delete | Neutro (UI nova) | Sim (fecha gap servidor↔UI) | Sim | Sim | Sim | Neutro | Sim | Sim |
| 4 — Comissões filtros reais | Neutro (UI nova) | Sim | Sim | Sim | Sim | Neutro | Sim | Sim |
| 5 — Configurações loadError + tema | Sim | Sim | Sim | Sim | Sim | Neutro | Sim | Sim |
| 6 — Auditoria loadError + DragonModal + i18n | Sim (unifica padrão de dialog) | Sim | Sim | Sim | Sim | Reduz (menos dialog artesanal) | Sim | Sim |
| 7 — Diagnóstico dedupe | Sim | Sim | Neutro | Neutro | Sim | Neutro | N/A | Sim |
| 8 — Excluir/minerar órfãos | Sim | Sim | Neutro | Neutro | Sim | Neutro | N/A | Sim |

Nenhuma resposta negativa em nenhuma entrega — todas passam no checklist sem
precisar de alternativa mais simples.

## 9. Ordem recomendada

1 → 2 (Suspensão inteira, maior severidade real da fase, sem dependência de
decisão de produto) → 8 (resolver o código morto cedo, para servir de
referência de UI nas entregas seguintes, **depende da decisão (a)**) → 3
(Categorias, se beneficia da Entrega 8 já resolvida) → 4 (Comissões,
independente) → 5 (Configurações, **depende da decisão (b)**) → 6
(Auditoria, maior volume de i18n, sem dependência das outras) → 7
(Diagnóstico, baixa prioridade, pode ir a qualquer momento).

## 10. Decisões de produto pendentes (bloqueiam Entregas 5 e 8)

Estas duas perguntas precisam de resposta do usuário antes de codar as
entregas correspondentes — não são chamadas de engenharia:

1. **Item 25 / Entrega 8:** os 3 componentes órfãos (`CategoriasProdutosPageClient.tsx`, `CategoriasFinanceirasPageClient.tsx`, `SuspensaoPageClient.tsx`) têm UI mais completa que os ports atuais do Admin (delete/busca/paginação prontos). Devo minerar essa UI como referência para a Entrega 3 antes de excluir os arquivos, ou excluir direto e construir a UI faltante do zero?
2. **Item 18 / Entrega 5:** `tema_padrao` tem i18n 100% pronto mas nenhuma UI real (só um `<input type="hidden">`). Devo construir o seletor de tema de verdade, ou remover os labels/enum mortos e deixar a coluna sem uso na UI por ora?

**Nenhum código foi alterado nesta fase até este ponto — apenas leitura e
análise.** Aguardando autorização explícita antes de iniciar qualquer
implementação, seguindo o mesmo ritmo desta sessão (auditoria → plano →
confirmação → execução) usado nas Fases 2 e 4.

## Fechamento (2026-07-17)

Autorização recebida explicitamente para as 8 entregas, incluindo as duas
decisões de produto da seção 10: (a) minerar a UI dos 3 componentes órfãos
antes de excluir, (b) remover a UI morta de `tema_padrao` em vez de
construir o seletor.

| Entrega | Status | Evidência |
|---|---|---|
| 1 — Suspensão: `loadError` + bloquear Salvar em estado desconhecido | ✅ | `app/admin/suspensao/page.tsx` + `SuspensaoContent.tsx`: banner de erro, checkbox/textarea/botão desabilitados enquanto `loadError` estiver presente; 3 testes de comportamento |
| 2 — Suspensão: erro amigável + i18n | ✅ | `app/gerente/suspensao/actions.ts` roteia por `mensagemErroComSecao`; namespace `admin_ui.suspensao_*` (13 chaves, paridade pt/zh confirmada); 3 testes unitários |
| 3 — Categorias Produtos/Financeiras: `loadError`, busca, paginação real, exclusão | ✅ | Reescrita de `CategoriasProdutosContent.tsx`/`CategoriasFinanceirasContent.tsx` com busca + filtro (situação/tipo) + paginação anterior/próxima URL-driven + exclusão via `ConfirmExcluirCadastroModal` (reaproveitado dos órfãos); `aria-label` em todos os botões de ícone; 11 testes de comportamento (6 + 5) |
| 4 — Comissões: `loadError` + filtros reais de período/status | ✅ | `page.tsx`/`ComissoesContent.tsx`: inputs de data reais + select de status substituindo o texto read-only, navegação via URL; banner de erro na carga inicial; 5 testes de comportamento |
| 5 — Configurações: `loadError` + remover UI morta de `tema_padrao` | ✅ | `page.tsx` desestrutura `error` das 2 queries iniciais e traduz via `mensagemErroComSecao`; banner + botões de Salvar desabilitados nas 3 abas enquanto `loadError`; labels/enum de `tema_padrao` removidos de `ConfiguracoesContent.tsx`/i18n (hidden input mantido — preserva o valor ao salvar); 3 testes de comportamento |
| 6 — Auditoria: `loadError` por-fonte + focus-trap real + i18n completo | ✅ | `actions.ts`: cada um dos 5 blocos de query agora reporta falha em `fontesComErro` em vez de mascarar como "0 eventos"; `AuditoriaTimeline.tsx`: `AuditoriaDetailSheet` migrado para o mesmo padrão de focus-trap manual de `KardexSheet.tsx` (foco inicial, Tab contido, restauração de foco) — **correção em relação ao plano original**: não usa `DragonModal` (componente de diálogo centralizado) porque o sheet é um drawer lateral; `KardexSheet.tsx` também não usa `DragonModal`, usa a mesma técnica manual, então a migração seguiu o precedente real do código, não a descrição textual do achado; i18n completo (49 chaves `admin_ui.auditoria_*`, paridade pt/zh confirmada) |
| 7 — Diagnóstico Caixa: remover chamada duplicada de `loadAdminContext` | ✅ | `page.tsx`: removida a chamada própria — `executarDiagnosticoCaixaPreProducao()` já gate por dentro; **correção em relação ao plano original**: a chamada interna não podia ser removida (é o único guard de autorização do caminho da server action `executarDiagnosticoCaixaAction`, usada pelo botão "rodar novamente") — a redundância real estava em `page.tsx`, não no impl |
| 8 — Excluir/minerar órfãos | ✅ | UI de busca/filtro/paginação/exclusão de `CategoriasProdutosPageClient.tsx`/`CategoriasFinanceirasPageClient.tsx` minerada para a Entrega 3 (via `ConfirmExcluirCadastroModal`, `useState` de filtros URL-driven); os 3 arquivos órfãos excluídos; `check:entity-ssot` confirma zero referência remanescente e nenhuma rota quebrada |

**Correções de escopo em relação ao plano original:**
- Entrega 6: o achado #23 dizia "migrar para `DragonModal` como `KardexSheet.tsx`/`DocumentoFiscalDetailSheet.tsx` já fazem" — na prática, `KardexSheet.tsx` **não** usa `DragonModal` (é um drawer lateral, não um diálogo centralizado), usa a mesma técnica de focus-trap manual documentada em seu próprio comentário. A migração seguiu o precedente real do código.
- Entrega 7: a chamada redundante de `loadAdminContext` estava em `page.tsx`, não dentro de `executarDiagnosticoCaixaPreProducao` — essa segunda chamada é o único guard de autorização para a server action de "rodar novamente", que não tem gate próprio.

**Validação final:** 583/583 testes verdes (36 novos nesta fase), `npm run typecheck` limpo, `guard:all` 8/8 verde (`guard:core`, `guard:pdv`, `guard:routes` — 23 rotas `/admin` sem 404 estrutural, `guard:rpc`, `guard:pricing`, `guard:deps`, `guard:migrations` — 191 migrations sem colisão, zero migração nova nesta fase, `check:entity-ssot` — zero referência aos 3 arquivos excluídos, apenas os 5 avisos `@legacy` pré-existentes e não relacionados a esta fase).

**Pendências:** nenhuma. Fase 5 (Administração) 100% concluída — código. Sem
superfície de banco nesta fase (todos os achados eram de código de
aplicação), então não há item de "banco" a fechar, diferente das Fases 2 e 4.
