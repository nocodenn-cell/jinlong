# Auditoria UI/UX — Jīn Lóng ERP/PDV

**Data:** 2026-08-06
**Escopo:** `pdv-importados` (Next.js 15 App Router) — todas as rotas alcançáveis: PDV (`/caixa`), painel admin (`/admin/*`), autenticação, páginas públicas.
**Método:** leitura de código com rastreio do fluxo completo `tela → componente → hook → action → RPC/banco`. Sem execução em browser. Toda afirmação tem evidência `arquivo:linha`.
**Nada foi alterado nesta fase.** Este documento é diagnóstico + plano.

**Referências de mercado usadas como baseline:** Bling, Tiny, Omie, Linx Microvix (PDV).

---

## 0. Leia isto antes do resto

### 0.1 Conflito de governança que precisa de decisão do sponsor

`docs/FEATURE_FREEZE_PILOTO.md` lista como **OUT (congelado)**: *"Redesign visual / unificação total de tokens"*. A memória de projeto registra que em 31/07/2026 a diretriz mudou para *"convergência arquitetural, veto a refatoração revogado"*, mas o documento de freeze **não foi atualizado** e continua sendo o artefato escrito vigente.

**Como este plano se posiciona:** as Ondas 1–3 do §8 foram desenhadas para caber **dentro** do freeze — são correções de usabilidade pontuais e consolidação de código duplicado em telas já tocadas, exatamente o que `docs/LAYOUT_KERNEL_ERP.md` autoriza ("aplicação imediata no 1º uso real, escopo local"). A Onda 4 (unificação de vocabulário de estilo, §7.1) é **redesign** e exige exceção explícita ao freeze. Não execute a Onda 4 sem essa decisão.

### 0.2 Três premissas do briefing que a auditoria não confirmou

Reporto isso antes dos achados porque muda o que vale a pena fazer:

| Premissa do briefing | O que o código mostra |
|---|---|
| *"Cadastro de produtos: formulário grande, campos escondidos, difícil cadastro rápido"* | **Já resolvido.** `ProdutoForm.tsx` tem modo simples/completo, cadeia de Enter, salvar rascunho, cadastro rápido inline de categoria/fornecedor, erro por campo. Ver §4.2. Reorganizar em abas seria regressão. |
| *"Estilos inline espalhados"* | **Falso.** Varredura `style={{` em `app/` + `components/`: 30 ocorrências no total, quase todas legítimas (largura de barra de gráfico, progresso). Nenhuma ação. |
| *"6 perfis: Administrador, Gerente, Financeiro, Estoque, Vendedor, Operador Caixa"* | O RBAC real tem **4**: `OPERADOR`, `GERENTE`, `DONO`, `ADMIN` (`docs/AUTHORIZATION_MATRIX.md`). Criar os outros 2 seria criar permissão nova — vetado pelo próprio briefing. Ver §6. |

### 0.3 Documentos que esta auditoria NÃO substitui

- `docs/AUDITORIA_CONSISTENCIA_VISUAL.md` (2026-07-09) — cor/borda/raio/token, com P0-01 (`--accent` quebrado por cascata) ainda aberto. **Não repito os achados dele aqui.** O §7 deste documento trata só de *estrutura* de componente, não de paleta.
- `docs/LAYOUT_KERNEL_ERP.md` — contrato de consistência estrutural. Este documento aplica aquele contrato, não o redefine.

---

## 1. Sumário executivo

**O sistema está em estado melhor do que o briefing supõe.** O PDV tem atalhos de teclado (F1–F12), pipeline de scan com rollback transacional, venda em espera persistida, badge de preço atacado por item, troco inline. O admin tem `DataTable` com ordenação + skeleton + empty state, `FilterBar` URL-driven, `PageHeader` em 19 telas, paginação server-side. Isso é padrão de ERP profissional.

Os problemas reais são **cinco**, e nenhum deles é "falta de componente" — são lacunas de fluxo:

1. **O PDV não tem lista de resultados de busca.** Busca por nome que casa com 2+ produtos retorna `'ambiguo'` e para. O operador não tem como escolher. Único ERP da lista de referência que não resolve isso.
2. **A sidebar do admin empilha ~1000px de navegação acima do conteúdo abaixo de 1024px.** Não há drawer nem hamburger.
3. **Paginação está duplicada em 3 arquivos** com 3 comportamentos diferentes (numerada / numerada com janela / cursor).
4. **Nenhum KPI é clicável.** Dashboard e relatórios são becos sem saída — o dono vê "3 itens em estoque baixo" e precisa navegar manualmente até a tela de estoque e refiltrar.
5. **Cinco vocabulários de estilo coexistem** (`jl-*`, `var(--color-*)`, `admin-v2-*`, semânticos Tailwind, cores cruas). Custo de manutenção, não de usuário.

---

## 2. Inventário de telas

**41 rotas** (`page.tsx`). Distribuição:

| Área | Qtd | Rotas |
|---|---|---|
| PDV | 1 + 14 modais/sheets | `/caixa` |
| Admin — operação | 8 | `dashboard`, `vendas`, `catalogo`, `estoque`, `estoque/recebimento`, `estoque/transferencias`, `estoque/importar-nfe`, `estoque/imprimir-etiquetas` |
| Admin — financeiro | 3 | `financeiro`, `financeiro/contas-pagar`, `financeiro/documento/[id]` |
| Admin — cadastros | 6 | `clientes`, `fornecedores`, `funcionarios`, `categorias-produtos`, `marcas-produtos`, `categorias-financeiras` |
| Admin — gestão | 4 | `relatorios`, `auditoria`, `comissoes`, `compras` |
| Admin — sistema | 5 | `configuracoes`, `implantacao`, `provisionamento`, `diagnostico-caixa`, `suspensao` |
| Auth | 4 | `login`, `esqueci-senha`, `redefinir-senha`, `alterar-senha` |
| Público / erro | 4 | `privacidade`, `termos`, `not-found`, `error` |
| Legado (redirect) | 2 | `/gerente`, `/gerente/[...path]` |
| Demo | 1 | `demo-fluxo` |

**Adoção de componentes compartilhados:**

| Componente | Telas que usam | Telas que deveriam e não usam |
|---|---|---|
| `PageHeader` | 19 | `compras`, `catalogo/novo` (redirect) |
| `DataTable` | 11 | `funcionarios`, `contas-pagar`, `compras` (usam `GerenteTable` legado) |
| `FilterBar` | 5 | `relatorios`, `funcionarios`, `comissoes`, `auditoria` |
| `CrudListShell` | 3 (`estoque`, `categorias-produtos`, `marcas-produtos`) | `catalogo`, `vendas`, `financeiro`, `clientes`, `fornecedores` |
| `PaginationBar` | **não existe** | 3 telas com cópia local |

---

## 3. Prioridade 1 — PDV (`/caixa`)

### 3.1 Layout atual (o briefing propõe algo que já existe, em outra ordem)

`CaixaPageClient.tsx:1283` define grid de 3 colunas em `md+`:

