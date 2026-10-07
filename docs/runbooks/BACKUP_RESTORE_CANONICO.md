# Runbook canônico — Backup & Restore (Jinlong)

> **Referência única** para recuperação de dados. Documentos históricos (`P0-2`, `P0-3`, auditoria) apontam para este arquivo.
>
> **Produção (ORIGEM):** projeto `jinlong` · ref `PROJECT_REF_JINLONG` · org `NatureCode` (`ORG_ID_NATURECODE`)
>
> **Segredos:** nunca commitar `PGPASSWORD`, `service_role` ou connection strings reais. Usar env local / secret manager.

---

## Estado (reverificação 2026-10-07)

| Campo | Valor |
|-------|-------|
| Plano org (API Management) | **Free** (histórico; confirmar no painel) |
| Backup automático plataforma | **Não** no Free |
| PITR | **Não** no Free |
| Script repo `backup.sh` | Existe (`pg_dump -Fc` + retenção dias) — **sem cron/workflow agendado** |
| Storage off-site | **Não** automatizado |
| Criptografia em trânsito | TLS do Postgres/Supabase; artefato dump: proteger no storage (ACL + opcional age/gpg) |
| Restore ensaiado (local isolado) | **SIM — 2026-10-07** → `RESTORE_DRILL_PASS` |
| Restore ensaiado (DESTINO Supabase remoto) | **Não** (gate humano) |
| RPO / RTO alvo (estágio atual) | **RPO = 24h** · **RTO = 4h úteis** |

### Inventário: real vs só documentado

| Capacidade | Existe de fato? | Notas |
|------------|-----------------|-------|
| `backup.sh` | Sim (repo) | Requer `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` |
| Agendamento | **Não** | Sem GitHub Action / cron comprovado |
| Retenção | Só no script (`RETENTION_DAYS=7`) | Só se alguém rodar o script |
| Backup Pro/PITR | Documentado | Não contratado |
| Runbook | Este arquivo | Atualizado pós-drill |
| Drill local | **Feito** | Artefatos em `/opt/cursor/artifacts/hardening-backup/` (ambiente agent; não é backup de produção) |

**Produção Jinlong:** gap de backup sustentado permanece (**ACHADO P1**) até Opção A (Pro) ou Opção B (cron + off-site) autorizada.

---

## RPO / RTO (executáveis agora)

| Meta | Valor | Justificativa |
|------|-------|---------------|
| **RPO** | **24h** | Uma cópia consistente por dia basta para o estágio atual; sem PITR não prometemos minutos |
| **RTO** | **4h úteis** | Drill local restaurou em minutos; buffer para provisionar DESTINO, secrets, DNS e validação |

Não comprar infra complexa preventivamente. Escolher **uma** linha:

- **Opção A:** Supabase Pro → backup diário gerenciado (menor risco operacional).
- **Opção B:** `backup.sh` diário + storage off-site + alerta se dump > 24h.

---

## Pré-condições

1. Destino **isolado** (nunca sobrescrever ORIGEM sem ordem escrita).
2. Cliente `pg_dump` / `pg_restore` **major ≥ dump** (dump atual = archive **1.16** → **PostgreSQL 17+**).
3. Target com roles Supabase (`authenticated`, `anon`, `service_role`, …) **ou** imagem `public.ecr.aws/supabase/postgres:17.x`.
4. Variáveis só em ambiente seguro (não no Git).
5. Autorização humana para qualquer ação em dados reais.

---

## Backup (Opção B — dump)

```bash
export PGHOST=... PGPORT=5432 PGDATABASE=postgres PGUSER=... PGPASSWORD=...
export OUT_DIR=/var/backups/fastproduct   # ou path off-site montado
export RETENTION_DAYS=7
./backup.sh
sha256sum "$OUT_DIR"/fastproduct_*.dump | tee "$OUT_DIR"/latest.sha256
```

Registrar: comando, timestamp, tamanho, hash, local de armazenamento.

### Evidência drill local (2026-10-07)

| Campo | Valor |
|-------|-------|
| Dump | `jinlong_hardening_1791395882311.dump` |
| Bytes | 1 940 607 |
| SHA-256 | `8f5007acd3a4c612d4c12c330fa6f460306a2802c9cef4ca7e9696af6f79be7c` |
| Dataset | produtos/estoque/vendas/pagamentos/caixa fechado/snap por forma/CR |

