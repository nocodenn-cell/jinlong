# UX-03 — Decisões de produto para congelar o modelo operacional do Jinlong

| Campo | Valor |
|---|---|
| Data | 2026-09-18 |
| Natureza | **Análise.** Nenhum código, banco, RPC, contrato, regra ou UI foi alterado. |
| Base | `docs/BLUEPRINT_OPERACIONAL_UX02.md` · `docs/DECISOES_PRODUTO_UX02_1.md` · leitura do código, das migrações e dos ADRs 008/010 |
| Objetivo | Transformar evidências em decisões que o dono do produto possa tomar, para congelar o Blueprint UX-02 antes do backlog de implementação. |

## Como ler: categorias (nunca misturadas)

| Tag | Categoria | Significa |
|---|---|---|
| **[F]** | FATO COMPROVADO | Lido no código/migração (arquivo citado). Não é opinião. |
| **[B]** | BUG COMPROVADO | Comportamento incorreto demonstrável pela leitura, sem depender de decisão. |
| **[UX]** | PROBLEMA DE UX | O operador não descobre / não entende / não recebe feedback. |
| **[DP]** | DECISÃO DE PRODUTO | Depende de regra de negócio ou de vocabulário do dono do produto. |
| **[DA]** | DECISÃO DE ARQUITETURA | Depende de fronteira de domínio, schema ou contrato. |
| **[H]** | HIPÓTESE | Plausível, **não** comprovada. |
| **[T]** | TESTE NECESSÁRIO | O que precisa ser verificado (em banco ou com operador) antes de decidir. |

Em cada decisão, **Evidências** só contém [F]/[B]; **Problemas** só [UX]; **Opções** só [DP]/[DA]; **Hipóteses e testes** só [H]/[T]. O que **não foi executado contra um banco** está marcado.

**Princípio de conservação.** Cada decisão declara se é **"mudar o modelo"** ou **"expor melhor o modelo existente"**. Só há reconstrução recomendada quando a evolução incremental não resolve — e, nesta análise, **nenhuma** decisão exige reconstrução.

---

## 1. Resumo executivo

1. **[F] O Jinlong tem três motores de entrada de mercadoria, cada um centrado num "documento principal" diferente** — o Pedido (OC), a NF-e e o Recebimento sem documento. Cada um tem a própria conferência, o próprio efeito no estoque e nenhum enxerga os outros.
2. **[F] O schema já contém o vocabulário das "3 portas"** propostas para "Entrada de mercadoria": `remessas.origem_tipo ∈ {NFE, ORDEM_COMPRA, SEM_DOCUMENTO}`, descrito como "pré-preenchimento, nunca comportamento". **Nenhum motor o usa** e a RPC de entrada manual nunca o preenche. A ideia de unificar é anterior a esta análise — nunca foi concluída.
3. **D-2 (Entrada de mercadoria):** faz sentido como **camada de navegação**, mas as 3 portas **não são equivalentes** — são **2 origens reais** (NF-e; sem documento) e **1 referência opcional** (o pedido). Uma página de "porta única" antes de D-1 é uma **fachada**: promete unidade e entrega três comportamentos diferentes (só a NF-e gera conta a pagar e atualiza custo).
4. **D-1 (Pedido → Recebimento → NF-e):** é a única decisão que **muda o modelo**. Hoje o pedido é ao mesmo tempo intenção e motor de recebimento, **não tem recebimento parcial** e, se a mercadoria entra por outro caminho, ele fica "pendurado": só sai **recebendo de novo (duplica estoque)** ou **cancelando (perde o histórico)**.
5. **D-3 (Contas a pagar):** hoje é **consequência exclusiva da confirmação de uma NF-e**. O schema já aceitaria título avulso (só exige fornecedor), as **categorias financeiras existem mas não ligam a nenhum título**, e o Contas a Receber **tem** criação manual — há assimetria.
6. **D-4 (Venda a prazo):** **não existe como conceito.** É o **resultado implícito de pagamento parcial com cliente** ("underpay permitido", Fase 5b). O título nasce **sem vencimento** — e por isso **nunca pode aparecer como "vencido"** —, o limite de crédito padrão é **0 em modo AVISO** e o aviso **não chega à tela**.
7. **D-5 (documento principal):** a cadeia que melhor descreve o Jinlong é **Pedido (intenção, opcional) → Entrada (evento físico, com origem NF-e ou sem documento) → Estoque/Custo → Conta a pagar (só com NF-e)**; e **Venda → Pagamento(s) → Caixa → Conta a receber (saldo) → Recebimento**. Há 10 ambiguidades mapeadas (§6).
8. **O que muda modelo × o que só expõe:** D-2 e D-3-A são **expor**; D-4 é **expor** (nomear/mostrar) até se decidir vencimento/condição, quando vira **mudar**; D-1 e D-3-B **mudam** (D-1 exige schema aditivo e alteração de 2 RPCs).
9. **Bloqueadores do congelamento do Blueprint:** D-5 (vocabulário/modelo), D-1 e D-4. **Podem esperar:** D-3-B (validar com o cliente) e a página de D-2.

**Recomendações em uma linha cada:** D-1 → vínculo **opcional** do pedido na entrada, **encerrando o pedido por escolha do operador**, por schema aditivo, em etapas. D-2 → **camada de ação** ("Entrada de mercadoria") no hub de Estoque e no Início, sem página nova nem item de menu, com texto de consequência por porta. D-3 → **A agora** (bem exposta); **B** só após validar com o cliente. D-4 → **nomear e mostrar o que existe agora**; decidir condição/vencimento antes de qualquer mudança de regra. D-5 → **congelar o vocabulário Pedido/Entrada/Nota**.

---

## 2. D-1 — Pedido → Recebimento → NF-e

### PROBLEMA
Uma mesma mercadoria pode ser lançada por três caminhos que creditam estoque **sem se conhecerem**. O pedido não sabe que a mercadoria chegou por outro caminho; a nota não sabe do pedido.

### ESTADO ATUAL

**Os três motores** ([F], todos comprovados nas migrações):

| | Pedido (OC) | Recebimento sem documento | NF-e |
|---|---|---|---|
| RPCs | `registrar_conferencia_ordem_compra` + `receber_ordem_compra` (1 clique, 2 chamadas) | `criar_confirmar_remessa_entrada` (1 RPC: conferência e confirmação fundidas) | `importar_nfe_transacao` → `registrar_conferencia_nfe` → `confirmar_importacao_nfe` |
| Conferência | por item (CONFERIDO/DIVERGENTE); obrigatória | quantidade conferida > 0 no mesmo payload | por item; obrigatória |
| Quando o estoque muda | ao `receber` | imediatamente | ao `confirmar` |
| Kardex (`tipo_codigo`) | `ENTRADA_OC` | `ENTRADA_REMessa_LOJA` | `ENTRADA_NFE` |
| Rastreio no Kardex | só texto em `observacao` ("Recebimento OC <id>") | **FK** `remessa_id` | só texto em `observacao` ("Importação NF-e <id>") |
| Atualiza custo | não | não | **sim** (`atualizar_custo`, padrão true; pulado se violar margem) |
| Gera conta a pagar | não | não | **sim** (1 por duplicata do XML) |
| Idempotência | status (`EM_TRANSITO`→`RECEBIDA`) | `idempotency_key` + `payload_hash` | `UNIQUE (chave_acesso)` + status |
| Itens por operação | vários | **1 produto por envio** | vários |
| Referência a outro documento | nenhuma | `origem_tipo`/`origem_ref` **existem e não são usados** | nenhuma |

