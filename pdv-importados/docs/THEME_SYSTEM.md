# Sistema de Temas — Contrato Arquitetural (Design System Clássico)

> **Status: OBRIGATÓRIO.** Este documento é um contrato de execução, não uma
> sugestão. Toda migração de UI para o tema Clássico deve segui-lo. A aderência
> é verificada automaticamente (`npm run guard:theme`, dentro de `guard:all` no
> CI) e validada no code review. PRs que violem o contrato **não são aceitos**.

Base oficial: **PR #112**. A partir dele, novas migrações devem ser mecânicas e
previsíveis.

---

## 1. Convenção técnica (regra do sistema)

1. **Resolução de tema por rota.** `lib/theme/themeRegistry.ts` é a fonte única
   da verdade: mapeia `rota → tema`. Nenhuma lista de rotas/temas pode ser
   duplicada em componentes.
2. **Aplicação exclusiva via `[data-theme]`.** O tema é projetado na subárvore
   por `AdminThemeScope` através do atributo `data-theme`. O CSS escopado em
   `[data-theme='<tema>']` reatribui os **valores** dos tokens. Componentes não
   conhecem temas — apenas consomem tokens.
3. **Extensível sem alteração estrutural.** `ThemeId` é string aberta. Adicionar
   um tema (incl. cenários multi-tenant) **não** altera `themeRegistry` nem
   `AdminThemeScope`:
   - crie `styles/tokens/<tema>/` escopado em `[data-theme='<tema>']`;
   - importe-o no `app/layout.tsx`;
   - aponte a rota para ele no registry (`theme: '<tema>'`).
   - metadata por módulo é **opcional** (`meta`), nunca obrigatória.

### Invariantes obrigatórias (não negociáveis)

| # | Regra | Por quê | Enforcement |
|---|-------|---------|-------------|
| I1 | **Proibido hardcode de cor** na superfície do Design System (utilitário Tailwind de paleta numerada, hex ou `rgba()/hsl()` em valor arbitrário). Use tokens (`jl-*`, `--jl-*`, `--color-*`, `--admin-v2-*`, `--cl-*`) ou as classes semânticas shadcn (`success`, `destructive`, `primary`, `muted`, `border`, `background`, `foreground`, `ring`, `accent`, `card`, `popover`, `secondary`). | Cor fixa quebra o tema: não acompanha `[data-theme]`. | `guard:theme` |
| I2 | **Proibido resolver tokens via `:root`** em contexto de tema. Gráficos/canvas **devem** resolver a partir do elemento escopado `[data-theme]` (ex.: o próprio `<canvas>`), nunca `getComputedStyle(document.documentElement)`. | Tokens do tema vivem em um descendente, não no `:root`; resolver no `:root` retorna o valor errado (ex.: sparkline dourado no tema Clássico). | `guard:theme` |

Exceção pontual e auditável: marque a linha com `theme-guard-allow <motivo>`
(ex.: fallback de SSR/teste). Use com parcimônia — é revisável no PR.

---

## 2. Checklist obrigatório de migração (critério de aceite)

Toda migração de um módulo para o tema Clássico só é considerada concluída quando:

- [ ] Rota adicionada ao registry (`CLASSICO_ROUTES` / `MODULES` em `lib/theme/themeRegistry.ts`).
- [ ] `data-theme` aplicado corretamente (via `AdminThemeScope`; verificado no DOM da rota).
- [ ] Uso exclusivo de tokens (nenhum hardcode de cor) — `npm run guard:theme` verde.
- [ ] Charts/canvas resolvem tokens via elemento escopado `[data-theme]` (nunca `:root`).
- [ ] Validação visual contra o **baseline** (§3) no tema Clássico.
- [ ] Nenhum acoplamento direto a valores fixos de cor (revisado no code review).
- [ ] `npm run typecheck` e build verdes.

> Se a migração introduzir um diretório/página novo, **adicione-o à lista
> `POLICED` em `scripts/theme-tokens-guard.mjs`** para que o guard passe a
> policiá-lo.

Este checklist também consta do template de PR (`.github/pull_request_template.md`)
e é **critério de aceite** — não pode ficar incompleto em PR de migração.

---

## 3. Baseline visual oficial

O **Dashboard Clássico** (`/admin/dashboard`) é a **referência visual oficial**
da fundação. Antes de migrar um módulo, compare contra ele:

- superfícies brancas, fundo de página cinza claro, bordas discretas, sombras suaves;
- azul (`--cl-blue-600`) como cor principal / estados ativos / foco;
- densidade de informação e tipografia consistentes com o Dashboard;
- KPIs (`MetricCard`), seções (`SectionCard`), cabeçalho (`PageHeader`),
  filtros (`FilterBar`) e tabelas seguem o mesmo vocabulário visual.

Qualquer módulo migrado deve ser visualmente coerente com este baseline antes de
ser aceito. Preview de referência: deployment Vercel do PR base (#112),
rota `/admin/dashboard`.

---

## 4. Enforcement (mecanismos reais)

1. **Guard automatizado — `npm run guard:theme`** (`scripts/theme-tokens-guard.mjs`),
   incluído em `guard:all` e executado no CI (`build-and-test`). Bloqueia I1 e I2.
2. **Checklist no PR template** como critério de aceite de PRs de migração.
3. **Code review** valida aderência ao sistema de temas (convenção + invariantes
   + coerência com o baseline).

### Como migrar um módulo (resumo mecânico)

1. Garanta que a tela usa apenas componentes oficiais do Design System e tokens.
2. Adicione a rota ao `themeRegistry` e o diretório ao `POLICED` do guard.
3. Rode `npm run guard:theme && npm run typecheck && npm run build`.
4. Valide visualmente contra o baseline (§3).
5. Abra o PR com o checklist (§2) completo.

### Como adicionar um novo tema (multi-tema / multi-tenant)

1. `styles/tokens/<tema>/` com os tokens escopados em `[data-theme='<tema>']`.
2. Importe o `index.css` do tema no `app/layout.tsx`.
3. Aponte as rotas para o tema no registry (`theme: '<tema>'`), opcionalmente com `meta`.
   Nenhuma mudança em `AdminThemeScope` ou na lógica do registry é necessária.
