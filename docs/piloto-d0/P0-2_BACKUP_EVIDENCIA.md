# P0-2 — Evidência de backup (produção Jinlong)

> **Runbook canônico:** [`../runbooks/BACKUP_RESTORE_CANONICO.md`](../runbooks/BACKUP_RESTORE_CANONICO.md)

---

## Reverificação 2026-08-31 (estado atual)

**Classificação atual:** **FAIL** (inalterada)

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Plano org | **Free** | Supabase MCP `get_organization` → `plan: "free"` |
| Projeto produção | `jinlong` ACTIVE_HEALTHY | MCP `get_project(id=PROJECT_REF_JINLONG)` |
| Backup automático plataforma | **Não** (Free não inclui) | [Supabase Pricing](https://supabase.com/pricing) + plano API |
| Lista de backups (`GET .../database/backups`) | **Não consultada** | `SUPABASE_ACCESS_TOKEN` ausente na sessão |
| PITR | **Não** (Free) | Docs oficiais |
| `backup.sh` agendado | **Não** | Sem referência em `.github/workflows` |
| Restore ensaiado | **Não** | P0-3 não executado |

**Conclusão:** o plano **continua Free** em 2026-08-31. Não há evidência nova de backup automático nem de restore. IDs 183–187 permanecem **FAIL**.

**Próximo passo humano:** executar upgrade **Pro** no painel Supabase (instruções no runbook) e responder `UPGRADE PRO CONCLUÍDO` — ver runbook canônico.

---

## Registro histórico 2026-08-27

**Data:** 2026-08-27  
**Produção (ORIGEM, somente leitura):** projeto `jinlong` · ref **`PROJECT_REF_JINLONG`**  
**Classificação naquela sessão:** **FAIL**

Aceite formal de risco pode conviver com este FAIL. **Não transforma FAIL em PASS.**

Nenhuma escrita foi feita neste projeto. Painel Database → Backups exigiu login; Management API (`GET /v1/projects/{ref}/database/backups`) não foi chamada (sem `SUPABASE_ACCESS_TOKEN` nesta sessão; `npx supabase projects list` recusou).

---

## Mecanismo REAL comprovado na sessão 2026-08-27

| Campo | Achado | Evidência |
|---|---|---|
| **Tipo de backup de plataforma** | **Não comprovável.** No plano **Free**, a documentação oficial **não inclui** backups automáticos. | [Backups](https://supabase.com/docs/guides/platform/backups): automáticos só Pro/Team/Enterprise. [Pricing](https://supabase.com/pricing): Free → Automatic backups **Not included**. Org Jinlong estava no **Free** em 2026-08-19 (`create_branch` recusado). Upgrade posterior **não** foi observado na sessão de 2026-08-27. **Reconfirmado Free em 2026-08-31** via API. |
| **Responsável** | Plataforma: Supabase (se Pro+). Repo: **ninguém** agenda dump. | Nenhum workflow, cron ou secret de job aponta para `backup.sh`. |
| **Frequência** | Plataforma no Free: **nenhuma**. `backup.sh`: **nunca agendado**. | `rg backup.sh .github` → vazio. |
| **Retenção** | Plataforma no Free: **nenhuma**. `backup.sh` declara 7 dias **se** alguém rodasse (`RETENTION_DAYS`, `OUT_DIR=/var/backups/fastproduct`). | Só o script; diretório não existe neste worktree Windows. |
| **PITR** | **Não.** Free: not included. Add-on só em plano pago + compute Small. | Docs oficiais; branching também recusado no Free. |
| **Último backup comprovável** | **Nenhum.** Sem lista da API, sem dump versionado, restore nunca cronometrado. | PV-020 / BL-D0-009 ainda abertos. |
| **Onde está armazenado** | Plataforma (Pro+): S3 interno da Supabase (não acessível como arquivo). `backup.sh`: `/var/backups/fastproduct` **não observado**. Git **não** é backup de dados (e o catálogo Git ≠ produção). | [AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md](../AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) |
| **`backup.sh`** | **Artefato de repositório.** `pg_dump -Fc`. Não referenciado em `.github/workflows`. Não há prova de execução. | `backup.sh`; `git grep` em workflows. |
| **Uso no P0-3** | **Não há backup de plataforma comprovado para restaurar.** P0-3 **não pode** presumir Daily Backup / Restore to New Project até um humano abrir o painel logado **ou** a org estar em Pro com lista de backups. Caminho residual: **export manual** (dump) da ORIGEM para um **DESTINO novo** — isso **cria** a primeira cópia; não é restore de cópia já existente. | Gate: [P0-3_HUMAN_GATE.md](./P0-3_HUMAN_GATE.md) |

### O que foi tentado e o que **não** conta como backup (2026-08-27)

| Tentativa | Resultado |
|---|---|
| Dashboard Backups | Redirect para sign-in. Parado (sem credencial interativa). |
| `npx supabase projects list` | `Access token not provided`. |
| Secrets no shell | `SUPABASE_ACCESS_TOKEN` ausente. `.env.local` tem URL/anon/service_role — **não** usado para dump (PII; não autorizado). |
| GitHub Actions | Nenhum job de backup. |
| Rollback Vercel | Recupera **app**, não o Postgres. |
| `db reset` a partir do Git | **Não** reproduz produção (drift de catálogo). Perigoso e inútil como DR. |

### Reverificação 2026-08-31 — tentativas adicionais

| Tentativa | Resultado |
|---|---|
| Supabase MCP `get_organization` | `plan: "free"` (org NatureCode) |
| Supabase MCP `get_project` | `jinlong` ACTIVE_HEALTHY |
| `GET .../database/backups` | Não executado — `SUPABASE_ACCESS_TOKEN` ausente no shell |
| Escrita em produção | **Nenhuma** |

---

## Veredito

**FAIL** — não existe backup real **comprovável** nem caminho de recuperação **já utilizável** (plano Free confirmado em 2026-08-31 + script local não agendado + PITR indisponível + restore não ensaiado).

O piloto **opera sem cópia ensaiada**. Meta D0-06 (RPO 24h / RTO 8h) **não** está demonstrada.

### O que um humano pode fazer para reclassificar (sem fingir PASS agora)

1. Autorizar upgrade org para **Pro** (~$25/mês) e aguardar primeiro daily backup; captura Dashboard → Database → Backups **ou** token para API.
2. Fornecer `SUPABASE_ACCESS_TOKEN` para `GET /v1/projects/PROJECT_REF_JINLONG/database/backups`.
3. Executar restore drill conforme [runbook canônico](../runbooks/BACKUP_RESTORE_CANONICO.md) e [P0-3](./P0-3_HUMAN_GATE.md).
4. Aceite escrito de risco: “operar o piloto sem backup comprovável até data X”. Continua **FAIL**.
