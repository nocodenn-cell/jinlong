# Gate — Backup operacional de produção (Jinlong)

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Org Supabase** | NatureCode · `plan: free` (MCP `get_organization`) |
| **Projeto** | `jinlong` · `ACTIVE_HEALTHY` · PG 17 · `sa-east-1` |
| **RPO alvo** | 24h |
| **RPO efetivamente garantido** | **`NÃO GARANTIDO`** |
| **RTO alvo / esperado** | 4h úteis (restore drill CI + cutover humano) |
| **Gate** | **`BACKUP_PRODUCTION_PENDING`** |

---

## Comparação (máx. 3 opções)

| | **A — Nativo Pro** | **B — Dump externo automatizado** | **C — A+B** |
|--|-------------------|-----------------------------------|-------------|
| Custo | ~US$25/org + compute | US$0 (GitHub Actions + artifacts) | A + esforço B |
| Backup Free hoje | **Não** | Código pronto | — |
| Retenção | 7 dias (Pro) | 30 dias (artifact CI) | — |
| PITR | Add-on ~US$100/7d | Não | — |
| Automação | Dashboard/plataforma | `backup-scheduled.yml` (cron 06:00 UTC) | — |
| Bloqueio atual | Requer upgrade pago | **JIT/PAM**: 0/30 sucessos; grant API OK, pooler recusa PAT | Desnecessário agora |
| Restore | Restore to new project | `backup-restore-test.yml` (Postgres 17 efêmero) | — |

### Escolha

**Opção B** — já implementada, sem custo novo, alinhada ao Free, com cifragem `age`, checksum, manifesto e restore drill.

Não escolher A só por ser “pago”. A torna-se **fallback** se o bloqueio JIT externo não for resolvido pelo dono do projeto.

**Opção C:** não — benefício não proporcional neste estágio.

---

## Por que RPO 24h ainda não é garantia

1. Plano **Free** → sem backup diário nativo / sem PITR.
2. Workflow Opção B roda todo dia e **falha** (último: [37625648145](https://github.com/nocodenn-cell/fastproduct/actions/runs/37625648145)): Temporary Access autoriza (`PUT/GET` JIT HTTP 2xx) mas `aws-1-…pooler` responde `PAM authentication failed`.
3. Histórico: 0 sucessos nos últimos 30 runs; ver `docs/audits/ENCERRAMENTO_SPRINT_BACKUP_JIT_ITENS_18_21.md` (`EXTERNAL-BLOCKER-SUPABASE-JIT`).
4. Monitor `backup-freshness-monitor.yml` falhará explicitamente até existir sucesso &lt; 25h.

---

## Próximas ações humanas (ordem — decisão 2026-10-08: Free + JIT)

1. **Merge + `workflow_dispatch`** do backup após a sonda **direta** (`db.<ref>.supabase.co`) em `backup-scheduled.yml` — ver [`docs/piloto-d0/JIT_ALTERNATIVAS_DESBLOQUEIO.md`](../piloto-d0/JIT_ALTERNATIVAS_DESBLOQUEIO.md).  
2. Se ainda PAM/FAIL: Dashboard Temporary Access (UI vs API) → rotacionar `SUPABASE_BACKUP_JIT_PAT`.  
3. **Ticket Supabase** com evidência grant 2xx + PAM em `aws-1` (+ resultado da sonda direta).  
4. Upgrade Pro (**Opção A**) permanece fora desta decisão de produto (sponsor manteve Free).

Após desbloqueio (JIT verde):

1. `workflow_dispatch` → `Backup automatico (item 19)` até **success** + artifact `jinlong-backup-*`.
2. `workflow_dispatch` → `Restore drill (item 20)` até **success**.
3. Confirmar `Backup freshness monitor` = `BACKUP_FRESH`.

Só então promover o gate para **`BACKUP_PRODUCTION_READY`**.

Este agente **não** rotaciona secrets GitHub (403), **não** abre ticket Supabase, **não** faz upgrade Pro, **não** dumpa produção sem autorização.

---

## Segurança (Opção B)

| Controle | Como |
|----------|------|
| Segredos fora do Git | `SUPABASE_BACKUP_JIT_PAT`, `BACKUP_AGE_PRIVATE_KEY` |
| Vars não secretas | `SUPABASE_BACKUP_USER_ID`, `BACKUP_AGE_PUBLIC_KEY` |
| Menor privilégio | PAT escopo Database JIT; janela 10 min; sem senha Postgres permanente |
| Artefato | Somente `*.sql.age` + checksum + manifesto (sem PII em claro no artifact) |
| Logs | PAT mascarado; sem connection string completa |
| Retenção | 30 dias no artifact GitHub |
| Acesso | Repo privado + permissões Actions |

---

## Monitoramento

| Sinal | Onde |
|-------|------|
| Sucesso/falha da execução | Actions → `backup-scheduled.yml` |
| Timestamp / idade | `backup-freshness-monitor.yml` (limite 25h) |
| Tamanho | log do step dump (`roles/schema/data` bytes) |
| Checksum | `checksums.sha256` no artifact |
| Retenção | `retention-days: 30` no upload-artifact |

---

## Prova de formato (local, 2026-10-07)

Pipeline equivalente (sql → age → sha256 → decrypt → restore isolado): **`AUTOMATION_FORMAT_RESTORE_PASS`**.  
Não substitui backup de produção. `RESTORE_DRILL_PASS` (custom `-Fc`) da fase anterior permanece válido para procedimento local.
