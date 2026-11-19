# k6 — esqueleto de capacidade (Jinlong)

**NÃO executar contra produção.** Estes scripts abortam se a URL parecer prod ou se `CAPACITY_ENV` ≠ `staging`/`local`.

## Pré-requisitos

1. Checklist `../checklists/PRE_EXECUCAO_STAGING.md` completa.
2. [k6](https://k6.io/docs/get-started/installation/) instalado.
3. Variáveis:

```bash
export CAPACITY_ENV=staging   # ou local
export CAPACITY_ALLOWED_PROJECT_REF=YOUR_STAGING_REF   # obrigatório (20 chars)
export K6_SUPABASE_URL=https://YOUR_STAGING_REF.supabase.co
export K6_ANON_KEY=...
export K6_OPERADOR_EMAIL=op.l01.c01@capacity.staging.invalid
export K6_OPERADOR_PASSWORD=...
```

Ver também `STG01_HOMOLOGACAO_ISOLADA.md` e `.env.staging.example`.

## Comandos

```bash
# Guard + smoke (RPC path — implementar auth completa na FASE 3)
k6 run scenarios/smoke.js

# Piloto — só após smoke OK
k6 run -e K6_LOJAS=1 -e K6_CAIXAS_POR_LOJA=2 scenarios/peak.js
```

## Estado atual

Esqueleto da FASE 2: guard de ambiente + smoke mínimo.  
Auth multi-operador, payload canônico v4 e thresholds completos serão preenchidos **após** staging existir (FASE 3).
