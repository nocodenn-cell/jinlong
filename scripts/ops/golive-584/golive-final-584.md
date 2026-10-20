# Go-live final #584 — roteiro único (roll-forward: #584 já mergeado em main 2449c46d; shim no PR #588)

**Realidade em 2026-10-20 14:30 BRT:** main = `2449c46d` (merge do #584, 10:03 BRT); frontend `pdv-importados` em produção desde 10:08 BRT; prod DB/edges inalterados (401 migrations, sync-outbox v75, validar-gerente v50). Edges da janela = head do PR #588 `978fb2b9` (shim legado; só `backend/supabase/functions/sync-outbox`).
Script: `/workspace/golive-final-584.sh` (padrão `MODE=dry-run`, somente leitura). Evidências esperadas: `/workspace/golive/ops/`. Teste E2E: `/workspace/golive/test/e2e.sh` (19/19 PASS na réplica local; resultado em `golive/test/e2e-resultado.txt`).
Nada foi executado em prod (só SELECT). Sem `db push`, sem `migration repair`. Cada migration = 1 transação: DDL do arquivo + linha em `supabase_migrations.schema_migrations` (versão/nome reais, `statements` = conteúdo exato do arquivo, mesmo formato das linhas de prod) + checagem de totais/hashes/FKs órfãs; qualquer divergência ⇒ ROLLBACK e parada (exit 10+gate). Reexecução retoma de onde parou.

| Gate | O quê | Para se | Recuperação |
|---|---|---|---|
| 0 | RESUMO do PDV — **informativo, não bloqueia** (diagnóstico pendente — acesso presencial) | nunca para; ausente/Build A/INDETERMINADO/integrity ≠ ok ⇒ só AVISO no log. A sync-outbox do #584 (head 1d445d0b) tem shim legado: Build A sem `loja_id` ⇒ loja resolvida no servidor (caixa existente > loja ativa única; ambíguo/divergente ⇒ rejeita, evento fica na fila do PDV) | — |
| 1 | Preflight | janela ≠ hoje (`GOLIVE_JANELA_APROVADA`), backup-scheduled não é de hoje/sucesso, head do #588 ≠ `978fb2b9` / main ≠ `2449c46d`, check não verde (só skipped sem autorização), histórico ≠ 401 linhas de prod (md5 7e47b7f0…), FK órfã, dados mudaram | nada alterado |
| 2 | 180000/180001 equivalentes | texto aplicado ≠ repo, ou impressão digital (22 itens) ≠ esperado | nada alterado; diferença em `equiv_diff.txt` |
| 3 | 10 migrations da main (ordem do repo) | erro, totais/hashes ≠ baseline, órfã, sem histórico | ROLLBACK da migration; anteriores ficam (aditivas, CREATE OR REPLACE) ⇒ corrigir para frente |
| 4 | #584 fases 1–5 | idem | idem; reversão manual 5→1 só com decisão (destrutiva) |
| 5 | Edge `sync-outbox` → `validar-gerente` (head do #588 `978fb2b9`, checkout local nesse SHA) | deploy falha, versão não sobe, sync-outbox aceita requisição sem assinatura | versão anterior segue ativa; republicar a da main |
| 6 | `20261010120000` (DROP DEFAULT `caixas.loja_id`) — **ADIADA deste rollout** (arquivo mantido). Só com `INCLUIR_120000=1` | padrão: pula (log `G6 ADIADO`). Opt-in: sem G0 B/C presencial, sem G5, sem `CONFIRM_PDV_SYNC_OK=1` | `ALTER TABLE caixas ALTER loja_id SET DEFAULT …` |
| 7 | Merge do #588 (merge commit, `--match-head-commit 978fb2b9`), depois de G2–G5: main passa a ser exatamente o que está publicado. Mantido (não removido) porque as edges vêm do head do PR e o merge fecha a divergência repo × prod | algum alvo fora do histórico (17; 18 com opt-in); head mudou | não reverter automaticamente; revert PR se preciso |
| 8 | Deploy Vercel do frontend `FRONTEND_SHA=2449c46d` (já publicado; o merge do #588 não muda frontend e terá build ignorado) | status skipped/ignored/canceled/failure, URL ≠ 200 | redeploy do commit anterior na Vercel |
| 9 | Smoke não destrutivo | histórico/órfãs/totais/hashes ≠ baseline, ERP ≠ 200, sem `CONFIRM_SMOKE_MANUAL=1` (login, painel, relatório, fechamento por forma, PDV verde, **sem venda real**) | — |

Execução na janela (ex.): `MODE=apply GOLIVE_JANELA_APROVADA=$(date +%F) DB_URL=… BACKUP_RUN_ID=… PDV_RESUMO=RESUMO-diagnostico.txt PROD_URL=… ./golive-final-584.sh` — repetir com `CONFIRM_PDV_SYNC_OK=1` e depois `CONFIRM_SMOKE_MANUAL=1` quando o script pedir.
Motivo do adiamento da 120000: com o shim, Build A funciona antes e depois dela com a edge nova (testado), mas um rollback da edge para a v75 (sem `loja_id`) com o DEFAULT removido quebraria a abertura de caixa ⇒ não é seguro sem o veredito presencial. Atenção: após o merge, `20261010120000` fica no repo sem estar no histórico — não usar `db push`.
Decisões abertas: `CONVERGIR_180000=1` (Gate 2) e `CI_ALLOW_SKIPPED` para `rust-tauri-checks` (Gate 1).

## Execução via MCP (sem DB_URL/tokens) — `MODE=emit`
1. `MODE=emit ./golive-final-584.sh` ⇒ `golive-evidencias/mcp/01–07` (somente leitura). Rodar cada um com Supabase MCP `execute_sql`; salvar a saída de `04_baseline.sql` em `golive-evidencias/baseline_fp.txt`.
2. Rodar `MODE=emit CONVERGIR_180000=1` de novo ⇒ `10_g2…`, `20–29_g3…`, `40–44_g4…` (`60_g6…` só com `INCLUIR_120000=1`) (1 arquivo = 1 chamada `execute_sql` = 1 transação com guarda de histórico, DDL, linha de histórico com versão real, totais/hashes/órfãs; erro ⇒ nada fica) e `50_edge_*.json` (arquivos para `deploy_edge_function`; sync-outbox `verify_jwt=false`, validar-gerente `true`, como em prod).
3. Ordem: G0 (RESUMO, opcional) → G1 (01/02/03 + GitHub MCP check-runs/backup run) → 10 → 20–29 → 40–44 → G5 edges → (60 só opt-in, após confirmação PDV) → G7 GitHub MCP `merge_pull_request` (merge, `sha`) → G8 GitHub MCP status `Vercel – pdv-importados` = "Deployment has completed" (≠ "Canceled by Ignored Build Step") → G9.
Testes: `golive/test/mcp-sim.sh` 16/16 (cada arquivo enviado como 1 string), `golive/test/e2e.sh` 19/19, sync na réplica `golive/test/sync-replica-resultado.txt` e compatibilidade Build A/B/C/conflitos `golive/test/sync-compat-resultado.txt`.

`mcp-gerado/`: agora gerado com `MODE=emit` contra PROD somente leitura em 2026-10-20 14:13 BRT (01–04 e 06 executados via MCP: colunas = congelado, histórico 401/7e47b7f0, órfãs 0, deps = esperado). A baseline muda com vendas: na janela, rodar 04 de novo e regenerar antes de 10/20–44.
