# UX_AUDIT.md — Fase 2 · Onda 1 (Auditoria completa)

**Data:** 2026-07-19  
**Escopo:** `pdv-importados` (Admin `/admin`, PDV `/caixa`, Login `/login`)  
**Método:** auditoria estática do repositório — **nenhum código foi alterado**  
**Princípio (inegociável):** Fase 1 encerrada. Esta fase só trata UX / UI / Design System / consistência / performance percebida / acessibilidade. Sem funcionalidade nova, sem mudança de domínio, sem regra de negócio, sem migration funcional, sem alteração em RLS/Auth/Fiscal.

> **Atualização Onda 2:** contrato visual congelado em `docs/architecture/DESIGN_SYSTEM_CONTRACT.md` e `styles/tokens/*`. Fundação (tokens, Button, DataTable, Forms, Feedback, focus, radius, tipografia) implementada; migração tela-a-tela é a próxima onda.

**Referências internas:** `FASE_6_DESIGN_SYSTEM_AUDIT.md`, `docs/02-DESIGN-SYSTEM.md`, `pdv-importados/VISUAL_PHILOSOPHY.md`, `pdv-importados/theme.config.ts`

---

## 1. Veredito executivo

O FastProduct **não tem um Design System único em operação**. Há uma direção correta (Admin V2 + tokens `--jl-*` + primitivo shadcn parcial), mas convivem **8 vocabulários de token**, **2+ sistemas de botão**, **2 sistemas de tabela**, **modais paralelos no caixa**, e **estados (loading / empty / error) artesanais por tela**.

Para um ERP visualmente profissional na Fase 2, o bloqueador não é “falta de belo” — é **fragmentação**. Enquanto a mesma shell Admin renderizar `DataTable` em catálogo e `GerenteTable` em clientes, o produto continuará parecendo “várias versões coladas”.

| Dimensão | Estado |
|---|---|
| Shell Admin | ✅ `AdminV2Shell` consolidado |
| Primitivos oficiais | ⚠️ Button/Input/Card/Badge existem; Select/Dialog/Toast/EmptyState faltam ou estão duplicados |
| Tokens | ❌ 8 vocabulários vivos + arquivos mortos |
| Listagens críticas | ❌ DataTable vs GerenteTable vs `<table>` raw |
| PDV / Login | ⚠️ Linguagens próprias (aceitável se tokenizadas; hoje divergem) |
| Acessibilidade estrutural | ⚠️ Bom em DragonModal / aria-sort; fraco em FormField adoption e ações hover-only |
| Telas “inacabadas” | ❌ Loading admin em branco, empties divergentes, error boundary off-brand |

---

## 2. Inventário — o que existe hoje

### 2.1 Camadas de token (coexistem)

| # | Sistema | Onde | Uso real |
|---|---|---|---|
| 1 | shadcn HSL (`--primary`, `--ring`…) | `app/globals.css` | Button/Input/Card |
| 2 | `--surface` / `--accent` / `--border` | `styles/theme-oriental.css` + `theme.config.ts` | Contrato “canônico” declarado |
| 3 | `--jl-*` (Jin Long) | `styles/theme-fix-aggressive.css` | **Dominante** no Admin/PDV (~992 usos TSX) |
| 4 | `--fp-*` | `styles/tokens/theme.css` | Esparso (~35 usos; badges/MetricCard) |
| 5 | `--admin-v2-*` | `styles/admin-v2.css` | Escopo `[data-admin-v2]` |
| 6 | `--color-dragon-*` | `styles/tokens/base.css` | Login / resíduos |
| 7 | `--btn-*` / `--card-*`… | `styles/tokens/component.css` | **Morto** (0 consumidores; refs quebradas) |
| 8 | chinese / imperial | `styles/chinese-theme.css` | **Morto** (nunca importado) |

Azul de marca `#2563eb` redeclarado em ≥4 arquivos CSS. Formatos mistos: HSL cru (shadcn) vs hex.

### 2.2 Componentes UI compartilhados

**`components/ui/` (oficial parcial):** Button, Input, Card, Badge, badges (domínio), Skeleton, DragonModal, DataTable, FilterBar, PriceTooltip, MargemCell, StockAlertBadge, ActivityFeed + pasta `admin-v2/` (Shell, PageHeader, MetricCard, SectionCard, ChartCard).