```
┌──────────────────────┬──────────────────┬──────────────┐
│ Busca + Pagamento    │ Carrinho         │ Operações    │
│ (contexto, código,   │ (itens, badges   │ (nova venda, │
│  banner, formas,     │  ATACADO, barra  │  sangria,    │
│  troco)              │  de total)       │  em espera,  │
│                      │                  │  turno)      │
└──────────────────────┴──────────────────┴──────────────┘
```

O briefing pede `Produtos/Busca | Carrinho | Pagamento`. A diferença é que **Pagamento hoje mora na coluna 1, abaixo da busca** (`CaixaPdvOperadorTabs.tsx:262-282` — o nome "Tabs" é histórico, o componente é linear desde a remoção das abas). Isso é **melhor** que a proposta: mantém o olho do operador numa coluna só durante a venda inteira e libera a terceira coluna para operações de caixa, que na proposta do briefing não teriam lugar.

**Recomendação: não mexer no grid.** Reorganizar aqui não reduz clique nem tempo — falha nos critérios 1 e 2 do §9.

---

### 3.2 Achados

---

**Tela:** PDV — busca de produto
**Problema encontrado:** Busca que casa com mais de um produto retorna `status: 'ambiguo'` e exibe apenas uma mensagem de texto pedindo para "refinar a busca". Não existe lista de resultados em nenhum ponto do PDV. `caixaCatalogo.impl.ts:146` já faz `.limit(3)` no `ilike` por nome e `caixaCatalogo.impl.ts:110` `.limit(10)` por código de barras — **os candidatos são buscados e descartados** (`:119`, `:174`). A Consulta Rápida (F3) herda o mesmo beco: `caixaConsultaRapida.impl.ts:25-27` chama a mesma função e repassa o erro.
**Impacto operacional:** Alto e diário. Loja de importados tem SKUs com nomes quase iguais ("Fone Bluetooth Preto" / "Fone Bluetooth Branco"). Se o código de barras não lê (etiqueta amassada, produto chinês sem EAN), o operador fica sem saída com o cliente no balcão. Bling, Tiny, Omie e Linx todos abrem seletor nesse caso.
**Prioridade:** **P0**
**Sugestão:** Adicionar `status: 'multiplos'` ao retorno, carregando a lista que já é consultada, e renderizar um seletor de até 8 linhas (nome · código · preço · estoque) navegável por ↑/↓ e Enter, no painel de produto da coluna 1. Sem regra de negócio nova: o preço continua vindo de `calcularPrecoProdutoCaixaImpl` só depois da escolha. Subir os `.limit(3)` para `.limit(8)`.
**Arquivos envolvidos:** `app/caixa/server/caixaCatalogo.impl.ts:119,146,164,174` · `app/caixa/caixaActionTypes.ts` (novo status na união) · `app/caixa/scan-pipeline/webCaixaScanProcess.ts:135-139` · `app/caixa/CaixaSearchBar.tsx` (novo slot) · `app/caixa/CaixaConsultaRapidaModal.tsx`
**Risco de alteração:** **Médio.** Mexe no hot-path de scan. O ramo `'ambiguo'` some do fluxo por código de barras duplicado — que é um erro de cadastro e deve continuar avisando. Mitigação: manter `'ambiguo'` só para colisão de `codigo_barras` (`:119`) e usar `'multiplos'` só na busca por nome/categoria (`:174`). Cobertura existente: `webCaixaScanProcess.test.ts`.

---

**Tela:** PDV — carrinho
**Problema encontrado:** O estoque disponível chega no cliente (`webCaixaScanProcess.ts:210-211` grava `estoque_atual` e `estoque_minimo` em `metaPdv`) mas **nunca é renderizado na linha do carrinho**. O único sinal é um toast transitório no momento da inclusão (`:151-156`). Se o operador aumenta a quantidade depois, ou se o toast passou, a informação sumiu.
**Impacto operacional:** Médio-alto. Venda de 12 unidades com 3 em estoque só falha na finalização, com o cliente esperando. O dado já está em memória.
**Prioridade:** **P0**
**Sugestão:** Exibir o estoque na linha, com destaque quando `quantidade > estoque_atual` ou `estoque_atual <= estoque_minimo`. Reutilizar `components/ui/StockAlertBadge.tsx`, que já existe e já é usado na sidebar.
**Arquivos envolvidos:** `app/caixa/CaixaCartList.tsx` · `components/ui/StockAlertBadge.tsx`
**Risco de alteração:** **Baixo.** Puramente apresentacional, dado já disponível no store.

---

**Tela:** PDV — Consulta Rápida (F3)
**Problema encontrado:** O modal mostra preço e estoque mas não tem ação de adicionar ao carrinho. Fluxo real: F3 → digita código → lê → Esc → foca a busca → digita o **mesmo código de novo** → Enter.
**Impacto operacional:** Médio. Dobra a digitação num fluxo de consulta-e-vende, que é frequente em atacado ("quanto sai a caixa com 12?").
**Prioridade:** **P1**
**Sugestão:** Botão "Adicionar ao carrinho" no rodapé do modal, chamando o mesmo `enqueue` do pipeline de scan com `source: 'consulta'`. Nenhuma regra nova — o preço continua sendo recalculado pelo pipeline.
**Arquivos envolvidos:** `app/caixa/CaixaConsultaRapidaModal.tsx` · `app/caixa/scan-pipeline/useCaixaScanPipeline.ts`
**Risco de alteração:** **Baixo-médio.** Precisa respeitar `cupomSessionId` para não cair no guard de `stale_cupom` (`webCaixaScanProcess.ts:36-43`).

---

**Tela:** PDV — descoberta de atalhos
**Problema encontrado:** Os atalhos existem e são bons (`useCaixaKeyboardShortcuts.ts` — F1 ajuda, F2 cliente, F3 consulta, F4/F9 finalizar, F6, F8, F12, Ctrl+B, Ctrl+Z desfazer remoção), e há uma tela de referência (`CaixaKeyboardShortcutsReference.tsx`). Mas **nenhum botão da interface exibe o seu atalho**. O operador novo só descobre abrindo F1 — e não sabe que F1 existe.
**Impacto operacional:** Médio. Ataca diretamente a meta do briefing "vender sem treinamento longo". Ctrl+Z (desfazer remoção de item) é o mais valioso e o mais invisível.
**Prioridade:** **P1**
**Sugestão:** Sufixo de tecla nos rótulos dos botões do trilho de operações e da barra de finalização (`Finalizar (F4)`, `Consulta (F3)`). Fonte única: derivar do mesmo mapa que `CaixaKeyboardShortcutsReference` já consome, para não duplicar a lista.
**Arquivos envolvidos:** `app/caixa/CaixaPdvOperacoesMenu.tsx` · `app/caixa/CaixaPdvCartSaleBar.tsx` · `app/caixa/CaixaKeyboardShortcutsReference.tsx`
**Risco de alteração:** **Baixo.**

---

