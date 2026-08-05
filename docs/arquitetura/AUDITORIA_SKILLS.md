# Auditoria de Skills, Rules e Prompts — Jinlong ERP / fastproduct

> 📎 **Diagnóstico — não é fila de execução.** Ver `AI_CONSTITUTION.md` para o status do bloco.
>
> ✅ **Conflitos verificados independentemente em 2026-08-05** e confirmados:
> `C-02` (escalas `P0–P4` × `P1–P6` — `engineering-loop/SKILL.md:73-79`) ·
> `C-03` (`C:\Naturecode\fastproduct` — `production-debugger.md:12`) ·
> `C-04` (stack divergente — `pdv-importados/.cursorrules:20`) ·
> `C-06` (escopo MVP obsoleto — `pdv-importados/.cursorrules:72`).
>
> ⚠️ **Correções ao próprio diagnóstico:**
> - **C-04 — a resposta certa não está em nenhum dos dois documentos.** O manifesto diz
>   **Next `^15.5.15` + React `19.2.5`**. Ou seja: `.cursorrules` erra o Next (16) e
>   `ARCHITECTURE.md` erra o React (18+). A verdade é o `package.json` (Art. 15).
> - **C-01 está subdimensionado.** A auditoria rodou `git status` (mostra *untracked*) mas não
>   `git check-ignore` (mostra *ignorado por regra*). São diagnósticos diferentes: untracked é
>   esquecimento, ignorado é decisão deliberada. `.agents/` e `skills-lock.json` estão
>   **ignorados**, não apenas não versionados. Ver `AUDITORIA_CONSTITUICAO_R2.md` `A-01`/`A-03`.
> - **C-01 resolvido em 2026-08-05:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md` e todo o conjunto
>   normativo foram versionados e indexados em `docs/INDEX.md`.

> **Natureza:** documento de diagnóstico. **Nenhum arquivo existente foi alterado nesta auditoria.**
> **Data:** 2026-08-05 · **Escopo:** camada de instrução consumida por agentes de IA no monorepo
> **Método:** leitura direta dos arquivos + `git log` por arquivo + `git status` + `skills-lock.json`
> **Entregáveis irmãos:** `MAPA_HIERARQUIA_SKILLS.md` · `MATRIZ_AUTORIDADE_SKILLS.md` · `PLANO_CONSOLIDACAO_SKILLS.md`

---

## 0. Resposta executiva aos critérios de sucesso

| Pergunta | Resposta | Evidência |
|---|---|---|
| Existem skills sobrepostos? | **Sim** — 4 sobreposições, 1 Crítica | §2 |
| Existem regras contraditórias? | **Sim** — 8 conflitos, 3 Críticos | §4 |
| Existe duplicação de responsabilidade? | **Sim** — stack, prioridade e migrations descritas em 3+ lugares | §2, §4 |
| Existe violação do Single Source of Truth? | **Sim** — a própria fonte normativa (`ARQUITETURA_REGRAS_NEGOCIO.md`) está **fora do git** | §4 C-01 |
| Existe acoplamento excessivo? | **Sim** — caminho absoluto errado, IDs de projeto e nomes de arquivo hardcoded | §6 |
| Qual skill é autoridade de cada domínio? | Ver `MATRIZ_AUTORIDADE_SKILLS.md` | — |
| O que remover/fundir/simplificar? | 4 remoções, 3 fusões, 2 criações | `PLANO_CONSOLIDACAO_SKILLS.md` |

**Diagnóstico em uma frase:** o projeto não sofre de falta de instrução — sofre de **excesso de instruções não hierarquizadas**, espalhadas por 4 diretórios de descoberta diferentes, sem nenhum arquivo declarando quem vence em caso de conflito.

---

## 1. Inventário

### 1.1 Camada de instrução ativa (lida automaticamente por algum agente)

| # | Nome | Localização | Responsabilidade | Agente consumidor | Status | Últ. atualização |
|---|---|---|---|---|---|---|
| I-01 | Regras raiz (sem nome) | `.cursorrules` | Clean Code / SonarQube, limites de complexidade | Cursor, Hermes | ⚠️ Auto-conflitante | 2026-04-29 |
| I-02 | `governance` | `.cursor/rules/governance.mdc` | Monorepo, protocolo de mudança, escopo | Cursor (`alwaysApply`) | ✅ Vigente | 2026-03-30 |
| I-03 | `security` | `.cursor/rules/security.mdc` | Segredos, `.env.example` | Cursor (`alwaysApply`) | ✅ Vigente | 2026-03-30 |
| I-04 | `entity-ssot` | `.cursor/rules/entity-ssot.mdc` | Telas oficiais de CRUD por entidade | Cursor (`alwaysApply`) | ✅ Vigente | 2026-07-30 |
| I-05 | Contexto módulo web | `pdv-importados/.cursorrules` | Stack, árvore, i18n, escopo MVP | Cursor (subdir) | 🔴 Desatualizado | 2026-06-18 |
| I-06 | `engineering-loop` | `.cursor/skills/engineering-loop/SKILL.md` | Ciclo autônomo diagnose→deploy | Cursor | ✅ Vigente | 2026-07-13 |
| I-07 | `production-debugger` | `.claude/agents/production-debugger.md` | Debug de produção (Next/Supabase/Vercel) | Claude Code | 🔴 Acoplado/errado | 2026-05-27 |
| I-08 | `supabase` | `.agents/skills/supabase/SKILL.md` | Como usar Supabase (vendor) | Claude/Codex/Hermes | ✅ Vendor v0.1.2 | vendored |
| I-09 | `supabase-postgres-best-practices` | `.agents/skills/…/SKILL.md` | Índices, locks, RLS perf (36 refs) | idem | ✅ Vendor | vendored |
| I-10 | `supabase-server` | `.agents/skills/supabase-server/SKILL.md` | SSR / `@supabase/ssr` | idem | ✅ Vendor | vendored |
| I-11 | `jinlong-architecture` | `.skills/jinlong-architecture.skill.md` | Gates arquiteturais Jinlong | (nenhum ainda) | 🟡 **Incompleto + não versionado** | 2026-08-05 |
| I-12 | `jinlong-design` | `jinlong layout 20-05/SKILL.md` | Marca, cores, tipografia, UI kit | Claude (manual) | 🟡 Órfão (pasta com espaço no nome) | — |
| I-13 | Prompt canônico | `docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md` | Sessão autônoma | Cursor (manual) | ✅ Canônico | 2026-03-30 |
| I-14 | Prompts legados V2/V3/COMPLETA | `docs/CURSOR_PROMPT_SESSAO_*.md` | — (lápides) | — | ⚰️ Legado declarado | 2026-03-30 |
| I-15 | Config MCP | `.mcp.json` | Servidor Supabase MCP | Claude/Cursor | ⚠️ `project_ref` exposto | — |

### 1.2 Camada de autoridade documental (instrução por referência, não auto-carregada)

| # | Documento | Papel | Status |
|---|---|---|---|
| A-01 | `docs/ARQUITETURA_REGRAS_NEGOCIO.md` | **Fonte Normativa Única** das regras de negócio (v2.1, congelada R1) | 🔴 **Não versionada no git** |
| A-02 | `docs/adr/` (8 ADRs) | Fronteiras de domínio, caixa, PDV | ✅ Vigente |
| A-03 | `docs/ARCHITECTURE.md` | Visão de sistema, stack, fluxos | 🔴 Stack desatualizada |
| A-04 | `docs/AUTHORIZATION_MATRIX.md` | Perfis e permissões | ✅ Referenciado |
| A-05 | `docs/GOVERNANCA_PMO_JINLONG.md` | PMO técnico, matriz de cobertura | ✅ Vigente (2026-07-08) |
| A-06 | `docs/architecture/` (43 arquivos) | Inventários, auditorias por domínio | ✅ Vigente |
| A-07 | `docs/auditoria/` | Achados e tickets | ✅ Vigente |
| A-08 | `docs/ai-guidelines/README.md` | Explica doc-vs-regra-ativa | ✅ Vigente, subutilizado |

### 1.3 Enforcement executável (a instrução que realmente vincula)

15 guards em `npm run guard:*` e `check:*` — `core-rule-guard`, `domain-boundary-guard`, `pricing-rpc-guard`, `rpc-gate-guard`, `route-guard`, `migration-sequence-guard`, `dep-version-guard`, `pdv-flow-guard`, `check-entity-ssot-boundary`, `check-vendabilidade-invariant`, entre outros.

> **Observação de maior valor da auditoria:** esta é a única camada que **não pode ser ignorada por um agente**. Toda regra crítica deveria terminar aqui, não em prosa.

### 1.4 Contagem

- **4 diretórios de descoberta** distintos: `.agents/skills/`, `.cursor/skills/`, `.claude/agents/`, `.skills/`
- **2 arquivos `.cursorrules`** (raiz + módulo)
- **3 `.mdc`** de regra automática
- **7 SKILL.md/agent.md**
- **4 prompts** (1 canônico + 3 lápides)

---

## 2. Sobreposição

| ID | Assunto sobreposto | Arquivos envolvidos | Gravidade |
|---|---|---|---|
| S-01 | **Onde a regra de negócio mora / quem é autoridade** | `ARQUITETURA_REGRAS_NEGOCIO.md` (Cap. 2), `entity-ssot.mdc`, ADR-005..010, `.skills/jinlong-architecture` | **Crítica** |
| S-02 | **Prioridade de trabalho (P0–P4)** | `engineering-loop` (P0 produção→P4 UX) × `ARQUITETURA_REGRAS_NEGOCIO` Cap. 1-A (P1 segurança→P6 UX) | **Crítica** |
| S-03 | **Stack oficial do web** | `pdv-importados/.cursorrules` (Next 16 / React 19) × `docs/ARCHITECTURE.md` (Next 15+ / React 18+) | **Alta** |
| S-04 | **Como criar migration** | `supabase/SKILL.md`, `production-debugger`, prompt canônico, `migration-sequence-guard.mjs` | **Alta** |
| S-05 | **Segredos e env** | `security.mdc`, `.cursorrules` raiz, `supabase/SKILL.md`, `ARCHITECTURE.md` §Secret Management | Média |
| S-06 | **Limites de complexidade** | `.cursorrules` raiz consigo mesmo (20 linhas × 40–50 linhas) | Média |
| S-07 | **RLS / SECURITY DEFINER** | `supabase/SKILL.md`, `supabase-postgres-best-practices/security-*`, `ARCHITECTURE.md`, `P2_GOVERNANCA_RLS_E_PENTEST.md` | Média |
| S-08 | **Contexto de monorepo** | `governance.mdc`, `engineering-loop/references/monorepo.md`, `ARCHITECTURE.md` §Workspace | Baixa |

**Padrão observado:** a sobreposição não é acidental — cada agente novo (Cursor → Claude → Hermes) trouxe seu próprio diretório e reescreveu o contexto do zero em vez de referenciar o existente.

---

## 3. Autoridade — resumo

Detalhamento completo em `MATRIZ_AUTORIDADE_SKILLS.md`. Resumo dos casos onde **hoje não há autoridade declarada**:

| Domínio | Autoridade hoje | Problema |
|---|---|---|
| Arquitetura | *nenhuma declarada* | `jinlong-architecture` foi criado mas está incompleto e não versionado |
| Performance operacional / PDV | *nenhuma* | Vendor `supabase-postgres-best-practices` fala de Postgres genérico, não de latência de bip |
| Fiscal | Implícita nas RPCs `fiscal_*` | Nenhum skill orienta agentes sobre DLQ, idempotência, P4 |
| Go-Live | 8 documentos concorrentes | Nenhum declarado canônico |
| UX / Design | `jinlong-design` | Órfão em pasta com espaço no nome; nenhum agente o encontra |
| Observabilidade | *nenhuma* | Correlation_id / auditoria só aparecem em prosa |

---

## 4. Conflitos concretos

### C-01 — 🔴 Crítico — A fonte normativa não está no git

- **Arquivos:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md` (untracked em `git status`)
- **Regra conflitante:** o documento se declara *"Fonte Normativa Única"*, *"congelado"* e *"autoridade funcional em conflito com a implementação"* — mas existe apenas no working tree local.
- **Impacto prático:** qualquer agente rodando em CI, em outra máquina, em worktree do Claude ou após um `git clean` **opera sem a autoridade funcional do projeto**. O SSoT declarado é, na prática, um arquivo local não compartilhado. Este é o achado mais grave da auditoria.

