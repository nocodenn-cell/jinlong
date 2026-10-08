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

## Atualização Sprint 0 (2026-10-08) — backup real produzido e restaurado

**Caminho validado: `supabase db dump --linked`** (a CLI cria a role temporária `cli_login_postgres` via
Management API usando um token de acesso do dono; não usa senha de banco nem Temporary Access/JIT).
Executado contra produção em **somente leitura** (pg_dump); arquivos mantidos fora do repositório.

| Evidência | Resultado |
|---|---|
| Dump produzido | `roles.sql` 638 B · `schema.sql` 890 KB · `data.sql` 2,5 MB |
| Restauração | em Postgres/Supabase **descartável** (container local), `restore-drill.sh`, **7,8 s** |
| Tabelas de `public` | **87/87** com contagem idêntica à produção |
| Objetos | 152 policies · 163 functions · 53 triggers · 3 constraints `NOT VALID` — idênticos |
| Contas | 14 `auth.users` restauradas |
| Negócio | 258 vendas, 56 caixas, 155 produtos, 11 usuários — iguais ao manifesto |
| Repetição | restauração refeita do zero numa segunda stack: mesmo resultado |

RTO medido do restore: **~8 s** para 3,4 MB (o RTO real inclui provisionar o destino e o cutover humano).

### Achados do drill (corrigidos em `backend/scripts/restore-drill.sh`)

1. **Constraints `CHECK … NOT VALID` continuam validando linhas novas, inclusive no `COPY`.** Produção tem
   uma linha legada (documento fiscal de teste com chave de 15 dígitos) que viola
   `documentos_fiscais_chave_formato`; um restore ingênuo falhava e perdia a tabela inteira. O script remove
   as constraints `NOT VALID` antes da carga e as recria como `NOT VALID` depois.
2. **auth/storage de um Postgres local podem ser mais antigos que os de produção** (tabelas/colunas geridas
   pelo GoTrue/Storage). `filter-data-dump.mjs` carrega apenas `public` + `auth.users` + `auth.identities`.
3. O restore drill do CI usava `postgres:17-alpine` (sem roles `anon`/`authenticated` nem schema `auth`);
   passou a usar a imagem `supabase/postgres`.

### Por que o backup diário no GitHub continua vermelho

O workflow tentava só Temporary Access/JIT, que o pooler recusa (`PAM authentication failed`, 0 sucessos em 30
execuções). `backup-scheduled.yml` agora **usa o caminho da CLI quando existir o secret
`SUPABASE_ACCESS_TOKEN`** e mantém o JIT como fallback. **Falta uma ação humana, gratuita:**

> Criar um token de acesso pessoal Supabase (Account → Access Tokens, preferencialmente com expiração) e
> cadastrá-lo como secret `SUPABASE_ACCESS_TOKEN` do repositório. Depois: `workflow_dispatch` em
> *Backup automatico (item 19)* → *Restore drill (item 20)* → *Backup freshness monitor*.

Enquanto isso não for feito, o RPO de 24 h **continua NÃO GARANTIDO** de forma automática. O backup manual
acima prova que o procedimento funciona; não substitui a execução diária.

**Antes de qualquer operação destrutiva em produção (limpeza, migrations):** repetir o dump
(`supabase link` + `supabase db dump --linked`) e o drill (`restore-drill.sh`).

---

## Estratégia escolhida

**Opção B — dump externo automatizado** (GitHub Actions + Temporary Access/JIT + `age` + artifact).

| Critério | Motivo |
|----------|--------|
| Custo | Zero adicional no Free |
| Já implementada | `backup-scheduled.yml` + `backup-restore-test.yml` |
| Segurança | Sem senha Postgres permanente; cifrar antes do artifact |
| Fallback | Opção A (Pro, backup diário 7d) se JIT permanecer bloqueado |

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

### Bloqueio atual (não contornar)

Sintoma estável:

```text
aws-1-sa-east-1.pooler.supabase.com → PAM authentication failed for user "postgres"
```

com JIT `PUT/GET` HTTP 2xx. Detalhe: `docs/audits/ENCERRAMENTO_SPRINT_BACKUP_JIT_ITENS_18_21.md`.

**Única próxima ação humana:** ticket Supabase (EXTERNAL-BLOCKER) **ou** autorizar Opção A (Pro).

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
| `PAM authentication failed` + JIT 200 | Bloqueio externo; não “mais um fix de workflow” sem evidência nova — seguir ação humana do gate |
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
