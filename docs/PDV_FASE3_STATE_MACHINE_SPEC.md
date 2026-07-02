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

### 0.1 Regra estrutural — real antes de ideal

O sistema **real** (o que já existe: `unifiedCartStore` com um único carrinho, sem coluna `vendas.status = 'SUSPENSA'`, sem conceito de múltiplos tickets em espera) sempre vem antes do sistema **ideal** (evolução futura). Por isso:

- `PDVSaleState` (§1) contém **apenas** os 5 estados compatíveis com o sistema atual.
- `SALE_SUSPENDED` **não faz parte do domínio atual** e foi retirado da máquina executável. Está documentado isoladamente no **Apêndice A** como extensão futura não implementada — não é um estado, não tem transições válidas, não aparece em `PDVViewState`.

---

## 1. Estados formais — `PDVSaleState`

Apenas estados compatíveis com o sistema **atual**. Nenhum estado aqui pressupõe capacidade que não existe hoje.

```
IDLE → SALE_ACTIVE → PAYMENT_PENDING → PAYMENT_PROCESSING → COMPLETED → IDLE
```

| Estado | Definição | Existe linha em `vendas`? | Pode haver 2 ao mesmo tempo? |
|--------|-----------|------------------------------|-------------------------------|
| `IDLE` | Nenhum ticket em edição. Caixa pode estar aberto ou fechado (ver guard §3.1). | Não | — (estado único, não é lista) |
| `SALE_ACTIVE` | Carrinho com ≥1 item, em edição livre (scan, quantidade, desconto). | Não | Não — só 1 ticket ativo por terminal (único carrinho, `unifiedCartStore`) |
| `PAYMENT_PENDING` | Carrinho fechado para edição; operador seleciona forma(s) de pagamento e confere totais. Ainda **reversível** (pode voltar a `SALE_ACTIVE`). | Não | Não |
| `PAYMENT_PROCESSING` | RPC `finalizar_venda_transacional_canonica_v4` em voo. **Não reversível por UI** — é uma chamada transacional em andamento. | Em construção (INSERT ocorre dentro do RPC) | Não |
| `COMPLETED` | RPC retornou `status = 'CONCLUIDA'`. Documento fiscal pode estar `pending`/`queued` (desacoplado — PASSO 6 do v4), isso **não** atrasa `COMPLETED`. | Sim | Não |

❌ **Explícito:** `SALE_SUSPENDED` **não** faz parte deste enum. Não existe hoje suporte a múltiplos tickets, nem coluna de status para isso. Ver **Apêndice A** — extensão futura não implementada, mantida fora da máquina executável para não introduzir over-design.

Estado adicional **não** modelado como estado da venda, e sim como **guard transversal** (ver §3.2): `SUSPENSAO_GLOBAL` (`vendas_suspensas = 'true'` em `configuracoes_gerais`, [`105_suspensao_vendas.sql`](../backend/supabase/migrations/105_suspensao_vendas.sql)). Isso é suspensão administrativa de **toda a loja**, ortogonal ao conceito de ticket individual em espera (Apêndice A). Nomes parecidos, semânticas diferentes — não fundir.

---

## 2. Transições válidas e inválidas

### 2.1 Válidas

| De | Para | Gatilho (COMMAND) | Reversível? |
|----|------|--------------------|-------------|
| `IDLE` | `SALE_ACTIVE` | `CMD_ITEM_SCAN` \| `CMD_ITEM_ADD_MANUAL` (primeiro item) | — |
| `SALE_ACTIVE` | `SALE_ACTIVE` | `CMD_ITEM_SCAN` \| `CMD_ITEM_UPDATE_QTY` \| `CMD_ITEM_REMOVE` \| `CMD_DESCONTO_MANUAL_APLICAR` \| `CMD_DESCONTO_GERENTE_APLICAR` (self-loop, não muda estado) | — |
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
| `IDLE` → `PAYMENT_PENDING` / `PAYMENT_PROCESSING` / `COMPLETED` | Não existe checkout sem carrinho ativo com item. |
| Qualquer transição para/de `SALE_SUSPENDED` | Estado **não existe** no domínio atual (§1). Qualquer comando `CMD_SALE_SUSPEND`/`CMD_SALE_RESUME` é **fora de escopo** desta máquina — ver Apêndice A. |
| Duas instâncias simultâneas de `SALE_ACTIVE`, `PAYMENT_PENDING` ou `PAYMENT_PROCESSING` no mesmo terminal | Um terminal processa **um** ticket em primeiro plano por vez, sempre — é a base da regra "zero concorrência visual" (§6.3). O sistema atual não tem noção de tickets em paralelo. |
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

