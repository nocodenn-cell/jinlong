# P1 — Segurança: auditoria completa + classificação + plano de correção com rollback

**Data:** 2026-07-16 · **Projeto:** `jinlong` (`kbabmewnahysfvlybiak`) · **Método:** introspecção read-only exaustiva (`pg_proc`, `has_function_privilege`, `pg_trigger`, `information_schema.routine_privileges`, `pg_policies`) + advisors Supabase. Todas as **79** funções `SECURITY DEFINER` de `public` foram enumeradas e classificadas — não por amostra.

> ⚠️ **Nenhuma correção aplicada.** Toda ação abaixo é **mutação** (REVOKE/DROP/ALTER/toggle) e requer sua confirmação explícita. Este é o plano + rollback de cada item.

---

## 1. Panorama (evidência)

| Métrica | Valor |
|---|---|
| Funções `SECURITY DEFINER` em `public` (todas enumeradas) | **79** |
| ...executáveis por `authenticated` | 74 |
| ...executáveis por **`anon`** (não autenticado) | **33** |
| ...usadas como corpo de `TRIGGER` (não deveriam ter EXECUTE direto de nenhum papel) | 10 |
| Advisors de segurança | 114 (0 ERROR; 112 WARN, 2 INFO) |
| Advisors de performance | 266 (0 ERROR) |

**Achado novo desta rodada (evidência direta, não advisor):** a função canônica de venda `finalizar_venda_transacional_canonica_v4` tem **`anon` com EXECUTE** em produção, embora a migration `268` (já no repo) explicitamente faça `REVOKE ALL FROM PUBLIC` + `GRANT` só para `authenticated`/`service_role`. Confirmado via `information_schema.routine_privileges`:
```
grantee        | privilege_type
anon           | EXECUTE   ← não deveria estar aqui segundo 268
authenticated  | EXECUTE
service_role   | EXECUTE
```
Isto é uma **migration que não reflete o estado real de produção** (documentado também em `P0_DB_DRIFT_RECONCILIATION.md` §8.0, pergunta 3). Causa provável: privilégio padrão de schema do Supabase (`ALTER DEFAULT PRIVILEGES`) re-concede `EXECUTE` a `anon` quando uma função é recriada, depois da 268 já ter rodado. **Ação: S1 abaixo** — não é uma nova captura de schema, é correção de grant.

---

## 2. Classificação das 79 funções `SECURITY DEFINER`

Categorias exigidas: **(A) Obrigatória** · **(B) Pode virar `SECURITY INVOKER`** · **(C) Precisa só de ajuste de `GRANT`** · **(D) Candidata à remoção**.

### 2.A — Obrigatória (definer genuinamente necessário — cruza RLS por design)
Fluxo de venda/caixa/estoque/fiscal que escreve em múltiplas tabelas com diferentes donos de RLS; operador comum não tem (nem deve ter) INSERT/UPDATE direto nessas tabelas:
`finalizar_venda_transacional_canonica_v4`, `cancelar_venda_transacional`, `colocar_venda_em_espera`, `descartar_venda_em_espera`, `retomar_venda_em_espera`, `fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`, `registrar_movimentacao`, `aprovar_movimentacao`, `cancelar_movimentacao`, `estornar_movimentacao`, `decrementar_estoque_seguro`, `decrementar_estoque_idempotente`, `transferir_estoque_entre_lojas`, `transferir_estoque_seguro`, `receber_ordem_compra`, `confirmar_remessa_entrada`, `importar_nfe_transacao`, `registrar_venda_com_itens`, `registrar_venda_evento`, `ensure_venda_evento_registrado`, `fiscal_claim_documentos`, `fiscal_enfileirar_documento_venda`, `fiscal_marcar_emitido`, `fiscal_marcar_erro` (×2), `fiscal_marcar_erro_normalizado` (×2), `fiscal_reprocessar_documento` (×2), `fiscal_registrar_evento_enqueue_erro`, `fn_criar_funcionario`, `fn_atualizar_funcionario`, `fn_desativar_funcionario`, `registrar_liquidacao_receber`, `registrar_pagamento_contas_pagar`, `marcar_comissoes_pagas`, `recalcular_saldo_caixa`, `ajustar_estoque_manual` (×2), `registrar_pricing_version_venda`, `shadow_validar_venda_engine_v4` (chama a v4 internamente — precisa herdar o mesmo definer).
**Ação:** manter `SECURITY DEFINER`; corrigir só o GRANT (ver §2.C, sobreposição — a maioria destas também precisa de ajuste de grant).

