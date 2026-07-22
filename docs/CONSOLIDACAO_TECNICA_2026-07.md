# Consolidação Técnica do Repositório FastProduct

> **Data:** 2026-07-22 · **Escopo:** `nocodenn-cell/fastproduct` · **Branch de referência:** `main` @ `8deb540`
> **Natureza:** relatório de governança e auditoria. **Nenhuma alteração de código de produto foi feita** nesta entrega — apenas este documento. As remoções de branches, fechamentos de PR e limpezas descritas são **recomendações** a executar com aprovação, em lotes.

---

## 0. Sumário executivo (leia isto primeiro)

O repositório está **funcionalmente saudável na `main`**, mas **sofre de poluição severa de backlog**: acúmulo de branches e PRs abandonados de múltiplas sessões de IA (Claude, Cursor, Devin, Loop, v0, Vercel), documentação duplicada e artefatos de trabalho versionados.

**Números reais (verificados nesta auditoria):**

| Métrica | Valor | Observação |
|---|---|---|
| PRs **abertas** | **59** | O "220+" citado no briefing refere-se a **branches**, não a PRs |
| **Branches** no remoto | **~226** | ~167 branches **órfãs** (sem PR aberta) |
| Migrations | 216 | numeração dual (sequencial + timestamp) |
| Arquivos markdown | **143** | 23 na raiz + 120 em `docs/` — sprawl documental |

**Conclusão central:** a `main` está **substancialmente à frente** da grande maioria das PRs abertas. As PRs foram criadas por sessões paralelas (majoritariamente junho/2026) e o núcleo que elas propunham **já foi consolidado na `main` por outro caminho**. Portanto, **a `main` já é a fonte da verdade** — o problema não é decidir "o que é verdade", e sim **fechar o ruído** que finge competir com ela.