### C-02 — 🔴 Crítico — Duas escalas de prioridade incompatíveis

- **Arquivos:** `.cursor/skills/engineering-loop/SKILL.md` §Priorização × `ARQUITETURA_REGRAS_NEGOCIO.md` Cap. 1-A
- **Conflito:** o loop diz *"P2 = Integridade dos dados, P4 = UX, nunca trabalhar em P3/P4 com P0–P2 aberto"*. O documento normativo usa `P1 Segurança > P2 Financeiro > P3 Estoque > P4 Fiscal > P5 Comercial > P6 UX` — significado **totalmente diferente** para os mesmos rótulos.
- **Impacto:** um agente que lê "P4" não sabe se é *UX de baixa prioridade* (adiar) ou *Integridade Fiscal* (P4 crítico). Risco real de tratar integridade fiscal como melhoria cosmética.

### C-03 — 🔴 Crítico — Caminho de repositório inexistente

- **Arquivo:** `.claude/agents/production-debugger.md:12` → `**Repo:** C:\Naturecode\fastproduct`
- **Realidade:** `C:\fastproduct`
- **Impacto:** o agente de crise de produção começa toda investigação com o caminho errado. Um agente que confia no próprio contexto falha ou, pior, cria arquivos fora do repositório.

### C-04 — 🟠 Alta — Stack declarada divergente

