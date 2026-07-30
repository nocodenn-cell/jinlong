# Auditoria — telas e menus expostos ao cliente

| Campo | Valor |
|---|---|
| **Data** | 2026-07-30 |
| **App** | `pdv-importados` (piloto web) |
| **Branch** | `chore/fase2-infra-hardening` |
| **Escopo** | Separar produto real × ferramenta interna de dev/implantação/suporte |
| **Status** | Diagnóstico (§1–§7) + **execução das ondas 1–3 aplicada** (§8) |
| **Complementa** | `docs/architecture/screens_inventory.md` (prontidão), este doc trata de *exposição* |

---

## 0. Superfície de navegação — fato apurado

Existe **uma única navegação viva**: `components/ui/admin-v2/SidebarNav.tsx`, alimentada por
`lib/navigation/adminV2SidebarNav.ts`, montada em `AdminV2Shell` → `app/admin/layout.tsx`.

Três grupos:

| Grupo | Itens | Estado inicial |
|---|---|---|
| `CORE` | 8 | sempre visível |
| `Mais` | 6 | **recolhido** (`useState(false)`) |
| `SISTEMA` | 6 | sempre visível |

Todo `/gerente/*` é redirect para `/admin/*` (`app/gerente/page.tsx`, `app/gerente/[...path]/page.tsx`,
`LEGACY_GERENTE_REDIRECTS`). Não há navegação mobile dedicada: o `<aside>` é
`w-full ... lg:w-72`, ou seja **no celular o menu inteiro fica acima do conteúdo** — o cliente
rola por `SISTEMA` antes de chegar na tela. Isso amplifica todo o resto desta auditoria.

Já existe o mecanismo de ocultação necessário: `AdminV2NavItem.adminOnly` +
`showAdminOnlyItems={session.perfil === 'ADMIN'}` (`AdminV2Shell.tsx:54`). Hoje só
`provisionamento` o usa.

---

## 1. Tela "Implantação / GO-LIVE" (`/admin/implantacao`)

### Por que existe
É o **gate de implantação do fornecedor**: 38 itens de checklist em 8 seções
(`implantacaoCatalog.ts`), persistidos em `implantacao_checklists` /
`implantacao_checklist_itens`, com autorização de GO que **tranca o checklist** para edição
(`actions.ts:243`) e exige evidência textual em cada item concluído (`evidenciaImplantacao.ts`).

### Vocabulário da tela é do fornecedor, não do cliente
Cinco dos itens obrigatórios são infraestrutura à qual o cliente não tem acesso:
`ambiente.url`, `ambiente.vars`, `ambiente.service_role`, `ambiente.storage`, `ambiente.backup`.
Um dono de loja de importados não tem como marcar "service_role configurada".

### Quem deveria usar
Equipe FastProduct (`ADMIN`). O cliente participa em **dois** pontos:
`homologacao.cliente_treinado` e `homologacao.aceite`. Em ERP maduro isso é um **termo de aceite
assinado**, não uma tela permanente no menu do cliente.

### Cliente final deve enxergar?
**Não.** É artefato de projeto de uso único. Depois do GO-LIVE, fica peso morto no menu para
sempre — e pior: expõe o botão **"Revogar GO"**, que parece destrutivo.

### É ferramenta interna de implantação?
Sim, com uma nuance importante: **nada no runtime lê `go_autorizado`**. Verifiquei — os únicos
consumidores de `go_live`/`go_autorizado` são o próprio módulo `app/admin/implantacao/*` e
scripts de homologação em `backend/`. O gate **não libera nem bloqueia nenhuma funcionalidade**.
É registro documental puro. Consequência prática: **esconder a tela não pode quebrar nenhum
fluxo operacional.**

O suporte a `?lojaId=` restrito a `ADMIN` (`page.tsx:23`) já é o formato de console interno.

### Deve sair do menu principal?
**Sim.**

### Esconder ou remover?
**Esconder.** Remover perderia o único registro persistido da implantação, e a rota é referenciada
por dois testes (ver §4).

---

## 2. Tela "Diagnóstico do Caixa" (`/admin/diagnostico-caixa`)

### Qual problema real resolve
Smoke check pré-produção do PDV: flags de ambiente (Supabase URL/anon, typo em `STRICT_MANAGER`),
presença da migration 256 / RPC `pdv_diagnostico_pre_producao`, GRANTs, probe em
`obter_status_caixa_operador`, produto-teste com preço e saldo, `vendas_suspensas` desligada.
Veredito `PRONTO_PILOTO` / `BLOQUEADO`.

