# P0-2 — Evidência de backup (produção Jinlong)

> **Runbook canônico:** [`../runbooks/BACKUP_RESTORE_CANONICO.md`](../runbooks/BACKUP_RESTORE_CANONICO.md)  
> **Gate:** [`../regras-negocio/GATE_BACKUP_PRODUCAO.md`](../regras-negocio/GATE_BACKUP_PRODUCAO.md)  
> **JIT:** [`JIT_ALTERNATIVAS_DESBLOQUEIO.md`](./JIT_ALTERNATIVAS_DESBLOQUEIO.md)

---

## Reverificação 2026-10-08 (esta sprint)

**Classificação:** **FAIL** (inalterada — RPO não garantido)

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Plano org | **Free** | MCP `get_organization` → `plan: "free"` |
| Projeto | `jinlong` ACTIVE_HEALTHY `sa-east-1` | MCP `get_project` |
| Postgres | **17.6.1.084** | MCP `database.version` (OK para Temporary Access) |
| Backup nativo / PITR | **Não** no Free | Pricing + docs oficiais |
| Automação Opção B | Workflows **presentes** | `.github/workflows/backup-scheduled.yml` |
| Últimos runs schedule | **failure** (PAM/JIT) | ex.: run `37625648145` 2026-10-07 |
| Artifact prod &lt;25h | **Não** | 0 success recentes |
| Restore drill item 20 | **Não** (sem artifact success) | `backup-restore-test.yml` |
| Sonda direta no workflow | **Adicionada nesta sprint** (ainda sem run success) | `discover-db` + `guard:backup-jit` |
| `backup.sh` | Artefato local; **não** é o caminho Opção B | `backup.sh` |

**Conclusão:** mecanismo **nomeado** (Opção B / JIT + age + artifact), mas **não utilizável** enquanto PAM/JIT falhar. Meta D0-06 (RPO 24h) **não** demonstrada.

Aceite de risco **não** reclassifica FAIL → PASS (regra do sponsor 2026-10-08).

---

## Registro histórico 2026-08-31 (parcialmente obsoleto)

O registro de 2026-08-31 afirmava que nenhum workflow referenciava backup. Isso foi **superado** pela implementação Opção B (PR #389 e follow-ups). O veredito **FAIL** permanece porque a automação **não entrega** artifact.

Detalhe histórico completo (Free, sem PITR, restore não ensaiado) permanece válido quanto ao resultado; a coluna “como se tenta backup” mudou.

---

## Veredito

**FAIL** — sem cópia de produção comprovável com retenção automática funcional.

### Para reclassificar PASS

1. Success de `backup-scheduled` + artifact.  
2. Success de restore drill (item 20) ou DESTINO temporário (P0-3).  
3. Freshness ≤ 25h.  
4. Atualizar gate para `BACKUP_PRODUCTION_READY`.