**Tela:** PDV — feedback de item adicionado
**Problema encontrado:** O feedback de sucesso é um toast + som opcional (`webCaixaScanProcess.ts:234-251`). Não há destaque visual na linha recém-inserida do carrinho. Em rajada de scan, o operador não distingue "entrou 1" de "entrou 2 do mesmo".
**Impacto operacional:** Médio. Divergência de quantidade descoberta só na conferência do total.
**Prioridade:** **P2**
**Sugestão:** Realce temporário (~1,2s) na linha nova. `onItemAdded` (`webCaixaScanProcess.ts:60,251`) já entrega `itemId` — é só consumir.
**Arquivos envolvidos:** `app/caixa/CaixaCartList.tsx` · `app/caixa/CaixaPageClient.tsx`
**Risco de alteração:** **Baixo.**

---

**Tela:** PDV — código de barras
**Problema encontrado:** O briefing pede "destaque para código de barras". O campo de busca é único e genérico (`CaixaSearchBar.tsx:82-100`), sem ícone de scanner nem indicação de que aceita leitura óptica. O detector de scanner existe (`hooks/useScannerDetector.test.tsx`) mas é invisível.
**Impacto operacional:** Baixo. O comportamento está certo — campo único que aceita código *ou* nome é o padrão correto (Bling faz igual). É afordância, não função.
**Prioridade:** **P3**
**Sugestão:** Ícone de código de barras no campo e placeholder explícito. Não separar em dois campos.
**Arquivos envolvidos:** `app/caixa/CaixaSearchBar.tsx:86`
**Risco de alteração:** **Nenhum.**

---

### 3.3 Requisitos do briefing já atendidos (verificados)

| Requisito | Onde |
|---|---|
| Pesquisa rápida | `CaixaSearchBar.tsx` + foco automático |
| Leitura de código de barras | `scan-pipeline/` com serialização e rollback |
| Inclusão/exclusão de itens | `CaixaCartList.tsx` + Ctrl+Z |
| Descontos | `CaixaGerenteModal.tsx` + token de gerente auditado |
| Múltiplas formas de pagamento | `CaixaPdvOperadorTabs.tsx:121-189` (divisão de cupom) |
| Venda em espera | `useCaixaVendasEmEspera.ts` + `caixaVendaEspera.impl.ts` (persistida no banco) |
| Recuperação de venda | `CaixaEmAbertoList.tsx` (retomar/descartar) |
| Preço varejo/atacado visível | `CaixaCartList.tsx:472-506` (`TipoPrecoBadge`) |

⚠️ Venda em espera está implementada mas consta como **fora do escopo D0** em `FEATURE_FREEZE_PILOTO.md`. Divergência doc↔código — verificar antes de homologar.

---

## 4. Prioridade 2 — Cadastro de produtos

### 4.1 Onde a tela realmente está

`/admin/catalogo/novo` é só um redirect (`app/admin/catalogo/novo/page.tsx:5-8`) para `/admin/catalogo?modal=novo`. O formulário real é `ProdutoFormModal.tsx` (656 linhas) → `form/ProdutoForm.tsx`, com seções em `form/sections/`.

### 4.2 O que o briefing pede já existe

| Pedido | Status |
|---|---|
| Salvar rascunho | ✅ `ProdutoFormModal.tsx:593` + `NovoProdutoRascunhoSchema` (schema separado, validação relaxada) |
| Validação clara / erro perto do campo | ✅ `form/CampoErro.tsx` + `produtoForm.clientValidation.ts` + teste `ProdutoFormModal.erroInline.behavior.test.tsx` |
| Cadastro rápido | ✅ Modo simples com cadeia de Enter `código → nome → custo → venda → estoque → salvar` (`ProdutoForm.tsx:139-160`) |
| Categoria / marca / fornecedor | ✅ Sempre visíveis, com criação inline (`SelectComCadastroRapido.tsx`, `FornecedorCombobox.tsx`) |
| Imagem | ✅ `ProdutoImagemCell.tsx` |
| Estoque inicial / mínimo | ✅ `EstoqueSection.tsx` |
| Custo / varejo / atacado / margem | ✅ `PrecosSection.tsx` + `produtoForm.margem.ts` |
| Localização / prateleira | ✅ campo `localizacaoPrateleira` |

Há teste de aceite de 30 segundos (`ProdutoFormModal.aceite30s.behavior.test.tsx`). **Reorganizar em abas seria regressão** — quebraria a cadeia de Enter, que é o que torna o cadastro rápido.

### 4.3 Achados

---

**Tela:** Cadastro de produto — modo completo
**Problema encontrado:** Ao expandir (`ProdutoForm.tsx:162-186`), três seções aparecem empilhadas de uma vez: Comercial, Compra e **Fiscal** (NCM, CFOP, CSOSN, CEST, CST PIS, CST COFINS). O piloto opera com fiscal em mock (`FEATURE_FREEZE_PILOTO.md`), então são 6 campos que ninguém preenche ocupando o caminho até "Salvar".
**Impacto operacional:** Médio. Rolagem morta em cada cadastro completo; risco de o usuário achar que são obrigatórios.
**Prioridade:** **P1**
**Sugestão:** Tornar `FiscalSection` colapsável e fechada por padrão. Não remover — o campo precisa existir para quando o fiscal entrar.
**Arquivos envolvidos:** `components/gerente/produtos/form/sections/FiscalSection.tsx` · `form/ProdutoForm.tsx:181`
**Risco de alteração:** **Baixo.**

---

**Tela:** Cadastro de produto — faixas de atacado
**Problema encontrado:** No cadastro novo o editor de faixas é substituído por texto estático "cadastre depois de salvar" (`ProdutoForm.tsx:110-115`), porque `FaixasAtacadoEditor` exige `produtoId`. Quem cadastra produto de atacado precisa salvar, reabrir e editar.
**Impacto operacional:** Médio na carga inicial do catálogo (5k–20k SKUs), baixo no dia a dia.
**Prioridade:** **P2**
**Sugestão:** No fluxo pós-salvar (`ProdutoFormModal.tsx:460-490` já tem tela de confirmação com ações), incluir "Definir faixas de atacado" como próximo passo, mantendo o modal aberto. Reduz de 4 cliques + rebusca para 1.
**Arquivos envolvidos:** `ProdutoFormModal.tsx:460-490`
**Risco de alteração:** **Baixo.**

---

**Tela:** Cadastro de produto — vocabulário de estilo
**Problema encontrado:** Todo o formulário usa aliases legados `jl-*` (`text-jl-fg-3`, `bg-jl-surface-soft`, `border-jl-border-1`), definidos em `styles/tokens/theme-fix-aggressive.css`, enquanto o admin que o hospeda usa `var(--color-*)` e `admin-v2-*`.
**Impacto operacional:** Nenhum para o usuário. Custo de manutenção.
**Prioridade:** **P3**
**Sugestão:** Ver §7.1. Não tratar isoladamente.
**Risco de alteração:** **Médio** (varredura ampla, exige exceção ao freeze).

---

## 5. Prioridade 3 — Tabelas e listagens

### 5.1 O padrão existe e é bom

`components/ui/DataTable.tsx` entrega: ordenação client e server (`:85-120`), skeleton de carregamento (`:201-215`), empty state (`:216-223`), `aria-sort`/`aria-rowcount`, header sticky opcional, densidade compacta, ações de linha. Isso é o que Bling/Tiny entregam.

### 5.2 Achados

---

