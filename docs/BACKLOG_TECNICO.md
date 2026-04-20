# Backlog técnico (stress / produção)

Itens ainda em aberto apontados na análise de stress ou homologação, para priorização pós–go-live.

1. **Kardex operacional avançado:** a view `v_kardex_unificado` (060) cobre baseline de leitura; falta painel/export agregado no gerente, materialized view opcional e política de refresh se o volume crescer.
2. **Arredondamento heterogéneo:** alinhar `Math.round` / arredondamentos residuais no front com `round_abnt` e regras ABNT no Postgres, com testes de regressão em totais e descontos.
3. **Devolução de estoque fora do cancelamento:** fluxos de ajuste manual, troca ou devolução pós-venda sem passar por `cancelar_venda` — hoje o estoque repõe principalmente no cancelamento; definir RPC ou rotina única para não criar buracos no kardex.
4. **Cobertura E2E (Playwright):** em progresso — pipeline `npm run test:e2e:critical` roda `sync-fluxo-gerente`, `caixa-venda`, `caixa-venda-multi-pagamento` (split DINHEIRO + PIX), `caixa-fluxos-criticos` (sangria + fechar) e smoke `caixa.spec`. `gerente.spec` cobre navegação, início (tabela), caixas (CSV), relatórios (período). Operador: `PLAYWRIGHT_CAIXA_TEST_*`. Staging: `ENABLE_PLAYWRIGHT_E2E=true` + secrets estáveis (`docs/E2E.md`). Falta: fluxos mutadores no gerente (cancelar venda, ajuste estoque) e >2 parcelas no caixa.
5. **Operação web offline:** documentação e expectativa claras — o `pdv-importados` permanece online-only; stress de fila/outbox no browser não é escopo; harmonizar mensagens de produto se houver confusão com `pdv-local`.
