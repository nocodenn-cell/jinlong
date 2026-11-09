# Runbook — reconciliação das 11 migrations ausentes no remoto

Status: **planejado, não executado**. Nada foi aplicado em homolog nem em produção.
Referência: `docs/qa/PDV_100_1_DEFEITOS_E_DECISOES.md` e diagnóstico do drift desta branch.

## Alvos
- Homolog: `jinlong-homolog-palm` (`yvdilcmxyjafnnsfdtam`). Hoje tem só as migrations NF-e (`20261030120000`, `…130000`, `…140000`).
- Produção: `jinlong` (`kbabmewnahysfvlybiak`). **Não tocar** sem janela aprovada e label `deploy-prod:aprovado`.

## Ordem de aplicação (dependências)
| Ordem | Migration | Grupo | Rollback no repo |
|---|---|---|---|
| 1 | 20261028100000 sec_token_gerente_loja_nula_fora_da_loja | segurança | **ausente** |
| 2 | 20261028101000 cobranca_correcoes_revisao_585 | cobrança | **ausente** |
| 3 | 20261028110000 corte_admin_papeis | segurança | sim |
| 4 | 20261028120100 sec_tokens_usuario_inativo_revogacao | segurança | sim |
| 5 | 20261028121000 provisionamento_automatico_bloqueado | segurança | sim |
| 6 | 20261028122000 admin_residual_escopo_ativo | segurança | sim |
| 7 | 20261029155000 movimentos_estoque_log_transferencia_id | estoque | **ausente** |
| 8 | 20261030100000 sec_token_dispositivo_vale_na_loja | segurança | sim |
| 9 | 20261030120000 nfe_conciliacao_duplicatas | NF-e | sim |
| 10 | 20261030130000 nfe_precisao_documental | NF-e | sim |
| 11 | 20261030140000 nfe_qtd_precisao | NF-e | sim |

Dependências observadas: 3 depende dos helpers da ordem 1 e do PR #620 (cabeçalho da própria migration); 5 depende das funções da 3; 8 reescreve a mesma função de 1; 10 e 11 seguem a 9.

## Pré-requisitos (antes de qualquer aplicação)
1. Rollbacks faltantes: escrever `…100000`, `…101000` e `…29155000` e revisá-los com o dono. Sem eles, o item não entra.
2. Revisão de segurança dos itens 1–6 e 8 (mudam permissões e RLS).
3. Backup e drill de restauração no homolog antes de aplicar.
4. Pré-checagens somente leitura: `docs/runbooks/sql/pre_checagem_drift_readonly.sql`.

## Passos (homolog)
1. Rodar a pré-checagem e salvar a saída.
2. Aplicar a migration por ordem, uma por vez, com `psql` dentro de transação e checagem após cada uma.
3. Após cada migration, rodar a verificação de objetos correspondente (colunas, funções, triggers).
4. Rodar as suítes de permissão e isolamento de homolog (`npm run test:financial`, E2E de caixa).
5. Se algo falhar: executar o rollback da própria migration, na ordem inversa.

## Produção (só após homolog verde e aprovação)
- Janela aprovada pelo dono; backup; mesma ordem; mesma pré-checagem; label `deploy-prod:aprovado` no PR da migration.
- Não usar `migration repair` nem `db push` para ajustar o histórico. A divergência de nomes (ex.: `20261029202813` no remoto e `20261029160000` no local) tem plano próprio.

## Critérios de parada
- Qualquer pré-checagem que mostre dados que violariam o CHECK ou a constraint nova.
- Divergência entre o objeto esperado e o encontrado.
- Falha de rollback.