**Paralelos vivos:**
- Classes `.app-btn-*` / `.app-input` / `.app-select` (`theme-oriental.css`) — ~115 usos `app-btn`
- `components/gerente/GerenteTable` — 21 arquivos
- Modais artesanais do caixa (`CaixaConfirmModal`, `CaixaGerenteModal`, …) fora de `DragonModal`
- Toasts: `GerenteToastViewport` + `CaixaToastViewport` (dois barramentos)

**Lacunas estruturais:** Select/Combobox, DropdownMenu, EmptyState oficial, ErrorState oficial, FormField adotado nos CRUDs, Toast único, prop `loading` na DataTable.

### 2.3 Telas Admin auditadas (27 rotas `app/admin/**/page.tsx`)

Fluxos críticos cobertos na matriz da §4: dashboard, catálogo, clientes, fornecedores, estoque, vendas, financeiro, caixa, login.

---

## 3. Achados por superfície auditada

### 3.1 Componentes

| Achado | Evidência | Severidade |
|---|---|---|
| MetricCard triplicado (admin-v2 vivo; `ui/MetricCard` e `gerente/MetricCard` mortos) | `components/ui/admin-v2/MetricCard.tsx` vs irmãos sem import | P1 |
| Badge genérico vs badges de domínio vs `GerenteStatusBadge` | `badge.tsx` / `badges.tsx` / status jl | P1 |
| `FormField` a11y existe mas CRUDs não o usam; Configurações tem FormField local sem contrato | `components/forms/FormField.tsx`; `ConfiguracoesContent.tsx` | P0 |
| Storybook com 3 stories e temas fantasmas | `stories/`, docs desatualizados | P2 |
| Código morto simula DS que não opera | `tokens/component.css`, `chinese-theme.css`, `StatCard.tsx` | P1 (higiene visual/DS) |

### 3.2 Botões

| Achado | Evidência | Severidade |
|---|---|---|
| Dois sistemas oficiais de fato: `Button` (38 arquivos) vs `.app-btn-*` (~115 usos) | `components/ui/button.tsx` + `theme-oriental.css` | **P0** |
| Hover diferente: shadcn `hover:bg-*/90` vs app-btn brightness + translateY + sombra | CSS oriental vs CVA | P0 |
| Focus diferente: ring shadcn vs box-shadow accent/amber global | ver §3.13 | P0 |
| Disabled: `opacity-50` (Button) vs `0.65` (app-btn) vs one-offs 40/60/70 | greps `disabled:opacity-*` | P1 |
| Variantes legado: `.login-premium-submit`, `.gerente-btn-csv`, chips | login / gerente | P2 (escopados) |

### 3.3 Inputs / Selects

| Achado | Evidência | Severidade |
|---|---|---|
| Input shadcn pouco usado; `.app-input` / `.jl-modal-field` dominam | caixa + modais | P1 |
| **Não existe Select compartilhado** — `<select>` nativo + classes ad hoc | ~26 arquivos | **P0** (consistência ERP) |
| Comboboxes de domínio (Fornecedor, SelectComCadastroRapido) com chrome próprio | `components/gerente/produtos/form/fields/*` | P1 |
| Altura/padding/borda não unificados entre FilterBar, modais e forms | `FilterBar.tsx`, modais cadastro | P1 |

### 3.4 Tabelas

| Achado | Evidência | Severidade |
|---|---|---|
| Admin usa **3 famílias** de tabela na mesma shell | DataTable (catálogo/estoque/vendas/financeiro) · GerenteTable (clientes/fornecedores + híbridos) · `<table>` raw (dashboard) | **P0** |
| Densidade: DataTable `text-[12px]/py-2.5` vs Gerente compact `py-[7px]` vs dashboard `text-sm/py-3` | respectivos arquivos | P0 |
| Radius container: DataTable `rounded-lg` vs GerenteTable `rounded-xl` | | P1 |
| Sticky header só em sheets PDV/NF-e; listagens Admin longas sem sticky | `CaixaHistoricoSheet`, import NF-e | P2 |
| DataTable **sem prop `loading`**; GerenteTable tem skeleton | `DataTable.tsx` vs `GerenteTable` + `DataTableSkeleton` | P1 |
| Ações da DataTable: `opacity-0 group-hover:opacity-100` — teclado/touch não descobrem ações | `DataTable.tsx` L194 | **P0** (a11y + UX) |
| Gerente: ações sempre visíveis | `gerente-row-actions` | contraste com DataTable |

### 3.5 Formulários

