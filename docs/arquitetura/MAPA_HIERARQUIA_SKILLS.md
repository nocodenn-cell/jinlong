# Mapa de Hierarquia de Skills — Jinlong ERP

> # 🗄️ ARQUIVADO — REVOGADO EM 2026-08-05
>
> **Substituto vigente:** `AI_CONSTITUTION.md` Art. 11 (camadas `C0–C9`) + Art. 12 (arbitragem).
>
> **Por que foi revogado — duas hierarquias vivas para o mesmo objeto:**
>
> | | Este documento (`N0–N9`) | `AI_CONSTITUTION.md` (`C0–C9`) |
> |---|---|---|
> | Skill Jinlong × Regras de Negócio | **N2 skill > N3 regras** | **C3 regras > C4 skill** |
>
> A inversão é direta e **`C0–C9` prevalece**: um skill de agente não pode subordinar a
> autoridade funcional congelada do negócio. Manter as duas escalas reproduziria exatamente o
> defeito C-02 (rótulo reutilizado com outro sentido) que o Art. 3 existe para proibir.
> Diagnóstico completo em `AUDITORIA_CONSTITUICAO_R2.md` (achado `CIC-06` / duplicação Crítica).
>
> **Também revogado daqui:** §2 nível N4 (criar `jinlong-pdv`, `jinlong-fiscal`,
> `jinlong-auditoria`, `jinlong-golive`) — rejeitado por `ARQUITETURA_CAMADA_IA.md` §1.1:
> esses domínios são **capítulos** de um único skill, não skills separados.
>
> **O que permanece útil e foi preservado:** §4 (aplicação da hierarquia aos conflitos C-02,
> C-04, C-06, C-07, C-08, C-09) e §5 (regra de descoberta única — incluindo
> *"`.skills/` — não adotar"*).
>
> **Não usar como instrução.** Mantido apenas como registro do raciocínio da rodada R1.

> **Status original:** proposta para aprovação. Nenhum arquivo existente foi alterado.
> **Companheiros:** `AUDITORIA_SKILLS.md` · `MATRIZ_AUTORIDADE_SKILLS.md` · `PLANO_CONSOLIDACAO_SKILLS.md`

---

## 1. Princípio da hierarquia

> **Domínio vence tecnologia. Garantia executável vence prosa. Específico vence genérico — desde que não viole o nível acima.**

Hoje não existe nenhuma declaração de precedência entre a camada de instrução dos agentes. Esta é a proposta.

---

## 2. Árvore de precedência

```
N0  ENFORCEMENT EXECUTÁVEL  (npm run guard:* / check:*)
    └─ vence tudo: se o guard reprova, a mudança está errada — inclusive contra um skill

N1  GOVERNANÇA E SEGURANÇA
    ├─ .cursor/rules/security.mdc          (segredos, env)
    └─ .cursor/rules/governance.mdc        (escopo, protocolo, confirmação)

N2  ARQUITETURA JINLONG                    ← ÁRBITRO da camada de instrução
    └─ jinlong-architecture (SKILL)
       declara ordem: Domínio→Arquitetura→Operação→Segurança→Persistência→Infra
       e a precedência P1..P6 de conflito de regras

N3  AUTORIDADE FUNCIONAL DO NEGÓCIO
    ├─ docs/ARQUITETURA_REGRAS_NEGOCIO.md  (Fonte Normativa Única, v2.1 congelada)
    ├─ docs/adr/**                          (fronteiras de domínio, caixa, PDV)
    ├─ .cursor/rules/entity-ssot.mdc        (telas oficiais de CRUD)
    └─ docs/AUTHORIZATION_MATRIX.md         (perfis e permissões)

N4  DOMÍNIOS OPERACIONAIS  (a criar — ver Lacunas)
    ├─ jinlong-pdv           (bip, ACK, latência, offline)
    ├─ jinlong-fiscal        (fila, DLQ, idempotência, P4)
    ├─ jinlong-auditoria     (correlation_id, trilha, evidências)
    └─ jinlong-golive        (critérios de aceite, runbook)

N5  PROCESSO DE ENGENHARIA
    └─ engineering-loop      (ciclo diagnose→missão→CI→Vercel)

N6  TECNOLOGIA  (vendor — subordinada, nunca decide domínio)
    ├─ supabase                            (produtos, CLI, MCP, migrations)
    │   ├─ supabase-postgres-best-practices (índices, locks, RLS perf)
    │   └─ supabase-server                  (SSR, @supabase/ssr)
    ├─ Next.js / React / TypeScript        (via package.json, não prosa)
    └─ Tauri (pdv-local)

N7  APRESENTAÇÃO
    └─ jinlong-design        (marca, cores, tipografia, UI kit)

N8  CONTEXTO DE MÓDULO
    └─ pdv-importados/.cursorrules          (árvore de pastas — só contexto local)

N9  HISTÓRICO  (nunca instrução)
    └─ docs/CURSOR_PROMPT_SESSAO_*_V2|V3|COMPLETA.md, docs legados
```

