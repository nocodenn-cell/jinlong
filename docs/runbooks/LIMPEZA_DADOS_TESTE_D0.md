# Runbook — limpeza dos dados transacionais de teste (piloto D0)

> **Estado: procedimento preparado e validado em cópia isolada (2026-10-08). NÃO executado em produção.**
> Executar em produção exige **autorização específica e posterior do dono** e um backup restaurável
> imediatamente antes (ver [BACKUP_RESTORE_CANONICO.md](./BACKUP_RESTORE_CANONICO.md)).

Contexto: o dono confirmou (2026-10-08) que **todas as vendas existentes foram feitas para testes**.
Elas não são faturamento real e podem ser descartadas. Isso inclui o rastro delas (caixas, movimentos,
fiscal, financeiro, kardex).

## O que o script faz

Arquivo: [`backend/scripts/limpeza-dados-teste-d0.sql`](../../backend/scripts/limpeza-dados-teste-d0.sql)

- Roda numa transação. **Dry-run por padrão** (termina em `ROLLBACK`); só confirma com `-v commit=1`.
- Exige `-v autorizacao=LIMPAR_DADOS_TESTE_JINLONG_D0`, `-v ator_id=<uuid do DONO>` e
  `-v corte='<timestamptz>'`.
- **Guarda de dados reais:** se existir venda ou caixa criado a partir do `corte`, aborta antes de
  qualquer alteração (protege vendas reais contra reexecução depois do go-live).
- Usa `session_replication_role = replica` só dentro da transação, para passar pelos triggers de
  imutabilidade (kardex, caixa fechado). Restaurado no fim da transação.
- Apaga as 54 tabelas transacionais listadas abaixo, zera a sequência
  `movimentacoes_caixa_numero_sequencial_seq`, reescreve o kardex com **um movimento
  `ENTRADA_AJUSTE` de saldo inicial por linha de estoque com saldo > 0**, imprime contagens
  antes/depois e verifica **todas** as FKs de `public` contra linhas órfãs (aborta se houver).

### Tabelas apagadas (transacionais)

| Grupo | Tabelas |
|---|---|
| Vendas | `vendas`, `itens_venda`, `vendas_pagamentos`, `vendas_em_espera`, `vendas_canceladas_auditoria`, `venda_eventos`, `venda_pos_venda_itens`, `venda_pos_venda_operacoes`, `venda_engine_shadow_runs`, `devolucoes`, `descontos_venda`, `tokens_desconto_gerente` |
| Caixa | `caixas`, `movimentacoes_caixa`, `movimentos_caixa`, `tokens_autorizacao_operacao`, `gerente_auth_attempts`, `gerente_auth_rate_limits` |
| Estoque | `estoque_baixas`, `estoque_reposicoes_cancelamento`, `estoque_reposicoes_devolucao`, `movimentos_estoque_log`, `transferencias_idempotencia` |
| Fiscal | `documentos_fiscais_pendentes`, `documentos_fiscais_eventos`, `documentos_fiscais_dlq` |
| Comissões geradas | `comissoes_itens`, `comissoes_ajustes`, `comissoes_pagamentos`, `comissoes_pagamentos_ajustes`, `comissoes_vendedores` |
| Financeiro | `contas_receber`, `liquidacoes_receber`, `contas_pagar`, `contas_pagar_pagamentos`, `movimentos_financeiros`, `conciliacoes_financeiras`, `extratos_financeiros`, `financeiro_comandos`, `financeiro_recebiveis_venda` |
| Compras / NF-e | `importacoes_nfe`, `importacoes_nfe_itens`, `importacoes_nfe_duplicatas`, `entrada_documentos`, `remessas`, `remessa_itens`, `ordens_compra`, `ordens_compra_itens`, `ordens_compra_recebimentos` |
| Telemetria / idempotência | `sync_request_nonces`, `system_alerts`, `caixa_scan_telemetry_events`, `cadastro_produto_telemetry_events`, `produto_create_requests` |