### EVIDÊNCIAS ([F] e [B])
- **[F]** FK de itens: `ordens_compra_itens.ordem_id → ordens_compra` (`109_ordens_compra.sql`). `movimentos_estoque_log` só tem FK para `remessa_id` (`034_…sql:47-58`) e `venda_id` (`127_…sql`).
- **[F] Atualização 2026-10-07:** `importacoes_nfe.ordem_compra_id` **existe** como FK nullable → `ordens_compra(id)` desde mig. `20260918100000_oc_recebimento_parcial.sql` (índice parcial + uso em `confirmar_importacao_nfe` / vínculo). **Remessa** ainda não tem coluna FK `ordem_compra_id`: o vínculo opcional continua **textual** via `origem_tipo=ORDEM_COMPRA` + `origem_ref` (texto do UUID) em `criar_confirmar_remessa_entrada(p_ordem_compra_id)` — dívida residual UX-03.
- **[F]** `receber_ordem_compra` exige `status='EM_TRANSITO'` e conferência completa, credita `quantidade_conferida`, grava `quantidade_recebida` e **sempre** fecha a OC como `RECEBIDA` — mesmo com menos do que o pedido (`20260805193920_295_…sql:126-209`). **Não há recebimento parcial.**
- **[F]** Transições da OC: `EM_TRANSITO → RECEBIDA | CANCELADA`; `RECEBIDA` e `CANCELADA` são terminais (`app/gerente/compras/actions.ts:15-21`).
- **[F]** `criar_confirmar_remessa_entrada(p_origem, p_observacao, p_itens, p_idempotency_key)` não recebe id de OC e não toca `ordens_compra` (`20260828150000_…sql:43-200`). O vínculo opcional de OC (S8/RM-14, "Opção 1") só **valida** que a OC não está `RECEBIDA` (`recebimento/actions.ts:164-180`). Teste de caracterização: `actions.vinculoOc.naoBaixaOc.characterization.test.ts`.
- **[F]** Migração `20260801120000`: *"NF-e e ordem de compra NÃO passam a usar `remessas` nesta onda. A coluna `origem_tipo` cria o vocabulário para isso sem mexer nos dois fluxos."* Colunas: `origem_tipo ∈ {NFE, ORDEM_COMPRA, SEM_DOCUMENTO}` (default `SEM_DOCUMENTO`) e `origem_ref` ("chave da NF-e, id da ordem de compra, ou NULL"). Nenhum código do app nem RPC as preenche.
- **[F]** `confirmar_importacao_nfe` credita estoque, atualiza custo e cria as contas a pagar; **não** consulta OC (`20260830110000_…sql`). `UNIQUE (chave_acesso)` impede importar a mesma NF-e duas vezes (`075_importacao_nfe_compra.sql:68`).
- **[F]** ADR-008 lista remessa, NF-e, transferência e ajuste como fluxos do domínio Inventory; **a OC não aparece** nem como domínio nem como orquestração. ADR-008 §1: "Valuation / custo médio — fora de escopo".
- **[F]** No modal do pedido em trânsito as quantidades já nascem preenchidas com `quantidade_recebida` (0 no início) — o operador digita (`OcDetalheModal.tsx:56-66`).

**Cenários reais e o resultado hoje** ([F], derivados dos itens acima):

| # | Situação | Caminho possível | O que acontece com o pedido | Custo / Financeiro |
|---|---|---|---|---|
| S1 | Pedido feito; mercadoria chega **com NF-e** | NF-e | **Fica "Em trânsito" para sempre**; só sai por Receber (duplica estoque) ou Cancelar (perde o histórico de que foi atendido) | custo e conta a pagar ✔ |
| S2 | Pedido feito; chega **sem nota** | Pedido (Receber) | Fecha ✔ | nenhum |
| S3 | Pedido feito; **entrega parcial** | Pedido | **Fecha mesmo com quantidade menor**; o resto não pode ser recebido depois | nenhum |
| S4 | Sem pedido; com NF-e | NF-e | — | ✔ |
| S5 | Sem pedido; sem documento | Recebimento (1 produto por vez) | — | nenhum |
| S6 | NF **em papel**, sem XML | só Recebimento sem documento | — | **não gera conta a pagar nem custo** |
| S7 | 1 NF cobre 2 pedidos, ou 2 NFs cobrem 1 pedido | — | **não modelado** | — |

**[F]** Consequência de S1 no estoque: a mesma mercadoria pode ser creditada duas vezes (por `receber_ordem_compra` e por `confirmar_importacao_nfe`), sem nenhuma trava entre elas.

### PROBLEMAS DE UX ([UX])
- O operador não tem como saber, ao olhar um pedido "Em trânsito", se a mercadoria dele já entrou por outro caminho.
- "Vincular a uma Ordem de Compra" sugere baixa que não acontece (mitigado com texto de ajuda e aviso na UX-02.1).
- Nada indica ao operador **qual caminho escolher** quando tem pedido **e** nota (S1) — e o caminho errado (pedido) faz perder custo e conta a pagar.

### HIPÓTESES E TESTES
- **[H]** Na prática, a maioria das entregas de fornecedor formal chega com NF-e (S1) — o cenário mais frequente seria justamente o pior tratado.
- **[T]** Perguntar ao cliente 1: "quando você faz um pedido e a mercadoria chega, o que você tem em mãos? Chega parcial com frequência?"
- **[T]** Reproduzir S1 em banco de teste (pedido em trânsito → NF-e confirmada → Receber pedido) para registrar o duplo crédito no Kardex. **Não foi executado nesta análise.**

### OPÇÕES ([DP]/[DA])

**M0 — Expor e avisar (modelo atual + UX).** Motores independentes; UI explica.
- Vantagens: zero risco de dados; já parcialmente feito. Desvantagens: S1, S3 e S6 continuam ruins; pedido continua "pendurado".
- Usuário: precisa lembrar de "um caminho por mercadoria". Técnico: nenhum. Arquitetura: nenhuma.
- Schema/RPC: **não**. Só UX: **sim** (textos, ordem das opções, recomendação de caminho).

**M1 — Pedido como referência, sem baixa.** `ordem_compra_id` (nullable) gravado na entrada/NF-e; o pedido passa a **mostrar** "recebido por NF-e X / entrada Y".
- Vantagens: rastreabilidade sem mudar máquina de estados do pedido. Desvantagens: **não** resolve o pedido pendurado nem o duplo crédito (só torna visível).
- Usuário: vê o vínculo. Técnico: coluna + parâmetro nas RPCs + leitura. Arquitetura: FK nova entre Inventory e Compras.
- Schema/RPC: **sim** (aditivo). Só UX: não.

