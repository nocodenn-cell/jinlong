# P0 — Reconciliação de Drift de Banco (repo ↔ produção `jinlong`)

**Data:** 2026-07-16 · **Projeto:** `jinlong` (`kbabmewnahysfvlybiak`, sa-east-1, Postgres 17.6) · **Método:** consultas read-only diretas em produção (não confiei em nomes de migration — provei por existência de objeto).

> ⚠️ **Nenhuma migration foi aplicada.** Este pacote é o **plano** + scripts. Aplicação em produção só com sua confirmação explícita.

---

## 1. Como o drift foi medido (evidência, não suposição)
O ledger `supabase_migrations.schema_migrations` de produção tem **apenas 18 entradas** (baseline recente) — portanto **ausência no ledger ≠ não aplicada** para migrations antigas. A verdade veio de consultar os **objetos reais** (`to_regclass`, `pg_proc`, `information_schema.columns`, `pg_get_viewdef`, `pg_get_constraintdef`).

---

## 2. Drift FORWARD — migrations do repo NÃO aplicadas em produção (CONFIRMADO)

| Migration | Objeto probado | Presente em prod? | Veredito |
|---|---|:---:|---|
| **248_devolver_ou_trocar_venda** | `venda_pos_venda_operacoes` | ❌ | **PENDENTE** |
| | `venda_pos_venda_itens` | ❌ | |
| | `estoque_reposicoes_devolucao` | ❌ | |
| | fn `devolver_ou_trocar_venda` | ❌ | |
| | col `devolucoes.operacao_id` | ❌ | |
| **252_venda_finance_context_mirror** | tbl `venda_finance_context` | ❌ | **PENDENTE** |
| | fn `sincronizar_finance_context_venda` | ❌ | |
| **256_pdv_diagnostico_pre_producao** | fn `pdv_diagnostico_pre_producao` | ❌ | **PENDENTE** |

**Já aplicadas** (ledger incompleto, objeto presente — NÃO reaplicar): 250 (`calcular_preco_produto` ✅), 253 (`clientes.tipo` ✅, `v_clientes_gerente` ✅), 24702 (finalizar v4 contas_receber ✅), 255 (grant baseline ✅), 269 (`ajustar_estoque_manual` ✅), 24703 (=ledger "255_vendas_em_espera", renumerada ✅).

**Dependências das pendentes — todas satisfeitas:** `devolucoes` ✅, `vendas` ✅, `contas_receber` ✅.

**Idempotência verificada (leitura dos .sql):** 248 usa `CREATE TABLE IF NOT EXISTS`, `DROP POLICY/INDEX/VIEW IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`; 252 `IF NOT EXISTS`; 256 `CREATE OR REPLACE`. Seguras para reaplicação.

---

## 3. Drift REVERSO — produção tem objetos que o repo NÃO versiona (CONFIRMADO)

Migrations aplicadas direto em produção (provável origem: sessão paralela via `apply_migration`) cujo SQL **não existe em `backend/supabase/migrations/`**:

| Objeto em produção | No repo (migrations)? | No ledger de prod? |
|---|:---:|:---:|
| tbl `funcionarios` (+ `funcionarios_meta`?) | ❌ ausente | ✅ 259/267 |
| 2× `comissoes_regras*` (regras de funcionário/vendedor) | ❌ ausente | ✅ 260/261 |
| tbl `historico_precos_produto` | ❌ ausente | ✅ 259 |
| col `vendas.cliente_id` | ❌ ausente | ✅ 263/264 |
| `clientes_insert_operador_pdv` / `clientes_unique_documento_loja` | ❌ ausente | ✅ 265/266 |
| `drop_v4_overloads` | ❌ ausente | ✅ 268 |

**Impacto:** o repo **não é mais fonte-única da verdade do schema**. Um rebuild do banco a partir do repo perderia funcionários, regras de comissão, histórico de preços e `vendas.cliente_id`. → **Ação de reconciliação: capturar esses DDLs de volta ao repo** (não-destrutivo; ver §6). Requer decisão pois o SQL de origem não está versionado.

---

## 4. Achado de RPC — overloads de finalização de venda (P0/P1)

Produção tem **9 funções `finalizar_venda*`** coexistindo — o `268_drop_v4_overloads` (no ledger) **não consolidou**:

| Função / assinatura | SECURITY DEFINER |
|---|:---:|
| `finalizar_venda_transacional(7 args)` | não |
| `finalizar_venda_transacional(9 args)` | sim |
| `finalizar_venda_transacional_canonica_v2()` **(stub vazio)** | não |
| `finalizar_venda_transacional_canonica_v2(10 args)` | sim |
| `finalizar_venda_transacional_canonica_v2(12 args)` | sim |
| `finalizar_venda_transacional_canonica_v2(13 args)` | sim |
| `finalizar_venda_transacional_canonica_v3()` **(stub vazio)** | não |
| `finalizar_venda_transacional_canonica_v3(18 args)` | sim |
| **`finalizar_venda_transacional_canonica_v4(19 args, p_cliente_id)`** ← **canônica atual** | sim |

O **código só chama a v4** (`guard:rpc` OK). As v2/v3/legacy e os stubs `()` são **superfície morta SECURITY DEFINER** → risco de segurança (cruza com P1). **Proposta:** dropar os overloads legados (v2/v3/7-arg/stubs) mantendo só a v4 — **mutação, requer confirmação** (script em `02_rollback.sql` tem a lista; a limpeza vai no plano P1).

---

## 5. Plano de aplicação (FORWARD) — com sua confirmação