- **Arquivos:** `pdv-importados/.cursorrules` (Next.js **16**, React **19**) × `docs/ARCHITECTURE.md` (Next.js **15+**, React **18+**)
- **Impacto:** decisões de API (Server Actions, `use cache`, hooks do React 19) tomadas com base na versão errada; sugestões incompatíveis ou desnecessariamente conservadoras.

### C-05 — 🟠 Alta — `.cursorrules` raiz contradiz a si mesmo

- **Arquivo:** `.cursorrules` — "Funções com no máximo 20 linhas / complexidade cognitiva abaixo de 5" e, adiante, "prefira funções abaixo de 40–50 linhas e complexidade abaixo de 10".
- **Mitigação parcial:** o próprio arquivo declara que a seção operacional prevalece — mas a contradição aparece **antes** da ressalva, e agentes que truncam contexto pegam só a primeira metade.
- **Impacto:** refatorações desnecessárias de componentes React e workers Edge.

### C-06 — 🟠 Alta — Escopo MVP obsoleto bloqueia domínios já implementados

- **Arquivo:** `pdv-importados/.cursorrules` §*Fora do escopo MVP*: "NF-e, multi-loja nativa, **financeiro**, import XML — não implementar sem alinhamento".
- **Realidade:** todos existem e são normativos — família `fiscal_*` (mig 092), `loja_id` + RLS multi-tenant (Cap. 5), `registrar_pagamento_contas_pagar`, importação de NF-e em `/admin/estoque/importar-nfe`.
- **Impacto:** um agente pode **recusar** trabalhar em financeiro/fiscal ou tratar como greenfield algo que tem autoridade estabelecida — risco direto de criar implementação paralela (violação de SSoT).

