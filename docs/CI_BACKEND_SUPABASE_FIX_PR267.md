# CI backend Supabase — correções PR #267 (2026-08-08)

## Alterações

1. **Backports Fase 1:** terminadores `;` normalizados (`normalize-backport-sql-terminators.mjs --write`, 25 arquivos).
2. **`migration-remote-drift`:** `p0-migration-status.mjs` classifica drift bloqueante vs informativo (Fase 3.2 git-only `20260808130200`, espelhos numéricos 205–289).
3. **`rls-rest-gate`:** smoke REST contra **stack Supabase local** + JWTs obtidos via `fetch-rls-smoke-jwts.mjs` após `seed-dev-users.mjs` (secret `PLAYWRIGHT_TEST_PASSWORD`).

## E2E crítico (workflow separado — run `31258997317`)

| Evidência | Detalhe |
|-----------|---------|
| Step | `Pipeline E2E crítico` |
| Causa | Secrets presentes (`missing=()`), falha `UNAUTHORIZED` durante `test:e2e:critical` — credenciais/ambiente Supabase do Preview não autorizam o fluxo |
| Ação | **Não corrigido neste PR** — configurar secrets listados em `docs/E2E.md` / mensagem `::error::E2E crítico: defina os secrets ...` |

## Gates locais (agente cloud)

| Gate | Resultado |
|------|-----------|
| `node backend/supabase/scripts/validate-phase1-backport.mjs` | (rodar pós-commit) |
| `supabase db reset --local` | Depende de Docker no ambiente |
| `node backend/scripts/p0-migration-status.mjs` | Requer projeto linkado |

## Fase 3.2

Migration `20260808130200_*` **não alterada**. Drift desta versão permanece **informativo** até HUMAN GATE.

## E2E crítico

Tratado em run separado — ver tabela acima (`31258997317`).