**Pré-passo (obrigatório):** snapshot/PITR do `jinlong` (Dashboard → Database → Backups) + rodar `01_validation.sql` (estado PRE). Capturar `pg_get_functiondef` de `cancelar_venda_transacional` e `calcular_preco_produto` (248/250 fazem `CREATE OR REPLACE` — necessário para rollback de corpo de função).

Ordem (por número, sem interdependência entre elas):
1. `248_devolver_ou_trocar_venda.sql` — **só após homologação + gate financeiro** (altera estoque+caixa+ledger; substitui `v_kardex_unificado`; estende check de `venda_eventos`).
2. `252_venda_finance_context_mirror.sql` — aditiva (tabela espelho + triggers).
3. `256_pdv_diagnostico_pre_producao.sql` — só função de diagnóstico (baixo risco).

**Pós-passo:** rodar `01_validation.sql` (estado POST — esperar todos `true`) + `03_smoke_post_migration.sql`. Para 248, rodar também o smoke existente `backend/supabase/scripts/homolog_sprint_b_devolucao_smoke.sql`.

**Comando por migration (com confirmação):** aplicar via `apply_migration` (MCP) ou `supabase db push` do arquivo correspondente. **Não** aplicar em lote cego.

---

## 6. Plano de reconciliação REVERSA (não-destrutivo — posso executar sem tocar produção)
Capturar o DDL dos objetos do §3 (via `pg_get_functiondef` / introspecção) e commitá-los como migrations no repo (marcadas "snapshot de reconciliação de produção — verificar"). Torna o repo fonte-única novamente **sem alterar produção**. Aguardando seu OK para gerar (é geração de código/SQL, quis confirmar o formato antes).

---

## 7. Riscos (ver também `RISK_REGISTER.md`)
- **R-248:** substitui `v_kardex_unificado` e estende check de `venda_eventos` — rollback precisa restaurar defs (capturadas em `02_rollback.sql`). Preferir fix-forward.
- **R-REV:** schema de produção não versionado (funcionarios/comissoes/historico/cliente_id) — rebuild-from-repo perderia dados/estrutura.
- **R-RPC:** 9 overloads `finalizar_venda*`, vários SECURITY DEFINER legados — superfície morta.
- **R-LEDGER:** numeração de migration não-autoritativa (timestamps mandam); dois `259`, dois `268`.

## 8.1 P0.1 — Captura de reconciliação de schema (EXECUTADO, não-destrutivo)

Objetos que existiam **só em produção** foram capturados como migrations idempotentes e behavior-preserving (reconstruídas por introspecção fiel de 2026-07-16 — `information_schema`, `pg_policies`, `pg_get_triggerdef`, `pg_get_functiondef`). **Nenhuma alteração em produção.**

| Migration de captura | Reproduz (ledger de prod) | Conteúdo |
|---|---|---|
| `270_capture_funcionarios.sql` | 259_funcionarios_separate + 267_funcionarios_meta_crud | tabelas `funcionarios`, `funcionarios_meta` (+índices, RLS, 10 policies, trigger) + fns `fn_criar/atualizar/desativar_funcionario`, `fn_audit_update_funcionarios_meta` |
| `271_capture_historico_precos_produto.sql` | 259_historico_precos_produto | tabela `historico_precos_produto` + índice + RLS + policy + fn+trigger `registrar_historico_preco_produto` em `produtos` |
| `272_capture_comissoes_regras.sql` | 260 + 261 comissões | tabelas `comissoes_regras_funcionario`, `comissoes_regras_historico` (+RLS, policies, FKs) |
| `273_capture_vendas_cliente_id_e_clientes.sql` | 263 + 265 + 266 | `vendas.cliente_id` + índice; `clientes_loja_documento_unique`; policy `clientes_insert_loja` |

**Validação:** `guard:migrations` OK (270–273 sem colisão; preenchem o gap 259–267 documentado). `guard:all` 7/7 OK. Estrutura idêntica à de produção **por construção** (cada objeto reconstruído a partir da introspecção). Idempotência: `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` → em produção é **no-op**; em rebuild limpo, recria o schema real.

**Ainda DIVERGENTE (não capturado neste passo):**
1. **RPC `finalizar_venda_transacional_canonica_v4` (ledger 264, `p_cliente_id`)** — evolução de assinatura de uma função existente e extensa; capturar o corpo atual completo exige diff cuidadoso vs. a v4 do repo. **Item aberto** (capturar corpo completo em passo focado).
2. **`268_drop_v4_overloads`** — não consolidou: 9 overloads `finalizar_venda*` vivos (v2/v3/stubs). É **limpeza de superfície morta SECURITY DEFINER** → tratado no **P1 (Segurança)**, não é captura.

**Ressalva de validação de rebuild:** equivalência estrutural está garantida por construção; a validação de rebuild **byte-a-byte** (aplicar todas as migrations num banco limpo e comparar com produção) exige um Postgres/branch descartável — **bloqueada pelo plano Supabase** (branching = Pro; Free no limite de 2 projetos). Documentado como dependência.

## 8. Situação do P0
- ✅ Auditadas todas as migrations pendentes (forward + reverso) — **por evidência de objeto**.
- ✅ Ordem de aplicação validada; dependências confirmadas; idempotência verificada; **sem conflito** para 248/252/256.
- ✅ Plano de aplicação, validação, rollback e smoke gerados (arquivos irmãos).
- ⏳ **Bloqueado (por design):** aplicação em produção aguarda sua confirmação; reconciliação reversa aguarda seu OK de formato.

**P0 pode ser ENCERRADO como auditoria/preparação** (tudo que não exige mão humana está feito). A **aplicação** permanece aberta por depender de você.
