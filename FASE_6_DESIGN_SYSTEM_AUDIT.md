# FASE 6 — Design System: Auditoria e Plano de Consolidação

**Data:** 2026-07-17
**Escopo:** `pdv-importados` (Next.js — Admin, Gerente legado, Caixa/PDV, Login) + fronteira com `pdv-local` (Tauri)
**Método:** leitura estática do repositório — nenhum código foi alterado nesta fase.

---

## 1. Diagnóstico atual

### 1.1 Mapa da arquitetura visual (o que existe hoje)

O CSS global carrega nesta ordem (`app/layout.tsx` → `app/globals.css`):

```
app/globals.css
 ├─ @import styles/tokens/index.css
 │   ├─ tokens/base.css          (primitivos Dragon: --color-dragon-*, --space-*, --font-size-*, --radius-*, --shadow-*, --z-*)
 │   ├─ tokens/component.css     (tokens de componente --btn-*, --card-*, --modal-*, --table-*, --caixa-*)
 │   └─ tokens/theme.css         (semânticos --color-* + --fp-* + bloco dragon-dark do gerente)
 ├─ @import styles/theme-fix-aggressive.css   (tokens --jl-* + badges .jl-status-* + .jl-modal-field)
 ├─ @import styles/unstick-gerente.css        (fixes de z-index/overflow)
 ├─ tokens shadcn em :root (--primary, --muted, --ring… HSL sem hsl())
 └─ app/layout.tsx também importa styles/theme-oriental.css
     (1.355 linhas: --surface/--accent/--border + classes .app-*, .login-premium-*,
      .gerente-*, .dragon-*, dragon-light/dragon-dark, touch targets mobile)
```

Fora do fluxo global:

- `styles/admin-v2.css` — tokens `--admin-v2-*` escopados em `[data-admin-v2]` (importado por `AdminV2Shell` e `app/demo-fluxo`).
- `styles/chinese-theme.css` — **nunca importado em lugar nenhum** (morto).
- `styles/tokens/semantic.css` — deprecated na Fase 1, fora do import chain, **mas ainda no disco**.
- `styles/tokens/migration-guide.css` — guia em formato CSS, não importado.
- `tailwind.config.js` — mapeia cores shadcn (`hsl(var(--primary))`…) **e** a família `jl-*` (`var(--jl-*)`), mistura de formatos HSL-sem-wrapper e hex.

### 1.2 Existe uma única fonte de verdade visual?

**Não. Existem hoje 8 vocabulários de token coexistindo:**

| # | Prefixo/Sistema | Onde vive | Estado |
|---|---|---|---|
| 1 | shadcn (`--primary`, `--muted`, `--ring`…) | `app/globals.css` | Vivo — consumido via Tailwind (`bg-primary`, `bg-card`…) |
| 2 | `--surface` / `--accent` / `--border` | `theme-oriental.css` | Vivo — declarado "contrato canônico" em `theme.config.ts` |
| 3 | `--jl-*` (Jin Long) | `theme-fix-aggressive.css` | Vivo — camada de fato mais usada (DataTable, caixa, admin) |
| 4 | `--color-*` semântico + `--fp-*` | `tokens/theme.css` | Vivo — badges/charts/admin-v2 |
| 5 | `--admin-v2-*` | `admin-v2.css` | Vivo — escopo `[data-admin-v2]` |
| 6 | `--color-dragon-*` primitivos | `tokens/base.css` | Parcialmente vivo (login, semantic morto) |
| 7 | `--btn-*`, `--card-*`, `--modal-*`, `--table-*`, `--caixa-*` | `tokens/component.css` | **Morto e quebrado** (ver 1.3) |
| 8 | `--imperial-red`, `--jade`, `--paper`… | `chinese-theme.css` | **Morto** (arquivo nunca importado) |

Além disso há **três formatos de cor** para o mesmo papel: `--primary: 221 83% 53%` (HSL cru), `--accent: #2563eb` (hex, propositalmente, com comentário justificando), `--color-brand-primary: #2563eb` (hex). O azul Bling `#2563eb` está declarado de forma independente em **pelo menos 4 arquivos** (`globals.css`, `theme-oriental.css`, `theme-fix-aggressive.css`, `tokens/theme.css`). Mudar a cor da marca hoje exige editar 4+ arquivos coordenadamente.

### 1.3 Achado crítico: `tokens/component.css` está morto E quebrado

