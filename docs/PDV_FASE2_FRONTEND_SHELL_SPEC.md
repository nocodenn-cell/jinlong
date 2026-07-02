# PDV — Fase 2: Frontend Shell / UI Burra (design spec, sem implementação)

| Campo | Valor |
|-------|-------|
| **Status** | Especificação formal — **nenhum componente React é criado ou alterado nesta rodada** |
| **Escopo** | Arquitetura do shell de UI do caixa: árvore de componentes, contrato de props, regras de "UI burra" |
| **Fora de escopo** | Código React real, ligação com o backend (que ainda não implementa o contrato da Fase 1), admin mode, testes, CI/infra |
| **Pré-requisitos** | [`PDV_FASE3_STATE_MACHINE_SPEC.md`](./PDV_FASE3_STATE_MACHINE_SPEC.md) (Fase 0 — `PDVSaleState`/`PDVViewState`/COMMAND→STATE), [`PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md`](./PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md) (Fase 1 — contrato-alvo do backend, ainda não implementado) |

**Regra de ouro desta fase:** a UI não decide fluxo, não mantém estado crítico, apenas renderiza `PDVViewState`. Um componente que guarda em `useState` um dado que também existe (ou deveria existir) em `PDVViewState` está duplicando a fonte da verdade — isso é a violação central que esta fase existe para impedir.

---

## 0. Realidade atual — por que este documento existe

`pdv-importados/app/caixa/CaixaPageClient.tsx` tem **1401 linhas** e mais de **25 `useState`** no componente raiz, incluindo (achados por leitura direta, `CaixaPageClient.tsx:143-183`):

- Estado de negócio que deveria vir do backend: `finalizando`, `processandoCaixa`, `validandoGerente`, `gerenteValidadoAte`, `gerenteToken`, `maxDescontoGerentePercentual`, `descontoGerentePercentual`, `metodoPagamento`.
- Estado de configuração buscado e cacheado localmente: `configCaixaWeb`, `limiteSangriaSemGerente`, `carregandoRegras`.
- Estado de UI pura (legítimo mesmo no shell-alvo): `codigo` (input do scanner), `summaryCollapsed`, `abaPdvAtiva`, `somFeedbackAtivo`.
- Estado de modais coordenado manualmente: `gerenteModalAberto`, `movimentacaoModalTipo`, `acaoMovimentacao`, `confirmacaoPendente`, `reimprimirModalAberto`.

Isso é o oposto do "UI burra": o componente decide fluxo (quando abrir cada modal, quando permitir finalizar, qual aba mostrar) e mantém estado crítico (desconto de gerente, método de pagamento) que, pelo contrato da Fase 0/1, deveria ser derivado de uma única leitura de `PDVViewState`.

Este documento **não refatora `CaixaPageClient.tsx`**. Define a arquitetura-alvo para a qual uma implementação futura deveria migrar, e usa o estado atual como prova de que o problema que a Fase 2 ataca é real, não hipotético.

Componentes existentes relevantes para contexto (sem alteração): `CaixaCartList.tsx` (492 linhas — lista de itens), `CaixaFooter.tsx` (270 linhas — totais + ações), `CaixaPdvCartSaleBar.tsx`, `CaixaPdvMetodoPagamentoSelector.tsx`, `CaixaSearchBar.tsx` (scanner/busca). A árvore-alvo desta spec (§2) não são nomes inventados no vácuo — mapeiam intencionalmente para responsabilidades que esses componentes já cobrem parcialmente hoje, mas cada um também mistura busca de dados e decisão de fluxo com apresentação.

---

## 1. Objetivo

UI mínima baseada em estado puro: dado um `PDVViewState` (Fase 0, §5), a árvore de componentes é uma função pura de renderização — `render(viewState) → JSX`. Nenhum componente de apresentação chama `useState` para guardar algo que já está ou deveria estar em `PDVViewState`; nenhum componente decide "qual é o próximo estado" — ele só invoca `command(...)` e espera o próximo `PDVViewState`.

### 1.1 Três regras não negociáveis