**Tela:** Catálogo, Estoque, Vendas (paginação)
**Problema encontrado:** `PageLink` está copiado em três arquivos — `catalogo/page.tsx:353`, `estoque/page.tsx:337`, `vendas/page.tsx:364` — e `pageWindow` em dois (`catalogo:339`, `estoque:324`). Os três comportam-se diferente: catálogo e estoque paginam numerado, vendas usa cursor Anterior/Próxima (`vendas/page.tsx:10`), financeiro **não pagina** — corta em `limite` (`financeiro/page.tsx:53,68`).
**Impacto operacional:** Médio. O usuário reaprende a navegar a cada tela.

> **Correção (2026-08-07):** a afirmação original de que em financeiro *"registros ficam invisíveis sem aviso"* estava errada — `receivableReader.ts:119` detecta truncagem e a tela exibe `"N+"` com hint. Ver a nota de correção na Onda 2.
**Prioridade:** **P1**
**Sugestão:** Criar `components/ui/PaginationBar.tsx` — que `LAYOUT_KERNEL_ERP.md` já prevê como "criar a versão compartilhada mínima no 1º uso" — suportando os dois modos (numerado e cursor), e migrar as três telas. Financeiro passa a usar o modo numerado.
**Arquivos envolvidos:** os 3 acima + novo `components/ui/PaginationBar.tsx` + `app/admin/financeiro/page.tsx`
**Risco de alteração:** **Baixo.** Só apresentação; as actions já paginam server-side.

---

**Tela:** Funcionários, Contas a pagar, Compras
**Problema encontrado:** Usam `GerenteTable` + `DataTablePage` (`FuncionariosListClient.tsx:6-7`), a API legada que o cabeçalho do próprio `DataTable.tsx:4-6` declara que deve ser migrada. São o terceiro padrão de tabela vivo em produção.
**Impacto operacional:** Baixo-médio. Ordenação, densidade e empty state diferentes das outras 11 telas.
**Prioridade:** **P2**
**Sugestão:** Migrar as três para `DataTable` + `CrudListShell`. Fazer uma por vez, com o teste de comportamento existente como rede.
**Arquivos envolvidos:** `app/admin/funcionarios/FuncionariosListClient.tsx` · `app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx` · `app/gerente/compras/ComprasGerentePageClient.tsx`
**Risco de alteração:** **Médio.** São telas com ações de escrita (ativar/desativar usuário, registrar pagamento).

---

**Tela:** Relatórios, Funcionários, Comissões, Auditoria
**Problema encontrado:** Filtram com formulários próprios em vez de `FilterBar`. `RelatoriosPeriodFilters.tsx:52-59` monta `<form method="get">` com classes cruas; `FuncionariosListClient.tsx:60-75` filtra em memória com `useState`, sem refletir na URL.
**Impacto operacional:** Médio. Filtro de funcionários não é compartilhável por link nem sobrevive a refresh — comportamento diferente de todas as outras listas.
**Prioridade:** **P2**
**Sugestão:** Migrar Funcionários, Comissões e Auditoria para `FilterBar`. **Relatórios e Dashboard não podem** — precisam de intervalo de datas, e `FilterDef` (`FilterBar.tsx:16-37`) só tem `pills`, `select` e `search`. Adicionar `type: 'daterange'` ao `FilterBar` é o pré-requisito.
**Arquivos envolvidos:** `components/ui/FilterBar.tsx:16-37` (novo tipo) + as 4 telas
**Risco de alteração:** **Baixo-médio.**

---

**Tela:** Todas as listagens (mobile)
**Problema encontrado:** `DataTable.tsx:126-131` resolve mobile só com `overflow-x-auto`. Tabela de catálogo ou vendas em tela de 375px exige rolagem horizontal cega — sem coluna fixa, sem fallback em cartões.
**Impacto operacional:** Médio, **se** o admin for usado em celular. Não há evidência no código de que seja um caso de uso do piloto — o PDV é a tela de campo e tem tratamento mobile próprio (`CaixaPageClient.tsx:1416`).
**Prioridade:** **P3** — reavaliar depois de confirmar com o cliente se o admin roda em celular.
**Sugestão:** Se confirmado, primeira coluna sticky em `< sm`. Não construir fallback de cartões sem demanda real.
**Arquivos envolvidos:** `components/ui/DataTable.tsx`
**Risco de alteração:** **Baixo.**

---

**Tela:** Catálogo, Vendas, Financeiro, Clientes, Fornecedores
**Problema encontrado:** Não usam `CrudListShell` (`components/ui/admin-v2/CrudListShell.tsx`), cujo docblock `:22-25` diz "layout CRUD de referência, reutilizar em Clientes, Estoque, Financeiro". Cada tela remonta a ordem toolbar→bulk→tabela→footer à mão.
**Impacto operacional:** Baixo (o resultado visual acabou parecido). Divergência estrutural que tende a piorar.
**Prioridade:** **P3**
**Sugestão:** Adotar oportunisticamente ao tocar cada tela por outro motivo. **Não fazer varredura em lote** — proibido pelo `LAYOUT_KERNEL_ERP.md`.
**Risco de alteração:** **Baixo.**

---

## 6. Prioridade 4 e 5 — Dashboard, Relatórios e Permissões

---

**Tela:** Dashboard e Relatórios (drill-down)
**Problema encontrado:** `MetricCard` não aceita `href` nem `onClick` — grep por ambos em `components/ui/admin-v2/MetricCard.tsx` retorna zero. Nenhum KPI, nenhuma linha de "estoque baixo" (`dashboard/page.tsx:512-530`) e nenhum item de "top produtos" (`RelatoriosContent.tsx:92-110`) leva a lugar nenhum.
**Impacto operacional:** Alto para o dono. É o que o briefing chama de "atalhos para ações" e é onde Bling/Omie ganham: KPI é ponto de partida, não de chegada. Hoje: ver "3 em estoque baixo" → abrir menu → Estoque → aplicar filtro manualmente. Depois: 1 clique.
**Prioridade:** **P1**
**Sugestão:** `href` opcional em `MetricCard` e nas linhas de estoque baixo / top produtos, apontando para a listagem já filtrada por querystring — as telas de destino **já leem filtro da URL** (`FilterBar` é URL-driven, `estoque/page.tsx:49-71` lê `searchParams`). Zero regra nova: só compor a URL certa.
**Arquivos envolvidos:** `components/ui/admin-v2/MetricCard.tsx` · `app/admin/dashboard/page.tsx:452-530` · `app/admin/relatorios/_components/RelatoriosContent.tsx`
**Risco de alteração:** **Baixo.**

---

**Tela:** Relatórios (filtros)
**Problema encontrado:** Só filtra por período (`RelatoriosPeriodFilters.tsx`: `de`, `ate`). O briefing exige recortes por vendedor, produto, categoria e forma de pagamento. As RPCs de trás (`relatorio_vendas_por_dia_periodo`, `relatorio_top_produtos_periodo`, `relatorio_resumo_executivo_periodo`) recebem **apenas datas** — ver `docs/AUTHORIZATION_MATRIX.md`.
**Impacto operacional:** Médio-alto para gestão. Sem recorte por vendedor não há avaliação de equipe; sem forma de pagamento não se concilia taxa de cartão.
**Prioridade:** **P2 (UI) / decisão de produto (backend)**
**Sugestão:** **Não implementar filtro no frontend** — filtrar em memória sobre página parcial produz número errado e viola "não criar regras no frontend". Isto exige sobrecarga das RPCs. Tratar como item de roadmap, não de auditoria de UI. O que dá para fazer agora sem backend: adicionar `type: 'daterange'` ao `FilterBar` e migrar o formulário, deixando o terreno pronto.
**Arquivos envolvidos:** backend (migrations) + `RelatoriosPeriodFilters.tsx`
**Risco de alteração:** **Alto** (toca RPC). Fora do escopo desta auditoria.

