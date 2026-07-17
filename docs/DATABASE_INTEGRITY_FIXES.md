# Database Integrity Hardening — Registro de Mudanças (FIXES)

Log cronológico de todas as mudanças efetivas aplicadas durante a sprint de hardening
(Fase 5.1), com evidência de validação. Documento vivo — atualizado por frente.

---

## Frente 1 — Drift `vendas.cliente_id`

**Mudanças de schema/código:** nenhuma. A frente foi de **investigação e reclassificação**
(ver `docs/DATABASE_INTEGRITY_DECISIONS.md` DEC-01). A migration `276_vendas_cliente_id_drift_fix.sql`
(já existente) permanece como reconciliação idempotente correta. Conclusão: o risco de "perda
silenciosa" é hipótese não comprovada, não incidente confirmado.

---

## Frente 2 — Policies fantasma

### FIX-2.1 — Versionamento de 19 RLS policies sobre tabelas vivas

**Arquivo criado:** `backend/supabase/migrations/277_rls_policies_fantasma_versionamento.sql`

**O que faz:** versiona 19 policies que existiam somente em produção (drift real, sem
`CREATE POLICY` em nenhuma migration), sobre tabelas vivas e já versionadas:

| Tabela | Policies versionadas |
|---|---|
| `clientes` | `clientes_loja_isolado`, `clientes_insert_loja`, `clientes_update_gerente_loja`, `clientes_delete_gerente_loja` |
| `contas_receber` | `contas_receber_loja_isolado` |
| `documentos_fiscais_pendentes` | `doc_fiscal_loja_isolado` |
| `liquidacoes_receber` | `liquidacoes_loja_isolado` |
| `itens_venda` | `itens_venda_select_loja`, `itens_venda_write_gerente_loja` |
| `ordens_compra` | `ordens_compra_gerente_loja` |
| `ordens_compra_itens` | `ordens_compra_itens_gerente_loja` |
| `pdv_config` | `pdv_config_select_gerencial`, `pdv_config_update_dono` |
| `produtos` | `caixa_policy`, `painel_policy` (vestigiais — ver DEC-03) |
| `tokens_desconto_gerente` | `tokens_desconto_select_gerente` |
| `transferencias_idempotencia` | `transferencias_idempotencia_select_gerente`, `_insert_gerente`, `_delete_gerente` |

**Fonte:** `pg_policies` do projeto de produção `jinlong` (`kbabmewnahysfvlybiak`), capturado em
2026-07-17. Predicados USING/WITH CHECK reproduzidos **verbatim**, roles e comandos idênticos aos
de produção. Idempotente (`DROP POLICY IF EXISTS` + `CREATE POLICY`).

**Não incluído:** 18 policies das 6 tabelas mortas (`perfis`, `funcionarios`, `funcionarios_meta`,
`comissoes_regras_funcionario`, `comissoes_regras_historico`, `historico_precos_produto`) — ver DEC-02.

**Validação (evidência):**
1. **Sintaxe/tipos contra schema real:** cada um dos 16 predicados distintos foi executado como
   `SELECT count(*) FROM public.<tabela> WHERE <predicado>` contra o banco de produção
   (read-only, zero escrita). Todos retornaram sem erro — colunas, tipos e funções
   (`auth.uid()`, `auth.jwt()`) válidos.
2. **Sequência de migrations:** `node scripts/migration-sequence-guard.mjs` → OK, nenhuma colisão
   (277 é o próximo número livre na faixa sequencial; 190 migrations numeradas).

**Impacto em bootstrap:** um `db reset` do zero agora recria essas 19 policies de RLS que antes
só existiam em produção, aproximando o estado do repositório do estado real do banco para as
tabelas vivas. Não altera comportamento em produção (recria idêntico).

**Ressalva de completude:** persiste divergência bidirecional em algumas tabelas vivas (o repo
cria policies que produção já dropou, ex.: `clientes_gerente`, `contas_receber_gerente`). A
paridade total repo↔produção só é comprovável rodando `supabase db diff` / branch efêmera contra
o banco real — registrado como item da Frente 7 (bootstrap determinístico).