### Quem usa no dia a dia
**Ninguém.** É uma vez por ambiente/loja no deploy, e depois só em triagem de incidente.

### Cliente precisa acessar?
**Não** — e a tela é auto-evidente nisso. O texto renderizado ao cliente diz literalmente:
`"Migration 256 não aplicada. Execute verify_p0_producao.sql no Supabase."`,
`"Confira GRANT em obter_status_caixa_operador e migration 058"`,
`"migration 243+ e RPC v4 com GRANT para authenticated"`.
Nenhuma dessas ações é executável por um lojista. E há vazamento gratuito de nomes internos de
schema/RPC e do estado de configuração de ambiente para qualquer `GERENTE` (severidade baixa —
não há segredo — mas é superfície sem contrapartida).

Já existe o equivalente CLI: `pdv-importados/scripts/check-caixa-pre-producao.mjs`.

### Configurações/Suporte ou fora da navegação?
**Fora da navegação.** Não enterrar em Configurações: Configurações é território do cliente
(dados da loja, série fiscal, preferências) — colocar um diagnóstico de banco lá recria o mesmo
problema um nível abaixo. Manter como rota `ADMIN` para triagem de campo (mais rápido que rodar
script quando a loja está parada).

---

## 3. Menu lateral completo — classificação

Legenda: **A** essencial diário · **B** administrativo gerente/dono · **C** interno suporte/dev · **D** legado/candidato a remoção

### CORE

| Item | Rota | Classe | Recomendação | Nota |
|---|---|---|---|---|
| Visão geral | `/admin/dashboard` | B | **Manter** | KPIs de dono. |
| Vendas e caixa | `/admin/vendas` | A | **Manter** | — |
| Catálogo | `/admin/catalogo` | A | **Manter** | — |
| Clientes | `/admin/clientes` | A | **Manter** | — |
| Funcionários | `/admin/funcionarios` | B | **Manter** | — |
| Estoque | `/admin/estoque` | A | **Manter** | — |
| Auditoria | `/admin/auditoria` | B | **Manter** | Ledger de negócio real (cancelamentos, descontos, movimentos, alertas), somente leitura. É "Auditoria" no sentido de ERP, não log de dev. Correto no menu. |
| Financeiro e fiscal | `/admin/financeiro` | B | **Manter** | — |

### "Mais" (recolhido por padrão)

| Item | Rota | Classe | Recomendação | Nota |
|---|---|---|---|---|
| Fornecedores | `/admin/fornecedores` | B | **Manter** | — |
| Compras | `/admin/compras` | B | **Manter** | — |
| Relatórios | `/admin/relatorios` | B | **Promover para CORE** | Relatório é razão de ser de ERP; está atrás de um rótulo "Mais" sem informação. |
| Recebimento | `/admin/estoque/recebimento` | **A** | **Promover para CORE** (ou sub-item de Estoque) | Receber mercadoria é trabalho diário em importados. Item essencial escondido em gaveta fechada. |
| Transferências | `/admin/estoque/transferencias` | A (multi-loja) / D (loja única) | **Manter escondido; condicionar a multi-loja** | Sem segunda loja, é ruído. |
| Comissões | `/admin/comissoes` | B | **Manter** | — |

### SISTEMA

| Item | Rota | Classe | Recomendação | Nota |
|---|---|---|---|---|
| Configurações | `/admin/configuracoes` | B | **Manter** | Dados da loja, fiscal, preferências — território do cliente. |
| Provisionamento | `/admin/provisionamento` | **C** | **Manter como está** | Já `adminOnly` no menu **e** `['ADMIN']` na policy. É o padrão correto — usar como referência para os dois itens abaixo. |
| Implantação / GO-LIVE | `/admin/implantacao` | **C** | **Esconder** → `adminOnly: true` | §1. |
| Diagnóstico do Caixa | `/admin/diagnostico-caixa` | **C** | **Esconder** → `adminOnly: true` | §2. |
| Suspensão de licença | `/admin/suspensao` | B mal rotulado | **Renomear + restringir** | Ver §3.1. |
| Ir para PDV | `/caixa` | A | **Mover para o topo** | Destino mais usado da loja, hoje é o último item do último grupo. |

