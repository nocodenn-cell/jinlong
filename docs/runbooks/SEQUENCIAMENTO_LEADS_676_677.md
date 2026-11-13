# Sequenciamento: PR #677 (migrations de leads) e PR #676 (site)

Data: 2026-11-13. Escopo: ordem de liberação e pré-requisitos. Nenhum PR foi mesclado, nenhuma migration aplicada, nenhum label aplicado.

## Ordem obrigatória

0. **Pré-requisito: colisão de versão.** `20261107120000` existe em dois lugares: `#677` (`commercial_leads_remove_anon_insert_policy`) e `#675` (`d2_estorno_dinheiro_caixa_aberto`, draft). Um `db push` com as duas quebra. Quem integra renomeia uma das duas antes de qualquer merge. #675 está em draft e não deve ser mesclado, então o caminho provável é renomear o arquivo de #675.
1. **Adiadas da `main` (decisão e execução do dono):** `20261104120000` (privilégios do anon, runbook manual), `20261104150000`, `20261104160000`, `20261104170000`. Não estão em produção. Cada uma exige autorização própria e o label `deploy-prod:aprovado` no PR que as remove do manifesto.
2. **Merge de #677** (`20261107120000` e `20261107130000`, com rollbacks). A `20261107130000` depende das adiadas do passo 1; por isso, a ordem em produção é: passo 1, depois passo 2.
3. **Merge de #676** (site), somente depois de `20261107130000` estar aplicada em produção. O site chama a RPC com `p_client_ip`, que só existe depois desse passo.

## Conflitos já identificados (que bloqueiam o passo 3)

- `#676` altera `backend/scripts/p0-migration-status.mjs` e o respectivo teste. Essa branch conflita com a regra por ambiente já commitada em `41d112eb` no PR #659 (`MIGRATION_CHECK_ENV`). Teste de `merge-tree` feito em 2026-11-13: conflito nos dois arquivos.
- `#676` adiciona `backend/supabase/migration-check-project-deferred.json`, um segundo mecanismo de aceite de adiadas aplicadas no homolog, por ref do projeto. Ele sobrepõe a regra por ambiente. Precisa escolher **um** dos dois mecanismos antes de mesclar; recomendação: manter a regra por ambiente, que já está na branch do #659 com testes, e remover o arquivo de `#676`.
- `#677` mescla sem conflito com o estado atual deste PR (#659).

## Divergência do homolog (passo 0 do reparo de histórico)

O homolog registra `20261107205637`, `20261107205702` e `20261107210926` com conteúdo diferente dos arquivos de `#677` e de `main`. O `#676` também afirma que as versões `20261104160000` e `20261104170000` estão editadas no homolog. A versão canônica deve ser a do repositório (`main` + `#677`). Reconciliar o homolog com essa versão é uma escrita remota e exige autorização explícita do dono, do mesmo jeito que o reparo de 2026-11-12.

## Decisão registrada

- Ordem acima é a recomendada e não depende de nova decisão técnica.
- O que exige ação humana: renomear a migration de `#675`, aplicar as adiadas do passo 1 com autorização, aplicar o label nos PRs que o exigem, e autorizar a reconciliação do homolog.
- Esta branch não altera `#676` nem `#677`. Qualquer correção deles deve ser feita nas próprias branches, pelo responsável.
