# R-INFRA-03 — Classificação de Drift Migrations (repo × produção)

Evidência: `supabase_migrations.schema_migrations` (32 linhas rastreadas) + inventário
real de objetos de produção (projeto `kbabmewnahysfvlybiak`, ACTIVE_HEALTHY),
cruzado com os 216 arquivos locais em `backend/supabase/migrations/`.

## Fato-base

- O tracking remoto (`schema_migrations`) só começou em **2026-07-07** → lista apenas 32 migrations.
- O inventário de produção (tabelas, funções, views) contém **todos** os objetos criados
  pelas migrations 001–271. Ou seja: as migrations antigas **foram aplicadas**, apenas
  **não constam no tracking**.

## Classificação A/B/C/D (evidência: inventário real de objetos de prod + pg_proc/pg_trigger/to_regclass)

### A) Aplicadas em produção E presentes no repositório  (~194)
Todas as migrations cujos objetos criados existem em prod. Inclui as 16 recuperadas
(bucket B, agora restauradas ao repo). Aplicadas via baseline antes do tracking.

### B) Aplicadas em produção E ausentes do repositório  (16 → RESTAURADAS)
As 16 recuperadas nesta tarefa (estavam em `schema_migrations` sem arquivo). B agora vazio.

### C) Presentes no repositório E NÃO aplicadas em produção  (confirmadas por objeto ausente)
Migrations cujo objeto criado **não existe** em prod (verificado via to_regclass/pg_proc):
- `236_system_alerts_log_leve` → tabela `system_alerts` **ausente** (sem migration de drop no repo).
- `237_system_alerts_remove_triggers` → companion da 236 (triggers ausentes; idempotente).
- `252_venda_finance_context_mirror` → tabela `venda_finance_context` + fn `sincronizar_finance_context_venda` **ausentes**.
- `24702_finalizar_venda_v4_contas_receber_automatico` → depende de `venda_finance_context` (cluster 252, não rastreado).

Ou seja: cluster **system_alerts (236/237)** e cluster **finance_context (252/24702)** existem só no repo.
São a informação a preservar (SSOT), mas **não** devem ser marcadas como applied no repair.

### D) Duplicadas / Obsoletas / Substituídas
**Substituídas (aplicadas e depois trocadas por versão mais nova — manter por histórico):**
- `091_fiscal_correlation_id`, `092_fiscal_state_machine` → triggers substituídos pelos
  `tg_documentos_fiscais_eventos_ai/au` (presentes em prod; ver `066_fiscal_documento_timeline`).
- `240_relatorio_previsao_estoque` → substituída por `242_relatorio_cobertura_estoque_reclassificacao`
  (prod tem `relatorio_cobertura_estoque`; `relatorio_previsao_estoque` ausente).
- Cadeia `finalizar_venda` v2→v3→v4 e migrations block/stub/disabled/drop (ver lista abaixo).

**Duplicadas (mesmo conteúdo, dois prefixos):**

| Repo (não rastreada) | Prod (rastreada = canônica) | Origem / Motivo |
|---|---|---|
| `253_clientes_tipo_endereco_e_view_gerente` | `20260620200253_244_clientes_tipo_endereco_e_view_gerente` | Renumeração ao adotar tracking timestamp; cópia numérica pré-tracking |
| `246_remover_venda_fiado` | `20260620222629_245_remover_venda_fiado` | idem |
| `24703_vendas_em_espera_e_consulta_rapida` | `20260710163032_255_vendas_em_espera_e_consulta_rapida` | idem (255 recuperada nesta tarefa) |

**Canônico = sempre a versão TIMESTAMP** (é a efetivamente aplicada e rastreada em prod).
Nenhuma exclusão será feita agora.

## Buckets (detalhe original)

### 1. Já aplicadas em produção — RASTREADAS (32)
As 32 do `schema_migrations`. Inclui as **16 recuperadas** nesta tarefa (estavam em prod
sem arquivo no repo — SSOT restaurado, ver abaixo).

### 2. Já aplicadas em produção — NÃO RASTREADAS (~184)
Migrations locais 001–258 (numéricas) + timestamp antigas. Seus objetos existem em prod
(verificado no inventário: `produtos`, `vendas`, `caixas`, `estoque`, `comissoes_*`,
`funcionarios*`, `documentos_fiscais_*`, `pricing_*`, etc.). Aplicadas via baseline,
antes de o tracking existir. **Não re-executar.**

