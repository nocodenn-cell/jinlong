# Integração + hardening operacional — #473…#479

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Branch evidência** | `cursor/integracao-hardening-operacional-7da4` |
| **Tip stack** | `9f72ce56` (#479) |

## 1. Estratégia

Ver [STACK_INTEGRACAO_473_479.md](./STACK_INTEGRACAO_473_479.md).

**Recomendação:** Estratégia 2 — merge do tip consolidado (#479) + fechar pais como supersedidos. Sem cherry-pick.

## 2. Migrations locais

Aplicadas em banco isolado (`ssot_hardening_db` / Supabase Postgres 17.6) a partir de limpo (com stubs `storage.buckets` / `auth.jwt` quando necessário):

`20261007161220` → `…63000` → `…63100` → `…63200` → `…70000` → `…71000` → `…80000` → `…90000`.

RPCs: `calcular_valor_sistema_por_forma_caixa`, `listar_caixas_fechamento_formas`, `fechar_caixa_atomico`, `fiscal_marcar_cancelado`.

## 3. Regressões

| Check | Resultado |
|-------|-----------|
| Vitest SSoT + fechamento por forma (44) | PASS |
| `check:entity-ssot` | PASS |
| `typecheck` (pdv-importados) | PASS |
| `build` (pdv-importados) | PASS |
| `lint` | PASS (1 warning legado e2e `any`) |
| `check:edge` | **Não executável** — `turbo` ausente no ambiente (tooling; app não alterada) |

## 4. Backup

| Campo | Valor |
|-------|-------|
| Comando | `pg_dump -Fc` (PG17) |
| Arquivo | `/opt/cursor/artifacts/hardening-backup/jinlong_hardening_1791395882311.dump` |
| Bytes | 1 940 607 |
| SHA-256 | `8f5007acd3a4c612d4c12c330fa6f460306a2802c9cef4ca7e9696af6f79be7c` |
| TS | 2026-10-07T17:58:02Z |

## 5. Restore

Destruir container → recriar `public.ecr.aws/supabase/postgres:17.6.1.165` → `pg_restore --clean --if-exists --no-owner --no-acl` → **0 erros**.

Pré/pós: produtos=16, estoque=16, vendas=3, pagamentos=4, caixas=1, snap=4, CR=1. RPC por forma = snapshot. RLS on.

**`RESTORE_DRILL_PASS`**

## 6. RPO / RTO

| Meta | Valor | Justificativa |
|------|-------|---------------|
| **RPO alvo** | 24h | Objetivo de estágio |
| **RPO efetivamente garantido** | **`NÃO GARANTIDO`** | Free sem backup nativo; Opção B falha (JIT/PAM) — ver [GATE_BACKUP_PRODUCAO.md](./GATE_BACKUP_PRODUCAO.md) |
| **RTO esperado** | **4h úteis** | Restore ensaiado em minutos em DB isolado; buffer para DNS/secrets/validação humana |

## 7. Smoke local

Seed controlado + pós-restore: PIX snap=pagos; DINHEIRO E(c)=valor_inicial(50)+pagos(120)=170; informado=170.  
**`LOCAL_OPERATIONAL_SMOKE_PASS`** (SQL/RPC; não UI browser completa).

## 8. Loja

Checklist: [CHECKLIST_SMOKE_MAQUINA_LOJA.md](../runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md) → **`STORE_SMOKE_PENDING`**.

## 9. Achados

| ID | Sev | Evidência | Impacto | Recomendação |
|----|-----|-----------|---------|--------------|
| ACHADO-RESTORE-CLIENT | P2 | Host PG16 / bare PG17: archive 1.16 ou role `authenticated` missing | Restore falha se imagem/cliente errados | Pin PG17 + imagem Supabase no runbook |
| ACHADO-CHECK-EDGE-TURBO | P2 | `turbo: not found` em `npm run check:edge` | Gate edge não medido neste ambiente | Instalar deps monorepo / não alterar app só por tooling |
| ACHADO-PROD-BACKUP-GAP | P1 | Org Free; sem cron de `backup.sh` em produção | RPO 24h **não sustentado** em Jinlong remoto até Opção A ou B agendada | Autorizar Pro **ou** cron dump off-site + monitoramento |

## 10. Gates

1. **STACK:** `STACK_READY_TO_MERGE`
2. **RECUPERAÇÃO:** `RESTORE_DRILL_PASS` (drill local; produção ainda depende de ACHADO-PROD-BACKUP-GAP)
3. **OPERAÇÃO:** `LOCAL_OPERATIONAL_SMOKE_PASS` + `STORE_SMOKE_PENDING`

**Não mergeado. Nenhum módulo novo iniciado.**
