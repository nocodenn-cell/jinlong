# Reconciliação Supabase — Produção × Repositório (auditoria read-only)

> **Missão P0 governança** · **Somente leitura** — nenhum `db push`, nenhuma alteração em produção, nenhuma migration nova criada nesta entrega.  
> **Data da evidência:** 2026-08-08 (UTC)  
> **Projeto:** Supabase `jinlong` (ref interno — ver dashboard; Postgres 17, `sa-east-1`)  
> **SSOT de migrations no repo:** `backend/supabase/migrations/`  
> **Documentos relacionados:** `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` (2026-06-20), `backend/supabase/MIGRATIONS_DRIFT_CLASSIFICATION.md`

---

## 1. Resumo executivo

| Métrica | Repositório | Produção (`schema_migrations`) |
|--------|-------------|--------------------------------|
| Arquivos `.sql` | **237** | **263** versões registradas |
| Paridade por **chave de versão** | 233 versões com par | **30 só produção**, **4 só repo** (ver §4) |
| Formato | Numérico `001`…`288` + timestamps `2026…` | Numérico + timestamps intercalados |

**Conclusão:** o drift de junho/2026 **evoluiu**. Produção **não está “atrás” do repo** no núcleo operacional — em vários clusters está **à frente** (pacote `20260805`…`313_*`). O risco P0 continua sendo **determinismo do tracking**: a mesma versão numérica pode significar conteúdos diferentes; reaplicar cegamente quebra dados ou falha com PK duplicada.

**Atualização vs. auditoria antiga (itens pedidos):**

| Item | Doc 2026-06-20 | Evidência 2026-08-08 (produção) |
|------|----------------|----------------------------------|
| `descontos_venda.operador_id` / `aplicado_em` | Ausentes | **Presentes** (+ `motivo_desconto`, `motivo_descricao_livre`) — migration **272** rastreada |
| `system_alerts` | Tabela ausente | **Tabela existe**; **0 linhas**; **0 triggers** `*system_alert*` (237 removeu; 311 re-aplicou stack observabilidade) |
| `venda_finance_context` | Ausente | **Ainda ausente** (`to_regclass` = false) apesar de **252 rastreada** → **drift tracking × schema** |

---

## 2. Metodologia (evidências)

1. Inventário repo: `ls backend/supabase/migrations/*.sql` (237 arquivos, **0 colisões de prefixo de arquivo**).
2. Inventário produção: Supabase MCP `list_migrations` + `SELECT count(*) FROM supabase_migrations.schema_migrations` → **263**.
3. Diff mecânico versão-a-versão: script `backend/supabase/scripts/reconcile-prod-repo-inventory.mjs` (conjunto de versões exportado via `array_agg(version)` em produção).
4. Prova de schema (read-only): `information_schema` / `pg_proc` / `pg_trigger` via MCP `execute_sql`.
5. **Proibido nesta missão:** `apply_migration`, `db push`, `migration repair`, DDL/DML de correção.

---

## 3. Inventário — migrations no repositório

- **Caminho:** `backend/supabase/migrations/`
- **Total:** 237 arquivos `.sql`
- **Faixa numérica:** `001_schema_inicial.sql` … `288_pdv_certificacao_operacional_caixa_e_espera.sql`
- **Timestamps no repo (exemplos):** `20260419013345_*`, `20260620222629_245_remover_venda_fiado.sql`, `20260710163032_255_vendas_em_espera_e_consulta_rapida.sql`, … (16+ recuperadas de prod — ver `MIGRATIONS_DRIFT_CLASSIFICATION.md`)
- **Legado / não-canônico:** `pdv-importados/supabase/migrations/` (pacote paralelo antigo) — **fora do SSOT** desta reconciliação.

---

## 4. Inventário — migrations aplicadas em produção

Fonte: `supabase_migrations.schema_migrations` (263 linhas).

### 4.1 Versões no repo **sem** linha homônima em `schema_migrations` (4)

| Versão repo | Arquivo | Equivalente rastreado em prod (evidência) |
|-------------|---------|-------------------------------------------|
| `228` | `228_venda_eventos_ledger.sql` | `20260707000000` · `venda_eventos_ledger` |
| `231` | `231_gerente_venda_eventos_rpcs.sql` | `20260707010000` · `gerente_venda_eventos_rpcs` |
| `244` | `244_consistencia_vendas_auditoria.sql` | `20260707020000` · `consistencia_vendas_auditoria` |
| `248` | `248_devolver_ou_trocar_venda.sql` | `20260717031500` · `248_devolver_ou_trocar_venda` |

**Interpretação:** conteúdo **provavelmente aplicado** em prod sob **versão timestamp**; o arquivo numérico no repo é **cópia pré-tracking** — **não** executar de novo pelo prefixo `228/231/244/248`.

