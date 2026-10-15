# Roadmap UX — Filtros, Gaveta e Dashboard (Admin V2)

> Reconstruído em 2026-10-14 a partir do código atual (`origin/main` @ `072f130b`).
> O roadmap original (commit `aafd653`, branch `loop/ux-estoque-produto-contexto`) e o
> `stash@{0}` do Financeiro não existem neste repositório. A Tarefa 0 fica registrada
> como **bloqueada** e fora deste ciclo.
>
> Execução: skill `.cursor/skills/engineering-loop` — uma missão por vez, um commit por
> unidade funcional validada, behavior test obrigatório, CI verde antes de merge.

## Regras inegociáveis

- Nunca tocar em RPCs, RLS, migrations ou regras financeiras/fiscais. Só apresentação.
- Um commit por unidade funcional (Conventional Commits, mensagem com o *porquê*).
- Todo comportamento novo ou alterado ganha behavior test (Vitest + Testing Library).
- Validar `typecheck` + `lint` + `vitest` do que foi tocado antes de cada commit.
- Nunca declarar verde sem rodar. OOM/falta de recurso = bloqueio registrado, segue para a
  próxima tarefa de risco baixo.
- Sem merge na `main` sem CI verde.

## Padrões de UI (alvo)

### Filtros
- Grid responsivo: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Botão **Limpar** condicional: só aparece com filtro ativo.
- Estado espelhado na URL (search params são a fonte de verdade).
- Debounce de **300 ms** na busca (Enter aplica na hora).
- Presets de período: **7d / 30d / mês atual** (vocabulário do `PeriodFilter`).

### Gaveta (Drawer)
- Substitui modais de **detalhe** (não modais de confirmação).
- Largura 480–640 px no desktop; tela cheia no mobile.
- Header fixo com título + fechar; **ESC fecha**; conteúdo rolável; footer com ações primárias.
- Foco preso na gaveta e restaurado ao fechar; trava de scroll do body.

### Dashboard
- Hierarquia KPI → gráfico → tabela.
- Skeletons durante o carregamento (mesma geometria do conteúdo final).
- Empty-state com CTA.
- Drill-down: clicar em métrica/gráfico abre a gaveta com o detalhe.

## Diagnóstico (estado atual)

| Área | O que já existe | Lacuna |
|---|---|---|
| Sidebar | `ExecutiveSidebarNav` com estados ativos em `.admin-v2-nav-link` (tokens `--admin-v2-active-*`) | Classes Tailwind arbitrárias com dourado fixo (`rgba(251,191,36,…)`, `#1c1917`, `amber-400`) sobrescrevem os tokens: o ativo fica dourado num tema cuja marca é azul, e o texto do "Abrir PDV" ignora `--color-fg-on-brand` |
| Filtros | `FilterBar` (URL-driven, Limpar condicional via `haFiltroAtivo`), `PeriodFilter` (Hoje/Ontem/7d/30d/Mês/Todos) | Debounce padrão 350 ms; layout `inline-flex`, sem grid responsivo |
| Gaveta | `VendaDetailSheet` (aside `max-w-lg`, ESC), `DragonModal` (foco, ESC, scroll lock) | Sem primitivo único de gaveta; `OcDetalheModal`, `EntregaDetalhe`, `ContaPagarDetalhe` ainda são modais centrais; sem header/footer fixos padronizados |
| Dashboard | `KpiStrip`, `ChartCard`, `DashboardOrdersTable`, `EmptyState`/`ErrorState` | Sem `loading.tsx` (sem skeleton); sem drill-down de KPI |
| Tokens | `--focus-ring-*` + `.fp-focus-ring` (SSOT de foco) | `--color-focus-ring` é usado em `ComprasContent` e `ContasPagarListClient`, mas não existe: o anel de foco some |

## Tarefas (ordem de execução)

Legenda de risco: 🔴 alto · 🟠 médio · 🟡 baixo.

### Tarefa 0 🔴 — Financeiro (stash) · **BLOQUEADA**
`stash@{0}` inexistente. Reabrir só quando o WIP for publicado numa branch.

### Tarefa 1 🟡 — `ExecutiveSidebarNav`: tokenização
- Remover as classes arbitrárias de ativo; o estado ativo vem só de `.admin-v2-nav-link[data-active='true']`.
- "Abrir PDV": `bg-primary text-primary-foreground` (tokens `--color-brand` / `--color-fg-on-brand`).
- Foco: `.fp-focus-ring` (SSOT) no lugar de `ring-amber-400/70`.
- Behavior test: render com rota ativa → `data-active`/`aria-current` corretos, nenhuma cor
  hex/rgba literal no markup, CTA do PDV usa as classes de token.
