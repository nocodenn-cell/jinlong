# 20 — Plano de homologação: migrations do módulo de Importação/Aduaneiro (CALC-001.1)

> **NADA FOI EXECUTADO.** Este documento é resultado de auditoria somente leitura (SELECT em catálogos e
> `count(*)`), feita em 2026-10-22 na branch `fix/aduaneiro-calc-001-1`. Nenhuma migration, DDL, DML, seed,
> reset ou branch foi aplicado/criado em homologação ou produção. Toda aplicação abaixo depende de autorização.

- Homologação: `jinlong-homolog-palm` — `yvdilcmxyjafnnsfdtam` (PG 17, sa-east-1, org NatureCode **plano Free**).
- Produção (consultada só com SELECT para comparar histórico): `jinlong` — `kbabmewnahysfvlybiak`.
- Repo: `backend/supabase/migrations/` (435 arquivos `.sql`, todos com prefixo numérico, sem versão duplicada).

## 1. Resumo

1. A homologação está **exatamente** no estado do repo até `20261019170000` (417 versões comuns; nomes idênticos —
   checksum md5 de `versão:nome` confere com o repo). **Nenhum drift** (nada na homologação fora do repo).
2. Faltam na homologação **18 migrations** do repo (`20261020100000` … `20261022010000`). Só **5** são do módulo de
   importação; as outras 13 são de cobrança/SaaS, vendas/PDV, comissões, funcionários, leads comerciais.
3. O módulo de importação **não depende** das 13 outras: todas as dependências (tabelas `empresas`, `lojas`,
   `usuarios`, `usuario_vinculos`, `produtos`, `fornecedores`; constraint `lojas_id_empresa_uniq (id, empresa_id)`;
   helpers `fp_empresa_operacional`, `fp_usuario_ativo`, `fp_pode_loja`, `fp_empresa_da_loja`,
   `fp_empresas_do_usuario`) já existem na homologação e têm **definição idêntica à produção** (md5 de
   `pg_get_functiondef` iguais).
4. As 5 migrations de importação são **aditivas** (só objetos novos), sem `DROP`/`ALTER TYPE`/`ALTER COLUMN TYPE` em
   objetos existentes, sem DML em tabelas existentes. Nenhum dos objetos que elas `CREATE OR REPLACE` existe hoje na
   homologação (verificado: zero funções `import_*`, `fp_modulo_*`, `fp_import_*`, `trg_historico_imutavel`; zero tabelas
   `import_*`, `modulos_catalogo`, `empresa_modulos*`, `tributos_catalogo_uf`, `empresa_parametros_importacao`,
   `empresa_tributos_override`; bucket `import-documentos` e policies `import_documentos_*` ausentes) ⇒ **não há
   customização da homologação a ser sobrescrita**.
5. Único ponto que toca algo compartilhado: 2 policies novas em `storage.objects` (permissivas, só `SELECT`/`INSERT`,
   avaliam `false` imediatamente para outros buckets) e o bucket privado `import-documentos`.
6. **Risco de processo (principal):** `supabase db push` aplicaria as 18 pendentes em ordem (inclusive
   `20261021120000`, que substitui `finalizar_venda_transacional_canonica_v4` / `registrar_venda_com_itens_v2`, e a
   cobrança, que cria trigger de limite de lojas em `public.lojas`). E `apply_migration` do MCP grava a migration com
   **versão nova (timestamp do momento)** — foi assim que a produção ficou com 37 versões re-carimbadas (ver §2.3).
   O plano abaixo usa aplicação seletiva + registro com a versão do repo.
7. A homologação está praticamente vazia (1 empresa, 1 loja, 15 produtos, **0 usuários / 0 auth.users / 0 vínculos**,
   0 vendas, 0 objetos de storage): isolamento bom, mas **não há usuário para testar o módulo** sem seed (que exige
   autorização).
8. Backup: organização em plano **Free ⇒ sem PITR**. Rollback depende de `pg_dump` manual prévio + scripts de
   rollback já existentes em `backend/supabase/rollback/`.

## 2. Comparação de migrations

### 2.1 Totais

