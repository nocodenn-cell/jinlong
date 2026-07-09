# Auditoria de Consistência Visual — Jinlong ERP

**Data:** 2026-07-09
**Escopo:** `pdv-importados` (app Next.js — Dashboard, Login, Cadastro de Produtos, Catálogo, Estoque, Caixa/PDV, Financeiro, Clientes, Fornecedores, Auditoria, Configurações, Relatórios, e os componentes transversais: Modais, Tabelas, Formulários, Sidebars, Header, Cards, Dialogs, Dropdowns, Toasts).
**Método:** leitura de código (sem execução visual em browser), evidência por arquivo:linha. Nenhum código foi alterado nesta etapa.
**Não incluído:** redesign, troca de identidade visual, refatoração, novas features, mudança de UX.

---

## 0. Achado estrutural prévio (contexto obrigatório para ler o resto do documento)

Antes de entrar nos problemas de cor/espaçamento, um achado estrutural muda a leitura de tudo:

**A árvore `app/gerente/*` está morta em produção.** `app/gerente/page.tsx` e `app/gerente/[...path]/page.tsx` são os **únicos** `page.tsx` existentes nessa árvore — todo o resto (`clientes/`, `fornecedores/`, `produtos/`, `estoque/`, `financeiro/`, `relatorios/`, `configuracoes/`, `comissoes/`, `compras/`, `vendas/`, `transferencias/`, `suspensao/`, `atividades/`, `categorias-*`) não tem `page.tsx` e portanto é **inalcançável por rota**. Qualquer acesso a `/gerente/*` cai no catch-all e é redirecionado via `legacyGerenteRedirect` (`shared-core/navigation/routes.ts:76-110`) para o equivalente em `/admin/*`. O sistema real, vivo, é `app/admin/*` sobre o design system "admin-v2" (`components/ui/admin-v2/*`, `styles/admin-v2.css`).

Consequência prática para a auditoria:
- Inconsistências **dentro** da árvore `app/gerente/*` (headers, badges, paddings) são **dívida técnica morta**, não um problema visual que o usuário final vê — por isso foram rebaixadas de severidade abaixo, mesmo quando o código é objetivamente inconsistente.
- Só importa quando código "gerente" **vaza para dentro do app vivo**. Isso acontece em pelo menos 5 pontos concretos, e esses SIM são os achados de maior impacto real:
  1. `app/admin/estoque/importar-nfe`, `app/admin/estoque/recebimento`, `app/admin/estoque/transferencias` e `app/admin/catalogo/novo` — rotas **ativas** dentro do admin-v2 que renderizam componentes-cliente herdados de `app/gerente/*` sem adaptação, com tipografia e padding de página diferentes do resto do admin.
  2. `components/gerente/GerenteToastViewport.tsx` é o sistema de toast **efetivamente usado** por `app/admin/layout.tsx` — ou seja, o app "novo" depende de um componente com nome/paleta "legado".
  3. `GerenteHeaderNav`/`GerenteLayoutShell` ainda renderizam brevemente antes do redirect de `/gerente/*` — impacto mínimo (flash), citado apenas por completude.

---

## 1. Cores

### [P0-01] Token `--accent` quebrado por conflito de cascata — hover de botões `outline`/`ghost` some silenciosamente
- **Tela/Componente:** Global — afeta `components/ui/button.tsx` (variantes `outline` e `ghost`, usadas em toda a área admin), `components/ui/button-tokenized.tsx`, `app/caixa/CaixaCartList.tsx`.
- **Evidência:** `app/globals.css:23` define `--accent: 210 40% 96%;` (tripla HSL "nua"). `app/layout.tsx:4-5` importa `globals.css` e, **depois**, `styles/theme-oriental.css`, que em `styles/theme-oriental.css:13,34,970` redefine `--accent: #2563eb;` (hexadecimal). `tailwind.config.js:51-53` mapeia `accent: { DEFAULT: "hsl(var(--accent))" }`. Como o import posterior vence a cascata, o valor final de `--accent` é o hex `#2563eb`, e a classe Tailwind gera `hsl(#2563eb)` — **CSS inválido**. Navegadores descartam declarações com valor de custom property inválido, então `bg-accent`/`hover:bg-accent`/`text-accent` deixam de aplicar cor nenhuma.
- **Impacto:** botões `outline`/`ghost` (usados amplamente em toolbars, filtros, ações secundárias) perdem o feedback visual de hover — o usuário não recebe indicação de que o elemento é clicável/interativo. Quebra de usabilidade silenciosa, sem erro visível em console.
- **Correção mínima:** padronizar o formato do token — ou `theme-oriental.css` passa a definir `--accent` como tripla HSL (`221 83% 53%` equivalente a `#2563eb`), ou `tailwind.config.js` deixa de envolver `--accent` em `hsl()` e usa a var diretamente. Não requer redesenhar nada, só alinhar formato.
- **Esforço:** 15 min (1 linha em `theme-oriental.css` ou `tailwind.config.js`, com QA visual do hover em 2-3 telas).

### [P1-02] Token `--border` funciona "por acidente" de ordem de import
- **Tela/Componente:** Global — toda borda que usa a classe `border`/`border-border`.
- **Evidência:** `app/globals.css:31` define `--border: 214.3 31.8% 91.4%;` (tripla HSL nua), mas `tailwind.config.js:26` mapeia `border: "var(--border)"` **sem** envolver em `hsl()` (diferente de todos os outros tokens de cor). Isso só não quebra hoje porque `styles/theme-oriental.css:12,33` redefine `--border: #e2e8f0;` (hex) e esse import sempre roda depois de `globals.css`. Se alguém reordenar os imports de CSS (algo plausível numa limpeza futura), toda borda do app fica sem cor.
- **Impacto:** risco latente de regressão visual generalizada (bordas invisíveis em cards, inputs, tabelas), não é um bug visível hoje.
- **Correção mínima:** mesma correção do item anterior, aplicada a `--border`: uniformizar formato entre `globals.css` e `theme-oriental.css`, e alinhar o mapeamento no Tailwind config.
- **Esforço:** 15 min.