### 3.1 "Suspensão de licença" — três problemas

1. **Rótulo errado.** Menu diz *licença* (sugere cobrança/fornecedor); o título da página diz
   "Suspensão de **Vendas**" e a flag é `vendas_suspensas` em `configuracoes_gerais`. São coisas
   diferentes; o rótulo atual assusta o cliente sem motivo.
2. **Permissão frouxa.** `atualizarSuspensaoVendas` (`app/gerente/suspensao/actions.ts:38`) só
   chama `assertGerenteSession()` — **sem checagem de perfil**. Qualquer `GERENTE` para as vendas
   da loja inteira. E `app/admin/suspensao/page.tsx` **não chama `loadAdminContext`**, então não
   há guarda de rota; a proteção depende só da action.
3. **O efeito é real** (não é botão decorativo): a migration `105_suspensao_vendas.sql` bloqueia
   `OPERADOR` na finalização no servidor (gerentes/donos passam), e o PDV também barra no cliente
   (`CaixaPageClient.tsx:892`). Ou seja: é uma alavanca legítima de operação — só está no lugar
   errado, com o nome errado e sem trava de perfil.

**Recomendação:** renomear para "Suspender vendas", restringir a `DONO`/`ADMIN`, e considerar
movê-la para dentro de Configurações (é um estado da loja, não um módulo).

---

## 4. Achados adicionais (fora do escopo pedido, mesma causa raiz)

### 4.1 O inverso do problema: função essencial **fora** do menu

`/admin/categorias-produtos` e `/admin/categorias-financeiras` são rotas reais, completas,
com CRUD — e **sem nenhum link de entrada em toda a UI** (verificado por busca de
`categoriasProdutos` / `categoriasFinanceiras` em `app/` e `components/`). A criação de categoria
de produto (`criarCategoriaProduto`) existe **somente** nessas telas.

Resultado: **o cliente não consegue criar uma categoria de produto pela interface**, embora seja
tarefa diária de catálogo. Enquanto duas ferramentas internas ocupam o menu, duas funções de
produto estão inacessíveis. Prioridade mais alta que os itens §1 e §2.

### 4.2 Três definições de menu, uma viva

| Arquivo | LOC | Estado |
|---|---|---|
| `lib/navigation/adminV2SidebarNav.ts` | 113 | **viva** |
| `lib/navigation/gerenteNavUi.ts` | 200 | morta |
| `lib/navigation/adminSidebarNav.ts` | 32 | morta (zero importadores) |
| `components/gerente/GerenteHeaderNav.tsx` | 569 | morta (não montada) |
| `components/gerente/GerenteMobileNavDrawer.tsx` | 187 | morta (não montada) |

`gerenteNavUi.ts` é consumido **apenas** pelos dois componentes mortos, que por sua vez não são
montados em lugar nenhum. ~988 LOC de menu paralelo e divergente (ele tem topicalização
`catalogo / estoque_logistica / vendas_caixa / financeiro / analise / sistema` que o menu vivo não
tem). Armadilha de drift: alguém "corrige o menu" nesse arquivo e nada muda em produção.

---

## 5. Impacto técnico por alteração

Ordenado por risco crescente. Tudo abaixo é reversível.

### A. Esconder Implantação do menu — **risco nulo**
- **Mudança:** `adminOnly: true` no item `implantacao` (`lib/navigation/adminV2SidebarNav.ts:88-95`). Um campo.
- **Banco:** nada. **Rotas:** nada. **Testes:** nada.
- O e2e `e2e/smoke-fase1-provisionamento-homologacao.spec.ts:220` navega por URL logado como
  `ADMIN` → continua verde. `tests/p0-venda-homologacao.matrix.test.ts:92` só verifica que o
  arquivo existe → continua verde.

### B. Esconder Diagnóstico do Caixa do menu — **risco nulo**
- **Mudança:** `adminOnly: true` (`adminV2SidebarNav.ts:96-102`). Um campo.
- Zero referências em `e2e/` e `tests/`. Página é somente leitura; nada consome a saída.

### C. Restringir as duas rotas a `ADMIN` — **risco baixo, com uma decisão pendente**
- **Mudança:** `adminPolicy.ts:72` e `:80` → `['ADMIN'] as const`.
- `loadAdminContext` passa a redirecionar `DONO`/`GERENTE`. `KNOWN_RESOURCES`
  (`adminContext.ts:36,43`) continua válido — `derivePermissionsForSession` só deixa de emitir a
  permissão para não-ADMIN.
