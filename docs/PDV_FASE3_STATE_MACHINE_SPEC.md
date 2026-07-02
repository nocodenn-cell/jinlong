# PDV — Fase 3: Design Spec da Máquina de Estados (isolada, sem implementação)

| Campo | Valor |
|-------|-------|
| **Status** | Especificação formal — **não implementado** |
| **Escopo** | Frontend do caixa (`pdv-importados/app/caixa`), consumo de `PDVViewState` |
| **Fora de escopo** | Qualquer alteração de UI, backend, CI ou infraestrutura |
| **Objetivo** | Tornar o PDV determinístico: um único mapeamento estado → tela, sem inferência client-side |

Este documento é a especificação formal e executável da Fase 3. Não introduz código. Serve de contrato entre backend (fatos) e frontend (apresentação): o frontend implementa uma função pura `render(PDVViewState)`, nunca deriva estado por conta própria.

Relacionados: [`SCAN_PIPELINE_STATE_MACHINE.md`](./SCAN_PIPELINE_STATE_MACHINE.md) (mesma convenção de tabelas de transição), [`CIRCUITO_OPERACIONAL.md`](./CIRCUITO_OPERACIONAL.md), [`ADR-PDV-centro-de-gravidade.md`](./adr/ADR-PDV-centro-de-gravidade.md), [`docs/contracts/README.md`](./contracts/README.md) (RPCs versionadas referenciadas aqui).

---

## 0. Duas máquinas distintas — não confundir

O código hoje já expõe dois níveis de estado que **não devem ser fundidos** em um só enum:

| Nível | Fonte real hoje | Granularidade |
|-------|------------------|----------------|
| **Caixa (turno)** | `obter_status_caixa_operador` → `ABERTO \| FECHADO \| ERRO` ([`230_caixa_status_fechamento.sql`](../backend/supabase/migrations/230_caixa_status_fechamento.sql)) | Por operador/turno; vive fora de uma venda |
| **Venda (ticket)** | Carrinho em memória (`unifiedCartStore`) até o commit transacional em `finalizar_venda_transacional_canonica_v4` ([`243_...v4_captura.sql`](../backend/supabase/migrations/243_finalizar_venda_canonica_v4_captura.sql)); **a linha `vendas` só existe a partir do PASSO 2 dentro do RPC** | Por ticket em edição |

A máquina desta Fase 3 (`PDVSaleState`) governa o **nível venda**. O nível caixa é uma **precondição externa**: sem `caixa.status = 'ABERTO'`, o PDV inteiro fica travado em `IDLE` com ação primária "Abrir caixa" — isso não é um estado da venda, é um guard de entrada (§3.1).

Consequência de design: como hoje não existe coluna `vendas.status = 'SUSPENSA'` nem conceito de múltiplos tickets em espera no `unifiedCartStore`, **`SALE_SUSPENDED` é estado novo de sessão/cliente** (não uma linha de banco) até que exista uma decisão de persistência (ver §6.1). Esta spec não decide isso — apenas formaliza o contrato para quando for implementado.

---

## 1. Estados formais — `PDVSaleState`

```
IDLE → SALE_ACTIVE → SALE_SUSPENDED (opcional, cíclico)
                   ↘
                    PAYMENT_PENDING → PAYMENT_PROCESSING → COMPLETED → IDLE
```

| Estado | Definição | Existe linha em `vendas`? | Pode haver 2 ao mesmo tempo? |
|--------|-----------|------------------------------|-------------------------------|
| `IDLE` | Nenhum ticket em edição. Caixa pode estar aberto ou fechado (ver guard §3.1). | Não | — (estado único, não é lista) |
| `SALE_ACTIVE` | Carrinho com ≥1 item, em edição livre (scan, quantidade, desconto). | Não | Não — só 1 ticket ativo por terminal |
| `SALE_SUSPENDED` | Ticket colocado em espera pelo operador; carrinho persistido fora da tela ativa. | Não (client-side / storage local até decisão de persistência) | Sim — pode haver N tickets suspensos simultâneos |
| `PAYMENT_PENDING` | Carrinho fechado para edição; operador seleciona forma(s) de pagamento e confere totais. Ainda **reversível** (pode voltar a `SALE_ACTIVE`). | Não | Não |
| `PAYMENT_PROCESSING` | RPC `finalizar_venda_transacional_canonica_v4` em voo. **Não reversível por UI** — é uma chamada transacional em andamento. | Em construção (INSERT ocorre dentro do RPC) | Não |
| `COMPLETED` | RPC retornou `status = 'CONCLUIDA'`. Documento fiscal pode estar `pending`/`queued` (desacoplado — PASSO 6 do v4), isso **não** atrasa `COMPLETED`. | Sim | Não |