1. **UI não decide fluxo.** Nenhum componente contém lógica do tipo "se o carrinho tem itens E o caixa está aberto E não há suspensão global, mostra botão X" — essa decisão já veio pronta em `PDVViewState.allowedActions`/`primaryAction` (Fase 0, §5). O componente só verifica `action.enabled`.
2. **UI não mantém estado crítico.** "Crítico" = qualquer dado que, se perdido (refresh de página, navegação), mudaria o resultado de uma venda: itens, totais, desconto de gerente, método de pagamento, estado da transição. Estado local (`useState`) só é aceitável para efêmero de interação pura (foco de input, posição de scroll, "modal está com animação de abertura").
3. **UI apenas renderiza `PDVViewState`.** Nenhum componente de apresentação chama `useCartStore`, `useCaixaStatus`, RPC ou Server Action diretamente — só o seletor único (Fase 0, §5, última regra) tem essa permissão.

---

## 2. Árvore de componentes do shell

```
OperatorView                          (única tela ativa por terminal — §1 regra 3 da Fase 0, zero concorrência visual)
├── InputScanner                      (captura comando CMD_ITEM_SCAN; não decide se pode escanear — só existe em IDLE/SALE_ACTIVE)
├── SaleList                          (renderiza viewState.items; emite CMD_ITEM_UPDATE_QTY / CMD_ITEM_REMOVE)
├── TotalPanel                        (renderiza viewState.total; puramente apresentacional, zero lógica)
└── PaymentButton                     (renderiza viewState.primaryAction; único ponto de disparo de CMD_SALE_CHECKOUT_START / CMD_SALE_FINALIZE)
```

`OperatorView` é o único componente que lê `PDVViewState` (via o seletor da Fase 0). Os quatro filhos recebem **apenas os campos de que precisam via props**, nunca o objeto inteiro — isso torna testável e explícito o que cada um consome, e impede que um componente filho comece a ler um campo de `PDVViewState` que não estava nas props (a props table da §3 é o contrato real, não o tipo completo).

### 2.1 Por que só estes cinco

O roadmap pede exatamente esta lista porque cada um mapeia 1:1 a uma fatia de `PDVViewState` sem sobreposição:

| Componente | Fatia de `PDVViewState` consumida | Comandos que pode emitir |
|------------|--------------------------------------|-----------------------------|
| `OperatorView` | tudo (é quem chama o seletor) — decide **qual** dos 4 filhos renderizar, nunca **o que** cada um mostra internamente | nenhum diretamente — delega |
| `InputScanner` | `saleState`, `caixaStatus` (só para saber se está habilitado) | `CMD_ITEM_SCAN`, `CMD_ITEM_ADD_MANUAL` |
| `SaleList` | `items` | `CMD_ITEM_UPDATE_QTY`, `CMD_ITEM_REMOVE` |
| `TotalPanel` | `total` | nenhum — é somente leitura |
| `PaymentButton` | `primaryAction`, `activeError` | o `command` de `primaryAction`, o que for (`CMD_SALE_CHECKOUT_START` em `SALE_ACTIVE`, `CMD_SALE_FINALIZE` em `PAYMENT_PENDING`, `CMD_SALE_NEW` em `COMPLETED`, `CMD_CAIXA_ABRIR` em `IDLE`/`FECHADO`) |

`PaymentButton` **não tem lógica condicional própria** sobre qual comando disparar — ele lê `primaryAction.command` e `primaryAction.label` de `PDVViewState` e os usa tal como vêm. O "qual botão é o primário em cada estado" já foi decidido no backend/seletor (Fase 0, §6.1), não no componente. Isso é a diferença estrutural entre este `PaymentButton` e o `CaixaFooter.tsx` atual, que decide internamente (via várias flags booleanas locais) o que mostrar.

---

## 3. Contrato de renderização por estado

Progressive disclosure e ação única já foram definidas na Fase 0 (§6). Esta tabela traduz aquelas regras para "o que cada componente do shell faz, literalmente, por `saleState`" — não redefine as regras, só as amarra à árvore de componentes real:

| `saleState` | `OperatorView` renderiza | `InputScanner` | `SaleList` | `TotalPanel` | `PaymentButton` |
|-------------|------------------------------|------------------|------------|----------------|---------------------|
| `IDLE` (`caixaStatus: FECHADO`) | só `PaymentButton` (rótulo "Abrir caixa") | oculto/desabilitado | vazio/oculto | oculto | `command: CMD_CAIXA_ABRIR` |
| `IDLE` (`caixaStatus: ABERTO`) | `InputScanner` + `PaymentButton` desabilitado | habilitado, com foco | vazio | zerado/oculto | desabilitado (sem carrinho) |
| `SALE_ACTIVE` | todos os 4 | habilitado | populado, editável | populado | `command: CMD_SALE_CHECKOUT_START` |
| `PAYMENT_PENDING` | `SaleList` (read-only) + `TotalPanel` + `PaymentButton` | oculto | populado, **não editável** (§1 regra 3 — carrinho fechado para edição nesta fase, Fase 0 §1) | populado | `command: CMD_SALE_FINALIZE`, ou substituído por mensagem de `activeError`/suspensão global se `allowedActions` não contiver o comando |
| `PAYMENT_PROCESSING` | tela bloqueante dedicada (nenhum dos 4 componentes normais — ver §3.1) | — | — | — | — |
| `COMPLETED` | `TotalPanel` (resumo final) + `PaymentButton` | oculto | oculto ou resumo read-only | populado (valor da venda concluída) | `command: CMD_SALE_NEW` |

### 3.1 `PAYMENT_PROCESSING` é um quinto "modo" de `OperatorView`, não uma variação dos 4 componentes

Reforça a regra de zero concorrência visual da Fase 0 (§6.3): em vez de desabilitar botões dentro de `SaleList`/`PaymentButton`, `OperatorView` troca a árvore inteira por uma tela de espera dedicada (sem inputs, sem botões, só indicação de progresso) enquanto `saleState === 'PAYMENT_PROCESSING'`. Isso torna **impossível estruturalmente** clicar em "Finalizar" duas vezes — não é uma checagem de `disabled`, é a ausência do botão na árvore.

---

## 4. O que "UI burra" proíbe, com exemplos do código atual

Cada proibição é ancorada em um exemplo real de `CaixaPageClient.tsx` que a violaria, para deixar concreto o que "não fazer" significa nesta migração futura:

| Proibição | Exemplo real que violaria (hoje) | Onde deveria estar, no contrato-alvo |
|-----------|-------------------------------------|------------------------------------------|
| Não guardar em `useState` um dado que é resultado de RPC/transição | `gerenteValidadoAte`, `gerenteToken`, `maxDescontoGerentePercentual`, `descontoGerentePercentual` (`CaixaPageClient.tsx:167-172`) | `PDVViewState.total.descontoGerente` (já definido na Fase 0, §5) — populado pelo seletor, não por `setState` local após uma chamada de rede |
| Não guardar método de pagamento como estado de componente | `metodoPagamento` (`CaixaPageClient.tsx:183`) | Não existe hoje em `PDVViewState` — é um **gap a preencher na Fase 1** (o comando `CMD_SALE_FINALIZE` da Fase 0 já recebe pagamentos, mas o contrato de estado intermediário de "forma selecionada antes de finalizar" precisa ser adicionado ao `PDVViewState` numa revisão futura, fora do escopo desta spec) |
| Não decidir habilitação de botão com múltiplas flags booleanas locais | `finalizando`, `processandoCaixa`, `validandoGerente` controlando `disabled` em vários lugares | Um único campo `primaryAction.enabled`, já resolvido no backend/seletor |
| Não buscar configuração e cachear localmente sem refletir no estado formal | `configCaixaWeb`, `limiteSangriaSemGerente` (`CaixaPageClient.tsx:146, 173`) | `PDVViewState.suspensaoGlobal` já cobre o caso de uso real (motivo de suspensão); limites de desconto/sangria entram em `PDVViewState` como campos de configuração resolvida, não como cache solto no componente |
| Não coordenar abertura de modal com lógica ad-hoc espalhada | `gerenteModalAberto`, `movimentacaoModalTipo`, `acaoMovimentacao`, `confirmacaoPendente` (`CaixaPageClient.tsx:151-176`) | Fora do escopo dos 5 componentes centrais desta fase — fluxos de gerente/movimentação de caixa não fazem parte do `PDVSaleState` (Fase 0, §0) e ficam para uma extensão de shell futura, não esta spec |
| Não criar um "modo" de UI para uma regra de domínio (ex.: atacado) | Nenhum componente atual faz isso hoje — registrado preventivamente (Fase 0, §5.1) | `item.resultado.tipoPreco` é exibível como rótulo em `SaleList` (ex.: badge), nunca lido para decidir layout, habilitar ação ou ramificar `OperatorView`; não existe `saleState` nem prop `modoAtacado` em nenhum componente desta árvore |

