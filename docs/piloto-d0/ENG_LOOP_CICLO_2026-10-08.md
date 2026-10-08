# Engineering Loop — ciclo 2026-10-08 (P0/P1 Jinlong)

## Missão do ciclo

Reduzir bloqueadores de operação contínua via PRs #488 / #489 / #485, sem produção/merge/deploy/backup remoto.

## Correções realizadas

### PR #488
- Quarantine real: `20261006120000` → `migrations-forbidden/` (CLI não aplica).
- `20261008120000` → `migrations-pending-auth/` (reduz drift falso; apply só com auth).
- Guard falha se SQL proibido reaparecer em `migrations/`.
- Fiscal PGlite carrega SQL real + caso re-GRANT (defesa em profundidade).
- Claims financeiros alinhados ao que a suíte realmente prova.

### PR #489
- Restore sintético executa com Postgres local (sem Docker).
- Checklist smoke validado estaticamente vs requisitos da missão.

### PR #485
- Doc de readiness para aprovação humana; `guard:backup-jit` PASS.
- CI vermelho classificado (drift SSOT + e2e mobile pré-existentes).

## Testes

| Suite | Resultado | Evidência |
|---|---|---|
| `assert:forbidden-migrations` | **PASS** | `/opt/cursor/artifacts/eng-loop-488-tests.log` |
| `test:forbidden-migrations` | **PASS** 5/5 | idem |
| `test:migration-status` | **PASS** 13/13 | idem |
| `test:fiscal-insert-auth` | **PASS** 5/5 | idem |
| `test:financeiro-comportamental` | **PASS** 4/4 | idem |
| `guard:migrations` / `guard:forbidden-migrations` | **PASS** | shell |
| `restore-synthetic-local.sh` | **PASS** (MODE=local) | `/opt/cursor/artifacts/p0-02-restore-synthetic-pass.log` |
| Smoke checklist estático | **PASS** | `SMOKE_CHECKLIST_VALIDACAO_ESTATICA.md` |
| Smoke presencial loja | **SKIP** | auth humana |
| Backup remoto / artifact | **SKIP** | auth humana |
| `guard:backup-jit` (#485) | **PASS** | `/opt/cursor/artifacts/eng-loop-485-guard-backup.log` |
| CI `migration-remote-drift` (#485/#488) | **FAIL** esperado | 8 SSOT `remote_ausente` |
| CI `e2e-playwright` (#485) | **FAIL** | UI mobile pré-existente |

## GO/NO-GO

| Alvo | Decisão |
|---|---|
| PR #488 (integridade) | **GO CONDICIONAL** review — drift dos 8 SSOT permanece até apply auth |
| PR #489 (recuperação ops) | **GO** para merge de docs/script (restore sintético PASS) |
| PR #485 (backup) | **GO CONDICIONAL** review — merge só com aceite de CI vermelho ou follow-up e2e/drift |
| **Operação contínua** | **NO-GO** |

## Bloqueadores restantes (humanos)

1. Merge consciente + **um** dispatch `backup-scheduled`.  
2. Restore de artifact real em DESTINO isolado.  
3. Smoke presencial.  
4. Apply seletivo SSOT (sem `120000`, sem `163100` até GO comercial).  
5. e2e mobile (`navigation` strict / etiquetas) se for required check.

## Dependências

```text
#489 restore synth PASS ──não implica──► restore prod
#488 quarantine ──reduz risco──► db push acidental de 120000
#485 merge ──necessário mas insuficiente──► backup artifact
artifact SUCCESS + restore prod + smoke loja ──► GO operação contínua
```