Estado adicional **não** modelado como estado da venda, e sim como **guard transversal** (ver §3.2): `SUSPENSAO_GLOBAL` (`vendas_suspensas = 'true'` em `configuracoes_gerais`, [`105_suspensao_vendas.sql`](../backend/supabase/migrations/105_suspensao_vendas.sql)). Isso é suspensão administrativa de **toda a loja**, ortogonal à suspensão de um ticket individual (`SALE_SUSPENDED`). Nomes parecidos, semânticas diferentes — não fundir.

---

## 2. Transições válidas e inválidas

### 2.1 Válidas

| De | Para | Gatilho (COMMAND) | Reversível? |
|----|------|--------------------|-------------|
| `IDLE` | `SALE_ACTIVE` | `CMD_ITEM_SCAN` \| `CMD_ITEM_ADD_MANUAL` (primeiro item) | — |
| `SALE_ACTIVE` | `SALE_ACTIVE` | `CMD_ITEM_SCAN` \| `CMD_ITEM_UPDATE_QTY` \| `CMD_ITEM_REMOVE` \| `CMD_DESCONTO_MANUAL_APLICAR` \| `CMD_DESCONTO_GERENTE_APLICAR` (self-loop, não muda estado) | — |
| `SALE_ACTIVE` | `SALE_SUSPENDED` | `CMD_SALE_SUSPEND` | Sim (→ `SALE_ACTIVE`) |
| `SALE_SUSPENDED` | `SALE_ACTIVE` | `CMD_SALE_RESUME` | Sim |
| `SALE_ACTIVE` | `PAYMENT_PENDING` | `CMD_SALE_CHECKOUT_START` (requer `itens.length > 0`) | Sim (→ `SALE_ACTIVE`) |
| `PAYMENT_PENDING` | `SALE_ACTIVE` | `CMD_SALE_CHECKOUT_CANCEL` | — |
| `PAYMENT_PENDING` | `PAYMENT_PROCESSING` | `CMD_SALE_FINALIZE` → invoca `finalizar_venda_transacional_canonica_v4` | **Não** |
| `PAYMENT_PROCESSING` | `COMPLETED` | Resposta RPC `status = 'CONCLUIDA'` | — (terminal) |
| `PAYMENT_PROCESSING` | `PAYMENT_PENDING` | Resposta RPC com erro **recuperável** (ex.: `FINALIZAR_VENDA_CANONICA_PAGAMENTOS_DIVERGENTES`, `..._PRECO_DIVERGENTE`) | Sim — mas é uma **nova** entrada em `PAYMENT_PENDING`, não um "desfazer" |
| `COMPLETED` | `IDLE` | `CMD_SALE_NEW` (automático ou clique "Nova venda") | — (terminal → reset) |

### 2.2 Inválidas (proibidas explicitamente)