| Achado | Evidência | Severidade |
|---|---|---|
| Sem contrato visual único de erro de campo (`aria-invalid`, cor, mensagem) | modais Cliente/Produto/Fornecedor | **P0** |
| Marcador de obrigatório inconsistente: `*` accent, `*` no label, FormField unused nos CRUDs | `ClienteEditarModal`, `EssencialSection` | P1 |
| Layout de seções de produto vs cadastro simples vs configurações — três ritmos | | P1 |
| PendingSubmit / ConfirmAction com forks | forms + gerente + caixa | P2 |

### 3.6 Páginas / shells

| Achado | Evidência | Severidade |
|---|---|---|
| `/admin/*` sob AdminV2; `/caixa` e `/login` fora (esperado) mas sem ponte de tokens | layouts | P1 |
| PageHeader presente nos fluxos críticos Admin | maioria das páginas | ✅ |
| Subrotas reusam clients gerente dentro do Admin (chrome misto) | import-nfe, impressão etiquetas, etc. | P1 |
| Fornecedores: subtítulo hardcoded PT enquanto título i18n | `fornecedores/page.tsx` | P2 |
| Docs conflitantes: VISUAL_PHILOSOPHY (amber) vs Fase 0 Bling blue | docs | P1 (governança visual) |

### 3.7 Cores

| Achado | Evidência | Severidade |
|---|---|---|
| Marca azul em múltiplas declarações | globals, oriental, jl, theme | **P0** |
| ~61× `text-amber-400` (e família red/emerald-300/400) pensados para dark, hoje sobre fundo claro — contraste WCAG comprometido | gerente / resíduos | **P0** (a11y) |
| Hex em TSX (login `#bfa76a`, charts, suspensão/comissões dark leftovers) | auth, relatórios, gerente | P1 |
| `fp-*` vs `jl-*` sem regra de uso | MetricCard/badges vs resto | P1 |
| Error boundaries com `bg-blue-600` / slate — fora do DS | `app/error.tsx`, `app/caixa/error.tsx` | P1 |

### 3.8 Tipografia

| Achado | Evidência | Severidade |
|---|---|---|
| **411+** usos de `text-[10px|11px|12px]` — escala de `base.css` não entra no Tailwind | greps TSX | **P0** |
| `body` 15px global vs telas forçando 10–12px | `globals.css` vs tabelas | P1 |
| Headers Admin vs PDV vs login (serif/premium) sem escala nomeada (`caption`/`body`/`title`) | | P1 |
| Chinese UI (Noto SC) — diferencial válido; empties com glifo 客 vs emoji 📦 | clientes vs catálogo | P1 |

### 3.9 Ícones

| Achado | Evidência | Severidade |
|---|---|---|
| Lucide é padrão — OK | `lucide-react` | ✅ |
| Escala inconsistente: `h-3` / `h-3.5` / `h-4` (~82) / `h-5` (~20) / `size={12|13}` | row actions vs nav | P2 |
| Brand SVGs (Dragon) misturados com Lucide no chrome | TopBar / login | P2 (aceitável com regra) |

### 3.10 Spacing

| Achado | Evidência | Severidade |
|---|---|---|
| `--space-*` em base.css **não** wired no Tailwind | `tailwind.config.js` | P1 |
| Ritmo de página: PageHeader `mb-5/gap-4` vs FilterBar `gap-1.5–2` vs empties `py-10` vs `py-12` vs `py-16` | | P1 |
| Inline `style={{}}` para layout em pontos legado | ex.: GerenteFilterBar | P2 |

### 3.11 Shadows

| Achado | Evidência | Severidade |
|---|---|---|
| Shadows Tailwind (`shadow-sm` 39×, `md` 6×, `lg` 10×) + sombras custom em `.app-btn-*` + `--admin-v2-shadow-card` + `--jl-elev-*` | CSS + TSX | P1 |
| Resíduo glass / elevação dragon em caminhos de modal | DragonModal / classes dragon | P2 |
| Cards Admin com sombra; tabelas sem — OK se intencional, mas sem doc de elevação | | P2 |

### 3.12 Radius

| Achado | Evidência | Severidade |
|---|---|---|
| Tritone: `rounded-md` (~240) · `rounded-lg` (~208) · `rounded-xl` (~70) + `--admin-v2-radius-card: 10px` + shadcn `--radius: 0.5rem` | | **P0** |
| Mesma shell: tabela DataTable lg vs Gerente xl | | P0 |

### 3.13 Hover

