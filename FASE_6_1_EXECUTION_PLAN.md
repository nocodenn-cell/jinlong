# FASE 6.1 — Plano de Execução: Desmonte Seguro (P0 do roadmap)

**Base:** `FASE_6_DESIGN_SYSTEM_AUDIT.md` (§6, itens P0.1–P0.6)
**Princípio:** só remoção e travamento — nenhum componente novo, nenhuma mudança visual intencional.
**Unidade de entrega:** cada onda é 1 PR pequeno, mergeável e reversível de forma independente.

---

## 0. Pré-condições (Onda 0 — sem mudança de código)

| # | Verificação | Como | Bloqueia |
|---|---|---|---|
| 0.1 | **CI `secret-scan` está quebrado no repositório inteiro** (30 falhas consecutivas em todos os branches, jobs morrem em 2–4s sem runner alocado — `runner_id: 0`). | Resolver em GitHub → Settings → Billing/Actions antes de usar CI como gate de merge. | ⚠️ Sim — sem isso, nenhuma onda tem gate confiável |
| 0.2 | **Confirmar `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` em produção (Vercel).** O código usa `=== "default" ? "default" : "classic"` — ou seja, `classic` é o layout efetivo salvo se a env estiver explicitamente em `default`. | Vercel → Project → Environment Variables | Bloqueia apenas a Onda 3 |
| 0.3 | **Baseline visual**: screenshots de referência de caixa (PDV), `/admin/dashboard`, `/admin/vendas`, `/admin/estoque`, `/login` (preview do Vercel serve). | Manual ou Playwright | Recomendado para Ondas 2–3 |
| 0.4 | Build e testes verdes locais no estado atual (`npm run build`, `npm test -w pdv-importados`). | Local | Sim |

---

## 1. Ordem de remoção

### Onda 1 — Arquivos mortos (risco de regressão: **NULO**, verificado por evidência)

Ordem interna irrelevante; um único PR. Evidência levantada por varredura completa (app, components, lib, styles, stories, tests, scripts, e2e):

| # | Alvo | Evidência de segurança | Cuidado residual |
|---|---|---|---|
| 1.1 | `styles/chinese-theme.css` | **Nunca importado** por nenhum `.ts/.tsx/.css`. Classes `.admin-chinese-theme`, `.card-chinese`, `.error-banner-chinese` sem uso. | `.filter-pill` é usado em 3 páginas admin, **mas a definição viva está em `admin-v2.css`** — não tocar nela. Deletar apenas o arquivo. |
| 1.2 | `styles/tokens/migration-guide.css` | Nunca importado. | Nenhum. |
| 1.3 | `styles/tokens/semantic.css` | Deprecated na Fase 1; fora do import chain. | Atualizar os comentários que o citam em `tokens/index.css` (linhas 15–17) e `tokens/theme.css` (linha 72). |
| 1.4 | `styles/tokens/component.css` + sua linha de `@import` em `tokens/index.css` | 0 consumidores de `var(--btn-*/--card-*/--modal-*/--table-*/--input-*/--badge-*/--chip-*/--caixa-*)` fora da própria pasta `tokens/`; ~30 refs a tokens indefinidos. **Verificado:** os resolvers de runtime (`sparkline.ts`, `chartColors.ts`, `chartJsThemes.ts`) leem apenas tokens de `theme.css`, que permanece. | Exceção: `--skeleton-animation` e afins — confirmar por grep final antes do delete (mesmo comando da auditoria). |
| 1.5 | `components/ui/button-tokenized.tsx` | 0 imports; usa classes Tailwind inexistentes (`bg-surface-primary`, `bg-danger-500`) — nunca funcionou. | Nenhum. |
| 1.6 | `components/ui/MetricCard.tsx` | 0 imports fora de teste. | Importa `DeltaChip` de `badges.tsx` — `badges.tsx` **permanece** (usado pelo admin). |
| 1.7 | `components/gerente/MetricCard.tsx` | 0 imports fora de teste. | Nenhum. |
| 1.8 | `components/ui/StatCard.tsx` | 0 imports. O teste `tests/admin-v2-ui-hardening.test.ts:84` já **proíbe** importá-lo (guard por regex sobre o source — continua válido após a deleção, não referencia o arquivo em si). | Nenhum. |

**Verificação da Onda 1:** `npm run build` + `npm test` + `npm run lint` + re-rodar os greps de evidência (0 hits). Sem screenshot necessário — nenhum byte servido muda (arquivos não participavam do bundle, exceto `component.css`, cujas vars ninguém lê).

**Rollback:** `git revert` do PR (deleções puras, sem conflito possível).

### Onda 2 — CSS de seletor inalcançável (risco: **BAIXO**)

