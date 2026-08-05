# Plano de Consolidação da Camada de Instrução — Jinlong ERP

> 🟡 **PROPOSTA NÃO RATIFICADA — fora da fila de execução R1.**
> Condições e pré-requisitos: ver o cabeçalho de `AI_CONSTITUTION.md`.
>
> **Correções de 2026-08-05:**
> - **Onda 3 (3.1–3.3) está REVOGADA.** Criar `jinlong-pdv`, `jinlong-fiscal` e
>   `jinlong-auditoria` foi rejeitado por `ARQUITETURA_CAMADA_IA.md` §1.1: *"o problema
>   diagnosticado foi proliferação sem hierarquia; responder com mais artefatos trata o sintoma
>   e agrava a causa"*. Esses domínios são **capítulos**, não skills.
> - **Teto de skills: ≤4 internos** (alvo 2). O *"teto de 6 skills Jinlong"* de §4 está superado.
> - **Onda 0 ganhou um item 0.5:** decidir sobre `.agents/` no `.gitignore:73`. Sem isso,
>   as Ondas 1 e 2 movem artefatos para um diretório que o git ignora — ver `A-01`.
> - **Item 0.4 resolvido:** `.skills/jinlong-architecture.skill.md` **não foi versionado** —
>   está truncado (`<!-- CONT -->`) e `MAPA_HIERARQUIA_SKILLS.md` §5.4 já determinava
>   *"`.skills/` — não adotar"*. Permanece fora do controle de versão até ser concluído e
>   movido para o diretório canônico.
>
> **Ondas 0 e 1 continuam recomendadas** e são o item de maior retorno de todo este bloco.

> **Status:** proposta para aprovação da direção. **Nenhuma mudança foi executada.**
> **Base:** `AUDITORIA_SKILLS.md` (15 artefatos, 8 sobreposições, 9 conflitos, 12 lacunas)
> **Meta:** de 15 artefatos dispersos em 4 diretórios → **9 artefatos em 2 diretórios**, com precedência declarada.

---

## 1. Objetivos e princípios

| Objetivo | Como se mede |
|---|---|
| Eliminar duplicações | Nenhuma regra de negócio ou stack escrita em 2 lugares |
| Eliminar conflitos | 0 conflitos Críticos/Altos abertos |
| Autoridade única por domínio | `MATRIZ_AUTORIDADE_SKILLS.md` sem célula "*a eleger*" |
| Reduzir manutenção | 1 diretório canônico; ponteiros ≤10 linhas |
| Alta coesão | Cada skill = 1 domínio, 1 dono |
| Fortalecer SSoT | Toda regra crítica com guard executável |

**Princípios de execução:** nada é apagado sem substituto vigente; mudança de instrução vem antes de mudança de código; toda etapa termina com evidência verificável.

---

## 2. Ondas

### Onda 0 — Parar a hemorragia (imediato, ~1h, risco baixo)

| # | Ação | Resolve | Evidência |
|---|---|---|---|
| 0.1 | **Versionar `docs/ARQUITETURA_REGRAS_NEGOCIO.md`** no git | C-01 🔴 | Arquivo em `git ls-files` |
| 0.2 | Corrigir caminho do repo em `production-debugger.md` (`C:\Naturecode` → relativo) | C-03 🔴 | grep sem caminho absoluto |
| 0.3 | Corrigir C-06: remover "financeiro / NF-e / multi-loja fora do escopo" de `pdv-importados/.cursorrules` | C-06 🔴 | Diff aprovado |
| 0.4 | Versionar ou remover `.skills/jinlong-architecture.skill.md` (hoje untracked e incompleto) | Lacuna | Decisão registrada |

> Onda 0 é a de maior retorno: 3 dos 4 itens são correções de uma linha que hoje causam falha real de agente.

### Onda 1 — Declarar o árbitro (~4h, risco baixo)

| # | Ação | Resolve |
|---|---|---|
| 1.1 | **Concluir o `jinlong-architecture`** (gates de Domínio, Operação, Auditoria, Segurança, Performance, SSoT, Governança, Regressões, Radar, Critério Final) | Lacuna Crítica |
| 1.2 | Movê-lo para `.agents/skills/jinlong-architecture/SKILL.md` | K-08, K-09 |
| 1.3 | Incluir nele a **árvore de precedência** de `MAPA_HIERARQUIA_SKILLS.md` | S-01, ausência de árbitro |
| 1.4 | Renomear a escala do `engineering-loop` de `P0–P4` para `E0–E4` e referenciar P1–P6 como escala de conflito de regras | C-02 🔴 |
| 1.5 | Adicionar em `governance.mdc` uma linha de precedência sobre o `engineering-loop` | C-07 |

### Onda 2 — Unificar descoberta (~3h, risco médio)