- Em Diagnóstico fecha página **e** action de uma vez, porque
  `executarDiagnosticoCaixaPreProducao` usa o mesmo `resource`.
- **Conflito a resolver antes:** `autorizarGoLiveAction` permite `DONO`
  (`app/admin/implantacao/actions.ts:283`). Restringir a rota a `ADMIN` tira do DONO a capacidade
  de autorizar o GO pela UI. Duas saídas:
  - **(b) recomendada para o piloto:** só `adminOnly: true` no menu, **sem** mudar a policy. Zero
    mudança de comportamento, compatível com o feature freeze. A tela sai do menu e continua
    acessível por URL a quem já podia.
  - **(a) depois do GO:** rota `['ADMIN']` e o aceite do DONO registrado em
    `homologacao.aceite` + `go_observacao` (campos de evidência já existem).

### D. Ligar as telas de categorias ao menu — **risco baixo**
- **Mudança:** duas entradas em `ADMIN_V2_EXPANDED_ITEMS` (ou sub-links dentro de
  Catálogo/Financeiro, que é melhor UX).
- **i18n:** não há chave em `admin.nav` para categorias em `src/lib/i18n/pt.json`. Usar
  `labelOverridePt` — padrão já adotado por Auditoria, Fornecedores e Compras.
- **Policy:** nada. `hasAllowedPerfil` cai em `canAccessAdmin` quando o recurso não está mapeado
  (`adminPolicy.ts:94`), então as rotas já são acessíveis a perfis gerenciais.

### E. Promover Recebimento e Relatórios para CORE — **risco baixo**
- **Mudança:** mover entradas entre os dois arrays. Dado puro.
- **Efeito colateral:** CORE vai a 10 itens; no celular o `<aside>` full-width cresce. Fazer junto
  com uma navegação mobile de verdade, ou aceitar que sair 2 itens de SISTEMA compensa.

### F. Renomear + restringir Suspensão — **risco médio**
- Rótulo: uma string. Barato e imediato.
- Restrição: checagem de perfil em `atualizarSuspensaoVendas`, registrar
  `route:/admin/suspensao` em `RESOURCE_PROFILES` como `['DONO','ADMIN']`, **e adicionar
  `loadAdminContext` em `app/admin/suspensao/page.tsx`** (hoje inexistente).
- Toca um caminho de enforcement do qual o PDV depende (RPC v3 da migration 105). Requer teste
  antes. Não fazer junto com A–E.

### G. Apagar navegação morta — **risco nulo, momento errado**
- Remover `GerenteHeaderNav.tsx`, `GerenteMobileNavDrawer.tsx`, `gerenteNavUi.ts`,
  `adminSidebarNav.ts` (~988 LOC).
- Sem risco de runtime (nada monta, nada importa), mas é PR de deleção larga durante feature
  freeze. Agendar para depois do piloto.

---

## 6. Ordem sugerida

| Onda | Itens | Por quê |
|---|---|---|
| 1 | **D** (categorias no menu) | Único achado que **bloqueia trabalho do cliente hoje**. |
| 2 | **A + B** (esconder as duas telas internas), **F** só o rótulo | Dois campos e uma string. Resolve a pergunta original com risco nulo. |
| 3 | **E** (promover Recebimento/Relatórios) | Depende de decidir a navegação mobile. |
| 4 | **C** (policy `ADMIN`) + **F** completo | Precisa resolver DONO×GO-LIVE e ter teste da suspensão. |
| 5 | **G** (deleção) | Pós-piloto. |

---

## 7. Critério aplicado (ERP comercial maduro)

| Pergunta | Implantação | Diagnóstico | Auditoria | Categorias |
|---|---|---|---|---|
| Cliente precisa disso para trabalhar? | Não | Não | Sim (conferência) | **Sim** |
| Ajuda a vender/operar? | Não | Não | Sim | Sim |
| Reduz erro? | Do fornecedor | Do fornecedor | Sim (rastreio) | Sim |
| Expõe complexidade interna? | **Sim** (service_role, storage, vars) | **Sim** (migrations, GRANTs, RPCs) | Não | Não |
| Veredito | esconder | esconder | manter | **expor** |

---

# 8. Execução — limpeza de navegação (aplicada)