**M2 — Vínculo com encerramento (estilo Bling: pedido ↔ nota com situação Total/Parcial).** M1 + a confirmação da entrada/NF-e **atualiza o pedido** na mesma transação.
- Variante **A**: vincular sempre encerra o pedido. Variante **B**: o operador escolhe **encerrar** ou **manter aberto** (chegada parcial); `quantidade_recebida` acumula.
- Vantagens: resolve S1 e (na B) S3; elimina o pedido pendurado e o duplo crédito quando o vínculo é usado. Desvantagens: mexe na máquina de estados (B exige distinguir "aberto parcialmente recebido"); exige casar itens (produto do pedido × produto da nota, após o De-Para); regra para 1 NF × N pedidos.
- Usuário: 1 campo opcional ("Pedido") e 1 escolha ao confirmar. Técnico: 2 RPCs alteradas (`criar_confirmar_remessa_entrada`, `confirmar_importacao_nfe`) com `FOR UPDATE` no pedido; validação de loja/fornecedor/status. Arquitetura: passa a existir relação Compras↔Inventory.
- Schema/RPC: **sim**. Só UX: não.

**M3 — Pedido vira só "pedido"; recebimento sempre pela Entrada.** Remove o "Receber" próprio do pedido; ele passa a abrir a Entrada pré-preenchida (`origem_tipo=ORDEM_COMPRA`).
- Vantagens: um só lugar para receber. Desvantagens: a Entrada manual hoje tem **1 produto por envio** — o pedido é o único caminho multi-item sem documento; exigiria multi-item. Mais visível e arriscado para o usuário atual.
- Schema/RPC: sim (multi-item, `origem_*`). Só UX: não.

**M4 — Um único motor (Recebimento com origem NF-e | Pedido | Sem documento).** É o **destino declarado** pela migração `20260801120000`.
- Vantagens: modelo limpo. Desvantagens: reescreve três motores maduros e testados; **contraria o princípio de conservação**. Não recomendado agora.

### IMPACTO NO USUÁRIO
M0: continua exigindo disciplina. M1: mais transparência. M2: o fluxo "pedi → chegou → lancei a nota → pedido encerrou" funciona sozinho. M3: um só botão, mas a jornada do pedido muda. M4: tudo muda.

### DECISÃO NECESSÁRIA (dono do produto)
Q1–Q4 da §12.

### RECOMENDAÇÃO
**M0 agora (já entregue) → M2 variante B em etapas.** Progresso 2026-10: (2 parcial) FK `importacoes_nfe.ordem_compra_id` **já aplicada** (mig 20260918); falta FK/coluna canônica em `remessas` (ainda `origem_ref` textual). Sequência restante: (1) decidir Q1–Q4 abertos; (2b) FK aditiva em `remessas` se produto exigir; (3) completar UX do vínculo NF-e; (4) manter `receber_ordem_compra` com trava `RECEBIDA`. **M4 fica como destino de longo prazo**, sem prazo.

---

## 3. D-2 — "Entrada de Mercadoria"

### PROBLEMA
A hipótese: uma experiência única com **[Tenho uma NF-e] [Tenho uma Ordem de Compra] [Sem documento]**. Precisa-se saber se ela resolve o problema real (descoberta) sem criar outros.

### ESTADO ATUAL
- **[F]** A NF-e é a 4ª de 5 abas do hub Estoque ("Importar NF-e"); o recebimento sem documento é a 2ª ("Recebimento", com título "Recebimento e remessa" e selo "Entrada sem NF"); o pedido vive em "Compras", dentro de "Mais" (fechado por padrão) (`estoqueHubNav.ts`, `adminV2SidebarNav.ts`). Existe também um botão no cabeçalho de Estoque.
- **[F]** `adminV2SidebarNav.test.ts` trava: "CORE tem no máximo 10 itens (Sprint 6)" e "recebimento e transferências não são entradas separadas na sidebar". O commit `d428eaed` promoveu Recebimento/Relatórios ao CORE com o argumento "tarefa diária de loja"; o hub de Estoque depois absorveu o Recebimento.
- **[F]** As 3 portas propostas **já são o vocabulário do schema** (`origem_tipo`). O código não o realiza.

### EVIDÊNCIAS
Ver §2 (comportamento por motor) e o item acima. **[F]** Só a NF-e gera conta a pagar e atualiza custo; só o pedido e a NF-e aceitam vários itens; só o recebimento sem documento é 1 produto por vez.

### PROBLEMAS DE UX ([UX])
- O primeiro clique é ambíguo: "Estoque" (não diz "nota fiscal") ou "Compras" (escondido e semanticamente sobre pedido).
- O nome "Recebimento" designa **três coisas** (aba, ação do pedido, etapa da NF-e).
- Nada explica, antes de escolher, o que cada caminho **faz** (conta a pagar? custo?).

### AVALIAÇÃO DA HIPÓTESE

**Que problema resolve.** **[UX]** Concentra a decisão "chegou mercadoria" num ponto só e permite descrever a consequência de cada caminho antes da escolha.

**Que problemas pode criar.**
1. **Falsa equivalência.** "Tenho uma OC" não é um documento que **acompanha** a mercadoria: é uma **expectativa interna**. Como porta independente ela leva ao motor do pedido, que **não** gera conta a pagar nem custo — o operador com pedido **e** nota escolheria o pior caminho justamente pelo destaque.
2. **Fachada.** Prometer "porta única" com três comportamentos distintos gera surpresa depois da escolha.
3. **Duplicação de navegação** (aba de Estoque + página + eventual menu) e conflito com as travas de teste do menu.
4. **Acoplamento com D-1:** o conceito só vira "porta de verdade" se D-1 escolher M2/M3/M4; com M0 é sinalização.

**[H]** O modelo honesto tem **2 origens reais** (NF-e; sem documento) e **1 referência opcional** (o pedido), que se anexa a qualquer uma delas. Isso coincide com a definição de `origem_tipo` ("determina o pré-preenchimento, nunca o comportamento").

### OPÇÕES ([DP]/[DA])

| Opção | O que é | Muda domínio? | Exige rota/menu novo? |
|---|---|---|---|
| **L0** | Só renomear (aba "Importar NF-e" → "Nota fiscal de entrada"; "Recebimento" → "Entrada sem nota") | não | não |
| **L1** | **Camada de ação**: botão primário **"Entrada de mercadoria"** (Estoque e Início) que abre as portas, cada uma com **texto de consequência** | não | **não** |
| **L2** | **Página** "Entrada de mercadoria" (aba nova do hub) com portas + "Em andamento" (importações aguardando conferência, pedidos em trânsito) | não | 1 aba, rotas atuais mantidas |
| **L3** | **Item de menu** novo | não | sim — **conflita com Sprint 6** (CORE ≤ 10, hubs) |
| **L4** | Busca global por intenção | não | não |

- **Quais fluxos devem aparecer:** (a) *Tenho a NF-e (XML)* → importação; (b) *Não tenho nota* → recebimento sem documento; (c) *Chegou um pedido que fiz* → **rota do pedido (motor atual)**, rotulada com a consequência ("credita estoque; não gera conta a pagar"); e, em "Em andamento": importações aguardando conferência, pedidos em trânsito.
- **Quais NÃO devem ser misturados:** Transferência entre lojas (movimento, não entrada), Etiquetas, Ajuste de saldo (com motivo), Devolução ao fornecedor (saída), Cadastro de produto com estoque inicial (Produtos) e o **ato de comprar** (criar o pedido), que é "Compras", não "Entrada".
- **Coexistência com as rotas atuais:** L1/L2 são **apresentação**: `/admin/estoque/recebimento`, `/importar-nfe` e `/compras` continuam existindo e são o destino das portas. **Só UX**, sem mudança de domínio (até D-1 decidir M2+).

