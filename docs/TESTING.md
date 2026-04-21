# Testing Guide

## Teste de escopo RLS (local)

Este teste valida autorização por perfil (`OPERADOR`, `GERENTE`, `DONO`, `ADMIN`) usando Supabase local e JWT real.

## Pré-requisitos

- Docker em execução.
- Dependências instaladas na raiz do monorepo:

```bash
npm ci
```

## Passo a passo

1) Subir stack local:

```bash
cd backend
npx supabase start
```

2) Resetar banco local (migrations + seed base):

```bash
npx supabase db reset --local --yes
```

3) Exportar envs da stack local para o terminal atual:

```bash
eval "$(npx supabase status -o env | sed 's/^/export /')"
```

4) Rodar teste de escopo RLS:

```bash
npm run test:rls-scope -w fastproduct-backend
```

5) Encerrar stack local:

```bash
npx supabase stop --project-id fastproduct --no-backup
```

## Variáveis de ambiente suportadas

O script usa defaults para usuários de teste, mas permite override:

- `RLS_OPERADOR_EMAIL` / `RLS_OPERADOR_PASSWORD`
- `RLS_GERENTE_EMAIL` / `RLS_GERENTE_PASSWORD`
- `RLS_DONO_EMAIL` / `RLS_DONO_PASSWORD`
- `RLS_ADMIN_EMAIL` / `RLS_ADMIN_PASSWORD`

Também requer envs da stack local (gerados por `supabase status -o env`):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (somente para seed determinístico)
- `POSTGRES_URL` (seed SQL determinístico)

## Interpretação do resultado

- `PASS`: regra de autorização validada.
- `FAIL`: quebra de escopo/permissão detectada.
- Exit code `0`: suíte aprovada.
- Exit code `1`: uma ou mais regras falharam (bloqueador em CI).
- Exit code `2`: erro de execução/configuração.

## CI

O workflow backend possui o job `test-rls-scope` com Supabase local isolado por job.
Para torná-lo obrigatório no merge, configure branch protection na branch alvo (`main`/`develop`) exigindo sucesso desse job.
