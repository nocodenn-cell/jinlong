# AUDITORIA DE PRONTIDÃO PARA CLIENTE PAGANTE — JINLONG

> Documento canônico da prontidão operacional. Atualizado incrementalmente por gap.

| Campo | Valor |
|-------|-------|
| **SHA auditada (auditoria inicial)** | `9e6292838f708cd0e5b0404a09601dd7c4047591` |
| **Última atualização** | 2026-08-31 (frente P0 backup/restore) |

---

## Atualização P0 — Backup / Restore (IDs 183–187)

**Reverificação:** 2026-08-31 via Supabase Management API (MCP), somente leitura.

| ID | Capacidade | Prioridade | Status | Evidência | Bloqueia piloto? |
|----|------------|------------|--------|-----------|------------------|
| 183 | Backup automático | P0 | **NÃO IMPLEMENTADO** | Org `NatureCode` plano **Free** (`get_organization`); Free não inclui daily backups ([pricing](https://supabase.com/pricing)) | **Sim** |
| 184 | Evidência de execução | P0 | **NÃO IMPLEMENTADO** | Sem lista de backups; `backup.sh` não agendado; API backups não consultada (sem token) | **Sim** |
| 185 | Restore comprovado | P0 | **NÃO IMPLEMENTADO** | P0-3 não executado; nenhum DESTINO isolado validado | **Sim** |
| 186 | RPO conhecido | P0 | **NÃO IMPLEMENTADO** | Meta D0-06: ≤24h — **NÃO ATENDE** (sem mecanismo) | **Sim** |
| 187 | RTO conhecido | P0 | **NÃO IMPLEMENTADO** | Meta D0-06: ≤8h — **NÃO ATENDE** (sem drill) | **Sim** |

**Runbook:** [`docs/runbooks/BACKUP_RESTORE_CANONICO.md`](runbooks/BACKUP_RESTORE_CANONICO.md)  
**Evidência histórica + atual:** [`docs/piloto-d0/P0-2_BACKUP_EVIDENCIA.md`](piloto-d0/P0-2_BACKUP_EVIDENCIA.md)  
**Gate restore:** [`docs/piloto-d0/P0-3_HUMAN_GATE.md`](piloto-d0/P0-3_HUMAN_GATE.md)

### Decisão recomendada (menor caminho para PASS)

**Opção A — Supabase Pro (gerenciado):** ~$25/mês + compute; daily backup 7d; restore to new project; RPO ≤24h após primeiro backup.

**Opção B — Dump externo:** maior complexidade/risco; só se A inviável.

**GAP CLOSED:** **Não** — aguarda upgrade autorizado + restore drill validado.

---

## Matriz completa (250 itens)

A matriz integral da auditoria inicial está pendente de commit neste repositório. Demais IDs permanecem conforme auditoria de 2026-08-31 até atualização por gap.

---

## Decisão final de prontidão (global)

# NOT READY FOR PAID PILOT

Bloqueador ativo: **IDs 183–187 (backup/restore)**.