| Transição | Por que é proibida |
|-----------|---------------------|
| `PAYMENT_PROCESSING` → qualquer coisa por ação do operador (cancelar, voltar, editar) | O RPC é transacional e possui `pg_advisory_xact_lock` por `venda_id` — uma segunda tentativa concorrente não cancela a primeira, ela serializa atrás dela. UI não deve oferecer saída aqui; só reagir à resposta. |
| `COMPLETED` → `PAYMENT_PENDING` / `SALE_ACTIVE` | Venda concluída é imutável (trigger `vendas_caixa_imutabilidade`, [`206_...trigger.sql`](../backend/supabase/migrations/206_vendas_caixa_imutabilidade_trigger.sql)). "Editar venda concluída" é outro fluxo (estorno/cancelamento), não uma transição desta máquina. |
| `SALE_SUSPENDED` → `PAYMENT_PENDING` / `PAYMENT_PROCESSING` diretamente | Um ticket suspenso deve **sempre** passar por `SALE_ACTIVE` (`CMD_SALE_RESUME`) antes de ir a pagamento — evita checkout de um carrinho que o operador não revisou nesta sessão. |
| `IDLE` → `PAYMENT_PENDING` / `PAYMENT_PROCESSING` / `COMPLETED` | Não existe checkout sem carrinho ativo com item. |
| Duas instâncias simultâneas de `SALE_ACTIVE`, `PAYMENT_PENDING` ou `PAYMENT_PROCESSING` no mesmo terminal | Um terminal processa **um** ticket em primeiro plano por vez — é a base da regra "zero concorrência visual" (§4.3). Múltiplos tickets só coexistem em `SALE_SUSPENDED`. |
| `CMD_SALE_FINALIZE` chamado duas vezes para o mesmo `venda_id` sem nova transição `PAYMENT_PENDING` → `PAYMENT_PROCESSING` | O RPC já é idempotente no banco (early-return se `status = 'CONCLUIDA'`), mas a UI não deve depender disso: o botão "Finalizar" **desabilita** ao entrar em `PAYMENT_PROCESSING` (ver §4.1). |

---

## 3. Guards transversais (fora da máquina de estados, mas bloqueiam transições)

### 3.1 Guard de caixa

`caixa.status` (RPC `obter_status_caixa_operador`) é avaliado **antes** de qualquer transição para `SALE_ACTIVE`:

| `caixa.status` | Efeito |
|------------------|--------|
| `ABERTO` | Transições normais permitidas |
| `FECHADO` | `IDLE` é o único estado alcançável; ação primária única = "Abrir caixa" |
| `ERRO` | `IDLE` com mensagem de erro; nenhuma ação de venda disponível |

### 3.2 Guard de suspensão global (`vendas_suspensas`)

Fonte: `configuracoes_para_caixa_web()` → chaves `vendas_suspensas` / `motivo_suspensao` ([`105_suspensao_vendas.sql`](../backend/supabase/migrations/105_suspensao_vendas.sql)).

| `vendas_suspensas` | Perfil do operador | Efeito na máquina |
|----------------------|---------------------|---------------------|
| `false` | qualquer | Sem efeito |
| `true` | `OPERADOR` | Bloqueia a transição `PAYMENT_PENDING → PAYMENT_PROCESSING` (equivalente client-side ao `FINALIZAR_VENDA_VENDAS_SUSPENSAS` do RPC v3). `SALE_ACTIVE` e `PAYMENT_PENDING` continuam acessíveis — o carrinho pode ser montado, só não finalizado — e a UI expõe `motivo_suspensao` em vez do botão "Finalizar". |
| `true` | `GERENTE` \| `DONO` \| `ADMIN` | Sem efeito — a RPC libera esses perfis (`v_perfil NOT IN (...)`); a UI deve espelhar essa exceção, nunca decidir por conta própria quem passa. |

Este guard **nunca** transiciona a venda para `SALE_SUSPENDED`. É um bloqueio de comando, não um estado de venda — reforça a distinção do §0.

---

## 4. Contrato COMMAND → STATE

Cada RPC/comando existente ou planejado é mapeado 1:1 a exatamente uma transição válida. Nenhum comando infere estado a partir de heurística de UI (ex.: "se o carrinho tem itens, deve estar ativo" — errado; o estado é a fonte, o carrinho é derivado dele, nunca o contrário).

