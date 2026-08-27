# P0-2 — Evidência de backup (produção Jinlong)

**Data:** 2026-08-27  
**Produção (ORIGEM, somente leitura):** projeto `jinlong` · ref **`kbabmewnahysfvlybiak`**  
**Classificação:** **FAIL**

Aceite formal de risco pode conviver com este FAIL. **Não transforma FAIL em PASS.**

Nenhuma escrita foi feita neste projeto. Painel Database → Backups exigiu login; Management API (`GET /v1/projects/{ref}/database/backups`) não foi chamada (sem `SUPABASE_ACCESS_TOKEN` nesta sessão; `npx supabase projects list` recusou).

---

## Mecanismo REAL comprovado nesta sessão

| Campo | Achado | Evidência |
|---|---|---|
| **Tipo de backup de plataforma** | **Não comprovável.** No plano **Free**, a documentação oficial **não inclui** backups automáticos. | [Backups](https://supabase.com/docs/guides/platform/backups): automáticos só Pro/Team/Enterprise. [Pricing](https://supabase.com/pricing): Free → Automatic backups **Not included**. Org Jinlong estava no **Free** em 2026-08-19 (`create_branch` recusado). Upgrade posterior **não** foi observado aqui. |
| **Responsável** | Plataforma: Supabase (se Pro+). Repo: **ninguém** agenda dump. | Nenhum workflow, cron ou secret de job aponta para `backup.sh`. |
| **Frequência** | Plataforma no Free: **nenhuma**. `backup.sh`: **nunca agendado**. | `rg backup.sh .github` → vazio. |
| **Retenção** | Plataforma no Free: **nenhuma**. `backup.sh` declara 7 dias **se** alguém rodasse (`RETENTION_DAYS`, `OUT_DIR=/var/backups/fastproduct`). | Só o script; diretório não existe neste worktree Windows. |
| **PITR** | **Não.** Free: not included. Add-on só em plano pago + compute Small. | Docs oficiais; branching também recusado no Free. |
| **Último backup comprovável** | **Nenhum.** Sem lista da API, sem dump versionado, restore nunca cronometrado. | PV-020 / BL-D0-009 ainda abertos. |
| **Onde está armazenado** | Plataforma (Pro+): S3 interno da Supabase (não acessível como arquivo). `backup.sh`: `/var/backups/fastproduct` **não observado**. Git **não** é backup de dados (e o catálogo Git ≠ produção). | [AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md](../AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) |
| **`backup.sh`** | **Artefato de repositório.** `pg_dump -Fc`. Não referenciado em `.github/workflows`. Não há prova de execução. | `backup.sh`; `git grep` em workflows. |
| **Uso no P0-3** | **Não há backup de plataforma comprovado para restaurar.** P0-3 **não pode** presumir Daily Backup / Restore to New Project até um humano abrir o painel logado **ou** a org estar em Pro com lista de backups. Caminho residual: **export manual** (dump) da ORIGEM para um **DESTINO novo** — isso **cria** a primeira cópia; não é restore de cópia já existente. | Gate: [P0-3_HUMAN_GATE.md](./P0-3_HUMAN_GATE.md) |

### O que foi tentado e o que **não** conta como backup

| Tentativa | Resultado |
|---|---|
| Dashboard Backups | Redirect para sign-in. Parado (sem credencial interativa). |
| `npx supabase projects list` | `Access token not provided`. |
| Secrets no shell | `SUPABASE_ACCESS_TOKEN` ausente. `.env.local` tem URL/anon/service_role — **não** usado para dump (PII; não autorizado). |
| GitHub Actions | Nenhum job de backup. |
| Rollback Vercel | Recupera **app**, não o Postgres. |
| `db reset` a partir do Git | **Não** reproduz produção (drift de catálogo). Perigoso e inútil como DR. |

---

## Veredito

**FAIL** — não existe backup real **comprovável** nem caminho de recuperação **já utilizável** (lista vazia / não observada + script local não agendado + PITR indisponível no plano documentado).

O piloto **opera sem cópia ensaiada**. Meta D0-06 (RPO 24h / RTO 8h) **não** está demonstrada.

### O que um humano pode fazer para reclassificar (sem fingir PASS agora)

1. Login no painel → Database → Backups do ref `kbabmewnahysfvlybiak` e enviar captura (plano, lista, PITR on/off).  
   - Se aparecerem backups diários: reabrir P0-2 como **PASS** com essa evidência.  
   - Se a UI disser que backups não estão no plano: FAIL permanece, alinhado a esta nota.
2. Fornecer `SUPABASE_ACCESS_TOKEN` com `backups_read` para `GET /v1/projects/kbabmewnahysfvlybiak/database/backups`.
3. Aceite escrito de risco: “operar o piloto sem backup comprovável até data X”. Continua **FAIL**.
