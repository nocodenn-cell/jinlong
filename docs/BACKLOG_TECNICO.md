# Backlog técnico (stress / produção)

Itens ainda em aberto apontados na análise de stress ou homologação, para priorização pós–go-live.

1. **Kardex operacional avançado:** a view `v_kardex_unificado` (060) cobre baseline de leitura; falta painel/export agregado no gerente, materialized view opcional e política de refresh se o volume crescer.
2. **Arredondamento heterogéneo:** `pdv-importados/core/pricing/PricingService.ts` passou a usar `roundAbnt` (2 casas) nos preços atacado/regras — **continua** auditar outros `Math.round`/`toFixed` fora do motor de preço (carrinho, totais, UI) e reforçar testes de regressão em totais/descontos cruzando com `public.round_abnt`.
3. **Devolução de estoque fora do cancelamento:** fluxos de ajuste manual, troca ou devolução pós-venda sem passar por `cancelar_venda` — hoje o estoque repõe principalmente no cancelamento; definir RPC ou rotina única para não criar buracos no kardex.
4. **Cobertura E2E (Playwright):** em progresso — pipeline `npm run test:e2e:critical` roda `sync-fluxo-gerente`, `caixa-venda`, `caixa-venda-multi-pagamento` (split 2 parcelas + **3 parcelas** DINHEIRO/PIX/CARTAO_DEBITO com `USE_UNIFIED_SALES_FLOW=true`), `caixa-fluxos-criticos` (sangria + fechar) e smoke `caixa.spec`. `gerente.spec` cobre navegação, início (tabela), caixas (CSV), relatórios (período). Operador: `PLAYWRIGHT_CAIXA_TEST_*`. Staging: `ENABLE_PLAYWRIGHT_E2E=true` + secrets estáveis (`docs/E2E.md`). **Falta:** fluxos mutadores no gerente (cancelar venda, ajuste estoque).
5. **Operação web “offline”:** esclarecido no `pdv-importados/README.md` — app **online-first**; sync/offline é **`pdv-local`**. Revisar mensagens de produto/marketing antigas que ainda falem em “offline” só no contexto web.
