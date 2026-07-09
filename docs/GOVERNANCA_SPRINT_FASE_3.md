# Parecer de Governança Técnica — Sprint aprovada: Fase 3 (ARIA / WCAG 2.1)

**Papel:** Governança Técnica do projeto Jinlong ERP (fastproduct)
**Data:** 2026-07-08
**Sprint sob análise:** Fase 3 — Semântica ARIA e Conformidade WCAG 2.1
**Estado factual:** Fase 3.1 mergeada em `main` via PR #134 (commit `2a63d9d`, 2026-07-04). Fases 3.2–3.5 pendentes.
**Referências obrigatórias usadas:**
- Princípios de engenharia: `.cursor/rules/governance.mdc` e `.cursor/rules/security.mdc` (fonte de verdade operacional, conforme `docs/ai-guidelines/README.md`)
- Especificação/escopo funcional: `README.md`, `docs/ROADMAP.md`, `docs/BACKLOG_TECNICO.md`
- Plano da Sprint: `FASE_3_ARIA_ACCESSIBILITY_PLAN.md` e `FASE_3_PROGRESS.md`

---

## 1. Classificação das tarefas (P0–P5)

Classificação das tarefas remanescentes da Fase 3 (3.2–3.5), acrescida das correções exigidas pela auditoria da 3.1. P0 = bloqueia a Sprint; P5 = dispensável sem impacto.

### P0 — Bloqueadores da Sprint (nada da 3.2+ deve ser mergeado antes destes)

| # | Tarefa | Justificativa (evidência) |
|---|--------|---------------------------|
| P0-1 | Instalar tooling de teste de acessibilidade (axe-core/vitest-axe) e criar ao menos 1 teste automatizado passando em CI | O plano declara como critério de aceite "Testes automatizados com axe-core" e "CI/CD gate", mas **nenhum pacote do monorepo tem axe-core instalado**. Sem isso, nenhum critério de aceite da Fase 3 é verificável — os números "Level A 100% / AA 95%" do PR #134 são afirmações sem medição. |
| P0-2 | Resolver a duplicação de `FormField` | Violação direta de Single Source of Truth introduzida na 3.1: existe `pdv-importados/components/forms/FormField.tsx` (novo, **zero consumidores**) e um `FormField` local em `app/admin/configuracoes/_components/ConfiguracoesContent.tsx:482`. Decidir: adotar o componente novo no ConfiguracoesContent (e demais formulários) **ou** removê-lo. Duas implementações com o mesmo nome não podem coexistir. |
| P0-3 | Remover ou adotar `hooks/useAccessibility.ts` | Zero consumidores no repositório. Código morto mergeado em `main` é dívida imediata; `governance.mdc` exige mudanças pequenas e verificáveis — um hook sem uso não é verificável. |

### P1 — Núcleo de valor da Sprint

| # | Tarefa | Dependências |
|---|--------|--------------|
| P1-1 | `aria-live` em CaixaTotais (polite/atomic) | P0-1 (teste automatizado do anúncio) |
| P1-2 | `aria-live` no sistema de Toast/Alert (assertive para erro) | P0-1 |
| P1-3 | `ConfirmationModal` com `role="alertdialog"` sobre o DragonModal existente | Nenhuma — DragonModal já tem baseline |
| P1-4 | `aria-invalid`/`aria-describedby` nos formulários reais do fluxo de caixa | P0-2 (o wrapper canônico precisa existir antes de propagar) |

### P2 — Necessário para fechar a fase, não bloqueia PRs individuais

| # | Tarefa |
|---|--------|
| P2-1 | Navegação por teclado completa (Escape em todos os modais, setas em selects Radix) com teste E2E ou de componente |
| P2-2 | Teste manual NVDA dos fluxos login → busca → venda (checklist do plano §7) |
| P2-3 | `aria-live` em StockAlertBadge/ActivityFeed |
| P2-4 | Verificar aria-labels no contexto bilíngue (pt / 中文): labels hardcoded em português quebram a experiência de leitor de tela em 简体中文, que é requisito de produto declarado no README |

### P3 — Higiene e redução de dívida documental

| # | Tarefa |
|---|--------|
| P3-1 | Mover `FASE_3_*.md` (4 arquivos na raiz do repo) e `pdv-importados/ARIA_IMPLEMENTATION.md` para `docs/`, consolidando os 4 relatórios de progresso em 1. A convenção do monorepo (README §Estrutura) define `docs/` como pasta de documentação; 1.892 das 2.107 linhas do PR #134 são markdown, boa parte redundante entre si. |
| P3-2 | Corrigir afirmações não medidas nos documentos ("AA 95%", "0 violações") ou marcá-las como estimativas até o P0-1 existir |

### P4 — Opcional (AAA)