- Aceite: zero cor literal no componente; testes de nav existentes verdes.

### Tarefa 2 🟡 — `--color-focus-ring` inexistente
- Trocar `focus-visible:ring-[var(--color-focus-ring)]` por `.fp-focus-ring` em `ComprasContent`
  e `ContasPagarListClient` (só a classe de foco; nenhuma regra financeira).
- Teste: pill com a classe canônica de foco.

### Tarefa 3 🟡 — `FilterBar`: debounce 300 ms + layout grid
- `debounceMs` padrão 350 → 300.
- Prop opt-in `layout="grid"` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`
  (o padrão `inline` preserva as telas atuais).
- Behavior tests: commit na URL só após 300 ms; Enter aplica na hora; Limpar some sem filtro
  ativo e aparece com filtro; grid aplica as classes responsivas.

### Tarefa 4 🟡 — Primitivo `DetailDrawer`
- `components/ui/DetailDrawer.tsx`: `open`, `onClose`, `title`, `footer`, `size` (`md` 480 / `lg` 640),
  `closeDisabled`. Mobile tela cheia; header fixo; corpo rolável; footer fixo;
  ESC + backdrop fecham; foco preso e restaurado; scroll lock (reaproveitar a lógica do `DragonModal`).
- Behavior tests: ESC fecha, `closeDisabled` bloqueia, foco vai para a gaveta e volta ao gatilho,
  footer renderizado, `role="dialog"` + `aria-modal` + `aria-labelledby`.

### Tarefa 5 🟡 — `VendaDetailSheet` → `DetailDrawer`
- Mesmo conteúdo e ações (reimpressão, cancelamento, devolução); só a casca muda.
- Testes existentes (`cancelamento`, `reimpressao`) continuam verdes + teste de ESC/footer.

### Tarefa 6 🟡 — Dashboard: skeleton + empty-state com CTA
- `app/admin/dashboard/loading.tsx` com skeleton KPI → gráfico → tabela.
- Empty-state da tabela de pedidos com CTA "Abrir PDV".
- Behavior tests: skeleton com 3 blocos na ordem; empty-state mostra o CTA com href do PDV.

### Tarefa 7 🟠 — Dashboard: drill-down em gaveta
- Clicar num KPI grava `?detalhe=<métrica>` na URL e abre `DetailDrawer` com a lista que
  compõe a métrica (dados já carregados pela página; nenhuma query nova).
- Behavior test: clique → URL atualizada → gaveta aberta; ESC → parâmetro removido.

### Tarefa 8 🟠 — Filtros de Estoque/Catálogo no padrão
- `CatalogoFiltrosBar`, `estoque/page`, `estoque/movimentacoes/page`: `layout="grid"`,
  presets 7d/30d/mês em movimentações.
- Behavior tests por tela (URL espelhada, Limpar condicional).

### Tarefa 9 🟠 — `OcDetalheModal` → `DetailDrawer`
- Fluxo de compras/recebimento: maior superfície. Só a casca muda; regras de recebimento parcial
  e aviso de duplicidade intactas (testes existentes como guarda).

### Tarefa 10 🟡 — `/opacidade` sobre `var(--token)` (8 ocorrências legadas)
- `bg-[var(--token)]/NN` não gera CSS no Tailwind v3 (tokens são hex). Achado na revisão do #561.
- Trocar cada ocorrência listada em `tests/css-tokens-definidos.test.ts` (`LEGADO`) por
  `color-mix(in_srgb,var(--token)_NN%,transparent)`, esvaziando a lista.
- Inclui telas do Caixa (PDV): só apresentação, conferir contraste.
- Teste: a guarda com `LEGADO` vazio + verificação do CSS gerado pelo Tailwind.

## Registro de execução

| Tarefa | Status | Commit | Testes |
|---|---|---|---|
| 0 | Bloqueada (stash inexistente) | — | — |
| 1 | Integrada (PR #553) | `b169cfe6` | behavior test vermelho→verde (4/5 → 5/5); typecheck ✅; eslint ✅; vitest completo ✅; CI ✅ |
| 2 | PR #561 | `93612b75`, `6505cb30` | guarda de tokens vermelho→verde (13 usos → 0); fix da revisão Codex (/95 → color-mix) |
| 3 | Em andamento | — | — |
| 10 | Pendente | — | — |