Seletores cujo gatilho DOM nunca ocorre. Evidência: `data-gerente-ui-theme` é fixado em `"dragon-light"` (`app/layout.tsx:45`, `GerenteLayoutShell.tsx:48`, `GerenteThemeContext` trava o valor); `data-app-theme` é fixado em `"classico"`; tipo `GerenteUiTheme = 'dragon-light'` não admite outro valor.

| # | Alvo | Local |
|---|---|---|
| 2.1 | Todos os blocos `[data-gerente-ui-theme='dragon-dark']` (~120 linhas) | `styles/theme-oriental.css` |
| 2.2 | Bloco `[data-gerente-ui-theme='dragon-dark']` (tema GERENTE, linhas 80–109) | `styles/tokens/theme.css` |
| 2.3 | Seletores `[data-app-theme='noturno']` (manter `'classico'`) | `theme-oriental.css`, `tokens/theme.css` |
| 2.4 | `.bg-oriental-clouds` + variantes (0 usos em TSX) | `theme-oriental.css` |
| 2.5 | `.dragon-orbit-*` (1 uso — remover junto com o consumidor se for loader decorativo; se estiver em tela ativa, adiar para 6.2) | `theme-oriental.css` |

Após 2.1–2.3, os seletores `dragon-light` restantes podem ser **achatados** (fundidos no default), já que são o único ramo — fazer isso num commit separado dentro do mesmo PR para o diff ser auditável.

**Por que risco baixo e não nulo:** remoção de seletor nunca aplicado não muda o cascade, mas o achatamento (`dragon-light` → default) muda **especificidade** — um seletor `[data-gerente-ui-theme='dragon-light'] .x` vence `.x`; ao achatar, empates que antes eram vencidos por especificidade passam a ser decididos por ordem no arquivo.

**Verificação:** diff visual contra a baseline da Onda 0 nas 5 telas de referência; `npm run build`; grep `dragon-dark` = 0 hits em `styles/`.

**Rollback:** revert do PR.

### Onda 3 — Colapso do dualismo do caixa (risco: **MÉDIO**) — a única onda que toca tela de faturamento

Pré-condição 0.2 obrigatória: confirmar que produção roda `classic` (é o default do código; a env teria que estar explicitamente `default` para o outro ramo existir em produção).

| # | Ação |
|---|---|
| 3.1 | Fixar `pdvLayoutVariant = "classic"`: remover a leitura de `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` em `CaixaPageClient.tsx:141` |
| 3.2 | Resolver os **17 ternários** `pdvLayoutVariant === "classic" ? A : B` mantendo sempre o ramo A (classic) — mecânico, um por commit lógico |
| 3.3 | Remover a prop `layoutVariant`/`CaixaPdvLayoutVariant` de `CaixaPdvTopBar`, `CaixaHeader`, `CaixaPdvOperadorTabs` e demais consumidores |
| 3.4 | Remover o CSS órfão resultante: ramo dragon do caixa (`.caixa-oriental-root::before` glass, `[data-caixa-layout='classic']` passa a ser o único e é achatado) |
| 3.5 | Remover `CaixaPdvLayoutPreviewBanner` se ele só existia para alternar/preview de layout (verificar antes) |

**Riscos concretos e mitigação:**

- *Risco:* produção estar com `NEXT_PUBLIC_CAIXA_PDV_LAYOUT=default` sem ninguém saber → mudança visual real no PDV. *Mitigação:* pré-condição 0.2; se estiver `default`, parar e decidir com o time qual layout é o vencedor antes de prosseguir.
- *Risco:* ternário com efeito não-visual embutido (ex.: `variant` passada a componente que muda comportamento de foco/atalho). *Mitigação:* revisar os 17 casos um a um — o `CaixaPdvMetodoPagamentoSelector` (linha 392) recebe `variant` como prop de comportamento, não só de classe.
- *Risco:* regressão em fluxo de venda. *Mitigação:* `npm run test:e2e:critical` é gate obrigatório do PR desta onda + smoke manual no preview (abrir turno → bipar → finalizar venda → sangria).

**Rollback:** revert do PR único da onda; nenhuma migração de dado envolvida.

### Onda 4 — Travamento (`guard:design`) (risco: **NULO** em runtime; falso-positivo de CI possível)

Criar `scripts/design-guard.mjs` no padrão dos guards existentes (`guard:core`, `guard:routes`…) e adicionar ao `guard:all`:

1. **Proibição de ressurreição:** falha se qualquer arquivo importar/referenciar os alvos deletados nas Ondas 1–3 (`component.css`, `semantic.css`, `chinese-theme`, `button-tokenized`, `ui/MetricCard`, `gerente/MetricCard`, `StatCard`, `pdvLayoutVariant`, `dragon-dark`).
2. **Ratchet de hex em TSX:** conta ocorrências de `#[0-9a-fA-F]{3,8}` em `app/**` + `components/**`; falha se contagem > baseline registrada (hoje: 41). Baseline num JSON versionado; diminuir é permitido e atualiza o número.
3. **Ratchet de tipografia arbitrária:** mesmo mecanismo para `text-\[\d+px\]` (baseline hoje: ~417).