Este guard **nunca** cria um estado novo fora do enum de §1. É um bloqueio de comando (impede `CMD_SALE_FINALIZE`), não um estado de venda — reforça a distinção do §0. Não confundir com o conceito pretendido de ticket individual em espera, que está isolado no Apêndice A e não existe no domínio real.

---

## 4. Contrato COMMAND → STATE

Cada RPC/comando existente ou planejado é mapeado 1:1 a exatamente uma transição válida. Nenhum comando infere estado a partir de heurística de UI (ex.: "se o carrinho tem itens, deve estar ativo" — errado; o estado é a fonte, o carrinho é derivado dele, nunca o contrário).

| COMMAND | RPC / origem real | Estado de origem exigido | Estado resultante | Em caso de erro |
|---------|--------------------|-----------------------------|----------------------|-------------------|
| `CMD_ITEM_SCAN` | pipeline de bip (`scan-pipeline.ts`) | `IDLE` \| `SALE_ACTIVE` | `SALE_ACTIVE` | Permanece no estado de origem; erro é exibido, não muda estado |
| `CMD_ITEM_ADD_MANUAL` | ação local do carrinho | `IDLE` \| `SALE_ACTIVE` | `SALE_ACTIVE` | idem |
| `CMD_ITEM_UPDATE_QTY` / `CMD_ITEM_REMOVE` | ação local do carrinho | `SALE_ACTIVE` | `SALE_ACTIVE` | idem |
| `CMD_DESCONTO_GERENTE_APLICAR` | `validar_gerente_desconto` (token) | `SALE_ACTIVE` | `SALE_ACTIVE` | idem |
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

Em nenhum caso um erro de `CMD_SALE_FINALIZE` cria um estado novo fora do enum de §1 — toda resposta de erro cai em `PAYMENT_PENDING` ou `IDLE`, nunca inventa um estado intermediário não modelado.

📌 **Regra estrutural (Fase 0.3):** toda mutação RPC precisa retornar o estado final completo e explícito. Nenhum comando desta tabela é "fire and forget" — o frontend nunca infere o novo `saleState` a partir do sucesso/falha de uma chamada; ele lê o estado retornado.

---

## 5. `PDVViewState` — fonte única para o frontend

O frontend **não** deriva UI a partir de `PDVSaleState` + fragmentos soltos (carrinho, config, caixa) separadamente. Um único seletor produz `PDVViewState`; todo componente de tela consome exclusivamente essa forma.

```ts
type PDVViewState = {
  // --- identidade do estado (5 valores — sem SALE_SUSPENDED, ver Apêndice A) ---
  saleState: 'IDLE' | 'SALE_ACTIVE'
           | 'PAYMENT_PENDING' | 'PAYMENT_PROCESSING' | 'COMPLETED'

  // --- guards resolvidos (já avaliados, não recalculados na view) ---
  caixaStatus: 'ABERTO' | 'FECHADO' | 'ERRO'
  suspensaoGlobal: { ativa: boolean; motivo: string | null; afetaOperadorAtual: boolean }

  // --- dados do único ticket ativo (null fora de SALE_ACTIVE/PAYMENT_*) ---
  items: ItemCarrinho[]
  total: {
    bruto: number
    desconto: number
    liquido: number
    descontoGerente: { percentual: number; token: string | null } | null
  }

  // --- resultado da última finalização (só em COMPLETED) ---
  lastCompletedSale: {
    vendaId: string
    eventId: string
    documentoFiscal: 'queued' | 'pending' | 'error' | null
  } | null

  // --- erro ativo, já classificado (§4.1) — nunca string crua de exceção ---
  activeError: { code: string; classe: 'recuperavel' | 'bloqueante' | 'sessao'; mensagem: string } | null

  // --- ações permitidas no estado atual (ver §6) — a view NUNCA decide isso sozinha ---
  allowedActions: PDVAction[]
  primaryAction: PDVAction | null
}

type PDVAction = {
  command: string   // um dos CMD_* da tabela §4
  label: string
  enabled: boolean
  requiresConfirmation: boolean
}
```

`items` e `total` substituem o antigo par `activeTicket`/`suspendedTickets`: como só existe um carrinho no domínio real (§0.1), não há necessidade de um wrapper `activeTicket | null` nem de uma lista de tickets em espera. `allowedActions` já vem filtrada pelo backend/seletor — `primaryAction` é sempre o primeiro elemento com `enabled: true` e maior prioridade, nunca uma decisão de UI.