| Achado | Evidência | Severidade |
|---|---|---|
| Botões: flat opacity vs lift+brightness | Button vs app-btn | P0 |
| Linhas de tabela: hover fraco / quase imperceptível em alguns tons jl | DataTable `hover:bg-white/[0.03]` | P1 |
| Chips/selects sem hover uniforme | FilterBar, PDV pagamento | P2 |
| Ações só no hover da linha | DataTable | P0 |

### 3.14 Focus

| Achado | Evidência | Severidade |
|---|---|---|
| **≥3 anéis de foco:** shadcn ring, box-shadow accent (oriental/jl), amber no skip-link Admin, login premium | `button.tsx`, `theme-oriental.css`, `AdminV2Shell` | **P0** |
| Regra global com muitos `:not()` — frágil | oriental ~250–296 | P1 |
| FilterBar `outline-none` depende do CSS global | `FilterBar.tsx` | P1 |

### 3.15 Disabled

| Achado | Evidência | Severidade |
|---|---|---|
| Opacidades 40 / 50 / 60 / 65 / 70 misturadas | TSX + CSS | P1 |
| Alguns controles desabilitados sem `aria-disabled` / cursor | modais artesanais | P2 |

### 3.16 Loading (performance percebida)

| Achado | Evidência | Severidade |
|---|---|---|
| `app/admin/loading.tsx` = superfície vazia (`bg-jl-surface-soft`) — parece “travou” | arquivo | **P0** |
| Caixa: spinner CSS; Login: DragonOuroLoader; Admin: blank | 3 first-paints | P0 |
| Skeletons bons no PDV (`CaixaLoadingStates`) e GerenteTable; DataTable Admin sem loading nativo | | P1 |
| `GerenteRouteLoading` definido e **não usado** por nenhum `loading.tsx` | | P2 |
| Poucas rotas com `loading.tsx` (admin + caixa) | | P1 |

### 3.17 Empty

| Achado | Evidência | Severidade |
|---|---|---|
| Sem `EmptyState` compartilhado | — | **P0** |
| DataTable: emoji + título + CTA (📦 etc.) | Catalogo/Vendas/Estoque | P0 |
| Gerente cadastro: glifo chinês (客) + tipografia serif | Clientes/Fornecedores | P0 |
| PDV: texto itálico simples | HistoricoSheet, SelecionarCliente | P1 |
| Relatórios: EmptyState **local** ao arquivo | `RelatoriosContent.tsx` | P1 |
| Fallback string `"Nenhum registro encontrado"` | `DataTable.tsx` | P2 |

### 3.18 Error

| Achado | Evidência | Severidade |
|---|---|---|
| Feedback de mutação: toast em uns domínios, banner inline em outros | catalogo vs páginas SSR | P1 |
| Dois toasts (gerente/caixa) | viewports | P1 |
| Sem `app/admin/error.tsx`; boundaries genéricos off-brand | `app/error.tsx` | P1 |
| Erro de campo sem padrão | modais | P0 (junto com forms) |

---

## 4. Matriz dos fluxos críticos

```
AdminV2Shell ──────────────────────── /admin/*
  PageHeader ──────────────────────── maioria das telas críticas
  DataTable + jl-* ────────────────── catalogo, estoque, vendas, financeiro
  GerenteTable + app-btn + Button ─── clientes, fornecedores (+ híbridos)
  <table> raw ─────────────────────── dashboard (últimos pedidos)
  MetricCard / SectionCard ────────── dashboard, vendas, financeiro

Fora da shell
  /caixa ── jl-* + Button + app-btn + modais próprios + skeletons PDV
  /login ── login-premium-* + hex #bfa76a (exceção cerimonial)
```

| Rota | Parece “acabada”? | Principal gap visual |
|---|---|---|
| `/admin/dashboard` | Parcial | Tabela raw; densidade diferente |
| `/admin/catalogo` | Sim (referência Admin) | Tipografia arbitrária; empty emoji |
| `/admin/clientes` | Parcial | GerenteTable + empty 客 ≠ catálogo |
| `/admin/fornecedores` | Parcial | Idem clientes + subtítulo hardcoded |
| `/admin/estoque` | Sim | Alinhar loading/empty ao DS único |
| `/admin/vendas` | Sim | Idem |
| `/admin/financeiro` | Sim | Sheets/detalhe vs listagem |
| `/caixa` | Sim operacionalmente | Dualismo classic/dragon residual; modais fora do DragonModal |
| `/login` | Sim (intencional) | Tokens não aliasados; hex literais |

---

## 5. Classificação P0 / P1 / P2

### Legenda