- Target size ampliado (2.5.5), focus visible enhanced (2.4.8), help contextual (3.3.5). Só entram se sobrar capacidade; não contam para o aceite da fase (alvo declarado é AA).

### P5 — Fora do aceite da Sprint

- Treinamento de time em padrões ARIA, fallback de tabela para charts, polish de paginação/tooltips. Registrar no `docs/BACKLOG_TECNICO.md` e não gastar Sprint com isso.

---

## 2. Dependências e ordem de execução

```
P0-1 (axe-core + gate CI)  ──┬─→ P1-1, P1-2 (aria-live testável)
P0-2 (FormField único)     ──┼─→ P1-4 (propagar em formulários)
P0-3 (useAccessibility)    ──┘
P1-3 (alertdialog)         ───→ P2-1 (teclado em modais)
P1-* completos             ───→ P2-2 (NVDA manual) ───→ P3-2 (relatório final honesto)
P3-1 (consolidar docs)      pode rodar em paralelo a qualquer momento
```

Ordem recomendada: **P0-1 → P0-2/P0-3 (mesmo PR pequeno) → P1-3 → P1-1/P1-2 → P1-4 → P2-* → P3-* → relatório final.**

---

## 3. Riscos de regressão

| Risco | Origem | Severidade | Mitigação |
|-------|--------|------------|-----------|
| Mudanças em `app/layout.tsx` e `AdminV2Shell` afetam **todas** as páginas (skip-link, landmarks) | Já mergeado na 3.1 | Média | Smoke E2E existente (`gerente.spec`, `caixa.spec`) deve rodar em todo PR da fase |
| `FilterBar` virou `<section role="search">` — seletores CSS/E2E que assumiam a tag anterior podem quebrar | 3.1 | Média | Grep por seletores dependentes antes de novos PRs que toquem FilterBar |
| `FormField` usa `React.cloneElement` para injetar props ARIA — colide com children que já definem `aria-describedby`/`id` | 3.1 / P1-4 | Média | Teste de componente cobrindo children com props ARIA pré-existentes |
| `aria-live` em CaixaTotais no fluxo de venda: re-render agressivo pode causar anúncios em rajada no leitor de tela durante bipagem rápida (contrato do pipeline de bip em `docs/CONTRATO_PIPELINE_BIP.md`) | P1-1 | Alta para operação | Debounce do anúncio; validar com o roteiro de invariantes operacionais do PDV |
| aria-labels em português fixo nas telas usadas por operadores sinófonos | 3.1 e P1-* | Média | P2-4: labels via i18n, não strings literais |
| Nenhuma mudança em `backend/` ou `pdv-local/` na fase | — | Nula | Correto: escopo restrito ao módulo `pdv-importados`, conforme `governance.mdc` |

Autenticação, sincronização e importação de dados (áreas críticas nomeadas em `governance.mdc`) **não são tocadas** pela fase — risco de regressão nesses eixos é baixo, desde que a fase continue não tocando Server Actions e middleware.

---

## 4. Violações arquiteturais identificadas (Fase 3.1, já mergeada)

1. **SSOT violado — `FormField` duplicado.** Componente novo em `components/forms/` sem nenhum consumidor, coexistindo com implementação local homônima em `ConfiguracoesContent.tsx:482`. (P0-2)
2. **Código morto em `main`** — `hooks/useAccessibility.ts` sem consumidores. (P0-3)
3. **Critério de aceite sem instrumentação** — a fase declara gate axe-core/CI; o tooling não existe em nenhum `package.json`. Conformidade declarada ("AA 95%") sem medição. (P0-1)
4. **Drift documental** — 4 documentos `FASE_3_*.md` na raiz do repo em vez de `docs/`, com sobreposição de conteúdo entre si e afirmações de status divergentes. A raiz do repositório já acumula relatórios de sessões anteriores (`AUTONOMOUS_LOG.md`, auditorias, patch solto `_stash-clone-aninhado-21-05.patch`) — a fase agravou um padrão existente. (P3-1)

Nenhuma violação de segurança: sem segredos hardcoded, sem mudanças em RLS/Edge, `security.mdc` respeitado.

---

## 5. Aderência aos princípios de engenharia

| Princípio (`governance.mdc`) | Aderência | Observação |
|------------------------------|-----------|------------|
| Limitar mudanças ao módulo solicitado | ✅ | Só `pdv-importados` foi tocado |
| Compatibilidade `pdv-importados` ↔ `pdv-local` | ✅ | Sem impacto no sync/offline |
| Mudanças pequenas, verificáveis, baixo acoplamento | ⚠️ | Pequenas e de baixo acoplamento, sim; **verificáveis, não** — sem teste automatizado de acessibilidade |
| Não refatorar áreas não solicitadas; sinalizar dívida separadamente | ⚠️ | FormField/useAccessibility criados "para o futuro" sem adoção — dívida criada, não sinalizada em `BACKLOG_TECNICO.md` |
| Ao concluir, informar riscos/impactos | ⚠️ | Relatórios existem, mas superestimam conformidade |

