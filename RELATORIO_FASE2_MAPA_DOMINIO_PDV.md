# Auditoria de Encerramento da Fase 1 + Mapa de Domínio do PDV

**Data:** 2026-07-15
**Branch:** `claude/jinlong-rebuild-9c9sq2` (PR #189)
**Escopo:** (A) classificação arquitetural das violações de `guard:core`; (B) mapa de domínio do PDV, pré-requisito obrigatório antes de qualquer implementação de Fase 2.

Nenhum código foi alterado neste documento — é pesquisa e evidência, para decisão, não implementação.

---

## Parte A — `guard:core`: classificação arquitetural (não apenas "é antigo")

Já havíamos confirmado que as duas violações são anteriores a este PR. A pergunta correta não é "quando surgiram", é "a regra pertence ao Core?". Resposta, com evidência:

### A.1 `ProdutoFormModal.tsx` — **Violação arquitetural real**

Não é falso positivo nem exceção legítima. Existe prova de que a abstração correta já existia e era conhecida na base quando este arquivo foi escrito:

- `core/catalog/statusPublicacao.ts:64-66` define `podePublicarProduto(status)` desde **2026-07-03** (commit `519a5561`), com comentário explícito no próprio código: *"A UI consome este predicado — nunca compara status_publicacao por literal (enforçado por scripts/core-rule-guard.mjs)"*.
- Esse predicado **já é consumido corretamente** em `app/gerente/produtos/ProdutosGerentePageClient.tsx:1118` (`podePublicarProduto(p.status_publicacao)`), com comentário no código citando o guard.
- `ProdutoFormModal.tsx`, escrito **uma semana depois** (2026-07-10, commit `9a9da6a5`), reimplementa a mesma decisão de forma independente em 4 pontos: linha 99 (`podeSalvarRascunho`), linha 178 (a UI decide e envia o literal `status_publicacao: 'DRAFT'` no payload, em vez de enviar uma intenção como `salvarComoRascunho: true` e deixar o server decidir o valor resultante), linha 216 e linha 375.

**Correção mínima (não aplicada neste PR):** trocar as 4 comparações literais por `podePublicarProduto(produto?.status_publicacao)` / negação equivalente; na linha 178, enviar `{ salvarComoRascunho: comoRascunho }` como intenção e deixar a Server Action decidir o `status_publicacao` resultante via `dualWriteFromStatus`/`defaultStatusNovoProduto` (já existentes em `core/catalog/statusPublicacao.ts`).

### A.2 `LoginForm.tsx` — **Violação arquitetural real, de severidade menor** (não é a autoridade de segurança)

- A autoridade de fato já é **server/edge**: `lib/admin/policy/adminPolicy.ts` bloqueia qualquer rota protegida (`/admin/*`, `/caixa`) quando `authState === 'blocked'`, decisão vinda de `lib/admin/auth/sessionConsistency.ts:127` (`resolveBlockedReason` → `raw.usuario?.ativo === false → 'inativo'`). Uma conta desativada **não acessa nada** mesmo que `LoginForm.tsx` não fizesse checagem alguma — não há segunda autoridade de segurança criada no cliente.
- O que `LoginForm.tsx:123` faz é UX antecipada (sign-out imediato + mensagem amigável, em vez de deixar o usuário ser redirecionado depois de "logado"). Legítimo como conceito.
- **Mas** a condição `.ativo === false` é reimplementada como literal solto em **dois lugares** (`sessionConsistency.ts:127` e `LoginForm.tsx:123`), sem predicado nomeado único — o mesmo tipo de duplicação que causou o problema em Produtos.
- Nota de qualidade do guard: a mensagem `"branch por produto.ativo"` é genérica/imprecisa — a regex `/\.ativo\s*===\s*(true|false)\b/` casa qualquer `.ativo`; aqui é `usuario.ativo`, não `produto.ativo`. Vale corrigir o texto no follow-up.

**Correção mínima (não aplicada neste PR):** extrair `core/auth/contaAtiva.ts` com `isContaAtiva(usuario)`, consumido tanto por `resolveBlockedReason` quanto por `LoginForm.tsx`.

### A.3 Conclusão

Nenhuma das duas é excesso de zelo do guard. Ambas compartilham a mesma causa raiz: funcionalidade escrita sem consultar (Produtos) ou sem que existisse ainda (Login) uma abstração central. **Item de follow-up proposto, fora deste PR:** `chore(core): mover regras de status_publicacao (ProdutoFormModal) e conta ativa (LoginForm) para /core` — escopo isolado, sem tocar Compras/Admin V2.

---

## Parte B — Mapa de domínio do PDV

Auditoria exclusiva de arquitetura (`app/caixa/**`, `shared-core/src/{caixa,pdv,pricing,managerDiscount}`, `core/`), sem nenhuma implementação. Todas as afirmações abaixo foram verificadas por leitura direta de arquivo ou `grep`; onde um número foi corrigido após verificação própria (ex.: contagem de `useState`), o valor correto está marcado.

### B.1 Aggregates e Entidades

**Não existe um aggregate "Venda" único e tipado ponta-a-ponta.** O mesmo conceito de "item de venda" é representado por **4 tipos diferentes em 4 arquivos diferentes**, sem conversão centralizada:

| Estágio | Tipo | Arquivo |
|---|---|---|
| Carrinho (rascunho, cliente) | `ItemCarrinho` | `shared-core/src/stores/unifiedCartStore.ts:10-31` |
| Snapshot imutável pré-checkout | `CheckoutSnapshotItem` | `shared-core/src/caixa/checkoutSnapshot.ts:40-58` |
| Contrato de entrada da Server Action | `FinalizarVendaInput.itens` (Zod) | `app/caixa/finalizarVendaValidation.ts:49-97` |
| Pós-revalidação server-side | `ItemAutoritativo` | `app/caixa/server/caixaPrecoAutoritativoServer.ts:13-39` |

Não há um tipo `Venda` central: os campos são reconstruídos ad-hoc a partir de linhas de `vendas`/`vendas_pagamentos`/`venda_eventos` em cada consumidor (`caixaTurnoResumo.impl.ts:36-42`, `caixaVendaEspera.impl.ts:199-337`). Outras entidades:

- **Turno de Caixa**: sem tipo de domínio dedicado; linha de `caixas` (`id, operador_id, loja_id, valor_inicial, status`), manipulada em `caixaSessaoOperador.impl.ts`.
- **Venda em Espera**: `VendaEmEsperaCard` (`caixaVendaEspera.impl.ts:7-14`).
- **Evento de venda (auditoria/outbox)**: `SaleEvent`/`SaleEventItem` (`shared-core/src/pdv/saleEvent.ts:1-25`) — `eventType: 'SALE_REGISTERED'|'SALE_CANCELLED'|'SALE_PARTIAL_RETURN'`.
- **Cliente na venda**: referência fraca, `clienteId: string | null` + `ClienteCaixaRow {id, nome, documento}` (`caixaClientesSearch.impl.ts:4-8`) — não há entidade "Cliente" rica no domínio do caixa.

**Achado arquitetural:** a fragmentação em 4 representações do "item de venda" é o principal ponto a consolidar antes de qualquer reconstrução de UI do PDV — mexer no componente sem antes unificar o tipo é reproduzir a fragmentação em código novo.

### B.2 Value Objects

- **Dinheiro**: `roundMoney2` — **três implementações equivalentes duplicadas**: `shared/cart/totals.ts:7-9`, `shared-core/src/pdv/invariants/money.ts:5-7`, reexportada em `app/caixa/finalizarVendaValidation.ts:9`. Tolerância `MONEY_TOLERANCE = 0.02`.
- **Arredondamento ABNT** (paridade com Postgres): `core/money/roundAbnt.ts:47-58`, espelha `public.round_abnt()` (migration `055_round_abnt_finalize_v2.sql`).
- **Quantidade**: `lib/format/quantidadeCaixa.ts` (reexport de `@shared/format/quantidadeCaixa.ts`) — `QUANTIDADE_CAIXA_DECIMAL_PLACES`, `parseQuantidadeCaixaFromString`, `quantidadeParaRpcPreco`.
- **Forma de pagamento**: dois vocabulários paralelos — UI (`MetodoPagamentoUi = "dinheiro"|"pix"|"debito"|"credito"`, `caixaMetodoPagamento.ts:4`) vs. banco (`FORMAS_PAGAMENTO_CAIXA = ["DINHEIRO","PIX","CARTAO_DEBITO","CARTAO_CREDITO"]`, `finalizarVendaValidation.ts:11-16`), com `metodoPagamentoToForma()` como ponte. Fricção de mapeamento, não um bug, mas um VO que poderia ser único.
- **Desconto de gerente**: `clampPercentualDesconto`, `calcularDescontoGerenteValor`, `aplicarDescontoGerenteSobreTotal` (`shared-core/src/managerDiscount/policy.ts:29-87`). `DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL = 20` é "defesa em profundidade no cliente offline" (comentário do próprio código) — a fonte real é `pdv_config.max_desconto_gerente_percentual`.
- **Cadeia de resolução de preço**: `PRICE_RESOLUTION_CHAIN = ['tier','catalogo','varejo']` (`shared-core/src/pricing/resolution.ts:36-58`).

### B.3 Serviços de domínio (`app/caixa/server/*.impl.ts`)

| Arquivo | Responsabilidade |
|---|---|
| `caixaVendas.impl.ts` | Finaliza venda (RPC `finalizar_venda_transacional_canonica_v4`) e cancela (RPC `cancelar_venda_transacional`) — único caller autorizado da v4. |
| `caixaPrecoAutoritativoServer.ts` | Revalida **todos** os itens do carrinho contra o servidor antes de finalizar (núcleo anti-fraude); resolve `pricingVersionId`. |
| `caixaPrecoProduto.impl.ts` | Preço para 1 produto/quantidade via RPC `calcular_preco_produto` (usado ao editar quantidade no carrinho). |
| `caixaGerenteDesconto.impl.ts` | Autoriza desconto via Edge Function `validar-gerente` (não é RPC Postgres). |
| `caixaVendaEspera.impl.ts` | CRUD de venda em espera + histórico do operador. |
| `caixaCatalogo.impl.ts` | Busca de produto (código de barras/nome) + preço em 1 round-trip; lê `produtos`/`categorias` direto. |
| `caixaClientesSearch.impl.ts` | Busca somente-leitura de clientes da loja. |
| `caixaEstoqueServer.ts` | **Somente leitura** de estoque para exibição — não baixa estoque (baixa é responsabilidade exclusiva da RPC de venda). |
| `caixaSessaoOperador.impl.ts` | Abre/fecha/status de turno; roda motor de invariantes (`runPdvEvaluation`) no fechamento. |
| `caixaFechamentoServer.ts` | Helpers de conferência de fechamento (`LIMITE_DIVERGENCIA_FECHAMENTO=5`). |
| `caixaTurnoResumo.impl.ts` | Resumo do turno (recebido + a receber), lendo 3 tabelas diretamente. |
| `finalizarVendaValidation.ts` | Schema Zod da entrada + reconciliação de totais declarados vs. calculados. |
| `caixaPagamentoSaldo.ts` | Resumo de parcelas, epsilons de saldo/excesso. |
| `caixaFiscalEnqueueServer.ts` | **Código morto confirmado** (ver B.7). |
| `cancelarVendaPerfil.ts` | Regra de perfil para quem pode cancelar venda. |

### B.4 Máquina de estados

Duas máquinas de estado coexistem, **sem relação entre si**:

**(a) Scan pipeline (bipe do produto)** — a única com transições formalmente policiadas em código: `ScanState = 'queued'|'processing'|'pending_resolution'|'acknowledged'|'failed'|'cancelled'` (`shared-core/src/pdv/scan-pipeline.ts:20-27`); transições válidas centralizadas em `isAllowedScanStateTransition` (`scan-pipeline-transitions.ts:43-47`: `queued→processing|cancelled`; `processing→acknowledged|failed|cancelled`). Testada por 4 specs golden/invariantes/transições/runtime.

**(b) Estado de negócio da venda** — **não há enum central nem transições policiadas em código**. É composto por strings literais espalhadas: status de venda persistida `'CONCLUIDA'`/`'CANCELADA'` (retorno de RPC, sem union type TS); status de venda em espera sem enum explícito (`EM_ESPERA` → deveria virar `CONVERTIDA` ao finalizar, mas **isso não está implementado** — item aberto em `TODO_auditoria_255.md`, linha 9: *"Marcar CONVERTIDA após finalizar venda retomada"*).

**Gap confirmado:** o ciclo de vida da venda (rascunho → em espera → finalizando → concluída/cancelada) não tem uma state machine equivalente à do scan-pipeline. É a lacuna de modelagem mais concreta para a Fase 2.

### B.5 Fluxo completo da venda

```
Scan/busca (CaixaSearchBar) → useCaixaScanPipeline → actions.ts:buscarProdutoComPrecoCaixa
  → caixaCatalogo.impl.ts (busca) + RPC calcular_preco_produto (preço)
  → useCartStore.adicionarItem (unifiedCartStore.ts)

[quantidade alterada] → useReprecificarQuantidadeCaixa (debounce 350ms) → RPC calcular_preco_produto

[desconto de gerente] → CaixaGerenteModal → actions.ts:validarGerenteDesconto
  → Edge Function `validar-gerente` → store.aplicarDescontoGerente(percentual, token)

[finalizar] → buildCheckoutSnapshot + validateCheckoutSnapshot (bloqueio client-side)
  → actions.ts:finalizarVendaCaixa
    → finalizarVendaInputSchema.safeParse (Zod)
    → recalcularItensNoServidor (revalida TODO item via RPC calcular_preco_produto)
    → valida caixa aberto; valida pagamento parcial exige cliente
    → RPC finalizar_venda_transacional_canonica_v4
        [TX única: vendas + itens + baixa de estoque + pagamentos + contas_receber + evento + fiscal_auto_enqueue]
    → registrar_pricing_version_venda (best-effort)
  → CaixaReciboModal exibe recibo
```

RPC de venda **única e autorizada**: `finalizar_venda_transacional_canonica_v4` (v2/v3 desabilitadas no banco — `LEGACY_DISABLED_USE_V4`). Documento oficial **congelado**: `docs/venda-golden-flow.md`, com enforcement automatizado por `scripts/rpc-gate-guard.mjs` (falha o CI se v2/v3 forem chamadas, ou se houver um segundo caller da v4).

### B.6 Single Source of Truth

- **Preços**: SSoT real = RPC Postgres `calcular_preco_produto` (web sempre chama; nunca decide localmente). **PDV local (offline) reimplementa** a mesma cadeia em TS (`pdv-local/src/lib/resolverPrecoCanonicoLocal.ts` + `core/pricing/calcularPrecoCanonico`) — web e local **não compartilham a mesma implementação**, só o mesmo contrato, garantido por teste de paridade golden (`offlineRpcEquivalence.golden.test.ts`), não por reuso de código. Isso é uma exceção **documentada e intencional** (offline-first), não drift silencioso — mas é uma duplicação de fato.
- **Descontos**: decisão final é server-side (Edge Function `validar-gerente` + validação redundante na RPC v4 quando `strictManagerDiscountAuth`). Client só faz defesa em profundidade (comentário explícito no próprio `policy.ts`).
- **Estoque**: **assimetria real entre web e PDV local**. Web: baixa é transacional, dentro da mesma RPC de venda. PDV local: `sync-outbox/index.ts` primeiro registra a venda (`registrar_venda_com_itens`) e **depois**, fora dessa transação, baixa estoque item a item (`decrementar_estoque_seguro`) — mitigado por idempotência, mas não atômico com o registro da venda.
- **Pagamentos**: validado em 3 camadas (client `useCaixaPagamentos.ts`, Zod `finalizarVendaInputSchema.superRefine`, server `finalizarVendaCaixaImpl`). **PDV local não suporta múltiplas formas de pagamento** — `usePdvLocalVendaCaixaFlow.ts:192` fixa `forma_pagamento: 'DINHEIRO'` (confirmado por leitura direta). Gap funcional real web vs. desktop.
- **Fechamento de caixa**: RPC `fechar_caixa_atomico` compara valor contado vs. `calcular_valor_sistema_dinheiro_caixa` (só dinheiro, não PIX/cartão); exige motivo se divergência `> 5`; bloqueia se há movimentação pendente; roda motor de invariantes (`runPdvEvaluation`) ao fechar, sem bloquear em violação (só loga).

### B.7 Boundaries com outros módulos

| Módulo | Tipo de acesso | Evidência |
|---|---|---|
| Produtos/Catálogo | **Leitura direta** (`supabase.from('produtos')`), sem repositório dedicado | `caixaCatalogo.impl.ts`, `caixaPrecoAutoritativoServer.ts:163-179` |
| Estoque | Leitura direta para exibição; **escrita sempre via RPC** (nunca update direto) | `caixaEstoqueServer.ts:13-18` (leitura) vs. `decrementar_estoque_seguro` (escrita) |
| Financeiro (`contas_receber`) | Leitura direta para resumo; **escrita é efeito colateral escondido dentro da própria RPC de venda** (não uma chamada explícita ao domínio financeiro) | `caixaTurnoResumo.impl.ts:61-67`; criação do título ocorre dentro de `finalizar_venda_transacional_canonica_v4` |
| Clientes | Leitura direta | `caixaClientesSearch.impl.ts:35-42` |
| Fiscal | RPC dedicada existe (`fiscal_enfileirar_documento_venda`) mas **não é usada no caminho ativo** — ver achado abaixo | `caixaFiscalEnqueueServer.ts` |

**Achado confirmado por mim (grep direto, além do relatado pelo agente):** `enfileirarDocumentoFiscalPosVenda` (`caixaFiscalEnqueueServer.ts`) tem exatamente 2 ocorrências no repositório — a própria definição e um re-export em `caixaActionsInternals.ts` — **nenhum call site real**. O caminho ativo de fiscal já acontece dentro da própria RPC v4 via flag `p_fiscal_auto_enqueue` (`caixaVendas.impl.ts`, chamada em torno da linha 301). **`caixaFiscalEnqueueServer.ts` é código morto** — candidato a remoção na Fase 2, não neste PR.

**Padrão geral**: não há camada de repositório/gateway por domínio — todo módulo do "caixa" lê tabelas de outros domínios via `.from()` direto. Aceitável hoje (monolito modular pequeno), mas é o principal ponto de "boundary leakage" a decidir explicitamente na Fase 2 (formalizar como padrão aceito, ou introduzir gateways).

### B.8 Pontos de acoplamento e dívida técnica confirmados

- **Componente-deus**: `CaixaPageClient.tsx` — **1.635 linhas**, **16 `useState`** (contagem verificada por `grep -c`, corrigindo uma sobrecontagem inicial), **59 imports**. Concentra praticamente todo o estado de UI: `codigo, checkoutHint, finalizando, gerenteModalAberto, gerenteToken, metodoPagamento, clienteId, vendasEmEspera, historicoAberto, ...`.
- **Estado duplicado / prop-drilling manual**: `metodoPagamento` e `clienteId` são estado local do componente, fisicamente separados do `useCartStore` (zustand) que guarda itens/totais — exigem passagem manual entre os dois em vez de acompanhar o carrinho como um único aggregate.
- **Lógica de negócio em `'use client'`**: `useCaixaPagamentos.ts` (marcado `"use client"`) contém regra de negócio (auto-completar última parcela, `MAX_PARCELAS=4`, cálculo de saldo) fora de `shared-core`/server. Dois `useEffect` nesse hook reagem a `formaPagamento`/`totalLiquidoComGerente` para resetar parcelas — cadeia de sincronização que replica parte do que `unifiedCartStore.aplicarDescontoSobreTotais` já calcula.
- **`roundMoney2` triplicado**: mesma função em `shared/cart/totals.ts`, `shared-core/src/pdv/invariants/money.ts`, reexportada em `finalizarVendaValidation.ts` — 3 pontos que precisam mudar juntos se a tolerância (`0.02`) mudar.
- **Dívidas explícitas já documentadas pela própria equipe** (`app/caixa/TODO_auditoria_255.md`, transcrito integralmente):
  - RLS de `vendas_em_espera` frouxo (qualquer usuário da loja lê).
  - Coluna `desconto_gerente_token` persistida indevidamente.
  - Falta `UNIQUE(operador_id, numero_local)` em vendas em espera.
  - Falta validar que `p_caixa_id` pertence ao operador/loja.
  - **Falta marcar `CONVERTIDA`** após finalizar venda retomada (state machine de venda em espera incompleta).
  - Falta ledger/auditoria explícito de park/resume/discard/consulta rápida.
  - Falta `WITH CHECK` na policy `UPDATE` de `vendas_em_espera`.

### B.9 Funcionalidades implementadas vs. especificação Jinlong

| Requisito da especificação | Status | Evidência |
|---|---|---|
| Venda em espera | ✅ Implementado (parcial: falta marcar `CONVERTIDA`) | `caixaVendaEspera.impl.ts`, `CaixaEmAbertoList.tsx` |
| Múltiplas formas de pagamento na mesma venda | ✅ Web · ❌ **Ausente no PDV local** | `useCaixaPagamentos.ts` (web) vs. `usePdvLocalVendaCaixaFlow.ts:192` (hardcode `DINHEIRO`) |
| Pesquisa rápida de produto | ✅ Implementado | `caixaConsultaRapida.impl.ts` + `CaixaConsultaRapidaModal.tsx` |
| Pesquisa rápida de cliente | ✅ Implementado | `caixaClientesSearch.impl.ts` + `CaixaSelecionarClienteModal.tsx` |
| Código de barras (scanner) | ✅ Implementado, com testes golden | `variantesChaveLeitura.ts` + `scan-pipeline*` |
| Preço varejo/atacado por quantidade | ✅ Implementado (paridade testada, não código único web/local) | `calcular_preco_produto` + `useReprecificarQuantidadeCaixa.ts` |
| Regras comerciais / desconto de gerente | ✅ Implementado, autoridade server-side | `CaixaGerenteModal.tsx` + `caixaGerenteDesconto.impl.ts` + RPC v4 |

**Único gap funcional real (não arquitetural) encontrado:** PDV local não suporta múltiplas formas de pagamento na mesma venda.

---

## Conclusão e recomendação para a Fase 2

**Não iniciar Fase 2 com implementação de features.** A auditoria confirma o diagnóstico do usuário: o PDV tem um núcleo operacional funcional e bem testado (golden-flow congelado, RPC única, invariantes automatizados), mas o **modelo de domínio da "Venda" está fragmentado em 4 representações não unificadas**, e o **ciclo de vida da venda não tem uma máquina de estados formal** (ao contrário do scan-pipeline, que é exemplar). Antes de tocar em `CaixaPageClient.tsx`, a Fase 2 do PDV deveria, nesta ordem:

1. Unificar o tipo de "item de venda"/"venda" (consolidar `ItemCarrinho` → `CheckoutSnapshotItem` → `FinalizarVendaInput.itens` → `ItemAutoritativo` num único tipo canônico com adaptadores explícitos nas bordas, não 4 tipos paralelos).
2. Formalizar a máquina de estados da venda (rascunho → em espera → finalizando → concluída/cancelada), incluindo fechar o gap já conhecido (`CONVERTIDA`), com o mesmo padrão de `isAllowedScanStateTransition` já usado no scan-pipeline.
3. Extrair estado/lógica de `CaixaPageClient.tsx` para hooks por responsabilidade (pagamento, desconto, venda em espera, modais), sem alterar comportamento — os testes de integração existentes são a rede de segurança.
4. Remover `caixaFiscalEnqueueServer.ts` (código morto confirmado) e resolver os itens do `TODO_auditoria_255.md`.
5. Decidir formalmente (não implicitamente) o padrão de acesso a domínios vizinhos (Produtos/Estoque/Financeiro/Clientes) — hoje é leitura direta sem gateway; ou vira padrão aceito e documentado, ou vira item de arquitetura próprio.

Somente depois desse trabalho de consolidação o PDV deveria receber mudanças de UI/UX. Isso não altera a ordem de prioridade de módulos já proposta (PDV → Produtos → Estoque → Financeiro) — refina o que "Fase 2 do PDV" significa: arquitetura de domínio antes de interface.