- **Zero consumidores**: nenhum `.tsx`/`.css` fora da pasta `tokens/` referencia `var(--btn-*)`, `var(--card-*)`, `var(--modal-*)`, `var(--table-*)`, `var(--input-*)` ou `var(--caixa-*)`.
- **~30 referências a tokens indefinidos**: ele consome `--font-size-button`, `--radius-card`, `--space-component-*`, `--shadow-modal`, `--transition-input` etc., que só existiam em `semantic.css` — removido do import chain na Fase 1. Se alguém "reativar" esses tokens, receberá valores inválidos.
- Conclusão: a camada de component tokens que deveria ser o coração do Design System é hoje 201 linhas de peso morto que **simula** uma arquitetura que não opera.

### 1.4 Onde existem conflitos entre Dragon e Clássico?

A Fase 0 ("Layout Compiler") travou o app em tema claro único ("cara de Bling") e o ESLint bloqueia `dark:` e fundos escuros. Porém o aposentado não foi removido:

1. **`tokens/theme.css` ainda embarca o bloco `[data-gerente-ui-theme='dragon-dark']`** (superfícies rgba escuras, ouro como brand).
2. **`theme-oriental.css` mantém ~250 linhas de seletores `dragon-dark`/`dragon-light` pareados** (`.gerente-fin-input`, `.gerente-table-dragon`, `.gerente-nav-back`… cada um em duas versões).
3. **`app/caixa/CaixaPageClient.tsx` tem 17 ternários `pdvLayoutVariant === "classic" ? … : …`** — duas árvores de estilo condicionais dentro do mesmo componente, com o ramo não-classic apontando para `dragon-glass-card` (glassmorphism aposentado pela VISUAL_PHILOSOPHY).
4. **Resíduo cromático dark em superfícies claras**: 63× `text-amber-400`, 29× `text-red-400`, 26× `text-red-300`, 23× `text-emerald-400`, 16× `text-amber-300` — cores desenhadas para texto claro sobre fundo escuro, espalhadas por `components/gerente/**` e `app/gerente/**` que hoje renderizam sobre fundo branco (contraste WCAG comprometido: amber-400 sobre branco ≈ 1.7:1).
5. **Conflito doutrinário nos docs**: `VISUAL_PHILOSOPHY.md` define `amber` como acento primário; a Fase 0 define azul Bling `#2563eb`. Os dois documentos estão vigentes simultaneamente.
6. **Login é exceção intencional** (dark premium, ouro `--color-dragon-gold-luxury`) — legítimo, mas hoje implementado com `!important` sobre `html`/`body` e tokens duplicados entre `base.css` e `theme-oriental.css` (com comentário admitindo a duplicação).

### 1.5 O sistema atual escala para 50+ telas?

**Não no estado atual.** Evidências:

- São hoje **34 `page.tsx`** e **239 arquivos TSX** de UI. Cada nova tela precisa decidir entre 8 vocabulários de token e 3–4 implementações de cada componente básico — o custo de decisão cresce linearmente e a divergência também.
- **417+ ocorrências de tipografia arbitrária** (`text-[11px]` 189×, `text-[10px]` 129×, `text-[12px]` 99×) — não existe escala tipográfica utilizável no Tailwind config (o `fontSize` não foi estendido; os `--font-size-*` de `base.css` não são consumidos).
- `/gerente` foi aposentado como rota (redirects para `/admin`) mas `app/gerente/**` continua sendo a casa dos componentes de feature consumidos pelo `/admin` — a fronteira física não reflete a arquitetura real.
- Storybook: dependências e scripts existem, mas há só 3 stories, e o `preview.ts` documenta 4 temas que não existem mais (Noturno, Novem, Dragon Light/Dark). Governança visual efetivamente abandonada.

---

## 2. Inventário de componentes

Classificação: **A** = oficial · **B** = duplicado · **C** = legado · **D** = candidato a remoção

### Buttons

| Implementação | Uso | Classe |
|---|---|---|
| `components/ui/button.tsx` (shadcn/CVA, 6 variantes) | 32 arquivos | **A** — candidata a oficial |
| Classes CSS `.app-btn-accent/-neutral/-danger` (`theme-oriental.css`) | 48 arquivos | **B** — sistema paralelo mais usado que o oficial |
| `components/ui/button-tokenized.tsx` | 0 imports; usa classes Tailwind inexistentes (`bg-surface-primary`, `bg-danger-500`) | **D** — morto e quebrado |
| `.login-premium-submit`, `.gerente-btn-csv`, `.gerente-chip-action` | login/gerente | **C** — legado escopado |
| `components/forms/PendingSubmitButton`, `ConfirmActionButton` (gerente e caixa têm versões próprias) | pontual | **B** — consolidar sobre o Button oficial |