| COMMAND | RPC / origem real | Estado de origem exigido | Estado resultante | Em caso de erro |
|---------|--------------------|-----------------------------|----------------------|-------------------|
| `CMD_ITEM_SCAN` | pipeline de bip (`scan-pipeline.ts`) | `IDLE` \| `SALE_ACTIVE` | `SALE_ACTIVE` | Permanece no estado de origem; erro é exibido, não muda estado |
| `CMD_ITEM_ADD_MANUAL` | ação local do carrinho | `IDLE` \| `SALE_ACTIVE` | `SALE_ACTIVE` | idem |
| `CMD_ITEM_UPDATE_QTY` / `CMD_ITEM_REMOVE` | ação local do carrinho | `SALE_ACTIVE` | `SALE_ACTIVE` | idem |
| `CMD_DESCONTO_GERENTE_APLICAR` | `validar_gerente_desconto` (token) | `SALE_ACTIVE` | `SALE_ACTIVE` | idem |
| `CMD_SALE_SUSPEND` | **novo** (sem RPC hoje — client/local até decisão §6.1) | `SALE_ACTIVE` | `SALE_SUSPENDED` | N/A (operação local, não falha) |
| `CMD_SALE_RESUME` | **novo** | `SALE_SUSPENDED` | `SALE_ACTIVE` | N/A |
| `CMD_SALE_CHECKOUT_START` | validação local (`itens.length > 0`) | `SALE_ACTIVE` | `PAYMENT_PENDING` | Se carrinho vazio, comando é rejeitado antes de qualquer transição (guard client-side, não é erro de RPC) |
| `CMD_SALE_CHECKOUT_CANCEL` | ação local | `PAYMENT_PENDING` | `SALE_ACTIVE` | N/A |
| `CMD_SALE_FINALIZE` | `finalizar_venda_transacional_canonica_v4` | `PAYMENT_PENDING` | `PAYMENT_PROCESSING` (imediato, otimista) → `COMPLETED` \| `PAYMENT_PENDING` (conforme resposta) | Código de erro do RPC determina destino — ver tabela 4.1 |
| `CMD_SALE_NEW` | reset local | `COMPLETED` | `IDLE` | N/A |
| `CMD_CAIXA_ABRIR` | `abrir_caixa_operador` (fora desta máquina — guard §3.1) | `IDLE` (com `caixa.status = FECHADO`) | `IDLE` (com `caixa.status = ABERTO`) | Permanece `FECHADO` |

### 4.1 Classificação de erros do `CMD_SALE_FINALIZE`

Todo código de exceção do RPC v4 cai em uma de duas classes — a UI **não** interpreta a string do erro, apenas consulta esta tabela fixa:

| Classe | Códigos (prefixo `FINALIZAR_VENDA_CANONICA_*`) | Destino |
|--------|--------------------------------------------------|---------|
| **Recuperável** (dados do ticket mudaram, operador pode corrigir e tentar de novo) | `PRECO_DIVERGENTE`, `PRECO_ACIMA_REFERENCIA`, `TIPO_PRECO_DIVERGENTE`, `PAGAMENTOS_DIVERGENTES`, `TOTAIS_DIVERGENTES`, `VALOR_PAGAMENTO_INVALIDO`, `FORMA_PAGAMENTO_INVALIDA`, `DESCONTO_GERENTE_LIMITE`, `TOKEN_GERENTE_INVALIDO`, `TOKEN_GERENTE_JA_USADO`, `GERENTE_TOKEN_OBRIGATORIO`, `GERENTE_PERCENTUAL_INVALIDO`, `ITENS_INVALIDOS`, `ITEM_INVALIDO`, `PRECO_INVALIDO`, `PRECO_NAO_VALIDADO` | `PAYMENT_PENDING` |
| **Bloqueante de estoque/infra** (não é o ticket que está errado; requer decisão fora do fluxo de pagamento) | `ESTOQUE:*` | `PAYMENT_PENDING`, mas a UI **deve** desabilitar novo `CMD_SALE_FINALIZE` até o operador voltar a `SALE_ACTIVE` e revisar a linha afetada — não é auto-retry |
| **Sessão/autorização** | `OPERADOR_OBRIGATORIO` | `IDLE` (força reautenticação — não é erro de venda) |
| **Suspensão global** | `FINALIZAR_VENDA_VENDAS_SUSPENSAS` (só na v3; v4 não a reintroduziu — guard vira responsabilidade do client, §3.2) | `PAYMENT_PENDING`, ação primária removida, mensagem = `motivo_suspensao` |

