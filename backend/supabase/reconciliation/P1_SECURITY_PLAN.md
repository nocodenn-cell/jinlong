# P1 — Segurança: auditoria + plano de correção priorizado

**Data:** 2026-07-16 · **Projeto:** `jinlong` (`kbabmewnahysfvlybiak`) · **Método:** introspecção read-only (`pg_proc`, `has_function_privilege`, `pg_policies`) + advisors Supabase.

> ⚠️ **Nenhuma correção aplicada.** Toda ação abaixo é **mutação** (REVOKE/DROP/ALTER/toggle) e requer sua confirmação explícita. Este é o plano.

---

## 1. Superfície SECURITY DEFINER (evidência)

| Métrica | Valor |
|---|---|
| Funções `SECURITY DEFINER` em `public` | **79** |
| ...executáveis por `authenticated` | 74 (advisor) |
| ...executáveis por **`anon`** (não autenticado) | **33** |
| ...com `EXECUTE` para `PUBLIC` diretamente | 9 |
| Advisors de segurança | 114 (0 ERROR; 112 WARN, 2 INFO) |
| Advisor perf | 266 (0 ERROR) |

**Diagnóstico central:** o problema **não** é usar `SECURITY DEFINER` — a maioria dessas funções legitimamente cruza RLS (finalizar venda escreve em várias tabelas, fechar caixa etc.). O problema é o **GRANT excessivo**: 33 dessas funções privilegiadas são **chamáveis por `anon`** (sessão sem login). Num PDV que exige autenticação, `anon` não deveria alcançar operações de venda/caixa/funcionário. As checagens internas (`auth.uid()` nulo → `PERMISSAO_NEGADA`) e RLS mitigam o dano real, mas é **superfície de ataque desnecessária**.

## 2. Funções `anon`-executáveis — classificação (as 33)

### 2.1 Mutantes/privilegiadas — **REVOKE de `anon` (alta prioridade)**
`finalizar_venda_transacional_canonica_v2` (×3 assinaturas), `..._v3`, `..._v4`, `fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`, `colocar_venda_em_espera`, `descartar_venda_em_espera`, `retomar_venda_em_espera`, `fn_criar_funcionario`, `fn_atualizar_funcionario`, `fn_desativar_funcionario`, `fiscal_registrar_evento_enqueue_erro`, `ensure_venda_evento_registrado`, `registrar_venda_evento`, `registrar_pricing_version_venda`.

### 2.2 Funções de trigger expostas — **REVOKE de todos os papéis diretos**
`fn_audit_update_funcionarios_meta`, `registrar_historico_preco_produto` — só devem rodar via trigger; `EXECUTE` direto (anon/authenticated) é inútil e indevido.

### 2.3 Leitura/consulta — **REVOKE de `anon` (média)**
`calcular_preco_produto`, `listar_vendas_em_espera`, `listar_venda_eventos_gerente`, `kpis_venda_eventos_gerente`, `obter_status_caixa_operador`, `obter_pricing_version_ativa`, `pdv_config_flags_visuais`, `proximo_numero_venda_em_espera`, `relatorio_consistencia_vendas`, `verificar_consistencia_venda`, `shadow_validar_venda_engine_v4`, `venda_eventos_items_from_payload`, `venda_eventos_items_from_sale`, `caixa_integridade_gate_check`.

> Manter `authenticated` onde o app chama (operador logado). Só `anon` é o alvo do REVOKE.

## 3. Overloads legados de venda — **DROP (alta prioridade; cruza com P0 §4)**
9 funções `finalizar_venda*` vivas; o código só usa a **v4**. Superfície morta `SECURITY DEFINER` a remover:
`finalizar_venda_transacional(7 args)`, `finalizar_venda_transacional(9 args)`, `finalizar_venda_transacional_canonica_v2()` (stub), `_v2(10)`, `_v2(12)`, `_v2(13)`, `_v3()` (stub), `_v3(18)`. **Manter só** `finalizar_venda_transacional_canonica_v4(19 args)`.
→ É o que `268_drop_v4_overloads` deveria ter feito. Antes do DROP: confirmar via `grep` que nenhuma edge function/app chama v2/v3 (o guard `rpc-gate` já indica só-v4).

## 4. `search_path` mutável — **ALTER (média)**
4 funções com `search_path` mutável (advisor `function_search_path_mutable`), ex.: `venda_evento_idempotency_key`. Correção: `ALTER FUNCTION ... SET search_path = public`. Baixo risco, boa prática.

## 5. RLS habilitado sem policy — **revisar (baixa)**
`gerente_auth_attempts`, `gerente_auth_rate_limits` — RLS on, 0 policy → acessíveis **só por service_role**. Como são tabelas de segurança de login (tentativas / rate limit) escritas por Edge/`SECURITY DEFINER`, **provavelmente intencional**. Ação: **confirmar** que nenhum acesso de usuário final é esperado; se sim, manter (documentar); se não, adicionar policy explícita.

## 6. Auth / Leaked Password Protection — **habilitar (dashboard)**
Advisor `auth_leaked_password_protection` desligado. Habilitar em Supabase → Auth → Password Protection (checagem HaveIBeenPwned). Toggle de dashboard.

## 7. Plano priorizado (execução com confirmação)

| # | Ação | Tipo | Prioridade | Pré-condição |
|---|---|---|:---:|---|
| S1 | `REVOKE EXECUTE ... FROM anon` nas mutantes/privilegiadas (§2.1) | REVOKE | 🔴 alta | smoke: app usa `authenticated`, não `anon` |
| S2 | DROP dos 8 overloads legados `finalizar_venda*` (§3) | DROP | 🔴 alta | confirmar não-uso de v2/v3 (grep + rpc-gate) |
| S3 | `REVOKE EXECUTE` das 2 funções de trigger (§2.2) de anon+authenticated | REVOKE | 🟠 média | — |
| S4 | `REVOKE EXECUTE ... FROM anon` nas de leitura (§2.3) | REVOKE | 🟠 média | confirmar que nenhuma tela pré-login as chama |
| S5 | `ALTER FUNCTION ... SET search_path=public` (§4) | ALTER | 🟡 média | — |
| S6 | Habilitar Leaked Password Protection (§6) | toggle | 🟡 baixa | — |
| S7 | Confirmar intenção de RLS-sem-policy (§5) | revisão | 🟡 baixa | — |

**Recomendação de forma segura:** aplicar S1/S3/S4 como um bloco `REVOKE ... FROM anon` (reversível via `GRANT`), validar com `01_validation.sql`-style + smoke de login/venda, e só então S2 (DROP, menos reversível — depende de snapshot). Toda a execução requer sua confirmação; nada foi aplicado.

## 8. Situação do P1
- ✅ Auditadas as 79 funções `SECURITY DEFINER`; identificadas as 33 `anon`-executáveis e a causa (GRANT excessivo, não o uso de DEFINER).
- ✅ Identificados grants excessivos, overloads mortos, RLS-sem-policy, search_path mutável, Auth.
- ✅ Plano priorizado S1–S7 gerado.
- ⏳ **Execução bloqueada por design** (mutação → requer sua confirmação).

**P1 pode ser ENCERRADO como auditoria + plano.** A aplicação depende de você.
