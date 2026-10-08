# GO / NO-GO — Operação contínua (1 loja Matriz) — 2026-10-08

**Alvo:** decisão 1A (operação contínua segura).  
**Backup:** Free + destravar JIT (sem aceite de risco substituto).  
**Branch:** `cursor/p0-estabilizacao-jit-1966`

---

## Veredito

| Decisão | Status |
|---|---|
| Piloto presencial supervisionado | **GO CONDICIONAL** (inalterado — exige P0-1 na loja) |
| **Operação real contínua** | **NO-GO** |
| Comercialização novos clientes | **NO-GO** (fora do escopo; multiempresa ausente) |
| SaaS multiempresa | **NO-GO** |

### Por que NO-GO operação contínua

1. P0-2 **FAIL** — sem artifact de backup de produção.  
2. P0-3 **não executável** — sem cópia + DESTINO não autorizado.  
3. Runs `backup-scheduled` ainda **failure** (PAM/JIT) — ex. `37625648145`.  
4. Regra do sponsor: backup bloqueado ⇒ NO-GO; não converter em aceite de risco.

---

## P0 — resolvidos nesta sessão vs pendentes

| Item | Resultado | Evidência |
|---|---|---|
| Reconciliação planos × auditoria | **DONE** | `RECONCILIACAO_P0_AUDITORIA_360.md` |
| Investigação JIT + alternativas | **DONE** (código + doc) | `JIT_ALTERNATIVAS_DESBLOQUEIO.md`; workflow sonda direta |
| Gate estático workflow | **DONE** (teste local) | `npm run guard:backup-jit` |
| P0-4 Runbook honesto | **DONE** | `RUNBOOK_INCIDENTE_1_PAGINA.md` |
| P0-2 reverificação | **FAIL** (atualizado) | `P0-2_BACKUP_EVIDENCIA.md` |
| P0-3 restore prod | **PENDENTE / BLOQUEADO** | `P0-3_HUMAN_GATE.md` |
| P0-1 smoke loja | **PENDENTE** | checklist presencial |
| Backup SUCCESS + restore drill CI | **PENDENTE** | Actions pós-merge + dispatch humano |

---

## Testes

| Teste | Executado? | Resultado |
|---|---|---|
| `npm run guard:backup-jit` | **Sim** (local, follow-up) | **PASS** — 22 checks estáticos + testes de redação/motivo |
| Dump/restore produção | **Não** | Proibido sem auth; JIT ainda falha |
| Restore drill item 20 | **Não** | Sem artifact success |
| Smoke loja / E2E contra prod | **Não** | Fora do ambiente isolado |
| Unitários monorepo (`npm test`) | **Não** | `node_modules` ausente neste ambiente |

---

## Próxima ação humana (mínima)

1. Revisar/merge do follow-up de CI/IPv6 (empilhado nesta linha).  
2. `workflow_dispatch` → **Backup automatico (item 19)** e anexar `direct: motivo=` mais o resultado do pooler. No `ubuntu-latest` o motivo esperado da sonda direta é rede IPv6 (`sem_rota_ipv6` ou `sem_aaaa`), não sucesso `modo=direct`.  
3. Se o backup completo der success → disparar **Restore drill (item 20)** → atualizar gate.  
4. Com o motivo no log, escolher uma saída humana do gate: runner IPv6 + `allowed_cidrs_v6`, add-on IPv4, ou ticket. Dashboard/rotação de PAT só se o motivo for `autenticacao`. Pro permanece fora da decisão.  
5. Agendar P0-1 na loja em paralelo.

**Só então** reavaliar operação contínua para **GO** ou **GO CONDICIONAL** com RPO comprovado.
