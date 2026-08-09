# Diagnóstico Vercel — `npm ci` (2026-08-08)

**Deployment falho:** `dpl_Xc9ZkWVoevbYksRd22HS64PTNn5F` · commit `7932639f` · branch `cursor/reconciliacao-supabase-audit-633a`  
**Deployment anterior OK:** `dpl_8nPWPx1JfDkDtc4o65eErWxqbo5R` · commit `0aca40a9`

## Sintoma (Vercel)

```
Running "install" command: `npm ci`...
Exit prior to config file resolving
cause
call config.load() before reading values
Error: Command "npm ci" exited with 1
```

**Aviso paralelo:** `Warning: Failed to fetch one or more git submodules`

## Causa raiz

| # | Causa | Arquivo | Evidência |
|---|--------|---------|-----------|
| **1 (bloqueante)** | **`backend/package.json` JSON inválido** no commit `7932639f` | `backend/package.json` | Ao adicionar `check:phase3-2`, o script **`test:rls-scope` foi removido** e ficou **vírgula trailing** após a última chave de `scripts` → `python3 -m json.tool` falha. Com **Node 24 + npm 11**, `npm ci` a partir de **`pdv-importados`** (Root Directory Vercel) aborta `config.load()` e emite exatamente a mensagem acima. |
| **2 (não bloqueante)** | **Gitlink órfão** sem entrada em `.gitmodules` | `.claude/worktrees/agent-afc719758625fd975` | `git submodule status` → `fatal: no submodule mapping found in .gitmodules for path '...'`. Vercel tenta fetch de submodule e avisa; **não explica** o exit code 1 do npm. |

### O que **não** foi a causa

- `package-lock.json` desatualizado (local `npm ci` OK com lock intacto após JSON válido)
- `.npmrc` (`engine-strict=true` — OK)
- Incompatibilidade Node 24 × npm 11 por si só (reproduzida só com JSON quebrado)
- Migrations Supabase / Fase 3.2 SQL (install falha antes do build)

## Reprodução local

```bash
# Node alinhado à Vercel (projeto: nodeVersion 24.x)
nvm use 24
cd pdv-importados
# Com backend/package.json inválido (commit 7932639f):
npm ci   # → Exit prior to config file resolving / call config.load()...
```

Com `backend/package.json` válido (JSON correto + `test:rls-scope` restaurado): **`npm ci` OK**.

## Configuração Vercel relevante

| Campo | Valor |
|-------|--------|
| Root Directory | `pdv-importados` (confirmado em docs/CICD) |
| Install Command | `npm ci` (override painel; Turbo detectado) |
| Node | **24.x** (API `get_project`) |
| `packageManager` (raiz) | `npm@10.9.2` (Corepack; npm efetivo no Node 24 ≈ 11.x) |

## Correção aplicada (isolada)

1. **`backend/package.json`** — JSON válido; restaura `test:rls-scope`; mantém `check:phase3-2` sem vírgula trailing.
2. **`.gitignore`** — ignora `.claude/worktrees/`; remove gitlink do índice (warning submodule).

Sem alteração de código app, RPC ou migrations.

## Gates pós-fix

- `npm ci` (Node 24, cwd `pdv-importados`) — OK
- `node backend/supabase/scripts/validate-phase3-2.mjs` — OK (escopo reconciliação)

## Fase 3.2 produção

Permanece **HUMAN GATE** — este fix só destrava **Preview/CI Vercel**; não autoriza apply em prod.
