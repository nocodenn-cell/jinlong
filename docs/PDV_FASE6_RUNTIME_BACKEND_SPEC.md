# PDV — Fase 6: Runtime ↔ Backend (design spec, sem implementação)

| Campo | Valor |
|-------|-------|
| **Status** | Especificação — plano de implementação; nenhum adapter novo foi escrito nesta rodada |
| **Escopo** | O adapter `SendCommand` real que liga `CommandRuntime` (Fase 5) às RPCs/Server Actions existentes, e a decisão de como cada `COMMAND` da tabela §4 de `PDV_FASE3_STATE_MACHINE_SPEC.md` é resolvido hoje |
| **Fora de escopo** | Migrations SQL novas, substituir `CaixaPageClient.tsx` em produção, qualquer regra de negócio nova |
| **Pré-requisitos** | `PDV_FASE3_STATE_MACHINE_SPEC.md` (contrato `PDVSaleState`/`PDVViewState`/COMMAND→STATE), `PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md` (auditoria das RPCs reais + contrato-alvo), `PDV_FASE2_FRONTEND_SHELL_SPEC.md` (árvore de componentes), implementação de `SaleStateMachine`/`useSaleState`/`CommandRuntime`/`OperatorView` (Fases 4–5, já em `pdv-importados/app/caixa/operator-view/`) |

**Regra de ouro desta fase (herdada, não nova):** o adapter só traduz `COMMAND → chamada real → PDVBackendSnapshot`. Nenhuma decisão de negócio (preço, elegibilidade, desconto, classificação de erro fora do que a Fase 3 já define) entra no adapter — se uma RPC não devolve o que o contrato-alvo da Fase 1 exige, isso é um gap a documentar aqui, não a compensar com lógica no frontend.

---

## 0. Onde a Fase 6 começa

`CommandRuntime.ts` já define o ponto de extensão:

```ts
export type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<PDVBackendSnapshot>
```

e o próprio comentário do arquivo registra o que falta: *"a ligação real com RPCs de Fase 1 ainda não existe"*. `OperatorView`/`useSaleState`/`CommandRuntime` também não estão hoje conectados a `CaixaPageClient.tsx` — o fluxo de produção continua rodando por fora (`actions.ts` → `supabase.rpc()` direto, `docs/venda-golden-flow.md`). A Fase 6 fecha a primeira lacuna (o adapter); a costura com produção fica fora de escopo aqui (§4).

---

## 1. Objetivo

Implementar **um único módulo** `SendCommand` que:

1. Recebe `(command, payload)`.
2. Despacha para a RPC/Server Action/mutação local correta, conforme a tabela §4 de `PDV_FASE3_STATE_MACHINE_SPEC.md`.
3. Traduz a resposta (sucesso ou erro) em um `PDVBackendSnapshot` (= `PDVViewState`) completo — nunca parcial, nunca inferido.
4. Não introduz nenhum estado, hook, contexto ou store novo — é uma função, não um novo runtime paralelo ao `CommandRuntime` já existente.

---

## 2. Cada `COMMAND` — o que existe hoje e o gap real

Baseado na tabela §4 de `PDV_FASE3_STATE_MACHINE_SPEC.md` e nos achados de `PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md`:

| COMMAND | O que chamar | Gap identificado (Fase 1) | Decisão para a Fase 6 |
|---|---|---|---|
| `CMD_ITEM_SCAN`, `CMD_ITEM_ADD_MANUAL`, `CMD_ITEM_UPDATE_QTY`, `CMD_ITEM_REMOVE` | Sem RPC — `unifiedCartStore` local + `calcular_preco_produto` para preço | Não é um gap a fechar: a Fase 1 (§2.4) já registra que **não existe backend nesse trecho por desenho atual** (carrinho em edição não é autoritativo até o commit da venda) | Adapter monta o snapshot localmente a partir do carrinho + resposta de `calcular_preco_produto`; não é "fire and forget" disfarçado — é o único ponto do domínio onde a Fase 1 explicitamente não exige RPC |
| `CMD_DESCONTO_GERENTE_APLICAR` | Edge Function `validar-gerente` | Não idempotente — cada chamada emite um token novo (Fase 1 §2.6) | Aceitar o comportamento atual (é comportamento de produção hoje); `CommandRuntime` já serializa por `execute()`, então dois cliques do mesmo operador não geram duas chamadas em voo simultâneas — mas isso não resolve o gap de fundo, só evita piorá-lo. Não é corrigido nesta fase. |
| `CMD_SALE_CHECKOUT_START` / `CMD_SALE_CHECKOUT_CANCEL` | Guard local (`itens.length > 0`) | Nenhum | Direto, sem chamada de rede |
| `CMD_SALE_FINALIZE` | `finalizar_venda_transacional_canonica_v4` | Escritas internas sem `RETURNING` completo (Fase 1 §2.7), mas a **resposta do RPC já traz** `venda_id`/`event_id`/`dados_fiscais` suficientes para montar o snapshot | Adapter monta o snapshot a partir da resposta do RPC; classificação de erro (recuperável/bloqueante-estoque/sessão) usa a tabela §4.1 de `PDV_FASE3_STATE_MACHINE_SPEC.md` como fonte única — nenhum componente reinterpreta a string do erro |
| `CMD_SALE_NEW` | Reset local | Nenhum | Direto |
| `CMD_CAIXA_ABRIR` | Hoje: `INSERT` direto em `caixas`, sem RPC dedicada | **TOCTOU real** (Fase 1 §2.1) — duas chamadas concorrentes podem criar dois caixas abertos; `CommandRuntime` trata este comando como idempotente (está em `DEFAULT_IDEMPOTENT_COMMANDS`), mas o dedupe é só client-side — não substitui uma constraint no banco | **Bloqueio real, não estético.** Ver §3 |

---

## 3. Único item que bloqueia a Fase 6 de ser só um adapter

`CMD_CAIXA_ABRIR` é o único comando da tabela onde o gap do backend (TOCTOU sem constraint) pode produzir um estado de negócio inválido (dois caixas abertos) mesmo com o `CommandRuntime` funcionando exatamente como projetado. Isso não é um problema do adapter — é o gap que `PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md` §4.2 já recomenda fechar com um índice único parcial (`WHERE status = 'ABERTO'`), replicando o padrão já usado em `uq_movimentacoes_caixa_idempotency`.

Duas opções, a decidir antes de implementar o adapter (não decidido neste documento):

- **(a)** Fechar o gap primeiro — uma migration pequena e isolada (índice único parcial) antes de ligar `CMD_CAIXA_ABRIR` ao `CommandRuntime` em qualquer ambiente além de dev.
- **(b)** Ligar mesmo assim, documentando o risco residual explicitamente (mesma exposição que `abrirCaixaOperadorImpl` já tem em produção hoje — a Fase 6 não pioraria o estado atual, só o herdaria).

---

## 4. Integração com produção — deliberadamente fora desta fase

`CaixaPageClient.tsx` não é tocado por este plano. Ligar `OperatorView`/`useSaleState`/`CommandRuntime` ao fluxo real do caixa web é uma costura de produção (candidata a uma fase separada, atrás de feature flag, seguindo o padrão já usado no repo — ex. `NEXT_PUBLIC_CAIXA_PDV_LAYOUT`) e depende do adapter desta fase estar implementado e testado isoladamente primeiro.

---

## 5. Critério de saída da Fase 6

1. Um módulo `SendCommand` real existe, com um `case`/branch para cada `COMMAND` da tabela §4 do Fase 3 — nenhum mock, nenhum placeholder.
2. Testes de integração cobrindo: caminho feliz de cada comando + os 3 destinos de erro de `CMD_SALE_FINALIZE` (recuperável → `PAYMENT_PENDING` habilitado; bloqueante-estoque → `PAYMENT_PENDING` com finalize desabilitado; sessão → `IDLE`).
3. Decisão registrada (não necessariamente implementada) sobre `CMD_CAIXA_ABRIR` (§3).
4. Nenhum componente de `operator-view/` foi alterado para acomodar o adapter — a integração é estritamente por baixo do `SendCommand`.

## 6. O que este documento não decide

- Não escreve a migration do índice único de `caixas` (§3).
- Não decide o rollout em produção (feature flag, % de tráfego, etc.) — fica para o PR de implementação.
- Não resolve a não-idempotência de `validar-gerente` (fica registrada como dívida herdada, não desta fase).
