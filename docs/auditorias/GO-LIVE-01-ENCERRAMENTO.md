# GO-LIVE 01 — Encerramento

Data: 2026-10-10.  
Branch: `sprint/go-live-01`.  
PR: https://github.com/nocodenn-cell/fastproduct/pull/535  
Base: `origin/main` @ `a39a530986447c2b608ad409c469267f35141744`.

Sprint: **CONCLUÍDA** tecnicamente.  
Prontidão operacional: **NO-GO**.

Nenhuma migration foi aplicada em produção ou staging. Não houve merge, deploy manual, carga nem alteração no AgeGuard.

## 1. Objetivo

Fechar a prontidão do piloto Jinlong: alinhar o que o Git, a Vercel e o Supabase de produção realmente são, corrigir no código o que a auditoria confirmou, e deixar a janela fiscal P0 pronta para uma autorização futura.

## 2. Entregas concluídas

- Relatório de auditoria, plano da janela fiscal e checklist operacional.
- Correção de loja no `sync-outbox` e no PDV local, com contrato e teste de duas lojas.
- Recuperação do enqueue fiscal: falha intermediária volta o evento para retry.
- Ensaio local da janela `20261009220000` + `20261007163200` em transação única, com rollback de falha e recuperação só pelo SQL canônico.
- Este encerramento.

## 3. Correções implementadas

| Correção | Onde | Aplicada no banco |
|---|---|---|
| `loja_id` obrigatório em `CAIXA_ABERTO` e `VENDA_REGISTRADA` | Edge, contrato, validador, `pdv-local` | não |
| `DROP DEFAULT` de `caixas.loja_id` | `20261010120000_caixa_sem_loja_padrao.sql` | não |
| Enqueue fiscal falho lança `FISCAL_ENFILEIRAR_PENDENTE` | `fiscal_enqueue_after_venda_sync.ts` | não (é código da Edge) |
| Bundle da janela fiscal e recusa de SQL que não seja o arquivo canônico | `backend/scripts/fiscal-p0-janela.mjs` | não |

`cancelar_venda_transacional` e `devolver_ou_trocar_venda` não foram reescritas. O corpo de produção já impede o segundo crédito de estoque.

A série `20261006120000` e `20261007163000`–`20261007190000` não entra nesta entrega. Responsável da próxima janela de schema: quem autorizar o change de financeiro/caixa. Critério de aceite: pré-check do corpo de `financeiro_painel` antes de `20261007163000`, e `20261007180000` antes de `20261007190000`. `20261007161220` não pode ser aplicado depois de `20261009220000`.

## 4. Testes

| Comando | Resultado |
|---|---|
| `deno check` de `sync-outbox/index.ts` e `validar-gerente/index.ts` | **PASS** |
| `deno check` de `fiscal-worker` | **FAIL** de ferramenta. `deno.lock` versão 5; o Deno do workspace é 2.2.2. O arquivo não foi alterado nesta sprint. |
| `npm run test:fiscal-p0-pre-req` | **PASS** |
| `npm run test:fiscal-rpc-authz` | **PASS** |
| `npm run test:go-live-01-isolamento` | **PASS** |
| `npm run test:backup-restore-isolado` | **PASS** |
| `node scripts/sync-outbox-contract-smoke.mjs` | **PASS** |
| `node --test scripts/p0-migration-status.test.mjs` | **PASS** (12) |
| `tsc --noEmit` em `pdv-importados` | **PASS** |
| `tsc --noEmit` em `pdv-local` | **FAIL** de ambiente: faltam `@tauri-apps/api` e `@sentry/browser`. Os erros não estão nos arquivos alterados. |
| `node scripts/no-prod-target-guard.mjs` | **PASS** depois de tirar os refs remotos dos arquivos `*.test.mjs`. O CI do `pdv-importados` tinha falhado nesse guard. |
| Postgres `17-alpine` via Docker | **não executado**. O daemon não estava no pipe `dockerDesktopLinuxEngine`. |
| `next build`, lint do monorepo, `cargo check` | **não executados** |
| CI `migration-remote-drift` | **FAIL** esperado. `remote_ausente`: `20261006120000`, `20261007161220`, `20261007163000`, `20261007163100`, `20261007163200`, `20261007170000`, `20261007171000`, `20261007180000`, `20261007190000`, `20261009220000`, `20261010120000`. Não foi criado par em `migration-human-gates.json`. |