### C-07 — 🟡 Média — Autonomia total × confirmação obrigatória

- **Arquivos:** `engineering-loop` ("totalmente autônomo", commit e push sem intervenção) × `governance.mdc` ("não remover código sem confirmação explícita", "em pedido ambíguo, faça até 2 perguntas") × prompt canônico ("pedir confirmação curta em dados/auth/deploy/rollback").
- **Impacto:** o agente escolhe o polo que preferir. Na prática, o loop autônomo tende a vencer porque é o mais específico e recente.

### C-08 — 🟡 Média — Migration: numerada vs. timestamp vs. CLI

- **Arquivos:** `production-debugger` (`N+1_descricao.sql`) × `supabase/SKILL.md` (`supabase migration new`, nunca inventar nome) × migrations reais (convivem `270_*` e `20260801120000_*`).
- **Impacto:** ordenação lexicográfica imprevisível e conflito com `migration-sequence-guard.mjs`.

### C-09 — 🟡 Média — Fiscal síncrono vs. assíncrono

- `pdv-importados/.cursorrules` trata NF-e como fora de escopo; `ARQUITETURA_REGRAS_NEGOCIO` Cap. 1-A prova por que fiscal é **P4 assíncrono e nunca bloqueia o caixa**. Um agente sem o segundo documento (ver C-01) pode propor emissão síncrona no checkout — regressão arquitetural grave.