### VANTAGENS / DESVANTAGENS
L1: barata, reversível, sem tocar no menu; mas não muda o modelo. L2: mais descobrível e comporta "Em andamento"; mais superfície para manter. L3: máxima visibilidade; contraria decisão registrada. L0: trivial; insuficiente sozinha.

### IMPACTO NO USUÁRIO
O operador passa a decidir por **o que tem em mãos**, e vê a consequência antes de clicar.

### IMPACTO TÉCNICO / ARQUITETURA
L0–L2: só front-end, i18n, testes de navegação. Nenhum schema/RPC. **A porta "pedido" só deixa de ser um caminho paralelo depois de D-1.**

### DECISÃO NECESSÁRIA
Q5–Q6 da §12.

### RECOMENDAÇÃO
**L1 agora (+ L0 quando o vocabulário for aprovado); reavaliar L2 depois de D-1.** Sem item de menu novo: manter a decisão de Sprint 6 até o dono do produto dizer o contrário. Tratar o pedido como **referência** na explicação ("se tiver pedido, informe-o") e **não** como terceira porta de mesmo peso. **[T]** Antes/depois: teste de primeiro clique com 3 operadores ("recebi mercadoria com nota — onde lanço?"). **É "expor melhor o modelo existente".**

---

## 4. D-3 — Contas a pagar

### PROBLEMA
"Quanto devo?" só reflete o que veio de NF-e. Precisa-se decidir se o Contas a Pagar é sempre consequência de um documento ou também pode existir sozinho.

### ESTADO ATUAL
Ver EVIDÊNCIAS. Modelo atual = **A1** (só NF-e).

### EVIDÊNCIAS ([F] e [B])
- **[F] Quem gera:** somente `confirmar_importacao_nfe`, **na confirmação** (não na importação), um título por duplicata do XML (`20260830110000_…sql`). Não há `INSERT` em `contas_pagar` na aplicação nem RPC de criação.
- **[F] Sem duplicatas no XML** (`<cobr>` ausente, ex.: compra à vista): nenhum título e nenhum aviso.
- **[F] Criação manual:** inexistente; a tela diz "sem lançamento manual" (`pt.json` `contas_pagar.origem_nfe_hint`).
- **[F] Schema** (`108_contas_pagar_schema_e_rpc_pagamento.sql:14-31`): `fornecedor_id NOT NULL`, `vencimento NOT NULL`, `valor_total > 0`, `nfe_importacao_id` **nullable**, `descricao` e `observacao` existem. O schema **tolera** título sem NF-e; só exige fornecedor cadastrado.
- **[F] Relação com fornecedor:** o fornecedor é criado/atualizado por CNPJ na importação da NF-e; o título aponta `fornecedor_id`.
- **[F] Relação com recebimento/pedido:** nenhuma. Receber pedido ou entrada sem nota **não** cria conta a pagar.
- **[F] Pagamento e cancelamento existem** (`registrar_pagamento_contas_pagar`; em dinheiro gera sangria de caixa; `cancelar_conta_pagar` estorna os pagamentos).
- **[F] Assimetria com o Contas a Receber:** o CR tem criação manual (`receivableWriter.ts` → `contas_receber` com `descricao` e `vencimento`); o AP não.
- **[F] Categorias financeiras:** existe CRUD de categorias, mas **nenhuma coluna de `contas_pagar` ou `contas_receber` as referencia** — hoje não classificam nada.
- **[F] ADR-010** atribui AP ao domínio Financial, mas o contrato tem só `PayableReader` e `PayablePaymentService` — **não há `PayableWriter`**; a criação está dentro de uma RPC do fluxo de estoque.
- **[B] Dados gerados pela NF-e:** `descricao` fica vazia e `nfe_numero` recebe o **número da duplicata** (`v_dup.numero_duplicata`), não o da NF-e — a tela mostra "NF-e #001" (`20260830110000_…sql:126-135`).
- **[F] Como o usuário chega ao título:** menu Financeiro → aba "A pagar"; após a UX-02.1 também pela tela final da NF-e, por Fornecedores e pelo link da NF-e no próprio título.
- **[F]** Os KPIs "Em aberto/Atrasadas" da aba somam **só as linhas já carregadas** (verificado na UX-02).

### PROBLEMAS DE UX ([UX])
"Quanto devo" ignora aluguel, energia, frete avulso e NF em papel; as categorias "existem" sem efeito; KPI parcial sugere total.

### HIPÓTESES E TESTES
- **[H]** O lojista real tem despesas fora de NF-e que quer acompanhar ("preciso pagar a energia amanhã").
- **[T]** Perguntar ao cliente 1: "hoje, onde você anota o que precisa pagar que não é nota de fornecedor?"
- **[T]** Confirmar se a fatia de compras com **NF em papel/sem XML** é relevante (S6).

### OPÇÕES ([DP]/[DA])

**A — Conta a pagar é sempre consequência de uma operação/documento.**
- **A1 (hoje):** só NF-e. **A2:** também consequência de **uma entrada** (sem documento ou por pedido), com "condição de pagamento" informada (vencimento/parcelas) — cobre NF em papel sem virar despesa avulsa.
- Impacto operacional: A1 deixa buracos (S6, despesas); A2 cobre S6. UX: A1 só melhora exposição; A2 acrescenta campos à entrada. Financeiro: sempre há origem rastreável. Técnico: A1 nada; A2 altera `criar_confirmar_remessa_entrada` (schema aditivo p/ vínculo AP↔remessa). Casos de uso: compras de mercadoria. Complexidade: A1 nula; A2 média. Riscos: A2 pode gerar AP duplicado se depois a NF-e for importada (mitigar com D-1).

**B — Conta a pagar também pode nascer independente.**
- Casos de uso: aluguel, energia, internet, frete avulso, impostos, comissões, empréstimos; compra sem documento.
- Impacto operacional: "quanto devo" passa a refletir o negócio; base para fluxo de caixa. UX: formulário "Nova conta a pagar" (fornecedor, descrição, vencimento, valor, categoria opcional), editar/cancelar. Financeiro: torna as **categorias financeiras** úteis; exige regra de recorrência (fora do MVP). Técnico: novo writer (padrão `ReceivableWriter`) **sem** mudar schema se o fornecedor for obrigatório (SSOT: Financeiro não cria fornecedor → link para Fornecedores); schema só se `fornecedor_id` virar opcional. Arquitetura: **emenda ao ADR-010** (`PayableWriter`) e política de permissão. Complexidade: média. Riscos: duplicidade com a NF-e (mesma compra lançada à mão e por XML); sem chave natural de deduplicação; permissão (quem cria).

### IMPACTO NA ARQUITETURA
B com fornecedor obrigatório é **contido** (sem migration); B sem fornecedor exige schema. Em qualquer caso, a criação de AP hoje mora num RPC de Inventory — vale registrar a fronteira (ADR-010).

### DECISÃO NECESSÁRIA
Q7–Q9 da §12.

### RECOMENDAÇÃO
**A agora** (é o que o cliente 1 vai usar no go-live; a exposição já foi melhorada). **Decidir B só depois do teste [T]** com o cliente; se a resposta for "sim, tenho despesas", **B mínimo** (fornecedor obrigatório, sem recorrência). Corrigir o **[B]** de `descricao`/`nfe_numero` independe da decisão (correção de dado em RPC, exige migration + backfill). **Modelo:** A = "expor"; B = "mudar o modelo" (aditivo).

---

## 5. D-4 — Venda a prazo