| Nível | Significado na Fase 2 |
|---|---|
| **P0** | Inconsistência que impede “ERP visualmente profissional / consistente”. Deve ser resolvida antes de declarar Onda 1 encerrada e antes de polish amplo. |
| **P1** | Alta percepção de fragmentação ou dívida que impede DoD da Fase 2; resolver nas ondas de consolidação. |
| **P2** | Polish, higiene, edge cases; não bloqueia percepção geral se P0/P1 estiverem fechados. |

> Nota: P0 aqui é **UX/UI**. Não inclui migrations, RLS, Auth, Fiscal nem features.

---

### P0 — Bloqueadores de consistência visual

| ID | Achado | Onde olhar | Critério de pronto (só UX) |
|---|---|---|---|
| **P0-01** | Duas famílias de botão com hover/focus/disabled diferentes | `button.tsx` + `.app-btn-*` | Um primitivo visual (mesmo se wrappers coexistirem); anel de foco único |
| **P0-02** | Três famílias de tabela na shell Admin | DataTable / GerenteTable / dashboard raw | Mesma densidade, header, hover, ações, empty/loading |
| **P0-03** | Ações de linha só no hover (DataTable) | `DataTable.tsx` L194 | Ações sempre visíveis ou focus-within; teclado equivalente |
| **P0-04** | Empty states sem componente nem linguagem única | listagens críticas | Um EmptyState (ícone Lucide + título + descrição + CTA opcional); sem misturar emoji/客/texto solto nas telas âncora |
| **P0-05** | Loading Admin em branco + first-paint triplo | `admin/loading.tsx`, caixa, login | Skeleton/padrão Admin; PDV/Login podem variar mas não “vazio” |
| **P0-06** | Tipografia arbitrária massiva (411+) | TSX `text-[10–12px]` | Escala nomeada no Tailwind; telas âncora migradas |
| **P0-07** | Radius tritono + card 10px sem regra | md/lg/xl/admin-v2 | Escala documentada e aplicada nas listagens Admin |
| **P0-08** | Cores dark-on-light (amber/red/emerald-400) | ~61+ amber-400 e família | Contraste AA em fundo claro via tokens status |
| **P0-09** | Marca azul / tokens fragmentados (8 vocabulários) | CSS tokens | Uma fonte semântica; aliases de compatibilidade OK |
| **P0-10** | Forms sem contrato de erro/obrigatório | modais CRUD | FormField (ou equivalente) com `aria-invalid` + mensagem + `*` consistente |
| **P0-11** | Sem Select/Combobox de DS | filtros e forms | Primitivo único estilizado (nativo estilizado ou Radix) nas telas âncora |
| **P0-12** | Anéis de foco múltiplos | oriental + shadcn + admin | Um anel semântico em todo controle interativo |

---

### P1 — Alta prioridade (consolidação)

| ID | Achado | Critério de pronto |
|---|---|---|
| **P1-01** | Dialog único: portar modais artesanais do caixa para DragonModal/Dialog | Zero `role="dialog"` paralelo no caixa |
| **P1-02** | Toast único (viewport + barramento) | Um sistema Admin+PDV ou contrato visual idêntico |
| **P1-03** | Inputs unificados (shadcn / app-input / jl-modal-field) | Mesma altura, borda, focus, disabled |
| **P1-04** | DataTable: prop `loading` + sticky header opcional | Paridade com GerenteTable nos fluxos longos |
| **P1-05** | Badges: um mapa de status (fp vs jl vs GerenteStatusBadge) | Mesmas cores de status em vendas/financeiro/estoque |
| **P1-06** | Remover / isolar dualismo classic/dragon residual no caixa | Uma árvore visual no PDV |
| **P1-07** | Error boundaries com tokens do DS + `admin/error.tsx` | Crash UI on-brand |
| **P1-08** | Feedback de erro de mutação (toast vs banner) padronizado | Mesma anatomia nas telas Admin |
| **P1-09** | Spacing scale no Tailwind + ritmo de página Admin | PageHeader → filters → table com gaps tokenizados |
| **P1-10** | Shadows: mapa de elevação (flat / card / modal / toast) | Sem misturar shadow-sm e elevações jl ad hoc |
| **P1-11** | Disabled opacity única | Token `--control-disabled-opacity` |
| **P1-12** | Higiene: deletar CSS/componentes mortos (component.css, chinese-theme, MetricCards mortos…) | Zero peso morto no DS |
| **P1-13** | Reconciliar docs (VISUAL_PHILOSOPHY amber vs Bling blue) | Um documento de verdade visual |
| **P1-14** | Login: hex → tokens de tema `login` | Exceção cerimonial, mas tokenizada |
| **P1-15** | Subrotas Admin que ainda “parecem gerente” | Chrome Admin V2 consistente (FilterBar/DataTable/Empty) |
| **P1-16** | Hover de linha de tabela perceptível e uniforme | | 

