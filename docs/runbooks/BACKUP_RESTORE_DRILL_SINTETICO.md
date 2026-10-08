# Backup & Restore — procedimento reproduzível (drill sintético)

> **Classificação:** prova de **procedimento** local.  
> **NÃO** declara backup de produção Jinlong como validado.

Relacionado: [`BACKUP_RESTORE_CANONICO.md`](./BACKUP_RESTORE_CANONICO.md) · gate [`GATE_BACKUP_PRODUCAO.md`](../regras-negocio/GATE_BACKUP_PRODUCAO.md).

---

## 1. Estratégia compatível com a infra atual

| Opção | Status | Uso nesta sprint |
|---|---|---|
| A — Supabase Pro daily + PITR | Plano Free → **indisponível** | Fallback humano (upgrade) |
| B — Dump externo CI (`backup-scheduled.yml` + JIT + age) | Código pronto; **0/30 success** (PAM) | Continua caminho prod desejado |
| C — `pg_dump -Fc` manual com credencial | Requer auth humana + segredo fora do Git | Procedimento abaixo (drill sintético) |

Nesta sprint: **C ensaiado só em Postgres local sintético** (sem dump remoto, sem PII).

---

## 2. Procedimento de backup (reproduzível)

### Pré-requisitos

- `pg_dump` / `pg_restore` / `psql`
- Variáveis **nunca** commitadas: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- Destino de artefato fora do Git (ex.: `/var/backups/fastproduct` ou artifact CI)

### Comandos (produção — só com autorização)

```bash
export PGHOST=... PGPORT=5432 PGDATABASE=postgres PGUSER=... PGPASSWORD=...
export OUT_DIR=/var/backups/fastproduct   # ou path autorizado
./backup.sh                               # repo root: pg_dump -Fc
```

Alternativa explícita:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="$OUT_DIR/jinlong_${STAMP}.dump"
pg_dump -Fc --no-password -f "$DUMP"
sha256sum "$DUMP" | tee "$DUMP.sha256"
```

Preserva (formato custom): schema, dados, a maioria de grants/policies/funções.  
Limitações: ownership pode precisar `--no-owner` no restore; roles globais podem exigir dump separado de roles.

### Proteção

- Não logar connection string / senha
- Cifrar artifact (`age`) antes de upload (padrão Opção B)
- Não versionar dumps no Git
- Minimizar PII: preferir dump em janela + retenção curta

---

## 3. Procedimento de restauração (destino isolado)

**Nunca** restaurar sobre ORIGEM sem ordem escrita.

```bash
# destino novo
createdb -h "$PGHOST" -U "$PGUSER" jinlong_restore_drill
pg_restore --no-owner --role="$PGUSER" -d "postgresql://$PGUSER@.../jinlong_restore_drill" "$DUMP"
```

### Checklist de validação pós-restore

| # | Check | Critério |
|---|---|---|
| 1 | `pg_restore` exit 0 | sem erros fatais |
| 2 | Contagem tabelas críticas | `lojas`, `contas_financeiras`, `financeiro_contas_forma`, … > 0 se origem tinha |
| 3 | RPCs chave | `to_regprocedure` / `pg_proc` para `financeiro_comando`, `cancelar_venda_transacional`, … |
| 4 | Grants fiscais | `has_table_privilege('authenticated', … INSERT)` esperado |
| 5 | Policies | `pg_policies` para superfícies críticas |
| 6 | SHA do dump | bate com `.sha256` do backup |
| 7 | Smoke sintético | 1 RPC read-only / login service em destino isolado |

---

## 4. Drill local sintético (COMPROVADO nesta sprint)

```bash
node backend/scripts/p0-backup-restore-drill-synthetic.mjs
```

Evidência: `/opt/cursor/artifacts/p0-backup-drill/drill-report.json`  
Resultado: **`RESTORE_DRILL_PASS (synthetic)`** — dump ~9 KB, restore ~85 ms, integridade tabelas/RPC/policy/grant **match**.

**Não** usar este PASS como “backup de produção validado”.

---

## 5. Tempo e limitações de rollback

| Métrica | Drill sintético (COMPROVADO) | Produção (INFERÊNCIA / BLOQUEADO) |
|---|---|---|
| Dump | ~0,7 s (DB minúsculo) | depende do volume; Opção B falha no pooler |
| Restore | ~0,1 s | RTO alvo 4 h úteis (runbook); **não garantido** |
| RPO | N/A | **NÃO GARANTIDO** no Free + JIT vermelho |

Após migrations DDL: dump pré-lote permite restore de **estado anterior em DB isolado**; **não** é rollback cirúrgico de uma única função se o dump não foi feito imediatamente antes. Limite: `schema_migrations` e dados novos pós-apply.

---

## 6. Próxima ação humana para produção

1. Ticket Supabase JIT/PAM **ou** upgrade Pro (Opção A).  
2. `workflow_dispatch` backup até artifact verde.  
3. Restore drill CI (`backup-restore-test.yml`) success.  
4. Só então `BACKUP_PRODUCTION_READY` + auth de Lote A.