### [P1-03] Vermelho, verde e azul "de função" com 2–3 tonalidades concorrentes cada
- **Tela/Componente:** Catálogo/Produtos (`app/gerente/produtos/ProdutosGerentePageClient.tsx` — legado, mas o padrão se repete em telas vivas), Dashboard (`app/admin/dashboard/SalesTrendChart.tsx`), Caixa (`app/caixa/CaixaMovimentacaoModal.tsx`, `CaixaMovimentacoesTimeline.tsx`), componentes de UI (`components/ui/DragonModal.tsx`, `components/gerente/GerenteToastViewport.tsx`).
- **Evidência (vermelho/erro):** `components/ui/DragonModal.tsx:136` usa `bg-red-500 text-red-400`; `components/gerente/cadastro/ConfirmExcluirCadastroModal.tsx:65` usa `bg-red-600`/`bg-red-700`; `app/admin/dashboard/SalesTrendChart.tsx:25,31,36-37` usa hex literal `#c42e2e`; `app/caixa/CaixaMovimentacaoModal.tsx:246` e `CaixaMovimentacoesTimeline.tsx:82` usam hex literal `#b91c1c`. Nenhum desses referencia o token `--destructive: 0 72% 50%` já definido em `app/globals.css:26`.
- **Evidência (verde/sucesso):** `app/gerente/produtos/ProdutosGerentePageClient.tsx:807,1143` usa `bg-green-500 text-green-400`; `components/gerente/produtos/ProdutosToolbar.tsx:117,122` usa `bg-green-500` **e** `text-green-600` no mesmo toolbar. Token `--success: 142 64% 42%` (`globals.css:29`) existe e não é usado.
- **Evidência (azul/ação):** `app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx:186,241` usa `bg-blue-600`/`bg-blue-700`; `app/global-error.tsx:20` e `app/not-found.tsx:9,12` usam `bg-blue-600/700`; `app/admin/dashboard/SalesTrendChart.tsx:24,30,36` usa hex `#1890ff` — um azul diferente do `--accent` real (`#2563eb`).
- **Impacto:** o mesmo significado (erro, sucesso, ação primária) é representado por cores visualmente distintas dependendo da tela, quebrando a leitura rápida de estado que um ERP depende (ex.: operador de caixa vê "vermelho de estorno" mais escuro no PDV do que no gráfico do dashboard).
- **Correção mínima:** substituir as ocorrências por `text-destructive`/`bg-destructive`, `text-success`/`bg-success`, `bg-primary`/`text-accent` conforme o caso. Não exige criar cor nova — os tokens já existem.
- **Esforço:** 2–3h (troca mecânica de classes em ~15 arquivos, maior parte em código já morto de `app/gerente`, mas incluindo os 4 arquivos vivos citados — `SalesTrendChart.tsx`, `CaixaMovimentacaoModal.tsx`, `CaixaMovimentacoesTimeline.tsx`, `global-error.tsx`, `not-found.tsx`).

### [P2-04] `styles/tokens/*.css` (o "design system" documentado) nunca carrega em produção
- **Tela/Componente:** Todo o app — vs. Storybook.
- **Evidência:** `styles/tokens/{base,semantic,theme,component,index,migration-guide}.css` só são importados em `.storybook/preview.ts:2-3`. Nenhum arquivo em `app/**` os importa. `styles/theme-oriental.css:17-21` documenta o próprio gap: *"Espelha tokens/base.css, que só é carregado no Storybook... sem isto o app não tem o token."*
- **Impacto:** o Storybook — que deveria ser a referência de consistência — mostra um sistema de tokens mais rico (incluindo um tema escuro completo em `styles/tokens/theme.css:73-103`) que diverge do que roda em produção. Qualquer decisão visual tomada olhando o Storybook pode não corresponder ao app real.
- **Correção mínima:** não é preciso portar tudo — no mínimo, adicionar um comentário no topo de `styles/tokens/index.css` avisando "NÃO carregado em produção, ver `theme-oriental.css`" para não induzir o próximo dev a erro.
- **Esforço:** 10 min (comentário) até 1 dia (se decidirem unificar de verdade — fora do escopo desta auditoria).

### [P3-05] `styles/chinese-theme.css` é código morto (144 linhas, zero imports, zero uso)
- **Evidência:** grep completo no repo não encontra nenhum `import` desse arquivo nem uso de suas classes (`.admin-chinese-theme`, `.card-chinese`, `.filter-pill-active`, etc.).
- **Impacto:** nenhum (não afeta usuários), mas é ruído para quem for auditar cores no futuro.
- **Correção mínima:** remover o arquivo (fora do escopo de "não implementar", mas é a única ação — não há redesign envolvido; se preferirem não mexer agora, apenas anotar como candidato a remoção).
- **Esforço:** 5 min.

---

## 2. Bordas e Border-radius

### [P2-06] `rounded-[10px]` hardcoded ao lado de `rounded-lg` no mesmo tipo de componente
- **Tela/Componente:** Cards de métrica (Dashboard).
- **Evidência:** `components/ui/card.tsx:12` (Card canônico) usa `rounded-lg` (→ `--radius: 0.5rem` = 8px, `globals.css:34`). Mas `components/ui/StatCard.tsx:21` e `components/ui/MetricCard.tsx:175` usam `rounded-[10px]` — valor fixo, não derivado do token `--radius`, e visualmente diferente (10px vs 8px). `components/ui/admin-v2/MetricCard.tsx:92` ainda usa `rounded-md` para o chip de ícone dentro do mesmo card que usa `rounded-lg` no wrapper — um terceiro raio no mesmo componente.
- **Impacto:** perceptível ao lado a lado (cantos ligeiramente mais arredondados em alguns cards), mas sutil isoladamente.
- **Correção mínima:** trocar `rounded-[10px]` por `rounded-lg` nos dois arquivos citados.
- **Esforço:** 10 min.