---

## 3. Quem prevalece — tabela de arbitragem

| Nível | Prevalece sobre | Cede para | Racional |
|---|---|---|---|
| **N0** Guards | Todos | Ninguém | É a única regra que o agente não consegue ignorar |
| **N1** Segurança/Governança | N2–N9 | N0 | Vazamento de segredo é dano irreversível |
| **N2** Arquitetura Jinlong | N3–N9 | N0, N1 | É o árbitro; define como os demais se ordenam |
| **N3** Regras de Negócio | N4–N9 | N0–N2 | Autoridade funcional; em conflito com código, o doc vence |
| **N4** Domínios operacionais | N5–N9 | N0–N3 | Especialização dentro das regras já fixadas |
| **N5** Processo | N6–N9 | N0–N4 | Como trabalhar nunca sobrepõe o que é correto |
| **N6** Tecnologia (vendor) | N7–N9 | N0–N5 | Supabase é infraestrutura, não centro do sistema |
| **N7** Design | N8–N9 | N0–N6 | UX é P6: sempre cede |
| **N8** Contexto de módulo | N9 | N0–N7 | Informa, não normatiza |
| **N9** Histórico | — | Todos | Não é instrução |

---

## 4. Aplicação da hierarquia aos conflitos encontrados

| Conflito | Resolução pela árvore |
|---|---|
| C-02 prioridade P0–P4 × P1–P6 | N3 vence: `engineering-loop` (N5) deve renomear sua escala para `E0–E4` (Execução) e nunca usar rótulos `P*` |
| C-04 stack Next 16 × 15 | N0/N6 vencem: a verdade é `package.json`, não prosa em N8 ou em `ARCHITECTURE.md` |
| C-06 financeiro "fora do escopo" | N3 vence: `pdv-importados/.cursorrules` (N8) não pode declarar escopo de domínio |
| C-07 autonomia × confirmação | N1 vence: `governance.mdc` limita o `engineering-loop` (N5) |
| C-08 formato de migration | N0 vence: `migration-sequence-guard.mjs` é o árbitro real |
| C-09 fiscal síncrono | N2/N3 vencem: fiscal é P4 assíncrono, nunca bloqueia o caixa |

---

## 5. Regra de descoberta única

Todo agente deve encontrar a hierarquia por **um** caminho. Proposta:

1. `.agents/skills/` — diretório canônico de skills (padrão multi-agente, já usado pelo `skills-lock.json`)
2. `.cursor/rules/*.mdc` — permanece apenas para as 3 rules `alwaysApply` (governança, segurança, entity-ssot)
3. `.claude/agents/` e `.cursor/skills/` — viram **ponteiros finos** (≤10 linhas) para o skill canônico
4. `.skills/` — não adotar; mover conteúdo para `.agents/skills/`

**Regra de ouro:** nenhum diretório de agente pode conter regra de domínio própria. Só ponteiro + contexto específico da ferramenta.
