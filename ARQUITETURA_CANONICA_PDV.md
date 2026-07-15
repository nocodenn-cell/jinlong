# Arquitetura Canônica do PDV — Documento de Referência Oficial

**Data:** 2026-07-15 (revisão 2 — incorpora contra-argumentação de revisão externa)
**Branch:** `claude/jinlong-rebuild-9c9sq2` (PR #189)
**Natureza:** documento de arquitetura. Nenhum código foi alterado, refatorado ou implementado para produzi-lo. Toda afirmação abaixo é evidência verificada (arquivo + linha, quando aplicável), não suposição. Consolida `RELATORIO_FASE2_MAPA_DOMINIO_PDV.md` numa decisão de arquitetura única, para servir de referência a toda evolução futura do PDV.

**O que mudou na revisão 2** (a pedido de uma segunda leitura crítica do documento): (1) seção 1.1, nova — a hipótese de que o Aggregate quebrado é o Carrinho, não (só) o Item, foi investigada e **confirmada com evidência mais forte do que a formulação original desta seção sugeria**; (2) a assimetria de atomicidade venda↔estoque (seção 3/7) foi reverificada linha a linha na fonte primária (`sync-outbox/index.ts`) e elevada a P0 inequívoco; (3) seção 4b, nova — bounded contexts e fachadas de domínio, lacuna apontada por não estar coberta na versão anterior; (4) seção 6 — checagem final de imports dinâmicos/lazy/stories antes de confirmar a candidatura a remoção do código morto; (5) roadmap ganhou uma Fase 0 (bounded contexts, paralela à Fase A, não posterior).

---

## 1. Aggregate Root oficial

### Decisão

**O Aggregate Root da venda é a `Venda` persistida** — o conjunto transacional `vendas` + `vendas_itens` + `vendas_pagamentos`, escrito atomicamente em uma única transação pela RPC `finalizar_venda_transacional_canonica_v4`.

**Por que ela é a autoridade:** é o único ponto do sistema onde (a) todas as invariantes de negócio são verificadas juntas (preço revalidado, estoque baixado, pagamento reconciliado, desconto autorizado), (b) a operação é atômica (tudo persiste ou nada persiste), e (c) o `docs/venda-golden-flow.md` já declara esse caminho como **congelado**, com `scripts/rpc-gate-guard.mjs` impedindo um segundo caller. Qualquer estado de "venda" que exista antes dessa transação (carrinho) é, por definição, um rascunho não durável do mesmo aggregate — não uma entidade separada.

### Entidades internas

- **Item de venda** (dentro do aggregate): produto, quantidade, preço unitário resolvido, tipo de preço (`VAREJO|ATACADO|MANUAL|PROMOCAO`), desconto de linha.
- **Pagamento** (dentro do aggregate): forma, valor — 1..N por venda (array, não VO único).
- **Cliente** (referência fraca, não pertence ao aggregate): `clienteId` apontando para a entidade Cliente, que vive no domínio Clientes — só é obrigatório quando há saldo pendente (venda parcial).
- **Caixa/Turno** (referência, não pertence ao aggregate): `caixaId` — o turno é o contexto de execução, não parte da venda.

### Value Objects

`money` (com tolerância `MONEY_TOLERANCE=0.02`), `quantidade` (até 3 casas decimais, `roundQuantidadeCaixa3`), `formaPagamento` (enum canônico do banco: `DINHEIRO|PIX|CARTAO_DEBITO|CARTAO_CREDITO`), `percentualDescontoGerente` (clamp 0–`max`, autoridade real em `pdv_config.max_desconto_gerente_percentual`), `cadeiaResolucaoPreco` (`tier→catalogo→varejo`).

### Invariantes (verificadas na RPC, não na UI)

1. Soma dos pagamentos ≤ total líquido + `EXCESSO_PAGAMENTO_EPS(0.01)`.
2. Se soma dos pagamentos < total líquido − `SALDO_PENDENTE_EPS(0.009)` → exige `clienteId` (gera `contas_receber`).
3. Todo item revalidado contra `calcular_preco_produto` no momento da finalização (preço do carrinho nunca é aceito cegamente).
4. Desconto de gerente sem token válido não pode exceder `desconto_maximo_operador_percentual`.
5. `forma_pagamento = 'FIADO'` é **rejeitado explicitamente** no header da venda (`RAISE EXCEPTION FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO`) — saldo pendente é modelado via `contas_receber`, nunca via uma forma de pagamento "fiado".

### Lifecycle

`(sem identidade) → RASCUNHO (carrinho, client-side, sem ID de venda) → [persistência atômica] → CONCLUIDA (ID existe, imutável exceto por cancelamento) → CANCELADA (terminal)`. Não existe update parcial de uma venda concluída — cancelamento é uma nova transação (`cancelar_venda_transacional`), não um update in-place.

### As quatro representações hoje — o que permanece, o que é DTO, o que desaparece

| Representação hoje | Arquivo | Classificação oficial |
|---|---|---|
| `ItemCarrinho` (zustand) | `shared-core/src/stores/unifiedCartStore.ts:10-31` | **Permanece** — é a *working copy* mutável do aggregate antes da persistência (o próprio "rascunho"), não uma entidade concorrente. Não deve desaparecer: é a única representação que precisa ser mutável/reativa para a UI. |
| `CheckoutSnapshotItem` | `shared-core/src/caixa/checkoutSnapshot.ts:40-58` | **Permanece como DTO de transporte** — fronteira imutável entre o rascunho mutável e a validação pré-envio. Papel legítimo de Value Object de fronteira, não é o aggregate. |
| `FinalizarVendaInput.itens` (Zod) | `app/caixa/finalizarVendaValidation.ts:49-97` | **Permanece como DTO de transporte** — contrato de wire client→server, validado por schema. Papel legítimo, não é o aggregate. |
| `ItemAutoritativo` | `app/caixa/server/caixaPrecoAutoritativoServer.ts:13-39` | **Deve desaparecer como tipo paralelo.** Hoje existe só para carregar campos de revalidação (`custoUnitarioSnap`, `regraAplicadaId`, `fontePreco`, `pricingVersionId`). Recomendação: estender o DTO de wire com esses campos como opcionais preenchidos no servidor, em vez de um 4º tipo de "item de venda" que exige remapeamento manual em cada fronteira. |

**Não existe hoje** um tipo TS único `VendaAggregate`/`Venda` que unifique os 4 pontos acima — cada consumidor (`caixaTurnoResumo.impl.ts`, `caixaVendaEspera.impl.ts`) reconstrói campos de venda ad-hoc a partir de colunas de `vendas`/`vendas_pagamentos`/`venda_eventos`. **Criar esse tipo único é o item Fase A do roadmap (seção 8).**

### 1.1 Revisão: o Aggregate quebrado é o Carrinho, não (só) o Item

Investigação adicional, feita a pedido explícito, para testar a hipótese alternativa: talvez a fragmentação real não esteja no *item*, mas na ausência de um **Aggregate de Carrinho/Venda-em-construção**. **A hipótese se confirma com evidência direta e é mais grave do que a formulação original desta seção sugeria** — a fragmentação do item é sintoma; a causa raiz é a ausência de um objeto único que represente "a venda sendo construída agora".

**Evidência 1 — o ponto de montagem manual do payload.** Em `app/caixa/CaixaPageClient.tsx:936-959`, o objeto final `FinalizarVendaInput` é montado à mão, no momento do clique em "Finalizar", costurando **7 fontes de estado independentes**:

1. `checkoutSnapshot.itens` (o snapshot imutável, só itens+totais brutos) — `buildCheckoutSnapshot` em `CaixaPageClient.tsx:902-906`;
2. `totalBruto`/`totalDesconto`/`totalLiquido` **lidos direto do store** (`totalBrutoStore` etc., linhas 236-238) — não do snapshot recém-validado, apesar de o comentário do snapshot dizer que o payload deveria derivar dele;
3. `pagamentos[0]?.formaPagamento` — vindo do hook `useCaixaPagamentos`, uma 3ª fonte;
4. `descontoGerentePercentualEfetivo`/`gerenteToken`/`valorDescontoGerente` — derivados de `descontoGerenteAplicado` (linha 262), uma **4ª fonte**, computada independentemente;
5. `clienteId` — `useState` local do componente, uma 5ª fonte;
6. `vendaIdempotenciaRef.current` — uma 6ª fonte (ref, não state);
7. `parcelasParaEnviar` — normalização adicional das parcelas, uma 7ª transformação.

Não existe hoje um único objeto "venda em construção" que já contenha tudo isso pronto para envio — existe um componente de 1.635 linhas cuja função é, no momento crítico, reconciliar manualmente 7 fontes de verdade paralelas.

**Evidência 2 — mais grave: o próprio "carrinho compartilhado" não é usado de forma idêntica pelos dois PDVs.** `shared-core/src/stores/unifiedCartStore.ts` expõe uma ação canônica `aplicarDescontoGerente(percentual, token, maxClamp)` (linha 324-339) que deveria ser *a* forma de aplicar desconto de gerente — commitando `descontoGerentePercentual`/`descontoGerenteValor`/`descontoGerenteToken`/`totalLiquido` (já com desconto embutido) no próprio store.

- **`pdv-local` usa exatamente essa ação** — confirmado em `pdv-local/src/App.tsx:989` (`aplicarDescontoGerente(valor, tokenPdv, maxClamp)`) e testado em `pdv-local/src/stores/cartStore.behavior.test.ts`.
- **`pdv-importados` (web) nunca chama essa ação** — confirmado por busca no arquivo inteiro (`grep -n "aplicarDescontoGerente\b" CaixaPageClient.tsx` → zero ocorrências da chamada, só da import do tipo). Em vez disso, `CaixaPageClient.tsx:181` mantém seu **próprio** `useState` local chamado `descontoGerentePercentual` — com o **mesmo nome** do campo do store, mas é outra variável — e recomputa o desconto chamando `aplicarDescontoGerenteSobreTotal(...)` diretamente no componente (linha 262-269), em paralelo à função que o store já encapsula.

Consequência concreta: os campos de desconto de gerente do `CarrinhoState` (`descontoGerentePercentual`, `descontoGerenteValor`, `descontoGerenteToken`) **ficam permanentemente no valor default (0/0/null) durante todo o fluxo web** — são campos mortos nesse contexto, mesmo a UI web aplicando desconto de gerente normalmente (só que por um caminho paralelo, não pelo store). O "carrinho compartilhado" entre web e desktop é compartilhado **como definição de tipo e função**, mas não como *uso* — cada lado decidiu, de forma independente, como e onde manter o estado de desconto.

**Conclusão revisada:** a decisão da seção 1 (Aggregate Root = `Venda` persistida) permanece correta como autoridade **pós-persistência**. Mas falta, hoje, um Aggregate **pré-persistência** — um objeto único "Carrinho/VendaEmConstrucao" que possua, ele mesmo, itens, forma de pagamento, desconto de gerente (percentual/valor/token), cliente selecionado e chave de idempotência, como uma coisa só. Hoje esses 5 conceitos vivem em: 1 store zustand (itens + campos de desconto não usados pela web) + 1 hook (`useCaixaPagamentos`, forma de pagamento/parcelas) + 2 `useState` locais (desconto efetivo, cliente) + 1 `useRef` (idempotência) — todos dentro do mesmo componente, sem um tipo que os agregue. **Isto muda o Fase A do roadmap: não é só "unificar o tipo de item", é "introduzir o Aggregate de Carrinho que hoje não existe, e do qual o item é só um campo".**

---

## 2. Máquina de estados oficial

### Estados

| Estado | Significado | Durável? |
|---|---|---|
| `RASCUNHO` | Carrinho com itens, sem ID de venda | Não (client-side, `useCartStore`) |
| `EM_ESPERA` | Rascunho "estacionado" (park) | Sim (`vendas_em_espera`) |
| `FINALIZANDO` | Submissão em curso (revalidação de preço + RPC em voo) | Não (estado transitório, hoje é o booleano `finalizando` em `CaixaPageClient.tsx`) |
| `CONCLUIDA` | Persistida com sucesso na `vendas` | Sim |
| `CANCELADA` | Venda concluída, depois anulada | Sim |
| `DESCARTADA` | Venda em espera abandonada sem nunca finalizar | Sim (soft, via `descartar_venda_em_espera`) |

### Transições, comandos e eventos

| De | Comando | Para | Evento emitido |
|---|---|---|---|
| `(nenhum)` | `AdicionarItem` | `RASCUNHO` | `ItemAdicionado` |
| `RASCUNHO` | `RemoverItem` / `AlterarQuantidade` | `RASCUNHO` | `ItemRemovido` / `ItemAlterado` |
| `RASCUNHO` | `AplicarDescontoGerente` | `RASCUNHO` | `DescontoAplicado` |
| `RASCUNHO` | `ColocarEmEspera` | `EM_ESPERA` | `VendaColocadaEmEspera` |
| `EM_ESPERA` | `RetomarEmEspera` | `RASCUNHO` | `VendaRetomada` |
| `EM_ESPERA` | `DescartarEmEspera` | `DESCARTADA` (terminal) | `VendaDescartada` |
| `RASCUNHO` | `FinalizarVenda` | `FINALIZANDO` → `CONCLUIDA` \| volta a `RASCUNHO` | `VendaFinalizada` (=`SALE_REGISTERED`) ou erro (nenhum evento; estado não muda) |
| `CONCLUIDA` | `CancelarVenda` | `CANCELADA` | `VendaCancelada` (=`SALE_CANCELLED`) |
| `CONCLUIDA` | `RegistrarDevolucaoParcial` | `CONCLUIDA` (não muda de estado, é uma sub-transação) | `DevolucaoParcialRegistrada` (=`SALE_PARTIAL_RETURN`) |

### Pré-condições / pós-condições por transição crítica

- **`FinalizarVenda` (RASCUNHO→CONCLUIDA):** pré-condições — carrinho não vazio; caixa aberto para o operador; se saldo pendente > 0, `clienteId` presente e pertencente à loja; se desconto de linha sem token excede limite do operador, rejeitado antes de chamar a RPC. Pós-condições — item revalidado persistido; estoque baixado (mesma transação); `contas_receber` criado se saldo pendente (idempotente por `venda_id`); documento fiscal enfileirado se `p_fiscal_auto_enqueue` habilitado (mesma transação); evento `SALE_REGISTERED` inserido em `venda_eventos`.
- **`CancelarVenda` (CONCLUIDA→CANCELADA):** pré-condição — perfil do operador permite cancelar (`cancelarVendaPerfil.ts`, GERENTE/DONO/ADMIN). Pós-condição — evento `SALE_CANCELLED`; reversão de estoque e de título a receber pendente (não auditado neste documento — candidato a verificação futura).
- **`RetomarEmEspera` (EM_ESPERA→RASCUNHO):** pós-condição **hoje incompleta** — ver estado inválido abaixo.

### Estado inválido confirmado (dívida técnica, não hipotético)

`vendas_em_espera` **nunca é marcada como `CONVERTIDA`** após `RetomarEmEspera` + `FinalizarVenda` bem-sucedido — confirmado em `app/caixa/TODO_auditoria_255.md:9` ("Marcar CONVERTIDA após finalizar venda retomada"). Hoje a máquina de estados de venda em espera tem só 2 transições reais implementadas (`EM_ESPERA→RASCUNHO` via retomar, `EM_ESPERA→DESCARTADA` via descartar) — a terceira transição esperada (`EM_ESPERA→CONVERTIDA`, disparada implicitamente pelo sucesso de `FinalizarVenda` após um retomar) **não existe em código**. Isso significa que hoje é possível, em tese, retomar a mesma venda em espera duas vezes se a linha não for removida/marcada corretamente — risco a confirmar/mitigar na Fase B do roadmap.

### Transições hoje implícitas em componentes React (documentadas, não corrigidas)

- `finalizando` (booleano em `CaixaPageClient.tsx`) representa o estado `FINALIZANDO` **sem existir como estado nomeado** — é só um `useState<boolean>` que gateia re-cliques no botão, sem máquina de transição validada (nenhum `isAllowedTransition` equivalente ao do scan-pipeline).
- `gerenteModalAberto`/`gerenteToken`/`gerenteValidadoAte` (estados locais) representam, juntos, um sub-estado "autorização de gerente pendente/concedida" que não é modelado como estado formal — é reconstruído por combinação de 3 variáveis booleanas/string independentes.
- `metodoPagamento` (estado local) e `clienteId` (estado local) são, de fato, atributos do aggregate `Venda` em construção, mas vivem fisicamente fora do `useCartStore` — a transição "venda pronta para finalizar" depende de sincronizar manualmente 3 fontes de estado (`useCartStore`, `metodoPagamento`, `clienteId`) que deveriam ser uma só.

**Conclusão da seção:** existe hoje **uma única máquina de estados formalizada em código** no domínio do PDV — a do scan-pipeline (`isAllowedScanStateTransition`). A máquina de estados da *venda* (o que este documento formaliza acima) é, hoje, implícita — distribuída entre nomes de coluna no banco (`status` de `vendas_em_espera`) e variáveis de estado React soltas. **Formalizá-la em código único é o item Fase B do roadmap.**

---

## 3. Single Source of Truth — matriz de autoridade

| Conceito | Arquivo atual (autoridade real) | Camada | Consumidores | Duplicações existentes | Risco |
|---|---|---|---|---|---|
| **Venda** (identidade + status) | RPC `finalizar_venda_transacional_canonica_v4` / `cancelar_venda_transacional` (Postgres) | Server (RPC transacional) | `caixaVendas.impl.ts` (único caller autorizado, enforced por `rpc-gate-guard.mjs`) | Nenhuma — RPC única confirmada | Baixo |
| **Carrinho/Venda-em-construção** (header: forma pagamento, desconto, cliente, idempotência) | **Não existe hoje um único dono.** Ver seção 1.1 — está espalhado entre `useCartStore`, `useCaixaPagamentos`, 2 `useState` locais e 1 `useRef`, montado à mão em `CaixaPageClient.tsx:936-959` | Client (5+ fontes) | `CaixaPageClient.tsx` (montagem manual) | **Confirmado, não hipotético**: web nunca chama `useCartStore.aplicarDescontoGerente` (zero ocorrências); mantém desconto em estado paralelo próprio, deixando os campos de desconto do store permanentemente em default | **Alto — é a fragmentação mais profunda do domínio**, anterior e causadora da fragmentação de item abaixo |
| **Item de venda** | Ver seção 1 — hoje fragmentado em 4 tipos | Client + Server | Todos os módulos de checkout | 4 representações não convergentes (seção 1) | Alto — sintoma da ausência de um Aggregate de Carrinho (linha acima), não a causa raiz |
| **Preço** | RPC `calcular_preco_produto` (Postgres) — web sempre chama; nunca decide localmente | Server (RPC) | `caixaPrecoProduto.impl.ts`, `caixaPrecoAutoritativoServer.ts` (únicos callers autorizados por `pricing-rpc-guard.mjs`) | PDV local (offline) **reimplementa** a mesma cadeia em TS (`resolverPrecoCanonicoLocal.ts` + `core/pricing/calcularPrecoCanonico`) — duplicação **intencional e documentada** (offline-first), garantida só por teste de paridade golden, não por reuso de código | Médio — duplicação assumida, mas exige manutenção de 2 implementações sincronizadas manualmente |
| **Desconto** | Edge Function `validar-gerente` (autorização) + validação redundante na RPC v4 (`strictManagerDiscountAuth`) | Server (Edge Function + RPC) | `caixaGerenteDesconto.impl.ts` | Client (`CaixaGerenteModal.tsx`, `shared-core/src/managerDiscount/policy.ts`) reimplementa o clamp como "defesa em profundidade" — duplicação **documentada como intencional** no próprio código | Baixo — client nunca é a autoridade final |
| **Estoque** | RPC `decrementar_estoque_seguro`, chamada **dentro** da RPC de venda (web) | Server (RPC, transacional na web) | `caixaVendas.impl.ts` (via v4, web); `sync-outbox/index.ts` (PDV local, **fora** da transação de venda) | **Assimetria real, confirmada linha a linha na fonte primária, não estimada**: `backend/supabase/functions/sync-outbox/index.ts:653-665` chama `registrar_venda_com_itens` (a venda commita aqui); só **depois**, linhas 680-684, `aplicarBaixaEstoquePorItem` chama `decrementar_estoque_seguro` **item a item** (linha 606-613), cada um sua própria RPC — não há uma segunda transação que inclua os itens, é um loop de chamadas independentes. Se um item falhar (linha 625-628, exclui só `BAIXA_JA_EXISTE` de idempotência), a exceção é lançada **depois que a venda já existe no banco** | **P0 — não é dívida estética, é risco de divergência permanente** (ver seção 7, item 1) |
| **Pagamento** | Array `p_pagamentos` validado em 3 camadas (client `useCaixaPagamentos.ts` → Zod `finalizarVendaInputSchema` → RPC v4) | Client + Schema + Server | `CaixaPdvMetodoPagamentoSelector.tsx`, `useCaixaPagamentos.ts` | **PDV local não suporta múltiplas formas** — `usePdvLocalVendaCaixaFlow.ts:192` fixa `'DINHEIRO'` (gap funcional, não duplicação) | Médio — paridade funcional incompleta web/local |
| **Cliente** | Tabela `clientes` (Postgres), lida direto por `caixaClientesSearch.impl.ts` | Server (leitura direta, sem gateway) | Modal de seleção de cliente | Nenhuma duplicação de regra — mas nenhum gateway/repositório dedicado (acesso direto `.from()`) | Baixo (só acoplamento arquitetural, não drift de dado) |
| **Operador** | `assertGerenteSession`/`getGerenteUserId` (sessão normalizada) | Server (lib de auth) | Todas as server actions do caixa | Nenhuma | Baixo |
| **Caixa/Turno** | Tabela `caixas`, manipulada só via `caixaSessaoOperador.impl.ts` | Server | `CaixaPageClient.tsx` (via actions) | Nenhuma | Baixo |
| **Fechamento** | RPC `fechar_caixa_atomico` + `calcular_valor_sistema_dinheiro_caixa` | Server (RPC) | `caixaSessaoOperador.impl.ts`, `caixaFechamentoServer.ts` | Nenhuma | Baixo |
| **Documento fiscal** | Inserção **dentro** da própria RPC v4 via flag `p_fiscal_auto_enqueue` (Postgres) | Server (RPC, síncrono ao commit da venda) + Edge Function `fiscal-worker` (processamento assíncrono via `pg_cron`) | Fila `documentos_fiscais_pendentes` | **`caixaFiscalEnqueueServer.ts` é um caminho paralelo não usado** (código morto, seção 6) — se algum dia for reativado sem remover, vira segunda autoridade real | Baixo hoje (está inerte), mas é risco latente se reativado sem decisão |

---

## 4. Boundaries — fluxos textuais

```
┌─────────────────────────────────────────────────────────────────────┐
│                              PDV (caixa)                              │
└─────────────────────────────────────────────────────────────────────┘

PDV → Produtos/Catálogo
  caixaCatalogo.impl.ts ──SELECT direto──▶ produtos, categorias
  caixaPrecoAutoritativoServer.ts ──SELECT direto──▶ produtos (id, preco_varejo, preco_custo, ativo, status_publicacao)
  (sem gateway dedicado; leitura direta reconhecida como aceitável hoje, não oculta)

PDV → Estoque
  leitura:  caixaEstoqueServer.ts ──SELECT direto──▶ estoque (exibição apenas)
  escrita:  caixaVendas.impl.ts ──RPC decrementar_estoque_seguro (dentro da TX de venda, web)──▶ estoque
            sync-outbox/index.ts ──RPC decrementar_estoque_seguro (FORA da TX de venda, PDV local)──▶ estoque
  (escrita sempre via RPC — nunca update direto; mas a atomicidade difere entre web e local)

PDV → Financeiro
  leitura:  caixaTurnoResumo.impl.ts ──SELECT direto──▶ vendas_pagamentos, contas_receber
  escrita:  RPC finalizar_venda_transacional_canonica_v4 ──INSERT implícito, dentro da própria TX──▶ contas_receber
  (a criação do título é efeito colateral da RPC de venda, não uma chamada explícita ao domínio
   financeiro — é um acoplamento "escondido dentro da transação", documentado aqui pela 1ª vez)

PDV → Fiscal
  caminho ativo:   RPC finalizar_venda_transacional_canonica_v4 (flag p_fiscal_auto_enqueue)
                     ──INSERT dentro da TX──▶ documentos_fiscais_pendentes ('PENDENTE')
                     ⋯ (assíncrono, fora do PDV) ⋯
                   fiscal-worker (Edge Function, disparada por pg_cron a cada minuto)
                     ──lê documentos_fiscais_pendentes──▶ chama provider externo──▶ atualiza status
  caminho morto:   caixaFiscalEnqueueServer.ts (enfileirarDocumentoFiscalPosVenda) — RPC
                   fiscal_enfileirar_documento_venda existe, mas zero callers reais (seção 6)

PDV → Compras
  NENHUMA relação direta confirmada (zero ocorrências de "ordens_compra"/"ordem_compra"
  em app/caixa). Compras alimenta Estoque via recebimento; PDV nunca lê/escreve Compras.
  Boundary limpo — nenhuma dependência implícita a documentar aqui.

PDV → Shared Core
  shared-core/src/pdv/*        → scan-pipeline (única state machine formal), invariantes de fechamento
  shared-core/src/caixa/*      → checkoutSnapshot, mapRegrasPreco, variantesChaveLeitura (fonte única,
                                  reexportada por pdv-importados/core/caixa/* — confirmado sem divergência)
  shared-core/src/pricing/*    → cadeia de resolução de preço (contrato; web usa via RPC, local via TS)
  shared-core/src/managerDiscount/* → política de clamp de desconto (client + referência p/ server)
  shared-core/src/stores/unifiedCartStore.ts → carrinho, reexportado identicamente por pdv-importados
                                  (stores/carrinhoStore.ts) e pdv-local (src/stores/cartStore.ts) —
                                  MAS o USO diverge para desconto de gerente (ver seção 1.1): pdv-local
                                  chama store.aplicarDescontoGerente() (App.tsx:989); pdv-importados
                                  NUNCA chama essa ação — mantém desconto em estado paralelo próprio.
                                  Mesma definição de store, dois padrões de consumo não convergentes.
```

---

## 4b. Bounded Contexts e fachadas de domínio (lacuna identificada, agora endereçada)

A seção 4 documentou **como o PDV conversa hoje** com os domínios vizinhos — mas isso é descrição, não decisão. A pergunta arquitetural em aberto é: **o PDV deveria conhecer Produtos/Estoque/Financeiro/Fiscal diretamente, ou apenas uma fachada de cada um?** Consolidar o Aggregate (Fase A) sozinho não resolve isso — dois módulos podem ter tipos de domínio impecáveis e ainda estarem acoplados por leitura/escrita direta cruzada.

### Decisão de bounded contexts

**Sales (PDV)** é o *core domain* desta análise. Os demais são domínios de suporte, cada um com **um único ponto de contato** que o Sales deveria conhecer — não tabelas, não múltiplos arquivos `.impl.ts` fazendo `.from()` cada um à sua maneira.

```
                         ┌───────────────────────┐
                         │   Sales Domain (PDV)   │   ← core domain desta análise
                         └───────────┬───────────┘
                                     │ conhece apenas os 4 ports abaixo — nunca tabela direto
         ┌───────────────┬──────────┴──────────┬───────────────┐
         ▼               ▼                     ▼               ▼
┌─────────────────┐┌──────────────────┐┌──────────────────┐┌─────────────────┐
│  Catalog Port    ││  Inventory Port  ││  Financial Port  ││  Fiscal Port     │
│ (Produtos)       ││ (Estoque)        ││ (Financeiro)     ││ (Fiscal)         │
├─────────────────┤├──────────────────┤├──────────────────┤├─────────────────┤
│ buscarProduto()  ││ baixarEstoque()  ││ registrarSaldo   ││ emitirDocumento  │
│ resolverPreco()  ││ consultarSaldo() ││ Pendente()       ││ FiscalDaVenda()  │
└─────────────────┘└──────────────────┘└──────────────────┘└─────────────────┘
```

### Onde o PDV já respeita esse desenho (sem saber que o está seguindo)

- **Inventory**: escrita já é só via RPC (`decrementar_estoque_seguro`) — nunca update direto de linha. Isso **já é**, na prática, um port de escrita, só não está nomeado/isolado como tal em código TS.
- **Fiscal**: o caminho ativo (via `p_fiscal_auto_enqueue` dentro da RPC v4) também já é, de fato, uma chamada a uma função com contrato bem definido, não uma escrita direta de tabela.

### Onde o PDV viola o desenho — e por que isso é o achado mais importante desta seção

**A criação de `contas_receber` acontece *dentro* da transação da RPC de venda, sem nenhum contrato explícito entre Sales e Financial.** Não é só um problema de acesso a dado (leitura direta de tabela, que é o padrão "menos grave" já catalogado na seção 4) — é uma **decisão de negócio do domínio Financeiro** (criar um título a receber, decidir seu status inicial `ABERTO`) executando *dentro do limite transacional do domínio Sales*, sem que exista um "Financial Port" nomeado que descreva esse contrato. Hoje, se a regra de quando/como criar um título a receber mudar, a mudança acontece dentro do código-fonte da RPC de venda (`finalizar_venda_transacional_canonica_v4`), não em um artefato do domínio Financeiro. É o boundary leakage mais profundo encontrado em toda a auditoria — mais sutil que os `.from()` diretos (que ao menos são leitura, reversível, sem side-effect), porque aqui é **escrita de outro domínio, disfarçada de efeito colateral de uma transação que não deveria, por definição, precisar saber que Financeiro existe**.

**Catalog** também não tem port — `caixaCatalogo.impl.ts` e `caixaPrecoAutoritativoServer.ts` fazem `.from('produtos')` cada um à sua forma, com seleção de colunas diferente. Não há decisão de negócio de Produtos vazando para o Sales aqui (é leitura pura), mas a ausência de um `CatalogPort` único significa que qualquer mudança de coluna em `produtos` exige caçar todos os `.from('produtos')` espalhados no domínio de vendas.

### Recomendação

A consolidação do Aggregate (Fase A) e a introdução de bounded contexts explícitos (ports/fachadas) **são trabalhos paralelos, não sequenciais** — mas a fachada Financial→Sales deveria ser desenhada **antes** de tocar a RPC de venda em qualquer refatoração futura, porque é o único caso onde existe uma decisão de negócio real (não só leitura) cruzando o limite sem contrato. Isso está refletido como nova fase preliminar no roadmap (seção 8).

---

## 5. Eventos do domínio

| Evento | Origem | Consumidores hoje | Efeitos colaterais |
|---|---|---|---|
| `ItemAdicionado` / `ItemRemovido` / `ItemAlterado` | `useCartStore` (client, in-memory) | Nenhum consumidor externo — só recalcula totais no próprio store | Nenhum efeito persistido (é o rascunho) |
| `DescontoAplicado` | `useCartStore.aplicarDescontoGerente` (client) | Recalcula totais exibidos | Nenhum efeito persistido até finalizar |
| `VendaColocadaEmEspera` | RPC `colocar_venda_em_espera` | `CaixaEmAbertoList.tsx` (lista) | Grava linha em `vendas_em_espera` |
| `VendaRetomada` | RPC `retomar_venda_em_espera` | `CaixaPageClient.tsx` (recarrega carrinho) | **Não marca a origem como convertida** (gap confirmado, seção 2) |
| `VendaDescartada` | RPC `descartar_venda_em_espera` | `CaixaEmAbertoList.tsx` | Remove/marca linha em `vendas_em_espera` |
| `VendaFinalizada` (= `SALE_REGISTERED` no banco) | `INSERT INTO venda_eventos` dentro da RPC v4 (`backend/supabase/migrations/228_venda_eventos_ledger.sql:149`) | `caixaVendaEspera.impl.ts` (histórico, via `SELECT` direto — não via tipo `SaleEvent`) | Estoque baixado, pagamento gravado, `contas_receber` criado se aplicável, fiscal enfileirado se habilitado |
| `VendaCancelada` (= `SALE_CANCELLED`) | `INSERT INTO venda_eventos` dentro de `cancelar_venda_transacional` (migration 228, linha 239) | Histórico (leitura direta) | Reversão de efeitos da venda (não auditado em detalhe neste documento) |
| `DevolucaoParcialRegistrada` (= `SALE_PARTIAL_RETURN`) | `INSERT INTO venda_eventos` (migration 228, linha 261; fluxo em `248_devolver_ou_trocar_venda.sql`) | Histórico | Ajuste de estoque/pagamento parcial |
| `DocumentoFiscalEnfileirado` | `INSERT INTO documentos_fiscais_pendentes`, dentro da RPC v4 (via `p_fiscal_auto_enqueue`) | `fiscal-worker` (Edge Function, cron) | Envio ao provider fiscal externo, atualização de status |

**Achado crítico confirmado:** o tipo TypeScript `SaleEvent`/`SaleEventItem`/`SaleEventType` (`shared-core/src/pdv/saleEvent.ts`) **não é importado em nenhum lugar do repositório** (confirmado por grep — a única outra ocorrência do nome é este próprio documento e o relatório da Fase 2). Os eventos reais (`SALE_REGISTERED`/`SALE_CANCELLED`/`SALE_PARTIAL_RETURN`) são inseridos em `venda_eventos` **inteiramente em PL/pgSQL** (migration `228_venda_eventos_ledger.sql`); a leitura de histórico também é `SELECT` direto sem esse tipo. **`SaleEvent` é um tipo aspiracional, nunca conectado ao pipeline real de eventos** — não há hoje uma modelagem de evento de domínio em TypeScript, apesar de o tipo existir. Ver seção 6.

---

## 6. Código morto — auditoria confirmada

Metodologia: para cada arquivo de `app/caixa/**`, `shared-core/src/{caixa,pdv,pricing,managerDiscount}/**` e `core/caixa/**` (113 arquivos, excluindo testes), verificado se o nome do arquivo aparece em algum import fora de si mesmo, em todo o monorepo (`pdv-importados`, `shared-core`, `pdv-local`, `backend`). Achados confirmados individualmente (não apenas por essa varredura mecânica):

1. **`app/caixa/server/caixaFiscalEnqueueServer.ts`** (função `enfileirarDocumentoFiscalPosVenda`) — exportada e reexportada em `caixaActionsInternals.ts`, mas **zero call sites reais** em qualquer server action ou componente. O caminho ativo de enfileiramento fiscal já acontece dentro da própria RPC v4 (`p_fiscal_auto_enqueue`). **Candidato a remoção.**

2. **`app/caixa/server/caixaGerenteValidation.types.ts`** — arquivo inteiro sem nenhuma referência externa (nem mesmo o próprio nome do arquivo aparece em um import em outro lugar). Agrava o achado: `CaixaGerenteModal.tsx:18` define seu **próprio** tipo `ValidarSenhaGerenteResult`, com o mesmo nome mas independente — dois tipos de mesmo nome no domínio, um deles morto. Risco de confusão para quem for editar este módulo. **Candidato a remoção do arquivo órfão.**

3. **`app/caixa/CaixaPdvOperacoesButtons.tsx`** — já marcado no próprio código como `@deprecated`, é um re-export de `CaixaPdvOperacoesMenu` "para stories/legado". Confirmado: nenhum arquivo de story (`.stories.tsx`) ou qualquer outro código referencia `CaixaPdvOperacoesButtons` — a justificativa do próprio comentário não se sustenta mais. **Candidato a remoção.**

4. **`shared-core/src/pdv/saleEvent.ts`** (tipos `SaleEvent`, `SaleEventItem`, `SaleEventType`, `SaleEventSource`) — confirmado sem nenhum import real em todo o monorepo (seção 5). Diferente dos 3 achados acima, **não recomendo remoção** — recomendo **promoção**: é a modelagem correta de evento de domínio que falta ser efetivamente usada (ex.: como contrato de leitura tipado para o histórico, em vez de `SELECT` ad-hoc). Ver Fase C do roadmap.

**Não encontrados** (verificado, não presumido): adapters de `core/caixa/*` sem consumidor — `mapRegrasPreco.ts` e `variantesChaveLeitura.ts` são re-exports confirmados (por diff direto) de `shared-core/src/caixa/*`, sem divergência de conteúdo; `regrasPrecoValidadeFilter.ts` tem consumidor confirmado. Hooks de `app/caixa/hooks/*` — todos têm pelo menos um consumidor confirmado pela varredura. Nenhum outro componente órfão encontrado na varredura de 113 arquivos além dos 3 listados acima.

### Checagem final antes de confirmar remoção (feita, não pendente)

Antes de tratar os 3 candidatos como seguros para remoção, verificados especificamente:

- **`import()` dinâmico** referenciando qualquer um dos 3 nomes de arquivo, em todo o monorepo (`pdv-importados`, `shared-core`, `pdv-local`, `backend`) — zero ocorrências.
- **`lazy(...)`** referenciando qualquer um dos 3 — zero ocorrências.
- **Storybook**: `pdv-importados/.storybook/main.ts` declara `stories: ['../stories/**/*.stories.@(js|jsx|ts|tsx|mdx)']` — glob fechado, não há autodiscovery sobre `app/**`. Só existem 3 arquivos `*.stories.tsx` no repo inteiro (`stories/ui/Button`, `stories/caixa/CaixaHeader`, `stories/design-tokens/Colors`), nenhum referencia os 3 candidatos.
- **Reflexão/string-based** (require dinâmico, concatenação de path) em `.json`/`.mjs`/`.js` de config — zero ocorrências dos 3 nomes.

**Conclusão:** os 3 candidatos de remoção (itens 1-3 acima) estão confirmados como seguros por todos os ângulos verificáveis estaticamente. A remoção em si não foi executada — é decisão de implementação, fora do escopo deste documento.

---

## 7. Dívida técnica priorizada

| # | Item | P | Impacto operacional | Impacto arquitetural | Risco de regressão ao corrigir | Custo de correção | Justificativa |
|---|---|---|---|---|---|---|---|
| 1 | **Assimetria de atomicidade venda↔estoque no PDV local — o item mais importante desta lista** | **P0** | Alto — janela real de **divergência permanente** de estoque em operação offline, não hipotética | Alto — quebra a garantia "venda e baixa são uma coisa só" que a web já tem | Médio — mexe em `sync-outbox`, precisa de teste de concorrência | Médio-Alto | Confirmado linha a linha na fonte primária (`sync-outbox/index.ts:653-684`, seção 3): a venda commita antes de a baixa de estoque sequer começar, item a item, fora de qualquer transação. Se a baixa falhar após a venda já existir, o erro é lançado tarde demais para impedir a inconsistência — é risco de dado incorreto em produção, não dívida estética ou de design |
| 2 | Fragmentação do "item de venda" em 4 tipos (seção 1) | **P0** | Baixo direto, mas todo bug de preço/total futuro nasce daqui | Muito alto — é a causa raiz de qualquer inconsistência futura entre carrinho, snapshot e servidor | Alto se feito tudo de uma vez; baixo se feito incrementalmente (introduzir o tipo canônico primeiro, migrar consumidores depois) | Alto | É pré-requisito de tudo mais na Fase 2 (declarado pelo próprio usuário como prioridade) |
| 3 | Máquina de estados da venda inexistente em código (seção 2) | **P0** | Médio — hoje "funciona" por convenção, mas sem transições policiadas | Alto — impede evolução seguro (ex.: novo estado "aguardando confirmação de pagamento PIX" exigiria tocar código espalhado) | Baixo — é aditivo, não precisa mudar comportamento hoje | Médio | Pré-requisito explícito do usuário (Fase B do roadmap) |
| 4 | `EM_ESPERA` nunca marcada `CONVERTIDA` | **P1** | Médio — risco teórico de retomar a mesma venda 2x | Médio — é o sintoma mais concreto do item 3 | Baixo | Baixo | Já documentado pela própria equipe (`TODO_auditoria_255.md`); é o item mais barato e mais concreto para começar a Fase B |
| 5 | `guard:core`: `ProdutoFormModal.tsx` reimplementa `status_publicacao` fora do core | **P1** | Baixo (não é módulo PDV) | Médio — mesma classe de problema que gerou o item 2, em outro módulo | Baixo — predicado já existe, é troca mecânica | Baixo | Já classificado como violação real (Parte A do relatório anterior); listado aqui por completude de dívida técnica do sistema, não do PDV especificamente |
| 6 | `guard:core`: `LoginForm.tsx` duplica `.ativo === false` sem predicado compartilhado | **P2** | Baixo (autoridade real já é server/edge) | Baixo-Médio | Baixo | Baixo | Já classificado como violação de severidade menor; não bloqueia nada hoje |
| 7 | Código morto confirmado (`caixaFiscalEnqueueServer.ts`, `caixaGerenteValidation.types.ts`, `CaixaPdvOperacoesButtons.tsx`) | **P2** | Nenhum (inerte) | Baixo — mas colisão de nome de tipo (`ValidarSenhaGerenteResult`) é um risco de confusão futura | Muito baixo — são remoções puras, sem consumidor | Muito baixo | Alto valor por baixíssimo custo — recomendo fazer antes mesmo da Fase A, como limpeza isolada |
| 8 | `SaleEvent` (tipo) nunca conectado ao pipeline real de eventos | **P2** | Nenhum hoje | Médio — é a lacuna que impede ter Fase C (eventos de domínio) bem fundamentada | Baixo | Médio (não é remoção, é adoção) | Só vira prioridade quando a Fase C começar; não bloqueia nada agora |
| 9 | `CaixaPageClient.tsx` componente-deus (1.635 linhas, 16 `useState`) | **P3** (nesta ordem) | Baixo direto — funciona hoje | Alto a longo prazo — mas **não deve ser atacado antes das Fases A/B/C**, senão a extração de hooks reproduz a mesma fragmentação em forma nova | Alto se feito antes de A/B/C; baixo se feito depois (Fase D) | Alto | É exatamente por isso que o usuário pediu roadmap por consolidação, não por feature — extrair hooks de um domínio ainda não unificado só move a bagunça |
| 10 | `roundMoney2` triplicado em 3 arquivos | **P3** | Nenhum (comportamento idêntico hoje, verificado) | Baixo-Médio — risco só se a tolerância mudar e um lugar for esquecido | Muito baixo | Muito baixo | Fácil de corrigir, mas de impacto marginal comparado aos itens P0/P1 — não compete por atenção agora |

---

## 8. Roadmap arquitetural (por consolidação, não por feature)

**A UI é a última etapa.** Nenhuma fase abaixo introduz funcionalidade nova — cada uma consolida o que já existe.

### Fase 0 — Bounded contexts explícitos (nova, roda em paralelo à Fase A, não depois)
Nomear e introduzir os 4 ports de domínio vizinho (seção 4b): `CatalogPort`, `InventoryPort`, `FinancialPort`, `FiscalPort`. Prioridade dentro desta fase: `FinancialPort` primeiro — é o único caso hoje onde uma decisão de negócio de outro domínio (criar `contas_receber`) roda escondida dentro da transação de venda, sem contrato nomeado. Consolidar o Aggregate (Fase A) sem isso corre o risco de desenhar o Aggregate em torno de um boundary que ainda vaza.

### Fase A — Aggregate de Carrinho + Item único
**Revisado após investigação da hipótese alternativa (seção 1.1): o Aggregate que falta não é só o item, é o Carrinho/Venda-em-construção como um todo.** Introduzir um único objeto pré-persistência que possua itens, forma de pagamento, desconto de gerente (percentual/valor/token) e cliente selecionado — hoje espalhados entre `useCartStore`, `useCaixaPagamentos`, 2 `useState` locais e 1 `useRef`. Como parte do mesmo trabalho: definir o tipo canônico `Venda`/`ItemDeVenda` (seção 1), migrar `ItemAutoritativo` para ser extensão do DTO de wire (não tipo paralelo), e decidir explicitamente se `pdv-local` e `pdv-importados` devem convergir para o mesmo padrão de uso de `aplicarDescontoGerente` do store (hoje divergem). **Pré-requisito de tudo abaixo.**

### Fase B — Máquina de estados
Formalizar em código a máquina de estados da venda (seção 2), no mesmo padrão de `isAllowedScanStateTransition` do scan-pipeline. Fechar o gap `EM_ESPERA→CONVERTIDA` como parte desta fase (é o item mais concreto e já documentado pela equipe). Resolver os demais itens de `TODO_auditoria_255.md` que dizem respeito a estado (RLS de `vendas_em_espera`, `UNIQUE(operador_id, numero_local)`).

### Fase C — Eventos
Conectar (ou substituir por algo equivalente) o tipo `SaleEvent` ao pipeline real — hoje os eventos existem só como `INSERT` em PL/pgSQL; formalizar a leitura tipada do histórico a partir desse tipo, e usar a lista de eventos da seção 5 como contrato oficial de domínio.

### Fase D — Extração de hooks
Só depois de A+B+C: extrair `CaixaPageClient.tsx` em hooks por responsabilidade (pagamento, desconto de gerente, venda em espera, modais), usando o aggregate e a máquina de estados já consolidados como base — não o inverso. Os testes de integração existentes (`finalizarVendaCaixa.integration.test.ts` etc.) são a rede de segurança desta fase.

### Fase E — UI
Só então, mudanças de interface/UX no PDV (densidade, atalhos, simplificação visual conforme a filosofia geral da missão). Nunca antes de A–D, para não reconstruir a fragmentação atual em forma visual nova.

*(Limpeza do código morto confirmado na seção 6 — checagem final já feita, ver seção 6 — pode ser feita a qualquer momento antes da Fase A, como remoção isolada de baixo risco. Não depende de nenhuma das fases acima.)*

---

## Critério de encerramento (avaliação atual, não uma promessa)

| Critério | Estado hoje |
|---|---|
| Há um Aggregate Root único | ❌ Não — e mais grave do que a versão anterior deste documento registrava: não é só o item (4 representações, seção 1), é o próprio Carrinho/Venda-em-construção que não tem dono único (seção 1.1, confirmado por evidência: web e local usam o mesmo store de forma divergente para desconto de gerente). Fase A. |
| Existe apenas uma máquina de estados | ❌ Não — só o scan-pipeline tem máquina formal; a venda tem transições implícitas (seção 2). Fase B. |
| Todas as regras críticas têm autoridade única | ⚠️ Parcial — preço, desconto, fechamento: sim (RPC/Edge Function únicas). Estoque: **não**, e confirmado como o risco mais sério da auditoria — assimetria de atomicidade web/local verificada linha a linha na fonte (seção 3, P0 real da seção 7). Item de venda: não (fragmentado, seção 1). |
| Boundaries estão explícitos | ⚠️ Parcial, revisado nesta rodada — a seção 4 documenta os fluxos hoje existentes, mas isso é descrição, não fachada. A seção 4b agora nomeia os 4 bounded contexts/ports que faltam (`CatalogPort`, `InventoryPort`, `FinancialPort`, `FiscalPort`) e aponta o vazamento mais grave: criação de `contas_receber` (decisão do domínio Financeiro) rodando dentro da transação de Sales sem contrato nomeado. Documentar o fluxo atual não é o mesmo que ter a fachada — por isso o critério não pode ser marcado ✅ ainda. |
| Não existem decisões duplicadas entre UI e Core | ❌ Não — 2 violações confirmadas de `guard:core` fora do PDV (Produtos, Login) e, dentro do PDV, defesas em profundidade documentadas (desconto) que são intencionais mas ainda duplicam a condição literal. |
| Nova funcionalidade pode seguir a arquitetura sem criar nova fonte de verdade | ❌ Ainda não — só será verdade depois das Fases 0/A–C. Hoje, qualquer feature nova no PDV tende a criar um 5º tipo de "item de venda", uma nova variável de estado solta no componente, ou um novo `.from()` direto a um domínio vizinho, pelo padrão observado. |

**Conclusão:** o domínio do PDV não está consolidado — e a investigação desta rodada aprofundou, não suavizou, o diagnóstico: a fragmentação começa no Carrinho (não só no Item), a assimetria de estoque é risco operacional real (não dívida estética), e falta a camada de bounded contexts que impediria a próxima feature de recriar o acoplamento atual. Este documento é a referência para consolidar isso, na ordem 0→A→B→C→D→E (Fase 0 em paralelo com A, não depois). Nenhuma implementação de feature deveria começar antes disso.