| Ambiente | Registros em `schema_migrations` | Última versão | Comuns com o repo (mesma versão) |
|---|---|---|---|
| Repo (branch) | 435 arquivos | `20261022010000` | — |
| Homologação | 417 | `20261019170000` | 417 (nomes idênticos) |
| Produção | 438 | `20261022110000` | 399 |

### 2.2 Repo × Homologação

| Situação | Versões |
|---|---|
| Aplicadas em ambos | 417 (todas até `20261019170000`) |
| Presentes na homologação e ausentes do repo (drift) | **nenhuma** |
| Mesma versão, nome diferente | **nenhuma** |
| Faltando na homologação | as 18 abaixo |

| # | Versão | Nome | Módulo | Necessária p/ importação? | Em produção? |
|---|---|---|---|---|---|
| 1 | 20261020100000 | cobranca_planos_trial | SaaS/cobrança | Não | Sim |
| 2 | 20261020110000 | cobranca_venda_offline_suspensao | SaaS/PDV offline | Não | Sim |
| 3 | 20261021115705 | nature_code_commercial_hub | leads comerciais | Não | Sim |
| 4 | 20261021120000 | vendas_pagamentos_parcelas_credito | vendas/PDV | Não | Sim |
| 5 | **20261021130000** | **import_intelligence_base_modulos** | importação (base de módulos) | **Sim** | Sim |
| 6 | **20261021130100** | **import_intelligence_persistencia** | importação (F4) | **Sim** | Sim |
| 7 | **20261021130200** | **import_hub_campos** | importação (F5) | **Sim** | Sim |
| 8 | **20261021130300** | **import_buscar_produtos** | importação (F5) | **Sim** | Sim |
| 9 | 20261021190000 | funcionarios_dados_complementares | RH | Não | Sim |
| 10 | 20261021200000 | comissao_p0_vendedor_base_liquida_falhas | comissões/vendas | Não | Sim |
| 11 | 20261021201000 | comissao_p1_regras_fechamento | comissões | Não | Sim |
| 12 | 20261021202000 | comissao_p2_metas_parcelas_divisao | comissões | Não | Sim |
| 13 | **20261021210000** | **import_nacional_uf** | importação (UF/ICMS, overrides) | **Sim** | Sim |
| 14 | 20261021230000 | pdv_operador_pin_p0 | PDV | Não | Sim |
| 15 | 20261021231000 | comissao_correcoes_revisao_607 | comissões | Não | Sim |
| 16 | 20261022000000 | commercial_leads_landing_fields | leads | Não | Sim |
| 17 | 20261022001000 | commercial_leads_jinlong_wechat_idioma | leads | Não | Sim |
| 18 | 20261022010000 | fix_semear_config_empresa_pdv_config | multiempresa/config | Não | Sim |

### 2.3 Repo × Produção (somente para referência — produção não é alvo)

- **37 versões do repo estão em produção com outro timestamp** (mesmo nome, versão re-carimbada na aplicação via
  MCP/painel), p.ex. `20261001100000_c3_colunas_caixa_desembolso_devolucao` ↔ produção `20261003203447`;
  `20260902130000_fiscal_payload_snapshot_venda` ↔ `20261005151443`; `20261009120000_implantacao_go_live_somente_dono_admin`
  ↔ `20261009033124`; `20260928120000_atualizar_preco_varejo_produto_rpc` ↔ `20260928201815`, entre outras
  (`20260902130000…20260903180000`, `20260913090000`, `20260916120000`, `20260916120200`, `20260929120000`,
  `20260929130000`, `20260930120000`, `20261001100000…20261001100500`, `20261002100000`, `20261005091218`,
  `20261005224553`, `20261005225856`, `20261006180000`, `20261006190000`, `20261009150000`).
- Só em produção, sem arquivo no repo desta branch: `20261009135940_protege_preco_custo_operador_fase_a`,
  `20261009140739_revoga_leitura_direta_preco_custo_fase_b` (fases manuais), **`20261022100000_produtos_custos_rpc`**
  (branch `origin/fix/produtos-custos-rpc`) e **`20261022110000_perfis_rls_sem_recursao`** (branch
  `origin/fix/perfis-rls-recursao`) — estas duas **não estão no `main`**.