### 4.1 O que continua sendo estado local legítimo

Não todo `useState` é uma violação. Estado puramente de interação, que não sobrevive nem precisa sobreviver a um refresh e não afeta o resultado financeiro da venda, permanece local aos componentes do shell:

- Texto digitado no campo de busca antes do Enter (`InputScanner`).
- Se um painel colapsável está expandido ou não (`summaryCollapsed`, equivalente).
- Foco de teclado, animação de transição entre estados.

A distinção não é "zero `useState`" — é "nenhum `useState` que duplica ou substitui um campo de `PDVViewState`".

---

## 5. Caminho de migração (mapeamento, não execução)

Tabela de correspondência entre os componentes existentes e os alvos desta spec — para uma implementação futura saber onde procurar lógica a extrair. Nenhuma linha aqui é executada nesta rodada:

| Componente-alvo | Componente(s) existentes com responsabilidade sobreposta | Nota de migração |
|----------------------|----------------------------------------------------------------|----------------------|
| `InputScanner` | `CaixaSearchBar.tsx` | Hoje mistura busca de produto por texto e por código de barras; shell-alvo separa "captura de comando" de "resolução de produto" (resolução já é responsabilidade do backend/pipeline de bip, não do componente) |
| `SaleList` | `CaixaCartList.tsx` (492 linhas) | Tamanho atual sugere que hoje há lógica de precificação/desconto embutida na lista — no shell-alvo, `SaleList` só itera `items` já calculados |
| `TotalPanel` | Parte de `CaixaFooter.tsx` | `CaixaFooter.tsx` hoje combina totais com botões de ação — shell-alvo separa em `TotalPanel` (leitura) + `PaymentButton` (ação) |
| `PaymentButton` | Parte de `CaixaFooter.tsx`, `CaixaPdvCartSaleBar.tsx`, `CaixaPdvMetodoPagamentoSelector.tsx` | Estes hoje decidem internamente qual ação mostrar; shell-alvo move essa decisão para `primaryAction` vindo do backend |
| `OperatorView` | `CaixaPageClient.tsx` (1401 linhas) | É a substituição direta do componente raiz atual — a maior parte da complexidade hoje presente ali (modais de gerente/movimentação, atalhos de teclado, etc.) fica fora do escopo dos 5 componentes centrais e precisa de uma decisão própria de arquitetura numa fase futura |

---

## 6. O que este documento explicitamente não decide nem faz

1. **Não escreve nem altera nenhum componente React.** Todo mapeamento da §5 é diagnóstico para uma implementação futura, não uma instrução de refactor a executar agora.
2. **Não resolve o gap de `metodoPagamento` em `PDVViewState`** (§4, linha 2) — só o registra como pendência para uma revisão futura da Fase 0.
3. **Não cobre os fluxos de gerente/movimentação de caixa** (modais, timeline de movimentações) — esses não fazem parte do `PDVSaleState` (Fase 0, §0) e ficam fora dos 5 componentes centrais desta fase.
4. **Não depende de o backend já implementar o contrato da Fase 1** para existir como especificação — mas uma implementação real deste shell só pode ligar de fato a `PDVViewState` depois que as RPCs devolverem estado canônico (Fase 1, §4). Até lá, esta árvore de componentes é consumível apenas com dados mockados/adaptados manualmente.
5. **Não decide a Fase 3 do roadmap** (engine de estado no frontend, `SaleStateMachine.ts`, `useSaleState()`) — essa é a peça que efetivamente chama o seletor e mantém `PDVViewState` sincronizado; esta spec assume que ela existe (ou que os dados chegam prontos) e define só o que os componentes de apresentação fazem com o resultado.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-07-02 | Rascunho inicial — arquitetura do shell de UI (OperatorView, InputScanner, SaleList, TotalPanel, PaymentButton) como design spec, sem implementação. Ancorado na auditoria do estado real de `CaixaPageClient.tsx` (25+ `useState`, estado crítico duplicado). |