### [P2-07] Modal reimplementa `rounded-2xl` em vez de herdar do `DragonModal`
- **Evidência:** `components/ui/DragonModal.tsx:161` usa `rounded-2xl`/`rounded-t-2xl`. Mas `app/gerente/compras/OcDetalheModal.tsx:144`, `OcFormModal.tsx:176` e `app/gerente/comissoes/ComissoesPageClient.tsx:194` reimplementam o mesmo valor de forma independente em vez de usar o componente compartilhado (esses três arquivos estão na árvore morta `app/gerente`, então o impacto real é zero hoje — listado por completude/dívida técnica).
- **Impacto:** baixo (código morto), mas indica que a consistência de raio em modais é coincidência, não garantia.
- **Correção mínima:** nenhuma ação necessária agora (código morto); se a árvore `gerente` for reativada ou removida, revisar então.
- **Esforço:** N/A agora.

---

## 3. Sombras

### [P1-08] Três sistemas de sombra rodando em paralelo, sem regra clara de quando usar cada um
- **Tela/Componente:** Cards e modais em geral — comparar `components/ui/card.tsx` vs. `styles/theme-fix-aggressive.css` vs. `app/caixa/CaixaPdvTopBar.tsx`.
- **Evidência:** (a) escala padrão Tailwind `shadow-sm/md/lg/xl` (usada 38+10+6+2 vezes) — ex. `components/ui/card.tsx:12` usa `shadow-sm`; (b) tokens customizados `--jl-elev-1`/`--jl-elev-2` definidos em `styles/theme-fix-aggressive.css:42-50,98-126` e consumidos via classes `.dragon-elev-1`/`.dragon-elev-2` em `styles/theme-oriental.css:651,685` — usados por modais do gerente (`OcDetalheModal.tsx:144`, `OcFormModal.tsx:176`) e pelos dropdowns do header (`GerenteHeaderNav.tsx:331,537`); (c) valores arbitrários pontuais como `shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]` em `app/caixa/CaixaPdvTopBar.tsx:72` (variante "classic" do PDV) e `shadow-[0_-1px_6px_rgba(0,0,0,0.05)]`/`shadow-[0_0_12px_rgba(251,191,36,0.25)]` (glow dourado, só no login).
- **Impacto:** cards, dropdowns e modais "equivalentes" (mesma função de elevação visual) têm profundidades de sombra visivelmente diferentes dependendo de qual tela os renderizou. Perceptível ao navegar entre Dashboard (Tailwind padrão) e um modal de compras/comissões (sistema `dragon-elev`).
- **Correção mínima:** não criar um quarto sistema — escolher UM dos dois sistemas ativos (Tailwind `shadow-*` é o mais usado, 56 ocorrências vs. as poucas em `dragon-elev`) como padrão para novos componentes, e não portar o resto agora (a maior parte do consumo de `dragon-elev` está em código morto de `app/gerente`).
- **Esforço:** decisão de padrão: 15 min de discussão de time; não requer troca de código imediata já que o maior consumidor está morto.

### [P2-09] `CaixaPageClient.tsx` usa raio (`rounded-[1.4rem]`) e sombra (`shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]`) que não aparecem em nenhum outro lugar do app
- **Evidência:** `app/caixa/CaixaPageClient.tsx:1128` — `"border-border bg-card text-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)] rounded-[1.4rem]"`.
- **Impacto:** o PDV, que é a tela mais usada operacionalmente, tem uma "personalidade" de sombra/raio única, não reaproveitável.
- **Correção mínima:** trocar por `shadow-md rounded-xl` (valores de escala padrão mais próximos) se não houver razão de negócio para o valor customizado.
- **Esforço:** 20 min (com teste visual rápido no PDV).

---

## 4. Espaçamento e Layout

### [P1-10] Quatro rotas ativas dentro do admin-v2 herdam padding/tipografia da árvore "gerente" morta, destoando das outras 12 páginas do mesmo módulo
- **Tela/Componente:** Estoque → Importar NF-e, Recebimento, Transferências; Catálogo → Novo Produto.
- **Evidência:** As 12 páginas "padrão" do admin (`dashboard`, `catalogo`, `estoque`, `financeiro`, `vendas`, `auditoria`, `comissoes`, `categorias-produtos`, `categorias-financeiras`, `configuracoes`, `relatorios`, `suspensao`) usam uniformemente `PageHeader` (`components/ui/admin-v2/PageHeader.tsx:17` → `text-2xl font-bold tracking-tight md:text-3xl`) dentro de um container `.admin-v2-page` (`styles/admin-v2.css:41-49` → `padding: 1rem 1rem 3rem` mobile, `2rem` desktop).
  Mas `app/admin/estoque/importar-nfe/page.tsx:3` renderiza `ImportarNfePageClient` (herdado de `app/gerente/estoque/importar-nfe/`), cujo título em `ImportarNfePageClient.tsx:107` é `text-xl font-semibold tracking-tight` (20px, não 24/30px) dentro de `mx-auto max-w-3xl px-4 py-6 sm:px-6` — um modelo de container totalmente diferente (largura máxima + padding horizontal fixo, em vez do padding full-width do admin-v2). O mesmo padrão se repete em `app/admin/estoque/transferencias/page.tsx` (via `TransferenciasGerentePageClient.tsx:190`, container `max-w-5xl`, título renderizado por `GerenteFilterBar` em vez de um `&lt;h1&gt;`) e em `app/admin/estoque/recebimento/page.tsx`. `app/admin/catalogo/novo/page.tsx` nem sequer tem cabeçalho de página — é um modal (`NovoProdutoModal`) sem `PageHeader`.
- **Impacto:** um usuário que vai de "Estoque" (padrão admin-v2) para "Importar NF-e" (dentro do mesmo menu Estoque) vê o título de página encolher e o conteúdo mudar de largura total para uma coluna centralizada estreita — parece ter saído do sistema. Este é provavelmente o problema mais perceptível de todo o admin vivo, porque acontece dentro do mesmo fluxo de trabalho (gestão de estoque).
- **Correção mínima:** trocar o `&lt;h1&gt;`/wrapper desses 3-4 arquivos para usar `PageHeader` + `.admin-v2-page`, mantendo o conteúdo interno intacto (não é redesign, é só realinhar o wrapper externo ao padrão já estabelecido nas outras 12 páginas do mesmo módulo).
- **Esforço:** 2–3h (4 arquivos, trocar wrapper e validar que os formulários internos não quebram).