Regra dura: se um componente precisa de um dado que não está em `PDVViewState`, o dado é adicionado ao contrato — nunca lido de uma store paralela dentro do componente de tela. Hooks de baixo nível (`useCartStore`, `useCaixaStatus`) só podem ser consumidos pelo **seletor** que produz `PDVViewState`, nunca diretamente por componentes de apresentação.

---

## 6. Regras de UI

### 6.1 Hierarquia de ação — single primary action por estado

| `saleState` | `primaryAction.command` | Ações secundárias permitidas |
|-------------|---------------------------|-------------------------------|
| `IDLE` (caixa `FECHADO`) | `CMD_CAIXA_ABRIR` | — |
| `IDLE` (caixa `ABERTO`) | `CMD_ITEM_SCAN` (foco no input de bip) | — |
| `SALE_ACTIVE` | `CMD_SALE_CHECKOUT_START` | `CMD_ITEM_REMOVE`, `CMD_DESCONTO_GERENTE_APLICAR` |
| `PAYMENT_PENDING` | `CMD_SALE_FINALIZE` (ou removido/desabilitado sob guard §3.2) | `CMD_SALE_CHECKOUT_CANCEL` |
| `PAYMENT_PROCESSING` | **nenhuma** — todas as ações desabilitadas | — |
| `COMPLETED` | `CMD_SALE_NEW` | (visualizar/imprimir documento fiscal, se disponível) |

Exatamente um botão tem destaque visual primário por tela. Nunca dois botões de mesma proeminência competindo (ex.: "Finalizar" e "Cancelar" não podem ter o mesmo peso visual — cancelar é sempre secundário).

### 6.2 Progressive disclosure

- Desconto de gerente (`CMD_DESCONTO_GERENTE_APLICAR`) só expõe campo de token **depois** que o operador indica intenção de aplicar desconto — não é campo sempre visível.
- Detalhes de erro bloqueante de estoque (`ESTOQUE:*`) mostram a linha afetada expandida; as demais linhas do carrinho permanecem colapsadas/resumidas.
- `lastCompletedSale.documentoFiscal` em `pending`/`queued` não bloqueia nem expande nada por padrão — é um indicador discreto, consultável sob demanda (fiscal é desacoplado da conclusão da venda, PASSO 6 do v4).

### 6.3 Zero concorrência visual

- Nunca renderizar simultaneamente controles de dois `saleState` diferentes (ex.: grade de scan de `SALE_ACTIVE` **e** formulário de pagamento de `PAYMENT_PENDING` não coexistem na mesma viewport).
- `PAYMENT_PROCESSING` é uma tela bloqueante dedicada (spinner/estado de espera) — não um overlay sobre `PAYMENT_PENDING`. Isso torna visualmente impossível clicar em "Finalizar" duas vezes, reforçando a proibição da tabela §2.2.
- Como só existe um carrinho no domínio real (§0.1), não há problema de "trocar de ticket" a resolver nesta fase — a UI sempre renderiza no máximo uma tela de venda ativa por terminal.

---

## 7. Rastreabilidade — fluxos reais incorporados

| Fluxo real | Arquivo | Como entra nesta spec |
|------------|---------|-------------------------|
| Suspensão global de vendas | [`105_suspensao_vendas.sql`](../backend/supabase/migrations/105_suspensao_vendas.sql) | Guard §3.2 — bloqueia comando, não é estado de venda |
| Finalização transacional | [`243_finalizar_venda_canonica_v4_captura.sql`](../backend/supabase/migrations/243_finalizar_venda_canonica_v4_captura.sql) | `CMD_SALE_FINALIZE` (§4) e classificação de erro (§4.1) |
| Status de caixa / fechamento | [`230_caixa_status_fechamento.sql`](../backend/supabase/migrations/230_caixa_status_fechamento.sql) | Guard §3.1 |
| Imutabilidade de venda concluída | [`206_vendas_caixa_imutabilidade_trigger.sql`](../backend/supabase/migrations/206_vendas_caixa_imutabilidade_trigger.sql) | Transição proibida `COMPLETED → *` (§2.2) |
| Carrinho pré-transacional | [`shared-core/src/stores/unifiedCartStore.ts`](../shared-core/src/stores/unifiedCartStore.ts) | Base de `items`/`total` em `PDVViewState`; confirma que hoje só existe 1 carrinho — não há estado real de multi-ticket (ver Apêndice A) |

