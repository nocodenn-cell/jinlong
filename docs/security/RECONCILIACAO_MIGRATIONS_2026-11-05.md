# Reconciliação de migrations — repo × produção (somente leitura)

Data: 2026-11-05. Produção: projeto `jinlong` (`kbabmewnahysfvlybiak`). Consultas somente `SELECT` em `supabase_migrations.schema_migrations`, `pg_proc`, `pg_policy`, `pg_trigger` e `information_schema`. Nenhuma migration aplicada, nenhum reparo de ledger.

## Números

| Item | Quantidade |
|---|---|
| Arquivos de migration no repo (`backend/supabase/migrations`) | 457 |
| Versões no ledger de produção | 446 |
| Presentes no repo e ausentes no ledger | 49 |
| Presentes no ledger e ausentes no repo | 38 |
| Prefixos de versão duplicados no repo | 0 |

## Leitura dos números

A maior parte das diferenças **não** é de migration faltando. É de **mesma migration, versão diferente**. Exemplos verificados por nome:

| Nome | Versão no ledger de produção | Versão no repo |
|---|---|---|
| `caixas_fechado_exige_dados_fechamento` | 20261005151730 | 20260929120000 |
| `s2_nfe_vinculada_oc_sem_dupla_creditacao` | 20261029202813 | 20261029160000 |
| `atualizar_preco_varejo_produto_rpc` | 20260928201815 | 20260928120000 |
| `pos_venda_operacoes_select_dono_todas_lojas` | 20261002104957 | 20261002100000 |
| `c3_*` (6 migrations) | 20261003203447 … 20261003203833 | 20261001100000 … 20261001100500 |
| `implantacao_go_live_somente_dono_admin` | 20261009033124 | 20261009120000 |
| `pdv_diagnostico_somente_dono_admin` | 20261009115256 | 20261009150000 |
| `estoque_ajuste_concorrente` | 20261006195639 | 20261005224553 |
| `financeiro_contas_operacionais` | 20261006195837 | 20261006180000 |
| `desconto_comercial_operador_dinheiro` | 20261006200048 | 20261006190000 |
| `entrada_documento_posterior` | 20261006195805 | 20261005225856 |
| Bloco fiscal e financeiro `20261005151443…20261005151736` (≈20) | ledger | repo `20260902130000…20260903180000` e afins |

Esse é o mesmo padrão já registrado no GO-LIVE-02 (`docs/auditorias/GO-LIVE-02-RELATORIO.md`): aplicações feitas com versão diferente do arquivo. **Risco:** `supabase db push` ou qualquer ferramenta que compare por versão tentará reaplicar SQL já existente, ou pular SQL que não está lá.

Ainda sem correspondência por nome:
- `protege_preco_custo_operador_fase_a` (20261009135940) e `revoga_leitura_direta_preco_custo_fase_b` (20261009140739): só no ledger. Não há arquivo no repo com essas fases.
- Repo-only sem correspondência de nome no ledger (lista completa de 49 versões reproduzível pelo comando de comparação): conferir cada item antes de aplicar. Notáveis: `20260913090000_relatorio_tz_validado_sem_pg_timezone_names`, `20261028110000_corte_admin_papeis`, `20261028120100_sec_tokens_usuario_inativo_revogacao`, `20261028121000_provisionamento_automatico_bloqueado`, `20261028122000_admin_residual_escopo_ativo`, `20261029155000_movimentos_estoque_log_transferencia_id`, `20261030100000…20261030140000` (NF-e e dispositivo).

## Correção importante ao diagnóstico anterior

Eu tinha dito que a migration de fuso (`20260913090000`) "não está em produção". **Isso precisa ser ajustado:**

- O ledger de produção **tem** uma entrada `20261005151721 relatorio_tz_validado_sem_pg_timezone_names`, com o mesmo nome.
- Porém a função `relatorio_tz_validado` em produção **ainda usa** `pg_timezone_names` (confirmado em `pg_proc.prosrc`).
- O repo não tem arquivo `20261005151721`. O conteúdo que foi realmente aplicado naquela versão é desconhecido.

Conclusão: **o ledger não é confiável como prova de conteúdo.** A correção de performance de fuso ainda não está ativa no corpo da função, e é preciso descobrir o que a entrada `20261005151721` executou antes de qualquer nova aplicação.

## Verificações de conteúdo já feitas (catálogo)

- A2: `trg_caixas_fechado_imutavel` ativo (migration `20260904140000`, no ledger com o mesmo número).
- Escritores das tabelas sensíveis são todos SECURITY DEFINER (`pg_proc`).
- Grants de `authenticated` em `vendas`, `itens_venda`, `vendas_pagamentos`, `descontos_venda`, `perfis`, `feature_flags` são os descritos no diagnóstico.

## Próximos passos (sem aplicar nada)

1. Para cada par por nome, comparar o corpo: `pg_get_functiondef` ou `pg_policy` em produção × arquivo do repo. Cada par vira um dos três: **equivalente** (registrar mapeamento), **diferente** (investigar) ou **ausente** (aplicar só após revisão).
2. Decidir a convenção: um mapeamento versão-do-ledger → arquivo-do-repo, versionado em `backend/supabase/reports/`, antes de qualquer `db push`.
3. Só então homologar 003 e 004, depois 002.

## Limitações

- Comparação por nome e por versão, não por hash de conteúdo. Não é prova de equivalência.
- Não foi consultado o ledger de homologação (`jinlong-homolog-palm`) nem o de staging.