---

### P2 — Polish

| ID | Achado | Critério de pronto |
|---|---|---|
| **P2-01** | Escala de ícones (nav / row action / PDV) | Tokens ou convenção `icon-sm|md|lg` |
| **P2-02** | Sticky thead nas listagens Admin longas | Decisão + implementação nas âncoras |
| **P2-03** | Charts/dev panels com hex → tokens | Relatórios on-token |
| **P2-04** | Storybook vivo (sem temas fantasmas) | Stories dos primitivos oficiais |
| **P2-05** | i18n de subtítulos/strings UI restantes | Paridade PT/ZH nas páginas Admin |
| **P2-06** | Remover `GerenteRouteLoading` morto ou usá-lo | Sem dead UX code |
| **P2-07** | Density toggle / colunas (futuro ERP) | Só após tabela única |
| **P2-08** | Regressão visual (Playwright screenshots) | âncoras: dashboard, vendas, caixa, login |
| **P2-09** | Ponte de tokens com `pdv-local` | Fora do núcleo web; documentar |
| **P2-10** | Variantes legado login/csv/chips documentadas como escopo | Não proliferar |

---

## 6. Contagens (evidência quantitativa)

Varredura em `pdv-importados` (TSX, excluindo testes), 2026-07-19:

| Métrica | Valor |
|---|---|
| `text-[10px\|11px\|12px]` | **411** |
| `text-amber-400` | **61** |
| `app-btn-*` | **115** |
| Arquivos importando `Button` | **38** |
| Arquivos tocando `GerenteTable` | **21** |
| Arquivos importando `DataTable` | **13** |
| `rounded-md` / `lg` / `xl` | **240** / **208** / **70** |
| `shadow-sm` / `md` / `lg` | **39** / **6** / **10** |
| Usos `jl-*` (ordem de grandeza) | **~992** |
| Usos `fp-*` (ordem de grandeza) | **~35** |
| Rotas Admin `page.tsx` | **27** |

---

## 7. Telas âncora sugeridas para a Fase 2

Ordem recomendada de alinhamento visual (sem mudar comportamento):

1. **Catálogo** — referência Admin “boa”  
2. **Clientes + Fornecedores** — fechar gap GerenteTable  
3. **Estoque / Vendas / Financeiro** — fechar empty/loading/ações  
4. **Dashboard** — eliminar tabela raw  
5. **Caixa** — Dialog/Toast/Button unificados visualmente  
6. **Login** — tokenizar exceção  

---

## 8. Fora de escopo desta auditoria (e da Fase 2)

- Qualquer feature nova  
- Mudança de domínio / regra de negócio  
- Migrations funcionais  
- RLS / Auth / Fiscal  
- Refactors de arquitetura de dados  
- `pdv-local` (apenas nota P2-09)

Alterações permitidas nas próximas ondas: CSS, componentes de apresentação, tokens, layouts, estados visuais, a11y de UI, microinterações — **preservando comportamento**.

---

## 9. Definition of Done — Fase 2 (checklist)

A Fase 2 termina quando:

- [ ] Não houver inconsistências visuais **relevantes** (P0 zerado; P1 residual documentado ou aceito)  
- [ ] Todas as telas Admin/PDV/Login utilizarem o Design System acordado (primitivos + tokens semânticos)  
- [ ] Fluxos críticos (§7) visualmente consistentes entre si (tabela, botão, empty, loading, erro, focus)  
- [ ] Nenhuma tela crítica parecer “inacabada” (loading blank, empty solto, tabela raw, chrome híbrido)  
- [ ] Contraste AA nos textos de status sobre superfície clara  
- [ ] Docs de DS alinhados a uma única verdade visual  

---

## 10. Próximo passo (Onda 2 — não iniciar aqui)

Esta Onda 1 **só audita**. Próxima onda sugerida (ainda sem feature):

1. Congelar o **contrato visual** (tokens semânticos + primitivos oficiais + estados).  
2. Fechar **P0-01…P0-12** nas telas âncora.  
3. Só então polish P1/P2 em lote.

Nenhum código foi alterado nesta entrega.