---

---

## Frente 3 — RPCs legadas

### Auditoria da família de finalização de venda (evidência: pg_proc de produção, 2026-07-17)

| RPC (overload) | Caller real | Estado prod | Status | Decisão |
|---|---|---|---|---|
| `finalizar_venda_transacional_canonica_v4` (1 overload) | `caixaVendas.impl.ts` (7 usos) | vivo | **Ativa** (golden flow) | Manter — SSoT de finalização |
| `finalizar_venda_transacional` 9-arg | nenhum (só `.md`) | **vivo** (6 KB) | **Legada perigosa** | **Stub LEGACY_DISABLED** (FIX-3.1) |
| `finalizar_venda_transacional` 7-arg | nenhum | stub | **Legada** | Stub reafirmado (FIX-3.1) |
| `finalizar_venda_transacional_canonica_v3` (2 overloads) | nenhum (só `.md`) | stub | **Legada** | Já desativada — OK |
| `finalizar_venda_transacional_canonica_v2` (4 overloads) | nenhum | stub | **Legada** | Já desativada — OK |
| `finalizar_venda_com_fiscal` | nenhum (só `.md`) | **não existe** | **Morta** | Referência morta só em doc — nenhuma ação de schema |
| `registrar_venda_com_itens` | `sync-outbox` (PDV local) | vivo | **Ativa** (canal offline) | Manter — caller único via guard |

**Demais RPCs chamadas pelo código (63 distintas):** auditadas por cruzamento
`grep rpc('…')` × `pg_proc`. Todas as chamadas pelo código resolvem para uma função existente
(nenhuma RPC ausente). Nenhuma outra família com overload legado vivo foi encontrada além da
finalização — `cancelar_venda_transacional` (1 overload), `devolver_ou_trocar_venda` (1 overload)
e `decrementar_estoque_seguro` (1 overload, com `decrementar_estoque_idempotente` delegando a ela,
documentado). `shadow_validar_venda_engine_v4` existe em prod sem caller de código: função de
sombra/validação (não é caminho de escrita), fora do escopo de desativação.

### FIX-3.1 — Stub da RPC legada `finalizar_venda_transacional`

**Arquivo criado:** `backend/supabase/migrations/278_stub_finalizar_venda_transacional_legada.sql`