### Inputs

| Implementação | Classe |
|---|---|
| `components/ui/input.tsx` (shadcn) — 8 usos | **A** |
| `.app-input` (`theme-oriental.css`) — dominante no caixa | **B** |
| `.jl-modal-field` (`theme-fix-aggressive.css`) | **B** |
| `.gerente-fin-input` (versões dragon-dark E dragon-light) | **C** |
| `.login-premium-input` | **C** (exceção login) |
| `components/forms/FormField.tsx` — 2 usos | **A** (embrião de pattern de form) |

### Selects

- **Não existe componente Select.** 26 arquivos usam `<select>` nativo estilizado por `.app-select`, `.jl-modal-select` ou classes ad hoc. | **B/C** — lacuna estrutural (filtros complexos de ERP pedem combobox com busca).

### Modals

| Implementação | Classe |
|---|---|
| `components/ui/DragonModal.tsx` — 14 usos; focus trap, Escape, scroll lock, variante `sheet`, docstring "único caminho aceito p/ dialog" | **A** |
| Modais artesanais do caixa (`CaixaConfirmModal`, `CaixaGerenteModal`, `CaixaMotivoMinModal`, `CaixaValorNumericoModal`… ~8 arquivos com `role="dialog"` próprio) | **B** — violam o contrato do DragonModal |
| `.dragon-glass-backdrop` / `.dragon-elev-2` | **C** — estética glass aposentada, ainda no caminho do DragonModal |

### Sheets / Drawers

- `DragonModal sheet` (bottom-sheet mobile) — **A**
- `VendaDetailSheet`, `KardexSheet`, `DocumentoFiscalDetailSheet`, `CaixaHistoricoSheet` — implementações independentes por tela | **B** — extrair pattern `DetailSheet`
- `GerenteMobileNavDrawer`, `ActivityRailDrawer` | **A** (navegação específica)

### Tables

| Implementação | Uso | Classe |
|---|---|---|
| `components/ui/DataTable.tsx` (sort local/server, a11y aria-sort, empty state) | 7 | **A** — candidata a oficial |
| `components/gerente/GerenteTable.tsx` (column priority, skeleton, tone `paper/dragon`) | 21 | **B** — mais usada que a oficial; recursos que a DataTable não tem |
| `.gerente-table-dragon`, `.gerente-inicio-table`, `.gerente-fin-*` (CSS por tema) | — | **C** |
| `.admin-table` (chinese-theme) | 0 | **D** — morto |

### Cards (KPI/Metric)

| Implementação | Uso | Classe |
|---|---|---|
| `components/ui/admin-v2/MetricCard.tsx` (+ sparkline canvas) | ativo (admin-v2: 24 arquivos) | **A** |
| `components/ui/MetricCard.tsx` | 0 imports fora de teste | **D** |
| `components/gerente/MetricCard.tsx` (tiers 1/2/3 + DeltaChip próprio) | 0 imports fora de teste | **D** |
| `components/ui/StatCard.tsx` | 0 imports | **D** |
| `components/ui/card.tsx` (shadcn) | 8 | **A** (container genérico) |
| `admin-v2/SectionCard`, `ChartCard` | ativos | **A** |
| `.card-chinese` | 0 | **D** |

### Forms

- `FormField.tsx` + `PendingSubmitButton` — embrião correto | **A**
- Padrão dominante: formulários artesanais por modal (produtos, clientes, fornecedores) com labels/erros próprios | **B** — sem padrão de validação visual, mensagens de erro e obrigatoriedade

### Toasts

- `GerenteToastViewport` (event-bus `lib/gerente/toast`) | **B**
- `CaixaToastViewport` | **B**
- Dois viewports, dois barramentos, estilos próprios em cada um. Nenhum é "o oficial" | consolidar em 1 — **A a criar**

### Dropdowns

- Apenas `GerenteHeaderNav` tem dropdown próprio; não existe primitivo `DropdownMenu`/`Popover` (Radix disponível no projeto: só `react-slot` e `react-tooltip`) | lacuna — **A a criar**

### Navigation