### [P2-11] Login usa família de componentes 100% própria, sem relação com `components/ui/button.tsx`/`input.tsx`
- **Evidência:** `app/login/LoginForm.tsx:129-237` usa a família de classes `login-premium-*` (definida em `styles/theme-oriental.css:400-480`): input em formato "underline" sem borda lateral (`theme-oriental.css:421-445`, diferente do input em caixa do resto do app — `components/ui/input.tsx:13-14`), botão com `border-radius: 0.35rem` e fundo dourado (`theme-oriental.css:447-479`, não usa `buttonVariants` de `button.tsx`), label em `10px` maiúsculo espaçado (`theme-oriental.css:413-418`, não reutilizado em nenhuma outra tela), e H1 em fonte serifada (`login-premium-wordmark`, `theme-oriental.css:400-405`) que não guarda relação com o `PageHeader` do resto do app.
- **Impacto:** o login parece pertencer a outro produto — o que pode ser intencional (tela de entrada "premium"/de marca), mas não há nenhuma reutilização de primitivos, então qualquer ajuste de acessibilidade/estado (foco, erro, disabled) feito em `components/ui/input.tsx` não se propaga para o login.
- **Correção mínima:** nesta etapa, não redesenhar. Registrar como decisão consciente a validar com o time (é branding intencional ou drift?) antes de qualquer correção de código.
- **Esforço:** N/A (decisão de produto, não de código).

### [P2-12] Três larguas de container (`max-w-7xl`/`max-w-5xl`/`max-w-2xl`) e dois valores de padding vertical (`py-6`/`py-4`) sem constante compartilhada
- **Evidência:** (código morto de `app/gerente`, citado por padrão de dívida técnica que pode reaparecer se a árvore for reaproveitada) `ProdutosGerentePageClient.tsx:572` → `max-w-7xl ... py-6`; `SuspensaoPageClient.tsx:50` → `max-w-2xl ... py-6`; `ComissoesPageClient.tsx:141` → `max-w-5xl ... py-4`; `ImportarNfePageClient.tsx:190` → `max-w-5xl ... py-6`. Existe um componente compartilhado (`components/gerente/DataTablePage.tsx:30-51`) para filtros/ações, mas ele não define largura/padding do container — cada página declara o próprio wrapper.
- **Impacto:** baixo hoje (código morto), mas é o mesmo padrão de "cada página inventa seu próprio container" que já causou o problema P1-10 dentro do admin vivo — vale como alerta preventivo.
- **Correção mínima:** nenhuma ação imediata necessária.
- **Esforço:** N/A agora.

### [P3-13] `dashboard/page.tsx` usa `style={{ color: 'var(--color-dragon-gold-warm)' }}` inline em vez de classe utilitária
- **Evidência:** `app/admin/dashboard/page.tsx:525` — único uso de `style` inline para cor em todo o conjunto de páginas admin auditado (os demais usos de `style={{}}` encontrados são para geometria de gráfico, legítimos).
- **Impacto:** mínimo, mas quebra o padrão "cor sempre via classe" que o resto do dashboard segue.
- **Correção mínima:** trocar por uma classe Tailwind equivalente (`text-[var(--color-dragon-gold-warm)]` ou token dedicado).
- **Esforço:** 5 min.

---

## 5. Tipografia

### [P2-14] Rótulos de formulário com dois tamanhos diferentes entre "Novo Produto" e "Configurações"
- **Evidência:** `app/admin/configuracoes/_components/ConfiguracoesContent.tsx:482-489` (`FormField`) usa `&lt;span className="text-[11px] font-medium text-jl-fg-3"&gt;` para labels. `components/gerente/produtos/NovoProdutoModal.tsx:140,154,165,185,197,225,248` (renderizado dentro de `app/admin/catalogo/novo`, portanto ativo) usa `&lt;label className="block text-xs font-medium text-jl-fg-3"&gt;` — `text-xs` é 12px, contra os 11px de Configurações. Diferença pequena, mas ambos os formulários estão no mesmo módulo administrativo e podem ser usados em sequência (cadastrar produto → configurar loja).
- **Impacto:** perceptível apenas em comparação lado a lado; não bloqueia uso.
- **Correção mínima:** padronizar em `text-[11px]` (o mais usado no admin-v2) no `NovoProdutoModal`.
- **Esforço:** 10 min.

### [P1-15] Três tratamentos de título de página (H1) coexistindo no mesmo módulo Estoque
- **Evidência:** ver P1-10 — o padrão admin-v2 usa `text-2xl font-bold tracking-tight md:text-3xl` (12 páginas); as páginas herdadas do gerente usam `text-xl font-semibold tracking-tight` (Importar NF-e, Recebimento) ou nenhum H1 de página (Transferências, usa `GerenteFilterBar`, Novo Produto não tem H1 de página).
- **Impacto:** mesmo do P1-10 — listado aqui porque é especificamente um problema de hierarquia tipográfica, não só de padding.
- **Correção mínima:** mesma do P1-10 (ao ajustar o wrapper para `PageHeader`, a tipografia se resolve junto).
- **Esforço:** incluído no esforço do P1-10.

---

## 6. Componentes — duplicações e lacunas

### [P1-16] Não existem primitivos compartilhados de Select, Tabs, Alert, Dropdown e EmptyState
- **Evidência:** `components/ui/` tem `button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx`, `DataTable.tsx`, `DragonModal.tsx` — mas nenhum arquivo `select.tsx`, `tabs.tsx`, `alert.tsx`, `dropdown-menu.tsx` ou `empty-state.tsx`. Alertas de erro são recriados inline por tela (ex.: `app/admin/dashboard/page.tsx:83` — `"rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"`, duplicado com pequenas variações em outros pontos).
- **Impacto:** cada tela que precisa de um alerta, aba ou estado vazio reinventa o componente com classes ligeiramente diferentes — é a causa raiz de vários dos achados de "pequena variação" espalhados neste documento (badges, pills, alerts).
- **Correção mínima:** **não é para criar agora** (isso seria "implementar", fora do escopo desta auditoria) — mas vale registrar como o item de maior alavancagem para uma futura ação de consolidação: um `Alert`/`EmptyState`/`Select` compartilhado eliminaria de um só golpe boa parte dos achados P2 deste documento.
- **Esforço:** fora de escopo (implementação), mas o diagnóstico é: 1 componente compartilhado eliminaria ~6 pontos de duplicação hoje espalhados.