### 4.2 Versões em produção **sem** arquivo repo com a mesma chave (30)

| Versão prod | Nome (schema_migrations) | Observação |
|-------------|--------------------------|------------|
| `20260707000000` | venda_eventos_ledger | Par lógico → repo `228_*` |
| `20260707010000` | gerente_venda_eventos_rpcs | Par lógico → repo `231_*` |
| `20260707020000` | consistencia_vendas_auditoria | Par lógico → repo `244_*` |
| `20260717031500` | 248_devolver_ou_trocar_venda | Par lógico → repo `248_*` |
| `20260801090000` | v_estoque_ledger_divergencia | **Sem arquivo repo** |
| `20260801120000` | recebimento_conferencia_explicita | **Sem arquivo repo** |
| `20260805151822` | 289_hardening_autorizacao_rpcs_p0 | **Sem arquivo repo** |
| `20260805185445` | 291_estoque_baixas_integridade | **Sem arquivo repo** |
| `20260805185458` | 293_documentos_fiscais_dlq_enable_rls | **Sem arquivo repo** |
| `20260805190920` | 294_fornecedores_multi_tenant | **Sem arquivo repo** |
| `20260805193920` | 295_ordem_compra_conferencia | **Sem arquivo repo** |
| `20260805213357` | 296_nfe_conferencia | **Sem arquivo repo** |
| `20260806000032` | 297_configuracoes_gerais_whitelist | **Sem arquivo repo** |
| `20260806002522` | 298_br01_limite_credito_por_modo_loja | **Sem arquivo repo** |
| `20260806002925` | 299_tb07_pagamento_contas_pagar_limite_saldo | **Sem arquivo repo** |
| `20260806004637` | 300_br03_custo_unitario_snap_servidor | **Sem arquivo repo** |
| `20260806005804` | 301_revoke_anon_execute_finalizar_venda_v4_pos_br01 | **Sem arquivo repo** |
| `20260806011719` | 302_f1_05_formas_pagamento_parametrizavel | **Sem arquivo repo** |
| `20260806090414` | 303_ssot04_kardex_cancelamento_devolucao | **Sem arquivo repo** |
| `20260806090531` | 304_ssot04_drop_baixar_estoque_venda | **Sem arquivo repo** |
| `20260806134834` | 305_d1_drop_fiscal_reprocessar_documento_overload | **Sem arquivo repo** |
| `20260806135106` | 306_d2_maquina_estados_fiscal | **Sem arquivo repo** |
| `20260806135429` | 307_d3_reaper_fiscal_em_processamento | **Sem arquivo repo** |
| `20260806140528` | 308_hardening_tg_documentos_fiscais_estado | **Sem arquivo repo** |
| `20260806235913` | 309_reaplica_091_fiscal_correlation_id | **Sem arquivo repo** |
| `20260807000105` | 310_reaplica_288_venda_em_espera_e_caixa_unico | **Sem arquivo repo** |
| `20260807000138` | 311_reaplica_235_236_237_observabilidade_e_system_alerts | **Sem arquivo repo** |
| `20260807000157` | 312_rls_backup_schema_migrations | **Sem arquivo repo** |
| `20260807000525` | 313_pdv_config_caixa_web_limite_desconto_manual | **Sem arquivo repo** |
| `289` | 314_reafirma_grants_pos_venda_apos_248 | **Sem arquivo repo** (repo para em `288_*`) |

**Interpretação P0:** o repositório está **incompleto** em relação ao que prod já registrou como aplicado desde ~2026-08-01. SSOT exige **backport read-only** do SQL (`schema_migrations.statements` ou export CLI) antes de qualquer novo deploy.

---

## 5. Colisões de numeração / conteúdo (mesma versão, histórias diferentes)

| Versão | Produção (name) | Repositório | Risco se reaplicar |
|--------|-----------------|-------------|-------------------|
| `113` (numérico) | `descontos_venda_auditoria_operador` | `113_descontos_venda_auditoria_operador.sql` | **Alto** se colunas já existem (272 também altera) |
| `20260618011821` | `113_rls_audit_fixes` | *(sem arquivo)* | Hotfix prod-only — backport, não re-run numérico |
| `20260618011922` | `114_pdv_config_loja_backfill` | `114_fiscal_enqueue_loja_validation.sql` | **Colisão histórica** 114 |
| `245` (numérico) | `calcular_preco_produto_precedence_comment` | `245_calcular_preco_produto_precedence_comment.sql` | Médio — idempotente se só COMMENT |
| `20260620222629` | `245_remover_venda_fiado` | `246_remover_venda_fiado.sql` (+ timestamp par) | **Alto** — fiado já removido |
| `246` (numérico) | `remover_venda_fiado` | `246_remover_venda_fiado.sql` | **Alto** — duplicata lógica |
| `253` (numérico) | `clientes_tipo_endereco_e_view_gerente` | `253_*.sql` | Par timestamp `20260620200253_244_*` |
| `255` (numérico) | `grant_baseline_tabelas_authenticated` | `255_*.sql` | Par timestamp `20260710163032_255_vendas_em_espera_*` (**nomes diferentes — investigar**) |
| `268` | `reconcile_finalizar_venda_v4_single_overload` | idem + `20260713174909_268_drop_v4_overloads` | **Alto** — cadeia v4/overloads |
| `278` | `revoke_anon_authenticated_funcoes_sem_uso_publico` | idem + `20260717033836_278_fix_v_clientes_*` | Grants/revokes |

