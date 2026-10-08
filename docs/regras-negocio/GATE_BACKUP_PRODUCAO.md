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
| Bloqueio atual | Requer upgrade pago | **JIT/PAM** no pooler (0/30); sonda direta no Free não alcança o host a partir de `ubuntu-latest` (IPv6) | Desnecessário agora |
| Restore | Restore to new project | `backup-restore-test.yml` (Postgres 17 efêmero) | — |

### Escolha

**Opção B** — já implementada, sem custo novo, alinhada ao Free, com cifragem `age`, checksum, manifesto e restore drill.

**Decisão vigente (2026-10-08):** permanecer no plano **Free** e na Opção B. A Opção A (Pro, backup nativo) fica fora desta decisão de produto. A Opção C fica fora deste estágio.

---

## Por que RPO 24h ainda não é garantia

1. Plano **Free** → sem backup diário nativo / sem PITR.
2. Workflow Opção B roda todo dia e **falha** (último: [37625648145](https://github.com/nocodenn-cell/fastproduct/actions/runs/37625648145)): Temporary Access autoriza (`PUT/GET` JIT HTTP 2xx) mas `aws-1-…pooler` responde `PAM authentication failed`.
3. Histórico: 0 sucessos nos últimos 30 runs; ver `docs/audits/ENCERRAMENTO_SPRINT_BACKUP_JIT_ITENS_18_21.md` (`EXTERNAL-BLOCKER-SUPABASE-JIT`).
4. Monitor `backup-freshness-monitor.yml` falhará explicitamente até existir sucesso &lt; 25h.

---

## Limitação IPv6 da sonda direta (documentação oficial, 2026-10-08)

Confirmado na documentação da Supabase, sem mudança de runner, add-on ou CIDR neste repositório:

| Fato | Fonte |
|------|--------|
| No Free, `db.<ref>.supabase.co:5432` é **somente IPv6** | [Endpoints and IP versions](https://supabase.com/docs/guides/database/connecting-to-postgres#endpoints-and-ip-versions) |
| Plano pago sem add-on também é IPv6; o add-on IPv4 (Pro+) **troca** o AAAA por um A | Mesma página e [IPv4 add-on](https://supabase.com/docs/guides/platform/ipv4-address) |
| GitHub Actions está na lista de plataformas **somente IPv4** | [IPv4 add-on](https://supabase.com/docs/guides/platform/ipv4-address); runners hospedados sem IPv6 de saída em [actions/runner-images#668](https://github.com/actions/runner-images/issues/668) |
| O grant deste workflow só envia `allowed_cidrs: 0.0.0.0/0` | `backup-scheduled.yml`; IPv6 seria `allowed_cidrs_v6` na [Management API](https://supabase.com/docs/reference/api/v1-update-jit-access) |

Consequência: no `ubuntu-latest` a tentativa direta falha **antes** da autenticação JIT e o workflow cai no pooler. O pooler é o caminho IPv4 e continua no bloqueio PAM (`EXTERNAL-BLOCKER-SUPABASE-JIT`) até evidência nova. O próximo `workflow_dispatch` deve mostrar uma linha `direct: motivo=` (`sem_aaaa`, `sem_rota_ipv6`, `autenticacao` ou `timeout`) e o stderr já redigido. Esse log é o diagnóstico que ainda falta; não é o desbloqueio.

### Saídas possíveis (decisão humana, nenhuma aplicada aqui)

1. Runner com rota IPv6 de saída **e** faixa `allowed_cidrs_v6` no grant JIT.
2. Add-on IPv4 da Supabase (Pro+; o endpoint direto deixa de ser IPv6).
3. Ticket Supabase com o log do dispatch (motivo da sonda direta + PAM no `aws-1`).

## Próximas ações humanas (ordem — decisão 2026-10-08: Free + JIT)

1. **Merge + um `workflow_dispatch`** de `Backup automatico (item 19)` e guardar a linha `direct: motivo=` (e o fallback do pooler). Ver [`docs/piloto-d0/JIT_ALTERNATIVAS_DESBLOQUEIO.md`](../piloto-d0/JIT_ALTERNATIVAS_DESBLOQUEIO.md).
2. Com esse log, seguir uma das três saídas da seção IPv6. No Free, o caminho de plataforma do bloqueio externo continua sendo o **ticket** (grant 2xx + PAM em `aws-1` + motivo da sonda direta).
3. Dashboard Temporary Access e rotação de `SUPABASE_BACKUP_JIT_PAT` entram só se o motivo for `autenticacao`.
4. A Opção A (Pro) permanece fora desta decisão. A ação corrente é o dispatch e, com o log, o ticket no Free ou uma das saídas IPv6.

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