### PROBLEMA
O operador e o dono não conseguem dizer o que "vender a prazo" significa no sistema, e o sistema tem regras e textos que não concordam entre si.

### ESTADO ATUAL — o caminho exato

**Venda → cliente → pagamento → saldo → conta a receber → recebimento**

| Etapa | Comportamento ([F]) | Onde |
|---|---|---|
| Cliente | Opcional; **obrigatório se sobrar saldo** (`SALDO_PENDENTE_EXIGE_CLIENTE`; no PDV: "Pagamento parcial requer seleção de cliente") | `CaixaPageClient.tsx:1026-1033`; RPC |
| Formas de pagamento | `DINHEIRO`, `PIX`, `CARTAO_DEBITO`, `CARTAO_CREDITO`, em **várias parcelas**; `FIADO` **rejeitado** (`FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO`) | `finalizarVendaValidation.ts:8-13`; `20260902140300_…sql:100-102` |
| Pagamento parcial | Comentário no código: **"Fase 5b (BA-001): underpay permitido — saldo vira contas a receber"**. O PDV mostra "Falta R$ X" em vermelho; **não há confirmação** dedicada | `CaixaPageClient.tsx:1026-1033`; `CaixaPdvOperadorTabs.tsx:228` |
| Limite de crédito | `clientes.limite_credito NOT NULL DEFAULT 0`; modo por loja `pdv_config.modo_limite_credito` (`AVISO` padrão / `BLOQUEIO` / `AUTORIZACAO_GERENTE`) | `035_fiado_fiscal_stub.sql:48`; `20260806002522_298_…sql:79` |
| Aviso de limite | A RPC devolve o texto do aviso; o tipo `FinalizarVendaCaixaResult` **não o mapeia** → em `AVISO` o operador **não vê nada**. Não há tela de configuração do modo no app (só nos tipos do banco) | `20260902140300_…sql:550`; `caixaActionTypes.ts` |
| Quando nasce o título | Na finalização, se `saldo pendente > 0,009`: `INSERT contas_receber` com **`valor_total` = total da venda**, `valor_aberto` = saldo, `status ABERTO`, `venda_id`; 1 por venda (`ON CONFLICT (venda_id)`) | `20260902140300_…sql:396-451` |
| **Vencimento** | **Não é preenchido** (coluna `vencimento date` é nullable) | idem; `035_fiado_fiscal_stub.sql:60` |
| Saldo do cliente | Σ `valor_aberto` dos títulos `ABERTO`/`PARCIAL` | `v_clientes_gerente` |
| Recebimento posterior | Financeiro → A receber → **Liquidar**: formas `DINHEIRO/PIX/CARTAO_DEBITO/CARTAO_CREDITO/OUTROS`; parcial permitido; **`DINHEIRO` exige caixa aberto e soma em `caixas.saldo_atual`**; estorno de liquidação existe | `20260814013447_…sql:29-165` |
| Cancelamento da venda | O título vira `CANCELADO` com `valor_aberto = 0` | `20260909200000_…sql:82` |
| Criação manual de título | Existe ("Novo título a receber", com vencimento) | `receivableWriter.ts`; `FinanceiroReceberExtras.tsx` |

### EVIDÊNCIAS ([F] e [B])
Ver a tabela acima, mais:
- **[F]** `isTituloVencido` retorna `false` quando `vencimento` é nulo (`shared-core/src/financial/policies/tituloVencido.ts:23`). **Logo, títulos gerados por venda nunca aparecem como vencidos** no KPI/alerta.
- **[F]** Na tabela do Financeiro, `valor_pago = valor_total − valor_aberto` — para venda parcial, o "pago" **inclui o que foi pago no balcão** junto com recebimentos posteriores.
- **[F]** Vocabulário do produto que convive: PDV = "**Pagamento parcial**"; Financeiro = "Novas vendas **fiado** estão desabilitadas" / "Criação e baixa de fiado foram desabilitadas"; Clientes = "limite … **compras a prazo**"; legado = "Fiado (histórico)"; mensagem nova (UX-02.1) = "Conta a receber gerada". A tabela nasceu na migração `035_fiado_fiscal_stub.sql`.
- **[F]** Com `limite_credito = 0` (padrão) e modo `AVISO` (padrão), **qualquer** saldo pendente excede o limite e é **permitido** sem aviso visível: por padrão, o crédito é irrestrito.
- **[B]** (leve) `hojeYmd()` usa a data **UTC** (`toISOString`): entre 21h e 24h no Brasil, um título que vence hoje é tratado como vencido (`tituloVencido.ts:29`). Independe da decisão.

### PROBLEMAS DE UX ([UX])
- O conceito não tem nome estável; "fiado desabilitado" e "compras a prazo" coexistem.
- Sem confirmação, vender com "Falta" e cliente selecionado gera dívida por engano de digitação.
- A dívida nunca "vence"; não há alerta de cobrança; o aviso de limite é invisível.
- O recibo não mostra o saldo a receber (a mensagem de venda mostra desde a UX-02.1).

### HIPÓTESES E TESTES
- **[H]** O lojista (importados) vende a prazo para clientes recorrentes com vencimento combinado ("30 dias"), e espera cobrar/alertar.
- **[H]** O texto `pdv_cliente_sem_cadastro_desc` ("O PDV web ainda não vincula cliente…") é resquício e não aparece na jornada atual.
- **[T]** Perguntar ao cliente 1 como vende a prazo hoje (caderno? outro sistema?) e se precisa de vencimento/parcelas.
- **[T]** Fiscal: como a NFC-e representa a parcela não paga à vista (forma de pagamento informada) — **não analisado**; exige validação fiscal antes de mudar o fluxo.
- **[T]** Verificar em ambiente real se o "Falta" com cliente realmente finaliza sem confirmação extra (leitura do código sugere que sim).

### OPÇÕES — o que "venda a prazo" pode ser ([DP])

| # | Interpretação | Como fica no PDV | O que fica no banco | Consequências |
|---|---|---|---|---|
| **P1** | **Resultado de pagamento parcial** (hoje, implícito) | Nada muda; passa a ser **mostrado** ("A receber R$ X") | Igual | Mínimo esforço; continua sem vencimento e sujeito a engano |
| **P2** | **Forma de pagamento** ("A prazo"/"Crediário" como parcela) | Nova parcela ao lado de dinheiro/PIX/cartão; valor = quanto fica a prazo | Igual + a forma registrada | Fácil de entender; exige reabilitar/renomear a forma `FIADO` (RPC); impacto fiscal a validar |
| **P3** | **Condição comercial** (escolhida antes de pagar: à vista / a prazo em N dias / N parcelas) | Seletor de condição; vencimento(s) calculado(s) | Vencimento e, se parcelado, **vários títulos** | Modelo mais rico; RPC e schema mudam (parcelas); maior esforço |
| **P4** | **Operação explícita** (botão "Vender a prazo"/"Fiado": cliente obrigatório, limite checado, vencimento pedido, confirmação) | Fluxo próprio, com confirmação | Igual + vencimento | Elimina o engano; exige mudar o PDV e a RPC (vencimento) |
| **P5** | **Conta corrente do cliente** (saldo devedor agregado, não título por venda) | Cliente com saldo | Novo modelo (razão por cliente) | Reconstrução; **não recomendado** |

Vantagens/desvantagens resumidas: P1 barato e frágil; P2 intuitivo; P3 completo e caro; P4 seguro e médio; P5 fora do princípio de conservação.

