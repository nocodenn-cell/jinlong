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

Tudo acima fora desta branch: `59c6508d`, `367916c9`, `60205a0b` e `d174cc6b` não estão em `main` nem neste PR.

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
