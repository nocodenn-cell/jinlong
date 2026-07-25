# FastProduct monorepo — contexto operacional

## Módulos

| Módulo | Path | Papel |
|--------|------|--------|
| Painel / PDV web | `pdv-importados/` | Next.js App Router, Admin V2, caixa web |
| PDV offline | `pdv-local/` | Sync/offline |
| Backend | `backend/` | Supabase migrations, workers, scripts |

Não misture mudanças de módulos não relacionados na mesma missão.

## Validação local típica (`pdv-importados`)

```bash
cd pdv-importados
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:entity-ssot   # se tocar CRUD de entidades
```

Scripts úteis: `smoke:http`, `test:e2e:critical`, `test:e2e:post-deploy-smoke`, `env:check`.

## CI (GitHub Actions)

- `.github/workflows/ci-pdv-importados.yml`
- `.github/workflows/ci-pdv-local.yml`
- `.github/workflows/ci-backend-supabase.yml`
- `.github/workflows/secret-scan.yml`
- `.github/workflows/release-validate.yml` (SSRA, dispara em `deployment_status`)

O disparo do worker fiscal **não** vive no CI: é `pg_cron` no Supabase
(job `fiscal-worker-every-minute` → `internal.fiscal_worker_invoke()`).

Use `gh run list` / `gh run view <id> --log-failed` para diagnosticar.

## Vercel

Monitore deploy do projeto `pdv-importados` (preview da branch + production em `main`). Ready = ciclo pode avançar após CI verde.

## SSoT e governança

Respeitar `.cursor/rules/entity-ssot.mdc`, `security.mdc`, `governance.mdc`. Nunca hardcodar secrets. Não alterar migrations já aplicadas — só migrations novas ou scripts de verificação.

## Branching

Base: `origin/main`. Uma branch = uma missão = um PR quando houver entrega. Working tree: não commitar artefatos (`backend/artifacts/`, quarantine) a menos que a missão seja especificamente saneamento de repo.