Em nenhum caso um erro de `CMD_SALE_FINALIZE` leva a `SALE_SUSPENDED` — suspensão é decisão deliberada do operador, nunca consequência automática de falha.

---

## 5. `PDVViewState` — fonte única para o frontend

O frontend **não** deriva UI a partir de `PDVSaleState` + fragmentos soltos (carrinho, config, caixa) separadamente. Um único seletor produz `PDVViewState`; todo componente de tela consome exclusivamente essa forma.

```ts
type PDVViewState = {
  // --- identidade do estado ---
  saleState: 'IDLE' | 'SALE_ACTIVE' | 'SALE_SUSPENDED'
           | 'PAYMENT_PENDING' | 'PAYMENT_PROCESSING' | 'COMPLETED'

  // --- guards resolvidos (já avaliados, não recalculados na view) ---
  caixaStatus: 'ABERTO' | 'FECHADO' | 'ERRO'
  suspensaoGlobal: { ativa: boolean; motivo: string | null; afetaOperadorAtual: boolean }

  // --- dados do ticket em primeiro plano (null fora de SALE_ACTIVE/PAYMENT_*) ---
  activeTicket: {
    itens: ItemCarrinho[]
    totalBruto: number
    totalDesconto: number
    totalLiquido: number
    descontoGerente: { percentual: number; token: string | null } | null
  } | null

  // --- tickets suspensos (só populado em qualquer estado; lista pode ser não-vazia mesmo em SALE_ACTIVE) ---
  suspendedTickets: Array<{ id: string; suspendedAt: string; totalLiquido: number; itemCount: number }>

  // --- resultado da última finalização (só em COMPLETED) ---
  lastCompletedSale: {
    vendaId: string
    eventId: string
    documentoFiscal: 'queued' | 'pending' | 'error' | null
  } | null

  // --- erro ativo, já classificado (§4.1) — nunca string crua de exceção ---
  activeError: { code: string; classe: 'recuperavel' | 'bloqueante' | 'sessao'; mensagem: string } | null

  // --- ação primária derivada (ver §6) — a view NUNCA decide isso sozinha ---
  primaryAction: PDVAction | null
  secondaryActions: PDVAction[]
}

type PDVAction = {
  command: string   // um dos CMD_* da tabela §4
  label: string
  enabled: boolean
  requiresConfirmation: boolean
}
```

Regra dura: se um componente precisa de um dado que não está em `PDVViewState`, o dado é adicionado ao contrato — nunca lido de uma store paralela dentro do componente de tela. Hooks de baixo nível (`useCartStore`, `useCaixaStatus`) só podem ser consumidos pelo **seletor** que produz `PDVViewState`, nunca diretamente por componentes de apresentação.

---

## 6. Regras de UI

### 6.1 Hierarquia de ação — single primary action por estado

| `saleState` | `primaryAction.command` | Ações secundárias permitidas |
|-------------|---------------------------|-------------------------------|
| `IDLE` (caixa `FECHADO`) | `CMD_CAIXA_ABRIR` | — |
| `IDLE` (caixa `ABERTO`) | `CMD_ITEM_SCAN` (foco no input de bip) | `CMD_SALE_RESUME` (se `suspendedTickets.length > 0`) |
| `SALE_ACTIVE` | `CMD_SALE_CHECKOUT_START` | `CMD_ITEM_REMOVE`, `CMD_DESCONTO_GERENTE_APLICAR`, `CMD_SALE_SUSPEND` |
| `SALE_SUSPENDED` (visualizando lista) | `CMD_SALE_RESUME` (por ticket selecionado) | — |
| `PAYMENT_PENDING` | `CMD_SALE_FINALIZE` (ou removido/desabilitado sob guard §3.2) | `CMD_SALE_CHECKOUT_CANCEL` |
| `PAYMENT_PROCESSING` | **nenhuma** — todas as ações desabilitadas | — |
| `COMPLETED` | `CMD_SALE_NEW` | (visualizar/imprimir documento fiscal, se disponível) |

Exatamente um botão tem destaque visual primário por tela. Nunca dois botões de mesma proeminência competindo (ex.: "Finalizar" e "Cancelar" não podem ter o mesmo peso visual — cancelar é sempre secundário).

