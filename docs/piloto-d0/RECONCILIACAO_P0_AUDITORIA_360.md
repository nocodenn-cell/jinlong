# Reconciliação — Planos P0 × Auditoria Jinlong 360° (2026-10-08)

**Decisão de produto:** 1A (operação contínua segura, 1 loja Matriz) + Free + destravar JIT.  
**Branch desta sprint:** `cursor/p0-estabilizacao-jit-1966`  
**HEAD de referência ao iniciar:** `ea917430`  
**Regra:** não duplicar trabalho concluído; não substituir evidência de recuperação por aceite de risco.

---

## Mapa de itens

| Item oficial | Fonte | Estado ao reconciliar | Ação nesta sprint | Depende de auth humana? |
|---|---|---|---|---|
| P0-1 Smoke loja | `SPRINT_ESTABILIZACAO_P0.md` | **PENDENTE** (presença/loja) | Não executável neste agente | Sim (loja/cliente) |
| P0-2 Backup mecanismo | `P0-2_BACKUP_EVIDENCIA.md` (desatualizado 08-31) | **FAIL** atualizado — Free + Opção B falha | Reverificar + documentar | Parcial |
| P0-3 Restore prod→temporário | `P0-3_HUMAN_GATE.md` | **BLOQUEADO** (DESTINO vazio; sem artifact) | Não executar | Sim (DESTINO + dump) |
| P0-4 Runbook 1 página | `PROXIMA_SPRINT.md` | **AUSENTE** (aguardava P0-2/3) | Redigir **honesto** (sem mentir backup) | Não |
| EXTERNAL-BLOCKER JIT | `ENCERRAMENTO_SPRINT_BACKUP_JIT…` | **ATIVO** — run 37625648145 PAM | Investigar + sonda direta no workflow | Dispatch pós-merge |
| Gate backup produção | `GATE_BACKUP_PRODUCAO.md` | `BACKUP_PRODUCTION_PENDING` | Manter até SUCCESS &lt;25h | Sim se JIT continuar |
| Restore formato CI | hardening 473–479 | `AUTOMATION_FORMAT_RESTORE_PASS` / `RESTORE_DRILL_PASS` local | **Não reexecutar** (já feito; não é dump prod) | Não |
| Fiscal / multiempresa / billing | Auditoria 360° | Fora do escopo 1A | **Não tocar** | — |
| Integridade financeira / perms remotas | P1 oficial | Só após P0 PASS | Adiado | Sim (remoto) |

---

## O que mudou desde P0-2 de 2026-08-31 (não duplicar)

| Afirmação antiga (08-31) | Estado 2026-10-08 |
|---|---|
| `backup.sh` não referenciado em workflows | **Obsoleto** — Opção B em `backup-scheduled.yml` + restore/freshness |
| Nenhum job de backup | **Falso** — cron diário; **0 success / 8+ failure** recentes |
| Plano Free | **Confirmado** via MCP `get_organization` → `plan: free` |
| PG version | **17.6.1.084** (MCP `get_project`) — **≥ 17.6.1.081** exigido pelo Temporary Access |
| Restore ensaiado de produção | Continua **não** |

---

## Achados da auditoria 360° já cobertos pelos planos oficiais

- Backup/RPO → P0-2/P0-3 + GATE  
- Smoke loja → P0-1  
- Runbook incidente → P0-4  
- Drift / AR-AP / perms negativas → P1 (após P0)

**Não reabrir** como missão paralela nesta sprint.

---

## Critério GO operação contínua (1A)

Todos obrigatórios:

1. Artifact `jinlong-backup-*` de run **success** com idade ≤ 25h  
2. Restore drill item 20 **success** (Postgres efêmero CI) **ou** restore em DESTINO temporário autorizado  
3. Gate → `BACKUP_PRODUCTION_READY`  
4. P0-1 smoke loja PASS **ou** bloqueio escrito do cliente com reagendamento  
5. Runbook coerente com o mecanismo **provado**

Enquanto (1)–(3) falharem → **NO-GO** operação contínua (regra explícita do sponsor: sem aceite de risco substituto).
