# Gate PR B — Experiência de fechamento por forma

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Branch** | `cursor/fechamento-caixa-por-forma-pr-b-7da4` |
| **Base** | Tip #478 (RPC + contratos) |
| **Stack** | [STACK_INTEGRACAO_473_478.md](./STACK_INTEGRACAO_473_478.md) |

## Matriz

| Critério | Resultado | Evidência | Teste |
|----------|-----------|-----------|-------|
| E(c) preservado | OK | `fechar` ainda usa `calcular_valor_sistema_dinheiro_caixa` | mig + adversariais |
| PIX registrado | OK | snapshot `REGISTRADO_JINLONG`; UI “Registrado no Jinlong” | panel test + SQL |
| Débito registrado | OK | idem | estrutural |
| Crédito registrado | OK | idem | estrutural |
| Fechamento cego | OK | topbar oculta fundo; sem por-forma pré-fechar | pr-b.test + TopBar |
| Snapshot ≠ SSoT | OK | COMMENT + contrato | mig |
| Idempotência | OK | replay valor + UNIQUE DO NOTHING | mig fechar |
| Auditoria | OK | tabela + listar RPC + recibo | impl |
| Autorização | OK | mesma loja/perfil do E(c) | listar RPC |
| Erro ≠ zero | OK | painel alerta | FormasPanel.test |

## Decisão produto (campos eletrônicos)

Sem integração maquininha/banco: **não** há campo “informado” para PIX/débito/crédito. Evita falsa conciliação.

## Decisão

# CLOSURE BY PAYMENT METHOD READY

Testes locais (vitest 17, typecheck OK, migration+snapshot SQL OK). Sem merge automático.