**Data:** 2026-07-30 · **Arquivo alterado:** `pdv-importados/lib/navigation/adminV2SidebarNav.ts` (único)
**Não tocado, conforme instrução:** rotas, policies (`adminPolicy.ts`, `adminContext.ts`), código legado de navegação.

## 8.1 Mapa ANTES × DEPOIS — o que o cliente (DONO/GERENTE) enxerga

Saída real do componente renderizado, não leitura de código.

| # | ANTES | DEPOIS | Mudança |
|---|---|---|---|
| **CORE** | | | |
| 1 | Visão geral | Visão geral | — |
| 2 | Vendas e caixa | Vendas e caixa | — |
| 3 | Catálogo | Catálogo | — |
| 4 | — | **Categorias de produtos** | **entrou** (era inalcançável) |
| 5 | Clientes | Clientes | — |
| 6 | Funcionários | Funcionários | — |
| 7 | Estoque | Estoque | — |
| 8 | — | **Recebimento** | **subiu** de "Mais" |
| 9 | Auditoria | Auditoria | — |
| 10 | Financeiro e fiscal | Financeiro e fiscal | — |
| 11 | — | **Relatórios** | **subiu** de "Mais" |
| **Mais** (recolhido) | | | |
| | Fornecedores | Fornecedores | — |
| | Compras | Compras | — |
| | ~~Relatórios~~ | — | subiu para CORE |
| | ~~Recebimento~~ | — | subiu para CORE |
| | Transferências | Transferências | — |
| | Comissões | Comissões | — |
| | — | **Categorias financeiras** | **entrou** (era inalcançável) |
| **SISTEMA** | | | |
| | Configurações | Configurações | — |
| | ~~Implantação / GO-LIVE~~ | — | **escondido** (`adminOnly`) |
| | ~~Diagnóstico do Caixa~~ | — | **escondido** (`adminOnly`) |
| | Suspensão **de licença** | Suspensão **de vendas** | **renomeado** |
| | Ir para PDV | Ir para PDV | — |

Saldo para o cliente: **−2 ferramentas internas**, **+2 cadastros que estavam inacessíveis**,
**+2 tarefas diárias promovidas** para fora da gaveta, **1 rótulo corrigido**.
SISTEMA cai de 5 para 3 itens visíveis — deixa de parecer "painel de manutenção".

## 8.2 Menu por perfil (validado)

| Perfil | Vê o menu? | Itens visíveis | Ferramentas internas |
|---|---|---|---|
| **OPERADOR** | **Não** | — | — |
| **GERENTE** | Sim | 19 | nenhuma |
| **DONO** | Sim | 19 | nenhuma |
| **ADMIN** (FastProduct) | Sim | 22 | Provisionamento · Implantação/GO-LIVE · Diagnóstico do Caixa |

`OPERADOR` nunca alcança este menu: não está em `PERFIS_PAINEL_GERENCIAL`
(`lib/auth/painelGerencial.ts`), então `middlewareAdminDecision` redireciona `/admin/*` → `/caixa`
com razão `perfil_nao_gerencial`. A única superfície do operador é o PDV. Isso já era assim e
**não foi alterado** — nenhuma policy foi tocada.

`GERENTE` e `DONO` enxergam exatamente o mesmo menu: a diferenciação entre os dois hoje é por
action (ex.: `autorizarGoLiveAction` exige DONO/ADMIN), não por navegação.

## 8.3 Prioridade 1 — fluxo de categorias destravado

- `Categorias de produtos` entrou no **CORE**, logo abaixo de Catálogo — alcançável **sem abrir a
  gaveta "Mais"**, porque criar categoria é pré-requisito de cadastrar produto.
- `Categorias financeiras` entrou em **"Mais"** — cadastro de baixa frequência (configura-se uma
  vez), mas agora tem caminho de navegação.
