# Go-live final #584 — roteiro único
Script: `/workspace/golive-final-584.sh` (padrão `MODE=dry-run`, somente leitura). Evidências esperadas: `/workspace/golive/ops/`. Teste E2E: `/workspace/golive/test/e2e.sh` (28/28 PASS na réplica local; resultado em `golive/test/e2e-resultado.txt`).
Nada foi executado em prod (só SELECT). Sem `db push`, sem `migration repair`. Cada migration = 1 transação: DDL do arquivo + linha em `supabase_migrations.schema_migrations` (versão/nome reais, `statements` = conteúdo exato do arquivo, mesmo formato das linhas de prod) + checagem de totais/hashes/FKs órfãs; qualquer divergência ⇒ ROLLBACK e parada (exit 10+gate). Reexecução retoma de onde parou.

| Gate | O quê | Para se | Recuperação |
|---|---|---|---|
| 0 | RESUMO do PDV | sem `SHA256 OK`, `integrity_check` ≠ ok, veredito ≠ Build B/C | Build A: reinstalar PDV e rodar o diagnóstico de novo |
| 1 | Preflight | janela ≠ hoje (`GOLIVE_JANELA_APROVADA`), backup-scheduled não é de hoje/sucesso, head/main ≠ SHA do CI, check não verde (só skipped sem autorização), histórico ≠ 401 linhas de prod (md5 7e47b7f0…), FK órfã, dados mudaram | nada alterado |
| 2 | 180000/180001 equivalentes | texto aplicado ≠ repo, ou impressão digital (22 itens) ≠ esperado | nada alterado; diferença em `equiv_diff.txt` |
| 3 | 10 migrations da main (ordem do repo) | erro, totais/hashes ≠ baseline, órfã, sem histórico | ROLLBACK da migration; anteriores ficam (aditivas, CREATE OR REPLACE) ⇒ corrigir para frente |
| 4 | #584 fases 1–5 | idem | idem; reversão manual 5→1 só com decisão (destrutiva) |
| 5 | Edge `sync-outbox` → `validar-gerente` (head #584) | deploy falha, versão não sobe, sync-outbox aceita requisição sem assinatura | versão anterior segue ativa; republicar a da main |
| 6 | `20261010120000` (DROP DEFAULT `caixas.loja_id`) | sem G0 B/C, sem G5, sem `CONFIRM_PDV_SYNC_OK=1` (PDV verde, fila 0 com edge nova) | `ALTER TABLE caixas ALTER loja_id SET DEFAULT …` |
| 7 | Merge #584 (merge commit, `--match-head-commit`) | algum dos 18 fora do histórico; head mudou | não reverter automaticamente; revert PR se preciso |
| 8 | Deploy real Vercel (produção pdv-importados) | status skipped/ignored/canceled/failure, URL ≠ 200 | redeploy do commit anterior na Vercel |
| 9 | Smoke não destrutivo | histórico/órfãs/totais/hashes ≠ baseline, ERP ≠ 200, sem `CONFIRM_SMOKE_MANUAL=1` (login, painel, relatório, fechamento por forma, PDV verde, **sem venda real**) | — |

Execução na janela (ex.): `MODE=apply GOLIVE_JANELA_APROVADA=$(date +%F) DB_URL=… BACKUP_RUN_ID=… PDV_RESUMO=RESUMO-diagnostico.txt PROD_URL=… ./golive-final-584.sh` — repetir com `CONFIRM_PDV_SYNC_OK=1` e depois `CONFIRM_SMOKE_MANUAL=1` quando o script pedir.
Decisões abertas: `CONVERGIR_180000=1` (Gate 2) e `CI_ALLOW_SKIPPED` para `rust-tauri-checks` (Gate 1).

## Execução via MCP (sem DB_URL/tokens) — `MODE=emit`
1. `MODE=emit ./golive-final-584.sh` ⇒ `golive-evidencias/mcp/01–07` (somente leitura). Rodar cada um com Supabase MCP `execute_sql`; salvar a saída de `04_baseline.sql` em `golive-evidencias/baseline_fp.txt`.
2. Rodar `MODE=emit CONVERGIR_180000=1` de novo ⇒ `10_g2…`, `20–29_g3…`, `40–44_g4…`, `60_g6…` (1 arquivo = 1 chamada `execute_sql` = 1 transação com guarda de histórico, DDL, linha de histórico com versão real, totais/hashes/órfãs; erro ⇒ nada fica) e `50_edge_*.json` (arquivos para `deploy_edge_function`; sync-outbox `verify_jwt=false`, validar-gerente `true`, como em prod).
3. Ordem: G0 (RESUMO) → G1 (01/02/03 + GitHub MCP check-runs/backup run) → 10 → 20–29 → 40–44 → G5 edges → confirmação PDV → 60 → G7 GitHub MCP `merge_pull_request` (merge, `sha`) → G8 GitHub MCP status `Vercel – pdv-importados` = "Deployment has completed" (≠ "Canceled by Ignored Build Step") → G9.
Testes: `golive/test/mcp-sim.sh` 15/15 (cada arquivo enviado como 1 string), `golive/test/e2e.sh` 28/28, sync na réplica `golive/test/sync-replica-resultado.txt`.

> `mcp-gerado/`: exemplo gerado na RÉPLICA (baseline de dados sintéticos). Na janela, regenerar com `MODE=emit` contra prod — não executar estes arquivos em prod. Testes em `test/` usam caminhos da box (`/workspace`, PG local 55440).
