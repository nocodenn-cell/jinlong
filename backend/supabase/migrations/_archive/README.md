# Migrations arquivadas (fase R1 — reconciliação de schema)

Arquivos removidos do diretório canônico em 2026-07-02 porque **não correspondem a nenhuma versão do ledger de produção** (`supabase_migrations.schema_migrations`, projeto `jinlong`). O diretório `migrations/` deve conter **somente** arquivos cuja versão exista (ou vá existir) no ledger. Classificação por evidência:

## Duplicatas (conteúdo aplicado em produção sob versão timestamp; gêmeo já existe no repo)

| Arquivo | Aplicada em produção como |
|---|---|
| `245_clientes_tipo_endereco_e_view_gerente.sql` | `20260620200253_244_clientes_tipo_endereco_e_view_gerente` |
| `246_remover_venda_fiado.sql` | `20260620222629_245_remover_venda_fiado` |

## Aplicadas manualmente sem registro (objeto/estado **vivo** em produção, sem versão no ledger)

| Arquivo | Evidência em produção (2026-07-02) |
|---|---|
| `224_rls_initplan_wrap_auth_select.sql` | policies com wrap `( SELECT auth.uid())` presentes (ex.: `caixas_select_authenticated`) |
| `225_rls_admin_alinha_painel_gerente.sql` | `dono_gerente_all_cat_fin` já inclui perfil `ADMIN` |
| `226_rls_movimentos_caixa_insert_amarra_loja.sql` | `movimentos_insert` já amarrada a `loja_id` |
| `225_dashboard_serie_horaria_semana_anterior.sql` | função recriada depois por `20260625000252_253_dashboard_gerente_resumo_margem_usa_total_liquido` (supersedida) |
| `238_relatorio_margem_por_venda.sql` / `241_..._snapshot_only.sql` | função recriada por `20260624194750_251_rpc064_margem_usa_total_liquido` (supersedidas) |
| `239_relatorio_curva_abc.sql` | `relatorio_curva_abc_periodo` existe em produção |
| `242_relatorio_cobertura_estoque_reclassificacao.sql` | `relatorio_cobertura_estoque` existe em produção |

> Ambiente novo criado do zero pode divergir do estado final destas policies/funções. Oráculo: jobs `Supabase local RLS smoke` / `Test RLS scope by profile`. Se acusarem gap, **capturar o estado atual de produção** como nova migration timestamp — nunca reaplicar estes arquivos com a numeração antiga.

## Obsoletas (não aplicar nunca)

| Arquivo | Motivo |
|---|---|
| `229_venda_eventos_rpc_hooks.sql` | Recriaria `finalizar_venda_*_v2/v3` — RPCs **explicitamente bloqueadas** em produção (`block_v2_legacy_overloads*`, `LEGACY_DISABLED_USE_V4`). Perigosa. |
| `240_relatorio_previsao_estoque.sql` | Nunca aplicada; função sem nenhum consumidor no app (grep vazio em `pdv-importados`). |
| `245_calcular_preco_produto_precedence_comment.sql` | Apenas `COMMENT ON`; nunca aplicada; conteúdo documental. |

## Rollbacks (scripts operacionais — nunca foram migrations)

`224_rollback_*.sql`, `225_rollback_*.sql`, `226_rollback_*.sql` — manter como referência de operação; um apply sequencial no diretório canônico os executaria como migrations, desfazendo o hardening.

## Pendentes (reautorar como novas migrations timestamp quando decididas — NÃO reaplicar com número antigo)

| Arquivo | Status da decisão |
|---|---|
| `236_system_alerts_log_leve.sql` + `237_system_alerts_remove_triggers.sql` | Aguardando diagnóstico de impacto (frequência do erro atual e fallback do caixa) antes de ativar — decisão do dono do produto em 2026-07-02; candidata à fase **R4** |
| `235_venda_finance_context_mirror.sql` | P3 — só se algum fluxo passar a depender do espelho financeiro |
| `235_observabilidade_pdv_visual.sql` | **Parcialmente** em produção (`itens_venda.custo_unitario_snap` existe; `tipo_preco_fonte`, `regra_aplicada_id`, `pdv_config.show_margin_visual` não). App tolera ausência (campos só de exibição). Reautorar apenas o delta que faltar |
| `249_pricing_version_governance.sql`, `250_calcular_preco_produto_decision_fields.sql`, `250_pricing_version_venda_scope_guard.sql` | Pricing governance nunca ativada em produção; o caixa chama `registrar_pricing_version_venda` com guarda (`pricingVersionId` NULL = modo legado válido). Reautorar em conjunto quando a feature for ativada |