**Por que ratchet e não proibição absoluta:** proibir de imediato quebraria o CI para qualquer PR que tocasse arquivo com débito preexistente; o ratchet bloqueia só o crescimento — mesma filosofia dos guards atuais do repo.

**Verificação:** rodar `npm run guard:all` num branch com violação proposital (teste do guard).

### Onda 5 — Ponte para 6.2 (opcional nesta fase): unificação do azul da marca

Não é remoção — entra apenas se as Ondas 1–4 fecharem sem incidente. Resumo: declarar `--brand: #2563eb` uma única vez e fazer `--accent` (`globals.css`, `theme-oriental.css`), `--jl-accent` (`theme-fix-aggressive.css`) e `--color-brand-primary` (`tokens/theme.css`) referenciarem-no. **Atenção:** `--primary: 221 83% 53%` (HSL cru consumido via `hsl(var(--primary))` no Tailwind) **não pode** referenciar um token hex — fica de fora até a migração de formato na 6.2, com comentário apontando o débito. Risco: baixo (mesmo valor final); verificação por diff visual.

---

## 2. Matriz de risco consolidada

| Onda | Risco | Impacto se falhar | Detecção | Reversão |
|---|---|---|---|---|
| 1 — arquivos mortos | Nulo (evidência: 0 refs) | Build quebra (detectado no CI/local, nunca em produção) | `npm run build` | revert trivial |
| 2 — seletores inalcançáveis | Baixo (achatamento muda especificidade) | Divergência visual sutil no gerente/admin | Screenshots baseline vs preview | revert trivial |
| 3 — dualismo do caixa | Médio (tela de faturamento; prop com efeito comportamental) | Operador impactado no PDV | e2e crítico + smoke manual no preview | revert de 1 PR |
| 4 — guard:design | Nulo em runtime | Falso-positivo bloqueia PRs | Teste do guard com violação proposital | remover script do `guard:all` |
| 5 — azul unificado | Baixo (mesmo valor) | Tom divergente em superfícies específicas | Diff visual | revert trivial |

Regra transversal: **uma onda por PR; nunca duas ondas no mesmo PR**; onda N+1 só abre depois do merge da onda N.

---

## 3. Critérios de aceite da Fase 6.1

A fase fecha quando **todos** os itens forem verificáveis:

1. **Arquivos mortos eliminados** — `styles/chinese-theme.css`, `styles/tokens/{component,semantic,migration-guide}.css`, `components/ui/{button-tokenized,MetricCard,StatCard}.tsx`, `components/gerente/MetricCard.tsx` não existem; `rg "component\.css|semantic\.css|chinese-theme|button-tokenized" pdv-importados` retorna 0 (exceto docs de auditoria).
2. **Dark aposentado de verdade** — `rg "dragon-dark" pdv-importados/styles pdv-importados/app pdv-importados/components` = 0; `rg "data-app-theme='noturno'"` = 0.
3. **Caixa com um único layout** — `rg "pdvLayoutVariant|CaixaPdvLayoutVariant|NEXT_PUBLIC_CAIXA_PDV_LAYOUT" pdv-importados` = 0; `npm run test:e2e:critical` verde; smoke de venda completa no preview aprovado.
4. **Regressões travadas** — `guard:design` integrado ao `guard:all` e ao CI, com baselines de hex (≤41) e tipografia arbitrária (≤417) versionadas; guard falha comprovadamente em branch de teste com violação.
5. **Sem regressão visual** — screenshots das 5 telas de referência comparados (baseline da Onda 0 vs final) e aprovados.
6. **CI utilizável como gate** — `secret-scan` voltou a executar (pré-condição 0.1 resolvida) ou foi formalmente marcado como não-bloqueante pelo time enquanto o problema de infra persiste.

**Resultado esperado ao final:** ~1.300+ linhas de CSS/TSX mortas removidas, zero mudança visual intencional, e o terreno limpo para a 6.2 (tokens semânticos únicos + escala tipográfica no Tailwind + consolidação de Button/Dialog).

---

## 4. Explicitamente FORA da 6.1

Para não escopo-arrastar o desmonte:

- `.dragon-glass-card` (19 usos), `.dragon-glass-backdrop`/`.dragon-elev-2` (14 usos cada) — vivos via `DragonModal`; saem só na consolidação de Dialog (P1.2 / Fase 6.2+).
- `.app-btn-*` (48 arquivos) e `.app-input`/`.app-select` — migração é P1.1, não remoção.
- `GerenteLayoutShell` e `app/gerente/**` — realocação é P2.
- Tipografia arbitrária existente e hex existentes — só o **ratchet** entra agora; a migração em massa é P2 (depende da escala Tailwind da 6.2).
- Login dark premium — exceção intencional, intocada.