- `AdminV2Shell` + `SidebarNav` + `AdminV2UtilityBar` | **A** (shell oficial do admin)
- `GerenteLayoutShell` + `GerenteHeaderNav` + `GerenteNavLink` + `GerenteStickyToolbar` | **C** — shell do gerente aposentado como rota, mas ainda montado por `app/gerente/layout.tsx`
- `CaixaPdvTopBar` + tabs | **A** (PDV)

### Empty states

- `DataTable.emptyState` (prop com default) | **A**
- ~9 telas com empty states inline próprios (`VendasTable`, `EstoqueTable`, `CatalogoTable`…), `.gerente-fin-empty` em dois temas | **B** — extrair `EmptyState` com ícone/título/ação

### Loading states

- `components/ui/skeleton.tsx` + `CaixaSkeletonRow/Card/Header` | **A/B** |
- `DataTableSkeleton` (gerente) + `GerenteTable loading` + `.jl-shimmer` | **B** |
- `GerenteRouteLoading`, `GerenteTopProgress`, `app/admin/loading.tsx`, `.gerente-loader-sweep`, `.dragon-orbit-wrap` (loader decorativo com dragão em órbita — viola a regra de motion da VISUAL_PHILOSOPHY) | **C/D** |

### Error states

- `app/error.tsx`, `app/global-error.tsx`, `.error-banner-chinese` (morto) | rota: **A**; chinese: **D**
- `CaixaMessageBanner` (status/erro do caixa) | **A** local
- **Lacuna**: componentes de formulário não têm contrato de estado de erro (`aria-invalid`, mensagem, cor) — cada modal resolve à sua maneira.

---

## 3. Auditoria de consistência

Números levantados por varredura (`app/` + `components/`, excluindo testes):

| Problema | Medida |
|---|---|
| Hex hardcoded em TSX | 41 ocorrências em 14 arquivos (`#bfa76a` 8×, `#c42e2e` 3×, `#1890ff` 3×…) |
| Tipografia arbitrária | 417+ (`text-[11px]` 189×, `text-[10px]` 129×, `text-[12px]` 99×) — nenhuma consome a escala de `base.css` |
| Spacing/size arbitrários | dezenas de `-[2px]`…`-[240px]` fora da escala |
| Paleta Tailwind crua (fora de token) | `bg-white` 107×, `amber-*` 140+×, `red-*` 90+×, `emerald-*` 60+× |
| `style={{…}}` inline | 55 ocorrências (inclui `GerenteFilterBar` com layout inteiro inline) |
| Cores dark sobre fundo claro | `text-amber-400/300/200`, `text-red-300`, `text-emerald-300` — contraste abaixo de WCAG AA em fundo branco |
| Base font | `body` 15px definido em `globals.css`, mas maioria das telas força 10–12px arbitrários |

**Estados e acessibilidade:**

- Foco: bem resolvido globalmente (`theme-oriental.css` tem anel de foco global com exclusões coordenadas) — porém a regra é um seletor com 6 `:not()` encadeados, frágil a cada classe nova de botão.
- Hover: tabelas e botões oficiais têm; `<select>` nativos e vários chips não.
- Disabled: coberto em `.app-*`, `.jl-modal-*`; inconsistente nos modais artesanais.
- Loading: `GerenteTable` e caixa têm skeletons; `DataTable` (a oficial do admin) **não tem prop de loading** — telas admin resolvem por fora.
- Erro em campo: sem contrato; `aria-invalid` não é usado sistematicamente.
- Touch targets: 44px garantidos via `!important` em media query para `.app-btn-*` — correto no efeito, sintoma no método (o tamanho deveria nascer do componente, não de um patch global).
- ARIA: há investimento real (FASE 3): `aria-sort`, `sr-only`, skip-link, focus trap no DragonModal — acima da média.

---

## 4. Auditoria ERP (referência: Bling, Omie, TOTVS, Shopify Admin)