### IMPACTO NO USUÁRIO / TÉCNICO / ARQUITETURA
- P1: só UX (texto, recibo, confirmação opcional "finalizar com saldo a receber?"). Sem RPC.
- P2/P4: RPC de finalização muda (forma/vencimento) → **schema/RPC + fiscal**.
- P3: schema (parcelas) + RPC + UI de Financeiro (vários títulos por venda).
- Independente da escolha: **preencher vencimento** exige RPC (hoje o `INSERT` não o preenche) ou decisão de que sem vencimento o título vale "à vista/na cobrança".

### DECISÃO NECESSÁRIA
Q10–Q14 da §12.

### RECOMENDAÇÃO
**Agora (só expor, sem mudar regra):** adotar **um** nome oficial, mostrar "A receber R$ X" também no recibo, e reescrever os subtítulos contraditórios do Financeiro/Clientes **depois** da decisão. **Decidir P1, P2 ou P4** (não P3/P5 no go-live) e, **na mesma decisão, o vencimento** — sem ele, a dívida é invisível para o próprio Financeiro. Recomendação técnica: **P4 com vencimento padrão editável** (confirmação explícita + cliente + limite + vencimento) é o desenho que elimina o risco de engano com menor mudança de modelo; **P1** só se o cliente 1 confirmar que não precisa de vencimento. **Isto é "expor" até a decisão; vira "mudar o modelo" quando se escolhe vencimento/forma/condição.**

---

## 6. D-5 — Documento principal da operação

### PROBLEMA
Sem um conceito compartilhado de "o que é o documento principal de cada operação", cada tela nomeia as coisas de um jeito (a palavra "Recebimento" tem 3 significados) e as decisões D-1..D-4 não têm onde se apoiar.

### ESTADO ATUAL — o papel de cada entidade ([F], salvo indicação)

| Entidade | Representa | Evento | Registro principal? | Consequência de | Só referência a |
|---|---|---|---|---|---|
| **Produto** | Identidade vendável/comprável (SKU, preço, custo) | cadastro | mestre | NF-e cria "rascunho"; NF-e atualiza custo | — |
| **Fornecedor** | Contraparte de compra | cadastro | mestre | NF-e o cria/atualiza por CNPJ | — |
| **Ordem de Compra** | **Intenção**: "pedi X ao fornecedor Y" | pedido | **sim, do pedido** — mas hoje também é motor de recebimento | — | fornecedor, produto |
| **Recebimento (remessa)** | **Evento físico**: "chegou mercadoria", com conferência | chegada | **deveria ser** (schema); na prática só o motor "sem documento" | — | `origem_tipo` (não usado) |
| **NF-e (importação)** | **Documento fiscal do fornecedor**: o que foi faturado e as parcelas | emissão pelo fornecedor | **sim, da obrigação fiscal/comercial** | — | fornecedor, produtos |
| **Estoque** | **Estado** (saldo) + Kardex append-only | — | **nunca principal** (Inventory) | Entrada, venda, ajuste, transferência | documento de origem só por texto (OC/NF-e) ou FK (remessa, venda) |
| **Venda** | Evento comercial no PDV | venda | **sim** (receita) | — | cliente, caixa |
| **Conta a Pagar** | **Obrigação** com fornecedor | — | **não** | NF-e (hoje) | NF-e (`nfe_importacao_id`), fornecedor |
| **Conta a Receber** | **Obrigação** de cliente | — | **não** | Venda com saldo; ou manual | venda (`venda_id`), cliente |
| **Caixa** | **Estado físico** da gaveta (turno, `saldo_atual`, movimentações) | abertura/fechamento | mestre do turno | Venda em dinheiro, sangria/suprimento, recebimento em dinheiro, pagamento AP em dinheiro | — |

### Cadeia operacional que melhor representa o Jinlong atual

**Compra (hoje, três cadeias paralelas):**
```
(a) Pedido ──Receber(conferência)──▶ Estoque                          (sem custo, sem conta a pagar)
(b) NF-e ───Conferência────────────▶ Estoque + Custo + Contas a pagar  (+ Fornecedor)
(c) (nada) ─Entrada sem nota───────▶ Estoque                          (sem custo, sem conta a pagar)
```
**Venda:**
```
Venda ─▶ Estoque(baixa) ─▶ Pagamento(s) ─▶ Caixa(saldo, se dinheiro)
      └▶ saldo pendente + cliente ─▶ Conta a Receber ─▶ Recebimento ─▶ Caixa(se dinheiro)
      └▶ Documento fiscal (fila; NFC-e em modo stub)
```

### Ambiguidades identificadas ([F] salvo indicação)

| # | Ambiguidade | Onde aparece |
|---|---|---|
| A1 | "Recebimento" = aba de Estoque, ação do pedido e etapa da NF-e | UI |
| A2 | Três "documentos principais" para a mesma compra (pedido, nota, recebimento), cada um com conferência embutida | D-1 |
| A3 | O pedido é intenção **e** motor de recebimento | D-1 |
| A4 | AP pertence ao Financial (ADR-010) mas nasce numa RPC de Inventory; sem `PayableWriter` | D-3 |
| A5 | `contas_receber.valor_total` = total da **venda**; "pago" mistura balcão e liquidações | D-4 |
| A6 | "Fiado" × "pagamento parcial" × "a prazo" × "conta a receber" | D-4 |
| A7 | Categorias financeiras sem vínculo com nenhum título | D-3 |
| A8 | Custo do produto só muda por NF-e; o preço do pedido (`preco_unitario`) nunca é usado | D-1 |
| A9 | `origem_tipo` existe e não é usado | D-1/D-2 |
| A10 | Vencimento obrigatório no AP e ausente no AR gerado por venda | D-3/D-4 |

### HIPÓTESES E TESTES
- **[H]** A entrada **sem documento com pedido** ("OC-only") é, semanticamente, "sem documento fiscal + referência ao pedido" — exatamente `origem_tipo=ORDEM_COMPRA` ("pré-preenchimento, nunca comportamento"). O motor do pedido é o único caminho multi-item sem documento; por isso não deve ser removido sem multi-item na entrada manual.
- **[T]** Validar o vocabulário Pedido/Entrada/Nota com o cliente 1 (teste de cartões: "quando chega mercadoria, o que você diz que fez?").

### OPÇÕES ([DP])
- **D5-α (documento-centrado):** a **NF-e** é o documento principal da compra; a entrada é uma etapa dela; o pedido é referência. Modelo do Bling.
- **D5-β (evento-centrado):** a **Entrada** (recebimento físico) é o registro principal; NF-e e pedido são **origens/referências** dela. É o que o schema (`origem_tipo`) declara.
- **D5-γ (status quo):** três motores, três documentos principais.

### RECOMENDAÇÃO
**D5-β no vocabulário, com implementação incremental (M0→M2):** *Pedido (intenção, opcional) → **Entrada** (evento físico; origem NF-e ou sem documento; referência opcional ao pedido) → Estoque/Custo → Conta a pagar (se NF-e)*. Nomear ao lojista **Pedido**, **Entrada** e **Nota fiscal de entrada**, e reservar "Recebimento" para o ato de conferir. Isto é **vocabulário e modelo mental** — **não** exige reconstruir os motores.

---

## 7. Matriz consolidada

