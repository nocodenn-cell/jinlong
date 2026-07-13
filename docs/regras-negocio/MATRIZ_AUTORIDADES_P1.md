# Matriz de autoridades — núcleo PDV (P1)

**Status:** canônica para fechamento P1  
**Critério de encerramento P1:** autoridade 1 alinhada · autoridade 2 mergeada · **este documento na `main`**.

Não altera o [Golden Flow](../venda-golden-flow.md) congelado; complementa com autoridades explícitas.

| # | Domínio | Autoridade única | Runtime | Estado |
|---|---------|------------------|---------|--------|
| 1 | Preço atacado (automático) | `calcular_preco_produto` ≡ `PRICE_RESOLUTION_CHAIN` | Web: RPC. Local: espelhar (inventário+plano em `PLANO_AUTORIDADE_1_PRECO.md`). `regras_preco` **fora** do atacado. | **Aberta / #182 bloqueada** — algoritmo+dados+caminho definidos; sem implementação |
| 2 | Pagamento parcial | RPC v4 + `caixaPagamentoSaldo` (`SALDO_PENDENTE_EPS=0.009`) | Web. Local sem CR (dual-canal). | **#180 pronta** — aguardando CI verde (billing Actions) para merge; escopo congelado |
| 3 | Venda em espera | RPCs `vendas_em_espera` | Web. `cliente_id` null = dívida Fase 7. | Aceito |
| 4 | Estoque na venda | Web: baixa na TX v4. Local: `aplicarBaixaEstoquePorItem` pós-venda (BA-012). | Dual declarado. | Aceito |
| 5 | Fechamento de venda | Web: `caixaVendas.impl` → v4. Local: `sync-outbox` → `registrar_venda_com_itens`. | Callers únicos (`rpc-gate-guard`). | Canônica |

## Proibições globais

- Segundo motor de atacado no Local.
- Hard-block de underpay na UI Web.
- Segundo caller de v4 / `registrar_venda_com_itens` em produção.
- Expandir espera/estoque Local neste ciclo (fora de escopo).

## Referências

- [CONSOLIDACAO_P1_NUCLEO_PDV.md](./CONSOLIDACAO_P1_NUCLEO_PDV.md)
- [PLANO_AUTORIDADE_1_PRECO.md](./PLANO_AUTORIDADE_1_PRECO.md)
- E2E parcial: `pdv-importados/e2e/caixa-fase5b-golden-flow-ui.spec.ts`
