# Arquitetura do PDV — Subsistema Independente

> Documento complementar ao Plano Mestre. Consolida o **PDV como subsistema
> isolado** dentro da arquitetura do FastProduct, com responsabilidades próprias
> e fronteiras explícitas.
>
> **Escopo:** descreve apenas o **contrato vigente** (estado atual do código). O
> que for evolução futura está isolado na seção [Roadmap do PDV](#7-roadmap-do-pdv)
> e em ADRs — nunca misturado ao contrato.
>
> Este documento **não** descreve layout nem componentes (ver
> [Pilar 1](./01-ARQUITETURA.md) e [Pilar 2](./02-DESIGN-SYSTEM.md)). O PDV segue
> arquitetura própria por contrato (ver [Pilar 1, §6](./01-ARQUITETURA.md)).

---

## 1. Objetivo do módulo

O PDV é um **subsistema operacional independente** cujo único objetivo é
**operar a venda** com rapidez e continuidade: capturar itens (scanner/teclado),
aplicar preço, finalizar a transação e **publicar os eventos** que os demais
módulos consomem.

Prioridade absoluta: **rapidez e confiabilidade da venda**. Tudo que não serve
diretamente a concluir a venda fica fora do PDV.

## 2. Limites de responsabilidade

O PDV **é responsável por**:

- Captura de itens (bip/scanner, teclado, busca rápida).
- Resolução de SKU e aplicação de preço no caminho da venda.
- Montagem do carrinho e fechamento da venda.
- Finalização **atômica** da transação de venda.
- **Publicação dos eventos** da venda (fonte da verdade do *fato* "venda ocorreu").

O PDV **não é responsável por** (pertence aos respectivos módulos, que
**consomem** os eventos gerados pelo PDV):

| Domínio | Dono (módulo) | Como se relaciona com o PDV |
|---------|---------------|-----------------------------|
| **Estoque** | Módulo Estoque | A baixa é efeito da venda; a **regra** de estoque é do módulo Estoque. |
| **Financeiro** | Módulo Financeiro | Recebíveis/caixa/contas derivam do evento de venda, não são calculados no PDV. |
| **Fiscal** | Módulo Fiscal | Emissão de documento é **assíncrona**, fora do caminho perceptivo da venda. |
| **Relatórios** | Módulo Relatórios | Consome eventos/leituras read-only; o PDV não produz relatório. |
| **Catálogo/Produtos** | Módulo Produtos | O PDV apenas **lê** o catálogo; cadastro e regras de produto são do módulo. |

> **Regra de ouro:** o PDV registra o **fato da venda** e emite eventos. Cada
> outro módulo aplica suas **próprias regras** a partir desses eventos. O PDV não
> reimplementa regra de estoque, financeiro ou fiscal.

## 3. Fluxos principais (contrato vigente)

O PDV possui **dois runtimes**, cada um com seu *caller* único autorizado. A
fonte canônica e congelada destes fluxos é
[`docs/venda-golden-flow.md`](../venda-golden-flow.md) — este documento apenas
referencia, não duplica.

### 3.1 Fluxo web (online-first) — `pdv-importados`

```
Cliente → POST /caixa/action
  → caixaVendas.impl.ts (Server Action)
    → revalidação de preço autoritativa no servidor
    → rpc finalizar_venda_transacional_canonica_v4
       [transação atômica: vendas + itens_venda + estoque + venda_eventos]
    ← { venda_id, status, event_id, dados_fiscais? }
  → alertas leves (best-effort, pós-conclusão)
```

- *Caller* único autorizado: `pdv-importados/app/caixa/server/caixaVendas.impl.ts`.
- Idempotência via advisory lock + `ON CONFLICT DO NOTHING`; `event_id` gerado
  atomicamente na mesma transação (o evento nasce com a venda).

### 3.2 Fluxo PDV local (offline) — `pdv-local`

```
PDV Local → POST /sync-outbox (edge function)
  → dispatchOutboxEvent (VENDA_REGISTRADA)
    → registrar_venda_com_itens  [INSERT vendas + itens_venda, idempotente]
    → aplicarBaixaEstoquePorItem
    → (opcional) enfileira documento fiscal pós-sync
```

- *Caller* único autorizado: `backend/supabase/functions/sync-outbox/index.ts`.
- A venda local persiste primeiro; a sincronização pode atrasar sem impedir a
  venda. O fiscal é best-effort e não propaga falha.

> Invariantes operacionais (bip, fila, preço, offline) e decisões de runtime:
> ver [`ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md`](../ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md),
> [`CONTRATO_PIPELINE_BIP.md`](../CONTRATO_PIPELINE_BIP.md),
> [`SCAN_PIPELINE_STATE_MACHINE.md`](../SCAN_PIPELINE_STATE_MACHINE.md) e o
> [ADR-PDV-001](../adr/ADR-PDV-centro-de-gravidade.md).

## 4. Relação com os demais módulos (event-driven)

O PDV se integra ao resto do sistema **por eventos**, não por acoplamento direto
de regras. O PDV é **produtor**; os demais módulos são **consumidores**.

```
            ┌──────────────────────────┐
            │            PDV           │
            │  (opera e registra a     │
            │   venda — produtor)      │
            └────────────┬─────────────┘
                         │ publica eventos de venda
        ┌────────────────┼────────────────┬───────────────┐
        ▼                ▼                ▼               ▼
   ┌─────────┐     ┌───────────┐   ┌──────────┐   ┌─────────────┐
   │ Estoque │     │ Financeiro│   │  Fiscal  │   │ Relatórios  │
   │ (baixa) │     │(recebível)│   │(documento│   │  (leitura)  │
   │         │     │           │   │  async)  │   │             │
   └─────────┘     └───────────┘   └──────────┘   └─────────────┘
```

- **Canal de eventos (web):** `venda_eventos`, gravado na **mesma transação
  atômica** da venda (`event_id`). O fato da venda e seu evento são indivisíveis.
- **Canal de eventos (local):** outbox `VENDA_REGISTRADA` drenado por `sync-outbox`.
- **Estoque:** a baixa ocorre como efeito da finalização; a *autoridade* da regra
  de estoque permanece no módulo Estoque.
- **Financeiro:** espelho passivo a partir do evento de venda
  (ex.: `venda_finance_context`) — o PDV não calcula recebíveis.
- **Fiscal:** emissão assíncrona via worker/integração; **nunca** bloqueia a venda.
- **Relatórios:** estritamente read-only sobre eventos/projeções.

> Direção da dependência: os módulos dependem dos **eventos** do PDV; o PDV **não**
> depende da implementação interna deles. Isso mantém o PDV substituível e isolado.

## 5. Integração com o Bling (ERP)

O Bling é o **ERP de referência**. O PDV **não deve duplicar regras de negócio
que já existem no ERP**.

Contrato vigente da integração:

- O PDV é a **origem operacional do fato da venda**. Ele **publica os eventos
  necessários** para a sincronização de **vendas, estoque e financeiro**.
- As **regras de negócio canônicas** (precificação cadastral, regras fiscais,
  conciliação financeira, parametrizações) permanecem no ERP / módulos donos —
  o PDV **consome/respeita**, não reimplementa.
- A sincronização com o Bling consome os **mesmos eventos** já emitidos pelo PDV
  (`venda_eventos` / outbox `VENDA_REGISTRADA`). Não há um canal paralelo de
  regras: a fronteira de eventos é única.

> **Anti-duplicação (regra explícita):** se uma regra já existe no Bling/ERP, o
> PDV a trata como **autoridade externa** e apenas emite o evento. Qualquer
> tentação de recalcular a regra dentro do PDV é desvio de arquitetura.

> **Nota de escopo:** os *conectores* concretos de sincronização com o Bling são
> backlog de integração (ver Roadmap, §7). Este documento fixa apenas o
> **princípio de fronteira** (eventos, não regras), que já é o contrato vigente.

## 6. O que o PDV NÃO usa (reforço de fronteira de UI)

Por contrato (Pilar 1, §6), o PDV **não** utiliza Dashboard, cards gerenciais nem
gráficos. A interface é limpa, com grande área útil e operação por teclado. O
ambiente gerencial é responsabilidade do Dashboard/Admin, não do PDV.

---

## 7. Roadmap do PDV

> Esta seção contém **apenas funcionalidades futuras**. Nada aqui é contrato
> vigente. Itens com decisão de arquitetura associada ganham um ADR próprio.

| Item | Descrição | Estado | Decisão |
|------|-----------|--------|---------|
| **Operação omnichannel** | Unificar venda entre canais (loja física, online, pedidos externos) sobre o mesmo modelo de eventos do PDV. | Planejado | A definir (ADR futuro) |
| **Offline-first com sincronização posterior** | Evoluir o web rumo a offline-first com fila/outbox e reconciliação, hoje garantido só no `pdv-local`. | Planejado | Relacionado a [ADR-PDV-001](../adr/ADR-PDV-centro-de-gravidade.md) e [ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md](../ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md) |
| **Melhorias de performance** | Reduzir latência do caminho do bip (ACK perceptivo), cache de catálogo no browser, telemetria p50/p95. | Planejado | A definir conforme política de bip/preço (ADR-PDV-001, §3–4) |

> **Tema escuro — fora do roadmap (decisão final).** O PDV permanece **clean e
> em tema único claro**. A hipótese de tema escuro foi **rejeitada** em
> [ADR-PDV-002](../adr/ADR-PDV-tema-escuro.md); não há previsão de escuro. Um
> eventual tema escuro futuro exigiria um **novo** ADR.

> Quando um item do Roadmap for implementado, mover a descrição para a seção
> correspondente do contrato vigente (§1–6) e atualizar o ADR para *Aceito*.

---

## Referências

- [`docs/venda-golden-flow.md`](../venda-golden-flow.md) — fluxo de venda (congelado).
- [`docs/CIRCUITO_OPERACIONAL.md`](../CIRCUITO_OPERACIONAL.md) — circuito operacional do PDV.
- [`docs/SCAN_PIPELINE_STATE_MACHINE.md`](../SCAN_PIPELINE_STATE_MACHINE.md) — máquina de estados do scan.
- [`docs/CONTRATO_PIPELINE_BIP.md`](../CONTRATO_PIPELINE_BIP.md) — contrato do pipeline de bip.
- [`docs/GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md`](../GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md) — web vs. desktop.
- [`docs/adr/ADR-PDV-centro-de-gravidade.md`](../adr/ADR-PDV-centro-de-gravidade.md) — ADR-PDV-001.
- [`docs/adr/ADR-PDV-tema-escuro.md`](../adr/ADR-PDV-tema-escuro.md) — ADR-PDV-002 (tema escuro, **rejeitado**).
