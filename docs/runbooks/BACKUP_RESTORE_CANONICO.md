# Runbook canônico — Backup & Restore (Jinlong)

> **Referência única** para recuperação de dados.
>
> **Produção (ORIGEM):** projeto `jinlong` · org NatureCode  
> **Segredos:** nunca no Git (`PGPASSWORD`, PAT, `service_role`, connection strings).

---

## Estado operacional (2026-10-07)

| Campo | Valor |
|-------|-------|
| Plano org | **Free** (`get_organization` → `plan: free`) |
| Backup nativo / PITR | **Não** no Free |
| Automação Opção B | Workflows em `.github/workflows/backup-*.yml` — **ativos, falhando** |
| Últimos 30 runs `backup-scheduled` | **0 success / 30 failure** (PAM/JIT) |
| RPO **alvo** | 24h |
| RPO **efetivamente garantido** | **`NÃO GARANTIDO`** |
| RTO **alvo / esperado** | 4h úteis |
| Restore drill local (`pg_dump -Fc`) | `RESTORE_DRILL_PASS` (fase hardening) |
| Formato CI (age/sql) | `AUTOMATION_FORMAT_RESTORE_PASS` (isolado; não é dump prod) |
| Gate | **`BACKUP_PRODUCTION_PENDING`** — ver [GATE_BACKUP_PRODUCAO.md](../regras-negocio/GATE_BACKUP_PRODUCAO.md) |

**Não afirmar SLA de RPO enquanto não houver artefato de produção com sucesso &lt; 25h.**

---

## Estratégia escolhida

**Opção B — dump externo automatizado** (GitHub Actions + Temporary Access/JIT + `age` + artifact).

| Critério | Motivo |
|----------|--------|
| Custo | Zero adicional no Free |
| Já implementada | `backup-scheduled.yml` + `backup-restore-test.yml` |
| Segurança | Sem senha Postgres permanente; cifrar antes do artifact |
| Fallback de produto | Opção A (Pro) existe na tabela do gate e **fica fora** da decisão vigente (Free) |

**Opção C (A+B):** não neste estágio.

---

## Pré-condições

1. Secrets/vars GitHub configurados (dono do repo):
   - `secrets.SUPABASE_BACKUP_JIT_PAT`
   - `secrets.BACKUP_AGE_PRIVATE_KEY` (só restore-drill)
   - `vars.SUPABASE_BACKUP_USER_ID`
   - `vars.BACKUP_AGE_PUBLIC_KEY`
2. Temporary Access habilitado no projeto (Dashboard).
3. Destino de restore **sempre isolado** (nunca sobrescrever ORIGEM sem ordem escrita).

---

## Backup automático (Opção B)

```text
Actions → "Backup automatico (item 19)" → Run workflow
Cron: 0 6 * * * (06:00 UTC)
Saída: artifact jinlong-backup-<run_id>
  roles.sql.age, schema.sql.age, data.sql.age, checksums.sha256, manifest.json
Retenção artifact: 30 dias
```

### Validação

- Step summary / logs: tamanhos dos SQL &gt; 32 bytes  
- Artifact presente  
- `Backup freshness monitor` verde (idade ≤ 25h)

### Bloqueio atual (não contornar com aceite de risco)

Sintoma estável no pooler:

```text
aws-1-sa-east-1.pooler.supabase.com → PAM authentication failed for user "postgres"
```

com JIT `PUT/GET` HTTP 2xx. Histórico: `docs/audits/ENCERRAMENTO_SPRINT_BACKUP_JIT_ITENS_18_21.md`.

**2026-10-08:** o workflow sonda a conexão direta e, se ela falhar, registra `direct: motivo=` (`sem_aaaa`, `sem_rota_ipv6`, `autenticacao`, `timeout`) antes do pooler. No Free + `ubuntu-latest` essa sonda não autentica: o host direto é só IPv6, o runner não tem rota IPv6 e o grant JIT só cobre `0.0.0.0/0`. Detalhe e saídas (runner IPv6 + `allowed_cidrs_v6`, add-on IPv4, ticket): [GATE_BACKUP_PRODUCAO.md](../regras-negocio/GATE_BACKUP_PRODUCAO.md) e [`docs/piloto-d0/JIT_ALTERNATIVAS_DESBLOQUEIO.md`](../piloto-d0/JIT_ALTERNATIVAS_DESBLOQUEIO.md).

**Próxima ação humana:** um `workflow_dispatch` para obter esse motivo. A decisão vigente continua Free + Opção B. Pro não é a ação corrente. Gate: `BACKUP_PRODUCTION_PENDING` até success &lt;25h.

---

## Monitoramento de falha

| Mecanismo | Função |
|-----------|--------|
| Conclusão do workflow `backup-scheduled` | sucesso/falha por execução |
| `backup-freshness-monitor.yml` (cron 08:00 UTC) | falha se nenhum sucesso ≤ 25h |
| Artifact + `checksums.sha256` | integridade / tamanho implícito |
| `manifest.json` | contagens agregadas (sem PII) |

Não há stack de observabilidade dedicada — Actions + freshness bastam.

---

## Retenção

| Camada | Retenção | Justificativa |
|--------|----------|---------------|
| Artifact GitHub (Opção B) | **30 dias** | Cobre detecção de problema em poucos dias + margem mensal; sem storage caro |
| Pro daily (se A) | 7 dias | Padrão plataforma |
| PITR | Não adotar agora | Custo alto vs estágio |

---

## Restore

### Produção / CI (formato Opção B)

```text
Actions → "Restore drill (item 20)" → Run workflow
```

Nunca apontar o drill para o projeto `jinlong`. Runner efêmero Postgres 17; decifra com `BACKUP_AGE_PRIVATE_KEY`; compara contagens ao manifesto.

### Local equivalente (`pg_dump -Fc`) — já ensaiado

Ver evidência hardening: dump sha256 `8f5007ac…` → restore imagem Supabase PG17 → `RESTORE_DRILL_PASS`.

### Rollback

Falha no DESTINO → destruir DESTINO; ORIGEM intacta. Cutover só após verificação PASS.

---

## Erros comuns

| Sintoma | Ação |
|---------|------|
| `direct: motivo=sem_rota_ipv6` ou `sem_aaaa` | Esperado no `ubuntu-latest` + Free; ler a seção IPv6 do gate antes de tratar como falha de PAT |
| `direct: motivo=autenticacao` ou `timeout` | Host ou rota alcançados; seguir Dashboard / PAT / ticket conforme o motivo |
| `PAM authentication failed` + JIT 200 | Bloqueio externo do pooler; ticket com o log da sonda direta. Pro continua fora da decisão vigente |
| `unsupported version (1.16)` | Cliente `pg_restore` &lt; 17 |
| `role "authenticated" does not exist` | Target bare Postgres; usar imagem Supabase |
| Freshness FAIL | RPO não garantido; investigar último `backup-scheduled` |

---

## Responsável

| Papel | Quem |
|-------|------|
| Secrets / ticket Supabase / Pro | Dono do projeto (humano) |
| Disparar workflows pós-desbloqueio | Ops / engenharia |
| Atualizar este runbook | Após primeiro SUCCESS de produção |

Referências: [GATE_BACKUP_PRODUCAO.md](../regras-negocio/GATE_BACKUP_PRODUCAO.md) · P0-2 · P0-3 · INTEGRACAO_HARDENING_473_479.md