| Capacidade | Estado | Veredito |
|---|---|---|
| **Tabelas grandes** | `DataTable`/`GerenteTable` sem paginação integrada, sem virtualização, sem sticky header, sem seleção em lote, sem redimensionamento/ocultação de colunas, sem density toggle | ❌ Não suporta. Paginação hoje é responsabilidade de cada tela |
| **Filtros complexos** | `FilterBar` (URL-driven: pills/select/search) é a semente certa; falta date-range, multi-select, filtros salvos, contagem de filtros ativos | ⚠️ Parcial |
| **Dashboards** | `MetricCard` admin-v2 + `ChartCard` + 3 stacks de gráfico (Chart.js, Recharts, canvas puro) com temas tokenizados (`lib/tokens/chartColors`) | ⚠️ Funciona, mas 3 bibliotecas de gráfico é passivo de manutenção |
| **PDV touch** | Caixa tem atalhos de teclado, touch targets 44px, layout `100dvh`; mas o dualismo classic/dragon (17 ternários) torna qualquer evolução do PDV duas vezes mais cara | ⚠️ Parcial |
| **Telas operacionais rápidas** | Densidade boa (14px base no caixa, tabelas compactas); porém obtida via valores arbitrários, não via modo "compact" sistematizado | ⚠️ Parcial |
| **Usuários administrativos** | AdminV2Shell é sólido (sidebar, badges de alerta, utility bar); i18n PT/ZH real (`Noto Sans SC`, `.chinese-text`) — diferencial legítimo | ✅ Suporta |
| **PDV e Admin compartilham fundação?** | Compartilham `--jl-*` e shadcn parcialmente; `pdv-local` (Tauri) não compartilha **nenhuma** camada visual (não tem CSS próprio do design system) | ❌ Fundação comum incompleta |

**Conclusão ERP:** o sistema tem os órgãos certos (shell admin, tabela acessível, filter bar URL-driven, tokens semânticos) mas não o esqueleto: falta a camada de *patterns* (ListPage = FilterBar + DataTable + paginação + empty/loading/error como um contrato único) que é o que Bling/Shopify Admin têm e que faz 50 telas custarem o preço de 5.

---

## 5. Arquitetura alvo

### 5.1 Estrutura proposta (dentro de `pdv-importados/`)

```
src/ui/
 ├─ tokens/
 │   ├─ primitives.css      # escalas cruas: cor, espaço, tipo, radius, sombra, z, motion
 │   ├─ semantic.css        # papel: --surface-*, --text-*, --border-*, --brand-*, --status-*
 │   ├─ themes/
 │   │   ├─ light.css       # ÚNICO tema do app (contrato Fase 0)
 │   │   └─ login.css       # exceção cerimonial escopada em [data-theme='login']
 │   └─ index.css           # única porta de entrada; ordem garantida
 ├─ primitives/             # 1 elemento, 0 domínio, todos os estados
 │   Button, Input, Select, Checkbox, Badge, Skeleton, Spinner, Tooltip,
 │   Dialog (ex-DragonModal), Sheet, DropdownMenu, Toast
 ├─ components/             # composições genéricas
 │   DataTable, FilterBar, MetricCard, SectionCard, ChartCard,
 │   EmptyState, ErrorState, FormField, Pagination
 ├─ patterns/               # contratos de tela ERP
 │   ListPage (FilterBar+DataTable+Pagination+estados),
 │   DetailSheet, FormModal, DashboardGrid
 └─ layouts/
     AdminShell (ex-AdminV2Shell), PdvShell (ex-caixa chrome), AuthLayout (login)
```

Regra de dependência (importável, lint-enforced): `tokens ← primitives ← components ← patterns ← layouts ← app/`. Nunca o inverso; `app/` não importa `primitives` de estilo cru quando existir `component/pattern`.

### 5.2 Decisões de token (a fonte única)

1. **`semantic.css` novo é a única interface pública.** Telas e componentes só consomem tokens semânticos (`--surface-raised`, `--text-muted`, `--status-danger-bg`…). Primitivos são internos aos tokens.
2. **Um formato só**: hex/oklch direto em CSS vars, mapeados no Tailwind sem wrapper `hsl()` (elimina o bug latente do formato duplo atual). Todos os aliases atuais (`--jl-*`, `--fp-*`, `--admin-v2-*`, shadcn) viram **aliases de compatibilidade apontando para os semânticos** durante a migração, e morrem em P2/P3.
3. **Tailwind estendido com a escala tipográfica e de espaçamento do sistema** (`text-caption` = 11px, `text-body` = 13–14px etc.) para aposentar `text-[11px]` com um search-and-replace mecânico.
4. **Tema é build-time**: continua único e claro. `login` é o único escopo alternativo, isolado por seletor de layout — sem `!important` em `html/body`.

### 5.3 Obrigatório / Proibido / Contribuição