> **Decisão a confirmar:** o grupo *Compras / NF-e* e *contas_pagar* não foram citados pelo dono. Foram
> incluídos porque (a) `contas_pagar_pagamentos` e `ordens_compra_recebimentos` têm FK para caixas e
> kardex, e (b) os dados são do mesmo período de teste (6 NF-e, 6 remessas, 1 OC, 9 contas a pagar).
> Se algum desses for real, **retirar da lista antes de executar**.

### Preservado (cadastros e configuração)

`lojas`, `usuarios`, `perfis`, `auth.users` / `auth.identities`, `produtos`, `estoque`
(`quantidade_atual` intacta), `precos_atacado`, `historico_precos_produto`, `historico_tiers_crud`,
`categorias`, `categorias_financeiras`, `marcas`, `fornecedores`, `vinculos_fornecedor_produto`,
`clientes`, `funcionarios`, `funcionarios_meta`, `comissoes_regras_funcionario`,
`comissoes_regras_historico`, `formas_pagamento`, `financeiro_contas_forma`, `contas_financeiras`,
`pdv_config`, `configuracoes_gerais`, `feature_flags`, `fiscal_provider_config`,
`pricing_config_versions`, `regras_preco`, `relatorio_settings`, `tipos_movimento_estoque`,
`gtin_lookup_cache`, `implantacao_checklists`, `implantacao_checklist_itens`,
`_backup_schema_migrations_20260802`.

## Resultado do ensaio (cópia isolada da produção, 2026-10-08)

Cópia = restauração do dump real de produção (258 vendas) em Postgres/Supabase local descartável.

| Verificação | Resultado |
|---|---|
| Dry-run | termina em `ROLLBACK`, banco intacto |
| `vendas` | 258 → 0 |
| `caixas` | 56 → 0 |
| `itens_venda` / `vendas_pagamentos` | 263 / 106 → 0 |
| `documentos_fiscais_pendentes` | 42 → 0 (inclui o documento "EMITIDO" com chave de 15 dígitos, artefato de teste) |
| `movimentos_estoque_log` | 288 → 70 (um saldo inicial por produto com estoque) |
| FKs órfãs | 0 |
| `v_estoque_ledger_divergencia` | 40 → 0 |
| Cadastros preservados | produtos 155, estoque 152, usuários 11, clientes 2, fornecedores 14, preços atacado 65, lojas 1, auth.users 14 |
| Reexecução | mesmo estado final |
| Guarda de dados reais | com venda posterior ao `corte`: `ABORTADO`, nada alterado |
| Sem `autorizacao` / `ator_id` / `corte` | recusa e sai |

## Candidatos a cadastro de teste (NÃO removidos pelo script)

O script não apaga produtos. Encontrados em produção em 2026-10-08, para decisão do dono:

- 36 produtos com nome começando por `QA`/`E2E`/`TEST` ou contendo `QA CSV`/`E2E`;
- 15 produtos de demonstração (`id` iniciando em `d1c0d200`, seed bilíngue zh/pt);
- 2 clientes e 14 fornecedores: conferir se são reais.

Conferir também o **saldo físico** dos produtos mantidos: o baseline grava o saldo atual como
"saldo inicial", sem validá-lo contra a contagem real.

## Como executar (somente após autorização específica do dono)

1. Backup fresco e **restaurado com sucesso** (drill) no mesmo dia. Sem isso, não executar.
2. Ensaiar de novo numa cópia recente (`restore-drill.sh`) com o `corte` do go-live.
3. Dry-run no alvo e conferir as contagens "antes → depois":

```bash
psql "$ALVO" -v ON_ERROR_STOP=1 \
  -v autorizacao=LIMPAR_DADOS_TESTE_JINLONG_D0 \
  -v ator_id=<uuid do DONO em auth.users> \
  -v corte='2026-10-10 00:00:00+00' \
  -v commit=0 -f backend/scripts/limpeza-dados-teste-d0.sql
```

4. Executar com `-v commit=1`. Conferir `SELECT count(*) FROM vendas` = 0 e
   `v_estoque_ledger_divergencia` vazia.
5. Contar o estoque físico antes de abrir a loja.

## Rollback

Não há "desfazer" depois do `COMMIT`: o rollback é **restaurar o backup tirado no passo 1**
(`restore-drill.sh`). Por isso o passo 1 é obrigatório.
