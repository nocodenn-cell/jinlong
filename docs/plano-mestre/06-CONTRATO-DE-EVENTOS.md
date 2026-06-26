# Contrato de Eventos do Domínio

> Documento complementar ao Plano Mestre. Define o **contrato de eventos** que
> liga o PDV (produtor) aos módulos de domínio (consumidores), conforme o modelo
> event-driven de [`05-ARQUITETURA-PDV.md`](./05-ARQUITETURA-PDV.md).
>
> **Escopo:** descreve o contrato vigente (o que o código produz/consome hoje) e
> marca explicitamente o que é **roadmap** ou **inconsistência a reconciliar**.
> Não descreve layout nem componentes.

---

## 1. Princípios

1. **O PDV publica o fato; os módulos aplicam a regra.** O PDV registra que uma
   venda ocorreu e emite o evento; Estoque, Financeiro, Fiscal e Relatórios
   reagem com **suas próprias** regras (ver [05, §4](./05-ARQUITETURA-PDV.md)).
2. **Direção única da dependência:** consumidores dependem do **evento**, nunca
   da implementação interna do PDV.
3. **Idempotência por contrato:** todo consumidor deve tolerar reentrega do mesmo
   evento sem efeito duplicado (chaves de idempotência + `ON CONFLICT`).
4. **Versionamento explícito:** contratos críticos vivem em
   [`docs/contracts/`](../contracts/README.md), versionados por pasta (`v1`, …).

## 2. Canais de eventos (contrato vigente)

| Canal | Runtime | Onde nasce | Drenagem / entrega |
|-------|---------|------------|--------------------|
| **`venda_eventos`** (tabela) | Web online | Gravado na **mesma transação atômica** da venda (`event_id`) por `finalizar_venda_transacional_canonica_v4` | Leitura/projeções pelos módulos |
| **Outbox `VENDA_REGISTRADA`** | PDV local (`pdv-local`) | Outbox local da estação | `POST /sync-outbox` (Edge) → `dispatchOutboxEvent` → `processVenda` |
| **Breadcrumbs `VENDA_EVENTS`** | Web/desktop/edge | `shared-core/src/observability/vendaTrace.ts` | **Observabilidade** (Sentry) — **não** é o barramento de domínio (ver §7) |

> **Fonte canônica do fluxo:** [`docs/venda-golden-flow.md`](../venda-golden-flow.md)
> (congelado). Os contratos de payload estão em
> [`docs/contracts/v1/`](../contracts/v1/).

## 3. Eventos do domínio **Venda**

### 3.1 `VENDA_REGISTRADA` — venda concluída

| Campo | Valor |
|-------|-------|
| **Payload** | Venda + itens. Web: efeito da RPC `finalizar_venda_transacional_canonica_v4` (`p_caixa_id`, `p_forma_pagamento`, `p_total_bruto/desconto/liquido`, `p_itens[]`, `p_idempotency_key`). Local/outbox: envelope `{ id, tipo: "VENDA_REGISTRADA", payload_json, created_at }` — schema em [`sync-outbox-venda-registrada.json`](../contracts/v1/sync-outbox-venda-registrada.json). |
| **Produtor** | PDV (web: `app/caixa/server/caixaVendas.impl.ts`; local: estação → `sync-outbox`). |
| **Consumidores** | Estoque (baixa), Financeiro (recebível/caixa), Fiscal (emissão async), Relatórios (read-only). |
| **Garantias transacionais** | Web: **atômico** — `vendas` + `itens_venda` + estoque + `venda_eventos` na mesma transação; `event_id` nasce com a venda. Idempotência via `pg_advisory_xact_lock(hashtext(venda_id))` + `ON CONFLICT DO NOTHING`. Local: `registrar_venda_com_itens` com `ON CONFLICT (id) DO NOTHING`; baixa de estoque por `aplicarBaixaEstoquePorItem`. |
| **Versão** | v1 — [`sync-outbox-venda-registrada.json`](../contracts/v1/sync-outbox-venda-registrada.json) / [`rpc-finalizar-venda-canonica-v3.json`](../contracts/v1/rpc-finalizar-venda-canonica-v3.json). RPC ativa no código: **v4** (v2/v3 desabilitadas — `LEGACY_DISABLED_USE_V4`). |

### 3.2 `VENDA_CANCELADA` — cancelamento