**Obrigatório**
- Todo componente novo nasce em `src/ui/*` com: estados default/hover/focus-visible/disabled/loading/error, `aria-*` correto, touch target ≥ 44px em superfícies POS, story no Storybook.
- Toda cor/tamanho vem de token semântico ou da escala Tailwind estendida.
- Toda tabela de listagem nova usa o pattern `ListPage`.
- Todo diálogo usa `Dialog`/`Sheet` oficiais (o contrato que o DragonModal já declara e o caixa viola).

**Proibido (bloqueado por lint/CI, não por convenção)**
- Hex/rgb/hsl literais em TSX e em CSS fora de `src/ui/tokens/`.
- `text-[Npx]`, `dark:` (já bloqueado), fundos escuros fora do escopo login (já bloqueado), `style={{}}` para cor/spacing.
- Criar variação local de Button/Badge/Table/Toast/Modal ("component fork") — PR deve estender o oficial.
- Novos prefixos de token.

**Regras de contribuição**
- `src/ui/` tem CODEOWNERS (dono nomeado por categoria crítica: Button/Input/Dialog, DataTable/FilterBar, Tokens, Shells).
- Mudança em `tokens/` ou `primitives/` exige revisão do dono + screenshot/story atualizado.
- Guard scripts (o repo já tem cultura de `guard:*` no CI): adicionar `guard:design` — (a) nenhum hex fora de tokens, (b) nenhum import de componente marcado deprecated, (c) `component.css`/arquivos mortos não retornam.

---

## 6. Roadmap de migração (sem reescrever tudo)

### P0 — Bloqueadores arquiteturais (destravam tudo; ~sem mudança visual)

| # | Ação | Evidência |
|---|---|---|
| P0.1 | **Deletar código morto**: `tokens/component.css` (0 consumidores, 30 refs quebradas), `tokens/semantic.css`, `tokens/migration-guide.css`, `chinese-theme.css` (+ `.admin-table`/`.card-chinese`), `button-tokenized.tsx`, `ui/MetricCard.tsx`, `gerente/MetricCard.tsx`, `StatCard.tsx` (0 imports) | §1.3, §2 |
| P0.2 | **Unificar o azul da marca em um token**: `--brand` definido uma vez; `globals.css`, `theme-oriental.css`, `theme-fix-aggressive.css`, `tokens/theme.css` passam a referenciá-lo | §1.2 |
| P0.3 | **Criar `src/ui/tokens/` (primitives+semantic) e apontar os aliases atuais** (`--jl-*`, `--fp-*`, `--admin-v2-*`, shadcn, `--surface/--accent/--border`) para os semânticos — nenhuma tela muda de cara | §5.2 |
| P0.4 | **Estender Tailwind com escala tipográfica/spacing** e ativar lint contra `text-[Npx]` em código novo | §3 |
| P0.5 | **Remover o dualismo dragon do runtime**: excluir bloco `dragon-dark` de `tokens/theme.css`, seletores `dragon-dark/dragon-light` de `theme-oriental.css`, e os 17 ternários `pdvLayoutVariant` do `CaixaPageClient` (fixar o layout vencedor) | §1.4 |
| P0.6 | **Adicionar `guard:design` ao CI** (hex, deprecated imports, arquivos mortos) | §5.3 |

### P1 — Componentes críticos (fundação ERP)

| # | Ação |
|---|---|
| P1.1 | **Button único**: migrar os 48 arquivos de `.app-btn-*` para `ui/button.tsx` (variantes `accent/neutral/danger` mapeadas 1:1; touch target nativo do componente, sem `!important`) |
| P1.2 | **Dialog único**: portar os ~8 modais artesanais do caixa para `DragonModal`→`Dialog`; aposentar `.dragon-glass-*` |
| P1.3 | **Tabela única**: fundir `GerenteTable` (column priority, skeleton, compact) em `DataTable` + adicionar paginação, sticky header, seleção em lote e prop `loading` — nasce o pattern `ListPage` |
| P1.4 | **Select/Combobox e DropdownMenu** primitivos (hoje 26 telas com `<select>` nativo) |
| P1.5 | **Toast único**: um viewport, um barramento (funde Gerente/Caixa viewports) |
| P1.6 | **FormField com contrato de erro** (`aria-invalid`, mensagem, obrigatório) adotado nos modais de cadastro |
| P1.7 | **EmptyState e ErrorState oficiais** substituindo os ~9 inline |

### P2 — Melhorias

