# GO-LIVE 02 — Checklist de autorização

Data: 2026-10-10.  
Branch: `sprint/go-live-01` @ `b9670099`.  
Histórico, não é o head: merge do PR #536 em `5cdcc697`; head do carrinho `79f2beb5`; ensaio `age` sintético em `64a0f5b1`.  
PR: https://github.com/nocodenn-cell/fastproduct/pull/535

Este texto prepara decisões. Não autoriza dump, restore, migration, deploy nem merge na `main`. Cada bloco abaixo é um GO próprio. Cumprir um não abre o seguinte.

## 0. O que já está feito e o que não está

- PR #536 mergeado nesta branch. Head do carrinho `79f2beb5`. Merge `5cdcc697`. O head deste gate é `b9670099`.
- CI deste head: `migration-remote-drift` vermelho de propósito. `CI pdv-importados` / `build-and-test` falhou em `shared-core` (`unifiedCartStore.spec.ts`: `partialize` indefinido no Vitest `node`, 2 testes). Isso bloqueia tratar a branch como verde. Não bloqueia, por si, pedir autorização de backup.
- Homologação local do carrinho passou: incluir e recarregar, troca de operador, legado sem dono, primeira loja e troca de loja. Chrome em `http://localhost:3000`, Supabase `127.0.0.1:54321`.
- Botão Sair ficou pendente fora deste checklist. Duas saídas usaram o botão; duas não navegaram em 8s. Não bloqueia o isolamento já medido e não libera schema.
- Backup `age` sintético em PostgreSQL 17.11 passou no commit `64a0f5b1`. Isso é ensaio operacional de cifra e restore por pipe. Não é recuperação integral do projeto Supabase.
- Nenhuma migration desta lista foi aplicada em produção. Nenhum `migration repair`. Nenhum par novo em `migration-human-gates.json`.

## 1. Backup real

GO só com autorização escrita que nomeie o projeto e o dia.

- [ ] O alvo é produção `kbabmewnahysfvlybiak`, somente leitura.
- [ ] A saída fica fora do Git, em disco criptografado, sem pasta sincronizada, issue ou PR.
- [ ] Custódia de chave `age` só é exigida se o artefato for `.age`. O dump já exercido em 2026-10-08 não usa `age`. Chave privada não entra no relatório.
- [ ] O comando recusa host `supabase.co` quando o modo é ensaio. O dump real e o restore seguem `docs/auditorias/GO-LIVE-02-ROTEIRO-BACKUP-RESTORE.md`.
- [ ] O relatório guarda hora UTC, contagem e SHA-256. Não guarda senha, XML, nome nem payload.

O bloco 1 pode ser autorizado sozinho. O bloco 2 exige o dump desse mesmo dia e não abre migration. Cada janela do bloco 3 exige dump e restore isolado daquele dia; em outro dia, repetir 1 e 2. O bloco 4 sem `20261010120000` não exige dump. O par do `DROP DEFAULT` exige os blocos 1, 2 e 3.4 no mesmo change.

## 2. Restore isolado

Diferente do backup operacional sintético. Aqui o dump do dia volta num Postgres novo, descartável, fora de produção e de staging.

- [ ] O destino não é `kbabmewnahysfvlybiak` nem `tarxrbxddcwvjkimkbnr`.
- [ ] Contagens de tabelas, policies, functions e triggers batem com a origem. A fila fiscal não é listada linha a linha.
- [ ] O Postgres descartável e os arquivos `roles.sql`, `schema.sql` e `data.sql` são apagados no mesmo dia, depois do pós-check.
- [ ] Falha de contagem interrompe. Não há `migration repair` para “alinhar” o ledger.

## 3. Migrations

Três changes separados. A ordem abaixo é obrigatória quando mais de um for autorizado no mesmo período.

### 3.1 Fora de qualquer janela

- [ ] `20261006120000_financeiro_contas_formas_e_painel` não é aplicada. Foi substituída por `20261006180000_financeiro_contas_operacionais` (ledger `20261006195837`). `remote_ausente` não a recoloca na fila.

### 3.2 Lote de caixa e financeiro — `20261007*`

Exige o bloco 2 no mesmo dia e zero caixas `ABERTO`. Há registro de um caixa aberto em 08/10; a contagem vale na hora da janela, não aquela data.

Ordem do runbook `docs/runbooks/PLANO_MIGRATIONS_PENDENTES_2026-10-08.md`:

1. `20261007161220_fiscal_cancelado_ssot`
2. `20261007163000_ssot_001_002_painel_ec_cache`
3. `20261007163100_ssot_003_nfe_obrigacao_duplicata`
4. `20261007163200_ssot_004_revoke_insert_documentos_fiscais`
5. `20261007170000_ssot_002_mov_ar_ec_cache`
6. `20261007171000_ssot_002_cancel_guard_antes_devolucao`
7. `20261007180000_calcular_valor_sistema_por_forma_caixa`
8. `20261007190000_caixas_fechamento_formas_snapshot`

- [ ] Nenhum caixa `ABERTO` no instante anterior ao primeiro arquivo.
- [ ] Cada arquivo é a própria transação. Versão gravada é a do nome do arquivo. Par no human-gates só depois do `COMMIT`, se a ferramenta gravar outro timestamp.
- [ ] O `CREATE` de `fiscal_cancelar_documento` no item 1 é o mesmo texto de `20261009220000`. Reaplicar o item 1 não remove `FISCAL_CANCELAR_LOJA`.

### 3.3 Janela fiscal

Pode ocorrer antes do lote 3.2. Não substitui o lote 3.2 e não exige zero caixas `ABERTO`, porque não reescreve venda, caixa nem financeiro.

- [ ] Uma transação: `20261009220000_fiscal_rpc_isola_loja.sql` e depois o corpo de `20261007163200` sem o `BEGIN`/`COMMIT` interno (`bundleFiscalP0`).
- [ ] Se o lote 3.2 já rodou, `20261009220000` ainda é o último escritor das quatro RPCs.
- [ ] Recuperação de função depois do `COMMIT`: só o arquivo `20261009220000`. `assertRecoveryIsCanonical` recusa qualquer outro texto.
- [ ] Gerente de outra loja recebe `FISCAL_CANCELAR_LOJA` ou `FISCAL_REPROCESSO_LOJA`. Usuário inativo é negado. `anon` não executa.

### 3.4 Loja obrigatória no caixa

- [ ] `20261010120000_caixa_sem_loja_padrao` só sobe no mesmo change do deploy da Edge `sync-outbox` e do PDV que enviam `loja_id`. `DROP DEFAULT` antes desse deploy é incompatível.

## 4. Deploy

- [ ] Autorização nomeia o que sobe: Edge, PDV, ou ambos.
- [ ] Não acompanha migration fora do bloco 3.4 quando o deploy for o par do `DROP DEFAULT`.
- [ ] Preview da Vercel e check ignorado não contam como deploy de produção.
- [ ] Merge do PR #535 na `main` é outra autorização. Este checklist não a concede.

## 5. GO por etapa

Cada bloco tem decisão própria. Marcar um não marca os outros e não implanta a GO-LIVE inteira. Backup e restore do dia são pré-requisito só da operação que altera ou valida o banco. Preparar o PR #535 não é autorização.