### [P0-17] Nenhuma tela usa o modal compartilhado (`DragonModal`) — cada modal do app vivo é uma implementação própria de overlay
- **Tela/Componente:** Auditoria (`AuditoriaTimeline.tsx`), Vendas (`VendaDetailSheet.tsx`), Estoque (`KardexSheet.tsx`, `AjusteSaldoModal.tsx`), Caixa (`CaixaConfirmModal.tsx`, `CaixaGerenteModal.tsx`, `CaixaMovimentacaoModal.tsx`, `CaixaReciboModal.tsx`, `CaixaValorNumericoModal.tsx`, `CaixaMotivoMinModal.tsx`).
- **Evidência:** `components/ui/DragonModal.tsx` é o único modal "de prateleira" no repo, mas seus 13 importadores são quase todos da árvore morta `app/gerente`. No app vivo, cada tela monta seu próprio overlay: `AuditoriaTimeline.tsx:190` → `"fixed inset-0 z-50 flex justify-end"`; `VendaDetailSheet.tsx:87` → mesmo padrão, próprio; `AjusteSaldoModal.tsx:94` → `"fixed inset-0 z-50 flex items-center justify-center p-4"`; `CaixaReciboModal.tsx:170` → `bg-black/60`, alinhamento diferente (`items-end sm:items-center`).
- **Impacto:** cada modal pode ter comportamento diferente de opacidade de fundo, alinhamento, e — mais grave do ponto de vista de usabilidade — não há garantia de que todos tratam `Esc`/foco/clique-fora da mesma forma, já que não compartilham implementação. Isso é uma quebra de expectativa de interação consistente, não só estética.
- **Correção mínima:** nesta etapa, apenas documentar — qualquer correção real (migrar todos para `DragonModal`) é uma refatoração de médio porte, fora do escopo de "não implementar" desta auditoria. Registrado como prioridade #1 para uma futura sprint de consolidação.
- **Esforço:** fora de escopo nesta etapa; estimativa para referência futura: 1–2 dias (9+ arquivos).

### [P1-18] Três sistemas de botão convivendo simultaneamente na área admin viva
- **Evidência:** (1) `components/ui/button.tsx` (shadcn/cva, `bg-primary`) — só 13 importadores no repo inteiro; (2) classes CSS diretas `admin-v2-btn-primary`/`admin-v2-btn-secondary` (`styles/admin-v2.css:234-270`), aplicadas a `&lt;button&gt;` cru em `app/admin/relatorios/_components/RelatoriosPeriodFilters.tsx:60` e `app/admin/configuracoes/_components/ConfiguracoesContent.tsx:326,400,472`; (3) botões totalmente ad hoc, ex. `app/admin/categorias-produtos/_components/CategoriasProdutosContent.tsx:129` → `"rounded px-2 py-1 text-[12px] text-jl-fg-2 transition-colors hover:bg-white/[0.04]"`, sem relação com nenhum dos dois sistemas anteriores.
- **Impacto:** botões com a mesma função (ação secundária, ação de filtro) têm alturas, raios e estados de hover diferentes dependendo de qual dos três sistemas o autor da tela escolheu.
- **Correção mínima:** não trocar tudo agora — mapear qual dos dois sistemas "de prateleira" (`Button` ou `admin-v2-btn-*`) deve ser o padrão daqui pra frente e parar de criar botões totalmente ad hoc em telas novas.
- **Esforço:** decisão de padrão (30 min); correção mecânica dos ad hoc restantes: ~3h.

### [P2-19] Dois sistemas de Toast com paletas diferentes — e o app vivo depende do componente com nome "Gerente"
- **Evidência:** `components/caixa/CaixaToastViewport.tsx:17-25` usa tokens semânticos (`border-success/45`, `bg-card/95`, `border-destructive/45`). `components/gerente/GerenteToastViewport.tsx:14-17` usa paleta Tailwind crua (`bg-blue-50 text-blue-950`, `bg-emerald-50 text-emerald-950`, `bg-red-50 text-red-950`). `app/admin/layout.tsx:7,54` monta o segundo (`GerenteToastViewport`) para toda a área admin viva. Não existe hook único (`toast()`/`useToast()`) — os dois viewports são mantidos de forma independente.
- **Impacto:** um toast de sucesso no PDV usa `--success` (verde do design system), o mesmo toast no admin usa `emerald-50`/`emerald-950` cru — tons de verde sutilmente diferentes para o mesmo significado, mais o risco de manutenção de ter dois componentes a atualizar toda vez que a regra de toast mudar.
- **Correção mínima:** nesta etapa, apenas registrar. Correção completa (unificar em um `Toaster`) é refatoração — fora de escopo agora.
- **Esforço:** fora de escopo nesta etapa; referência futura: ~4h.

### [P2-20] Tabelas: `DataTable` é o padrão dominante, mas 3 páginas vivas do admin usam `&lt;table&gt;` cru com paddings diferentes entre si
- **Evidência:** `components/ui/DataTable.tsx:98,106` (`rounded-lg border`, células `px-3 py-2.5`) é usado por Catálogo, Estoque, Vendas, Comissões, Categorias. Mas `app/admin/relatorios/_components/RelatoriosContent.tsx:151` usa `&lt;table className="w-full text-[12px]"&gt;` com `th` em `py-1.5 pr-3` (sem borda, sem padding horizontal); `app/admin/dashboard/page.tsx:556` usa `&lt;table className="... border-collapse text-sm"&gt;` com `th` em `px-3 py-2` (14px, com `border-collapse`); `app/admin/financeiro/_components/FinanceiroPanels.tsx:67` usa `&lt;table className="... border-collapse text-xs"&gt;` com `th` em `px-2 py-2` (12px). Três combinações diferentes de tamanho de fonte/padding/borda para a mesma ideia de "mini-tabela de estatísticas".
- **Impacto:** perceptível ao comparar a tabela de Relatórios com a do Dashboard — fontes e respiro diferentes para dados do mesmo tipo (numérico, tabular).
- **Correção mínima:** padronizar as três para usar o mesmo `text-xs`/`px-3 py-2`, ou migrá-las para `DataTable` se o volume de linhas justificar.
- **Esforço:** 1–2h (3 arquivos).