- Corrigir o resíduo cromático dark (amber-400/red-300/emerald-300 sobre branco) → tokens `--status-*` com contraste AA garantido.
- Migrar tipografia arbitrária existente (417 ocorrências) para a escala — mecânico após P0.4.
- Reduzir `theme-oriental.css` ao escopo login + utilitários realmente globais; renomear `theme-fix-aggressive.css` para o que ele é (camada de tokens) ou absorvê-lo em `src/ui/tokens/`.
- Consolidar bibliotecas de gráfico (meta: Recharts + canvas sparkline; aposentar Chart.js) sobre `lib/tokens/chartColors`.
- Mover `app/gerente/**` (componentes de feature usados pelo `/admin`) para fronteira coerente; aposentar `GerenteLayoutShell` se a rota não voltar.
- Density toggle e colunas configuráveis na DataTable.

### P3 — Nice-to-have

- Reativar Storybook como catálogo vivo (limpar os 4 temas fantasmas do preview; story obrigatória para `src/ui/*`).
- Testes de regressão visual (Playwright screenshots) nas telas âncora: dashboard, listagem de vendas, caixa, login.
- Compartilhar `src/ui/tokens/` com `pdv-local` (Tauri) via `shared-core` ou pacote `@fastproduct/ui-tokens`, para PDV desktop e web convergirem.
- Documentar o Design System consolidado substituindo `README_DESIGN_SYSTEM.md`/`DESIGN_TOKENS_MIGRATION_STATUS.md` (hoje desatualizados) e reconciliar `VISUAL_PHILOSOPHY.md` com a paleta Bling (resolver amber vs azul por escrito).

---

## 7. Riscos

| Risco | Grau | Mitigação |
|---|---|---|
| Regressão visual no caixa ao remover o dualismo classic/dragon (P0.5) — é a tela de faturamento | Alto | Screenshots antes/depois por variante; feature flag de rollback por 1 release; e2e crítico já existe (`test:e2e:critical`) |
| Migração dos 48 arquivos `.app-btn-*` alterar comportamento (hover/focus com sombras específicas) | Médio | Mapear cada variante CSS→CVA 1:1 antes; migrar por módulo (admin → gerente → caixa) |
| Aliases de compatibilidade (P0.3) virarem permanentes | Médio | Data de expiração por prefixo no roadmap + `guard:design` falhando em novos usos |
| Login premium quebrar ao desescopar `!important` | Baixo | Tratar por último; escopo `[data-theme='login']` com teste e2e de login |
| Time criar componentes fora de `src/ui/` por hábito | Médio | CODEOWNERS + lint de import path + review checklist |
| `component.css`: alguém "consertar" os tokens quebrados em vez de deletar | Baixo | P0.1 primeiro, com este documento como justificativa |

---

## 8. Critérios de aceite da Fase 6

A Fase 6 só termina quando **todas** as condições abaixo forem verificáveis:

1. **Tokens são fonte única** — `src/ui/tokens/` existe; o azul da marca (e cada cor semântica) é definido em exatamente 1 lugar; `rg '#2563eb'` fora de `tokens/` retorna 0; `component.css`, `semantic.css`, `chinese-theme.css` e os componentes com 0 imports foram deletados.
2. **Componentes críticos possuem dono** — CODEOWNERS cobre `src/ui/`; Button, Input/Select, Dialog/Sheet, DataTable/FilterBar, Toast e Tokens têm dono nomeado.
3. **Regressões são bloqueadas** — `guard:design` roda no CI (hex fora de tokens, imports deprecated, `text-[Npx]` novo, `dark:`/fundo escuro já cobertos); screenshots de referência das telas âncora comitados.
4. **Novas telas seguem padrão** — as 2 últimas telas mergeadas antes do fechamento da fase usam `ListPage`/primitivos oficiais sem exceção; zero hex e zero tipografia arbitrária no diff delas.
5. **PDV e Admin compartilham fundação** — caixa e admin consomem os mesmos tokens semânticos e os mesmos primitivos (Button, Dialog, Toast); o dualismo classic/dragon não existe mais no código; plano escrito para `pdv-local` consumir os mesmos tokens (execução pode ficar em P3).

---

*Documento produzido pela auditoria da Fase 6. Nenhum código de produção foi alterado. Próximo passo sugerido: aprovar P0 e abrir os PRs de deleção (P0.1) — são de risco quase nulo e removem ~1.000 linhas de peso morto antes de qualquer consolidação.*