---

## 6. Checklist objetivo de aceite por tarefa

**P0-1 (axe-core + gate):**
- [ ] Dependência dev instalada apenas em `pdv-importados`
- [ ] ≥1 teste `*.test.tsx` executando axe contra um componente da 3.1 e passando
- [ ] Teste roda em `npm run test` na raiz (integra ao `npm run ci` sem job novo)
- [ ] Falha do axe = falha do CI (sem `skip`/`warn`)

**P0-2 (FormField único):**
- [ ] Existe exatamente 1 implementação exportada de `FormField` no workspace web
- [ ] `ConfiguracoesContent` consome a implementação canônica ou a local é renomeada/absorvida
- [ ] `grep -rn "function FormField\|const FormField"` retorna 1 definição
- [ ] Teste de componente cobrindo label + erro + hint + children com props ARIA próprias

**P0-3 (useAccessibility):**
- [ ] Hook tem ≥1 consumidor real ou o arquivo é removido

**P1-1/P1-2 (aria-live):**
- [ ] `role="status"`/`aria-live` presentes e testados via axe/testing-library
- [ ] Anúncio de totais com debounce validado contra bipagem sequencial rápida
- [ ] Erros usam `assertive`; atualizações de rotina usam `polite`

**P1-3 (ConfirmationModal):**
- [ ] `role="alertdialog"`, focus trap e restauração de foco testados
- [ ] Reutiliza DragonModal — não cria segundo sistema de modal

**P1-4 (formulários):**
- [ ] Formulários do fluxo de caixa usam o FormField canônico
- [ ] `aria-invalid` reflete estado real de validação; mensagem ligada por `aria-describedby`

**P2-4 (i18n):**
- [ ] Nenhum `aria-label` com string literal pt em componente compartilhado; labels vêm do mecanismo i18n existente

**P3-1 (docs):**
- [ ] Zero arquivos `FASE_3_*.md` na raiz; 1 documento consolidado em `docs/`
- [ ] Links atualizados

---

## 7. O que deve bloquear um PR (gate objetivo)

Um PR da Fase 3.2+ **não pode ser mergeado** se:

1. `npm run ci` (check + lint + test + build Next) falhar — gate existente, inegociável.
2. Introduzir componente, hook ou utilitário **sem consumidor no mesmo PR** (lição direta da 3.1).
3. Criar segunda implementação de algo que já existe (FormField, modal, badge) em vez de estender a canônica — violação de SSOT.
4. Declarar conformidade WCAG no texto do PR **sem teste automatizado correspondente** no diff.
5. Tocar `backend/`, `pdv-local/`, middleware, Server Actions ou RLS — fora do escopo aprovado da fase; exige aprovação separada.
6. Adicionar `.md` de status/relatório na raiz do repositório (usar `docs/`).
7. Hardcodar string de UI/aria-label fora do i18n em componente compartilhado.
8. Remover código/comportamento sem confirmação explícita (`governance.mdc`).

---

## 8. Parecer final

**Itens aprovados:**
- Escopo da Fase 3 como definido no plano (ARIA/WCAG AA, módulo web apenas) — coerente com o roadmap e sem ampliação de escopo.
- Fase 3.1 mergeada: as anotações ARIA em Button, DataTable, FilterBar, SidebarNav, badges, AdminV2Shell e o skip-link são mudanças de baixo risco e direção correta.
- Isolamento de módulo respeitado; nenhuma violação de segurança.

**Itens pendentes (condicionantes):**
- P0-1, P0-2, P0-3 antes de qualquer novo merge da fase.
- P1-1…P1-4 constituem o corpo da Sprint 3.2.
- P2-4 (i18n de aria-labels) precisa entrar no plano — está ausente dele e é requisito de produto (interface pt + 简体中文).

**Riscos:** anúncios `aria-live` em conflito com a cadência de bipagem do caixa (alta relevância operacional); `cloneElement` do FormField; seletores dependentes do markup alterado do FilterBar.

**Dívida técnica:** componente e hook sem adoção em `main`; conformidade declarada sem instrumentação; 4 relatórios sobrepostos na raiz do repo somando ~1.000 linhas; dívida pré-existente de raiz poluída agravada.

**Recomendação: APROVAR COM RESSALVAS.**
A Fase 3 permanece aprovada e a 3.1 não precisa ser revertida. Porém, a Sprint 3.2 só deve iniciar entregas funcionais após os três P0 — sem o gate axe-core, a fase inteira não tem critério de aceite mensurável, e sem a unificação do FormField ela propaga uma violação de SSOT para todos os formulários que tocar.
