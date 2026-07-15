# Arquitetura Canônica do PDV — Documento de Referência Oficial

**Data:** 2026-07-15
**Branch:** `claude/jinlong-rebuild-9c9sq2` (PR #189)
**Natureza:** documento de arquitetura. Nenhum código foi alterado, refatorado ou implementado para produzi-lo. Toda afirmação abaixo é evidência verificada (arquivo + linha, quando aplicável), não suposição. Consolida `RELATORIO_FASE2_MAPA_DOMINIO_PDV.md` numa decisão de arquitetura única, para servir de referência a toda evolução futura do PDV.

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
| **Item de venda** | Ver seção 1 — hoje fragmentado em 4 tipos | Client + Server | Todos os módulos de checkout | 4 representações não convergentes (seção 1) | **Alto** — é a maior fragmentação do domínio |
| **Preço** | RPC `calcular_preco_produto` (Postgres) — web sempre chama; nunca decide localmente | Server (RPC) | `caixaPrecoProduto.impl.ts`, `caixaPrecoAutoritativoServer.ts` (únicos callers autorizados por `pricing-rpc-guard.mjs`) | PDV local (offline) **reimplementa** a mesma cadeia em TS (`resolverPrecoCanonicoLocal.ts` + `core/pricing/calcularPrecoCanonico`) — duplicação **intencional e documentada** (offline-first), garantida só por teste de paridade golden, não por reuso de código | Médio — duplicação assumida, mas exige manutenção de 2 implementações sincronizadas manualmente |
| **Desconto** | Edge Function `validar-gerente` (autorização) + validação redundante na RPC v4 (`strictManagerDiscountAuth`) | Server (Edge Function + RPC) | `caixaGerenteDesconto.impl.ts` | Client (`CaixaGerenteModal.tsx`, `shared-core/src/managerDiscount/policy.ts`) reimplementa o clamp como "defesa em profundidade" — duplicação **documentada como intencional** no próprio código | Baixo — client nunca é a autoridade final |
| **Estoque** | RPC `decrementar_estoque_seguro`, chamada **dentro** da RPC de venda (web) | Server (RPC, transacional na web) | `caixaVendas.impl.ts` (via v4, web); `sync-outbox/index.ts` (PDV local, **fora** da transação de venda) | **Assimetria real, não intencional**: web é atômico, PDV local não (baixa acontece depois do registro da venda, mitigado por idempotência mas não por atomicidade) | **Alto** — janela de inconsistência real no PDV local |
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
  shared-core/src/stores/unifiedCartStore.ts → carrinho, consumido IDENTICAMENTE por pdv-importados
                                  (via stores/carrinhoStore.ts, reexport) e pdv-local
                                  (via src/stores/cartStore.ts, reexport) — sem duplicação de cálculo
```

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

---

## 7. Dívida técnica priorizada

| # | Item | P | Impacto operacional | Impacto arquitetural | Risco de regressão ao corrigir | Custo de correção | Justificativa |
|---|---|---|---|---|---|---|---|
| 1 | Assimetria de atomicidade venda↔estoque no PDV local | **P0** | Alto — janela real de inconsistência de estoque em operação offline | Alto — quebra a garantia "venda e baixa são uma coisa só" que a web já tem | Médio — mexe em `sync-outbox`, precisa de teste de concorrência | Médio-Alto | Único item da lista com risco de dado incorreto em produção hoje, não só dívida de design |
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

### Fase A — Aggregate único
Definir e introduzir o tipo canônico `Venda`/`ItemDeVenda` (seção 1). Migrar `ItemAutoritativo` para ser uma extensão do DTO de wire, não um tipo paralelo. `ItemCarrinho` e `CheckoutSnapshotItem`/`FinalizarVendaInput.itens` permanecem, mas passam a derivar do mesmo tipo-base em vez de serem definidos de forma independente. **Pré-requisito de tudo abaixo.**

### Fase B — Máquina de estados
Formalizar em código a máquina de estados da venda (seção 2), no mesmo padrão de `isAllowedScanStateTransition` do scan-pipeline. Fechar o gap `EM_ESPERA→CONVERTIDA` como parte desta fase (é o item mais concreto e já documentado pela equipe). Resolver os demais itens de `TODO_auditoria_255.md` que dizem respeito a estado (RLS de `vendas_em_espera`, `UNIQUE(operador_id, numero_local)`).

### Fase C — Eventos
Conectar (ou substituir por algo equivalente) o tipo `SaleEvent` ao pipeline real — hoje os eventos existem só como `INSERT` em PL/pgSQL; formalizar a leitura tipada do histórico a partir desse tipo, e usar a lista de eventos da seção 5 como contrato oficial de domínio.

### Fase D — Extração de hooks
Só depois de A+B+C: extrair `CaixaPageClient.tsx` em hooks por responsabilidade (pagamento, desconto de gerente, venda em espera, modais), usando o aggregate e a máquina de estados já consolidados como base — não o inverso. Os testes de integração existentes (`finalizarVendaCaixa.integration.test.ts` etc.) são a rede de segurança desta fase.

### Fase E — UI
Só então, mudanças de interface/UX no PDV (densidade, atalhos, simplificação visual conforme a filosofia geral da missão). Nunca antes de A–D, para não reconstruir a fragmentação atual em forma visual nova.

*(Limpeza do código morto confirmado na seção 6 pode ser feita a qualquer momento antes da Fase A, como remoção isolada de baixo risco — não depende de nenhuma das fases acima.)*

---

## Critério de encerramento (avaliação atual, não uma promessa)

| Critério | Estado hoje |
|---|---|
| Há um Aggregate Root único | ❌ Não — 4 representações não convergentes (seção 1). Este documento define qual deve prevalecer; a convergência é trabalho da Fase A, ainda não feito. |
| Existe apenas uma máquina de estados | ❌ Não — só o scan-pipeline tem máquina formal; a venda tem transições implícitas (seção 2). Fase B. |
| Todas as regras críticas têm autoridade única | ⚠️ Parcial — preço, desconto, fechamento: sim (RPC/Edge Function únicas). Estoque: não (assimetria web/local, item P0). Item de venda: não (fragmentado). |
| Boundaries estão explícitos | ✅ Sim, agora — este documento (seção 4) é a primeira vez que os fluxos PDV↔Produtos/Estoque/Financeiro/Fiscal/Compras/Shared-Core estão documentados textualmente com evidência. |
| Não existem decisões duplicadas entre UI e Core | ❌ Não — 2 violações confirmadas de `guard:core` fora do PDV (Produtos, Login) e, dentro do PDV, defesas em profundidade documentadas (desconto) que são intencionais mas ainda duplicam a condição literal. |
| Nova funcionalidade pode seguir a arquitetura sem criar nova fonte de verdade | ❌ Ainda não — só será verdade depois das Fases A–C. Hoje, qualquer feature nova no PDV tende a criar um 5º tipo de "item de venda" ou uma nova variável de estado solta, pelo padrão observado. |

**Conclusão:** o domínio do PDV não está consolidado. Este documento é a referência para consolidá-lo, na ordem A→B→C→D→E. Nenhuma implementação de feature deveria começar antes da Fase A.