**Regra operacional:** em colisão, **versão timestamp rastreada em prod prevalece** sobre arquivo numérico “irmão” no repo (`MIGRATIONS_DRIFT_CLASSIFICATION.md` §Duplicadas).

---

## 6. Objetos / schema divergentes (prova em prod)

Consultas read-only (2026-08-08):

### 6.1 `descontos_venda` — **alinhado ao BL-1**

Colunas: `venda_id`, `gerente_id`, `desconto_percentual`, `desconto_valor`, **`operador_id`**, **`aplicado_em`**, **`motivo_desconto`**, **`motivo_descricao_livre`**.  
Migration **272** consta em `schema_migrations`.

### 6.2 `system_alerts` — **tabela sim, pipeline de triggers não**

- `system_alerts` **existe** (colunas: `id`, `tipo`, `produto_id`, `venda_id`, `loja_id`, `detalhe`, `criado_em`).
- **0** triggers `*system_alert*` em `public` (237 removeu triggers legados; margem usa triggers em `produtos`/`precos_atacado`/`regras_preco`).
- **0** linhas na tabela (estado vazio — normal se alertas leves desligados ou sem anomalias).
- Migrations **235–237** rastreadas; **311** (`reaplica_235_236_237…`) rastreada **sem arquivo repo**.

**App:** `pdv-importados/app/admin/auditoria/actions.ts` consulta `system_alerts` (degrada se ausente — hoje **funciona**).

### 6.3 `venda_finance_context` — **drift crítico tracking × objeto**

- Migration **252** (`venda_finance_context_mirror`) **registrada** em prod (`statements` presentes).
- Tabela **`venda_finance_context` ausente**; função **`sincronizar_finance_context_venda` ausente**.
- **App:** zero uso runtime (só tipos gerados) — impacto funcional baixo hoje; impacto de governança **alto** (historico mente sobre 252).

**Hipóteses (validar na fase implementação):** repair manual, falha parcial, drop posterior não versionado, ou migration idempotente que não criou por dependência. **Não** reaplicar 252 inteira sem forense.

### 6.4 BL-2 / promoção (repo 273–276 rastreadas)

`itens_venda` em prod: `promocao_regra_id`, `promocao_desconto_percentual`, `promocao_nome_snapshot`, `regra_aplicada_id`, `custo_unitario_snap` — **consistente** com pacote BL-2 aplicado.

### 6.5 Lacunas numéricas intencionais em prod

Sequência numérica salta `120`–`121`, `128`–`204`, `228`, `231`, `244`, `247`, `257`, `259`–`267`, `290`–`291` etc. — em geral **substituídas por timestamps** ou renumeradas (não indicam “buraco” a preencher com replay cego).

---

## 7. Backport seguro vs. migrations que **NÃO** podem ser reaplicadas

### 7.1 Seguro para backport **ao repositório** (git only, zero execução)

| Classe | Ação | Por quê |
|--------|------|---------|
| **Prod-only timestamps** (§4.2, 26 arquivos “puros”) | Extrair SQL de `schema_migrations.statements` → `backend/supabase/migrations/<version>_<name>.sql` | Restaura SSOT; `db push` futuro reconhece como já aplicadas |
| **Pares numérico ↔ timestamp** (228/231/244/248) | Documentar mapa; opcional arquivar numérico em `_archive/` | Evita dupla execução |
| **Snapshot periódico** | Salvar `array_agg(version)` + dump JSON em `backend/supabase/reports/` | Auditoria determinística |

### 7.2 **NÃO** reaplicar em produção (risco alto)

