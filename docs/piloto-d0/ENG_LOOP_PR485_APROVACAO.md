# Engineering Loop — PR #485 (backup JIT) — preparação para aprovação

**Branch:** `cursor/p0-estabilizacao-jit-1966`  
**Data:** 2026-10-08  
**Merge:** **não realizado** nesta missão (proibido sem auth humana).

## Escopo do PR

- Sonda Temporary Access **direto** antes do pooler no `backup-scheduled.yml`
- Guard estático `npm run guard:backup-jit` (PASS local nesta revisão)
- Docs GO/NO-GO, JIT alternativas, plano pós-OPS-02, runbook

## Segurança do backup (revisão)

| Item | Achado |
|---|---|
| Credenciais | `SUPABASE_BACKUP_JIT_PAT` via secret; URI-encoded; sem hardcode |
| Conexão | Auth JIT → probe direto `db.<ref>` → fallback pooler aws-N |
| Dump | Workflow Opção B (age + artifact) — não reexecutado aqui |
| Artifact | Ainda **sem** run SUCCESS pós-sonda — NÃO VALIDADO recuperável |
| Monitoramento | workflows freshness/restore-test existentes; SUCCESS ≠ recuperável |

## CI — falhas e classificação

| Check | Resultado | Relação com #485 |
|---|---|---|
| `guard`/build backend local gates | PASS | OK |
| `E2E crítico (sistema de risco)` | PASS | OK |
| `migration-remote-drift` | FAIL | **Pré-existente / esperado**: 8 SSOT `20261007*` `remote_ausente` (+ pares HUMAN_GATE MCP). Não introduzido pela sonda JIT. Plano em PR #488. |
| `e2e-playwright` | FAIL | **Pré-existente / UI**: mobile — `getByRole('navigation')` strict (2 navs); i18n `生意看板` hidden; placeholder etiquetas. **Não** toca backup. |

## Dependências entre PRs

```text
#485 (backup) ──dispatch auth──► artifact ──auth──► restore real
#488 (integridade) ──quarantine 120000 + pending-auth DROP POLICY
#489 (ops) ──restore sintético PASS local; smoke roteiro
```

Merge de #485 **não** desbloqueia operação contínua sozinho (falta artifact + restore real + smoke loja).

## Recomendação para aprovação humana

1. **Código backup:** pronto para review (guard PASS).  
2. **Merge:** só com aceite explícito dos checks vermelhos **ou** após isolar e2e/drift em follow-ups.  
3. **Pós-merge:** **um** `workflow_dispatch` de `backup-scheduled` (auth).  
4. **Não** tratar merge como GO operacional.

## GO/NO-GO deste PR

| Decisão | Status |
|---|---|
| Aprovar código para review | **GO CONDICIONAL** (aceitar drift/e2e conhecidos) |
| Merge automático | **NO-GO** (agente) |
| Operação contínua | **NO-GO** |
