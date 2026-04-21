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
| `RPC: finalizar_venda_transacional_canonica_v2` | EXECUTE | sim (fluxo próprio) | sim | sim | sim | deve respeitar escopo de venda/caixa/token |
| `RPC: decrementar_estoque_seguro` | EXECUTE | indireto (via venda) | sim | sim | sim | função `SECURITY DEFINER`, validar entrada/loja |

## Regras de validação obrigatórias no CI

1. `OPERADOR` não pode enxergar venda de outro operador.
2. `OPERADOR` não pode atualizar `produtos`.
3. `GERENTE` e `ADMIN` podem operar dados gerenciais apenas na loja.
4. `DONO` mantém visão macro (quando policy explícita existir).
5. `v_estoque_baixo` deve continuar com `security_invoker=true`.
