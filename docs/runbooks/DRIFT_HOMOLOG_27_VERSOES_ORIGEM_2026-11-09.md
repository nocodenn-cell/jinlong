# Drift do homolog: origem das 27 versões só-no-remoto (2026-11-09)

Escopo: versões que o check `migration-remote-drift` (PR #659, run 42594481553) acusou como presentes só no
remoto, assumindo alvo = homolog `jinlong-homolog-palm` (`yvdilcmxyjafnnsfdtam`). Leitura apenas: nenhum banco,
secret ou label foi alterado. Alvo ainda **inferido**; ver seção 3.

Legenda de origem:
- **Comprovada:** SQL ou commit localizado no histórico git (commit e branch indicados).
- **Parcial:** nome lógico localizado, mas sem SQL com a mesma versão, ou só registro em documento.
- **Sem origem:** nenhum SQL, commit ou documento encontrado em nenhum ref.

## 1. Resumo

As 27 versões se dividem em:
- **20 com origem localizada:** 15 têm par registrado em `59c6508d` (decisão de 2026-11-07, que existe só em outras branches) e 5 têm commit ou arquivo localizado (§2).
- **7 sem origem:** nenhum SQL, commit ou documento encontrado em nenhum ref (§3).

## 2. Versões com origem localizada

| Versão (remoto) | Nome no remoto | Origem | Evidência |
|---|---|---|---|
| 20261029153523 | s1_autorizacao_vinculo_recebimento_transferencia | arquivo `20261029120000_…` | par em `59c6508d` |
| 20261029161123 | s1b_bloqueia_cnpj_distinto_todos_perfis | arquivo `20261029130000_…` | par em `59c6508d` |
| 20261029161430 | rollback_s1b…(validação) | registro de validação do arquivo `20261029130000_…` | par em `59c6508d` |
| 20261029161519 | reaplica_s1b… | arquivo `20261029130000_…` | par em `59c6508d` |
| 20261029161826 | s1c_conferencia_recebimento_por_vinculo | arquivo `20261029140000_…` | par em `59c6508d` |
| 20261029162055 | g14_produto_equivalencias_transferencia | arquivo `20261029150000_…` | par em `59c6508d` |
| 20261029162335 | rollback_g14…(validação) | registro de validação | par em `59c6508d` |
| 20261029162411 | reaplica_g14… | arquivo `20261029150000_…` | par em `59c6508d` |
| 20261029162618 | rollback_s1c…(validação) | registro de validação | par em `59c6508d` |
| 20261029162645 | reaplica_s1c… | arquivo `20261029140000_…` | par em `59c6508d` |
| 20261029163827 | rollback_s1b…para_validar_s1 | registro de validação | par em `59c6508d` |
| 20261029163941 | reaplica_s1_autorizacao… | arquivo `20261029120000_…` | par em `59c6508d` |
| 20261029163953 | reaplica_s1b…apos_validacao | arquivo `20261029130000_…` | par em `59c6508d` |
| 20261029164014 | reaplica_g14…apos_validacao | arquivo `20261029150000_…` | par em `59c6508d` |
| 20261029175741 | s2_nfe_vinculada_oc_sem_dupla_creditacao | arquivo `20261029160000_…` | par em `59c6508d` |
| 20261030002520 | sync_registrar_venda_offline_atomica | commit `d174cc6b` (branch `claude/jl-pdv-02-sync-atomica`) | **colisão**: o arquivo usa a versão `20261030120000`, igual à da NF-e conciliação |
| 20261106140207 | sec_dml_direto_bloqueio_a | commit `367916c9` (branch `sec/contencao-dml-direto-a`) | SQL `20261106140207_sec_dml_direto_bloqueio_a.sql` |
| 20261107205637 | commercial_leads_idempotencia | arquivo `20261104160000_…` (commit `3dd427a1`) | nome; conteúdo não comparado |
| 20261107205702 | commercial_leads_rate_limit | arquivo `20261104170000_…` (commit `3dd427a1`) | nome; conteúdo não comparado |
| 20261107210926 | commercial_leads_remove_anon_insert_policy | commit `60205a0b` (branch `claude/leads-migrations-servico-ip`) | SQL `20261107120000_…`, removido depois em `09bce7e8` |

Atualização (2026-11-11): o registro de `59c6508d` (15 pares) e `DECISOES_DRIFT_HOMOLOG_2026-11-07.md` foram trazidos para este PR. Continuam fora: `367916c9`, `60205a0b` e `d174cc6b`.

## 3. Versões sem origem (7)

| Versão (remoto) | Nome no remoto | Situação |
|---|---|---|
| 20261029163804 | rollback_g14_para_validar_s1 | nenhum SQL/commit com esse nome; registro de rollback de validação |
| 20261029163850 | rollback_s1_autorizacao_vinculo_para_validacao | idem |
| 20261029164844 | rollback_g14_antigo_para_validar_fix_pr648 | idem |
| 20261029164906 | g14_ajustado_catalogo_empresa_pr648 | conteúdo único no homolog (decisão de `59c6508d`); sem SQL |
| 20261029180712 | s2_v2_patch_consumo_recebimento_por_linha_homolog | conteúdo único no homolog; sem SQL |
| 20261029181844 | rollback_s2_versao_final_validacao | registro de validação; sem SQL |
| 20261029181913 | reaplica_s2_versao_final | citada em `SPRINT_NFE_CORRETIVA_ESTADO_2026-10-30.md` como aplicada por `execute_sql`; sem SQL no repositório |

Observação: as três primeiras foram aplicadas e revertidas em validação; o estado atual do homolog não depende delas.

## 4. Alvo do CI (inferido, não confirmado)

- Esperado: o cabeçalho de `ci-backend-supabase.yml` e `MIGRATIONS_RECONCILIACAO_2026-10-16.md` apontam para `yvdilcmxyjafnnsfdtam` (homolog). `backend/README.md` e `P0_CHECKLIST_OPERACIONAL.md` dizem "ex.: staging", mas staging (`tarxrbxddcwvjkimkbnr`) está INACTIVE.
- Evidência: o secret `SUPABASE_MIGRATION_CHECK_PROJECT_REF` foi atualizado em 2026-11-06 14:54 UTC; as 27 versões coincidem com o `list_migrations` do homolog, e nenhuma existe em produção (`kbabmewnahysfvlybiak`).
- Limite: o log mascara o valor do secret; a confirmação depende do step de verificação abaixo.

## 5. Verificação proposta (incluída no workflow)

Step `Confirm drift secret targets homolog (sem imprimir valor)`: compara o secret com `yvdilcmxyjafnnsfdtam` e imprime só `sim` ou `não`. Falha fechado se não bater, junto com `MIGRATION_CHECK_ENV=homolog`.

## 6. Verificação de conteúdo (2026-11-12, somente leitura)

Comparação do SQL armazenado em `supabase_migrations.schema_migrations.statements` do homolog com os arquivos do repositório, após remover comentários `--` e espaços (md5 do texto normalizado).

| Versão (remoto) | Comparado com | Resultado | Encaminhamento |
|---|---|---|---|
| 20261029181913 | `20261029160000_s2_nfe_vinculada_oc_sem_dupla_creditacao.sql` (este PR) | **igual** (`cf6edb58…`) | par HUMAN_GATE registrado neste PR |
| 20261106140207 | `367916c9` (`sec/contencao-dml-direto-a`) | **igual** | resolve-se quando essa branch entrar na `main`; não trazido aqui para não misturar escopo |
| 20261030002520 | `d174cc6b` (`claude/jl-pdv-02-sync-atomica`) | **igual** | a branch precisa renomear o arquivo de `20261030120000` (colide com a NF-e) para `20261030002520` antes do merge |
| 20261107205637 | `20261104160000_commercial_leads_idempotencia.sql` | diferente | homolog roda uma variante; escolher a versão canônica (ver PRs #676/#677) |
| 20261107205702 | `20261104170000_commercial_leads_rate_limit.sql` | diferente | idem |
| 20261107210926 | `60205a0b` / `cef06081` (`20261107120000_…`) | diferente | idem |
| 20261029164906 | `20261029150000_g14_…` | diferente | variante só do homolog; versionar ou reparar o homolog |
| 20261029180712 | `20261029160000_s2_…` | diferente | patch só do homolog; idem |
| 20261029163804, 20261029164844 | — | mesmo md5 entre si; rollback de validação | reparo do histórico do homolog (exige autorização) |
| 20261029163850, 20261029181844 | — | rollback de validação | idem |

## 7. Reparo do histórico do homolog (2026-11-12, autorizado pelo dono)

Escopo: só `supabase_migrations.schema_migrations` do homolog `yvdilcmxyjafnnsfdtam`. Nenhuma função, tabela ou dado de negócio foi alterado; produção não foi tocada.

- **Removidos (6):** `20261029163804`, `20261029163850`, `20261029164844`, `20261029181844` (rollbacks de validação) e `20261029164906`, `20261029180712` (variantes de G14 e S2).
- **Por que é seguro para as variantes:** o estado atual do homolog bate com o repositório nos marcadores verificados: `internal.transferir_estoque_seguro` contém o G14 ajustado ("catálogo da empresa usa o mesmo produto_id") e não contém `TRANSFERENCIA_PRODUTO_SEM_EQUIVALENTE`, igual a `20261029150000_g14_…`; `internal.confirmar_importacao_nfe` contém `v_consumido`, igual a `20261029160000_s2_…`. Comparação por marcadores, não por corpo completo.
- **Backup:** as 6 linhas completas foram copiadas antes, na mesma transação, para `internal.schema_migrations_reparo_backup_20261112` (sem acesso para `anon`/`authenticated`).
- **Resultado:** histórico 487 → 481 versões; 0 restantes das 6.
- **Reversão:** `INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) SELECT version, statements, name, created_by, idempotency_key, rollback FROM internal.schema_migrations_reparo_backup_20261112;`

Pendentes depois do reparo (5): `20261106140207` e `20261030002520` (resolvem-se nas branches de origem) e as 3 de leads (`20261107205637`, `20261107205702`, `20261107210926`), que dependem da escolha da versão canônica.
