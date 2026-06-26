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

Exceções só são permitidas pelo **modelo de override auditável** (§5). Nenhuma
regra pode ser ignorada sem registro explícito, justificado e rastreável.

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

---

## 5. Modelo de exceção auditável (override formal)

O guard **não tem bypass silencioso**. Quando uma exceção é realmente necessária
(ex.: cor de marca legada em remoção, valor exigido por biblioteca de terceiro,
fallback de SSR/teste), registre-a de forma explícita e rastreável, **por regra**,
na mesma linha da violação **ou na linha imediatamente acima** (ergonomia p/ JSX):

```txt
// theme-guard-allow:<ruleId> <justificativa obrigatória> [until=AAAA-MM-DD]
```

Exemplos:

```tsx
// theme-guard-allow:palette-utility cor de marca legada, remoção rastreada em #123
<span className="text-amber-400" />

<div className="bg-[#101010]" /> {/* theme-guard-allow:hex-arbitrary fundo exigido pelo embed X until=2026-09-01 */}
```

Regras do override (qualquer desvio **falha o CI**):

| Requisito | Detalhe |
|-----------|---------|
| **Por regra** | `ruleId` deve ser um id conhecido (`palette-utility`, `hex-arbitrary`, `color-fn-arbitrary`, `root-token-resolution`) ou `*` (todas — desencorajado). Suprime **apenas** a regra nomeada. |
| **Justificativa obrigatória** | mínimo de 8 caracteres com motivo real. |
| **TTL opcional** | `until=AAAA-MM-DD`. Vencido ⇒ guard falha (força revisão/renovação). |
| **Auditável** | o guard imprime um **inventário de auditoria** de todas as exceções ativas (arquivo:linha, regra, validade, em uso / não usada). Rastreável no log de CI e no `git blame`. |

Override malformado (id desconhecido, sem justificativa, data inválida ou
expirada) é tratado como **falha**, não como permissão. Exceções `NÃO USADA`
aparecem no inventário como candidatas a remoção.

> Critério de aceite (2.0): nenhuma regra é bypassável sem registro explícito;
> toda exceção é rastreável e auditável.

---

## 6. Limites do guard (o que ele NÃO cobre)

O guard é a **primeira linha** de defesa (estática, por regex sobre a superfície
policiada). Ele é deliberadamente conservador para alta precisão e baixo ruído —
por isso **não** substitui review nem as fases seguintes do roadmap. Ele NÃO cobre:

- **Arquivos fora do `POLICED`.** Só policia `components/ui/admin-v2/**` e as
  páginas dos módulos migrados. Ao migrar um módulo, **adicione seu diretório ao
  `POLICED`** (item do checklist) — caso contrário ele não é verificado.
- **Tokens CSS.** `styles/tokens/**` define cores (hex/rgba legítimos) e não é
  policiado por design.
- **Cor fora de `className`.** `style={{ color: '#fff' }}`, objetos de tema em JS,
  classes montadas por concatenação/variáveis (`cn(var)`, template strings) e
  paletas de série de gráficos (dados categóricos) **não** são detectados por
  regex. → alvo de lint semântico na Fase 2.3.
- **Correção visual.** Contraste, hierarquia, coerência real com o baseline e
  regressão entre temas não são verificados aqui. → visual regression na Fase 2.3.
- **Resolução dinâmica de token** além do padrão literal
  `getComputedStyle(document.documentElement)` (ex.: variável intermediária
  apontando para o root). → reforço semântico na Fase 2.3.

Enquanto esses limites não forem cobertos por mecanismo automatizado, eles
**permanecem responsabilidade explícita do code review** (§4).
