# P0-02 — Restore sintético local (procedimento)

**Status:** procedimento + script · restore de artifact **real de produção** = **NÃO VALIDADO** (proibido sem auth).

## Objetivo

Validar a **mecânica** de restore (ordem roles→schema→data, checksum, contagens) com dump sintético gerado localmente — sem dados de clientes.

## Pré-requisitos

- Docker com `postgres:17-alpine` **ou** Postgres 17 local  
- `age`, `psql`, `sha256sum`  
- Script: [`scripts/restore-synthetic-local.sh`](../../scripts/restore-synthetic-local.sh)

## Sequência

1. Gerar schema+data sintéticos mínimos (lojas/produtos/vendas fake UUIDs).  
2. Cifrar com `age` (chave efêmera do script).  
3. Checksum SHA-256 dos `.age`.  
4. Subir Postgres 17 efêmero.  
5. Decifrar → `psql` na ordem: roles (se houver) → schema → `SET session_replication_role = replica` → data.  
6. Validar `count(*)` vs manifesto.  
7. Destruir container e arquivos plaintext.

## RPO / RTO (meta D0 — não SLA)

| Métrica | Meta piloto | Neste drill sintético |
|---|---|---|
| RPO | 24h | N/A (não é dump prod) |
| RTO | 4–8h úteis | Cronometrado pelo script (segundos–minutos) |

## Restore de artifact real (GitHub Actions)

**NÃO EXECUTAR** até autorização específica. Quando autorizado:

1. Baixar `jinlong-backup-<run_id>` de run **success**.  
2. Verificar `checksums.sha256`.  
3. Decifrar com `BACKUP_AGE_PRIVATE_KEY` **só** em runner/DESTINO isolado.  
4. Restore **nunca** no project ref Jinlong.  
5. Comparar manifesto agregado (sem PII no Git).  
6. Destroy DESTINO.

Ver [`BACKUP_RESTORE_CANONICO.md`](../runbooks/BACKUP_RESTORE_CANONICO.md) e P0-3 human gate.

## Limite do que este procedimento prova

| Prova | Sim/Não |
|---|---|
| Formato age + checksum + ordem SQL | Sim (local) |
| Backup JIT de produção recuperável | **Não** |
| Storage buckets / Edge secrets | **Não** |