---

**Tela:** Relatórios (exportação)
**Problema encontrado:** Botão "XLSX" permanentemente desabilitado com `opacity-60` (`RelatoriosPeriodFilters.tsx:73-76`). Promete uma função que não existe.
**Impacto operacional:** Baixo, mas corrói confiança — o usuário clica e nada acontece.
**Prioridade:** **P2**
**Sugestão:** Remover o botão. Reintroduzir quando a exportação existir. (CSV ao lado funciona.)
**Arquivos envolvidos:** `app/admin/relatorios/_components/RelatoriosPeriodFilters.tsx:73-76`
**Risco de alteração:** **Nenhum.**

---

**Tela:** Funcionários (permissões)
**Problema encontrado:** A tela lista e edita perfil (`FuncionariosListClient.tsx:48-54` — `OPERADOR`, `GERENTE`, `DONO`, `ADMIN`) mas **não mostra o que cada perfil pode fazer**. O usuário atribui "GERENTE" sem saber o que está concedendo. A matriz existe, em markdown, em `docs/AUTHORIZATION_MATRIX.md`.
**Impacto operacional:** Médio-alto. Risco de segurança operacional: dono promove alguém a GERENTE para liberar um desconto e concede junto cancelamento de venda, ajuste de estoque e liquidação de contas a receber.
**Prioridade:** **P1**
**Sugestão:** Painel somente-leitura no modal de edição resumindo as capacidades do perfil selecionado, derivado de uma constante única em `shared-core` alimentada pela matriz. **Não criar perfil nem permissão.** Os 6 perfis do briefing (Financeiro, Estoque, Vendedor separados) **não existem** no RBAC — implementá-los seria criar permissão nova, que o próprio briefing veta. Se o cliente precisa dessa granularidade, é decisão de produto com mudança de RLS, não de UI.
**Arquivos envolvidos:** `app/admin/funcionarios/FuncionarioEditarModal.tsx` · nova constante em `shared-core` · `docs/AUTHORIZATION_MATRIX.md` como fonte
**Risco de alteração:** **Baixo** (somente leitura), desde que a constante não vire fonte de decisão de autorização — a autoridade continua sendo a RLS.

---

## 7. Design System — inconsistências estruturais

> Cor, borda e raio estão em `docs/AUDITORIA_CONSISTENCIA_VISUAL.md`. Aqui só estrutura.

### 7.1 Cinco vocabulários de estilo coexistindo

| Vocabulário | Arquivos `.tsx` | Onde predomina |
|---|---|---|
| `var(--color-*)` | 84 | `components/ui/*`, admin-v2 |
| `jl-*` (alias legado) | 77 | formulários de produto, relatórios, sidebar |
| `admin-v2-*` (classes CSS) | 45 | páginas `/admin` |
| Semânticos Tailwind (`bg-card`, `text-foreground`) | 16 | PDV |
| Cores cruas (`bg-slate-`, `bg-red-600`) | 14 | erro, not-found, gráficos |

Três deles aparecem **no mesmo arquivo** em vários casos (ex.: `RelatoriosContent.tsx` usa `jl-fg-1`, `var(--color-chart-gold)` e `admin-v2-badge-gold`).

**Prioridade:** **P2 estrutural / P4 visual.** O usuário não vê. O custo é de manutenção e de risco: `AUDITORIA_CONSISTENCIA_VISUAL.md` já documentou que `--accent` está quebrado (P0-01) justamente por conflito entre esses sistemas.
**Sugestão:** Não unificar em lote — isso é redesign e está congelado. Congelar a entropia: regra de lint proibindo `jl-*` e cor crua em **arquivo novo**, permitindo o que existe. Unificação real depende de decisão do sponsor (§0.1).

### 7.2 Tabela de componentes duplicados

| Componente | Local atual | Problema | Componente padrão sugerido |
|---|---|---|---|
| `PageLink` | `catalogo/page.tsx:353`, `estoque/page.tsx:337`, `vendas/page.tsx:364` | 3 cópias, 3 comportamentos | **criar** `components/ui/PaginationBar.tsx` |
| `pageWindow` | `catalogo/page.tsx:339`, `estoque/page.tsx:324` | 2 cópias idênticas | idem |
| `GerenteTable` | `funcionarios`, `contas-pagar`, `compras` | API legada; o próprio `DataTable.tsx:4-6` manda migrar | `components/ui/DataTable.tsx` |
| `DataTablePage` | `funcionarios`, `contas-pagar` | shell legado | `components/ui/admin-v2/CrudListShell.tsx` |
| Filtro de período | `RelatoriosPeriodFilters.tsx`, `DashboardFilters.tsx` | 2 implementações; `FilterBar` não suporta data | `FilterBar` + novo `type: 'daterange'` |
| Filtro em memória | `FuncionariosListClient.tsx:60-75` | não usa URL, quebra refresh/compartilhamento | `components/ui/FilterBar.tsx` |
| Toast | `lib/gerente/toast.ts` (admin) · `hooks/useCaixaMensagens.ts` (PDV) | 2 sistemas paralelos | **manter os dois** — o PDV precisa de toast com som e prioridade de erro; unificar seria perda |
| `TabelaCadastroPadrao` | `components/gerente/cadastro/` | 4º padrão de tabela, pouco usado | `DataTable` |

### 7.3 Estados de carregamento e erro

Existem 2 `loading.tsx` (`app/admin`, `app/caixa`) e 2 `error.tsx` (`app/`, `app/caixa`) — cobertura por herança do App Router é correta, então **não há tela sem boundary**. Mas:

- `app/admin/loading.tsx` é um spinner genérico para as 26 telas do admin. O layout salta ao carregar. `DataTable` já tem skeleton (`:201-215`) — o que falta é o skeleton no nível da rota.
- `app/error.tsx` na raiz atende financeiro, estoque, relatórios etc. com a mesma mensagem genérica.

**Prioridade:** **P2.** **Sugestão:** `loading.tsx` por segmento nas 5 telas mais pesadas (catálogo, estoque, vendas, financeiro, relatórios), reaproveitando `PageHeader` + `DataTable loading`. **Risco:** nenhum.

---

## 8. Ranking — 20 telas mais críticas

Critério: `frequência de uso × custo do erro × distância do padrão de mercado`.