- **Criação verificada nas duas telas:** `CategoriasProdutosContent.tsx:205` (botão "Nova
  categoria" → `criarCategoriaProduto`) e `CategoriasFinanceirasContent.tsx:134` →
  `criarCategoriaFinanceira`. Ambas já tinham CRUD completo inline — faltava **só o link**.
- **Sem mudança de policy:** `hasAllowedPerfil` cai em `canAccessAdmin` quando o recurso não está
  mapeado (`adminPolicy.ts:94`), e o dado é protegido por `assertGerenteSession()` dentro de
  `listarCadastro`/`criarCadastro` (`app/gerente/shared/actionHelpers.ts:116,194`).

## 8.4 Prioridade 3 — nomenclatura

O dicionário i18n **já estava correto**: `admin.nav.suspensao` = `{pt: "Suspensão", cn: "暂停销售"}`
e o hint `"Suspender ou liberar vendas no PDV."`. Quem introduzia o termo "licença" era o
`labelOverridePt` no arquivo de navegação, que tem precedência sobre o dicionário.
Corrigido para `'Suspensão de vendas'`, alinhado ao título da própria página
("Suspensão de Vendas") e ao comportamento real (flag `vendas_suspensas`).

**Permissão não foi alterada**, conforme instruído. O ponto do §3.1 continua aberto: qualquer
`GERENTE` ainda pode suspender as vendas da loja (`atualizarSuspensaoVendas` só chama
`assertGerenteSession()`, sem checagem de perfil) e `app/admin/suspensao/page.tsx` continua sem
`loadAdminContext`. Fica para o ciclo de policies.

## 8.5 Verificação

| Checagem | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npm test` (suíte completa) | **154 arquivos · 808 testes · 100% verde** |
| `npx eslint` nos arquivos alterados | limpo |
| `npm run check:golive` | 4 arquivos · 34 testes verdes (inclui `p0-venda-homologacao.matrix`) |
| `npm run build` | build de produção concluído |
| Dev server + middleware | `/admin/dashboard` → `307` → `/login?next=…` (gate intacto) |

**Testes novos (18 casos):**
- `lib/navigation/adminV2SidebarNav.test.ts` — 11 casos sobre os dados do menu.
- `components/ui/admin-v2/SidebarNav.behavior.test.tsx` — 7 casos que **renderizam o componente
  em jsdom** e inspecionam o DOM por perfil (ADMIN × não-ADMIN), incluindo abrir a gaveta "Mais".

Travam as quatro garantias desta entrega: categorias alcançáveis · ferramentas internas invisíveis
para não-ADMIN · rótulo sem "licença" · recebimento e relatórios fora da gaveta.

**Não verificado por mim:** a tela logada no navegador. O painel exige autenticação e eu não
insiro credenciais. A validação por perfil foi feita renderizando o componente real em jsdom
(§8.2), não por inspeção visual.

## 8.6 Pendências conhecidas (não regressões — pré-existentes)

1. **Duplo destaque Estoque + Recebimento.** `isRouteActive` (`SidebarNav.tsx:31-34`) usa
   `startsWith`, então em `/admin/estoque/recebimento` os dois itens ficam marcados como ativos.
   Já acontecia antes (com "Mais" aberto); ficou mais visível agora que estão lado a lado no CORE.
   Correção toca a lógica de rota ativa de **todos** os itens — fora do escopo deste ciclo.
2. **Rótulo "Mais" não informa nada** e nasce recolhido. Com Relatórios e Recebimento promovidos,
   o custo caiu, mas o padrão continua ruim para Fornecedores/Compras.
3. **Sem navegação mobile.** O `<aside>` é `w-full ... lg:w-72`: no celular o menu inteiro fica
   acima do conteúdo. CORE passou de 8 para 11 itens, então a rolagem no celular **aumentou** —
   compensada em parte pelos 2 itens que saíram de SISTEMA.
4. `app/admin/categorias-financeiras/page.tsx` não chama `loadAdminContext` (a irmã de produtos
   chama). Dado protegido pelas actions; é inconsistência de guarda de rota, para o ciclo de policies.

## 8.7 O que continua pendente das ondas 4–5

| Onda | Item | Status |
|---|---|---|
| 4 | Restringir `/admin/implantacao` e `/admin/diagnostico-caixa` a `ADMIN` na policy | **não feito** (instrução: não mexer em policies) |
| 4 | Resolver DONO × `autorizarGoLiveAction` antes de restringir a rota | aberto |
| 4 | Checagem de perfil em `atualizarSuspensaoVendas` + `loadAdminContext` na página | **não feito** |
| 5 | Apagar `GerenteHeaderNav`, `GerenteMobileNavDrawer`, `gerenteNavUi.ts`, `adminSidebarNav.ts` (~988 LOC) | **não feito** (instrução: não apagar legado) |

As rotas das duas ferramentas internas **continuam acessíveis por URL** a DONO/GERENTE — a
mudança deste ciclo é de **exposição**, não de autorização. Fechar isso é a onda 4.