O diff da branch não contém token `eyJ` nem senha. As menções a `service_role` são nomes de papel.

## 5. PRs e commits

PR #535, aberto contra `main`, sem auto-merge.

Commits desde `a39a5309`:

- `8fbecf1a` relatório NO-GO
- `d9856ae4` SHA do relatório
- `e8223a0a` ligação ao PR
- `1bca8c3d` nota do preview Vercel
- `8fa5f524` loja explícita e retry fiscal
- `bccb81fd` SHA dessa correção
- `4b5b1b60` plano da remediação
- `28ec40a3` ensaio local da janela
- `4a9c582c` encerramento
- `6e33eac2` SHA do encerramento
- commit seguinte: os refs remotos saem dos arquivos de teste para o guard de CI passar

## 6. GitHub, Vercel e Supabase

- `main` permanece em `a39a5309`. Esta branch não foi mergeada.
- ERP em produção: deployment **READY** `dpl_DbrwZ7G4dWe6isCfQpVEg9rwyv1U` no mesmo SHA da `main`.
- Site: último build concluído em `19f05be5`. Ignored Build Step segue cancelando o que não altera `site/`.
- Produção `kbabmewnahysfvlybiak`: ledger máximo `20261009140739`. Sem `fiscal_sessao_privilegiada`. Sem `fiscal_cancelar_documento`. `anon` não executa `cancelar_venda_transacional`.
- Staging `tarxrbxddcwvjkimkbnr`: não é clone. Não foi usado.

## 7. Pendências

**P0**

- Aplicar a janela fiscal (`20261009220000` e depois `20261007163200`) só com autorização e com dump do dia restaurado. Responsável: operador autorizado pelo dono. Critério: checklist `GO-LIVE-01-CHECKLIST-FISCAL.md`.
- `fiscal_cancelar_documento` ausente em produção enquanto a tela chama a RPC. Resolve na mesma janela. Não aplicar `20261007161220` depois.

**P1**

- `20261010120000` (`DROP DEFAULT` de `caixas.loja_id`) junto com o deploy da Edge e do PDV que envia `loja_id`. Responsável: o mesmo change de sync, depois do merge. Critério: caixa sem `loja_id` falha; duas lojas não herdam `a0000001-0000-4000-8000-000000000001`.
- Backup diário de produção. Responsável: dono do repositório, secret `SUPABASE_ACCESS_TOKEN` no workflow já descrito em `docs/runbooks/BACKUP_RESTORE_CANONICO.md`. Critério: um artifact com menos de 25 h.
- Ensaio em Postgres servidor. Responsável: quem for executar a janela, na máquina com Docker. Critério: repetir o roteiro do `test:fiscal-p0-pre-req` em `postgres:17-alpine` com dados sintéticos. Não bloqueia este PR.
- Série `20261006` / `20261007163000`–`20261007190000`. Fora desta sprint. Critério na seção 3.

**P2**

- Pilha de capacidade #529–#534 continua draft. Não mergear. Sem CAP-02 e sem teste de 12 h.
- `tsc` do `pdv-local` sem dependências Tauri/Sentry instaladas neste workspace.
- `deno check` do `fiscal-worker` com lockfile versão 5.

## 8. Riscos operacionais

- Deploy da Edge nova sem o PDV que manda `loja_id` faz o caixa antigo falhar fechado. É o comportamento desejado, e precisa de comunicação.
- Aplicar `20261007161220` depois da janela reabre cancelamento fiscal entre lojas.
- Reaplicar o corpo antigo das RPCs reabre o bypass de `current_user`. A recuperação permitida é reaplicar `20261009220000`.
- Staging não serve para homologar esta janela.
- O piloto publicado continua com as três RPCs fiscais no predicado morto.

## 9. Critérios de aceite da sprint

- PR #535 atualizado com os commits da branch.
- Testes que o ambiente consegue rodar estão nesta página, com FAIL só onde a ferramenta ou a dependência faltam.
- Achados críticos corrigidos no Git ou bloqueados com responsável e critério.
- Plano fiscal pronto para janela autorizada.
- Nenhuma escrita em produção, staging, merge ou deploy.
- A decisão abaixo não pede outra auditoria genérica.

## 10. Decisão

- **NO-GO** para merge na `main` nesta sessão. O PR está pronto para revisão humana.
- **NO-GO** para implantação fiscal até autorização explícita e dump do dia.
- **NO-GO** para piloto real.

Banco de produção: **inalterado**.