| # | Tela | Rota | Por que está aqui | Achados |
|---|---|---|---|---|
| 1 | **PDV** | `/caixa` | Toda venda passa aqui; erro custa cliente no balcão | P0 busca sem lista · P0 estoque invisível · P1 consulta sem "adicionar" · P1 atalhos ocultos |
| 2 | **Catálogo** | `/admin/catalogo` | Base de tudo; 5k–20k SKUs | P1 paginação duplicada · P3 sem `CrudListShell` |
| 3 | **Cadastro de produto** | modal do catálogo | Gargalo da implantação | P1 fiscal empilhado · P2 faixas só pós-salvar |
| 4 | **Estoque** | `/admin/estoque` | Ruptura = venda perdida | P1 paginação duplicada |
| 5 | **Vendas** | `/admin/vendas` | Conferência e cancelamento | P1 paginação (cursor divergente) |
| 6 | **Dashboard** | `/admin/dashboard` | Primeira tela do dono | P1 KPI sem drill-down |
| 7 | **Financeiro** | `/admin/financeiro` | Dinheiro a receber | ~~P1 sem paginação — registros invisíveis~~ → **P2 corrigido**: a truncagem **é** avisada (`"N+"` + hint); o defeito é não haver como alcançar o restante. Ver Onda 2 |
| 8 | **Funcionários** | `/admin/funcionarios` | Concede poder no sistema | P1 perfil sem explicação · P2 tabela legada · P2 filtro sem URL |
| 9 | **Relatórios** | `/admin/relatorios` | Decisão gerencial | P1 sem drill-down · P2 botão XLSX morto · P2 recortes ausentes (backend) |
| 10 | **Recebimento** | `/admin/estoque/recebimento` | Entrada de mercadoria | herda componentes `gerente/*` sem adaptação (ver auditoria visual) |
| 11 | **Contas a pagar** | `/admin/financeiro/contas-pagar` | Saída de caixa | P2 tabela legada |
| 12 | **Clientes** | `/admin/clientes` | Vinculado à venda | P3 sem `CrudListShell` |
| 13 | **Auditoria** | `/admin/auditoria` | Rastreabilidade | P2 filtro fora do padrão |
| 14 | **Login** | `/login` | Porta de entrada | não auditado em profundidade — sem achado |
| 15 | **Configurações** | `/admin/configuracoes` | Muda comportamento do PDV | 488 linhas em um componente; sem achado de fluxo |
| 16 | **Fornecedores** | `/admin/fornecedores` | Rastreabilidade de compra | P3 sem `CrudListShell` |
| 17 | **Comissões** | `/admin/comissoes` | Remuneração | P2 filtro fora do padrão |
| 18 | **Compras** | `/admin/compras` | Reposição | P2 tabela legada · sem `PageHeader` |
| 19 | **Importar NF-e** | `/admin/estoque/importar-nfe` | Carga em lote | componente `gerente/*` sem adaptação |
| 20 | **Transferências** | `/admin/estoque/transferencias` | Fora do escopo D0 (uma loja) | baixa prioridade no piloto |

Fora do ranking por baixo impacto no piloto: `implantacao`, `provisionamento`, `diagnostico-caixa`, `suspensao`, `categorias-*`, `marcas-produtos`, `demo-fluxo`, páginas legais.

---

## 9. Plano incremental de implementação

Cada onda é entregável e reversível de forma independente.

### Onda 1 — PDV: destravar a operação de balcão (P0) — ✅ IMPLEMENTADA (2026-08-07)
Cabe no freeze: correção de fluxo quebrado, sem regra nova.

1. Seletor de múltiplos resultados na busca (`'multiplos'` + lista navegável por teclado)
2. Estoque disponível na linha do carrinho

**Aceite:** operador acha produto por nome quando 2+ casam, sem sair da tela · quantidade acima do estoque sinaliza antes da finalização · `webCaixaScanProcess.test.ts` verde · nova cobertura para `'multiplos'`.

#### O que foi entregue

| Arquivo | Mudança |
|---|---|
| `app/caixa/caixaActionTypes.ts` | `ProdutoCaixaResumoDTO` + variante `status: 'multiplos'` |
| `app/caixa/server/caixaCatalogo.impl.ts` | ramo de resolução por id; nome/categoria devolve candidatos; `limit` 3 → 8 |
| `app/caixa/server/caixaEstoqueServer.ts` | `estoqueResumoLoteParaCaixa` — estoque dos candidatos em 1 query |
| `app/caixa/scan-pipeline/webCaixaScanProcess.ts` | ramo `'multiplos'` entrega candidatos sem tocar o carrinho |
| `app/caixa/CaixaResultadosBusca.tsx` | **novo** — popup do combobox (apresentacional) |
| `app/caixa/CaixaSearchBar.tsx` | contrato ARIA de combobox + ↑/↓/Enter/Esc |
| `app/caixa/CaixaCartList.tsx` | `EstoqueLinha` — saldo permanente, graduado |
| `app/admin/diagnostico-caixa/diagnosticoCaixa.impl.ts` | trata o novo status (achado do typecheck) |

#### Três decisões tomadas durante a execução

1. **`ambiguo` foi preservado, não substituído.** Código de barras que casa com 2+ produtos é erro de cadastro, não escolha de operador — continua sendo beco com orientação. Só a busca por **nome/categoria** virou `'multiplos'`. Sem essa separação, um cadastro duplicado passaria a ser tratado como situação normal e nunca seria corrigido.

2. **A escolha reentra pelo pipeline de leitura usando o `id` do produto como chave.** Alternativa descartada: uma action dedicada de "adicionar produto escolhido". Manter uma única porta de escrita no carrinho preserva rollback transacional, guard de `cupomSessionId` e telemetria sem duplicá-los. Um `codigo_barras` nunca tem formato UUID, então o ramo não sequestra leitura de scanner.

3. **Foco permanece no campo de busca (padrão combobox), não vai para a lista.** A primeira versão movia o foco para o contêiner da lista; isso obrigava o operador a clicar de volta no campo para refinar o termo — exatamente o clique que a lista existe para eliminar. Também exigia um guard extra no ímã de foco de 3s, que deixou de ser necessário.

#### Desvio do plano original

O documento sugeria reutilizar `components/ui/StockAlertBadge.tsx` na linha do carrinho. **Não foi reutilizado:** aquele componente é um contador de *quantos itens* estão em estoque baixo (sidebar), não um indicador de saldo por produto, e sua paleta é de tema escuro. O reuso correto foi o vocabulário de chips que o próprio `CaixaCartList.tsx` já define (`CAIXA_CHIP_*`), com um `CAIXA_CHIP_DANGER` novo sobre tokens existentes.

#### Verificação

| Gate | Resultado |
|---|---|
| `tsc --noEmit` (typecheck) | ✅ 0 erros |
| `next build` | ✅ compila |
| `next lint` (arquivos tocados) | ✅ 0 warnings |
| Suíte completa | ✅ 916 testes / 167 arquivos |
| Cobertura nova | 16 testes (`webCaixaScanMultiplos`, `CaixaSearchBar.combobox`, `CaixaCartList.estoque`) |
| `guard:core` (regra de negócio na UI) | ✅ OK |
| `guard:pdv`, `guard:routes`, `guard:pricing`, `guard:deps`, `guard:domain`, `check:entity-ssot` | ✅ OK |
| `guard:rpc` | ❌ **falha pré-existente** — ver abaixo |

