# Matriz de Autoridade por Domínio — Skills Jinlong ERP

> 🟡 **PROPOSTA NÃO RATIFICADA — fora da fila de execução R1.**
> Condições e pré-requisitos: ver o cabeçalho de `AI_CONSTITUTION.md`.
>
> **Correções de 2026-08-05:**
> - Linha **Regras de Negócio** — o status *"🔴 Untracked no git"* está **resolvido**:
>   `docs/ARQUITETURA_REGRAS_NEGOCIO.md` foi versionado e indexado.
> - Linhas **PDV / Auditoria / Fiscal / Observabilidade / Eventos** — a coluna
>   *"(a criar) `jinlong-*`"* está **superada**: por `ARQUITETURA_CAMADA_IA.md` §1.1 esses
>   domínios são **capítulos** de um único skill, não skills próprios.
> - Linha **Go-Live** — *"(a eleger) nenhum canônico"* está **resolvido**: o canônico é
>   `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`, fila única de execução declarada em `docs/INDEX.md`.
> - Linha **Arquitetura** — `jinlong-architecture` **não foi versionado** (truncado, e em
>   `.skills/`, diretório declarado "não adotar").

> **Status:** proposta para aprovação. Nenhum arquivo existente foi alterado.
> **Regra de leitura:** *Skill oficial* = quem decide. *Subordinados* = consultados dentro da decisão. *Redundantes* = a eliminar ou converter em ponteiro.

---

## 1. Matriz

| Domínio | Skill/Doc OFICIAL | Subordinados | Redundantes / a eliminar | Situação |
|---|---|---|---|---|
| **Arquitetura** | `jinlong-architecture` (SKILL) | ADRs, `ARQUITETURA_REGRAS_NEGOCIO`, `docs/architecture/**` | `docs/ARCHITECTURE.md` §stack (desatualizado) | 🟡 Skill incompleto e não versionado |
| **Regras de Negócio** | `docs/ARQUITETURA_REGRAS_NEGOCIO.md` v2.1 | `docs/adr/**`, Cap. 7 (catálogo RN) | Regras copiadas em `pdv-importados/.cursorrules` §Preço atacado | 🔴 **Untracked no git** |
| **SSoT de entidades / CRUD** | `.cursor/rules/entity-ssot.mdc` | ADR-005..010 | — | ✅ Saudável |
| **Fronteiras de domínio** | ADR-005 (+006..010) | `domain-boundary-guard.mjs` | — | ✅ Saudável |
| **Supabase (uso)** | `.agents/skills/supabase` (vendor) | `supabase-server` | — | ✅ Vendor, não editar |
| **PostgreSQL (performance)** | `supabase-postgres-best-practices` (vendor) | 36 refs de índice/lock/RLS | — | ✅ Vendor |
| **Segurança (segredos)** | `.cursor/rules/security.mdc` | `supabase/SKILL.md` §Security checklist | `.cursorrules` raiz §segurança; `ARCHITECTURE.md` §Secret Management | 🟡 Triplicado |
| **Segurança (RLS/authz)** | RLS no banco + `AUTHORIZATION_MATRIX.md` | `security-rls-basics`, `security-privileges` | `ARCHITECTURE.md` exemplo de policy (usa `user_metadata` — **padrão inseguro**) | 🔴 Exemplo perigoso |
| **Performance operacional (PDV)** | *(a criar)* `jinlong-pdv` | ADR-PDV-001, `stress:pdv`, `gate:pdv` | — | ❌ Lacuna Alta |
| **Auditoria / rastreabilidade** | *(a criar)* `jinlong-auditoria` | Triggers, `registrar_venda_evento`, Cap. 4 | — | ❌ Lacuna Alta |
| **Fiscal** | *(a criar)* `jinlong-fiscal` | Família `fiscal_*`, mig 092, ADR-002 | `pdv-importados/.cursorrules` (diz "fora do escopo") | ❌ Lacuna + conflito C-06/C-09 |
| **Estoque** | ADR-008 + `InventoryMovementWriter` | RPCs de movimento, `inventory_100_audit.md` | — | ✅ Autoridade clara em código |
| **Financeiro / Caixa** | ADR-009 / ADR-010 + ADR-CAIXA-002 | `E(c)`, `financial_100_audit.md` | `pdv-importados/.cursorrules` "financeiro fora do escopo" | 🔴 Conflito C-06 |
| **Multiempresa** | Cap. 5 (`loja_id` + UNIQUE + RLS) | — | — | 🟡 Sem skill; divergência TB-05 aberta |
| **Go-Live** | *(a eleger)* — candidato `GO_LIVE_CHECKLIST.md` | `GO_LIVE_*` (8 docs), `FIRST_CUSTOMER_READINESS.md` | 7 dos 8 documentos | ❌ Nenhum canônico |
| **Observabilidade** | *(a criar)* | Sentry, `ARCHITECTURE.md` §Observability | — | ❌ Lacuna Média |
| **Eventos / Sync / Outbox** | *(a criar)* | `ARCHITECTURE.md` §Sync, `sync-outbox` | — | ❌ Lacuna Média |
| **UX / Design System** | `jinlong-design` | `DESIGN_SYSTEM_CONTRACT.md`, `DS_MIGRATION_GOVERNANCE.md` | `production-debugger` §CSS (regra de tema fora de lugar) | 🟡 Órfão |
| **Processo de engenharia** | `engineering-loop` | `governance.mdc`, prompt canônico | Prompts V2/V3/COMPLETA (lápides) | 🟡 Conflita em prioridade (C-02) |
| **Debug de produção** | `production-debugger` | Vercel/Supabase MCP | Caminho e IDs hardcoded | 🔴 Acoplado (C-03, K-01..K-04) |
| **Qualidade de código** | `.cursorrules` raiz | SonarQube (`sonar-project.properties`) | Contradição interna (C-05) | 🟡 Auto-conflitante |

---

## 2. Regras de autoridade

1. **Uma autoridade por domínio.** Se dois artefatos decidem o mesmo, um deles é subordinado ou redundante — não existe empate.
2. **Autoridade de domínio nunca mora em arquivo de ferramenta.** `.cursorrules`, `.claude/agents/` e `.cursor/skills/` não podem declarar escopo, regra de negócio ou stack.
3. **Vendor skills não recebem edição local.** `supabase*` são versionados por hash em `skills-lock.json`. Adaptações Jinlong vão no `jinlong-architecture`, que os subordina.
4. **Autoridade sem enforcement é intenção.** Toda regra crítica deve ter um guard correspondente em `npm run guard:*`; sem isso, o status é "recomendação".
5. **Documento congelado é autoridade, não sugestão.** `ARQUITETURA_REGRAS_NEGOCIO.md` só muda por decisão da direção (abertura de R2).

---

## 3. Lacunas de autoridade por criticidade

| Prioridade | Domínio | Ação |
|---|---|---|
| 1 | Regras de Negócio | **Versionar** o documento normativo (C-01) |
| 2 | Arquitetura | Concluir e versionar `jinlong-architecture` |
| 3 | Fiscal | Criar skill; remover "fora do escopo" obsoleto |
| 4 | PDV / Performance | Criar skill com ADR-PDV-001 e gates de stress |
| 5 | Auditoria | Criar skill (correlation_id, trilha, evidências) |
| 6 | Go-Live | Eleger 1 canônico; marcar os outros como histórico |
| 7 | Observabilidade / Eventos / Multiempresa | Criar seções dentro de `jinlong-architecture` (não skills separados, para evitar proliferação) |
