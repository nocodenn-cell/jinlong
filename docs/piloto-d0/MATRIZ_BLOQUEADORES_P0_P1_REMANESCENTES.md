# Matriz de bloqueadores P0/P1 remanescentes

**Atualizado:** 2026-10-08 (pós-fechamento PRs + auditoria multiempresa)

| ID | Tipo | Descrição | Humano? | Local? | Estado |
|---|---|---|---|---|---|
| B-P0-01 | Ops | Backup artifact recuperável | Sim (dispatch) | Não | BLOQUEADO |
| B-P0-02 | Ops | Restore artifact real | Sim | Synth PASS | BLOQUEADO (real) |
| B-P0-03 | Ops | Smoke presencial | Sim | Roteiro PASS | PENDENTE |
| B-P0-04 | Integrity | Deny-list `120000` | — | Quarantine + CI fix | RESOLVIDO (código); CI revalidar |
| B-P0-05 | Security | INSERT fiscal remoto | Sim (apply pending-auth) | PGlite PASS | IMPLEMENTADO local |
| B-P1-01 | Tests | Financeiro comportamental completo | Parcial | Mínimo PASS | PARCIAL |
| B-P1-02 | Drift | 8 SSOT `remote_ausente` | Sim (apply seletivo) | Plano pronto | BLOQUEADO apply |
| B-P1-03 | Comercial | NF-e `163100` | Sim (decisão) | Matriz pronta | BLOQUEADO |
| B-CI-e2e | CI | e2e-playwright mobile | Sim / outro PR | — | BLOQUEIA merges |
| B-MT-01 | Multi | Sem `empresas` / vínculos | Sim (M1+) | Docs | NO-GO start |
| B-MT-02 | Multi | sync-outbox full catalog | Sim (M3) | — | CRITICAL |
| B-MT-03 | Multi | Tabelas globais sem escopo | Sim (M4) | — | CRITICAL |

## Separação rápida

**Só humano:** B-P0-01…03, B-P1-02/03, B-CI-e2e (se required), aprovação M1.  
**Já feito local:** B-P0-04, provas B-P0-05/P1-01 mínimas, restore synth, docs multi.
