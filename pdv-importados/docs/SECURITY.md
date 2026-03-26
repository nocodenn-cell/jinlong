# Seguranca — dependencias (pdv-importados)

Ultima revisao: **2026-03-20**

## Resumo

| Severidade | Antes (2026-03-20) | Depois das acoes | Observacao |
|------------|--------------------|------------------|------------|
| Critical   | 1                  | 0                | `next` atualizado para **15.5.x** (patched) |
| High       | 0                  | 0                | — |
| Moderate   | 5                  | 5                | Cadeia **esbuild / vite / vitest** (dev only) |
| Low        | 0                  | 0                | — |

## Acoes realizadas

- `npm audit fix` (sem `--force`): nenhuma alteracao automatica segura aplicavel ao alerta do Next.
- **Upgrade manual:** `next` e `eslint-config-next` para **^15.5.14** para endereçar CVEs agregadas no relatório do `npm audit` para Next 15.0.x.

## Pendencias justificadas (Moderate)

- **GHSA-67mh-4wv8-2f99** (esbuild): afeta principalmente o **servidor de desenvolvimento** do Vite/Vitest. Correcao plena costuma exigir `npm audit fix --force` (ex.: Vite 8), com **breaking changes**. **Risco em producao:** baixo (Vitest/Vite nao entram no bundle Next de producao).
- Monitorar releases de **vitest** / **vite** e planejar upgrade em PR dedicado.

## Boas praticas do projeto

- Nunca commitar `.env` / `.env.local` (ver `.gitignore` na raiz do monorepo).
- Service role Supabase apenas server-side; nunca `NEXT_PUBLIC_*` para secrets.
- Edge `sync-outbox`: autenticacao via `X-SYNC-KEY` + secrets no Supabase.

## Proxima revisao

- Reexecutar `npm audit` após upgrades de Vitest/Vite ou a cada sprint.