### [P2-21] Badges/pills de status com 3 tamanhos de fonte (10px/11px/12px) e paddings diferentes dentro do próprio admin vivo
- **Evidência:** `components/ui/badges.tsx` (`StatusBadge` etc.) é usado em `VendaDetailSheet.tsx:130`, `VendasTable.tsx:83,91`. Mas `app/admin/categorias-produtos/_components/CategoriasProdutosContent.tsx:114` monta pill inline em `text-[11px]` com `py-[2px]`; `app/admin/auditoria/_components/AuditoriaTimeline.tsx:143,201` monta pill inline em `text-[10px]` com `py-[1px]`. No caixa, `app/caixa/CaixaOperadorContextBar.tsx:24` usa uma classe própria (`app-chip`) em `text-[11px]`, e `app/caixa/CaixaCartList.tsx:362,365,368` usa tokens `jl-*` sem nenhuma diferenciação de cor por status (mesma cor neutra independente do significado).
- **Impacto:** um "chip" de status (ex. Ativo/Inativo, Pago/Pendente) muda de tamanho de fonte de tela para tela, e no carrinho do caixa perde completamente a codificação por cor que teria em outras telas.
- **Correção mínima:** trocar as pills inline de Categorias e Auditoria para usar `components/ui/badges.tsx` (`StatusBadge`) em vez de recriar a classe.
- **Esforço:** 1h (2-3 arquivos).

### [P2-22] Dois componentes de botão "canônicos" convivendo dentro da própria pasta `components/ui/`
- **Evidência:** `components/ui/button.tsx` (usado) vs. `components/ui/button-tokenized.tsx` (cva quase idêntico, com variante `accent`/tokens `bg-surface-primary`/`bg-danger-500`) — **zero importadores** em todo o repo, confirmando que é um experimento de tokenização abandonado dentro da pasta que deveria ser a fonte da verdade.
- **Impacto:** risco de confusão para o próximo desenvolvedor ("qual Button eu importo?"), sem impacto visual direto hoje (arquivo nunca usado).
- **Correção mínima:** remover `button-tokenized.tsx` (ou mover para uma pasta `experimental/` se ainda fizer sentido mantê-lo como referência).
- **Esforço:** 5 min.

### [P3-23] `badge.tsx` e `badges.tsx` no mesmo diretório — colisão de nome, não de função
- **Evidência:** `components/ui/badge.tsx` (shadcn genérico) e `components/ui/badges.tsx` (`StatusBadge`, `OriginBadge`, `PaymentBadge`, `FiscalBadge`, `DeltaChip`, `SeverityDot`, específicos do admin). Uso legítimo e não-redundante, mas o nome quase idêntico é uma armadilha de manutenção.
- **Impacto:** nenhum visual; risco de manutenção.
- **Correção mínima:** renomear `badges.tsx` para algo como `admin-badges.tsx` para deixar a distinção óbvia.
- **Esforço:** 15 min (rename + atualizar imports).

---

## 7. Caixa (PDV) — achados específicos

### [P2-24] PDV roda dois "temas" visuais paralelos por flag de ambiente (`classic` vs. `oriental`/`dragon`)
- **Evidência:** `app/caixa/CaixaPageClient.tsx:989-994` alterna entre `caixa-oriental-root` (`bg-jl-*`, `dragon-glass-card`) e um visual "classic" (`bg-background text-foreground`, `border border-border bg-card`) conforme `NEXT_PUBLIC_CAIXA_PDV_LAYOUT`. `CaixaPdvTopBar.tsx:68-76` reforça a bifurcação: a variante "classic" usa `bg-primary text-primary-foreground` com sombra arbitrária (`shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]`); a variante padrão usa `border-jl-border-1 bg-jl-surface-elev`.
- **Impacto:** por ser controlado por variável de ambiente (fixa por deploy, não alternável pelo usuário em runtime), o impacto direto ao usuário final é baixo — mas mantém dois designs de PDV vivos simultaneamente no código, dobrando a superfície de manutenção e o risco de um dos dois ficar desatualizado silenciosamente.
- **Correção mínima:** nesta etapa, apenas registrar e confirmar com o time se a variante "classic" ainda está em uso em algum ambiente real ou é resquício de uma migração já concluída.
- **Esforço:** N/A (decisão de produto).

### [P2-25] Vários componentes do caixa usam `&lt;button&gt;`/`&lt;input&gt;` crus ao lado de outros que já usam `components/ui/button`/`input`
- **Evidência:** `CaixaPdvOperadorTabs.tsx` — 4 `&lt;button&gt;` crus + 1 `&lt;input&gt;` cru, é o pior caso; `CaixaReciboModal.tsx` — 5 `&lt;button&gt;` crus; `CaixaFooter.tsx`, `CaixaPageClient.tsx`, `CaixaPdvMetodoPagamentoSelector.tsx`, `CaixaPdvOperacoesButtons.tsx`, `CaixaSearchBar.tsx`, `error.tsx` — 1-2 cada. Ao mesmo tempo, `CaixaCartList.tsx`, `CaixaSearchBar.tsx`, `CaixaGerenteModal.tsx`, `CaixaMovimentacaoModal.tsx`, `CaixaPdvTopBar.tsx`, `CaixaFooter.tsx`, `CaixaPdvCartSaleBar.tsx` **já importam** `components/ui/button`/`input` corretamente — mostrando que a inconsistência é por arquivo, não por decisão de arquitetura.
- **Impacto:** botões dentro da mesma tela do PDV podem ter altura/raio/estado de foco levemente diferentes dependendo de qual componente os renderizou.
- **Correção mínima:** trocar os `&lt;button&gt;` crus de `CaixaPdvOperadorTabs.tsx` (o pior caso) para `components/ui/button`.
- **Esforço:** 1h.

### [P3-26] Painel de debug do scanner usa cores hex inline, sem nenhuma relação com o design system
- **Evidência:** `app/caixa/scan-pipeline/CaixaScanPipelineDevPanel.tsx:34,54,59,66,72,76,77,79` — `style={{ color: '#94a3b8' }}` etc., sem Tailwind, sem tokens.
- **Impacto:** nenhum para usuário final (painel de desenvolvimento/telemetria, não voltado ao operador comum).
- **Correção mínima:** nenhuma ação necessária — é aceitável para uma ferramenta de debug interna, mas vale isolar visualmente (ex. borda tracejada "DEV ONLY") se ainda não houver.
- **Esforço:** opcional, 15 min.