| Campo | Valor |
|-------|-------|
| **Payload** | `{ venda_id, status: "CANCELADA", motivo?, operador_id }`. Resultado da ação de cancelamento (`caixaVendas.impl.ts` → `{ ok, vendaId, status: 'CANCELADA' }`). |
| **Produtor** | PDV / Vendas (cancelamento autorizado por gerente — confirmação obrigatória, [Pilar 3 §6](./03-PADROES-UX.md)). |
| **Consumidores** | Estoque (reversão da baixa, quando aplicável), Financeiro (estorno do recebível), Relatórios, Auditoria. |
| **Garantias transacionais** | Transição de `status` da venda persistida; deve ser atômica com os efeitos de reversão. Idempotente por `venda_id`. |
| **Versão** | Sem JSON de contrato dedicado ainda → **lacuna a versionar** (ver §8). Breadcrumb `venda_cancelada`. |

### 3.3 `VENDA_DEVOLVIDA` / estorno — *parcialmente roadmap*

O status persistido `DEVOLVIDA` existe (`vendaMaps.ts`), mas **não** há contrato
de evento publicado dedicado. Documentar como **roadmap de barramento**: a
devolução deve emitir evento próprio para Estoque/Financeiro/Fiscal reverterem.
Ver [Máquina de Estados do PDV, §estados terminais](./07-MAQUINA-DE-ESTADOS-PDV.md).

## 4. Eventos do domínio **Estoque**

> Hoje a maior parte do efeito de estoque é **side-effect transacional** da venda,
> não um evento publicado autônomo. Registrado em movimentos/log de estoque.

| Evento | Payload | Produtor | Consumidores | Garantias | Versão |
|--------|---------|----------|--------------|-----------|--------|
| **Baixa por venda** | `{ loja_id, produto_id, quantidade, referencia }` — RPC `decrementar_estoque_seguro` | PDV/Vendas (efeito de `VENDA_REGISTRADA`) | Estoque, Relatórios | Atômico dentro da finalização (web) ou `aplicarBaixaEstoquePorItem` (local); efeito sem retorno funcional | [`rpc-decrementar-estoque-seguro.json`](../contracts/v1/rpc-decrementar-estoque-seguro.json) (v1) |
| **Transferência** | `{ loja_origem, loja_destino, produto_id, quantidade, idempotency_key, saldo_esperado? }` | Módulo Estoque (`/gerente/transferencias`) | Estoque (saldos), Relatórios | Atômica; **idempotência obrigatória** (`p_idempotency_key`); retorna `uuid` do movimento | [`rpc-transferir-estoque-seguro.json`](../contracts/v1/rpc-transferir-estoque-seguro.json) (v1) |
| **Entrada / Ajuste / Inventário** | (por definir) | Módulo Estoque | Estoque, Relatórios | Atômico + log de auditoria | **Roadmap de contrato** |

> **Roadmap:** um evento `ESTOQUE_MOVIMENTADO` publicado (não apenas log interno)
> unificaria baixa/entrada/ajuste/transferência para consumidores externos. Ver §8.

## 5. Eventos do domínio **Financeiro**

> O Financeiro é **espelho passivo** do fato de venda — deriva do evento, não
> recalcula no PDV (commit de referência: `venda_finance_context`).

| Evento | Payload | Produtor | Consumidores | Garantias | Versão |
|--------|---------|----------|--------------|-----------|--------|
| **Recebível de venda** | Deriva de `VENDA_REGISTRADA` (`forma_pagamento`, `total_liquido`, `venda_id`) → `venda_finance_context` | Financeiro (consome venda) | Financeiro (contas a receber, fluxo de caixa), Relatórios | Derivação idempotente por `venda_id` | **Lacuna a versionar** |
| **`MOVIMENTO_CAIXA`** | Envelope outbox de movimento de caixa (sangria/suprimento) | PDV local → `sync-outbox` | Financeiro (caixa) | Persistido via `sync-outbox`; idempotente por `id` | v1 (envelope outbox) |
| **`CAIXA_ABERTO` / `CAIXA_FECHADO`** | Envelope outbox `CAIXA_*` | PDV (operador) | Financeiro (sessão de caixa), Auditoria | `sync-outbox` idempotente | v1 (envelope outbox) |

> Gate financeiro de produção: [`docs/pdv-production-financial-gate.md`](../pdv-production-financial-gate.md).

## 6. Eventos do domínio **Fiscal**

> Emissão fiscal é **assíncrona e best-effort** — **nunca** bloqueia a venda.
> Desligada por padrão (flag `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE`).

