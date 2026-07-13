# ADR — `saldo_atual` vs valor de sistema (gaveta)

| Campo | Valor |
|--------|--------|
| **ID** | ADR-CAIXA-002 |
| **Título** | Dois conceitos de saldo no caixa web |
| **Status** | Aceito (documentação de estado atual) |
| **Data** | 2026-07-13 |
| **Contexto** | E2E de sangria observou `MOV_CAIXA_SALDO_INSUFICIENTE` com Fundo UI alto. |

---

## Contexto

No PDV Web coexistem **dois saldos**:

| Conceito | Origem | Uso |
|----------|--------|-----|
| **Fundo / valor de sistema** | `calcular_valor_sistema_dinheiro_caixa` (valor_inicial + vendas DINHEIRO + movs − devoluções) | Topbar («Fundo»), fechamento expected |
| **`caixas.saldo_atual`** | Coluna atualizada em sangria/suprimento/estorno (não pela finalize v4) | Gate da RPC `registrar_movimentacao` |

A finalize canônica **v4 não incrementa** `saldo_atual` (ver smoke Cycle 4 / `docs/venda-golden-flow.md`).

## Decisão

1. **Não unificar** as colunas nesta fase (risco operacional alto; Golden Flow congelado).
2. Sangria/suprimento continuam autoritativos em `saldo_atual`.
3. UI de Fundo continua autoritativa em valor de sistema.
4. Erros `MOV_CAIXA_SALDO_INSUFICIENTE` são mapeados para mensagem de operador (`caixaErroOperador`) — sem expor o código RPC.
5. Homologação/e2e de sangria deve tratar ambiente com `saldo_atual` esgotado (abrir turno fresco ou seed controlado).

## Consequências

- Operador pode ver Fundo R$ X e sangria falhar se `saldo_atual` << X após longo turno com muitas vendas DINHEIRO.
- Dívida técnica registrada: candidato a mission P0/P1 **após** billing CI + merge dos PRs de homologação (#176+), com evidência de produto sobre qual saldo a sangria deve usar.

## Referências

- `backend/supabase/scripts/homolog_pdv_web_fracionado_cycle4.sql`
- `pdv-importados/app/caixa/server/caixaErroOperador.ts`
- `pdv-importados/app/caixa/server/caixaMovimentacoes.impl.ts`