---

## Validação do artefato

```bash
pg_restore -l "$DUMP" | head   # lista TOC; falha se major do cliente < dump
sha256sum -c latest.sha256
```

---

## Restore (DESTINO isolado)

### Docker Supabase PG17 (padrão ensaiado)

```bash
docker rm -f restore_dest || true
docker run -d --name restore_dest \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=supabase_admin \
  -e POSTGRES_DB=postgres \
  -p 54329:5432 \
  public.ecr.aws/supabase/postgres:17.6.1.165
# aguardar ready
docker cp "$DUMP" restore_dest:/tmp/app.dump
docker exec restore_dest pg_restore -U supabase_admin -d postgres \
  --clean --if-exists --no-owner --no-acl /tmp/app.dump
```

### Verificação pós-restore

```sql
SELECT 'produtos' t, count(*) FROM produtos
UNION ALL SELECT 'estoque', count(*) FROM estoque
UNION ALL SELECT 'vendas', count(*) FROM vendas
UNION ALL SELECT 'vendas_pagamentos', count(*) FROM vendas_pagamentos
UNION ALL SELECT 'caixas', count(*) FROM caixas
UNION ALL SELECT 'caixas_fechamento_formas', count(*) FROM caixas_fechamento_formas
UNION ALL SELECT 'contas_receber', count(*) FROM contas_receber
UNION ALL SELECT 'contas_pagar', count(*) FROM contas_pagar;

SELECT version FROM supabase_migrations.schema_migrations
 WHERE version >= '20261007161220' ORDER BY version;

-- Explicabilidade fechamento (exemplo)
SELECT forma_pagamento, metrica, valor_sistema_snapshot, valor_informado
FROM caixas_fechamento_formas ORDER BY 1;
```

Comparar contagens críticas com o manifesto do backup. Auth/RLS: roles + `relrowsecurity` nas tabelas críticas.

**Drill local:** `RESTORE_DRILL_PASS` (0 erros `pg_restore` na imagem Supabase).

---

## Rollback

- Se restore no DESTINO falhar: destruir DESTINO; manter ORIGEM intacta; reintentar com cliente/imagem corretos.
- Se DESTINO era cutover: **não** apontar app para DESTINO até verificação PASS; rollback = DNS/env de volta à ORIGEM.

---

## Erros comuns

| Sintoma | Causa | Ação |
|---------|-------|------|
| `unsupported version (1.16) in file header` | `pg_restore` &lt; PG17 | Usar cliente 17+ / imagem Supabase 17 |
| `role "authenticated" does not exist` | Postgres bare | Restaurar em imagem Supabase ou criar roles antes |
| `turbo: not found` / checks locais | Tooling env | Não confundir com falha de restore |
| Dump sem hash | Processo incompleto | Sempre gravar `sha256` no manifesto |

---

## Opção A — Supabase Pro (referência)

Menor risco quando autorizada: backup diário + restore to new project. Metas RPO≤24h / RTO≤4h úteis. Ver histórico de IDs 183–187 abaixo.

---

## IDs auditoria (histórico)

| ID | PASS quando |
|----|-------------|
| 183 | Backup automático real ativo (Pro+) **ou** Opção B monitorada |
| 184 | Lista/captura comprova execuções recentes |
| 185 | Restore em DESTINO isolado + contagens — **drill local PASS 2026-10-07**; remoto pendente |
| 186 | RPO documentado ≤ 24h **sustentado** pelo mecanismo |
| 187 | RTO medido ≤ 4h úteis (atualizado) |

**Produção:** não marcar gap de backup Jinlong CLOSED até 183–185 no DESTINO/ORIGEM reais.

---

## Responsável

| Papel | Quem |
|-------|------|
| Executar backup/restore | Ops / engenharia on-call |
| Autorizar cutover / Pro | Dono do produto (humano) |
| Atualizar este runbook | Após cada drill |

Referências: D0-06, `P0-2_BACKUP_EVIDENCIA.md`, `P0-3_HUMAN_GATE.md`, [INTEGRACAO_HARDENING_473_479.md](../regras-negocio/INTEGRACAO_HARDENING_473_479.md).