---

## 8. O que esta spec explicitamente não decide

1. **Se/quando implementar `SALE_SUSPENDED`**: ver Apêndice A. Requer ADR próprio (persistência, RPCs novas) antes de entrar no enum de §1 — fora do escopo desta Fase 3.
2. **Qualquer componente React, hook ou arquivo de UI**: esta spec define o contrato consumido pela UI, não a implementação da UI.
3. **Alteração da RPC v4 ou de qualquer migration**: nenhuma mudança de backend é proposta ou necessária para este documento existir.
4. **Fases 1–6 do roadmap executável** (§9): esta spec cobre Fase 0 (modelagem do estado real). As fases seguintes — alinhamento do backend, UI shell, engine de estado no frontend, admin mode, simplificação UX, testes operacionais — são trabalho subsequente, não coberto aqui.

---

## 9. Alinhamento com o roadmap Fase 3 (índice, não execução)

Este documento entrega integralmente a **Fase 0 — Modelagem do estado real** do roadmap executável:

| Sub-fase | Entregue nesta spec |
|----------|------------------------|
| 0.1 State machine real | §1 — 5 estados, `SALE_SUSPENDED` explicitamente fora do domínio |
| 0.2 Transições formais | §2 — válidas e inválidas |
| 0.3 Command → State contract | §4 — RPC mapeado 1:1, regra "toda mutação retorna estado completo" |
| 0.4 `PDVViewState` | §5 — fonte única, sem inferência local |

As fases seguintes do roadmap (não cobertas aqui, na ordem obrigatória do roadmap):

1. Fase 1 — Consistência do backend (RPC sempre retorna estado final explícito; eliminar fire-and-forget). Auditoria + contrato-alvo em [`PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md`](./PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md) — ainda sem migrations aplicadas.
2. Fase 2 — Frontend shell (UI burra: `OperatorView`, `InputScanner`, `SaleList`, `TotalPanel`, `PaymentButton`).
3. Fase 3 — Engine de estado no frontend (`SaleStateMachine.ts`, `useSaleState()`).
4. Fase 4 — Admin mode isolado (fora do fluxo operacional, acesso por hotkey/senha).
5. Fase 5 — Simplificação UX final (consolidação das regras já formalizadas em §6).
6. Fase 6 — Testes operacionais (stress test, falha de rede, retry de pagamento, etc.).

Nenhuma dessas fases é implementada por este documento — permanecem como próximos passos, na ordem acima.

---

## Apêndice A — `SALE_SUSPENDED` (extensão futura, não implementada)

Marcado explicitamente como **fora do domínio atual** (§0.1, §1). Mantido aqui apenas para que uma evolução futura não exija retrabalho de nomenclatura ou redesenho de contrato — **não é uma proposta ativa** e não deve ser implementado junto com as Fases 0–6 acima sem um ADR específico.

- **Definição pretendida**: ticket colocado em espera pelo operador; carrinho persistido fora da tela ativa; múltiplos tickets suspensos podem coexistir.
- **Por que não está no domínio real hoje**: `unifiedCartStore` sustenta um único carrinho; não existe coluna `vendas.status = 'SUSPENSA'`; a única "suspensão" que existe no backend é a suspensão **global** de vendas (`vendas_suspensas`, [`105_suspensao_vendas.sql`](../backend/supabase/migrations/105_suspensao_vendas.sql)), que é administrativa e não tem relação com um ticket individual.
- **Decisões pendentes antes de qualquer implementação**: modelo de persistência (client-side vs. tabela nova `vendas_em_espera` vs. híbrido); RPCs `CMD_SALE_SUSPEND`/`CMD_SALE_RESUME`; regra de transição — um ticket suspenso deveria sempre passar por `SALE_ACTIVE` antes de ir a `PAYMENT_PENDING`, nunca pular direto para pagamento.
- **Gatilho para promover isto a estado real**: abertura de ADR próprio + necessidade operacional confirmada (ex.: fila de clientes, troca de atendimento) — não antes disso.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-07-02 | Rascunho inicial — Fase 3 como design spec isolada, sem implementação. |
| 2026-07-02 | Revisão: `SALE_SUSPENDED` removido da máquina executável e do `PDVViewState`; documentado como extensão futura isolada (Apêndice A), conforme roadmap Fase 0 ("real antes de ideal"). Adicionado §9 de alinhamento com as fases 1–6 do roadmap (não executadas). |