### 3. Existentes apenas no repositório (não aplicadas)
Nenhuma confirmada: todo objeto de migration local tem correspondente em produção.

### 4. Obsoletas / Substituídas (aplicadas, mantidas por histórico)
Cadeia evolutiva `finalizar_venda` v2→v3→v4 e migrations de bloqueio/stub:
- `025/028/031/061_finalizar_venda_canonica_v2*`, `089_..._v3`, `243/264_..._v4`
- `20260619174508_fix_finalizar_venda_v2_stub_quebrado`
- `20260619234314_block_v2_legacy_overloads...`
- `20260620004913_stub_v3_full_overload_legacy_disabled`
- `20260620020436_complete_v2_block_all_overloads_legacy_disabled`
- `268_drop_v4_overloads` / `268_reconcile_finalizar_venda_v4_single_overload`
- `245/246_remover_venda_fiado`, `116_drop_..._overloads`, `222_drop_indices_duplicados`

Superseded = imutável (representam a evolução real do schema). **Não remover.**

### 5. Duplicadas (mesmo conteúdo lógico, prefixos diferentes)
Pares repo (numérico, não rastreado) × prod (timestamp, rastreado):
- `253_clientes_tipo_endereco_e_view_gerente` ↔ `20260620200253_244_clientes_tipo_endereco_e_view_gerente` (rastreada)
- `246_remover_venda_fiado` ↔ `20260620222629_245_remover_venda_fiado` (rastreada)
- `24703_vendas_em_espera_e_consulta_rapida` ↔ `20260710163032_255_vendas_em_espera_e_consulta_rapida` (rastreada)

A cópia numérica é a versão pré-tracking; a timestamp é a efetivamente aplicada/rastreada.

## Migrations recuperadas de produção nesta tarefa (16, aditivo — SSOT)
Estavam aplicadas em prod (em `schema_migrations`) mas **sem arquivo no repo**. SQL puxado
de `schema_migrations.statements` e persistido com nome `<version>_<name>.sql` (casa
exatamente com o tracking → futuro `db push` as reconhece como aplicadas, zero re-execução):

`20260709184734_259_historico_precos_produto`, `20260710163032_255_vendas_em_espera_e_consulta_rapida`,
`20260710212200_263_vendas_cliente_id`, `20260710212305_264_finalizar_venda_canonica_v4_cliente_id`,
`20260710212349_265_clientes_insert_operador_pdv`, `20260710212628_266_clientes_unique_documento_loja`,
`20260711015958_259_funcionarios_separate_from_usuarios`, `20260711020021_260_comissoes_regras_funcionario`,
`20260711020053_261_comissoes_vendedores_regra_e_congelamento`, `20260711143312_267_funcionarios_meta_crud`,
`20260713174909_268_drop_v4_overloads`, `20260717031639_248_fix_anon_grant_drift`,
`20260717031919_248_fix_quantidade_devolvida_grant`, `20260717031938_248_fix_quantidade_devolvida_anon_grant`,
`20260717033836_278_fix_v_clientes_gerente_ultima_compra`, `20260719032927_implantacao_checklist_go_live`.

## Plano de reconciliação proposto (NÃO executar tracking sem autorização)

1. **[FEITO — aditivo]** Recuperar as 16 prod-only para o repo. SSOT restaurado no sentido
   repo⊇prod-aplicado.
2. **[PENDENTE — requer autorização]** Alinhar o tracking: marcar as ~184 aplicadas-não-rastreadas
   como `applied` via `supabase migration repair --status applied <version>` (muta
   `schema_migrations` em PRODUÇÃO — irreversível). Alternativa não destrutiva: aceitar o
   tracking parcial e daqui pra frente só empurrar migrations novas.
3. **[PENDENTE]** Resolver duplicadas (bucket 5): manter a versão rastreada, remover a cópia
   numérica do repo (aditivo/reversível em git) — decisão de higiene, sem impacto em prod.

Nada nos passos 2–3 será executado sem nova autorização explícita.