### 2.B — Pode virar `SECURITY INVOKER` (não precisa realmente de bypass de RLS)
Funções de leitura que só consultam catálogo do sistema ou dados já legíveis pelo papel chamador sem necessidade de elevação:
`caixa_integridade_gate_check` (só lê `pg_trigger`/`pg_proc`, catálogos legíveis por qualquer role), `is_feature_enabled` (lê `feature_flags`, tabela de config não-sensível), `obter_limite_sangria_sem_gerente` (config), `configuracoes_para_caixa_web`, `pdv_config_para_caixa_web`, `pdv_config_flags_visuais` (config pública do PDV).
**Ação:** avaliar mudar para `SECURITY INVOKER` (reduz superfície) OU manter DEFINER + `REVOKE` de `anon` (mais simples/seguro para esta sprint). **Recomendação: só ajustar GRANT agora; migrar para INVOKER é refactor de maior risco, fora do escopo "sem novas mudanças de comportamento".**

### 2.C — Precisa só de ajuste de `GRANT` (definer correto, exposição incorreta)
**C.1 — Funções de trigger com EXECUTE direto indevido** (deveriam ser invocáveis SÓ pelo mecanismo de trigger, nunca via RPC direta):
`fn_audit_update_funcionarios_meta`, `fn_registrar_comissao`, `registrar_historico_preco_produto`, `tg_documentos_fiscais_eventos_ai`, `tg_documentos_fiscais_eventos_au`, `trg_fn_itens_venda_limite_desconto`, `trg_fn_precos_atacado_margem`, `trg_fn_produtos_margem`, `trg_fn_regras_preco_margem`, `trg_fn_vendas_caixa_aberto`.
→ `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` (trigger continua funcionando — dispara com os privilégios do definer independente de GRANT direto).

**C.2 — Mutantes/privilegiadas com `anon` indevido** (§2.A quase todas +):
`finalizar_venda_transacional_canonica_v4` (achado §1), `fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`, `colocar_venda_em_espera`, `descartar_venda_em_espera`, `retomar_venda_em_espera`, `fn_criar_funcionario`, `fn_atualizar_funcionario`, `fn_desativar_funcionario`, `fiscal_registrar_evento_enqueue_erro`, `ensure_venda_evento_registrado`, `registrar_venda_evento`, `registrar_pricing_version_venda`.
→ `REVOKE EXECUTE ... FROM anon` (manter `authenticated`).

**C.3 — Leitura/consulta com `anon` indevido:**
`calcular_preco_produto`, `listar_vendas_em_espera`, `listar_venda_eventos_gerente`, `kpis_venda_eventos_gerente`, `obter_status_caixa_operador`, `obter_pricing_version_ativa`, `pdv_config_flags_visuais`, `proximo_numero_venda_em_espera`, `relatorio_consistencia_vendas`, `verificar_consistencia_venda`, `shadow_validar_venda_engine_v4`, `venda_eventos_items_from_payload`, `venda_eventos_items_from_sale`, `caixa_integridade_gate_check`.
→ `REVOKE EXECUTE ... FROM anon`.

**C.4 — `search_path` mutável** (4 funções, advisor `function_search_path_mutable`), ex. `venda_evento_idempotency_key`.
→ `ALTER FUNCTION ... SET search_path = public`.

