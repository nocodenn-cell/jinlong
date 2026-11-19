# Decisões sobre o drift de migrations no homolog (2026-11-07)

Escopo: as 24 versões do projeto de homologação `yvdilcmxyjafnnsfdtam` que não têm arquivo correspondente nesta branch (`claude/plano-liberacao-d1-d3`). O gate `migration-remote-drift` bloqueia por elas.

Decisão tomada pelo assistente, a pedido do responsável ("revise e decida por mim"), com base nas evidências abaixo. O responsável revisa esta tabela antes do merge.

## Critério

Registrar um par em `backend/supabase/migration-human-gates.json` somente quando o conteúdo SQL armazenado no homolog é idêntico (mesmo md5 do statement armazenado em `supabase_migrations.schema_migrations`) ao de uma versão já pareada. Versões com conteúdo único no homolog ficam bloqueando, para que a divergência continue visível.

## Registrados nesta decisão (4)

| Versão remota | Nome no homolog | Par (git) | Evidência |
|---|---|---|---|
| 20261029163941 | reaplica_s1_autorizacao_vinculo | 20261029120000 | md5 igual ao de 20261029153523 (já pareada) |
| 20261029163953 | reaplica_s1b_apos_validacao_s1 | 20261029130000 | md5 igual ao de 20261029161123 (já pareada) |
| 20261029164014 | reaplica_g14_apos_validacao_s1 | 20261029150000 | md5 igual ao de 20261029162055 (já pareada) |
| 20261029163827 | rollback_s1b_para_validar_s1 | 20261029130000 | md5 igual ao de 20261029161430 (já pareada) |

Os 11 pares registrados antes (por correspondência de nome, com md5 não verificado contra o arquivo local) também apontam para este documento.

## Bloqueando (9): divergência real ou sem arquivo no repositório

| Versão remota | Nome | Por que não registrar |
|---|---|---|
| 20261029164906 | g14_ajustado_catalogo_empresa_pr648 | Conteúdo único no homolog. É a última versão do g14 aplicada lá e não existe arquivo correspondente no repositório. O homolog roda uma variante do g14 que o repositório não tem. |
| 20261029180712 | s2_v2_patch_consumo_recebimento_por_linha_homolog | Patch só de homolog em `confirmar_importacao_nfe`. Sem arquivo no repositório. |
| 20261029181913 | reaplica_s2_versao_final | Conteúdo único; é o estado final do s2 no homolog e não bate com nenhum arquivo do repositório. |
| 20261029181844 | rollback_s2_versao_final_validacao | Conteúdo único; intermediário do ciclo acima. |
| 20261029163850 | rollback_s1_autorizacao_vinculo_para_validacao | Conteúdo único; intermediário do ciclo de s1. O estado final de s1 (163941) bate com o registrado. Revisar se o rollback é só validação. |
| 20261029163804 | rollback_g14_para_validar_s1 | Mesmo md5 de 20261029164844, sem par registrado. Intermediário do ciclo de g14. |
| 20261029164844 | rollback_g14_antigo_para_validar_fix_pr648 | Mesmo md5 de 20261029163804. Precede a variante `g14_ajustado`, que não tem arquivo. |
| 20261030002520 | sync_registrar_venda_offline_atomica | Nenhum arquivo nesta branch referencia a função nem o `system_alerts_tipo_check` dela. Função de sync que roda no homolog e não está no repositório. |
| 20261106140207 | sec_dml_direto_bloqueio_a | Arquivo existe só em `origin/sec/contencao-dml-direto-a`, não nesta branch. Depende de decisão de escopo do PR. |

## Ações recomendadas (não executadas)

1. Engenharia confirma se as variantes `g14_ajustado` (20261029164906) e `s2_v2_patch` / `reaplica_s2_versao_final` (20261029180712, 20261029181913) devem entrar no repositório como migrations. Depois disso, criam-se os arquivos e os pares.
2. Versionar `sync_registrar_venda_offline_atomica` (20261030002520) no repositório, ou remover do homolog por reparo controlado.
3. Decidir se `origin/sec/contencao-dml-direto-a` entra neste PR ou em outro. Só então `20261106140207` pode ser pareada.
4. Reparo da tabela de migrations do homolog só com autorização explícita, por ser alteração remota.
