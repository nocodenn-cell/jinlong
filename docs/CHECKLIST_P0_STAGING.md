# P0 — Checklist operacional (ambiente **staging**)

Use este arquivo como **registro por ciclo** (homologação antes de promover para produção). O conteúdo normativo e a ordem das tarefas continuam em [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) e [AMBIENTES_E_RELEASE.md](./AMBIENTES_E_RELEASE.md).

**Status rápido das migrations (CLI linkada ao staging):** na pasta `backend`, rode:

```powershell
node scripts/p0-migration-status.mjs
```

Opcional: `node scripts/p0-migration-status.mjs --json` para saída máquina-legível.

---

## Identificação do ciclo

| Campo | Valor |
|-------|--------|
| **Data de abertura do ciclo** | _AAAA-MM-DD_ |
| **Responsável pelo ciclo** | _nome / equipe_ |
| **Project ref Supabase (staging)** | _ex.: `abcdxyz` — Dashboard → Settings → General_ |
| **URL da web em staging** | _ex.: preview Vercel ou domínio fixo_ |
| **Piloto inclui PDV desktop (Tauri)?** | _Sim / Não_ |

---

## §1 — Migrations e verify SQL

| # | Verificação | OK? | Data | Responsável | Evidência (link, print, commit) |
|---|-------------|-----|------|-------------|--------------------------------|
| 1.1 | `cd backend` + `npx supabase link --project-ref <staging>` | [ ] | | | |
| 1.2 | `npx supabase migration list` — coluna **Remote** sem lacunas vs **Local** | [ ] | | | |
| 1.3 | `node scripts/p0-migration-status.mjs` — saída **ALINHADO** (sem drift) | [ ] | | | |
| 1.4 | `npx supabase db push` (se o passo anterior apontou drift) + repetir 1.2–1.3 | [ ] | | | |
| 1.5 | SQL Editor: `backend/supabase/scripts/verify_p0_producao.sql` executado | [ ] | | | |
| 1.6 | (Se aplicável) Smoke **023** — scripts em `backend/supabase/scripts/smoke_023_*.sql` | [ ] | | | |

---

## §2 — Edge `sync-outbox` (obrigatório se piloto **com** desktop)

| # | Verificação | OK? | Data | Responsável | Evidência |
|---|-------------|-----|------|-------------|-----------|
| 2.1 | `npx supabase functions deploy sync-outbox` (após §1 alinhado ao código esperado pela Edge) | [ ] | | | |
| 2.2 | Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY` | [ ] | | | |
| 2.3 | (Opcional) `sync-outbox-anti-replay-diagnostic.ps1` — ver [AMBIENTES_E_RELEASE.md §4.5](./AMBIENTES_E_RELEASE.md#45-diagnóstico-automatizado) | [ ] | | | |

---

## §3 — PDV local (obrigatório se piloto **com** desktop)

| # | Verificação | OK? | Data | Responsável | Evidência |
|---|-------------|-----|------|-------------|-----------|
| 3.1 | `pdv-local/.env` com `SYNC_ENDPOINT` + `SYNC_KEY` **iguais** ao projeto staging | [ ] | | | |
| 3.2 | App reiniciado após alterar `.env` | [ ] | | | |
| 3.3 | Sincronizar catálogo sem **401** | [ ] | | | |

---

## §4 ou §4b — Teste ponta a ponta

Marque **apenas um** caminho principal.

### §4b — Mínimo só web (sem Tauri)

| # | Verificação | OK? | Data | Responsável | Evidência |
|---|-------------|-----|------|-------------|-----------|
| B.1 | `/caixa` — finalizar venda de teste | [ ] | | | |
| B.2 | `/gerente/vendas` — venda listada; detalhe `/gerente/vendas/[id]` coerente | [ ] | | | |
| B.3 | Supabase: `vendas` / `itens_venda` / estoque coerente | [ ] | | | |

### §4 — Com desktop (inclui §2 e §3)

| # | Verificação | OK? | Data | Responsável | Evidência |
|---|-------------|-----|------|-------------|-----------|
| D.1 | Catálogo + caixa aberto + venda de teste no Tauri | [ ] | | | |
| D.2 | Sync / outbox — sem DLQ inesperada; linhas no Supabase | [ ] | | | |
| D.3 | Web gerente vê a mesma venda | [ ] | | | |

---

## §5 — Web (`pdv-importados`)

| # | Verificação | OK? | Data | Responsável | Evidência |
|---|-------------|-----|------|-------------|-----------|
| 5.1 | `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do **mesmo** ref staging | [ ] | | | |
| 5.2 | Deploy/preview apontando para staging | [ ] | | | |

---

## §6 — CI / gates (opcional neste doc, mas recomendado)

| # | Verificação | OK? | Data | Responsável | Evidência |
|---|-------------|-----|------|-------------|-----------|
| 6.1 | Último PR relevante: workflow `ci-backend-supabase` verde | [ ] | | | |
| 6.2 | (Se secrets `SYNC_ENDPOINT` + `SYNC_KEY`) gate anti-replay no GitHub verde | [ ] | | | |
| 6.3 | (Opcional) Secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_MIGRATION_CHECK_PROJECT_REF` — job `migration-remote-drift` compara Local vs Remote no ref configurado (ex.: staging); sem secrets o job **pula**; PRs de fork também **pulam** (sem acesso aos secrets do base) | [ ] | | | |

---

## Encerramento do ciclo

| Campo | Valor |
|-------|--------|
| **P0 staging considerado FECHADO neste ciclo?** | _Sim / Não_ |
| **Data de encerramento** | _AAAA-MM-DD_ |
| **Assinatura / aprovador** | _nome_ |
| **Próximo passo** | _ex.: repetir checklist em prod; abrir incidente se DLQ; etc._ |

---

## Homologação automatizada (opcional)

Para rodar smokes SQL + verify + (opcional) anti-replay contra o banco linkado, use o runner existente:

```powershell
cd C:\Naturecode\fastproduct\backend
.\scripts\homologacao-p0-runner.ps1
```

Detalhes: [HOMOLOGACAO_PACOTE_032_036.md](./HOMOLOGACAO_PACOTE_032_036.md) (ajuste flags conforme o pacote que estiver homologando).
