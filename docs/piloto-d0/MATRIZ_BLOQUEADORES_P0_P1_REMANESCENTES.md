# Matriz de bloqueadores P0/P1 remanescentes

**Atualizado:** 2026-10-08 (M1 experimental + revalidação CI)

| ID | Tipo | Descrição | Humano? | Local? | Estado |
|---|---|---|---|---|---|
| B-P0-01 | Ops | Backup artifact recuperável | Sim (dispatch) | Não | BLOQUEADO |
| B-P0-02 | Ops | Restore artifact real | Sim | Synth PASS | BLOQUEADO (real) |
| B-P0-03 | Ops | Smoke presencial | Sim | Roteiro PASS | PENDENTE |
| B-P0-04 | Integrity | Deny-list `120000` | — | Quarantine + fixtures | RESOLVIDO código (#488) |
| B-P0-05 | Security | INSERT fiscal remoto | Sim (apply pending-auth) | PGlite PASS | IMPLEMENTADO local |
| B-P0-06 | Types | types-drift pós-quarentena | — | migs `140000`+`140100` | **RESOLVIDO** CI PASS tip `da0ff15d` |
| B-P1-01 | Tests | Financeiro comportamental completo | Parcial | Mínimo PASS | PARCIAL |
| B-P1-02 | Drift | 8 SSOT `remote_ausente` | Sim (apply seletivo) | Plano pronto | BLOQUEADO apply |
| B-P1-03 | Comercial | NF-e `163100` | Sim (decisão) | Matriz pronta | BLOQUEADO |
| B-CI-e2e | CI | e2e-playwright mobile | Sim / outro PR | — | BLOQUEIA merges |
| B-MT-01 | Multi | Schema empresas/vínculos | Sim (promover) | M1 experimental PASS | LOCAL ONLY |
| B-MT-02 | Multi | sync-outbox full catalog | Review PDV | Mitigado no branch M1 | AGUARDA smoke |
| B-MT-03 | Multi | Tabelas globais sem escopo | Sim (M2+) | Inventário | CRITICAL |
| B-MT-04 | Multi | RPCs DEFINER P0 | Sim (M2) | — | CRITICAL |

## Separação

**Só humano:** B-P0-01…03, B-P1-02/03, B-CI-e2e, promoção DDL M1, aceite drift.  
**Feito local nesta sprint:** B-P0-06, M1 isolamento 8/8, XT-02 mitigação no branch experimental.