**`guard:rpc` estava vermelho antes desta onda.** Reproduzido com as mudanças em `git stash`: acusa `caixaFormasPagamento.impl.ts` como caller duplicado de `finalizar_venda_transacional_canonica_v4`. Nenhum arquivo tocado aqui tem relação com o fluxo de finalização. Não corrigido de propósito — é o núcleo transacional congelado, precisa de análise própria.

**Não verificado em navegador.** O PDV exige sessão autenticada e caixa aberto, e o único ambiente Supabase existente é produção (`project_infra_topologia_ambientes`). Exercitar o PDV lá geraria sessão e telemetria reais. Fica como item de homologação humana, junto com os cenários da matriz de aceite.

---

### Revisão de regressão da Onda 1 (2026-08-07)

Quatro validações exigidas antes de abrir a Onda 2. Restrição respeitada: **nenhuma migration, RPC, entidade de domínio ou fluxo transacional foi tocado** — o diff da revisão é 1 arquivo de teste novo.

#### R1 · Código de barras mantém `ambiguo` — ✅ validado

Duas evidências independentes:

- **Diff:** a única linha `status: 'ambiguo'` removida é a da mensagem *"(nome ou categoria)"*. O ramo de código de barras (`ids.size > 1`, mensagem *"Vários produtos batem com o código lido"*) está intacto em `caixaCatalogo.impl.ts:180-186`. O ramo por id roda antes, mas não o intercepta: EAN/UPC/GTIN nunca casa com o formato UUID.
- **Teste novo no servidor:** `caixaCatalogoBusca.regressao.test.ts`. O teste anterior (`webCaixaScanMultiplos`) mockava a server action — validava a reação da UI, não a decisão. Esta era uma lacuna real, agora fechada.

**Teste de mutação executado.** Trocar `'ambiguo'` por `'multiplos'` na linha 183 faz o teste falhar com `expected { status: 'multiplos' } to match object { status: 'ambiguo' }`. Fonte revertida e conferida. Registro isto porque a primeira tentativa de mutação usou um regex que não casou: o teste "passou" sem que a mutação existisse. Um teste de regressão que nunca foi visto falhando não é evidência.

#### R2 · Seleção de candidato não cria segunda regra de carrinho — ✅ validado

`grep` por `adicionarItem(` em toda a árvore `app/caixa/` (fora de testes) retorna **uma única ocorrência**: `webCaixaScanProcess.ts:213`. `handleEscolherResultado` chama `enqueueLeitura(produto.id, …)` — não escreve no store. A escolha reentra pelo pipeline e herda, sem duplicação: preço autoritativo do servidor, rollback da linha, guard de `cupomSessionId`, dedupe de scanner e telemetria.

Coberto por asserção: *"escolha confirmada (id do produto) entra no carrinho pelo caminho normal"* verifica que o preço gravado é o do servidor (44,90 ATACADO), não o `preco_varejo` da lista (49,90). **A lista não decide preço.**

#### R3 · Estoque exibido usa a mesma fonte da finalização — ✅ validado

Rastreio dos dois lados:

| | Tabela · coluna | Escopo de loja |
|---|---|---|
| **UI** (`estoqueResumoParaCaixa` / `…LoteParaCaixa`) | `estoque.quantidade_atual` | `usuarios.loja_id ?? LOJA_MATRIZ_ID` |
| **Finalização** (`decrementar_estoque_seguro`, migration 291:94-99) | `estoque.quantidade_atual` ... `FOR UPDATE` | `caixas.loja_id` da venda |

As duas derivações de loja **convergem por construção**: `caixaSessaoOperador.impl.ts:75` abre o caixa com `getLojaIdUsuario(user.id) ?? LOJA_MATRIZ_ID` — a mesma cadeia que a UI usa. Mesma tabela, mesma coluna, mesmo escopo.

Verificado também que a leitura em lote não introduz divergência contra a unitária: `estoque_loja_produto_unique ON public.estoque (loja_id, produto_id)` (migration 032:62) garante no máximo 1 linha por par, então `.maybeSingle()` e `.in()` + `Map` não podem discordar.

**Duas ressalvas honestas, ambas pré-existentes (não introduzidas aqui):**

1. O número exibido é um *snapshot do momento da leitura*, não uma reserva. Entre exibir e finalizar, outro caixa pode consumir o saldo. A UI antecipa informação; a autoridade continua sendo o `FOR UPDATE` do servidor. O toast anterior tinha exatamente a mesma propriedade.
2. Se `usuarios.loja_id` for alterado **no meio do turno**, a UI passa a ler a loja nova enquanto a finalização usa a loja do caixa já aberto. Fora do escopo do piloto (uma loja), mas é a única forma de as duas fontes divergirem.

#### R4 · Métricas UX antes/depois

**São contagens analíticas derivadas dos caminhos de código, não medição com operador real.** Marco isso porque a diferença importa: o ganho real depende de com que frequência cada cenário ocorre na loja, e isso não se sabe sem observação.

| Cenário | Antes | Depois | Ganho |
|---|---|---|---|
| Vender produto por nome, 2+ acertos (etiqueta ilegível) | `fone`+Enter → beco. Saída: redigitar o nome exato completo (~21 toques) — **e só funciona se o operador souber o texto que distingue os produtos** | `fone`+Enter+↓×0-7+Enter = **6-13 toques**, 0 cliques | Deixa de ser um beco. Quando o nome não distingue, antes era **impossível no PDV** |
| Conferir estoque de item já no carrinho | F3 + digitar código + ler + Esc ≈ **15 toques**, exige saber o código | **0** — permanente na linha | Elimina a tarefa |
| Descobrir quantidade acima do estoque | Só no F4, depois de escolher pagamento, com cliente aguardando | No momento em que a quantidade é digitada | Move a descoberta para antes do checkout |
| Round-trips ao servidor por busca ambígua | 1 (e sem resultado utilizável) | 1 + 1 na confirmação. Estoque dos 8 candidatos em **1 query**, não N | +1 round-trip, sem N+1 |

**Instrumentação para medição real: não implementada, por decisão.** Emitir `seletor_exibido` / `candidato_escolhido` / `posicao_escolhida` exigiria estender `HumanTelemetryScanEvent` em `shared-core/src/pdv/scan-pipeline.ts` — contrato compartilhado com o `pdv-local` (desktop). Isso é alterar domínio, vetado nesta rodada. Fica como decisão sua: **sem esses eventos, o antes/depois acima permanece analítico e não haverá dado de campo para confirmá-lo.** O que já existe (`buscar_produto_duration_ms`, `scan_to_visual_ack_ms`) mede latência, não escolha.

#### Estado dos gates após a revisão

`tsc` 0 erros · **923 testes / 168 arquivos** (+7 da regressão) · `guard:core`, `guard:pdv`, `guard:routes`, `guard:pricing`, `guard:deps`, `guard:domain`, `check:entity-ssot` ✅ · `guard:rpc` ❌ pré-existente (inalterado).

### Onda 2 — Consolidação estrutural (P1, baixo risco) — ✅ 4 de 5 (2026-08-07)
Cabe no freeze: é exatamente o "criar o compartilhado no 1º uso" do `LAYOUT_KERNEL_ERP.md`.