| Evento | Payload | Produtor | Consumidores | Garantias | Versão |
|--------|---------|----------|--------------|-----------|--------|
| **`FISCAL_ENFILEIRADO`** | `{ venda_id, tipo_documento }` — RPC `fiscal_enfileirar_documento_venda` | Fiscal (após `VENDA_REGISTRADA` sincronizada), se flag ativa | Fiscal-worker | Falha **não propaga** ao batch de venda (só log) | **Roadmap de contrato** |
| **`FISCAL_EMITIDO`** | `{ venda_id, numero_nf, chave }` | `fiscal-worker` (provider) | Vendas (situação fiscal derivada de `numero_nf`), Relatórios | Retentativa por worker; idempotente por `venda_id` | **Roadmap de contrato** |
| **`FISCAL_REJEITADO`** | `{ venda_id, error_code: "FISCAL_RULE_REJECTION", motivo }` | `fiscal-worker` (`fiscal_classify`) | Fiscal (fila de correção), Alertas | DLQ / retentativa conforme política | **Roadmap de contrato** |

> Situação fiscal hoje é **derivada** do `numero_nf` (não há coluna fiscal
> dedicada) — ver `vendaMaps.ts` (`toFiscal`). O módulo Fiscal de nível 1
> permanece planejado ([Pilar 4](./04-MODULOS.md)).

## 7. Eventos de negócio vs breadcrumbs de observabilidade

Não confundir dois vocabulários:

- **Barramento de domínio (persistido):** `VENDA_REGISTRADA`, `CAIXA_*`,
  `MOVIMENTO_CAIXA` (outbox/tabela). É o que os módulos **consomem**.
- **Breadcrumbs de observabilidade (`VENDA_EVENTS`):** `venda_iniciada`,
  `item_adicionado`, `pagamento_processado`, `venda_confirmada_rpc`,
  `venda_cancelada`, `erro_rpc_venda`, `duplicidade_detectada`, `dlq_atingido`, …
  Servem para **rastreio/telemetria** (Sentry), **não** para acionar regra de
  negócio. Fonte: `shared-core/src/observability/vendaTrace.ts`.

A [Máquina de Estados do PDV](./07-MAQUINA-DE-ESTADOS-PDV.md) usa esse vocabulário
de breadcrumbs como **gatilhos** do ciclo de vida, mas o efeito de domínio só é
real quando o **evento persistido** é emitido.

## 8. Versionamento

- **Local dos contratos:** [`docs/contracts/`](../contracts/README.md), uma pasta
  por versão (`v1`, `v2`, …); changelog por versão em
  [`docs/contracts/v1/CHANGELOG.md`](../contracts/v1/CHANGELOG.md).
- **Regra:** adição **opcional** mantém a versão; campo obrigatório novo, rename,
  remoção ou **semântica alterada** exige **nova versão** + atualização de
  changelog e testes de contrato.
- **Lição registrada:** a RPC de finalização evoluiu `v2 → v3 → v4`; as anteriores
  são **bloqueadas** no banco (`LEGACY_DISABLED_USE_V4`) — quebra incompatível
  tratada por nova versão, nunca por mutação silenciosa.
- **Lacunas a versionar (backlog):** `VENDA_CANCELADA`, devolução/estorno,
  recebível de venda (Financeiro), eventos fiscais e `ESTOQUE_MOVIMENTADO` ainda
  **não** têm JSON de contrato. Criar `docs/contracts/v1/*.json` quando forem
  formalizados.

## 9. Divergências conhecidas

| Tema | Situação | Ação |
|------|----------|------|
| **Nomenclatura PT vs EN** | Coexistem `VENDA_REGISTRADA` (outbox/edge) e `SALE_REGISTERED` / `SALE_CANCELLED` (`event_type`, usados em `dev-tools` e na tabela de eventos do gate) | Padronizar um único vocabulário canônico e mapear o legado. |
| **Side-effect vs evento publicado** | Estoque/Financeiro hoje reagem dentro da transação da venda, não a um evento de barramento autônomo | Avaliar barramento explícito (§4, §5) no roadmap. |
| **Contratos faltantes** | Vários eventos sem JSON Schema (§8) | Formalizar em `docs/contracts/`. |

---

## Referências

- [`05-ARQUITETURA-PDV.md`](./05-ARQUITETURA-PDV.md) — modelo event-driven do PDV.
- [`07-MAQUINA-DE-ESTADOS-PDV.md`](./07-MAQUINA-DE-ESTADOS-PDV.md) — ciclo de vida da venda.
- [`docs/venda-golden-flow.md`](../venda-golden-flow.md) — fluxo de venda (congelado).
- [`docs/contracts/`](../contracts/README.md) — contratos versionados.
- `shared-core/src/observability/vendaTrace.ts` — breadcrumbs `VENDA_EVENTS`.
- `backend/supabase/functions/sync-outbox/index.ts` — drenagem do outbox.