### [P3-27] Import duplicado de `theme-oriental.css` em `CaixaPageClient.tsx`
- **Evidência:** `app/caixa/CaixaPageClient.tsx:73` reimporta `@/styles/theme-oriental.css`, já importado globalmente em `app/layout.tsx:5`. Next.js deduplica, então não há efeito visual — apenas ruído.
- **Impacto:** nenhum.
- **Correção mínima:** remover a linha.
- **Esforço:** 2 min.

---

## 8. Dark Mode

Achado geral: **o dark mode está, de fato, desativado na prática** — não há vazamento visual para o usuário final hoje. Mas a limpeza é incompleta no nível de configuração/atributos, o que é risco de regressão, não bug atual.

### [P2-28] Atributo `data-app-theme="noturno"` ainda setado em componente vivo, apesar de o "noturno" estar formalmente "aposentado"
- **Evidência:** `components/gerente/GerenteLayoutShell.tsx:47` seta `data-app-theme="noturno"` no shell (renderizado brevemente antes do redirect de `/gerente/*`, então baixo impacto real). `app/layout.tsx:44` seta `data-app-theme="classico"` no `&lt;html&gt;`. Dois atributos de tema diferentes coexistindo em elementos aninhados para o que deveria ser "um único tema". Isso só não quebra visualmente porque `styles/theme-oriental.css:28-29` e `styles/tokens/theme.css:8-10` sobrescreveram o seletor `[data-app-theme='noturno']` com os mesmos valores claros do "classico", em vez de remover o atributo.
- **Impacto:** nenhum visual hoje; risco de manutenção (parece dark mode "meio-desligado" em vez de removido).
- **Correção mínima:** remover o atributo `data-app-theme="noturno"` de `GerenteLayoutShell.tsx` (arquivo já em árvore morta — baixo risco).
- **Esforço:** 5 min.

### [P3-29] `styles/tokens/theme.css` ainda define um tema escuro completo e funcional, só acessível via Storybook
- **Evidência:** `styles/tokens/theme.css:73-103` — bloco `[data-gerente-ui-theme='dragon-dark']` com superfícies escuras reais (`rgba(2,6,23,0.35)` etc.), alternável em `.storybook/preview.ts:35,84,112-113`. `components/gerente/gerenteUiTheme.ts:3,5` já restringe o tipo TypeScript para aceitar só `'dragon-light'`, mas o CSS e o Storybook não foram limpos para condizer.
- **Impacto:** nenhum em produção; Storybook mostra uma capacidade (alternar tema escuro) que o produto real não tem — pode confundir quem usa o Storybook como referência de design.
- **Correção mínima:** nenhuma ação necessária nesta etapa (Storybook não é visto pelo usuário final); marcar como item de limpeza de baixa prioridade.
- **Esforço:** N/A agora.

---

## Índice de Consistência Visual: **58 / 100**

Metodologia da nota: partindo de 100, deduzido por categoria de acordo com severidade e abrangência dos achados (não é uma média simples de itens — pesa mais o que afeta telas vivas e de alto uso, como Estoque e Caixa):

| Categoria | Nota (0-10) | Justificativa resumida |
|---|---|---|
| Cores/Tokens | 5 | Fundação de tokens (`--primary`, `--destructive`, `--success`) existe e é bem desenhada, mas há um bug real de cascata (`--accent`) e uso extensivo de cores hardcoded ao lado dos tokens |
| Bordas/Radius | 7 | Majoritariamente consistente, poucos hardcodes pontuais |
| Sombras | 5 | Três sistemas paralelos sem regra de uso |
| Espaçamento/Layout | 5 | Base admin-v2 é sólida (12 páginas consistentes), mas 4 rotas vivas destoam claramente do padrão do próprio módulo |
| Tipografia | 6 | Hierarquia H1 quebrada nas mesmas 4 rotas; resto é consistente |
| Componentes (Botão/Modal/Tabela/Badge/Toast) | 5 | Modal e Toast praticamente não têm padrão único aplicado no app vivo; Botão tem 3 sistemas concorrentes |
| Caixa (PDV) | 6 | Coerente internamente, mas com bifurcação de tema por env var e vazamento de `&lt;button&gt;` cru |
| Dark Mode | 8 | Efetivamente desativado e sem vazamento real ao usuário; só sobra dívida de configuração |
| Higiene geral (código morto, duplicatas órfãs) | 5 | Árvore `gerente` morta, `button-tokenized.tsx` órfão, `chinese-theme.css` morto — não afeta o usuário, mas indica falta de "trilha de auditoria" contínua |

**Leitura geral:** o app tem uma base de design system real e bem-intencionada (tokens HSL, `admin-v2`, `DataTable`, `MetricCard`) — não é uma colcha de retalhos sem plano. O problema é que essa base **não foi aplicada nas bordas**: páginas herdadas de uma migração anterior (gerente → admin-v2), o Caixa e o Login vivem parcialmente fora dela.

---

## Lista dos 20 problemas mais importantes (ordenados por impacto real ao usuário)

