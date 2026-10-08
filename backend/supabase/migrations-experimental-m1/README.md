# M1 experimental — Fundação Multiempresa (LOCAL ONLY)

**Status:** PoC local · **NO-GO** apply remoto / produção / `db push`  
**Spec:** `docs/architecture/ESPEC_MULTIEMPRESA_V1.md` (D1–D19, etapas 1–3 + protótipo D16)

## Conteúdo

| Arquivo | Escopo |
|---|---|
| `20261009000000_m1_fundacao_multiempresa.sql` | DDL aditivo (`empresas`, `usuario_vinculos`, `plataforma_admins`, `lojas.empresa_id`), backfill Empresa 1, helpers `fp_*`, guardas RESTRICTIVE PoC |
| `../functions/sync-outbox/index.ts` (branch M1) | Catálogo filtrado por `loja_id` (XT-02) |

## Como aplicar (somente local / PGlite)

```bash
# Harness automatizado (recomendado)
cd backend && npm run test:m1-multiempresa

# Ou Postgres local com psql apontando para DB de laboratório — NUNCA Jinlong prod
psql "$DATABASE_URL_LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations-experimental-m1/20261009000000_m1_fundacao_multiempresa.sql
```

Este diretório **não** está em `supabase/migrations/` — o CLI / CI `db reset` **não** aplica automaticamente.

## Rollback

```sql
DROP POLICY IF EXISTS tenant_guard ON public.produtos;
DROP POLICY IF EXISTS tenant_guard ON public.clientes;
DROP POLICY IF EXISTS tenant_guard ON public.fornecedores;
DROP POLICY IF EXISTS tenant_guard ON public.contas_receber;
DROP POLICY IF EXISTS tenant_guard ON public.caixas;
-- helpers
DROP FUNCTION IF EXISTS public.fp_empresa_operacional(uuid);
DROP FUNCTION IF EXISTS public.fp_mesma_empresa(uuid, uuid);
DROP FUNCTION IF EXISTS public.fp_empresa_da_loja(uuid);
DROP FUNCTION IF EXISTS public.fp_pode_loja(uuid, text[]);
DROP FUNCTION IF EXISTS public.fp_lojas_permitidas(text[]);
DROP FUNCTION IF EXISTS public.fp_empresas_do_usuario();
DROP FUNCTION IF EXISTS public.fp_eh_plataforma();
DROP FUNCTION IF EXISTS public.fp_usuario_ativo();
DROP TABLE IF EXISTS public.usuario_vinculos;
DROP TABLE IF EXISTS public.plataforma_admins;
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_id_empresa_id_key;
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_empresa_id_codigo_key;
ALTER TABLE public.lojas DROP COLUMN IF EXISTS empresa_id;
DROP TABLE IF EXISTS public.empresas;
```

## Limites

- Não altera `usuarios.perfil` / `usuarios.loja_id` (D17).
- Guardas só em 5 tabelas PoC (D16).
- Compat ADMIN legado em `fp_pode_loja` até corte (D9/D10).