**Evidências de que a `main` está à frente:**
- Caixa já chama `finalizar_venda_transacional_canonica_v4` e o arquivo está **congelado** como caller único (`app/caixa/server/caixaVendas.impl.ts:3`). → PRs que "migram para v4" (#99, #174) ou "consolidam para v3" (#139) são **obsoletas/erradas**.
- `StatusPublicacao` já unificado em `@/core/ports/produto`. → PR #162 já está feita.
- Comissões já implementadas (migrations `103`, `214`, `215`, `260`, `261`). → PR #159 obsoleta.
- Cadastro rápido de produtos, bulk import, caixa keyboard-first e etiquetas já **mergeados** (`main` commits #194, #196, #193, #190). → cluster de PRs de produtos e caixa em grande parte superado.

**Nível de risco da consolidação:** **Baixo**, se seguirmos a ordem do §6. O maior risco não é técnico (fechar PR/branch é reversível via Git), e sim **social/informacional**: fechar uma PR que ainda continha um commit útil não extraído. Por isso a categoria **B (cherry-pick)** existe e é tratada com cuidado.

---

## 1. Estado geral do repositório

### 1.1 Avaliação técnica

O que está **saudável e é a arquitetura consolidada a preservar** (confirmado em código + `docs/GOVERNANCA_PMO_JINLONG.md`):

- **PDV / Caixa** — pipeline de bip serial (`useCaixaScanPipeline`), finalização transacional idempotente **v4** (caller congelado), split de pagamento, sangria/suprimento, fechamento cego atômico.
- **ERP** — produtos, estoque atômico anti-oversell, kardex imutável, compras/recebimento, financeiro (contas a pagar/receber, comissões), fiscal (fila + worker Focus em modo mock).
- **Supabase** — 216 migrations, Edge Functions (`sync-outbox`, `validar-gerente`, `fiscal-worker`), RLS por loja, anti-replay HMAC.
- **Pricing Engine** — `calcular_preco_produto` como autoridade única (`SECURITY DEFINER`), revalidação no commit da venda, guard de imports proibindo recálculo no front.
- **Authority / RPCs canônicas** — hardening de `search_path`, revokes anon/public.
- **CI/CD** — lint + typecheck + unit + build + deploy Vercel + secret-scan.
- **Design System vigente** — o sistema `jl-*` já na `main` (`styles/ds/jl-bridge.css`, `components/ui/` com `DragonModal`, `DataTable`, `FilterBar` etc.). **É este que se preserva** — não os temas "Bling/Classic" das PRs.

### 1.2 Principais problemas

| # | Problema | Severidade |
|---|---|---|
| P1 | **~167 branches órfãs** (backup/*, autonomous/*, checkpoint/*, claude/random-name, cursor/dup, v0/*, vercel/*) poluindo o remoto | Alta (governança) |
| P2 | **59 PRs abertas**, a maioria stale/obsoleta, escondendo as poucas que agregam valor | Alta (governança) |
| P3 | **Sprawl documental**: 143 arquivos `.md`; múltiplos ROADMAPs, 4 `CURSOR_PROMPT_*`, dezenas de auditorias/planos de fases já executadas | Média |
| P4 | **Artefatos de trabalho versionados** na raiz (`_stash-*.patch`, `relatorio-risco-*.txt`, `backup.sh`, `claude.ps1`, `dev.bat`, `Jinlong/`, `jinlong layout 20-05/`) | Média |
| P5 | **Drift de migrations prod × repo** (numeração dual, sem gate `db diff` no CI) — herdado, documentado em `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` | Alta (técnica) |
| P6 | **Diretórios fantasma**: `supabase/` na raiz (só `.branches/`), `pages/` (só exemplos Sentry), competindo com `backend/supabase` e o App Router | Baixa |
| P7 | **`shared/` (149 imports) × `shared-core/` (7 imports)** — dois pacotes compartilhados; ADR-005 aponta `shared-core` como canônico, mas a migração está incompleta | Média (técnica) |

### 1.3 Nível de risco global

**Médio-baixo.** O código de produção na `main` é sólido e está protegido por CI e por "freezes" explícitos no núcleo transacional. Os riscos abertos (P5 drift de migrations, P7 duplicação shared) são **dívida técnica conhecida e já documentada**, não regressões novas. A consolidação em si é de baixo risco porque o Git preserva o histórico de tudo que for fechado/apagado.

---

## 2. Inventário das Pull Requests (59 abertas)

Categorias: **A** Merge · **B** Cherry-pick · **C** Obsoleta · **D** Experimental · **E** Duplicada · **F** Só documentação · **G** Arquivar.

> ⚠️ Toda PR marcada **A** deve passar por **validação rápida contra a `main` atual antes do merge** (rebase + `npm run ci`). "Aberta" não é sinônimo de "válida".

### 2.1 Núcleo Caixa / Venda / Finalização

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#99** | migrar caixa para v4 + hardening | **C** | `main` **já usa v4** e o caller está congelado. O hardening (migration 237) já está aplicado. Obsoleta. |
| **#139** | consolidar finalização para v3 (backup/local-rescue) | **C** | **Ativamente errada** — `main` está em v4; voltar a v3 é regressão. Fechar. |
| **#174** | loop/3 Golden Flow v4 single overload + contas_receber | **E/C** | Mesma intenção já realizada na `main`. Verificar se o teste `contas_receber` agrega algo antes de fechar; senão duplicada. |
| **#173** | loop/2 pricing version RPC + finalize audit | **B** | Cherry-pick apenas o que não estiver na `main` (auditoria de finalização). |
| **#187** | cursor: scope canonical sale finalization RPC | **B** | Verificar se o "scope" já foi aplicado; se sim → C. Caso contrário cherry-pick o fix. |
| **#175** | loop/4 Golden Flow smoke evidence | **A** | Testes aditivos de smoke — baixo risco, reforçam regressão. Validar e mergear. |
| **#177** | loop/7 e2e caixa ops (parallel) | **A** | E2E de fluxos de caixa — governança pede mais E2E mutadores. Aditivo. |
| **#178** | loop/8 e2e parcial+cliente + erro gaveta | **A** | Idem — testes aditivos valiosos. |

### 2.2 Cadastro de Produtos (cluster sobreposto)

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#80** | fix separador de milhar no parsing monetário | **A** | Bug real e isolado (`parseMoney` centralizado, 10 testes). Validar se `main` já corrigiu; se não → merge. |
| **#201** | cursor: remover produto quando estoque inicial falha | **A** | Bug fix pontual. Validar contra `fix/estoque-inicial-cadastro-produto`. |
| **#84** | reorganizar modais de cadastro em 3 blocos | **C/E** | Superado por "Onda 1 cadastro rápido" (#194, já na `main`). |
| **#148** | fix fluxos incompletos + consistência visual | **B** | Cherry-pick fixes ainda não na `main`; resto superado. |
| **#149** | feature/cadastro-produto-ux | **E** | Duplicata temática de #148/#155/#194. Consolidar em uma só. |
| **#155** | histórico com drill-down + ferramentas do PDV | **B** | Cherry-pick o drill-down se ainda não existir; validar. |
| **#197** | atalho "n" duplo-modal + remoção de código morto | **B** | Cherry-pick a **remoção de código morto** e o fix do atalho. |
| **#135** | FASE 1+2B consolidação arquitetural (produtos) | **C** | Grande, antiga, superada pela evolução da `main`. |

### 2.3 Design System / UI / Tema (cluster de temas concorrentes)

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#111** | admin UI DataTable / experiência visual | **C** | `DataTable` já existe em `components/ui`. Superada. |
| **#112** | Design System Clássico (fundação) | **C** | Tema concorrente; `main` adotou o DS `jl-*`. Fechar. |
| **#113** | separação baseline/validator/CI camada visual | **D** | Spike de arquitetura visual, não adotado. Fechar. |
| **#115** | Tema Clássico + AdminThemeScope | **C** | Concorrente ao DS vigente. Fechar. |
| **#117** | Classic theme token contract v1.0 | **C** | Idem. Fechar. |
| **#120** | congelar contrato de tema/token (Fase 1) | **F/C** | Conteúdo útil já refletido em `docs/architecture/DESIGN_SYSTEM_CONTRACT.md`. Consolidar e fechar. |
| **#125** | redesign PDV clean/branco | **D** | Redesign concorrente ao caixa vigente (Onda 5). Fechar. |
| **#92** | freeze visual invariance para demo | **D** | Freeze temporário de demo; sem valor permanente. Fechar. |
| **#203** | onda-5 lote-1 Button (design tokens) | **B** | Migração DS **ativa e legítima**. Sequenciar (ver §3). |
| **#207** | onda-5 etapa-2 Busca | **B** | Migração DS ativa. Depende de #203. |
| **#208** | onda-5 etapa-3 Carrinho | **B** | Migração DS ativa. Depende de #207. |
| **#209** | onda-5 etapa-4 Resumo financeiro | **B** | Migração DS ativa. Depende de #208. |

### 2.4 Auditorias, Arquitetura e Documentação

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#91** | docs auditoria fonte única preço/PDV/estoque | **F** | Read-only. Extrair achados úteis para `docs/`, fechar. |
| **#121** | docs plano-mestre 4 pilares | **F** | Documentação; consolidar sem duplicar. |
| **#122** | docs Arquitetura de Domínio Fase 2 | **F** | Provável origem dos ADR-005..010 (já em `docs/adr/`). Fechar. |
| **#126** | docs Architecture Review + mapeamento real×spec | **F** | Documentação de auditoria. Consolidar/fechar. |
| **#130** | R0 ADR-PDV-001 aceito + matriz offline | **F** | ADR já existe como "Proposto" em `main`. Se for aprovar o ADR, extrair; senão fechar. |
| **#179** | docs ADR saldo_atual vs sistema (gaveta) | **F** | ADR pequeno; consolidar em `docs/adr/`, fechar. |
| **#188** | Matriz Canônica do Preço + remoção de scaffold morto | **B/F** | Cherry-pick a **remoção de código morto**; consolidar a matriz na doc de pricing. |
| **#198** | docs auditoria de ambientes de produção | **F** | Documentação. Consolidar/fechar. |
| **#150** | auditoria UX/DS + quick wins (Clientes, Etiquetas) | **B** | Cherry-pick os "quick wins" que ainda fazem sentido; resto é auditoria. |
| **#126/#129** | pdv-phase-6-7-roadmap (depende de #128) | **F** | Documentação dependente de spike experimental. Fechar com #128. |

### 2.5 PDV Phases / Rebuild (experimentais)

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#128** | pdv fases 0-5 State Machine / PDVViewState | **D** | Spike de refatoração ampla do PDV, não adotado pela `main`. Fechar. |
| **#129** | correção auditoria Fase 6/7 (sobre #128) | **D/F** | Depende de #128 (experimental). Fechar junto. |
| **#189** | jinlong rebuild "clean slate" Fase 1 | **D** | Reconstrução do zero — alto risco, superada. Fechar. |

### 2.6 Segurança / Observabilidade / Infra / CI

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#98** | Error Router único + fix build Vercel | **A** | Fix de build + dedup de observabilidade, sem breaking changes. Validar se o build ainda quebra; se sim → merge. |
| **#131** | Fase 1 Tenant-only RLS | **B/A** | Segurança relevante (governança P1). Validar policies contra `main`; cherry-pick o que faltar. |
| **#127** | authority-guard: contenção de escrita | **B** | Não localizado com esse nome em `main` — verificar se foi mergeado sob outro nome; se não, cherry-pick. |
| **#124** | configurar Sentry no pdv-importados | **C** | Sentry **já configurado** na `main` (`sentry.*.config.js`, `instrumentation*.js`). Obsoleta. |
| **#162** | Unify StatusPublicacao type | **C** | **Já unificado** em `@/core/ports/produto`. Fechar. |
| **#166** | fix PreviewKit Docker build (porta 3000) | **D** | Tooling/spike, sem relação com produto. Fechar. |
| **#133** | acessibilidade contraste WCAG + teclado/foco | **A** | Governança pede Fase 3.2 de acessibilidade. Aditivo, baixo risco. Validar e mergear. |

### 2.7 Go-Live / Auditorias operacionais / Comissões

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#152** | corrige gaps PDV × Gerente P0/P1/P3 | **B** | Cherry-pick os P0/P1 ainda válidos; validar contra `main`. |
| **#158** | resolver bloqueadores #1 e #2 prontidão | **B** | Cherry-pick fixes ainda não aplicados. |
| **#165** | go-live: auditorias PDV + limpeza banner lead time | **B** | Cherry-pick a **limpeza do banner**; auditorias viram doc/fecham. |
| **#159** | Employee Commission System | **C** | Comissões **já na `main`** (103/214/215/260/261). Obsoleta. |
| **#199** | Fase 5 (Vendas/PDV) auditoria + entregas 1,3,4,5 | **B** | Cherry-pick as entregas que ainda faltam; auditoria fecha. |
| **#162** | (Unify StatusPublicacao) | **C** | (ver §2.6) |
| **#205** | feat/admin-screen-consolidation | **B** | Governança pede consolidação `/admin`×`/gerente` (P2). Validar e cherry-pick incrementalmente. |
| **#104** | "Claude/keen cray" (corpo vazio) | **C** | PR sem descrição/escopo. Fechar. |

### 2.8 Backups / Snapshots locais

| PR | Título (resumo) | Cat. | Justificativa |
|---|---|---|---|
| **#137** | backup/local chore sentry instrumentation | **G** | Snapshot de trabalho local. Arquivar (fechar). |
| **#138** | backup/local chore lint cleanup | **G** | Snapshot. Fechar. |
| **#140** | backup/local refactor chart semantic system | **G** | Snapshot. Fechar. |
| **#139** | backup/local rescue → v3 | **C** | (ver §2.1 — regressão) |

### 2.9 Distribuição

| Categoria | Qtd (aprox.) | PRs |
|---|---|---|
| **A** Merge (validar→mergear) | 6 | #80, #98, #133, #175, #177, #178, #201 |
| **B** Cherry-pick | 17 | #127, #131, #148, #150, #152, #155, #158, #165, #173, #187, #188, #197, #199, #203, #205, #207, #208, #209 |
| **C** Obsoleta | 12 | #84, #99, #104, #111, #112, #115, #117, #124, #135, #139, #159, #162 |
| **D** Experimental | 7 | #92, #113, #125, #128, #129, #166, #189 |
| **E** Duplicada | 2 | #149, #174 |
| **F** Só documentação | 9 | #91, #120, #121, #122, #126, #130, #179, #198 |
| **G** Arquivar | 3 | #137, #138, #140 |

> Alguns PRs aparecem em duas letras (ex.: B/F) — a ação primária recomendada define a coluna acima.

---

## 3. Ordem ideal de integração

**Princípio:** integrar em ondas pequenas, cada uma verde no CI, do mais isolado/aditivo para o mais estrutural. Rebase em `main` e `npm run ci` antes de cada merge.

**Onda 0 — Higiene (sem código de produto):** aplicar §5 (fechar C/D/E/G, apagar branches órfãs, remover artefatos). Reduz o ruído para enxergar o que resta.

**Onda 1 — Aditivos de baixo risco (categoria A):** testes e fixes isolados, sem dependências entre si.
1. #175, #177, #178 (E2E/smoke de caixa)
2. #80 (parsing monetário), #201 (estoque inicial), #98 (Error Router/build), #133 (acessibilidade)

**Onda 2 — Segurança (cherry-pick):**
3. #131 (Tenant-only RLS) → depois #127 (authority-guard), se não estiver na `main`.

**Onda 3 — Cherry-picks operacionais:** extrair commits úteis, um PR novo enxuto por tema:
4. #188 (remoção de scaffold morto) + #197 (código morto produtos) — **limpeza primeiro**
5. #148/#155/#150 consolidados em **um** PR de produtos/UX
6. #152/#158/#165/#199 consolidados em **um** PR de correções go-live

**Onda 4 — Migração Design System (Onda 5, sequencial e dependente):**
7. #203 (Button) → #207 (Busca) → #208 (Carrinho) → #209 (Resumo financeiro).
   Estritamente nesta ordem — cada etapa assume a anterior.

**Onda 5 — Consolidação estrutural:**
8. #205 (`/admin`×`/gerente`) incremental, por rota, ao final.

**Descartar (não integrar):** todas as C, D, E e G do §2. As F viram, no máximo, um único PR de consolidação de documentação (§5.4) — não múltiplos merges.

---

## 4. Plano de limpeza

### 4.1 PRs para fechar (com comentário curto de justificativa)

- **Obsoletas (C):** #84, #99, #104, #111, #112, #115, #117, #124, #135, #139, #159, #162
- **Experimentais (D):** #92, #113, #125, #128, #129, #166, #189
- **Duplicadas (E):** #149, #174
- **Arquivar (G):** #137, #138, #140

Total imediato a fechar: **~24 PRs**. As **F** (9) fecham após extrair conteúdo para a doc consolidada. As **A/B** permanecem abertas até serem processadas nas ondas.

### 4.2 Branches para apagar (~167 órfãs)

Regra objetiva: **apagar toda branch remota que não seja `main` e não seja head de uma PR aberta**, por prefixo:

| Prefixo | Ação | Exemplos |
|---|---|---|
| `backup/*` | **Apagar todas** (11) | `backup/local-*`, `backup/stable-20260621`, `backup/remove-zhHK-*` |
| `autonomous/*`, `feat/autonomous-*` | Apagar | `autonomous/nightly-20260418` |
| `checkpoint/*`, `consolidate/*`, `merge/*`, `staging/*` | Apagar | `checkpoint/wip-missao3-*`, `merge/consolidacao` |
| `release/*` | Apagar (tags preservam releases) | `release/admin-auth-stable-v1` |
| `v0/*`, `vercel/*` | Apagar (scaffolds de ferramenta) | `v0/design-application-*`, `vercel/install-*` |
| `chore/*`, `hotfix/*` | Apagar se PR fechada/inexistente | `chore/lockfile-update`, `hotfix/chart-imports` |
| `cursor/bugs-cr-ticos-recentes-*` | Apagar duplicatas (≥11 cópias); manter só a da PR aberta | manter head de #187/#201; apagar resto |
| `claude/<nome-aleatório>` | Apagar as **sem PR aberta** (~70+) | `claude/admiring-babbage-*`, `claude/zen-dirac-*`, etc. |
| `loop/*`, `onda-*`, `feature/*`, `fix/*`, `perf/*` | Apagar as **sem PR aberta** | manter apenas heads de PRs abertas |
| `premium-ui`, `feature/zinc-redesign` | Apagar (redesigns abandonados) | — |

**Preservar:** `main` e os ~40 heads de PRs abertas (até a PR ser resolvida). Nenhuma branch protegida existe além de nada — recomenda-se **proteger `main`** (ver §6).

### 4.3 Arquivos/artefatos para remover da `main`

Confirmados como rastreados e sem uso em produção:

- `_stash-clone-aninhado-21-05.patch` (patch de stash versionado, 44 KB)
- `relatorio-risco-20260416-121531.txt` (relatório datado; conteúdo já em `docs/GOVERNANCA_PMO_JINLONG.md` §7)
- `backup.sh`, `claude.ps1`, `dev.bat` — scripts de conveniência local (mover para `dev-tools/` ou remover)
- `.vercel-rebuild-trigger` (arquivo vazio de gambiarra de rebuild)
- `supabase/` na raiz — contém apenas `.branches/_current_branch` (artefato de CLI); o backend real é `backend/supabase/`
- `pages/` na raiz — apenas exemplos do Sentry (`sentry-example-*`); o app usa App Router. Remover se não referenciado.
- `jinlong layout 20-05/` — kit de protótipo visual (HTML/CSS/SVG/`findings.jsx`) com espaços no nome; superado pelo DS `jl-*`. Arquivar/remover.
- `Jinlong/` — 24 arquivos de notas de projeto (dashboards, changelogs, decisões) **duplicando** `docs/`. Consolidar o que for canônico em `docs/` e remover o resto.

> **Não remover sem verificação de import:** `pages/` e `supabase/` — rodar `grep`/build antes. Tudo é reversível via Git de qualquer forma.

### 4.4 Documentos para consolidar (143 → alvo ~50)

**Fonte única por tema.** Duplicações concretas identificadas:

- **Prompts Cursor:** manter só `docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md`; remover `_V2`, `_V3`, `_SESSAO_COMPLETA`.
- **Roadmaps:** existem `docs/ROADMAP.md`, `docs/PROJECT_ROADMAP.md`, `docs/ROADMAP_PRIMEIRO_CLIENTE.md`, `docs/ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md`, `docs/roadmap/missao5_*`, e `ROADMAP` na raiz. **Eleger um** ROADMAP canônico; os demais viram seções ou são arquivados.
- **Go-Live:** `docs/architecture/GO_LIVE_*` (6 arquivos) + `GO_LIVE_READINESS_REPORT.md` (raiz) + `docs/PRODUCAO_GO_NO_GO.md` + checklists. Consolidar num índice único de go-live.
- **Auditorias já executadas** (raiz): `AUDITORIA_DRIFT_*`, `AUDITORIA_PAINEL_ADMIN.md`, `CONCLUSOES_AUDITORIA_FINAL.md`, `UX_AUDIT.md`, `FASE_3_*` (4 arquivos), `FASE_6_*` (3 arquivos), `RELATORIO_FASE1_*`, `CORRECOES_ESTABILIZACAO.md`, `AUTONOMOUS_LOG.md`, `AUTONOMOUS_NIGHTLY_LOG.md`, `GO_LIVE_READINESS_REPORT.md`, `ADMIN_PANEL_GUIDE.md` (desatualizado — cita rotas inexistentes), `ARQUITETURA_CHECKLIST_NOVAS_COLUNAS.md`, `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`, `deploy.md`, `hardening.md`, `monitoramento.md`.
  → **Mover as vigentes para `docs/`, arquivar as históricas** (planos de fases já concluídas). A **raiz não deve conter documentação de trabalho** — só `README.md`.
- **`docs/architecture/` (43 arquivos)** — muitos são inventários "100_audit" e "inventario_*" de missões concluídas. Marcar os concluídos como histórico (subpasta `docs/_archive/`).

### 4.5 Código morto identificado (para remoção via cherry-pick de PRs existentes)

- **Scaffold morto de pricing** — removido em #188; aplicar essa remoção.
- **`quantidade_gatilho_atacado` na UI** — nunca lido pela RPC `calcular_preco_produto` (removido em #84/#197 na UI).
- **`semantic.css` deprecated** — ainda no repo (governança §7).
- **Overloads legados `finalizar_venda` v2/v3** — presentes no schema/tipos (`database.types.ts`), bloqueados por stubs. Manter bloqueados; documentar como dívida a limpar num baseline de migrations.

---

## 5. Riscos da consolidação e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Fechar PR **B** sem extrair o commit útil | Perda de trabalho válido | Antes de fechar qualquer B, abrir o diff, extrair o(s) commit(s) num PR novo enxuto. Nunca fechar B "no atacado". |
| Mergear PR **A** stale que conflita com a `main` | Regressão/quebra de build | Regra fixa: rebase + `npm run ci` verde **antes** de todo merge. |
| Apagar branch que ainda era head de PR aberta | PR fica "sem código" | Script de limpeza deve **excluir** heads de PRs abertas (cruzar lista do §2). |
| Reaplicar migração já em produção (drift P5) | Deploy não-determinístico | **Não** tocar migrations nesta consolidação. Tratar o drift na Sprint dedicada (`AUDITORIA_DRIFT` Fases A–D) com `supabase db diff`. |
| Migração DS (Onda 5, #203→#209) fora de ordem | UI quebrada no caixa | Integrar estritamente na sequência; cada etapa com screenshot/validação. |
| Remover `pages/` ou `supabase/` raiz sendo referenciados | Build quebra | `grep` de imports + build local antes de remover. |
| Fechamento em massa gera ruído/notificações | Reação de stakeholders | Executar em lotes rotulados, com comentário-padrão explicando a consolidação e linkando este documento. |

**Rede de segurança:** tudo que for fechado/apagado permanece recuperável via `git reflog`/refs do GitHub por tempo suficiente. A recomendação de **criar uma tag `pre-consolidacao-2026-07` em `main`** dá um ponto de retorno explícito antes de começar.

---

## 6. Plano final — `main` como fonte única da verdade

**Objetivo:** backlog limpo, governança simples, dívida técnica baixa. Sequência sugerida:

**Passo 1 — Congelar e marcar (dia 0).**
- Proteger `main` (require PR + CI verde + 1 review). Hoje `main` não é protegida.
- Criar tag `pre-consolidacao-2026-07`.
- Publicar este documento (é o registro da decisão).

**Passo 2 — Higiene de backlog (dia 0–1, reversível).**
- Fechar as ~24 PRs C/D/E/G com comentário-padrão.
- Apagar as ~167 branches órfãs por prefixo (excluindo heads de PRs abertas).
- Remover artefatos da raiz (§4.3) num único PR "chore: higiene de raiz".

**Passo 3 — Consolidação documental (dia 1–2).**
- Um PR "docs: fonte única" que: elege ROADMAP/Go-Live canônicos, move docs de trabalho da raiz para `docs/`, cria `docs/_archive/` para históricos, extrai o conteúdo útil das PRs F e as fecha.

**Passo 4 — Integração de valor (dia 2+).**
- Executar as Ondas 1→4 do §3 (A e B), cada PR rebaseado e verde.
- Onda 5 (#205 consolidação `/admin`×`/gerente`) por último, incremental.

**Passo 5 — Governança contínua (permanente).**
- **Regra "1 branch = 1 PR = 1 propósito"**; sessões de IA criam PR ou nada.
- **Auto-delete de branch no merge** (config do GitHub).
- **PRs sem atividade > N dias** entram em triagem quinzenal (fecha ou avança).
- **Sprint dedicada ao drift de migrations (P5)** com gate `supabase db diff` no CI — a raiz do grafo de dependências técnicas (ver `GOVERNANCA_PMO_JINLONG.md` §4).
- **Concluir a migração `shared/` → `shared-core/`** (ADR-005) para eliminar o pacote duplicado (P7).

**Definição de "pronto":** `main` protegida; ≤ ~15 PRs abertas (todas com dono e propósito claros); backlog de branches só com trabalho ativo; raiz do repo só com `README.md` + configs; documentação com fonte única por tema; CI com gate de schema.

---

### Fontes desta auditoria
Verificação direta em código na `main` (`caixaVendas.impl.ts`, `database.types.ts`, `core/ports/produto`, `components/ui`, migrations, `styles/ds`), listagem de 59 PRs e ~226 branches via API do GitHub, e os documentos canônicos `README.md`, `docs/GOVERNANCA_PMO_JINLONG.md`, `docs/PLANO_EXECUTIVO_EXECUCAO_JINLONG.md`, `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`, ADRs `docs/adr/`.