1. **[P0-01]** `--accent` quebrado por conflito de cascata → hover de botões outline/ghost não aparece, app inteiro.
2. **[P0-17]** Nenhum modal do app vivo usa o componente compartilhado → comportamento de overlay potencialmente inconsistente (foco, esc, fundo).
3. **[P1-10]/[P1-15]** 4 rotas vivas de Estoque/Catálogo com padding e H1 diferentes do resto do admin-v2.
4. **[P1-18]** 3 sistemas de botão convivendo na área admin viva.
5. **[P1-03]** Vermelho/verde/azul com 2-3 tonalidades concorrentes para o mesmo significado.
6. **[P1-08]** 3 sistemas de sombra sem regra de uso.
7. **[P1-02]** `--border` funcionando por acidente de ordem de import (risco latente).
8. **[P1-16]** Faltam primitivos de Select/Tabs/Alert/Dropdown/EmptyState — causa raiz de várias duplicações menores.
9. **[P2-20]** 3 tabelas cruas com padding/fonte diferentes (Relatórios, Dashboard, Financeiro).
10. **[P2-21]** Badges/pills com 3 tamanhos de fonte diferentes no admin vivo.
11. **[P2-19]** Dois sistemas de toast com paletas diferentes; admin depende do componente "Gerente".
12. **[P2-24]** PDV com dois temas visuais paralelos por env var.
13. **[P2-25]** `CaixaPdvOperadorTabs.tsx` e outros com botões/inputs crus ao lado de componentes corretos.
14. **[P2-06]** `rounded-[10px]` hardcoded em StatCard/MetricCard vs. `rounded-lg` do Card canônico.
15. **[P2-09]** Sombra e raio únicos (`rounded-[1.4rem]`) só no PDV.
16. **[P2-11]** Login 100% fora do design system (decisão a validar, não bug).
17. **[P2-14]** Labels de formulário 11px vs 12px entre Configurações e Novo Produto.
18. **[P2-04]** Tokens documentados em `styles/tokens/*` nunca chegam à produção — Storybook diverge do app real.
19. **[P2-22]** `button-tokenized.tsx` órfão dentro da pasta canônica de componentes.
20. **[P2-28]** `data-app-theme="noturno"` ainda setado apesar do dark mode estar "aposentado".

---

## Ordem ideal de correção

1. **Corrigir os dois bugs de token de cascata** (`--accent`, `--border`) — item [P0-01]/[P1-02]. É a correção de menor esforço e maior alavancagem: 1-2 linhas resolvem um bug de usabilidade real que afeta o app inteiro.
2. **Realinhar as 4 rotas herdadas de Estoque/Catálogo ao padrão `PageHeader`/`.admin-v2-page`** — [P1-10]/[P1-15]. Maior ganho de percepção de "sistema único" por esforço razoável (2-3h).
3. **Padronizar cores semânticas hardcoded** (vermelho/verde/azul) nos arquivos vivos — [P1-03]. Mecânico, baixo risco.
4. **Decidir e aplicar um padrão único de botão** para novas telas — [P1-18]. Não precisa migrar tudo de uma vez, mas define a régua.
5. **Padronizar as 3 tabelas cruas e as pills de badge no admin vivo** — [P2-20]/[P2-21].
6. **Resolver a duplicação de Toast** — [P2-19]. Requer mais teste por tocar em feedback ao usuário em toda a aplicação.
7. **Consolidar modais no `DragonModal`** — [P0-17]. Maior esforço da lista (9+ arquivos), mas maior ganho de consistência de interação; planejar como projeto à parte, não “correção rápida”.
8. **Limpeza de dívida técnica sem impacto visual** (código órfão, atributos de tema mortos, imports duplicados) — pode ser feita a qualquer momento, sem urgência.

---

## Quick Wins (< 30 minutos cada)

- [P0-01] Corrigir formato de `--accent` (1 linha).
- [P1-02] Corrigir formato de `--border` (1 linha).
- [P2-06] Trocar `rounded-[10px]` → `rounded-lg` em `StatCard.tsx`/`MetricCard.tsx`.
- [P3-13] Trocar `style={{color: ...}}` inline por classe em `dashboard/page.tsx:525`.
- [P2-22] Remover `button-tokenized.tsx` órfão.
- [P3-23] Renomear `badges.tsx` para reduzir confusão com `badge.tsx`.
- [P2-28] Remover `data-app-theme="noturno"` de `GerenteLayoutShell.tsx`.
- [P3-27] Remover import duplicado de `theme-oriental.css` em `CaixaPageClient.tsx`.
- [P3-05] Marcar/remover `styles/chinese-theme.css` (código morto).
- [P2-14] Alinhar tamanho de label entre `NovoProdutoModal` (12px→11px) e Configurações.

## Correções que podem esperar

- Consolidação de modais em `DragonModal` (projeto de médio porte, não "correção").
- Unificação do sistema de Toast (mexe em feedback global, requer QA cuidadoso).
- Criação de primitivos faltantes (Select/Tabs/Alert/Dropdown/EmptyState) — é implementação nova, fora do escopo desta auditoria por definição, mas é o investimento que mais reduziria drift futuro.
- Decisão sobre manter/remover a variante "classic" do PDV.
- Decisão sobre alinhar (ou assumir como intencional) o visual "premium" do Login.
- Limpeza de toda a árvore morta `app/gerente/*` (é dívida técnica de manutenção, não um problema visual — mas simplificaria muito futuras auditorias como esta).
- Migração real do sistema de tokens do Storybook (`styles/tokens/*`) para produção, ou descontinuação formal do Storybook como referência.

---

## Veredito Final

**A interface não é hoje um ERP visualmente único — é um sistema novo (admin-v2) bem desenhado, com remendos visíveis nas costuras onde uma migração anterior (gerente → admin) não terminou de ser absorvida.**

A maior parte do produto — 12 das 16 páginas do admin, o Dashboard, o Caixa internamente — segue uma linguagem visual coerente e claramente planejada (tokens HSL, componentes `admin-v2-*`, `DataTable`, `MetricCard`). Isso não é o retrato de um sistema "grudado com fita adesiva" na maior parte da superfície.

Mas exatamente nos pontos onde o usuário cruza de um fluxo "novo" para um herdado — Estoque → Importar NF-e/Recebimento/Transferências, Catálogo → Novo Produto — a experiência muda de largura de container, tamanho de título e vocabulário de classes CSS de forma perceptível dentro da mesma tarefa. Some a isso um bug real de cascata CSS que apaga o hover de botões outline/ghost em todo o app, três sistemas de botão e de sombra coexistindo, e nenhum modal do app vivo realmente usando o único modal "de prateleira" disponível — e o veredito é: **parece um sistema único que ainda carrega, sem terminar de digerir, pedaços de uma versão anterior de si mesmo.**

A boa notícia para a correção: os tokens e componentes certos já existem na maioria dos casos (não faltam decisões de design, faltam substituições mecânicas). O trabalho descrito na "Ordem ideal de correção" acima é majoritariamente aplicar o padrão que já existe, não inventar um novo.