| Migration / cluster | Motivo |
|---------------------|--------|
| **001–127**, **205–288** já rastreadas | Objetos existem; replay = duplicate object / PK `schema_migrations` |
| **272** | Schema de descontos **já reflete** conteúdo |
| **245/246 fiado** (numérico + `20260620222629`) | Remoção fiado já efetivada |
| **block/stub/drop v2/v3/v4** (`20260619*`, `268_*`) | Cadeia irreversível de overloads |
| **304** `drop_baixar_estoque_venda` | DROP — só se provar ausência do objeto alvo |
| **252** `venda_finance_context` | Registrada mas objeto ausente — exige **plano forense** (§8.3), não replay cego |
| **311** reaplica 235–237 | Parcialmente refletida (`system_alerts` existe); re-run pode duplicar políticas/triggers |
| **Qualquer `migration repair --status applied` em massa** | Muta histórico sem prova de SQL executado |

### 7.3 Aplicável **somente** após decisão + staging (fase implementação, não agora)

| Objetivo | Abordagem |
|----------|-----------|
| Criar `venda_finance_context` faltante | Nova migration timestamp **idempotente** (`CREATE TABLE IF NOT EXISTS` + função), ou corrigir tracking se provado “falso applied” |
| Religar alertas leves pós-237 | Migration dedicada + flag `pdv_config` — ver `docs/BL2_CHECKLIST_APLICACAO_STAGING.md` |
| Novos ambientes | Baseline a partir de **schema pull de prod** + histórico arquivado, não replay 001–288 linear |

---

## 8. Plano seguro de execução (proposta — **não executado**)

### Fase 0 — Congelamento (1 ciclo)

- Proibir hotfix SQL direto em prod sem arquivo repo.
- Exportar evidência: `list_migrations` + `array_agg(version)` + este documento.

### Fase 1 — SSOT repo ⊇ prod aplicado (read-only → git)

1. Backport das **26** migrations prod-only (§4.2) via `statements`.
2. Validar checksum/nome bate com `version`/`name` em `schema_migrations`.
3. PR **somente arquivos** + `reports/reconcile-prod-repo-inventory.json` gerado pelo script.

### Fase 2 — Higiene de duplicatas (git, sem prod)

1. Marcar arquivos numéricos duplicados (`228`, `231`, `244`, `248`, `246` vs timestamp) como `_archive/` ou README de equivalência.
2. Atualizar `MIGRATIONS_DRIFT_CLASSIFICATION.md` com contagem 263/237.

### Fase 3 — Drift tracking × schema (prod, janela controlada)

1. **Forense 252:** comparar `statements` da 252 vs catálogo; decidir CREATE idempotente vs `repair` (só com evidência).
2. Rodar `backend/supabase/scripts/verify_p0_producao.sql` em staging espelho; estender checks para `venda_finance_context` e pacote `202608*`.

### Fase 4 — Determinismo contínuo

1. CI: falhar se existir versão em prod (API) não presente no repo.
2. Novas migrations **somente timestamp** (`supabase migration new`).
3. Staging obrigatório antes de prod para pacotes fiscal/estoque/fiado.

---

## 9. Impacto nos itens já identificados (checklist)

| Item | Status prod 2026-08-08 | Ação recomendada |
|------|------------------------|------------------|
| **descontos_venda** auditoria | ✅ Colunas + enum motivo | Nenhuma reaplicação 113/272; monitorar app auditoria |
| **system_alerts** | ✅ Tabela; triggers alerta leve off | Backport 311; decidir religar triggers vs. manter só consulta |
| **venda_finance_context** | ❌ Objeto ausente, 252 applied | Forense + migration idempotente ou descarte formal do espelho |
| **BL-2 promoção** | ✅ Colunas promoção/custo snap | Não reaplicar 273–276 |
| **Pacote BR/SSOT/Fiscal 297–308** | ✅ Applied, ❌ repo | Backport urgente (§4.2) |
| **Repo `288` vs prod `310–314`** | Prod ahead | Backport antes de próximo deploy app dependente |

---

## 10. Artefatos gerados nesta auditoria

| Artefato | Descrição |
|----------|-----------|
| Este documento | Relatório humano |
| `backend/supabase/scripts/reconcile-prod-repo-inventory.mjs` | Diff versão-a-versão (requer snapshot JSON opcional) |
| Evidência MCP | `list_migrations`, `execute_sql` (colunas, `to_regclass`, counts) |

---

## 11. Critério de “done” da reconciliação (fase implementação futura)

1. Todo `version` em prod tem arquivo repo correspondente **ou** entrada arquivada documentada.
2. Nenhum objeto crítico referenciado por migrations “applied” permanece ausente (`252` resolvido).
3. `verify_p0_producao.sql` verde em staging; diff schema staging↔prod vazio pós-deploy.
4. Novo ambiente sobe via baseline + migrations timestamp, **sem** replay linear 001–288.

---

*Fim do relatório read-only. Próximo passo: autorização explícita para Fase 1 (backport git-only das 26 migrations prod-only).*