---

## 5. Hierarquia

Ver `MAPA_HIERARQUIA_SKILLS.md`.

---

## 6. Acoplamento

| ID | Acoplamento | Arquivo | Como reduzir |
|---|---|---|---|
| K-01 | Caminho absoluto de máquina | `production-debugger.md` (`C:\Naturecode\...`) | Usar caminhos relativos à raiz do repo |
| K-02 | IDs de infra hardcoded | `production-debugger.md` (Vercel `prj_*`, `team_*`, Supabase ref) e `.mcp.json` | Mover para `.env` / variáveis; skill referencia o nome da var |
| K-03 | IDs de ferramentas MCP versionados | `production-debugger.md` (`mcp__c392d280-*`) | Referenciar a *capacidade* ("runtime logs do Vercel"), não o slug |
| K-04 | Nomes de arquivo de tema CSS | `production-debugger.md` (`theme-fix-aggressive.css`) | Descrever o sintoma e a regra; deixar o agente localizar |
| K-05 | Stack duplicada em prosa | `pdv-importados/.cursorrules`, `ARCHITECTURE.md` | Ler de `package.json`; skill diz "verifique o manifest" |
| K-06 | Regras de negócio copiadas na rule | `pdv-importados/.cursorrules` §Preço atacado | Referenciar RN do Cap. 7 em vez de reescrever |
| K-07 | Pasta com espaço no nome | `jinlong layout 20-05/` | Renomear para `.agents/skills/jinlong-design/` |
| K-08 | 4 diretórios de descoberta | `.agents/`, `.cursor/`, `.claude/`, `.skills/` | Consolidar em `.agents/skills/` + ponteiros finos |
| K-09 | Skill novo fora do padrão | `.skills/jinlong-architecture.skill.md` | Mover para `.agents/skills/jinlong-architecture/SKILL.md` |

**Princípio corretivo:** um skill deve acoplar-se a **conceitos e comandos verificáveis** (`npm run guard:domain`), nunca a caminhos de máquina, IDs de projeto ou conteúdo copiado de ADR.

---

## 7. Lacunas

| Área | Skill próprio? | Gravidade | Observação |
|---|---|---|---|
| Arquitetura Jinlong | 🟡 Iniciado, incompleto | **Crítica** | `.skills/jinlong-architecture.skill.md` parou na §Gate Arquitetural |
| Regras de Negócio | ❌ Só documento | **Crítica** | Documento normativo não versionado (C-01) |
| Auditoria / rastreabilidade | ❌ | Alta | Nenhuma instrução sobre correlation_id, request_id, valores antes/depois |
| Go-Live | ❌ | Alta | 8+ documentos, nenhum canônico |
| Performance operacional (PDV) | ❌ | Alta | Latência de bip, p50/p95, locks no checkout |
| Fiscal | ❌ | Alta | DLQ, idempotência, backoff, por que P4 |
| Observabilidade | ❌ | Média | Sentry, logs de Edge, RLS violations |
| Multiempresa / tenant | ❌ | Média | Padrão `loja_id` + UNIQUE composto + RLS |
| Eventos / outbox / sync | ❌ | Média | HMAC, nonce, replay, idempotência |
| Integrações externas | ❌ | Média | Focus NFe, PIX, maquininha |
| UX / Design System | 🟡 Órfão | Média | `jinlong-design` inacessível na prática |
| Testes / QA | ❌ | Baixa | Coberto parcialmente pelo `engineering-loop` |

---

## 8. Conclusão

O maior risco não é nenhum skill individual, e sim a **ausência de um árbitro declarado**. Existem hoje 15 artefatos de instrução ativos, 4 mecanismos de descoberta e nenhuma linha em nenhum arquivo dizendo quem vence quando dois discordam — situação que produz exatamente o que a auditoria encontrou: 8 conflitos, sendo 3 capazes de causar regressão arquitetural real (fiscal síncrono, prioridade invertida, implementação paralela de financeiro).

A correção de maior impacto e menor custo é **versionar `ARQUITETURA_REGRAS_NEGOCIO.md` (C-01)** — hoje o SSoT normativo do projeto sobrevive apenas no working tree de uma máquina.

Plano completo em `PLANO_CONSOLIDACAO_SKILLS.md`.