| Decisão | Muda o modelo ou só expõe? | Bloqueia o Blueprint? | Depende de | Schema/RPC? | Só UX resolve? | Recomendação |
|---|---|---|---|---|---|---|
| **D-1** Pedido↔Entrada↔NF-e | **Muda** (M2) / expõe (M0) | **Sim** | Q1–Q4 | M2: sim (aditivo + 2 RPCs) | Parcial (M0, já feito) | M0 já; **M2-B em etapas** |
| **D-2** Entrada de mercadoria | **Expõe** | Parcial (vocabulário/menu) | D-5; D-1 p/ página | não | **Sim** | **L1** agora; L2 depois de D-1 |
| **D-3** Contas a pagar | A: expõe · B: muda (aditivo) | Não | Q7–Q9; teste com cliente | B: writer (contido) | A: sim | **A agora; B após teste** |
| **D-4** Venda a prazo | Expõe até decidir vencimento/forma; depois muda | **Sim** (copy e vencimento) | Q10–Q14; fiscal | P2/P3/P4: sim | P1 e nomear: sim | **Nomear e mostrar já; decidir P4/P1 + vencimento** |
| **D-5** Documento principal | **Vocabulário** | **Sim** | Q15–Q17 | não | — | **D5-β no vocabulário** |

---

## 8. Decisões bloqueadoras

1. **D-5 — vocabulário e modelo mental** (Pedido / Entrada / Nota; uso de "Recebimento"). Sem ele, a matriz de nomenclatura do Blueprint (§6) não pode ser congelada.
2. **D-1 — o pedido é encerrado pela entrada?** Sem ela, não se define a página de Entrada (D-2-L2), a integridade (S8) nem o fim de fluxo do pedido.
3. **D-4 — o que é venda a prazo e se há vencimento.** Sem ela, os subtítulos contraditórios do Financeiro/Clientes não podem ser reescritos e o Contas a Receber continua invisível para "vencidos".
4. **D-2 — a decisão de Sprint 6 (CORE ≤ 10 + hubs) continua valendo?** Sem ela, o agrupamento de menu do Blueprint (§4.1) não pode ser executado.

## 9. Decisões que podem esperar

- **D-3-B (conta a pagar avulsa):** validar primeiro com o cliente 1; A cobre o go-live.
- **D-2-L2 (página)** e **L4 (busca global):** melhoram, mas não desbloqueiam nada.
- **P3 (parcelas) e P5 (conta corrente do cliente):** fora do go-live.
- **M3/M4 (unificar motores):** destino de longo prazo, sem prazo.
- **Recorrência de contas a pagar, categorias obrigatórias, fluxo de caixa:** dependem de D-3-B.

---

## 10. Impacto no Blueprint UX-02

| Seção do Blueprint | O que muda | Depende de |
|---|---|---|
| §1.3 vocabulário; §1.4 lei L1 | "Entrada", "Pedido" e "Nota fiscal de entrada" viram termos oficiais; "Recebimento" reservado à conferência | D-5 |
| §2.2 cadeias de consequência | Trocar as 3 linhas de motores por **Pedido → Entrada (origem/referência) → Estoque/Custo → AP**; incluir a regra "vínculo encerra pedido" | D-1 |
| §3 F3–F7 | F4 ("porta única") passa a **camada L1** com texto de consequência; F3/F7 ganham "vínculo com pedido" e "encerrar/manter aberto" | D-1, D-2 |
| §3 F10–F12 | F10 ganha nome oficial, confirmação, vencimento; F12 mantém A; B opcional | D-3, D-4 |
| §4.1 menu | Só sai do papel se a decisão de Sprint 6 for revogada; **senão** o hub de Estoque recebe a camada L1 | D-2 |
| §6 nomenclatura | Congelar depois de D-5; linhas 6–10, 14, 18 dependem de D-1/D-5; a linha de "fiado" depende de D-4 | D-4, D-5 |
| §11 catálogo | **Liberados** para implementar: BP-D5 (feito), BP-A6 (após D-4), BP-D4 (recibo); **bloqueados até decisão:** BP-E1/E2/E3/E12, BP-F1, BP-F2 | D-1..D-4 |
| §12 roadmap | S1 vira "L1 + vocabulário"; S8 (integridade) só após D-1; nova sprint "vencimento no CR" após D-4 | — |
| Achados novos | Vencimento nulo ⇒ nunca "vencida"; aviso de limite invisível; categorias órfãs; `hojeYmd` UTC | entram no backlog (não dependem de decisão: o **[B]** de `hojeYmd`; o resto depende de D-4/D-3) |

---

## 11. Proposta de modelo operacional (para congelar)

**Regras propostas** (cada uma depende da resposta indicada):

**Compra**
- **R1.** *Pedido* é intenção e é **opcional**. Não altera estoque nem financeiro por si. *(D-1)*
- **R2.** *Entrada* é o evento físico e o ponto onde o estoque muda; tem **origem**: *Nota fiscal (XML)* ou *Sem documento*. *(D-5)*
- **R3.** Uma Entrada pode **referenciar um Pedido**; ao confirmar, o operador **encerra o pedido ou o mantém aberto** (chegada parcial). *(Q1–Q2)*
- **R4.** Conta a pagar é **consequência da Nota fiscal**; custo idem. Entrada sem documento **não** gera conta a pagar (salvo decisão A2). *(D-3)*
- **R5.** A mesma mercadoria entra **uma vez**; o sistema **avisa** quando houver pedido em aberto do mesmo fornecedor. *(D-1)*

**Venda**
- **R6.** *Venda a prazo* tem **nome único** e é uma **escolha visível** do operador (P4) ou está **explicitamente** definida como "pagamento parcial com cliente" (P1). *(D-4)*
- **R7.** Todo título a receber tem **vencimento** (padrão editável) ou a regra "sem vencimento" é declarada. *(D-4)*
- **R8.** Limite de crédito: comportamento definido (avisar/bloquear/autorizar) e **visível** ao operador. *(D-4)*

**Navegação**
- **R9.** "Entrada de mercadoria" é uma **ação** (Estoque e Início), não um item de menu; cada porta diz o que faz. *(D-2)*
- **R10.** O pedido é apresentado como **referência**, não como terceira porta de mesmo peso. *(D-2/D-5)*

---

## 12. DECISÕES QUE O DONO DO PRODUTO PRECISA TOMAR

*(Nenhuma foi respondida aqui. Cada linha mostra o que acontece em cada resposta.)*

### Compra e entrada de mercadoria

