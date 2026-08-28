# Matriz de Autorização (RLS)

Regra de leitura:

- **apenas próprias**: restrito ao próprio `auth.uid()` ou vínculo direto do operador.
- **todas da loja**: escopo de `usuarios.loja_id`.
- **todas**: escopo global (inclui multi-loja).

| Recurso | Operação | OPERADOR | GERENTE | DONO | ADMIN | Observações |
|---|---|---|---|---|---|---|
| `vendas` | SELECT | apenas próprias | todas da loja | todas da loja + macro | todas da loja | Policy `vendas_select_loja` + exceção macro de DONO |
| `vendas` | INSERT | próprias da loja | todas da loja | todas da loja | todas da loja | via `vendas_insert_loja` |
| `vendas` | UPDATE | não | todas da loja | todas da loja | todas da loja | `vendas_update_loja` |
| `vendas` | DELETE | não | todas da loja | todas da loja | todas da loja | `vendas_delete_loja` |
| `itens_venda` | SELECT | não (direto) | todas da loja (via join de venda) | todas da loja | todas da loja | Uso principal via RPC/consulta gerencial |
| `itens_venda` | INSERT | apenas em vendas próprias | sim | sim | sim | `itens_insert` |
| `produtos` | SELECT | todas (autenticado) | todas (autenticado) | todas (autenticado) | todas (autenticado) | avaliar hardening multi-loja futuro |
| `produtos` | UPDATE | não | sim | sim | sim | `produtos_escrita` |
| `estoque` | SELECT | mesma loja | mesma loja | mesma loja + macro (dono) | mesma loja | `estoque_select_mesma_loja` + dono macro |
| `estoque` | UPDATE | não | mesma loja | mesma loja | mesma loja | `estoque_update_gerente_loja` |
| `caixas` | SELECT | próprias | todas da loja | todas da loja + macro | todas da loja | `caixas_select_authenticated` |
| `caixas` | INSERT | próprias | sim | sim | sim | `caixas_insert_authenticated` |
| `usuarios` | SELECT | próprio | própria loja (gerencial) | todas | própria loja | depende de policies consolidadas |
| `usuarios` | UPDATE idioma | próprio | próprio | próprio | próprio | `usuarios_update_idioma_gerente_dono` |
| `documentos_fiscais_pendentes` | SELECT | não | todas da loja | todas da loja | todas da loja | `doc_fiscal_gerente` |
| `documentos_fiscais_eventos` | SELECT | não | todas da loja | todas da loja | todas da loja | `doc_fiscal_eventos_gerente_select` |
| `contas_receber` | SELECT | não | todas da loja | todas da loja | todas da loja | `contas_receber_gerente` |
| `v_estoque_baixo` | SELECT | mesma loja | mesma loja | mesma loja + macro | mesma loja | depende de `security_invoker` + RLS base |
| `RPC: ajustar_estoque_manual` | EXECUTE | não | sim | sim | não | checagem explícita `GERENTE`/`DONO` na função |
| `RPC: aprovar_movimentacao` | EXECUTE | não | sim | sim | sim | sangria acima do limite, fluxo pendente |
| `RPC: calcular_valor_sistema_dinheiro_caixa` | EXECUTE | sim (uso esperado: caixa do operador) | sim | sim | sim | `SECURITY DEFINER`; reforço de perfil recomendável no app |
| `RPC: cancelar_movimentacao` | EXECUTE | sim (própria pendente) | sim | sim | sim | operador dono do lançamento ou perfil gerencial |
| `RPC: cancelar_venda_transacional` | EXECUTE | não | sim | sim | sim | apenas `GERENTE`/`DONO`/`ADMIN` na loja do caixa |
| `RPC: confirmar_remessa_entrada` | EXECUTE | não | sim (só loja da remessa) | sim | sim | `GERENTE`/`DONO`/`ADMIN` (migração 044); tenant scope por loja desde a migração 20260828140000 (Fase 3 do plano de remediação) — DONO/ADMIN cross-loja |
| `RPC: decrementar_estoque_idempotente` | EXECUTE | não | não | não | não | **Legado** (`070` delega a `seguro`; `071` revoga `authenticated`). Apenas **`service_role`** no Postgres; não usar em novos fluxos |
| `RPC: decrementar_estoque_seguro` | EXECUTE | sim | sim | sim | sim | **`SECURITY DEFINER`; caminho canónico** de baixa (FOR UPDATE + `version`); deriva loja pela venda/caixa; usado pela sync-outbox e pelas RPCs de finalizar venda |
| `RPC: estornar_movimentacao` | EXECUTE | sim (escopo caixa) | sim | sim | sim | origem aprovada + regras de caixa na função |
| `RPC: finalizar_venda_transacional_canonica_v4` | EXECUTE | sim | sim | sim | sim | **CANÔNICA** — wrapper `SECURITY DEFINER` com scope-guard (loja/caixa/operador), 22 args, idempotente por `p_venda_id`. Contrato: [`rpc-finalizar-venda-canonica-v4.json`](./contracts/v1/rpc-finalizar-venda-canonica-v4.json) |
| `RPC: finalizar_venda_transacional_canonica_v4_unscoped` | EXECUTE | **não** | **não** | **não** | **não** | `REVOKE ALL` para `authenticated`; alcançável só pelo wrapper acima |
| `RPC: finalizar_venda_transacional` | EXECUTE | sim | sim | sim | sim | **Legado** — usar a canônica v4 |
| `RPC: finalizar_venda_transacional_canonica_v2` | EXECUTE | sim | sim | sim | sim | **Legado** — bloqueada por stub; usar a canônica v4 |
| `RPC: fiscal_enfileirar_documento_venda` | EXECUTE | sim (venda própria) | sim | sim | sim | ou visão gerencial na mesma base |
| `RPC: fiscal_reprocessar_documento` | EXECUTE | não | sim | sim | sim | apenas `GERENTE`/`DONO`/`ADMIN` |
| `RPC: obter_limite_sangria_sem_gerente` | EXECUTE | sim | sim | sim | sim | leitura de `pdv_config` |
| `RPC: pdv_config_para_caixa_web` | EXECUTE | sim | sim | sim | sim | payload restrito para o caixa web |
| `RPC: recalcular_saldo_caixa` | EXECUTE | sim | sim | sim | sim | `SECURITY DEFINER` sem checagem de perfil na função (hardening recomendado) |
| `RPC: registrar_liquidacao_receber` | EXECUTE | não | sim | sim | sim | `GERENTE`/`DONO`/`ADMIN` |
| `RPC: registrar_movimentacao` | EXECUTE | sim (próprio caixa) | sim | sim | sim | operador dono do caixa ou perfil gerencial |
| `RPC: registrar_venda_com_itens` | EXECUTE | sim | sim | sim | sim | `p_operador_id` deve ser coerente com o fluxo e RLS |
| `RPC: relatorio_resumo_executivo_periodo` | EXECUTE | sim (RLS em `vendas`) | sim | sim | sim | `SECURITY INVOKER` |
| `RPC: relatorio_top_produtos_periodo` | EXECUTE | sim (RLS) | sim | sim | sim | sobrecargas `(date,date,int[,tz])` e legado `timestamptz` |
| `RPC: relatorio_tz_validado` | EXECUTE | sim | sim | sim | sim | normalização de fuso |
| `RPC: relatorio_vendas_por_dia_periodo` | EXECUTE | sim (RLS) | sim | sim | sim | sobrecargas `(date,date[,tz])` e legado `timestamptz` |
| `RPC: transferir_estoque_entre_lojas` | EXECUTE | não | sim (só se participar da loja origem/destino) | sim | sim | `GERENTE`/`DONO`/`ADMIN` (migração 044); tenant scope por loja desde a migração 20260828140000 (Fase 3 do plano de remediação) — DONO/ADMIN cross-loja |
| `RPC: transferir_estoque_seguro` | EXECUTE | não | sim (só se participar da loja origem/destino) | sim | sim | `SECURITY DEFINER`; caminho canônico do app (`app/gerente/transferencias/actions.ts`) — idempotente, lock determinístico, `p_saldo_esperado`. Tenant scope por loja desde a migração 20260828140000 (Fase 3 do plano de remediação) — DONO/ADMIN cross-loja |

Funções `public` com `GRANT EXECUTE` apenas para `service_role` (fora da matriz de sessão `authenticated` do app): `fiscal_claim_documentos`, `fiscal_marcar_emitido`, `fiscal_marcar_erro`, `fiscal_marcar_erro_normalizado`, `decrementar_estoque_idempotente` (legado; preferir `decrementar_estoque_seguro`). Triggers internos (`tg_*`) não são RPCs de API.

## Regras de validação obrigatórias no CI

1. `OPERADOR` não pode enxergar venda de outro operador.
2. `OPERADOR` não pode atualizar `produtos`.
3. `GERENTE` e `ADMIN` podem operar dados gerenciais apenas na loja.
4. `DONO` mantém visão macro (quando policy explícita existir).
5. `v_estoque_baixo` deve continuar com `security_invoker=true`.