| # | Ação | Resolve |
|---|---|---|
| 2.1 | Adotar `.agents/skills/` como diretório canônico | K-08 |
| 2.2 | Converter `.claude/agents/production-debugger.md` em ponteiro + mover conteúdo para `.agents/skills/jinlong-producao/` | K-01..K-04 |
| 2.3 | Converter `.cursor/skills/engineering-loop/` em ponteiro | K-08 |
| 2.4 | Mover `jinlong layout 20-05/` → `.agents/skills/jinlong-design/` | K-07 |
| 2.5 | Externalizar IDs de Vercel/Supabase para env; skill cita nome da variável | K-02, I-15 |
| 2.6 | Arquivar prompts V2/V3/COMPLETA em `docs/_historico/` | I-14 |

### Onda 3 — Fechar lacunas de domínio (~1 semana, risco baixo)

| # | Skill novo | Conteúdo mínimo |
|---|---|---|
| 3.1 | `jinlong-pdv` | ADR-PDV-001, semântica de ACK, latência p50/p95, offline, `gate:pdv`, `stress:pdv` |
| 3.2 | `jinlong-fiscal` | Fila, worker, DLQ, backoff, idempotência, por que P4, nunca síncrono no checkout |
| 3.3 | `jinlong-auditoria` | Campos obrigatórios (usuário, loja, terminal, data/hora, origem, operação, antes/depois, correlation_id, request_id) |
| 3.4 | Seções dentro de `jinlong-architecture` | Observabilidade, Eventos/Outbox, Multiempresa — **não** criar skills separados |
| 3.5 | Eleger 1 documento Go-Live canônico | Marcar os demais como histórico |

### Onda 4 — Tornar a regra executável (~1 semana, risco médio)

| # | Ação | Resolve |
|---|---|---|
| 4.1 | Guard que verifica coerência stack `package.json` × docs | C-04, K-05 |
| 4.2 | Guard `check:instruction-ssot` — detecta regra de negócio duplicada em `.cursorrules`/skills | K-06, S-01 |
| 4.3 | Guard de formato de migration alinhado ao `migration-sequence-guard` | C-08 |
| 4.4 | Resolver a contradição interna do `.cursorrules` raiz (uma escala só) | C-05 |
| 4.5 | Corrigir o exemplo de policy em `ARCHITECTURE.md` que usa `user_metadata` (padrão inseguro segundo o próprio skill Supabase) | Matriz §Segurança |

---

## 3. Destino de cada artefato

| Artefato | Destino |
|---|---|
| `.cursor/rules/{governance,security,entity-ssot}.mdc` | **Manter** — camada N1/N3, saudável |
| `.cursorrules` (raiz) | **Simplificar** — remover contradição, manter só qualidade de código |
| `pdv-importados/.cursorrules` | **Reduzir** — só árvore de pastas e contexto local; sem regra de negócio nem escopo |
| `engineering-loop` | **Manter + corrigir escala**; virar ponteiro |
| `production-debugger` | **Migrar + desacoplar** → `jinlong-producao` |
| `supabase*` (3 vendor) | **Manter intocados** (lock por hash) |
| `jinlong-design` | **Mover** para diretório canônico |
| `jinlong-architecture` | **Concluir, mover, versionar** — torna-se o árbitro |
| Prompts V2/V3/COMPLETA | **Arquivar** |
| `ARQUITETURA_REGRAS_NEGOCIO.md` | **Versionar** — prioridade máxima |

**Resultado:** 15 → **9 artefatos ativos**, 4 → **2 diretórios**, 0 conflitos Críticos.

---

## 4. Riscos do próprio plano

| Risco | Mitigação |
|---|---|
| Mover skills quebra descoberta de algum agente | Ponteiros finos nos caminhos antigos por 1–2 releases |
| Concluir `jinlong-architecture` gera mais um documento longo ignorado | Cada gate termina em comando verificável, não em prosa |
| Onda 3 recria proliferação | Teto de 6 skills Jinlong; observabilidade/eventos/tenant viram seções |
| Editar `.cursorrules` altera comportamento em sessões correntes | Aplicar em PR isolado, com aviso |

---

## 5. Sequência recomendada

```
Onda 0 (hoje, 1h)  →  Onda 1 (esta semana)  →  Onda 2  →  Onda 3  →  Onda 4
   destrava             declara o árbitro       unifica    preenche   executa
```

**Decisão pedida à direção:** aprovar Onda 0 + Onda 1 como bloco único. São ~5h de trabalho, resolvem os 3 conflitos Críticos e não exigem mudança de código de produção.

---

## 6. Critério de conclusão

A consolidação está concluída quando:

- [ ] `ARQUITETURA_REGRAS_NEGOCIO.md` versionado
- [ ] `jinlong-architecture` completo, versionado, no diretório canônico
- [ ] Nenhum conflito Crítico/Alto aberto na auditoria
- [ ] Cada domínio da matriz com autoridade única declarada
- [ ] Nenhuma regra de negócio duplicada fora da autoridade (guard verde)
- [ ] Máximo 2 diretórios de descoberta
- [ ] Todo agente encontra a árvore de precedência a partir de qualquer ponto de entrada

> Enquanto qualquer item estiver aberto, o status correto desta iniciativa é **"Em Implementação"** — nunca "Concluído".
