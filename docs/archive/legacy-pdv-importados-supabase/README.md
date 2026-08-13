# Arquivo histórico — `pdv-importados/supabase/` (SSOT paralelo de migrations)

**Arquivado em:** 2026-08-13 · **Origem:** `pdv-importados/supabase/` + `pdv-importados/EXECUTAR_MIGRATIONS*.sh`
**Motivo:** segundo SSOT de migrations, com caminho de aplicação executável capaz de regredir a RPC transacional canônica em produção.

> Conteúdo **histórico**. Nada aqui é aplicável a nenhum ambiente. O SSOT único de schema é
> **`backend/supabase/migrations/`** — ver ADR-011.

---

## Por que foi arquivado

O monorepo tinha **dois** diretórios de migrations. O canônico é `backend/supabase/migrations/`,
provado por:

| Evidência | Arquivo |
|---|---|
| Único `config.toml` de projeto Supabase CLI (`project_id = "fastproduct"`) | `backend/supabase/config.toml` |
| Guard de sequência aponta só para lá | `scripts/migration-sequence-guard.mjs:33` |
| Scripts de backport/forense/reconciliação referenciam só lá | `backend/supabase/scripts/*.mjs` |
| Testes de contrato leem só de lá | `pdv-importados/tests/finalize-v4-scope-guard.matrix.test.ts:13` |

O diretório arquivado **não** era consumido pelo Supabase CLI nem pelo CI. Era consumido por três
scripts de aplicação manual via `psql "$DATABASE_URL"`, documentados como procedimento oficial em
`RESUMO_EXECUCAO_MIGRATIONS.md`, `MIGRATIONS_INSTRUCTIONS.md` e `ANALISE_RLS_SECURITY.md`.

## O risco concreto (motivo de ser P0)

`EXECUTAR_MIGRATIONS_COMPLETAS.sh` aplicava, como passo 4 ("Robustez - Idempotência na RPC"):

```
migrations/obsolete/finalizar_venda_unificada.sql
```

Esse arquivo faz:

```sql
DROP FUNCTION IF EXISTS finalizar_venda_transacional_canonica_v2;      -- linha 5
CREATE OR REPLACE FUNCTION finalizar_venda_transacional_canonica_v3(   -- linha 8
    ... 18 argumentos ...
)
```

A produção roda **`finalizar_venda_transacional_canonica_v4` com 22 argumentos** e scope-guard de
loja/caixa (`backend/supabase/migrations/20260809120837_finalize_v4_scope_guard_22args.sql`).

`$DATABASE_URL` não tinha restrição de ambiente. Um operador ou agente seguindo a documentação do
próprio repositório, com essa variável apontando para produção, **recriaria uma RPC v3 sem
scope-guard** ao lado da v4 canônica. `rls_policies.sql` agravava: aplicava um modelo de RLS
alternativo, condicionado a uma feature flag (`feature_flag_ativa('ENABLE_RLS_POLICIES')`) que não
faz parte do modelo de RLS vigente.

Nenhuma evidência foi encontrada de que esses scripts tenham sido executados contra produção — o
inventário de reconciliação fecha em `onlyProd=0` e `nameMismatch=0`
(`backend/supabase/reports/reconcile-prod-repo-inventory.json`). O risco era **latente**, não
consumado.

## Conteúdo já coberto pelo SSOT canônico

Nenhum arquivo trazia conteúdo exclusivo. Todos têm equivalente vigente, com conteúdo divergente
(forks antigos — md5 diferentes):

| Arquivo arquivado | Equivalente canônico |
|---|---|
| `073_feature_flags.sql` | `backend/…/073_feature_flags.sql` + `20260621001300_217_feature_flags_rls_perfil_uppercase.sql` |
| `074_ordens_compra.sql` | `backend/…/109_ordens_compra.sql` |
| `075_localizacao_prateleira.sql` | `backend/…/20260621005500_258_produtos_localizacao_nome_reduzido.sql` |
| `rls_policies.sql` | Cadeia RLS vigente (`008`, `019`, `041`–`044`, `056`–`058`, …) |
| `performance_indices.sql` | Índices nas migrations vigentes (ex.: `222_drop_indices_duplicados`) |
| `migrations_completas.sql` | Agregador dos acima (71 linhas); sem DDL próprio |
| `obsolete/finalizar_venda_unificada.sql` | `20260809120837_finalize_v4_scope_guard_22args.sql` (v4/22 args) |

## Scripts desabilitados

Os três `EXECUTAR_MIGRATIONS*.sh` foram renomeados para `.sh.disabled` — preservados como
evidência, não invocáveis por nome. O conteúdo original está intacto no histórico Git
(`git log --follow -- pdv-importados/EXECUTAR_MIGRATIONS_COMPLETAS.sh`).

## Documentação arquivada junto

Os cinco `.md` abaixo existiam para ensinar o procedimento removido. Ficaram aqui porque suas
instruções deixaram de ter alvo — e porque instruíam exatamente o caminho perigoso:

| Documento | O que prescrevia |
|---|---|
| `MIGRATIONS_INSTRUCTIONS.md` | *"Execução Imediata - 5 Minutos"* → `export DATABASE_URL=… && ./EXECUTAR_MIGRATIONS.sh` |
| `RESUMO_EXECUCAO_MIGRATIONS.md` | Índice dos arquivos do SSOT paralelo como se fossem os vigentes |
| `ANALISE_RLS_SECURITY.md` | §"Passo 2: **Produção** (Controlado)" → rodar `EXECUTAR_MIGRATIONS_COMPLETAS.sh` contra produção |
| `INSTRUCOES_WINDOWS.md` | Variante PowerShell/CMD do mesmo procedimento (`.bat`) |
| `SOLUCAO_ERRO_WINDOWS.md` | Troubleshooting de como fazer os `.bat` rodarem |

Havia também **duas** variantes Windows dos scripts (`EXECUTAR_MIGRATIONS_COMPLETAS.bat`,
`EXECUTAR_MIGRATIONS_SEGURANCO.bat`), com o mesmo `psql "%DATABASE_URL%" -f` sobre os mesmos
arquivos — incluindo `obsolete\finalizar_venda_unificada.sql`. Também desabilitadas.

O tema legítimo levantado por `ANALISE_RLS_SECURITY.md` — RLS não deve depender de feature flag
para estar ativo — **não** se aplica ao modelo vigente: a RLS atual é habilitada diretamente pelas
migrations da cadeia canônica, sem flag intermediária. A matriz vigente é
[`docs/AUTHORIZATION_MATRIX.md`](../../AUTHORIZATION_MATRIX.md).

## Proteção contra recriação

`scripts/migration-sequence-guard.mjs` passou a falhar se qualquer diretório de migrations
aparecer fora de `backend/supabase/migrations/`. Roda em `npm run guard:all` e no CI.