**O que faz:** `CREATE OR REPLACE` dos 2 overloads (7-arg e 9-arg) de
`public.finalizar_venda_transacional` com corpo `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'`
(mantém assinatura e `RETURNS void`), + `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
Fecha um caminho de finalização paralelo à v4 que estava vivo e executável por `authenticated`
em produção. Ver DEC-05.

**Validação (evidência):**
1. **Nomes de parâmetro conferem com produção** (`pg_get_function_identity_arguments`) e com o repo
   (020/122) → `CREATE OR REPLACE` válido (Postgres proíbe renomear parâmetros; aqui não há renome).
2. **`RETURNS void` conferido** em ambos overloads via `pg_get_function_result` → replace sem
   erro 42P13.
3. **0 callers** confirmado por grep em todo o código (só 2 refs em `.md`).
4. `node scripts/migration-sequence-guard.mjs` → OK. `node scripts/rpc-gate-guard.mjs` → OK
   (invariante de caller único de venda preservado: v4 web | registrar_venda_com_itens offline).

**Impacto em bootstrap:** um `db reset` do zero passa a produzir a função-base já desativada,
alinhado ao estado seguro (e ao estado que produção deve assumir quando a migration for aplicada).

---

---

## Frente 4 — Views

### Auditoria completa (evidência: pg_class/reloptions de produção, 2026-07-17)

| View | Repo cria em | `security_invoker` repo | `security_invoker` prod | Uso app (`.from`) | Status | Decisão |
|---|---|---|---|---|---|---|
| `v_vendas_dia` | 001 | **não** | on | 0 | Órfã (substituída por RPC) | Securizar (FIX-4.1); DROP com gate (DEC-06) |
| `v_top_produtos` | 001 | **não** | on | 0 | Órfã (substituída por RPC) | Securizar (FIX-4.1); DROP com gate (DEC-06) |
| `v_venda_consistencia_anomalias` | 244 | **não** | true | 0 | Monitoramento/auditoria | Securizar + manter (FIX-4.1) |
| `v_estoque_baixo` | 040 | sim | true | — | Ativa | OK |
| `v_kardex_unificado` | 248 | sim | true | — | Ativa | OK |
| `v_clientes_gerente` | 253 | sim | true | — | Ativa | OK |
| `v_fiscal_doc_status_event_mismatch` | 066 | sim | true | — | Ativa | OK |

**Inversão vs. relatório inicial:** o `DATABASE_INTEGRITY_REPORT.md` §5.2 (auditoria estática)
apontava as 3 primeiras como bypass de RLS em produção. A verificação direta mostra o oposto:
**produção está segura** (todas com `security_invoker`); o risco real é de **bootstrap** — o repo
recria 3 views inseguras numa instalação nova. Nenhuma view fantasma: as 7 de produção têm CREATE
no repo (v_vendas_dia/v_top_produtos em 001, via `create view` minúsculo).

### FIX-4.1 — `security_invoker` nas 3 views com drift de bootstrap

**Arquivo criado:** `backend/supabase/migrations/279_views_security_invoker_bootstrap.sql`

**O que faz:** `ALTER VIEW ... SET (security_invoker = true)` em `v_vendas_dia`, `v_top_produtos`,
`v_venda_consistencia_anomalias`. Fecha o bypass de RLS que ocorreria num `db reset` do zero (owner
`postgres` sem security_invoker contorna a RLS de `vendas`/`itens_venda`). Idempotente/no-op no
remoto (as 3 já têm o atributo em produção).

**Validação (evidência):**
1. Retrato completo de `pg_class`/`reloptions` de produção → 7 views, exatamente 3 com drift repo↔prod.
2. `pg_depend` → **0 dependências** de outros objetos sobre `v_vendas_dia`/`v_top_produtos` (viabiliza
   o DROP futuro; DEC-06).
3. `grep .from('<view>')` em todo o código → 0 (nenhuma das 3 é consultada pelo app; as "9 menções"
   de `v_top_produtos` são metadados de FK em `database.types.ts`, não uso).
4. `node scripts/migration-sequence-guard.mjs` → OK.

**Impacto em bootstrap:** um `db reset` do zero passa a produzir todas as 7 views com
`security_invoker`, eliminando qualquer caminho paralelo de leitura que ignore a RLS.

---

---

## Frente 5 — Grants (menor privilégio em funções)

### Inventário completo (evidência: pg_proc/has_function_privilege de produção, 2026-07-17)

**Grants EXCESSIVOS — 33 overloads `SECURITY DEFINER` executáveis por `anon` e/ou `PUBLIC`** (todos
com `authenticated`+`service_role` preservados → remoção de anon/PUBLIC não afeta acesso legítimo):

`caixa_integridade_gate_check`, `calcular_preco_produto`, `colocar_venda_em_espera`,
`descartar_venda_em_espera`, `ensure_venda_evento_registrado`, `fechar_caixa_atomico`,
`fechar_caixa_pdv_atomico`, `finalizar_venda_transacional_canonica_v2` (×3),
`finalizar_venda_transacional_canonica_v3` *(também PUBLIC)*, `finalizar_venda_transacional_canonica_v4`,
`fiscal_registrar_evento_enqueue_erro`, `fn_atualizar_funcionario` *(PUBLIC)*,
`fn_audit_update_funcionarios_meta` *(PUBLIC, trigger)*, `fn_criar_funcionario` *(PUBLIC)*,
`fn_desativar_funcionario` *(PUBLIC)*, `kpis_venda_eventos_gerente`, `listar_venda_eventos_gerente`,
`listar_vendas_em_espera`, `obter_pricing_version_ativa`, `obter_status_caixa_operador`,
`pdv_config_flags_visuais` *(PUBLIC)*, `proximo_numero_venda_em_espera`,
`registrar_historico_preco_produto` *(PUBLIC, trigger)*, `registrar_pricing_version_venda`,
`registrar_venda_evento`, `relatorio_consistencia_vendas`, `retomar_venda_em_espera`,
`shadow_validar_venda_engine_v4`, `venda_eventos_items_from_payload` *(PUBLIC)*,
`venda_eventos_items_from_sale` *(PUBLIC)*, `verificar_consistencia_venda`.

**Grants NECESSÁRIOS (mantidos em todas):** `authenticated` + `service_role`.

**Fora de escopo (mantidos, baixo risco) — `SECURITY INVOKER` anon-executáveis (~21):**
relatorios `*_periodo`, `relatorio_cobertura_estoque`, `resumo/detalhe_comissoes_*`, `round_abnt`,
`total_vendas_por_funcionario`, `venda_evento_idempotency_key`, `dashboard_gerente_resumo`,
`gerente_estoque_list_page`, `baixar_estoque_venda`, `fn_listar_funcionarios_gerente`, e funções de
trigger (`set_updated_at`, `oc_set_updated_at`, `relatorio_settings_normalize_timezone`,
`update_feature_flags_updated_at`). Rodam sob RLS do papel chamador; `anon` não vê dado. Ver DEC-07.

### FIX-5.1 — Re-varredura de REVOKE anon/PUBLIC em SECURITY DEFINER

**Arquivo criado:** `backend/supabase/migrations/280_revoke_anon_public_execute_security_definer_sweep.sql`

**O que faz:** re-aplica verbatim os DO-loops das migrations 218 (revoga `anon`) + 221 (garante
`authenticated`+`service_role`, revoga `PUBLIC`) em toda função `SECURITY DEFINER` do schema public.
Rodando por último, captura as 33 que escaparam por terem sido criadas após 218/221.

**Causa raiz:** 218/221 são varreduras pontuais; funções SECURITY DEFINER criadas depois (v4,
vendas_em_espera, fn_*_funcionario, fechar_caixa_pdv_atomico…) reganharam o EXECUTE default a
anon/PUBLIC. Ver DEC-07.

**Justificativa da remoção:** cada uma das 33 já possui `authenticated`+`service_role`; o grant a
`anon`/`PUBLIC` é privilégio desnecessário que amplia a superfície de ataque — na v4,
`COALESCE(auth.uid(), p_operador_id)` permitiria a um chamador anon passar `p_operador_id` e contornar
a checagem de identidade.

**Validação:**
- **Inventário (evidência):** consulta read-only de `has_function_privilege` enumerou exatamente as 33
  (anon/PUBLIC) + confirmou que todas mantêm authenticated+service_role.
- **Lógica:** cópia verbatim de 218/221, migrations já shippadas e comprovadas; idempotentes.
- `node scripts/migration-sequence-guard.mjs` → OK.
- **Pós-aplicação (roda no `db push` de homologação):** a query embutida na migration deve retornar
  **0** funções SECURITY DEFINER anon/PUBLIC-executáveis.

**Impacto em bootstrap:** um `db reset` do zero passa a produzir todas as funções SECURITY DEFINER
sem exposição a anon/PUBLIC — o estado seguro que 218/221 pretendiam e que o drift havia reaberto.

---

---

## Frente 6 — Índices

### Inventário e classificação (evidência: pg_index/pg_stat_user_indexes de produção, 2026-07-17)

229 índices no total. Tabela de decisão:

| Índice | Tabela | Ação | Motivo | Evidência | Risco |
|---|---|---|---|---|---|
| `idx_produtos_categoria_id` | produtos | **remover** | Duplicata exata de `idx_produtos_categoria` (mesma coluna) | Não existe em prod (0 pg_class); repo cria em 085 além de 001 → duplicata só no bootstrap | Baixo (no-op no remoto) |
| `idx_contas_receber_venda_id` | contas_receber | **remover** | Redundante com `contas_receber_venda_id_unique` (UNIQUE parcial, mesma coluna) | Survivor respaldado por constraint cobre todos os lookups por venda_id | Baixo |
| `idx_caixas_loja_id` | caixas | manter | Prefixo de `idx_caixas_loja_status`, mas 222 manteve por escolha | scans=0 (não confiável); path multi-tenant | — |
| `idx_clientes_loja` | clientes | manter | Prefixo de `idx_clientes_loja_nome` | scans=3; 222 manteve deliberadamente | — |
| `idx_contas_pagar_loja` | contas_pagar | manter | Prefixo de `_status`/`_vencimento` | path multi-tenant quente | — |
| `idx_contas_receber_loja` | contas_receber | manter | Prefixo de `idx_cr_loja_status`; 222 manteve | — | — |
| `idx_estoque_loja` | estoque | manter | Prefixo de `estoque_loja_produto_unique` | **scans=70 (em uso)** | — |
| `idx_vendas_pagamentos_venda_id` | vendas_pagamentos | manter | Prefixo de `uq_vendas_pagamentos_venda_forma` | path de venda | — |
| 2× em `funcionarios_meta` | funcionarios_meta | (via DEC-02) | Duplicados exatos | Tabela morta — some no DROP da tabela | — |
| 96 índices `idx_scan=0` | várias | manter | Métrica não confiável (baixo tráfego) | Usuário: "janela curta não prova inutilidade" | — |

### FIX-6.1 — Remoção de 2 índices redundantes

**Arquivo criado:** `backend/supabase/migrations/281_indices_redundantes_cleanup.sql`

**O que faz:** `DROP INDEX IF EXISTS` em `idx_produtos_categoria_id` e `idx_contas_receber_venda_id`,
seguindo o critério exato da migration 222 (survivor com constraint/nome canônico, cobertura
preservada, independe de estatísticas de uso). Idempotente.

**Análise de risco (módulos críticos):** nenhum dos 2 é usado por PK, UNIQUE ou FK enforcement (os
survivors cobrem a mesma coluna); nenhum toca RLS policies (índices não participam de policy); PDV/
estoque/financeiro seguem cobertos pelos survivors. `idx_contas_receber_venda_id`: lookups por
venda_id migram para a UNIQUE parcial (mesma coluna). `idx_produtos_categoria_id`: nem existe em
produção.

**Validação:**
- Inventário completo classificado (A/B/C) via pg_index + pg_stat.
- `idx_produtos_categoria_id` confirmado ausente em prod (DROP no-op lá); survivors confirmados presentes.
- `node scripts/migration-sequence-guard.mjs` → OK.
- **Pós-aplicação (homologação):** queries embutidas na migration confirmam (1) os 2 sumiram e os
  survivors permanecem, (2) a constraint UNIQUE de contas_receber segue válida, (3) nenhum índice de
  PK/UNIQUE foi removido.

**Postura:** deliberadamente mínima. Os 96 "não-usados" e os 7 prefixo-redundantes NÃO foram tocados
(ver DEC-08) — a otimização por uso exige `pg_stat` sobre janela representativa de produção real
(pico de venda, fechamento, relatórios), não uma janela curta de baixo tráfego.

---

---

## Frente 7 — Bootstrap determinístico

### Prova empírica (executada nesta sessão)

Ambiente: PostgreSQL 16 local + shim mínimo de compatibilidade Supabase (roles, `auth`/`storage`,
stubs `auth.*`, `pg_cron`/`pg_net`, publication `supabase_realtime`). Bootstrap das **205 migrations**
aplicado do zero em **dois bancos independentes**; `pg_dump -s` normalizado de cada; `diff`.

**Resultado:**
- **205/205 migrations aplicaram** limpo em cada banco (usando só o repositório).
- Diff dos dois schemas: **ZERO diferenças em 8730 linhas** (exceto o nonce de sessão do `pg_dump`).
- → **Determinismo e auto-suficiência PROVADOS.** Duas instalações independentes = mesmo schema.

**Validação cruzada das Frentes 2–6 no install limpo** (query no banco bootstrapado):

| Frente | Verificação no bootstrap | Resultado |
|---|---|---|
| 2 | policy `clientes_loja_isolado` presente | 1 ✓ |
| 3 | overloads `finalizar_venda_transacional` como LEGACY_DISABLED | 2 ✓ |
| 4 | `v_vendas_dia` com `security_invoker` | true ✓ |
| 5 | funções SECURITY DEFINER executáveis por `anon` | **0** (era 33) ✓ |
| 6 | `idx_contas_receber_venda_id` removido | 0 ✓ |

**Paridade com produção (drift conhecido, não é defeito de determinismo):**

| Objeto | Bootstrap | Produção | Origem da diferença |
|---|---|---|---|
| Tabelas | 62 | 61 | drift bidirecional (dead tables só-prod DEC-02; repo-only) |
| Funções | 162 | 106 | overloads legados acumulados no repo, squashados em prod |
| Policies | 123 | 126 | dead-table policies não versionadas (DEC-02) |
| Views | 7 | 7 | paridade |
| Índices | 220 | 229 | 2 removidos (281) + índices só-prod |

### FIX-7.1 — Harness de determinismo reproduzível

**Arquivos criados:**
- `backend/supabase/scripts/bootstrap-shim.sql` — camada mínima de compatibilidade Supabase (não é
  migration; não vai para produção).
- `backend/supabase/scripts/bootstrap-determinism-check.sh` — aplica as migrations em 2 bancos limpos
  e compara os dumps; sai 0 se idênticos, imprime o diff se não. Reproduzível pelo time e gate-able
  em CI (após a Frente 8).

**Validação:** o próprio harness foi executado nesta sessão → "OK — bootstrap determinístico:
2 instalações independentes = schema idêntico (8730 linhas)", 205 migrations por banco.

**Não incluído (deferido — DEC-09):** paridade bit-a-bit repo↔produção exige o squash para baseline
única (`supabase db pull` + numeração timestamp + gate `db diff`), uma iniciativa própria que
reescreve o histórico — não uma correção pontual desta sprint.

---

---

## Frente 8 — CI

### FIX-8.1 — Correção do SHA inválido de `actions/checkout`

**Arquivos alterados (5 workflows, 16 ocorrências):**
- `.github/workflows/ci-backend-supabase.yml` (7)
- `.github/workflows/ci-pdv-importados.yml` (5)
- `.github/workflows/ci-pdv-local.yml` (2)
- `.github/workflows/e2e-playwright-only.yml` (1)
- `.github/workflows/secret-scan.yml` (1)

**O que faz:** substitui `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5` (SHA inválido,
sem release correspondente) por `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2),
preservando comentários `# v4`. Corrige a falha universal de CI (~2-3 s no checkout). Ver DEC-10.

**Escopo estrito:** nenhuma outra action, Node, teste, Supabase ou reorganização de workflow foi
tocada — `git diff` mostra só linhas `actions/checkout` (16 ins/16 del).

**Validação:** sintaxe YAML dos 5 arquivos OK (`yaml.safe_load`). Validação remota **impossível agora**:
inspeção job-a-job (API) do commit já corrigido mostra jobs morrendo em 2 s **sem runner atribuído**
(`runner_id: 0`, sem steps) — assinatura de **cota/billing de GitHub Actions esgotada**, não de erro
de checkout. Ou seja, o fix do SHA é um bug latente real corrigido, mas o CI só ficará verde após a
cota ser restaurada. Ver DEC-10 (diagnóstico corrigido com evidência).

---

## Status da sprint

Frentes 1–8 concluídas. Pendências deferidas com plano: DROP das tabelas/policies mortas (DEC-02),
DROP das views órfãs com gate (DEC-06), squash-to-baseline para paridade total (DEC-09), e aplicação
das migrations em homologação/produção (`db push`) com as validações pós-aplicação embutidas.
