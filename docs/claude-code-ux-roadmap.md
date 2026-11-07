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

### Tarefa 4 🟡 — Gaveta: `DragonModal placement="drawer"`
- O `DragonModal` é o primitivo único de diálogo; a gaveta vira variante dele, não um
  componente concorrente. Herda ESC, backdrop, foco preso/restaurado, trava de scroll.
- Tela cheia no mobile; a partir de `sm`, 480 px (`sm`/`md`) ou 640 px (`lg`/`xl`).
  Header fixo, só o corpo rola, footer fixo com as ações primárias.
- Behavior tests: geometria, header/corpo/footer, ESC/backdrop/X, `dismissable`,
  a11y, foco ao abrir e ao fechar, ciclo de Tab, regressão do diálogo central.

### Tarefa 5 🟡 — `VendaDetailSheet` → gaveta do `DragonModal`
- Mesmo conteúdo e ações (reimpressão, cancelamento, devolução); só a casca muda.
- Testes existentes (`cancelamento`, `reimpressao`) continuam verdes + teste de ESC/footer.

### Tarefa 6 🟡 — Dashboard: skeleton + empty-state com CTA
- `app/admin/dashboard/loading.tsx` com skeleton KPI → gráfico → tabela.
- Empty-state da tabela de pedidos com CTA "Abrir PDV".
- Behavior tests: skeleton com 3 blocos na ordem; empty-state mostra o CTA com href do PDV.

### Tarefa 7 🟠 — Dashboard: drill-down em gaveta
- Clicar num KPI grava `?detalhe=<métrica>` na URL e abre a gaveta (`DragonModal placement="drawer"`) com a lista que
  compõe a métrica (dados já carregados pela página; nenhuma query nova).
- Behavior test: clique → URL atualizada → gaveta aberta; ESC → parâmetro removido.

### Tarefa 8 🟠 — Filtros de Estoque/Catálogo no padrão
- `CatalogoFiltrosBar`, `estoque/page`, `estoque/movimentacoes/page`: `layout="grid"`,
  presets 7d/30d/mês em movimentações.
- Behavior tests por tela (URL espelhada, Limpar condicional).

### Tarefa 9 🟠 — `OcDetalheModal` → gaveta do `DragonModal`
- Fluxo de compras/recebimento: maior superfície. Só a casca muda; regras de recebimento parcial
  e aviso de duplicidade intactas (testes existentes como guarda).

### Tarefa 10 🟡 — `/opacidade` sobre `var(--token)` (8 ocorrências legadas)
- `bg-[var(--token)]/NN` não gera CSS no Tailwind v3 (tokens são hex). Achado na revisão do #561.
- Trocar cada ocorrência listada em `tests/css-tokens-definidos.test.ts` (`LEGADO`) por
  `color-mix(in_srgb,var(--token)_NN%,transparent)`, esvaziando a lista.
- Inclui telas do Caixa (PDV): só apresentação, conferir contraste.
- Teste: a guarda com `LEGADO` vazio + verificação do CSS gerado pelo Tailwind.

## Registro de execução

Sprint encerrada em 2026-10-16. Cada PR foi integrado só com os 6 checks obrigatórios da
`main` **e** os 2 E2E (`e2e-playwright`, `E2E crítico`) verdes, branch atualizada, revisão do
Codex sem apontamento aberto e `main` revalidada após o merge (typecheck, vitest completo e
deploy de produção da Vercel).

| Tarefa | PR | Merge na `main` | Revisão | Testes |
|---|---|---|---|---|
| 0 — Financeiro (stash) | — | — | — | **Bloqueada**: `stash@{0}` e o commit `aafd653` não existem; não reconstruir por suposição |
| 1 — `ExecutiveSidebarNav` por tokens | #553 | `100181b1` | Codex 👍 | behavior test (4/5 vermelho → 5/5) |
| 2 — tokens CSS inexistentes | #561 | `d390415b` | 1 apontamento corrigido (`/95` → `color-mix`) | guarda de tokens (13 usos → 0) |
| 3 — `FilterBar` (300 ms + grid) | #562 | `0b9012aa` | Codex 👍 | 11 behavior tests + regressão do layout inline |
| 4 — gaveta `DragonModal placement="drawer"` | #563 | `aaf396e3` | Codex 👍 | 8 behavior tests (6 vermelhos sem a mudança) |
| 6 — skeleton + empty-state do Dashboard | #564 | `fc2027da` | 2 apontamentos corrigidos (grid do KPI, `periodo=tudo`) | 7 behavior tests |
| 10 — `/opacidade` sobre `var()` (8 legados) | #565 | `b1fcfc62` | Codex 👍 | guarda sem allowlist + compilação Tailwind por classe |
| 5 — detalhe da venda na gaveta | #568 | `994a9ef7` | Codex 👍 | 4 + 3 (pilha de diálogos) behavior tests |
| 7 — drill-down dos KPIs | #570 | `fcc96038` | 4 apontamentos corrigidos (população do KPI, por hora, erro, rótulo) | 15 testes (helper, gaveta, página) |
| 9 — detalhe da OC na gaveta | #569 | `54425928` | 2 apontamentos corrigidos (confirmação visível, X em 2 níveis) | 7 behavior tests |
| 8 — filtros de Estoque/Catálogo/Movimentações | #567 | `698a4add` | Codex 👍 | 11 testes (filtros, período no kardex, grid) |

### Pendências e observações reais
- **Tarefa 0** segue bloqueada até existir fonte íntegra do trabalho do Financeiro.
- **Teste local `productUpdater.semRpc.integracao`** falha só em máquina com outro Supabase
  local na porta 54321 (usa a chave placeholder). Não é regressão; no CI roda limpo.
- **`next.config.js`** tem 4 erros de `no-unused-vars` quando se roda `eslint .` sem `--ext`;
  fica fora do lint oficial (`npm run lint` = `--ext .ts,.tsx`, verde) e já existia antes da sprint.
- **Verificação visual** não foi feita localmente (worktree sem env do Supabase); a cobertura é
  por behavior tests, E2E do CI e preview da Vercel.