| # | Pergunta | Se a resposta for… | …então o usuário vê… | …e o sistema precisa… |
|---|---|---|---|---|
| **Q1** | Quando a mercadoria de um pedido chega e é lançada pela nota (ou por entrada sem nota), **o pedido deve ser encerrado automaticamente?** | **Sim, sempre** | Pedido some de "em trânsito" sozinho | Vínculo + baixa automática (schema aditivo, 2 RPCs) |
| | | **Sim, mas o operador escolhe** encerrar ou manter aberto | 1 escolha ao confirmar; entregas parciais possíveis | Vínculo + `quantidade_recebida` acumulada; estado "parcial" |
| | | **Não** (como hoje) | Pedidos ficam "pendurados"; é preciso cancelar à mão | Nada; manter os avisos |
| **Q2** | Uma entrega **parcial** deve poder ser recebida **em partes** (o pedido continua aberto até completar)? | Sim | Pedido mostra "recebido 6 de 10" | Acúmulo por item e novo estado |
| | | Não (como hoje: fecha mesmo com menos) | O que faltou precisa de novo pedido | Nada |
| **Q3** | O pedido pode continuar sendo **recebido sozinho**, sem nota? | Sim | Botão "Receber pedido" segue | Nada; convive com o vínculo |
| | | Não — só pela Entrada | Um só lugar para receber | Entrada manual multi-item; muda a jornada do pedido |
| **Q4** | Se o **fornecedor da nota** for diferente do **fornecedor do pedido**, o sistema deve **bloquear, avisar ou permitir**? | Bloquear / avisar / permitir | Recusa / alerta / segue | Regra de validação no vínculo |
| **Q5** | "Entrada de mercadoria" deve ser **uma porta única** (nota / sem nota / pedido) ou basta o Estoque com **nomes melhores**? | Porta única (botão/página) | O operador escolhe pelo que tem em mãos e vê a consequência | Só front-end (camada); página depende de Q1 |
| | | Só nomes melhores | Menos mudança, mais aprendizado | Só rótulos |
| **Q6** | O pedido é **uma forma de dar entrada** ou **apenas uma referência** anexada à entrada? | Forma de entrada | Terceira porta | Motor do pedido permanece |
| | | Referência | "Se tiver pedido, informe-o" | Vínculo (Q1) |
| **Q15** | Para o lojista, **qual é "o documento" de uma compra**: o pedido, a nota ou a entrada? | Nota / Entrada / Pedido | Define nome e lugar no menu | Vocabulário e ordem das telas |
| **Q16** | A palavra **"Recebimento"** deve deixar de nomear três coisas diferentes? | Sim — usar Pedido / Entrada / Conferência | Vocabulário coerente | Renomear telas e textos |
| **Q17** | O **custo do produto** deve atualizar só pela nota, ou também pelo pedido e pela entrada sem nota? | Só nota (hoje) | Igual | Nada |
| | | Também outras vias | Custo acompanha o que foi pago | Regra de custo nas RPCs (fora do escopo do ADR-008) |
| **Menu** | A decisão de **Sprint 6** (menu com no máximo 10 itens; recebimento/transferência só como abas de Estoque) **continua valendo**? | Sim | Entrada de mercadoria vira ação, não item de menu | Nada |
| | | Não | Pode haver item de menu novo | Revogar a regra e atualizar testes |

### Contas a pagar

| # | Pergunta | Se a resposta for… | …então o usuário vê… | …e o sistema precisa… |
|---|---|---|---|---|
| **Q7** | **Uma conta a pagar pode existir sem NF-e** (aluguel, energia, frete avulso)? | Sim | Botão "Nova conta a pagar"; "quanto devo" completo | Novo cadastro de título (sem migration se exigir fornecedor cadastrado) |
| | | Não | "Quanto devo" só de mercadoria | Nada; tratar despesas fora do sistema |
| **Q8** | Uma compra com **nota em papel (sem XML)** deve gerar conta a pagar? Como? | Sim, informando vencimento na entrada | Campo de vencimento na entrada sem nota | Ligar título à entrada (schema aditivo) |
| | | Não | Sem conta a pagar para essas compras | Nada |
| **Q9** | Uma **entrada por pedido ou sem nota** deve poder gerar conta a pagar? | Sim / Não | Igual a Q8 | Igual a Q8 |

### Venda a prazo

| # | Pergunta | Se a resposta for… | …então o usuário vê… | …e o sistema precisa… |
|---|---|---|---|---|
| **Q10** | **Venda a prazo deve ser uma escolha explícita do operador** no PDV, ou basta **pagar menos que o total** com cliente selecionado? | Escolha explícita | Botão/condição "A prazo" com confirmação | Mudança no PDV (e vencimento na RPC) |
| | | Basta pagar menos (como hoje) | Mesmo fluxo, com texto "A receber R$ X" | Só textos |
| **Q11** | Toda venda a prazo precisa de **vencimento**? Qual o padrão (ex.: 30 dias)? Pode ter **parcelas**? | Vencimento obrigatório | Data pedida na venda; "vencidas" passam a existir | Preencher o vencimento na finalização (RPC) |
| | | Sem vencimento (como hoje) | Dívida sem data; nunca "vencida" | Nada; aceitar o limite |
| | | Com parcelas | Vários vencimentos por venda | Schema e RPC (vários títulos) |
| **Q12** | **Quem pode comprar a prazo** e o que fazer ao **estourar o limite**? | Limite obrigatório; bloquear / pedir gerente / só avisar | Recusa / autorização / alerta | Configurar o modo e **mostrar o aviso** ao operador |
| **Q13** | Qual **palavra** usar: *a prazo*, *fiado*, *crediário*, *conta do cliente*? | Uma delas | Mesmo nome em PDV, Financeiro e Clientes | Trocar os textos que hoje divergem |
| **Q14** | O **cupom/nota fiscal** da venda deve informar que houve parte a prazo? | Sim / Não | Comprovante diferente | **Validação fiscal** antes de qualquer mudança |

---

## 13. Próximos passos

1. **Sessão de decisão (~90 min)** com o dono do produto para Q1–Q17 (D-5 e D-1 primeiro).
2. **Testes rápidos com o cliente 1** ([T]): (a) "quando chega mercadoria, o que você tem em mãos?"; (b) "como você anota o que paga fora de nota?"; (c) "como vende a prazo hoje?" — 3 perguntas, 15 minutos, decidem D-3-B e P1×P4.
3. **Reproduzir S1 em banco de teste** ([T]) para registrar o duplo crédito com evidência de Kardex (não foi executado aqui).
4. Registrar as decisões como **ADR-013 (Entrada de mercadoria e vínculo com pedido)**, **ADR-014 (Venda a prazo)** e **emenda ao ADR-010 (PayableWriter, se D-3-B)**.
5. **Congelar o Blueprint** com a §10 aplicada e gerar o backlog. Itens **independentes das decisões**, já liberados: KPIs reais de Contas a pagar, correção do `hojeYmd` (UTC), camada L1 sem mudança de rota, correção de dado `descricao`/`nfe_numero` (com migration).
6. **Só depois**: schema aditivo do vínculo, vencimento no CR, e (se decidido) `PayableWriter`.

---

## Apêndice — achados colaterais desta análise

| Tag | Achado | Onde |
|---|---|---|
| **[B]** | `hojeYmd()` usa data UTC: títulos que vencem "hoje" aparecem como vencidos entre 21h e 24h (Brasil) | `shared-core/src/financial/policies/tituloVencido.ts:29` |
| **[F]** | Títulos a receber gerados por venda **nunca** entram em "vencidos" (vencimento nulo) | `tituloVencido.ts:23`; RPC de finalização |
| **[F]** | Aviso de limite de crédito em modo `AVISO` não é exibido; não há tela para configurar o modo | `caixaActionTypes.ts`; `database.types.ts` |
| **[F]** | Categorias financeiras não ligam a nenhum título | migrações; `categorias-financeiras/actions.ts` |
| **[F]** | Conta a pagar gerada pela NF-e sem `descricao` e com `nfe_numero` = número da duplicata | `20260830110000_…sql:126-135` |
| **[H]** | Texto "O PDV web ainda não vincula cliente…" é resquício de uma aba que hoje não existe | `pt.json` `caixa.pdv_cliente_sem_cadastro_desc` |