3. ✅ `components/ui/PaginationBar.tsx` + migração de catálogo, estoque, vendas
4. ⏸️ Paginação em financeiro — **bloqueado por contrato de domínio, ver abaixo**
5. ✅ `href` em `MetricCard` + drill-down do dashboard para listas filtradas
6. ✅ Remover botão XLSX morto
7. ✅ `loading.tsx` por segmento nas 5 telas pesadas

**Aceite:** uma só forma de paginar · KPI leva à lista filtrada · nenhum controle desabilitado permanente.

#### Correção da auditoria — o achado sobre financeiro estava errado

O §5.2 e a linha 7 do ranking afirmavam que o financeiro *"corta em `limite`, registros ficam invisíveis sem aviso"*. **A parte "sem aviso" é falsa.** `receivableReader.ts:119-120` lê `limite+1` linhas justamente para detectar truncagem, e `financeiro/page.tsx:151,154` exibe o KPI como `"N+"` com o hint `financeiro_kpi_truncado`. O usuário **é** avisado.

O defeito real é menor e diferente: ele é avisado de que há mais e **não tem como chegar lá**. Reclassificado de P1 (perda silenciosa de dado) para **P2 (beco sem saída anunciado)**.

#### Por que o item 4 não foi executado

Paginar de verdade exige `offset`/`range` em `ListReceivablesQuery`, definido em `@shared-core/src/financial` e governado pela **ADR-010**. É contrato de domínio compartilhado — fora do que esta onda autoriza e fora do que foi pedido. Não alterei por conta própria.

Três saídas possíveis, em ordem de custo:

1. **Elevar o teto** de 200 para o máximo que o reader já aceita (500, `receivableReader.ts:80`) — uma linha, zero mudança de contrato, adia o problema.
2. **Filtrar para estreitar** — a tela já tem busca, cliente e intervalo de vencimento via `FilterBar`. Documentar isso como o caminho oficial e melhorar o texto do aviso.
3. **Paginação real** — estender a ADR-010 com `offset`. Correto a longo prazo, mas é decisão de arquitetura, não de UI.

Recomendo (1) + (2) agora e (3) no mesmo momento em que a ADR-010 for revisitada por outro motivo. **Aguardando sua decisão.**

#### O que foi entregue

| Arquivo | Mudança |
|---|---|
| `components/ui/PaginationBar.tsx` | **novo** — modos `numbered` e `cursor`; exporta `pageWindow` |
| `app/admin/{catalogo,estoque,vendas}/page.tsx` | migradas; **−117 linhas** de `PageLink`/`PageNumber`/`pageWindow` duplicados |
| `components/ui/admin-v2/MetricCard.tsx` | props `href`/`hrefLabel` opcionais; sem `href` o card segue idêntico |
| `app/admin/dashboard/page.tsx` | 4 KPIs com drill-down + "Ver estoque" na seção de estoque baixo |
| `app/admin/relatorios/_components/RelatoriosPeriodFilters.tsx` | botão XLSX morto removido, com a plumbing de label junto |
| `components/ui/admin-v2/ListPageSkeleton.tsx` | **novo** — esqueleto de rota parametrizável |
| `app/admin/{catalogo,estoque,vendas,financeiro,relatorios}/loading.tsx` | **novos** — 5 linhas cada, sem duplicar layout |

#### Duas decisões durante a execução

1. ~~**O KPI de 30D do dashboard não virou link.** `periodoVendasEquivalente` mapeia `TODAY→hoje` e `7D→7d` exatamente…~~ — **corrigido em 2026-08-07.** A afirmação de que `7D→7d` mapeava "exatamente" estava errada: o dashboard usa `hoje−6` às 00:00, a tela de vendas usa `agora−168h` — 8,5h de diferença. Era um link falso. Agora **só `TODAY` é linkado**; `7D` e `30D` ficam estáticos. Guarda em `app/admin/dashboard/periodoDrilldown.test.ts`. Ver `docs/AUDITORIA_POS_ONDA_2.md` §1.2.

2. **KPI que falhou não vira link.** Se a consulta do período falhou e o card mostra `—`, o `href` é omitido: clicar levaria a uma lista que não explica o traço.

3. **Skeleton de relatórios ajustado após conferir a tela.** A primeira versão esboçava 4 cards de KPI; relatórios não tem faixa `admin-v2-grid-kpi` — abre em gráficos. Corrigido para `kpis={0}`, senão o skeleton deslocaria o layout na troca, que é exatamente o problema que ele existe para resolver.

#### Verificação

`tsc` 0 erros · `next build` compila · `next lint` 0 warnings · **933 testes / 169 arquivos** (+10 de `PaginationBar`) · `guard:core`, `guard:routes`, `guard:domain`, `check:entity-ssot` ✅ · `guard:rpc` ❌ pré-existente (inalterado).

Sem verificação em navegador, pela mesma razão da Onda 1.

### Onda 3 — Clareza operacional (P1–P2)
8. Atalhos visíveis nos botões do PDV
9. `FiscalSection` colapsada por padrão
10. Painel de capacidades do perfil em Funcionários (leitura, derivado da matriz)
11. `type: 'daterange'` no `FilterBar` + migração de relatórios e dashboard
12. Funcionários, comissões e auditoria para `FilterBar` (filtro na URL)

**Aceite:** operador descobre atalho sem abrir F1 · quem promove usuário vê o que concede · todo filtro sobrevive a refresh.

### Onda 4 — Dívida técnica (P2–P3) — **exige decisão do sponsor (§0.1)**
13. Migrar `GerenteTable` → `DataTable` (funcionários, contas a pagar, compras) — uma tela por PR
14. Lint barrando `jl-*` e cor crua em arquivo novo
15. `CrudListShell` adotado oportunisticamente

### Fora deste plano (decisão de produto, não de UI)
- Recortes de relatório por vendedor / produto / categoria / forma de pagamento — exige sobrecarga de RPC
- Perfis Financeiro / Estoque / Vendedor separados — exige RLS nova
- Fallback mobile de tabelas — sem demanda confirmada

---

## 10. Critério de aprovação aplicado

Cada item foi avaliado contra os 6 critérios do briefing. Itens que reprovaram e por isso **não** entraram no plano:

| Item considerado | Reprovou em | Motivo |
|---|---|---|
| Reorganizar grid do PDV para `Busca \| Carrinho \| Pagamento` | 1, 2 | Não reduz tempo nem clique; o layout atual concentra melhor a atenção e ainda acomoda o trilho de operações |
| Abas no cadastro de produto | 1, 2, 3 | Quebraria a cadeia de Enter, que é o que torna o cadastro rápido hoje |
| Unificar os 2 sistemas de toast | 3, 6 | O PDV precisa de som e prioridade de erro; unificar perderia função |
| Filtrar relatório no frontend | 4, 5 | Produziria número errado sobre página parcial e criaria regra no frontend |
| Fallback de tabela em cartões no mobile | 6 | Complexidade sem demanda confirmada |

Aprovaram nos 6: **todos os itens das Ondas 1–3.**

---

**Próximo passo:** aprovação deste documento e da Onda 1. A execução começa por `app/caixa/server/caixaCatalogo.impl.ts`.