- **`20261010120000_caixa_sem_loja_padrao` está no repo e na homologação, mas não aparece na produção** (nem com outro
  timestamp). Fora do escopo deste plano; registrar para o dono do módulo de caixa.
- Lição para a homologação: aplicar com `apply_migration` (MCP) **reproduz o drift de versão** acima. Ver §5.

## 3. Migrations necessárias para o módulo aduaneiro/importação (lista exata e ordenada)

Pré-requisitos faltantes: **nenhum** (multiempresa fases 1–5 já aplicado; dependências verificadas no catálogo).

1. `20261021130000_import_intelligence_base_modulos.sql`
2. `20261021130100_import_intelligence_persistencia.sql`
3. `20261021130200_import_hub_campos.sql`
4. `20261021130300_import_buscar_produtos.sql`
5. `20261021210000_import_nacional_uf.sql`

O código desta branch (CALC-001.1: `actions-valor-aduaneiro.ts`, `inteligencia.ts`, `valorAduaneiro.ts`) **não exige
objeto de banco novo**: usa `import_itens` e `import_salvar_item` já criados pelas migrations 2–3. O código do app
também chama `fp_minha_assinatura` (cobrança, migration #1), mas de forma tolerante (erro ⇒ `null`); a ausência da
cobrança não quebra `/admin`.

## 4. Análise por migration

### 4.1 `20261021130000_import_intelligence_base_modulos` (168 linhas, `BEGIN…COMMIT`)

- **Objetos:** tabelas `modulos_catalogo` (seed `IMPORT_INTELLIGENCE` com `ON CONFLICT DO NOTHING`), `empresa_modulos`,
  `empresa_modulos_historico` (+ índice, trigger de imutabilidade e trigger de histórico); funções
  `trg_historico_imutavel`, `trg_empresa_modulos_historico` (SECDEF), `fp_modulo_ativo`, `fp_pode_modulo`,
  `fp_pode_operar_loja`, `fp_lojas_cerca`, `fp_empresa_contexto_modulo`, `ops_definir_modulo_empresa` (somente
  `service_role`). RLS ligada nas 3 tabelas, sem policy e com `REVOKE ALL` de `anon/authenticated` (deny-all).
- **Dependências (todas presentes):** `empresas(id)`, `usuario_vinculos(usuario_id, empresa_id, papel, ativo)`, `lojas`,
  `fp_empresa_operacional`, `fp_usuario_ativo`, `fp_pode_loja`, `fp_empresa_da_loja`, `fp_empresas_do_usuario`, `auth.uid()`.
- **Idempotência:** alta (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, `ON CONFLICT`).
- **Riscos:** sem perda de dados. `trg_historico_imutavel` é nome genérico, mas não existe na homologação nem é
  definido por outra migration do repo (só fase1 menciona a família `fp_*`) ⇒ sem sobrescrita. Não toca PDV/caixa/
  estoque/financeiro. Módulo nasce **desabilitado** (ausência de linha).

### 4.2 `20261021130100_import_intelligence_persistencia` (877 linhas, `BEGIN…COMMIT`)

- **Objetos:** 13 tabelas `import_*` (operações, câmbios, itens, despesas, descontos, tributos, documentos, apurações,
  apuracao_itens, apuracao_rateios, divergências, aprovações, auditoria) + 12 índices; triggers de imutabilidade em 7
  tabelas; RLS ligada em todas, `GRANT SELECT` a `authenticated` só via policy `import_leitura`
  (`fp_import_pode_operacao`), `GRANT ALL` a `service_role`; funções `fp_import_pode_operacao`,
  `_fp_import_usuario_pode`, `_import_operacao_para_escrita`, `_import_auditar`, `import_criar_operacao`,
  `import_salvar_item`, `import_salvar_lancamento`, `import_remover_rascunho`, `import_registrar_documento`,
  `_import_montar_entrada`, `import_montar_entrada`, `import_registrar_apuracao`, `import_aprovar_apuracao`
  (só `service_role`), `import_mudar_estado`, `fp_import_pode_objeto`. **Storage:** bucket privado
  `import-documentos` (`ON CONFLICT DO NOTHING`) e policies `import_documentos_leitura` (SELECT) e
  `import_documentos_envio` (INSERT) em `storage.objects`; sem UPDATE/DELETE.
- **Dependências (presentes):** `empresas`, `lojas` com `UNIQUE (id, empresa_id)` (`lojas_id_empresa_uniq` — exigida
  pela FK composta `import_operacoes_loja_empresa_fk`), `produtos(id, loja_id)`, `usuarios(ativo)`,
  `usuario_vinculos(loja_id, papel)`, funções da 4.1, `gen_random_uuid()` (nativo PG17), schema `storage`.
- **Idempotência:** parcial. Tabelas/índices/funções sim; policies `import_leitura` são precedidas de
  `DROP POLICY IF EXISTS`; policies de storage também. Reexecução segura.
- **Riscos:** sem perda de dados. FKs para `empresas`, `lojas`, `produtos` ⇒ após uso, impedem `DELETE` dessas linhas
  referenciadas (efeito desejado, mas relevante para limpezas de homologação). Policies em `storage.objects` são
  permissivas e somam-se às 4 existentes; para objetos de outros buckets a função retorna `false` sem cast inseguro.
  Não escreve em estoque, kardex, contas a pagar nem preços (coberto pelo teste F4-11).

### 4.3 `20261021130200_import_hub_campos` (257 linhas)

- **Objetos:** `ALTER TABLE … ADD COLUMN IF NOT EXISTS` em tabelas `import_*` recém-criadas (fornecedor_id → FK
  `fornecedores`, moeda, datas, `codigo_fornecedor`, `ncm`, `status_conferencia NOT NULL DEFAULT 'PENDENTE'`);
  funções `_import_fornecedor_da_empresa`, `import_atualizar_operacao`, `import_conferir_lancamento`,
  `trg_import_lancamento_reconferir` (+2 triggers), `import_listar_operacoes` (`DROP FUNCTION IF EXISTS` + `CREATE`);
  **substitui** `import_salvar_item` e `import_aprovar_apuracao` criadas na 4.2 (exige lançamentos conferidos).
- **Dependências:** 4.2; `fornecedores(id, loja_id, nome)` (presente, 0 linhas).
- **Idempotência:** alta.
- **Riscos:** `NOT NULL DEFAULT` em tabela vazia (recém-criada) — sem risco. O `DROP FUNCTION` é só de função do próprio
  módulo. Nenhum impacto fora do módulo.

### 4.4 `20261021130300_import_buscar_produtos` (47 linhas)

- **Objetos:** `import_buscar_produtos(text, uuid[])` (SECDEF; devolve só `id, nome` de produtos da empresa do contexto).
- **Dependências:** `fp_empresa_contexto_modulo`, `fp_lojas_cerca` (4.1); `produtos(nome, codigo_barras, ativo, loja_id)`.
- **Idempotência:** alta. **Riscos:** nenhum; leitura restrita, não expõe preço/custo.

### 4.5 `20261021210000_import_nacional_uf` (173 linhas)

- **Objetos:** tabelas `tributos_catalogo_uf` (seed de 27 UFs com `ON CONFLICT DO NOTHING`; leitura `USING (true)`
  para `authenticated`), `empresa_parametros_importacao`, `empresa_tributos_override` (leitura via `fp_pode_modulo`);
  funções `_import_empresa_contexto`, `import_salvar_parametros_empresa`, `import_salvar_override_tributo`,
  `import_remover_override_tributo`.
- **Dependências:** `empresas`, `fp_pode_modulo`/`fp_empresa_contexto_modulo` (4.1).
- **Idempotência:** alta (`DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`).
- **Riscos:** nenhum sobre dados existentes. Observação de produto: alíquotas com status `PESQUISADO` (não verificadas).

### 4.6 As 13 migrations não necessárias (NÃO aplicar neste plano)

| Versão | Toca módulos existentes? | Observação de risco |
|---|---|---|
| 20261020100000 cobrança | **Sim**: trigger `tg_saas_limite_lojas` BEFORE INSERT/UPDATE em `public.lojas`; funções que alteram `empresas.plano`, `configuracoes_gerais` | cria schema `saas` (inexistente na homologação) |
| 20261020110000 cobrança offline | **Sim**: trigger em `public.pdv_dispositivos` | depende da #1 |
| 20261021120000 parcelas | **Sim (PDV/vendas)**: substitui `finalizar_venda_transacional_canonica_v4` e `registrar_venda_com_itens_v2`; troca constraint e trigger em `vendas_pagamentos` | alto impacto em PDV |
| 20261021190000 funcionários | baixo (tabela nova) | — |
| 20261021200000/201000/202000/231000 comissões | **Sim**: `ALTER TABLE vendas ADD COLUMN vendedor_id`, policies de comissões trocadas, funções com `DELETE` por venda | ordem obrigatória entre si |
| 20261021230000 PIN PDV | **Sim**: colunas novas em `pdv_config` | — |
| 20261022000000/001000 leads | baixo | dependem de 20261021115705 |
| 20261022010000 semear config | substitui `internal.fp_semear_config_empresa` | — |

Essas devem ir para a homologação numa janela própria (com seus testes), não junto do módulo de importação.

## 5. Plano incremental de aplicação (não executado)

### 5.1 Decisão de método (requer autorização)

| Método | Prós | Contras |
|---|---|---|
| **A. Recomendado:** `psql -v ON_ERROR_STOP=1 -1 -f <arquivo>` por migration + `supabase migration repair --status applied <versão> --linked` | aplica só as 5; registra com a **versão do repo** | precisa da connection string da homologação (segredo — o operador humano executa) |
| B. `apply_migration` (MCP), com `name` = nome do arquivo | prático | grava versão = timestamp atual ⇒ **drift de versão** igual ao da produção; exigiria `migration repair` depois para alinhar |
| C. `supabase db push` | padrão | aplica **as 18** pendentes (inclui PDV/cobrança/comissões) — **não usar** neste plano |

Obs.: com o método A, um `supabase db push` futuro avisará que há migrations locais anteriores à última remota
(as 13 puladas) e exigirá `--include-all` — esperado e documentado.

### 5.2 Pré-checks (SQL somente leitura, executar antes)

```sql
-- P1. Estado do histórico (esperado: max = 20261019170000 e nenhuma das 5 versões)
select max(version) from supabase_migrations.schema_migrations;
select version from supabase_migrations.schema_migrations
 where version in ('20261021130000','20261021130100','20261021130200','20261021130300','20261021210000');
-- P2. Nenhum objeto do módulo já existe (esperado: 0 em todas)
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'import\_%' or p.proname like '\_import\_%'
   or p.proname in ('fp_modulo_ativo','fp_pode_modulo','fp_pode_operar_loja','fp_lojas_cerca',
                    'fp_empresa_contexto_modulo','ops_definir_modulo_empresa','trg_historico_imutavel',
                    'fp_import_pode_operacao','fp_import_pode_objeto'));
select count(*) from information_schema.tables where table_schema='public'
 and (table_name like 'import\_%' or table_name in ('modulos_catalogo','empresa_modulos','empresa_modulos_historico',
      'tributos_catalogo_uf','empresa_parametros_importacao','empresa_tributos_override'));
select count(*) from storage.buckets where id='import-documentos';
-- P3. Dependências presentes (esperado: 5 funções e a constraint)
select proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('fp_empresa_operacional','fp_usuario_ativo','fp_pode_loja','fp_empresa_da_loja','fp_empresas_do_usuario');
select conname from pg_constraint where conrelid='public.lojas'::regclass and conname='lojas_id_empresa_uniq';
-- P4. Hash das dependências inalterado desde a auditoria (comparar com §8)
select proname, md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace
 and proname in ('fp_empresa_operacional','fp_usuario_ativo','fp_pode_loja','fp_empresa_da_loja','fp_empresas_do_usuario');
```

P5 (fora do SQL): `pg_dump --schema-only` (e `--data-only` de `public`, `storage.buckets`) da homologação guardado
localmente — substitui a falta de PITR no plano Free.

### 5.3 Ordem e pontos de verificação

| Passo | Ação (após autorização) | Verificação imediata (SELECT) |
|---|---|---|
| 1 | aplicar `20261021130000` e registrar a versão | 3 tabelas existem; `select codigo from modulos_catalogo` = `IMPORT_INTELLIGENCE`; `select count(*) from empresa_modulos` = 0; `has_function_privilege('authenticated','public.ops_definir_modulo_empresa(uuid,text,boolean,text,text,text)','execute')` = false |
| 2 | aplicar `20261021130100` e registrar | 13 tabelas `import_*` com `relrowsecurity = true`; 13 policies `import_leitura`; bucket `import-documentos` com `public=false`; 2 policies `import_documentos_*` em `storage.objects`; `has_function_privilege('authenticated','public.import_aprovar_apuracao(uuid,uuid,text,jsonb)','execute')` = false |
| 3 | aplicar `20261021130200` e registrar | colunas `fornecedor_id`, `ncm`, `status_conferencia` existem; `import_listar_operacoes` existe; triggers `import_*_reconferir` existem |
| 4 | aplicar `20261021130300` e registrar | `import_buscar_produtos(text,uuid[])` existe, sem EXECUTE para `anon` |
| 5 | aplicar `20261021210000` e registrar | `select count(*) from tributos_catalogo_uf` = 27; 3 tabelas com RLS |
| 6 | regressão de outros módulos | `get_advisors` (security/performance) sem itens novos fora do módulo; contagens de `empresas/lojas/produtos/vendas` iguais às de §6 |

Em qualquer falha: parar (cada arquivo é `BEGIN…COMMIT`, logo uma falha não deixa estado parcial daquele arquivo) e
avaliar rollback do que já foi aplicado (§7).

## 6. Dados existentes na homologação (isolamento)

| Tabela | Linhas |
|---|---|
| empresas | 1 (operacional) |
| lojas | 1 |
| usuarios / auth.users | 0 / 0 |
| usuario_vinculos (DONO/GERENTE ativos) | 0 |
| produtos | 15 |
| fornecedores | 0 |
| vendas | 0 |
| storage.buckets / storage.objects | 2 / 0 |
| policies em storage.objects | 4 |
| tabelas do módulo (import_*, empresa_modulos, …) | inexistentes |

Conclusão: não há dados de outros testes nas tabelas que o módulo cria nem nas que ele referencia de forma relevante.
Para testar pela UI será preciso criar usuário(s), vínculo DONO/GERENTE e habilitar o módulo
(`ops_definir_modulo_empresa`, via `service_role`) — **escritas que exigem autorização explícita**. O
`backend/scripts/import-intelligence-e2e-seed.sql` declara ser **somente para Postgres LOCAL** (mexe em `auth.uid()` e
cria empresas fictícias A/B/C); não usar na homologação sem adaptação aprovada.

## 7. Validação pós-aplicação

### 7.1 Testes SQL (transação + ROLLBACK)

Arquivos: `backend/scripts/import-intelligence-base-modulos.test.sql`, `import-intelligence-persistencia.test.sql`,
`import-intelligence-hub.test.sql`. Todos começam com `BEGIN;` e terminam com `ROLLBACK;`, inserem dados fictícios e
simulam identidade com `set_config('request.jwt.claim.sub', …, true)` (local à transação). Usam meta-comandos do
**psql** (`\gset`, `:'var'`) ⇒ **não rodam via `execute_sql` do MCP**.

Como rodar (operador humano, após autorização — são escritas, ainda que revertidas):

```bash
psql "$HOMOLOG_DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/import-intelligence-base-modulos.test.sql
psql "$HOMOLOG_DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/import-intelligence-persistencia.test.sql
psql "$HOMOLOG_DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/import-intelligence-hub.test.sql
```

Cuidados: (a) **não** usar `-1`/`--single-transaction` (o script já controla a transação); (b) conferir que a última
linha executada é `ROLLBACK` e, depois, que `select count(*) from import_operacoes` e `from empresa_modulos` seguem 0;
(c) o cabeçalho do `hub.test.sql` diz "Banco LOCAL" e cita a versão antiga `20261010170000` — revisar antes de rodar
remoto; (d) os testes travam linhas durante a transação — rodar fora de horário de uso da homologação.

### 7.2 Testes TypeScript

- `pdv-importados/lib/import/importIntelligence.integracao.test.ts`: só roda com `SUPABASE_URL` **local**
  (guarda explícita `127.0.0.1|localhost`); **não aponta para a homologação** por desenho. Rodar contra `supabase start`
  local com as 5 migrations.
- `shared-core/src/import/pg.local.spec.ts`: exige `IMPORT_PG_LOCAL_CONTAINER` (Docker local).
- Unitários do branch (sem banco): `valorAduaneiro.spec.ts`, `inteligencia.test.ts`, `inteligenciaVa.test.ts`,
  `actions-valor-aduaneiro.test.ts` — via `vitest run` nos pacotes.

### 7.3 Smoke manual na homologação (após seed autorizado)

Criar operação → salvar item com valor aduaneiro → câmbio/despesa/tributo → conferir → simular/apurar → aprovar (DONO,
via servidor) → reabrir; confirmar que estoque, kardex, contas a pagar e preços não mudaram.

## 8. Estratégia de rollback

- **Scripts existentes** (não aplicados; revisar antes): `backend/supabase/rollback/20261021210000_import_nacional_uf.rollback.sql`,
  `…130300…`, `…130200…`, `…130100…` (aborta se houver operação; remove bucket só se vazio), `…130000…`.
  Ordem inversa: 210000 → 130300 → 130200 → 130100 → 130000. Depois:
  `supabase migration repair --status reverted <versão>` para cada uma.
- Atenção: o cabeçalho do rollback 130100 ainda cita o nome antigo `20261010160000_f4_…` (só comentário). Em Supabase
  recente, `DELETE FROM storage.buckets` direto pode ser bloqueado — remover o bucket pela API/painel se necessário.
- **Backup:** plano Free ⇒ **sem PITR** e sem restauração self-service garantida. Fazer `pg_dump` antes do passo 1
  (§5.2 P5). Nenhum recurso pago foi ou deve ser ativado.
- Como as migrations são aditivas e a homologação não tem dados do módulo, o rollback é de baixo risco enquanto nenhuma
  operação real for criada.
- Hashes de referência das dependências (iguais em homologação e produção, 2026-10-22):
  `fp_empresa_da_loja 152326817c5108aac59c66f980379b2e`, `fp_empresa_operacional 65110b0964de8823981e1dcb19fa876c`,
  `fp_empresas_do_usuario af32fa762b1cec0dcdb38b0239703564`, `fp_pode_loja 190bf548ad7317df4724773b9d8e6d1f`,
  `fp_usuario_ativo 569939431070867c993c61d32b08c6a4`.

## 9. Critérios de go/no-go

**GO** se todos:
- pré-checks P1–P4 com resultado esperado e P4 com hashes iguais aos de §8;
- `pg_dump` da homologação guardado;
- método A (ou B + repair) autorizado; confirmado que **apenas as 5** serão aplicadas;
- cada passo de §5.3 verificado antes do próximo;
- testes SQL de §7.1 passando e terminando em ROLLBACK, com contagens de §6 inalteradas;
- `get_advisors` sem alerta novo fora do módulo.

**NO-GO** se qualquer: versão inesperada em `schema_migrations`; objeto do módulo já existente; hash de dependência
diferente; intenção de usar `supabase db push` sem filtro; falha em qualquer passo; alerta de segurança novo em tabela
fora do módulo.

## 10. Itens que dependem de autorização

1. Aplicar as 5 migrations na homologação (e escolher o método — A recomendado).
2. Registrar/ajustar `schema_migrations` com `supabase migration repair`.
3. Fazer `pg_dump` (acesso à connection string da homologação).
4. Rodar os testes SQL na homologação (escrevem e revertem).
5. Criar usuário(s) de teste, vínculos e habilitar `IMPORT_INTELLIGENCE` (`ops_definir_modulo_empresa`) para smoke na UI.
6. Decidir quando levar as outras 13 migrations à homologação (janela separada).
7. Tratar os achados de produção (fora do escopo): `20261010120000_caixa_sem_loja_padrao` ausente em produção; 2
   migrations em produção que não estão no `main` (`produtos_custos_rpc`, `perfis_rls_sem_recursao`); 37 versões
   re-carimbadas.