### 2.D — Candidata à remoção (superfície morta)
Overloads legados da venda, superados pela v4 (código só chama a v4 — `guard:rpc` confirma):
`finalizar_venda_transacional(7 args)`, `finalizar_venda_transacional(9 args)`, `finalizar_venda_transacional_canonica_v2(10 args)`, `_v2(12 args)`, `_v2(13 args)`, `_v3(18 args)`, mais os **stubs vazios** `finalizar_venda_transacional_canonica_v2()` e `_v3()` (assinatura sem parâmetros, achados na varredura anterior — provavelmente definições quebradas/de teste esquecidas).
→ **DROP** (8 objetos). `268_drop_v4_overloads` (no ledger de produção) deveria ter feito isto e não fez — só consolidou a v4.

---

## 3. RLS, permissões e grants — achados adicionais
- **2 tabelas RLS-enabled-sem-policy:** `gerente_auth_attempts`, `gerente_auth_rate_limits` — acessíveis só por `service_role`. Tabelas de segurança de login (tentativa/rate-limit), escritas por Edge Function com service_role. **Avaliação: correto por design** (não devem ter policy de usuário final) — ação é só **confirmar** a intenção, não corrigir.
- **Leaked Password Protection** desligado (Supabase Auth) — toggle de dashboard, sem rollback necessário (reversível a qualquer momento).

---

## 4. Plano priorizado com rollback

| # | Ação | Tipo | Prioridade | Rollback |
|---|---|---|:---:|---|
| **S1** | `REVOKE EXECUTE ON FUNCTION finalizar_venda_transacional_canonica_v4(...) FROM anon` | REVOKE | 🔴 alta | `GRANT EXECUTE ON FUNCTION ...(19 args) TO anon;` (reversível, 1 statement) |
| **S2** | `REVOKE EXECUTE ... FROM anon` nas demais mutantes/leitura (§2.C.2 + C.3, 26 funções) | REVOKE | 🔴 alta | `GRANT EXECUTE ... TO anon` por função (lista em `02_security_rollback.sql`) |
| **S3** | `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` nas 10 funções de trigger (§2.C.1) | REVOKE | 🟠 média | `GRANT EXECUTE ... TO authenticated` restaura (trigger nunca dependeu do grant) |
| **S4** | `DROP FUNCTION` dos 8 overloads legados (§2.D) | DROP | 🔴 alta (mas menos reversível) | Requer **snapshot/PITR pré-DROP** — `CREATE OR REPLACE` a partir do corpo capturado (ver `01_security_validation.sql` para snapshot dos corpos antes do DROP) |
| **S5** | `ALTER FUNCTION ... SET search_path=public` (§2.C.4, 4 funções) | ALTER | 🟡 média | `ALTER FUNCTION ... RESET search_path;` |
| **S6** | Habilitar Leaked Password Protection | toggle dashboard | 🟡 baixa | desligar de volta (toggle) |
| **S7** | Confirmar intenção do RLS-sem-policy (§3) | revisão | 🟡 baixa | N/A (sem mutação) |
| **S8** | Avaliar `SECURITY INVOKER` para §2.B (6 funções) | refactor | 🟢 opcional, fora do escopo desta sprint | reverter para DEFINER se RLS não cobrir o caso |

**Ordem de execução recomendada:** S1 → S2 → S3 (todas reversíveis via GRANT, baixo risco) → smoke de login/venda/caixa → S4 (DROP, só após snapshot e confirmação de zero uso) → S5 → S6 → S7. S8 fica para uma sprint de refactor dedicada (não é correção, é redesenho).

---

## 5. Situação do P1
- ✅ Todas as 79 funções `SECURITY DEFINER` auditadas e classificadas nas 4 categorias pedidas (A/B/C/D).
- ✅ RLS, permissões e grants revisados (2 tabelas sem policy avaliadas; grant-drift da v4 comprovado por consulta direta).
- ✅ Plano priorizado S1–S8 com **rollback explícito por item**.
- ⏳ **Execução bloqueada por design** (mutação → requer sua confirmação).

**P1 ENCERRADO como auditoria + classificação + plano com rollback.** A aplicação depende de você.