### 6.2 Progressive disclosure

- `suspendedTickets` só aparece expandido quando o operador solicita explicitamente (ação secundária em `IDLE`/`SALE_ACTIVE`); nunca ocupa espaço permanente na tela de venda ativa.
- Desconto de gerente (`CMD_DESCONTO_GERENTE_APLICAR`) só expõe campo de token **depois** que o operador indica intenção de aplicar desconto — não é campo sempre visível.
- Detalhes de erro bloqueante de estoque (`ESTOQUE:*`) mostram a linha afetada expandida; as demais linhas do carrinho permanecem colapsadas/resumidas.
- `lastCompletedSale.documentoFiscal` em `pending`/`queued` não bloqueia nem expande nada por padrão — é um indicador discreto, consultável sob demanda (fiscal é desacoplado da conclusão da venda, PASSO 6 do v4).

### 6.3 Zero concorrência visual

- Nunca renderizar simultaneamente controles de dois `saleState` diferentes (ex.: grade de scan de `SALE_ACTIVE` **e** formulário de pagamento de `PAYMENT_PENDING` não coexistem na mesma viewport).
- `PAYMENT_PROCESSING` é uma tela bloqueante dedicada (spinner/estado de espera) — não um overlay sobre `PAYMENT_PENDING`. Isso torna visualmente impossível clicar em "Finalizar" duas vezes, reforçando a proibição da tabela §2.2.
- Trocar de ticket suspenso para outro (`CMD_SALE_RESUME` em um ticket enquanto outro está em `SALE_ACTIVE`) é proibido pela máquina (§2.2, "duas instâncias simultâneas"): o resume implícito primeiro suspende o ticket atual via `CMD_SALE_SUSPEND`, depois resume o escolhido — dois comandos sequenciais, nunca uma transição direta "trocar".

---

## 7. Rastreabilidade — fluxos reais incorporados

| Fluxo real | Arquivo | Como entra nesta spec |
|------------|---------|-------------------------|
| Suspensão global de vendas | [`105_suspensao_vendas.sql`](../backend/supabase/migrations/105_suspensao_vendas.sql) | Guard §3.2 — bloqueia comando, não é estado de venda |
| Finalização transacional | [`243_finalizar_venda_canonica_v4_captura.sql`](../backend/supabase/migrations/243_finalizar_venda_canonica_v4_captura.sql) | `CMD_SALE_FINALIZE` (§4) e classificação de erro (§4.1) |
| Status de caixa / fechamento | [`230_caixa_status_fechamento.sql`](../backend/supabase/migrations/230_caixa_status_fechamento.sql) | Guard §3.1 |
| Imutabilidade de venda concluída | [`206_vendas_caixa_imutabilidade_trigger.sql`](../backend/supabase/migrations/206_vendas_caixa_imutabilidade_trigger.sql) | Transição proibida `COMPLETED → *` (§2.2) |
| Carrinho pré-transacional | [`shared-core/src/stores/unifiedCartStore.ts`](../shared-core/src/stores/unifiedCartStore.ts) | Base de `activeTicket` em `PDVViewState`; confirma que hoje só existe 1 carrinho — `SALE_SUSPENDED` multi-ticket é extensão nova (§0) |

---

## 8. O que esta spec explicitamente não decide

1. **Persistência de `SALE_SUSPENDED`**: local (IndexedDB/localStorage), servidor (nova tabela `vendas_em_espera`) ou híbrido. Requer ADR próprio antes de implementação — fora do escopo desta Fase 3.
2. **RPCs novas para `CMD_SALE_SUSPEND`/`CMD_SALE_RESUME`**: hoje não existem; a tabela §4 as marca como "novo" propositalmente.
3. **Qualquer componente React, hook ou arquivo de UI**: esta spec define o contrato consumido pela UI, não a implementação da UI.
4. **Alteração da RPC v4 ou de qualquer migration**: nenhuma mudança de backend é proposta ou necessária para este documento existir.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-07-02 | Rascunho inicial — Fase 3 como design spec isolada, sem implementação. |
