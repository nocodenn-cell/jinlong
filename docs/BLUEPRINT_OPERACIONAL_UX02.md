# Blueprint Operacional do Jinlong — UX-02

| Campo | Valor |
|---|---|
| Data | 2026-09-18 |
| Missão | UX-02 — modelo mental, arquitetura da experiência, fluxos, navegação, nomenclatura, continuidade, direção de redesign e roadmap |
| Base | UX-01 (`docs/AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md`) + 3 inventários novos de código (rotas/hubs, financeiro/fornecedor/cliente, fim-de-fluxo de NF-e/OC/caixa) + `entity-ssot.mdc` + ADR-008/009/010 + documentação pública do Bling |
| Estado do código | `main` @ `5e953be5` + edições não commitadas em 5 arquivos (não afetam este blueprint) |
| Regra de ouro | **Nada foi implementado, alterado, commitado ou aberto como PR.** Este documento só define. Ele existe para ser concordado antes de virar tarefas. |

---

> **ATUALIZAÇÃO UX-02.1 (2026-09-18).** Este blueprint foi validado contra o código na missão UX-02.1. Ver `docs/DECISOES_PRODUTO_UX02_1.md`: (1) **corrige um erro deste documento** — sugerir "lançar a nota" depois de receber um pedido duplica o estoque (ajustado em §2.2, §7 e BP-D3); (2) registra o que já foi **implementado** (BP-A3, A1, D5, E3-copy, PDV→painel; parciais A2, D4, F1), o que está **bloqueado por decisão de produto** (E1, E2, E3, E12) e que o agrupamento de menu da §4.1 **conflita com a decisão de Sprint 6** (CORE ≤ 10 itens + hubs).

## 0. Como ler este documento

**Etiquetas de evidência** (usadas ao longo do texto):

| Etiqueta | Significa |
|---|---|
| **[C]** | Confirmado lendo o código atual (arquivo:linha quando disponível) |
| **[I]** | Inferido da leitura, **não executado** — precisa ser confirmado clicando antes de virar tarefa |
| **[B]** | Verificado na documentação pública oficial do Bling (`ajuda.bling.com.br`), lida em 2026-09-18 |
| **[R]** | Recomendação deste blueprint (opinião fundamentada, sujeita a decisão) |
| **[?]** | Não verificado — declarado explicitamente para não virar suposição |

**Classes de mudança** (seção 11 as cataloga todas com ID `BP-xx`):

| Classe | Tipo | Toca regra de negócio? |
|---|---|---|
| **A** | Correção simples de UX (link, CTA, feedback, estado) | Não |
| **B** | Reorganização de navegação (menu, agrupamento, atalhos) | Não |
| **C** | Mudança de nomenclatura (rótulo, título, copy) | Não |
| **D** | Melhoria de continuidade (deep-link, contexto, próximo passo) | Não (só lê dados que já existem) |
| **E** | Decisão de produto (precisa de "sim/não" de quem decide) | Depende da resposta |
| **F** | Mudança que pode afetar regra de negócio, RPC, schema ou arquitetura | **Sim** |

**Prioridade que guia todo o documento:** MODELO MENTAL → FLUXO → NAVEGAÇÃO → CONTEXTO → CONTINUIDADE → CONSISTÊNCIA → VISUAL.

---

## 1. Modelo mental do Jinlong

### 1.1 Como um lojista enxerga a própria loja

Um lojista não pensa em "módulos", "hubs" ou "domínios". Ele pensa em **duas coisas que giram ao mesmo tempo** — a *mercadoria* e o *dinheiro* — apoiadas em **três cadastros** e **três documentos**:

```
          CICLO DA MERCADORIA  ("o que eu tenho para vender")
  ┌───────────────────────────────────────────────────────────────────────┐
  │ Produto ──▶ Fornecedor ──▶ PEDIDO ──▶ CHEGOU ──▶ ESTOQUE ──▶ VENDA (PDV)│
  │                            de compra   (com nota                       │
  │                                        ou sem nota)                    │
  └───────────┬───────────────────────────────┬────────────────────┬──────┘
              │                               │                    │
              ▼                               ▼                    ▼
        CICLO DO DINHEIRO  ("o que entra e o que sai")
  Contas a PAGAR  ◀── nota do fornecedor        Contas a RECEBER ◀── venda a prazo
        │                                              │
        ▼ (paga)                                       ▼ (cliente paga)
       CAIXA  ─────────────────────────────────────▶ fechamento do dia
```

- **3 cadastros** (quem/o quê): **Produto · Cliente · Fornecedor**.
- **3 documentos** (o que aconteceu): **Pedido de compra · Nota fiscal de entrada · Venda**.
- **2 saldos que o lojista vigia todo dia:** *quanto tenho de cada produto* e *quanto tenho a receber/pagar*.

### 1.2 As cinco perguntas que a interface precisa responder o tempo todo

| Pergunta do operador | O que a interface precisa ter | Estado atual no Jinlong |
|---|---|---|
| "**O que faço agora?**" | Uma tela inicial que mostra pendências e atalhos por intenção | Dashboard só informa, não aponta ação [C] |
| "**Onde encontro essa operação?**" | Menu com o vocabulário do lojista, sem nada escondido | Nenhum rótulo diz "nota fiscal"; metade dos itens em "Mais" [C] |
| "**O que aconteceu depois que executei?**" | Confirmação que cita as consequências (estoque, contas, caixa) | "Estoque atualizado." sem citar as contas a pagar geradas [C] |
| "**Qual é o próximo passo?**" | CTA no fim de cada operação | NF-e, recebimento, OC, transferência, comprovante de fechamento: sem CTA [C] |
| "**Para onde volto?**" | Origem preservada ("← voltar para Contas a pagar") | Deep-links perdem contexto; PDV não tem caminho de volta ao painel [C] |

### 1.3 Frases de intenção — o vocabulário do lojista

Este é o "dicionário" que a navegação e a busca precisam entender. Cada frase deve levar a **uma porta principal** (e no máximo uma alternativa):

| O lojista diz… | Porta principal proposta |
|---|---|
| "Chegou mercadoria" | Comprar › **Entrada de mercadoria** (3 portas: com nota / sem nota / pedido) |
| "Tenho a nota fiscal do fornecedor" | Comprar › Entrada de mercadoria › **Nota fiscal de entrada** |
| "Quero pedir mercadoria" | Comprar › **Pedidos de compra** |
| "Quanto devo ao fornecedor X?" | Financeiro › **Contas a pagar** (filtrado por fornecedor) |
| "Quanto o cliente Y me deve?" | Financeiro › **Contas a receber** (filtrado por cliente) |
| "O cliente pagou" | Contas a receber › **Receber** |
| "Preciso pagar uma conta" | Contas a pagar › **Pagar** |
| "Por que sumiu produto do estoque?" | Estoque › **Histórico do produto** (Kardex) |
| "Tá acabando o quê?" | Início › **Estoque baixo** / Estoque › visão crítica |
| "Vou vender" | Vender › **Abrir PDV** |
| "Vou fechar o caixa" | PDV › **Fechar caixa** (F6) |
| "Como foi o caixa de ontem?" | Vender › **Caixas** |
| "Cadastrar produto novo" | Cadastros › **Produtos** › Novo |
| "Quanto vendi hoje/no mês?" | Início / Análise › **Relatórios** |
| "Quem mexeu nisso?" | Análise › **Histórico de atividades** |

### 1.4 As sete leis do modelo mental (regras de decisão para qualquer tela futura)

| # | Lei | Em uma frase |
|---|---|---|
| L1 | **Nomear pela intenção, não pela técnica** | "Nota fiscal de entrada", não "Importar NF-e"; "Receber", não "Liquidar". |
| L2 | **Uma porta principal por intenção** | Pode haver atalhos, mas o menu tem *um* caminho óbvio. |
| L3 | **Toda operação termina com "e agora?"** | Nenhum fluxo termina em toast solto: sempre há CTA de próximo passo ou "Concluir". |
| L4 | **O documento carrega suas consequências** | A nota mostra o estoque que entrou **e** as contas a pagar que gerou. |
| L5 | **O contexto viaja** | Todo deep-link preserva filtro e origem, e o destino mostra "Filtrado por… ✕ · ← Voltar". |
| L6 | **Nada escondido por padrão** | Zero itens de uso diário atrás de "Mais" ou de aba secundária sem rótulo próprio. |
| L7 | **O sistema diz o que fez** | Feedback cita objeto e consequência ("3 contas a pagar geradas, R$ 4.210"), não só "sucesso". |

---

## 2. Arquitetura operacional proposta

### 2.1 Sete áreas, organizadas por intenção (não por rota)

| Área | Pergunta do lojista | Domínio dono (ADR) | Entidades | Telas que hoje a compõem |
|---|---|---|---|---|
| **Início** | "Como está a loja e o que preciso fazer?" | — (leitura) | KPIs, pendências | `/admin/dashboard` |
| **Vender** | "Vender e acompanhar o caixa" | Sales + Cash (ADR-009) | Venda, Turno, Movimentação de caixa | `/caixa`, `/admin/vendas`, `/admin/caixas` |
| **Comprar** | "Pedir e receber mercadoria" | Inventory (ADR-008) | Pedido de compra, Entrada (nota / sem nota / pedido) | `/admin/compras`, `/admin/estoque/recebimento`, `/admin/estoque/importar-nfe` |
| **Estoque** | "O que tenho e por que mudou" | Inventory (ADR-008) | Saldo, Movimento (Kardex), Transferência | `/admin/estoque`, transferências, etiquetas |
| **Financeiro** | "O que entra e o que sai" | Financial (ADR-010) | Título a receber, Título a pagar, Documento fiscal | `/admin/financeiro` (abas) |
| **Cadastros** | "Quem e o quê" | Products (ADR-007) / customers / suppliers | Produto, Cliente, Fornecedor | `/admin/catalogo`, `/admin/clientes`, `/admin/fornecedores` |
| **Análise e loja** | "Ver resultados, equipe, configurações" | — | Relatórios, Auditoria, Funcionários, Comissões, Configurações | `/admin/relatorios`, `/admin/auditoria`, `/admin/funcionarios`, `/admin/comissoes`, `/admin/configuracoes` |

### 2.2 Cadeias de consequência (o que cada documento deve mostrar)

Hoje várias consequências existem **no banco** mas o operador não as vê. O blueprint exige que a tela do documento **mostre a cadeia inteira**:

| Documento | Consequências reais hoje | O que a tela deve mostrar |
|---|---|---|
| **Nota fiscal de entrada (XML)** | Cria/atualiza fornecedor por CNPJ [C]; cria produtos em rascunho [C]; após confirmar: credita estoque + gera `contas_pagar` por duplicata [C] | "Fornecedor X · N produtos novos para revisar · Estoque +M itens · **N contas a pagar geradas (R$ …, 1º vencimento dd/mm)**" — hoje só diz "Estoque atualizado." |
| **Pedido de compra recebido** | Credita estoque; **não** gera conta a pagar [C]; **não** se liga à nota [C] | "Estoque +M itens. Este recebimento não gera conta a pagar. **Não lance a mesma mercadoria também em Entrada sem nota ou Nota fiscal de entrada — o estoque seria creditado duas vezes.**" *(corrigido na UX-02.1: a versão anterior sugeria lançar a nota depois de receber o pedido, o que duplica o estoque)* |
| **Entrada sem nota** | Credita estoque; não gera conta a pagar [C]; não atualiza a OC mesmo se vinculada [C — ver F1] | "Estoque +M. Sem nota: nenhuma conta a pagar foi criada." |
| **Venda com cliente e saldo** | Gera `contas_receber` com `venda_id` [C] | "Título a receber R$ X gerado" — hoje `contasRecebeId` chega da RPC e é ignorado pela UI [C] |
| **Pagamento de conta a pagar em dinheiro** | Gera sangria no caixa [C, G-09] | "Sangria de R$ X registrada no caixa" (já mostra só o ID curto) |

### 2.3 O que este blueprint **não** muda

- **Nenhuma rota, tabela, RPC ou regra de negócio** é redesenhada. Tudo abaixo é agrupamento, rótulo, link e feedback sobre o que já existe.
- **Os três motores de entrada de estoque continuam separados** (NF-e / Ordem de Compra / recebimento manual) — decisão em estágios documentada no ADR-008 e na migração `20260801120000`. O blueprint acrescenta **uma porta única de descoberta** na frente deles, não os funde (a fusão é decisão E1).
- **SSOT de cadastros permanece** (`entity-ssot.mdc`): PDV não cria cliente/fornecedor/produto; Financeiro não cria cliente/fornecedor. Onde a UX pedir "cadastro rápido", o blueprint propõe **link** para a tela oficial, nunca formulário duplicado.

---

## 3. Mapa dos fluxos (17)

Formato de cada fluxo: **Entrada · Ação principal · Informações · Resultado · Próximo passo natural · Módulo/Entidade · CTA esperado · Voltar · Continuar · Hoje (gap)**. Os IDs `BP-xx` remetem ao catálogo da seção 11.

### F1 — Cadastro de produto
- **Entrada:** Cadastros › Produtos › **Novo produto** (também: "Produtos novos na nota" da NF-e; card do Início).
- **Ação principal:** preencher o essencial e salvar.
- **Informações:** nome, preço de venda, custo, categoria, fornecedor, estoque inicial (opcional), EAN (opcional); fiscal (NCM/CFOP) recomendado.
- **Resultado:** produto ativo no catálogo; se houve estoque inicial, movimento no Kardex (RPC atômica) [C].
- **Próximo passo natural:** dar entrada/ajustar estoque · **comprar do fornecedor** · imprimir etiqueta · cadastrar outro.
- **Módulo/Entidade:** Products (ADR-007) / **Produto**.
- **CTA esperado:** "Ajustar estoque" · "Imprimir etiqueta" · **"Fazer pedido de compra"** (novo) · "Cadastrar outro".
- **Voltar:** lista de Produtos preservando filtros. **Continuar:** Estoque do produto, Pedidos de compra do fornecedor.
- **Hoje:** tela pós-salvo tem só "Ajustar estoque" e "Imprimir etiqueta" [C `ProdutoFormModal.tsx:532-620`]; sem caminho para comprar → **BP-D1**. Campos fiscais nunca obrigatórios [C, herdado UX-01] → E.

### F2 — Cadastro de fornecedor
- **Entrada:** Cadastros › Fornecedores › **Novo fornecedor** (ou criado automaticamente pelo CNPJ na NF-e [C]).
- **Ação principal:** informar nome e CNPJ.
- **Informações:** nome, CNPJ (hoje só isso [C `fornecedorContrato.ts:6-41`]).
- **Resultado:** fornecedor disponível em produto, pedido, nota e contas a pagar.
- **Próximo passo natural:** fazer pedido de compra · ver o que devo a ele.
- **Módulo/Entidade:** suppliers (UI `/admin/fornecedores`) / **Fornecedor**.
- **CTA esperado:** "Novo pedido de compra" · **"Contas a pagar deste fornecedor"** · "Compras deste fornecedor".
- **Voltar:** lista de Fornecedores. **Continuar:** Pedidos de compra; Contas a pagar filtradas.
- **Hoje:** o ícone "Nova OC" por linha existe (G-03) [C]; **não há** total devido, histórico nem link para contas a pagar — o filtro por `fornecedor_id` existe no reader mas **a URL não o aceita** [C `page.tsx:24-35`] → **BP-D5**. Fornecedor pode ser criado pela NF-e sem aviso [C] → **BP-A2**.

### F3 — Compra de mercadoria (pedido)
- **Entrada:** Comprar › **Pedidos de compra** › Novo pedido (atalhos: Fornecedor › Novo pedido; Estoque crítico › Comprar; Produto salvo › Fazer pedido).
- **Ação principal:** escolher fornecedor e itens; salvar; confirmar; marcar em trânsito.
- **Informações:** fornecedor, itens (produto, quantidade, custo).
- **Resultado:** pedido Confirmado/Em trânsito. **Não altera estoque nem financeiro** [C].
- **Próximo passo natural:** aguardar a chegada → **Receber pedido / lançar a nota**.
- **Módulo/Entidade:** Inventory / **Pedido de compra** (`ordens_compra`).
- **CTA esperado:** "Confirmar pedido" → "Marcar em trânsito" → **"Chegou — lançar nota / receber"**.
- **Voltar:** lista de pedidos. **Continuar:** Entrada de mercadoria.
- **Hoje:** item de menu escondido em "Mais" [C]; detalhe é Modal (demais detalhes são Sheet) [C]; final do recebimento sem CTA [C `OcDetalheModal.tsx:121-123`]; sem ligação à nota → **BP-B1, BP-D3, BP-E1**.

### F4 — Recebimento de mercadoria (a chegada)
- **Entrada:** Comprar › **Entrada de mercadoria** — página de decisão com 3 portas.
- **Ação principal:** escolher a porta que descreve a situação real.
- **Informações:** "Tenho a nota (XML)?" · "Não tenho nota?" · "É um pedido que fiz?".
- **Resultado:** o operador chega ao motor certo **sem precisar conhecer a arquitetura**.
- **Próximo passo natural:** executar F5 / F7-manual / recebimento de pedido.
- **Módulo/Entidade:** Inventory / **Entrada**.
- **CTA esperado:** três cartões + bloco **"Entradas em andamento"** (importações aguardando conferência, pedidos em trânsito).
- **Voltar:** Início. **Continuar:** qualquer uma das três telas existentes.
- **Hoje:** **essa tela não existe**. As três portas são telas separadas em lugares diferentes ("Estoque › Recebimento", "Estoque › Importar NF-e", "Compras" em "Mais") [C]; "Recebimento" parece a resposta certa mas é a porta *sem nota* [C] → **BP-B2 (mínimo) / BP-E2 (página de decisão)**.

### F5 — Entrada de NF-e
- **Entrada:** Comprar › Entrada de mercadoria › **Nota fiscal de entrada (XML)** (atalho direto no menu; também aba "Nota fiscal de entrada" em Estoque; card do Início).
- **Ação principal:** enviar o XML → revisar itens → relacionar desconhecidos → importar.
- **Informações:** arquivo XML; decisão por item desconhecido (relacionar a produto existente ou cadastrar como novo); fator de conversão; "atualizar custo".
- **Resultado:** importação em "aguardando conferência"; fornecedor criado/atualizado pelo CNPJ [C]; produtos novos em rascunho [C]; duplicatas **guardadas** (os títulos ainda **não** existem) [C `importar_nfe_transacao`].
- **Próximo passo natural:** **Conferir mercadoria**.
- **Módulo/Entidade:** Inventory + Products (rascunho) / **Nota fiscal de entrada**.
- **CTA esperado:** "Conferir mercadoria agora" · "Deixar para depois (fica em Entradas em andamento)".
- **Voltar:** Entrada de mercadoria. **Continuar:** F6.
- **Hoje:** máquina de fases sólida e retomável [C]; **sem indicador de etapa** [C]; pendentes só listadas dentro da própria página [C `:608`]; sem "Conferir agora" nomeado → **BP-D13, BP-D9**.

### F6 — Conferência
- **Entrada:** continuação direta de F5 · "Entradas em andamento" (Início e Entrada de mercadoria) → **Retomar**.
- **Ação principal:** contar o que chegou (campo **nasce vazio** — bug corrigido [C `:77-81,146-158`]), justificar diferenças, registrar (salva parcial).
- **Informações:** quantidade conferida por item; motivo da divergência.
- **Resultado:** conferência registrada; divergências com motivo.
- **Próximo passo natural:** **Dar entrada no estoque**.
- **Módulo/Entidade:** Inventory / **Conferência da nota**.
- **CTA esperado:** "Registrar conferência" (salvar e sair) · "Dar entrada no estoque".
- **Voltar:** Entradas em andamento. **Continuar:** F7.
- **Hoje:** bem resolvido; falta progresso visível ("3 de 12 itens conferidos" existe só no card de pendentes) e o nome do botão final ("Confirmar e atualizar estoque") descreve a técnica → **BP-C1**.

### F7 — Entrada no estoque
- **Entrada:** botão final de F6; ou porta "sem nota" (recebimento manual).
- **Ação principal:** **Dar entrada no estoque**.
- **Informações:** (manual) origem, produto, quantidade esperada, quantidade conferida, vínculo opcional com pedido.
- **Resultado:** saldo e custo atualizados; movimento no Kardex; (NF-e) **contas a pagar geradas** [C `20260830110000…:120-135`].
- **Próximo passo natural:** ver contas geradas · revisar produtos novos · imprimir etiquetas · lançar outra entrada.
- **Módulo/Entidade:** Inventory (+ Financial via duplicatas) / **Movimento de estoque**.
- **CTA esperado (NF-e):** "**Ver contas a pagar geradas** (N · R$ X · 1º venc. dd/mm)" · "Revisar N produtos novos" · "Imprimir etiquetas" · "Lançar outra nota".
- **CTA esperado (manual):** "Ver estoque do produto" · "Registrar outra entrada" (formulário **limpo**).
- **Voltar:** Entrada de mercadoria. **Continuar:** Contas a pagar; Produtos (rascunhos); Etiquetas.
- **Hoje:** NF-e termina em "Estoque atualizado." **sem CTA e sem citar as contas geradas** [C `pt.json:939,927`]; nota sem `<cobr>` não gera título e **não avisa** [C]; recebimento manual **não limpa o formulário** e um segundo clique cria outra entrada (a `idempotency_key` é regenerada) [C `RecebimentoGerentePageClient.tsx:110-113`] → **BP-A1, BP-A2, BP-D15**.

### F8 — Venda no PDV
- **Entrada:** Vender › **Abrir PDV** (no balcão, direto em `/caixa`).
- **Ação principal:** bipar/buscar → carrinho → forma de pagamento → Finalizar (F4).
- **Informações:** produtos, quantidades, pagamento; cliente opcional.
- **Resultado:** venda registrada, estoque baixa, caixa atualiza, recibo.
- **Próximo passo natural:** nova venda · imprimir.
- **Módulo/Entidade:** Sales + Cash / **Venda**.
- **CTA esperado:** "Nova venda" · "Imprimir".
- **Voltar:** **Painel de gestão** (só perfis gerenciais). **Continuar:** nova venda.
- **Hoje:** núcleo do PDV forte e orientado a teclado [C]; **sem link do PDV para o admin** (só "Sair") [C `CaixaPdvTopBar.tsx:175`]; atalhos atrás de um "?" [C] → **BP-B5**.

### F9 — Venda para cliente
- **Entrada:** dentro de F8 — chip **"Selecionar cliente"** (já visível [C `CaixaOperadorContextBar.tsx:37-51`]).
- **Ação principal:** vincular cliente antes de pagar.
- **Resultado:** recibo mostra o cliente [C `CaixaReciboModal.tsx:254-256`]; venda entra no histórico do cliente.
- **Próximo passo natural:** finalizar (à vista ou a prazo).
- **CTA esperado:** "Selecionar cliente" · quando não achar: **"Cadastrar cliente (abre o painel)"** — link, nunca formulário (SSOT).
- **Hoje:** resolvido (RM-08/RM-09); busca sem resultado só mostra texto [C `CaixaSelecionarClienteModal.tsx:133-135`] → **BP-D17** (link para `/admin/clientes`).

### F10 — Venda a prazo
- **Entrada:** F8 com cliente vinculado e pagamento menor que o total.
- **Ação principal:** finalizar deixando saldo.
- **Informações:** cliente (obrigatório), valor recebido agora, saldo.
- **Resultado:** título em `contas_receber` com `venda_id` [C].
- **Próximo passo natural:** o operador **precisa ver que o título foi gerado**.
- **CTA esperado:** no recibo e no toast: **"Título a receber R$ X gerado para {cliente}"**.
- **Hoje:** `contasRecebeId` chega da RPC e **nenhuma UI o usa** [C `caixaVendas.impl.ts:416`] → **BP-D4**. **Ambiguidade de modelo:** o Financeiro diz "Novas vendas fiado estão desabilitadas" [C `pt.json:2479`] enquanto a RPC só rejeita a forma `FIADO` e cria título em pagamento parcial com cliente [C migração `20260902140300…:106,396-451`]. O lojista não sabe se "vender a prazo" existe → **BP-E12**.

### F11 — Recebimento de cliente
- **Entrada:** Clientes › "Ver no financeiro" · Financeiro › **Contas a receber** (filtro cliente) · card "A receber vencido" do Início.
- **Ação principal:** **Receber** → valor, forma → confirmar.
- **Resultado:** liquidação registrada; saldo do cliente atualiza.
- **Próximo passo natural:** comprovante / ver o cliente.
- **Módulo/Entidade:** Financial / **Título a receber**.
- **CTA esperado:** "Receber" · "Desfazer recebimento" (hoje "Estornar" escondido em "Histórico").
- **Voltar:** lista filtrada de origem. **Continuar:** ficha do cliente.
- **Hoje:** painel "Liquidar" mostra só os **8 primeiros** em aberto [C `FinanceiroReceberExtras.tsx:165`]; liquidação **sem confirmação**; formas em código cru (`CARTAO_DEBITO`) [C `:224-228`]; seletor de cliente do "Novo título" carrega só **20 clientes** [C `page.tsx:70`]; sem KPI/destaque de vencido por linha [C] → **BP-A8, BP-A9, BP-C1**. [?] Não verificado se recebimento em dinheiro gera movimento de caixa (o pagamento de conta a pagar gera — G-09).

### F12 — Contas a pagar
- **Entrada:** Financeiro › **Contas a pagar** · Fornecedores › "Contas a pagar" · CTA final da NF-e · card do Início.
- **Ação principal:** **Pagar** (valor, forma, data; dinheiro → escolhe caixa; acima do limite → senha de gerente [C]).
- **Resultado:** pagamento registrado (+ sangria de caixa se dinheiro).
- **Próximo passo natural:** ver o que ainda devo àquele fornecedor.
- **Módulo/Entidade:** Financial / **Título a pagar** (`contas_pagar`).
- **CTA esperado:** "Pagar" · "Ver nota de origem" (link funcional) · "Nova conta a pagar" (se E3 aprovar).
- **Hoje:** títulos **só nascem da NF-e** — "sem lançamento manual" [C `pt.json:1930`] — mas o estado vazio diz "lance uma nova conta a pagar" [C `:1962`]; KPIs "Em aberto/Atrasadas" somam **só as linhas carregadas** (20 por vez) [C `ContasPagarListClient.tsx:262-279`]; **descrição vazia** e `nfe_numero` recebe o número da duplicata, não da NF-e [C]; link "NF-e #…" cai em `/gerente/...` e perde a query [I — não executado]; "Cancelar conta" estorna todos os pagamentos **sem avisar** [C] → **BP-A3, BP-A10, BP-D14, BP-E3, BP-F2, BP-F3**.

### F13 — Movimentação de caixa (sangria e suprimento)
- **Entrada:** PDV › Operações › Sangria (Ctrl+Shift+R) / Suprimento (Ctrl+Shift+S).
- **Ação principal:** valor + motivo (+ senha do gerente acima do limite).
- **Resultado:** movimento + comprovante; saldo em gaveta estimado.
- **Próximo passo natural:** voltar à venda.
- **Módulo/Entidade:** Cash (ADR-009) / **Movimentação de caixa**.
- **CTA esperado:** "Imprimir comprovante" · "Voltar à venda".
- **Voltar:** carrinho. **Continuar:** Vender › Caixas (histórico do turno).
- **Hoje:** fluxo funcional; **o PDV não lista as movimentações aprovadas do turno** — só pendentes; o histórico completo está no admin [C]; comprovante e depois nada → **BP-D18**.

### F14 — Fechamento de caixa
- **Entrada:** PDV › **Fechar caixa** (F6).
- **Ação principal:** contar o dinheiro (fechamento cego), justificar diferença > R$ 5.
- **Resultado:** turno fechado atomicamente; comprovante.
- **Próximo passo natural:** abrir novo turno · ver o fechamento no painel · sair.
- **Módulo/Entidade:** Cash / **Turno**.
- **CTA esperado:** "Imprimir" · **"Abrir novo turno"** · **"Ver em Caixas (painel)"** · "Sair".
- **Voltar:** PDV. **Continuar:** Vender › Caixas.
- **Hoje:** comprovante só com "Imprimir/Fechar" [C `CaixaFechamentoReciboModal.tsx:88-99`]; **abertura do caixa não mostra o turno anterior** e o fundo vem fixo em 0 [C `CaixaPageClient.tsx:1908`] → **BP-D8, BP-A12**.

### F15 — Consulta de estoque
- **Entrada:** Estoque › Saldos · Produto › "Ver estoque" · card "Estoque baixo" do Início.
- **Ação principal:** filtrar, achar crítico, agir na linha.
- **Próximo passo natural:** **repor** (comprar *ou* registrar entrada) · investigar (Kardex) · ajustar.
- **CTA esperado por linha:** "Histórico" · "Ajustar" · **"Comprar"** · **"Registrar entrada"**.
- **Hoje:** ação por linha funciona [C]; **"Repor" leva ao recebimento** (`?produto=`) [C], ou seja, ao *depois* da compra — o lojista com estoque baixo primeiro precisa **comprar** → **BP-D2**. Estado vazio é texto de filtro, sem distinguir "loja nova" [C] → **BP-A11**.

### F16 — Kardex (por que o estoque mudou)
- **Entrada:** linha do Estoque (ícone) · Produto · Auditoria › "ver Kardex".
- **Ação principal:** ler a sequência de movimentos.
- **Próximo passo natural:** **abrir o documento que gerou o movimento** (venda, nota, ajuste).
- **Hoje:** link cruzado com Auditoria funciona nos dois sentidos [C]; Auditoria filtra por *tipo*, não por produto [C `KardexSheet.tsx:25-31`]; [?] não verificado se cada linha do Kardex linka ao documento de origem → **BP-D12, BP-D16**.

### F17 — Relatórios
- **Entrada:** Análise › Relatórios · Início.
- **Ação principal:** ver o número → chegar ao registro que o explica.
- **Próximo passo natural:** abrir o produto/venda/cliente; agir (repor, cobrar).
- **Hoje:** vendas e divergência de estoque fecham o ciclo [C]; Top Produtos/Sem giro/Curva ABC/Cobertura linkam para `/admin/catalogo?produto=` que **ignora o parâmetro** [C]; **não existe** relatório de contas (aging, inadimplência, a pagar por fornecedor) [C] → **BP-A5, BP-E7**.

---

## 4. Arquitetura de informação

### 4.1 Estrutura proposta do menu (todos os itens visíveis, sem "Mais")

| Grupo | Item (rótulo proposto) | Rota existente | Mudança |
|---|---|---|---|
| — | **Início** | `/admin/dashboard` | rótulo (hoje "Visão geral"/"Dashboard comercial") |
| **VENDER** | **Abrir PDV** *(destaque)* | `/caixa` | sobe de "Sistema" para o topo; primeira ação |
| | **Vendas** | `/admin/vendas` | rótulo (hoje "Vendas e caixa" — leva à lista de vendas) |
| | **Caixas** | `/admin/caixas` | mantém; subtítulo visível "abertura, fechamento e diferenças" |
| **COMPRAR** | **Entrada de mercadoria** | página nova (ou, mínimo, `/admin/estoque/importar-nfe`) | ver BP-B2/BP-E2 |
| | **Nota fiscal de entrada** | `/admin/estoque/importar-nfe` | atalho direto (rótulo do cliente) |
| | **Pedidos de compra** | `/admin/compras` | sai de "Mais"; rótulo |
| **ESTOQUE** | **Estoque** | `/admin/estoque` (hub: Saldos · Entrada sem nota · Transferências · Etiquetas) | aba "Recebimento" → "Entrada sem nota"; aba "Importar NF-e" → alias de "Nota fiscal de entrada" |
| **FINANCEIRO** | **Contas a receber** | `/admin/financeiro?tab=receber` | vira item de menu (hoje só aba) |
| | **Contas a pagar** | `/admin/financeiro?tab=pagar` | vira item de menu |
| | **Notas fiscais de venda** | `/admin/financeiro?tab=fiscal` | rótulo (hoje "Fila fiscal"); marcar "em implantação" enquanto for stub |
| **CADASTROS** | **Produtos** | `/admin/catalogo` (hub: Produtos · Categorias · Marcas) | rótulo (hoje "Catálogo") |
| | **Clientes** | `/admin/clientes` | — |
| | **Fornecedores** | `/admin/fornecedores` | sai de "Mais" |
| **ANÁLISE** | **Relatórios** | `/admin/relatorios` | — |
| | **Histórico de atividades** | `/admin/auditoria` | rótulo (hoje "Auditoria") |
| **LOJA** | **Funcionários** | `/admin/funcionarios` | — |
| | **Comissões** | `/admin/comissoes` | sai de "Mais" |
| | **Configurações** · **Suspensão de vendas** | `/admin/configuracoes` · `/admin/suspensao` | — |
| **INTERNO** *(só ADMIN)* | Provisionamento · Implantação · Diagnóstico do Caixa | idem | agrupados e rotulados como internos |

> **Nenhuma rota muda.** "Contas a receber/pagar" apontam para as abas existentes por `?tab=`. "Nota fiscal de entrada" e a aba de Estoque apontam para a **mesma** tela — duas portas, um destino (L2/N7).

### 4.2 Diagnóstico atual × modelo ideal

| Categoria | Item | Evidência | Correção (ID) |
|---|---|---|---|
| **No lugar correto** | Hub Catálogo (Produtos/Categorias/Marcas) | [C] `catalogoHubNav.ts` | preservar |
| | Clientes, Relatórios, Configurações, Suspensão | [C] | preservar |
| | Saldos como aba padrão de Estoque | [C] | preservar |
| | Financeiro unificado em abas (SSOT) | [C] `entity-ssot.mdc` | preservar; só expor as abas no menu |
| **Escondido** | Fornecedores, Compras, Comissões | atrás de "Mais" fechado por padrão [C `SidebarNav.tsx:44`] | BP-B1 |
| | Nota fiscal de entrada | 4ª de 5 abas dentro de Estoque [C `estoqueHubNav.ts:19`] | BP-B2 |
| | Estorno de recebimento | atrás de "Histórico" pequeno [C] | BP-C1/BP-A8 |
| | Importações NF-e pendentes | só na própria página de importação [C] | BP-D9 |
| | Atalhos de teclado do PDV | atrás de "?" [C] | BP-P3 (polish) |
| | Filtros `de/ate/cliente_id` do Financeiro | só por URL [C] | BP-D6 |
| | Aba "Transferências" com 1 loja | mostra "Operação indisponível" [C] | BP-A11 |
| **Nomenclatura inadequada** | ver seção 6 | — | BP-C* |
| **Duplicado** | "Fila fiscal" aparece **dentro** da aba A receber **e** como aba própria | [C] | BP-B4 |
| | "Importar NF-e": botão no cabeçalho de Estoque + aba + ação no Catálogo | [C] | manter como **portas** (N7), com o mesmo rótulo |
| | Árvore `/gerente` (shell morto, 19 chaves em `ROUTES.gerente`, 29 redirects, 52 `revalidatePath`) | [C] | BP-F4 |
| | `GerenteHeaderNav` divergente da sidebar (inalcançável) | [C] | BP-F4 |
| **Separado mas deveria estar conectado** | Pedido ↔ Nota ↔ Entrada ↔ Contas a pagar | 3 motores sem fio condutor [C] | BP-E1, BP-D3 |
| | Fornecedor ↔ Contas a pagar | filtro existe, sem link nem parâmetro de URL [C] | BP-D5 |
| | Venda ↔ Documento fiscal | `venda_id` aparece como UUID cru, sem link [C] | BP-D7 |
| | PDV ↔ Painel | sem caminho de volta [C] | BP-B5 |
| | NF-e confirmada ↔ Contas a pagar geradas | nenhuma menção [C] | BP-A2 |
| | Estoque baixo ↔ Compra | "Repor" só leva à entrada [C] | BP-D2 |
| | Produto ↔ Compra | sem CTA pós-salvo [C] | BP-D1 |
| **Parece de um módulo mas pertence a outro** | "Importar NF-e" vive em **Estoque**; operacionalmente é **Compras** e gera **Financeiro** | [C] | portas nos 3 lugares (BP-B2) |
| | Contas a pagar vive em Financeiro mas **nasce** na Entrada de NF-e | [C] | CTA cruzado (BP-A2) |
| | Comissões em "Mais/Operação" — é **Equipe/Financeiro** | [C] | BP-B9 |
| | "Caixas" (turnos) está no menu perto de Vendas, mas é domínio Cash | [C] | manter em Vender; link cruzado com Financeiro |
| | Fiscal de **saída** dentro de "Financeiro e fiscal" enquanto NF-e de **entrada** está em Estoque | [C] | rótulos separados (BP-C1) |

---

## 5. Navegação proposta

### 5.1 Sete intenções críticas

**N-1 · "Quero lançar uma NF-e de entrada"**
- **Localização esperada:** Comprar › **Nota fiscal de entrada** (1 clique a partir do menu; alternativas: card do Início, aba em Estoque, busca "nota").
- **Ação:** enviar o XML → revisar → relacionar produtos novos → importar.
- **Resultado:** importação criada; fornecedor e produtos novos tratados.
- **Próxima ação:** **Conferir mercadoria** → **Dar entrada no estoque** → CTAs (ver contas a pagar geradas · revisar produtos novos · etiquetas).

**N-2 · "Quero receber uma mercadoria"**
- **Localização:** Comprar › **Entrada de mercadoria**.
- **Ação:** escolher a porta — *tenho a nota* / *não tenho nota* / *é um pedido que fiz*.
- **Resultado:** o operador cai no motor certo, com o contexto explicado ("gera contas a pagar" × "só atualiza estoque").
- **Próxima ação:** conforme a porta; sempre termina com CTA.

**N-3 · "Quero comprar mercadoria"**
- **Localização:** Comprar › **Pedidos de compra** › Novo pedido. Atalhos: Fornecedores › Novo pedido; Estoque baixo › **Comprar**; Produto salvo › **Fazer pedido de compra**.
- **Ação:** fornecedor + itens → Confirmar → Em trânsito.
- **Resultado:** pedido registrado (sem efeito em estoque/financeiro).
- **Próxima ação:** quando chegar → **Chegou — lançar nota / receber**.

**N-4 · "Quero descobrir quanto devo a um fornecedor"**
- **Localização:** Financeiro › **Contas a pagar** › filtro Fornecedor — ou Fornecedores › linha › **Contas a pagar**.
- **Ação:** ver a lista já filtrada, com chip "Fornecedor: X ✕" e **total em aberto do fornecedor**.
- **Resultado:** valor devido, vencimentos, títulos atrasados.
- **Próxima ação:** **Pagar** · "Ver nota de origem".
- **Depende de:** URL aceitar `fornecedor_id` (BP-D5) e KPI que some o total real, não as 20 linhas carregadas (BP-D14/BP-F3).

**N-5 · "Quero descobrir quanto um cliente me deve"**
- **Localização:** Clientes › saldo › **Ver no financeiro** (já existe, G-07) — ou Financeiro › **Contas a receber** › cliente.
- **Ação:** ver títulos do cliente (filtro por `cliente_id`, exato).
- **Resultado:** saldo, vencimentos, venda de origem ("Ver venda" já existe).
- **Próxima ação:** **Receber** · "Desfazer recebimento".

**N-6 · "Quero saber por que o estoque mudou"**
- **Localização:** Estoque › linha do produto › **Histórico**; ou Produto › "Ver histórico"; ou Relatórios › Divergência › abre Kardex.
- **Ação:** ler os movimentos em ordem.
- **Resultado:** cada movimento com data, tipo, quantidade, responsável.
- **Próxima ação:** **abrir o documento de origem** (venda, nota, ajuste) — [?] hoje não verificado — ou "ver na Auditoria" (já existe, por tipo).

**N-7 · "Quero fechar o caixa"**
- **Localização:** PDV › **Fechar caixa** (F6). Se o gerente está no painel: Vender › **Caixas** › turno aberto › **Ir para o PDV**.
- **Ação:** contagem cega → diferença → justificar se > R$ 5.
- **Resultado:** turno fechado + comprovante.
- **Próxima ação:** **Abrir novo turno** · **Ver em Caixas** · Sair.

### 5.2 Regras de navegação transversais

| # | Regra | Como | Evidência do problema atual |
|---|---|---|---|
| N1 | **Sem "Mais"** | todos os itens de uso diário visíveis; ≤ 4 itens por grupo | [C] `SidebarNav.tsx:44` |
| N2 | **Eyebrow de área** | o cabeçalho de toda tela mostra a área ("Comprar › Nota fiscal de entrada") — *não* um breadcrumb hierárquico completo, só o suficiente para "onde estou" | [C] nenhum componente de breadcrumb existe |
| N3 | **O contexto viaja** | deep-link carrega `?returnTo=` (caminho interno validado) e o destino mostra **← Voltar para {origem}** + chip **"Filtrado por: … ✕"** | [C] G-07 já mostra o nome do cliente; [I] link NF-e→importação perde a query |
| N4 | **PDV ↔ Painel** | perfis gerenciais veem "Painel de gestão" no menu Operações do PDV; operador comum não vê | [C] hoje só "Sair" |
| N5 | **Início = painel de pendências** | cards "O que fazer agora" alimentados por dados que **já existem** (ver 5.3) | [C] dashboard só informa |
| N6 | **Busca por intenção (opcional)** | "Ir para…" (Ctrl+K) com sinônimos ("nota", "nf", "entrada", "fiado", "fechar caixa") | [C] não existe nenhuma busca global — **decisão BP-E5** |
| N7 | **Mesma tela, mais de uma porta** | é aceitável (e desejável) que a nota fiscal de entrada seja alcançável de menu, Estoque e Início — desde que **todas usem o mesmo rótulo** | [B] o Bling faz o mesmo |
| N8 | **Título estável por hub** | o título da página é o do hub; o que muda por aba é o *subtítulo* | [C] hoje o título muda por aba ("Catálogo"/"Categorias de Produtos"/"Marcas de Produtos") e a posição das abas muda entre telas do mesmo hub |

### 5.3 O que o Início deve mostrar ("O que fazer agora")

Cada card usa dado que **já existe** e leva a uma ação:

| Card | Dado existente | Leva a |
|---|---|---|
| **Receber mercadoria** (atalho fixo) | — | Entrada de mercadoria |
| **Entradas aguardando conferência (N)** | `listarImportacoesNfePendentes` [C] | Retomar conferência |
| **Contas a receber vencidas (R$ X)** | KPI "Vencidos" já existe [C `financeiro/page.tsx:147-179`] | Contas a receber (vencidas) |
| **Contas a pagar a vencer/atrasadas** | reader de AP [C] — *precisa de total real* (BP-F3) | Contas a pagar |
| **Estoque baixo (N)** | já existe no dashboard [C] | Estoque › crítico |
| **Produtos para revisar (N)** | produtos em rascunho da NF-e [C] | Produtos › para revisar |
| **Caixa aberto** | status do turno [C] | PDV / Caixas |

> **Loja nova (sem dados):** o Início vira um **"Primeiros passos"** visível ao lojista (cadastrar 1º produto → 1º fornecedor → 1ª entrada → 1ª venda), derivado dos dados reais. Hoje **não existe** onboarding para o lojista — `ROUTES.onboarding` está declarado sem página e "Implantação" é interna/ADMIN [C] → **BP-E4**.

---

## 6. Matriz de nomenclatura

> Recomendações fundamentadas — nada foi alterado. "Intenção" é o que o lojista quer dizer.

| # | Termo atual (onde) | Intenção do usuário | Termo proposto | Justificativa |
|---|---|---|---|---|
| 1 | "Visão geral" (menu) / "Dashboard comercial" (título) | Ver como está a loja hoje | **"Início"** (menu e título) | Duas palavras para a mesma tela [C]; "Início" também comporta o "O que fazer agora". |
| 2 | "Vendas e caixa" (menu → `/admin/vendas`) | Ver as vendas feitas | **"Vendas"** | O item leva à lista de vendas, não ao caixa; "caixa" já é o item "Caixas" — promete o que não entrega. |
| 3 | — (sidebar: "Ir para PDV", no fim do menu) | Vender | **"Abrir PDV"**, primeiro item de **Vender** | A ação mais frequente do negócio está na última linha do menu [C]. |
| 4 | "Caixas" | Ver turnos e fechamentos | **"Caixas"** + subtítulo *"Abertura, fechamento e diferenças de cada turno"* | Rótulo curto ok; falta explicar. |
| 5 | "Catálogo" (item de id `produtos`) | Cadastrar/consultar produtos | **"Produtos"** | O próprio id do item já é `produtos`; lojista fala "cadastrar produto" [B: Bling usa "Produtos"]. |
| 6 | **"Importar NF-e"** (4ª aba de Estoque) | "Lançar a nota fiscal de compra" | **"Nota fiscal de entrada"** (ação: "Lançar nota (XML)") | Foi exatamente a pergunta do cliente; "importar" é o *como*, não o *quê* [B: "Notas Fiscais de Entrada"]. |
| 7 | "Recebimento" · "Recebimento e remessa" · badge "Entrada sem NF" | "Chegou mercadoria e não tenho nota" | **"Entrada sem nota"** (título: "Entrada de mercadoria sem nota fiscal") | Três nomes para a mesma tela [C]; "remessa" é jargão; o badge já diz a verdade. |
| 8 | "Compras" (menu) / "Ordens de compra" (título) / "OC" | "Pedir mercadoria ao fornecedor" | **"Pedidos de compra"** (menu e título); "OC" só como sinônimo secundário | Divergência menu×título [C]; o lojista diz "pedido" [B: "Pedido de compra"]. |
| 9 | "Registrar recebimento" (botão da OC) | "O pedido chegou" | **"Receber pedido"** | Verbo do lojista; o botão dispara duas RPCs (conferência+crédito) sem ele saber. |
| 10 | (nova) | "Chegou mercadoria — não sei qual tela" | **"Entrada de mercadoria"** | Nome da porta única (BP-B2/E2). |
| 11 | "Financeiro e fiscal" | "Ver o que entra e o que sai" | Grupo **"Financeiro"**; itens **"Contas a receber"**, **"Contas a pagar"**, **"Notas fiscais de venda"** | "Fiscal" promete NF-e de saída que **é stub** e NF-e de entrada mora em Estoque [C]; abas viram itens de menu [B: "Financeiro > Contas a Pagar/Receber"]. |
| 12 | "A receber" / "A pagar" (abas) | Contas que tenho a receber/pagar | **"Contas a receber"** / **"Contas a pagar"** | Completa a frase; alinha com o menu. |
| 13 | "Fila fiscal" | "Saber se a nota da venda saiu" | **"Notas fiscais de venda"** (com selo "em implantação" enquanto stub) | "Fila" descreve a implementação, não o objetivo. |
| 14 | "Liquidar" / "Liquidação" | "O cliente me pagou" | **"Receber"** / **"Receber pagamento"** | "Liquidar" é jargão contábil; [B] usa "dar baixa" — o botão simples é "Receber". |
| 15 | "Estornar" (liquidação) | "Cliquei errado / desfazer" | **"Desfazer recebimento"** | Diz a consequência. |
| 16 | `DINHEIRO`, `CARTAO_DEBITO`, `CARTAO_CREDITO` (formas de pagamento cruas) | — | **"Dinheiro"**, **"Cartão de débito"**, **"Cartão de crédito"** | Códigos de banco vazando para a tela [C `FinanceiroReceberExtras.tsx:224-228`]. |
| 17 | "Conferência da entrada" | "Contar o que chegou" | **"Conferir mercadoria"** | [B: "Conferir produtos"]. |
| 18 | "Confirmar e atualizar estoque" | "Terminei de contar, pode lançar" | **"Dar entrada no estoque"** | O próprio subtítulo do Jinlong já diz "dar entrada no estoque" [C `pt.json:881-882`] [B: "Lançar estoque"]. |
| 19 | "Itens desconhecidos" · "De-Para" · "Fator de conversão" | "Produto da nota que eu não reconheço" | **"Produtos novos na nota"** · **"Relacionar com produto do catálogo"** · **"Unidades por embalagem"** | Jargão técnico; [B: "conciliar produtos"]. |
| 20 | "Rascunho" (produto criado pela NF-e) | "Produto incompleto que preciso revisar" | **"Para revisar"** | "Rascunho" é status técnico; o cliente precisa saber *o que fazer*. |
| 21 | "Origem" (Recebimento manual) | "De quem veio" | **"Fornecedor / de onde veio"** | Campo de texto livre desconectado da entidade Fornecedor [C]. |
| 22 | "Auditoria" | "Quem mexeu nisso?" | **"Histórico de atividades"** (subtítulo *"Quem fez o quê"*) | "Auditoria" é vocabulário de compliance. |
| 23 | "Kardex" | "Por que o estoque mudou" | **"Histórico do produto"** (*"Kardex"* entre parênteses) | Termo técnico; o lojista descreve o problema, não a ferramenta. |
| 24 | "Sangria" / "Suprimento" | Tirar/pôr dinheiro no caixa | **manter**, com dica *"Retirar dinheiro do caixa"* / *"Colocar dinheiro (troco)"* | Vocabulário de caixa que o operador já usa. |
| 25 | "Valor inicial (fundo)" | Troco inicial | **"Troco inicial (fundo de caixa)"** | Explica o termo. |
| 26 | "Histórico" (PDV) | Ver as vendas de hoje | **"Vendas de hoje"** | O sheet lista só vendas do dia [C]. |
| 27 | "Suspensão de vendas" | [?] Bloquear vendas da loja | manter + subtítulo explicativo | [?] intenção não verificada — validar com quem definiu. |
| 28 | "Provisionamento" · "Implantação / GO-LIVE" · "Diagnóstico do Caixa" | (uso interno) | grupo **"Interno"**, ocultos ao lojista | Já são `adminOnly`; só rotular o grupo. |

---

## 7. Matriz de continuidade

Para cada tela crítica: *"O usuário chegou aqui. O que provavelmente quer agora?"*

| Tela | O que o usuário provavelmente quer agora | Próxima ação óbvia | O Jinlong hoje… | ID |
|---|---|---|---|---|
| **Início** | Saber o que precisa de atenção | Card da pendência | Só informa; único CTA de ação: "Relatórios" e "Ver estoque" [C] | BP-B6 |
| **Produto salvo** | Vender/repor/comprar | "Fazer pedido de compra" | 2 CTAs; sem compra [C] | BP-D1 |
| **Fornecedor salvo/lista** | Pedir mercadoria · ver o que devo | "Novo pedido" · "Contas a pagar" | Só "Nova OC" [C] | BP-D5 |
| **Pedido de compra criado** | Acompanhar / confirmar | "Confirmar pedido" | ok [C] | — |
| **Pedido "Em trânsito"** | Registrar que chegou | "Chegou — lançar nota / receber" | Só "Registrar recebimento" [C] | BP-D3 |
| **Pedido recebido (toast)** | Ver o estoque | "Ver estoque" *(sem "Lançar nota": duplicaria o estoque — ver `DECISOES_PRODUTO_UX02_1.md` §4.1)* | Só toast [C `OcDetalheModal.tsx:121-123`] | BP-D3 |
| **Entrada de mercadoria (landing)** | Escolher como registrar | 3 cartões | **Não existe** | BP-B2/E2 |
| **NF-e — upload** | Enviar o XML | "Carregar pré-visualização" | ok [C] | — |
| **NF-e — itens desconhecidos** | Resolver rápido | Relacionar/cadastrar por linha | ok [C]; jargão | BP-C1 |
| **NF-e — importada** | Conferir o que chegou | "Conferir agora" / "Depois" | Vai direto à conferência, sem oferta de adiar nomeada [C] | BP-D13 |
| **NF-e — conferência** | Contar e finalizar | "Dar entrada no estoque" | ok; sem indicador de etapa [C] | BP-D13 |
| **NF-e — concluída** | Ver contas geradas · etiquetas · próxima nota | 4 CTAs | "Estoque atualizado." + "Limpar" [C] | **BP-A2** |
| **NF-e — sem duplicatas** | Saber que **nenhuma** conta foi criada | Aviso + (E3) "Criar conta a pagar" | Silêncio [C] | BP-D15 |
| **Entrada sem nota — confirmada** | Registrar outra ou ver estoque | "Registrar outra entrada" (form limpo) | Form **não limpa**; 2º clique duplica [C] | **BP-A1** |
| **Estoque — linha crítica** | Comprar ou registrar entrada | "Comprar" · "Registrar entrada" | Só "Repor" → entrada [C] | BP-D2 |
| **Kardex** | Achar a causa | Abrir o documento de origem | Link p/ Auditoria por tipo [C]; [?] link ao documento | BP-D12/D16 |
| **PDV — carrinho** | Cliente? pagamento? | "Selecionar cliente" visível | ok [C] | — |
| **PDV — venda a prazo finalizada** | Confirmar que o título existe | "Título R$ X gerado" | Nada [C] | BP-D4 |
| **Recibo de venda** | Entregar; nova venda | "Nova venda" | ok; mostra cliente [C] | — |
| **PDV — fechamento (comprovante)** | Abrir novo turno / ver painel | 3 CTAs | "Imprimir/Fechar" [C] | BP-D8 |
| **PDV — abertura** | Contar troco; ver turno anterior | Fundo sugerido + resumo | Fundo fixo 0; sem resumo [C] | BP-A12 |
| **Contas a receber — título** | Receber · ver a venda | "Receber" · "Ver venda" | ok; "Ver venda" existe [C]; painel só 8 itens | BP-A8/A9 |
| **Contas a pagar — título** | Pagar · ver a nota | "Pagar" · "Ver nota" | Link da nota quebrado [I] | BP-A3 |
| **Cliente (lista)** | Cobrar; ver histórico | "Ver no financeiro" · "Ver vendas" | Só o primeiro [C] | BP-D6 |
| **Relatório — linha de produto** | Abrir o produto | Abre ficha/edição | Vai à lista sem filtro [C] | BP-A5 |

---

## 8. Benchmark Bling

**Fonte:** documentação pública oficial do Bling (`ajuda.bling.com.br`), artigos sobre nota de entrada, check-in de recebimentos, vínculo com pedido de compra, contas a pagar/receber e Frente de Caixa, lidos em 2026-09-18.
**Não verificado no Bling:** aparência do dashboard, existência de busca global, relatórios de aging. **Nada disso é afirmado aqui.**
Por isso a tabela separa o que **[B] o Bling faz** do que **[R] o Jinlong deveria fazer *porque* existe este problema operacional**.

| # | Princípio | **[B] O Bling faz assim** | **[R] O Jinlong deve fazer assim porque…** | Adaptação (sem copiar) |
|---|---|---|---|---|
| 1 | **Nomear pela intenção** | Menu **"Estoque › Notas Fiscais de Entrada"** e **"Estoque › Check-in de Recebimentos"** | O cliente perguntou "onde coloco a nota fiscal de entrada?" e nenhum rótulo respondia [C] | Item de menu "Nota fiscal de entrada" + "Conferir mercadoria" (BP-C1) |
| 2 | **Uma porta, vários jeitos** | A mesma tela aceita nota **manual, XML ou SEFAZ** ("Incluir nota fiscal") | Hoje são 3 telas em 3 lugares e o operador precisa saber a resposta antes de perguntar [C] | Página **"Entrada de mercadoria"** com 3 cartões (BP-B2/E2). Consulta SEFAZ **não** está no escopo. |
| 3 | **A UI oferece o próximo passo no ato** | Após importar o XML aparece **"Conferir produtos"** | NF-e, OC, recebimento e transferência terminam em toast [C] | CTA "Conferir agora / Depois" e CTAs finais (BP-A2, BP-D13) |
| 4 | **Aceitar "como veio" é ação explícita** | **"Check-in em lote"** separado da conferência item a item | Já corrigido no Jinlong (campo nasce vazio) [C] — **manter** | Nenhuma; só preservar |
| 5 | **Divergência gera ação de negócio** | Pendência (faltando/danificado/incorreto/recusado) → crédito ao fornecedor / nota de devolução / nenhuma | Hoje divergência é texto livre e morre ali [C] | **Decisão E6** — não é UX, é processo |
| 6 | **Documento carrega suas consequências** | A nota inclui **Pagamento** (alimenta contas a pagar), produtos, transportador | O Jinlong **gera** as contas a pagar, mas **não mostra** [C] | Mostrar a cadeia na tela final (BP-A2) — **sem** mudar a arquitetura |
| 7 | **Lançamento de estoque é etapa nomeada + automação opcional** | "Lançar estoque" no menu da nota; opção de automatizar ao finalizar o check-in | Jinlong já tem etapa explícita [C] | Renomear para "Dar entrada no estoque"; automação = polish futuro (BP-P2) |
| 8 | **Pedido ↔ Nota vinculados nos dois sentidos, com status** | Vínculo na importação do XML ou manual; situações **Total/Parcial** | Recebimento com vínculo só **valida**, não movimenta a OC [C]; NF-e não tem vínculo [C] | **Decisão E1**; até lá, aviso "há pedido em trânsito deste fornecedor" (BP-D3) |
| 9 | **Financeiro por item de menu** | **"Financeiro › Contas a Pagar"** e **"Contas a Receber"** diretos; incluir conta **manual**; baixa parcial/total; busca por contato; colunas customizáveis; aviso por e-mail antes do vencimento | Hub "Financeiro e fiscal" com abas; **não há** conta a pagar manual; KPI parcial [C] | Itens de menu (BP-B3); conta manual = **E3**; KPIs reais (BP-F3) |
| 10 | **Contas a receber nascem da venda, automaticamente** | Lançamento automático em vendas | O Jinlong também gera (sales-led) [C], mas o PDV **não confirma** | Toast/recibo com o título (BP-D4) |
| 11 | **PDV é parte do mesmo sistema** | **"Vendas › Frente de Caixa"**; sangria pelo menu da própria tela; "Controle de Caixa" para analisar e fechar | O PDV do Jinlong é uma ilha: sem volta ao painel [C] | Link "Painel de gestão" no PDV para gerenciais (BP-B5) |
| 12 | **Ações saem do documento** | "Gerar nota a partir do pedido de venda"; "gerar devolução a partir da nota de compra" | Ações espalhadas: da OC não se chega à nota; da venda não se chega ao documento fiscal [C] | Do documento sempre um "próximo documento" (BP-D3, BP-D7) |
| 13 | **Progresso visível na lista** | Coluna opcional **"Conferência"** na lista de notas; histórico de ações e resumo impresso anexados ao documento | Pendentes só dentro da página do importador [C] | "Entradas em andamento" no Início e na Entrada de mercadoria (BP-D9) |

### O que o Jinlong **não** deve copiar
- **Consulta/manifestação SEFAZ** e o cadastro fiscal pesado de "Natureza de Operação" — fora do escopo do go-live (fiscal de saída ainda é stub [C]).
- **Pagamento dentro do formulário da nota** — o Jinlong mantém Financeiro como fonte única de contas (ADR-010). O que falta é **mostrar**, não mover.
- **Cadastro rápido de cliente/produto no PDV** — bloqueado por decisão de produto (SSOT).

### Onde ser diferente do Bling é **correto** ("diferente ≠ errado")
- Motores de entrada **atômicos e idempotentes por caminho** (RPCs) — mais rígidos do que o público documenta do Bling.
- **Fechamento cego** de caixa e alçada de gerente.
- **Financeiro unificado em abas** — bom; o problema é só que o menu não expõe as abas.

---

## 9. Princípios de UI/UX — direção do redesign visual

> Só depois de fixados fluxo, navegação e vocabulário. Sem mockups. **Diagnóstico:** nenhum P0/P1 da UX-01 ou UX-02 tem causa visual. O "redesign" é, sobretudo, **consistência estrutural**.

| Dimensão | Princípio | Por quê (evidência) | Anti-padrão a eliminar |
|---|---|---|---|
| **Hierarquia** | Toda tela tem **uma ação primária** (botão cheio), no máximo duas secundárias (contorno) e o resto em menu de linha | "Repor", "Ajustar", "Histórico" competem sem hierarquia [C] | Três botões do mesmo peso; CTA final ausente |
| **Cabeçalho** | Eyebrow de área + **título estável do hub** + subtítulo por aba + ação primária à direita | Título muda por aba; abas ora antes ora depois do cabeçalho [C] | Título/posição de abas mudando dentro do mesmo hub |
| **Densidade** | **PDV = denso e orientado a teclado**; **painel = arejado e orientado a leitura**; nunca misturar | PDV já é denso e funciona [C] | Levar a densidade do PDV para telas de decisão |
| **Ações primárias × secundárias** | Ação destrutiva **nunca** primária; sempre com modal do app e consequência escrita ("estorna 3 pagamentos") | Migração dos `window.confirm` concluída [C]; "Cancelar conta" ainda estorna sem avisar [C] | Confirmar sem dizer o que acontece |
| **Tabelas** | Ação principal **na linha**; linha inteira leva ao registro; **KPI = total real** (nunca soma da página carregada); ordenar por vencimento em contas | KPI de A pagar soma só 20 linhas; A receber ordena por `created_at` [C] | Números que mudam conforme a rolagem |
| **Filtros** | O filtro ativo vira **chip removível** e é **refletido na URL** (compartilhável e de volta funcional) | `de/ate/cliente_id` só por URL; `fornecedor_id` não aceito [C] | Filtro só em estado local |
| **Formulários** | Campo de entidade (fornecedor, produto, cliente) usa **seletor da entidade**, não texto livre; após sucesso o formulário **limpa** ou mostra estado final | "Origem" texto livre; form não limpa e duplica [C] | Texto livre onde há cadastro |
| **Estados** | 4 estados sempre desenhados: **carregando (skeleton)**, **vazio com CTA**, **erro com retry**, **sucesso com próximo passo** | Só o Catálogo tem `loading.tsx` dedicado; vazios passivos em consulta [C] | Spinner genérico; "Nenhum resultado" sem ação |
| **Feedback** | **Um** sistema de toast; sucesso **obrigatório** e citando consequência | 3 viewports de toast; sucesso opt-in; 3 telas silenciosas [C] | `router.refresh()` mudo |
| **Navegação** | Sem itens colapsados; ≤ 4 por grupo; rótulos por intenção; **PDV↔Painel bidirecional** | [C] | "Mais"; PDV sem volta |
| **Contexto** | Origem e filtro **viajam** (`returnTo` + chip); o destino confirma o que recebeu | [C]/[I] links que perdem query | Deep-link que cai na lista genérica |
| **Modais × Sheets × Páginas** | **Criar/editar = modal; detalhe/consulta = sheet lateral; fluxo com várias etapas = página com indicador de etapa** | Compras usa modal para detalhe; NF-e é fluxo de 5 fases sem indicador [C] | Detalhe em modal num módulo e sheet em outro |
| **Responsividade** | Painel: mobile-first para **consulta e ação curta** (receber, pagar, ver saldo); PDV: tablet/desktop | [?] não reverificado nesta rodada | Ação crítica só existindo em desktop |
| **Vocabulário visível** | Termos técnicos (RPC, De-Para, remessa, códigos de enum) **nunca** aparecem ao lojista | [C] `CARTAO_DEBITO`, "De-Para", "remessa" | Enum cru na tela |

---

## 10. O que preservar (não reconstruir)

| Área | O que preservar | Por quê |
|---|---|---|
| **Cadastro de produto** | Tela pós-salvo com CTAs explícitos | Melhor padrão "e agora?" do sistema; será **estendido** (BP-D1), não trocado |
| **Máquina de fases da NF-e** | upload → classificar → resolver → importar → conferir → confirmar; retomável; resolução inline; banner de rascunhos com "Ir ao catálogo →" | Sólida, testada, ADR-008 |
| **Conferência** | Campo **vazio até contar**; divergência com motivo | Semântica correta, alinhada ao check-in do Bling |
| **RPCs atômicas e idempotência** | `criar_produto_com_estoque_inicial`, `finalizar_venda_transacional_canonica_v4`, `fechar_caixa_atomico`, `receber_ordem_compra`, `confirmar_importacao_nfe` | Integridade — nenhuma mudança de UX exige tocá-las **(exceto F1/F2, por decisão)** |
| **SSOT de cadastros** | `entity-ssot.mdc` | PDV não cria entidades; UX usa **links** |
| **Financeiro em abas** | `/admin/financeiro?tab=` | Só ganha portas no menu |
| **Deep-links existentes** | `adminEstoqueProdutoQuery`, `adminEstoqueRecebimentoProdutoQuery`, `adminVendaDetalheQuery`, Fornecedor→Nova OC, saldo→financeiro por `cliente_id` | Infra reutilizável; padrão a generalizar |
| **Kardex ↔ Auditoria** | Links nos dois sentidos | Funcionam |
| **Estoque baixo → "Repor"** | Botão + destino pré-selecionado (com teste) | **Estender** (adicionar "Comprar"), não remover |
| **PDV** | Bip-first, chip de cliente, recibo com cliente, sangria/suprimento com alçada, fechamento cego, atalhos | Núcleo maduro |
| **"Ver venda" no título a receber; "Ver no financeiro" no cliente** | RM-07, G-07 | Resolvidos e corretos |
| **Confirmações** | Modais próprios; zero `window.confirm/prompt/alert` | Concluído |
| **Estados vazios com CTA** dos cadastros | Clientes, Fornecedores, Catálogo, etc. | Padrão a **replicar** nas telas de consulta |
| **Divergência de Estoque → Kardex via `onClick`** | Padrão robusto de "relatório acionável" | Modelo para corrigir os links de Catálogo |
| **Três motores de entrada** | Separados | ADR-008; a porta única é **por cima** |

---

## 11. Catálogo de mudanças e decisões

### 11.1 A — Correções simples de UX

| ID | Mudança | Onde | Critério de pronto |
|---|---|---|---|
| **BP-A1** | Após "Confirmar entrada" no recebimento manual: **limpar o formulário** e mostrar CTAs "Ver estoque do produto" / "Registrar outra entrada". Impedir reenvio acidental | `RecebimentoGerentePageClient.tsx:110-113` | 2º clique imediato não cria 2ª entrada; formulário volta ao estado inicial |
| **BP-A2** | Tela final da NF-e com **CTAs e consequências**: "N contas a pagar geradas (R$ X · 1º venc.)" → Contas a pagar filtrada; "Revisar N produtos novos"; "Imprimir etiquetas"; "Lançar outra nota". Avisar que o fornecedor foi criado/atualizado | `ImportarNfePageClient.tsx:866-893` (+ dados vindos da confirmação) | ≥ 3 CTAs e a contagem/valor de títulos aparecem após "Dar entrada" |
| **BP-A3** | Corrigir o link "NF-e #…" de Contas a pagar (usa `/gerente/...` e perde a query) para `ROUTES.admin.importNfe` + `?id=` **e** a página aceitar `id` | `ContasPagarListClient.tsx:310-312`; `app/admin/estoque/importar-nfe/page.tsx` | Clique abre a importação de origem *(precisa confirmar no clique — [I])* |
| **BP-A4** | `successMessage` obrigatório (ou fallback) em `useGerenteMutation` | `useGerenteMutation.ts:32-46` | Recebimento, Transferência e Etiquetas mostram confirmação |
| **BP-A5** | Links de Relatórios → Produto passam a **abrir o produto** (padrão `onClick` do Kardex, ou `/admin/catalogo` ler `?produto=`) | `RelatoriosContent.tsx`; `app/admin/catalogo/page.tsx:61-71` | Clicar em qualquer linha das 4 listas abre o produto |
| **BP-A6** | Corrigir copy contraditória do Financeiro ("somente leitura", "fiado desabilitado", "lance uma nova conta a pagar") | `pt.json:2479,2504,1930,1962` | Texto descreve o que a tela realmente permite |
| **BP-A7** | Remover placeholder/colunas mortas de Fornecedores ("contato, e-mail, categoria") | `pt.json:1852`; `FornecedoresListClient` | Placeholder cita só campos existentes |
| **BP-A8** | Formas de pagamento com rótulo humano; **estorno** ("Desfazer recebimento") visível na linha; confirmação antes de "Receber" | `FinanceiroReceberExtras.tsx:31,165,224-228,242-270` | Nenhum código cru visível; desfazer acessível sem abrir "Histórico" |
| **BP-A9** | Seletor de cliente do "Novo título a receber" com **busca assíncrona** (hoje 20 primeiros) | `financeiro/page.tsx:70` | Qualquer cliente é encontrável |
| **BP-A10** | Aviso em "Cancelar conta a pagar": "Isto desfaz N pagamentos" | `cancelar_conta_pagar` / UI | Modal cita o número/valor de pagamentos afetados |
| **BP-A11** | Estados vazios acionáveis: **Estoque** (loja nova → "Entrada de mercadoria"; filtro → "Limpar filtros"), **Compras** (CTA dentro do vazio), ocultar aba "Transferências" com 1 loja | `EstoqueTable.tsx:160`; `ComprasContent.tsx`; hub | Nenhum vazio sem próximo passo |
| **BP-A12** | Abertura de caixa mostra **fundo sugerido** e resumo do turno anterior | `CaixaAbrirTurnoModal.tsx`; `CaixaPageClient.tsx:1908` | Fundo não vem fixo em 0 |

### 11.2 B — Reorganização de navegação

| ID | Mudança | Onde | Critério |
|---|---|---|---|
| **BP-B1** | Remover "Mais"; agrupar por intenção (seção 4.1); todos visíveis | `adminV2SidebarNav.ts`; `SidebarNav.tsx:44` | Zero itens atrás de colapsável; ≤ 4 por grupo |
| **BP-B2** | **Mínimo:** item de menu direto "Nota fiscal de entrada" → `/admin/estoque/importar-nfe`; aba de Estoque com o mesmo rótulo. **Completo:** página "Entrada de mercadoria" (E2) | menu + `estoqueHubNav.ts` | "Nota fiscal de entrada" encontrável em 1 clique sem abrir nada |
| **BP-B3** | "Contas a receber" e "Contas a pagar" como itens de menu (`?tab=`) | `adminV2SidebarNav.ts` | Ambos a 1 clique |
| **BP-B4** | Remover a duplicata da "Fila fiscal" dentro da aba A receber | `financeiro/page.tsx` | Fila aparece em um só lugar |
| **BP-B5** | Link **"Painel de gestão"** no PDV (menu Operações) para GERENTE/DONO/ADMIN | `CaixaPdvOperacoesMenu.tsx`; `adminPolicy.ts` | Gerente volta ao painel sem digitar URL; OPERADOR não vê |
| **BP-B6** | Início com **"O que fazer agora"** (seção 5.3) | `app/admin/dashboard/page.tsx` | ≥ 5 cards clicáveis alimentados por dados existentes |
| **BP-B9** | Comissões sai de "Mais" e vai para **Loja** | `adminV2SidebarNav.ts` | Visível |

### 11.3 C — Nomenclatura

| ID | Mudança |
|---|---|
| **BP-C1** | Aplicar a matriz da seção 6 (28 linhas). Fazer em **um único passo**, com `grep` de termos banidos (remessa, De-Para, Liquidar, "OC", "Fila fiscal", códigos de enum) como teste. Alinhar título de página = rótulo do menu (Início, Pedidos de compra, Financeiro). |

### 11.4 D — Continuidade

| ID | Mudança | Onde | Critério |
|---|---|---|---|
| **BP-D1** | Produto salvo → **"Fazer pedido de compra"** (deep-link `?fornecedor=` já existente) | `ProdutoFormModal.tsx:532-620` | CTA presente quando há fornecedor |
| **BP-D2** | Estoque baixo → **"Comprar"** *e* "Registrar entrada" | `EstoqueTable.tsx:162-179` | Duas ações por linha crítica |
| **BP-D3** | Pedido em trânsito: "Receber pedido"; ao receber: CTA "Ver estoque". **Enquanto BP-E1 não for decidido, nada orienta a lançar a mesma mercadoria por outro caminho — apenas avisa que isso duplica o estoque** *(entregue como aviso na UX-02.1; o texto original sugeria "Tem a nota? Lance-a", o que estava errado)* | `OcDetalheModal.tsx:108-128`; importador | Nunca termina em toast solto, e nunca induz dupla entrada |
| **BP-D4** | Venda a prazo: **"Título a receber R$ X gerado"** no toast e no recibo | `CaixaPageClient.tsx` ← `contasRecebeId` | Mensagem aparece em toda venda com título |
| **BP-D5** | Fornecedor → "Contas a pagar" (URL aceita `fornecedor_id`); mini-resumo "Em aberto R$ X · N títulos" | `financeiro/page.tsx:24-35`; `FornecedoresListClient.tsx` | Link abre lista filtrada com chip |
| **BP-D6** | Cliente → "Ver vendas" e filtros `de/ate/cliente` visíveis; exibir `ultima_compra` | `ClientesListClient.tsx`; `customerReader.ts:18` | Ficha mostra última compra e atalhos |
| **BP-D7** | Venda ↔ Documento fiscal: link nos dois sentidos (hoje `venda_id` é UUID cru) | `DocumentoFiscalDetailSheet.tsx:105-106`; `VendaDetailSheet` | Clique navega |
| **BP-D8** | Comprovante de fechamento: "Abrir novo turno" · "Ver em Caixas" | `CaixaFechamentoReciboModal.tsx:88-99` | ≥ 2 CTAs |
| **BP-D9** | "Entradas em andamento" (importações pendentes) no Início e na Entrada de mercadoria | `listarImportacoesNfePendentes` | Pendência visível fora do importador |
| **BP-D12** | Kardex → Auditoria filtrada **por produto** | `KardexSheet.tsx:25-31` | Chega direto às linhas do produto |
| **BP-D13** | **Indicador de etapa** só na NF-e, com passos **derivados do status real** (nunca fixos) | `ImportarNfePageClient.tsx` | Etapa correta ao retomar |
| **BP-D14** | KPIs de Contas a pagar = total real (agregado no servidor) | ver BP-F3 | Número não muda ao rolar |
| **BP-D15** | Nota **sem duplicatas**: aviso "nenhuma conta a pagar foi gerada" | `ImportarNfePageClient.tsx` | Aviso aparece quando não há `<cobr>` |
| **BP-D16** | Cada linha do Kardex linka ao documento de origem [?] | `KardexSheet.tsx` | Clique abre venda/nota/ajuste |
| **BP-D17** | PDV: busca de cliente sem resultado → link "Cadastrar cliente (painel)" | `CaixaSelecionarClienteModal.tsx:133-135` | Link para `/admin/clientes` (SSOT) |
| **BP-D18** | PDV: lista das movimentações aprovadas do turno | `CaixaPdvOperacoesMenu.tsx` | Sangrias/suprimentos do turno visíveis |
| **BP-D19** | `returnTo` + chip de contexto genéricos (N3) | shell / `PageHeader` | Todo deep-link mostra "← Voltar" e "Filtrado por…" |

### 11.5 E — Decisões de produto (precisam de "sim/não")

| ID | Pergunta | Opções | Recomendação | Se adiar |
|---|---|---|---|---|
| **BP-E1** | Como **Pedido de compra**, **Nota** e **Entrada sem nota** se relacionam? | (1) só **avisos** de possível duplicidade; (2) **vínculo estruturado** Nota→Pedido com status Total/Parcial (modelo [B]); (3) Pedido sempre recebe via nota/manual e perde o "Receber" próprio | **Opção 1 agora**, Opção 2 depois de dados reais de uso | Risco residual de estoque duplicado (ver F1) |
| **BP-E2** | "Entrada de mercadoria": **página de decisão** ou só renomear/duplicar portas? | (a) só BP-B2 mínimo; (b) landing com 3 cartões + "Entradas em andamento" | **(b)** — resolve a pergunta do cliente por completo | O primeiro clique continua ambíguo para quem não tem nota |
| **BP-E3** | **Conta a pagar manual** (aluguel, energia…) | (a) permitir; (b) só via NF-e | **(a)** — o Jinlong já tem categorias de despesa e a UI promete "lançar" [C]; "quanto devo" hoje ignora tudo que não vem de nota | Contas a pagar incompleto para o negócio real |
| **BP-E4** | **"Primeiros passos"** visível ao lojista (loja nova) | sim / não | **Sim**, derivado de dados reais | Loja nova abre em telas vazias |
| **BP-E5** | **Busca por intenção** (Ctrl+K) | sim / não | **Depois** da nomenclatura (P2) | Nada crítico |
| **BP-E6** | **Workflow de divergência** (faltando/danificado/recusado → crédito/devolução) | sim / não / depois | **Depois** — é processo, não navegação | Divergência segue como texto livre |
| **BP-E7** | **Relatório de contas** (aging, inadimplência, a pagar por fornecedor) | sim / não | **Sim**, P1 pós-Financeiro claro | "Quanto me devem" só por cliente |
| **BP-E8** | **Fiscal:** como comunicar que NFC-e real está fora do escopo? | selo "em implantação" / ocultar aba / manter | **Selo + rótulo honesto** | Cliente espera nota real |
| **BP-E9** | **Histórico de transferências** | sim / não | Depois | Transferência sem rastro na tela |
| **BP-E10** | **Diferenciar DONO × GERENTE** no menu; DONO acessa Implantação? | sim / não | Decidir com quem definiu o perfil | Ambos veem o mesmo hoje [C] |
| **BP-E11** | **Estorno individual** de pagamento em Contas a pagar | sim / não | Depois | Só cancelar-tudo |
| **BP-E12** | **Venda a prazo:** existe? como o operador a faz? | (a) pagamento parcial com cliente = a prazo (hoje); (b) forma explícita "A prazo" | Escolher e **nomear** | Copy contraditória continua |
| **BP-E13** | **Recebimento sem nota com vários itens** | (a) manter 1 produto por entrada; (b) multi-item | **(b)** se o cliente recebe sem nota com frequência | Digitação repetida (1 produto/remessa) [C] |

### 11.6 F — Pode afetar regra de negócio / arquitetura

| ID | Achado | Evidência | Por que é F |
|---|---|---|---|
| **BP-F1** | Recebimento manual com vínculo de Pedido **só valida**: a RPC `criar_confirmar_remessa_entrada` não recebe `ordemCompraId`, então o pedido continua "Em trânsito" e permite **receber de novo** (duplicando estoque) | [C] investigação de código (`actions.ts:178`, `OrdemCompraVinculoAutocomplete.tsx:8-9`) — **[I] o cenário de duplicação não foi executado** | Exige RPC/migration; **precisa ser confirmado clicando antes de qualquer tarefa** |
| **BP-F2** | Títulos gerados pela NF-e saem com **descrição vazia** e `nfe_numero` = número da duplicata, não o da NF-e | [C] `20260830110000…:120-135`; `payableReader.ts:35` | Migration + backfill |
| **BP-F3** | KPIs de Contas a pagar somam só as linhas carregadas | [C] `ContasPagarListClient.tsx:262-279` | Agregado no servidor |
| **BP-F4** | Aposentar a árvore `/gerente` (chaves mortas de `ROUTES`, 52 `revalidatePath`, links vivos `/gerente/vendas/{id}` que caem no dashboard, `DemoFluxo`) | [C] `routes.ts:19-39,133-167` | Refactor amplo; **corrigir só os links vivos primeiro (A)** |
| **BP-F5** | Fusão dos 3 motores de entrada (`origem_tipo`) | ADR-008 | Arquitetura |
| **BP-F6** | `vendas.numero_nf` nunca marcado "Emitida" pela fila fiscal | [I] sem UPDATE encontrado nas migrações | Investigar antes |

### 11.7 P — Polish (não bloqueia operação)
**BP-P1** Sheet/Dialog compartilhado (Compras deixa de usar modal para detalhe) · **BP-P2** automação opcional "lançar estoque ao finalizar conferência" · **BP-P3** atalhos do PDV visíveis sem "?" · **BP-P4** i18n hardcoded nos comprovantes do caixa · **BP-P5** um só sistema de toast · **BP-P6** `loading.tsx`/skeleton no admin.

---

## 12. Roadmap de implementação UX

Regras: pequeno · testável · reversível · independente quando possível · orientado a fluxo. **Nenhum "big bang".**

| Sprint | Nome | Objetivo operacional | Itens | Reversibilidade | Teste-chave |
|---|---|---|---|---|---|
| **S0** *(sem código, em paralelo)* | **Decidir** | Fechar E1, E2, E3, E12 e validar a matriz de nomenclatura com 1–2 lojistas | BP-E1/E2/E3/E4/E12 + seção 6 | n/a | Decisões registradas (ADR curto) |
| **S1** | **Achar** | "Onde lanço a nota fiscal de entrada?" respondido no menu | BP-B1, BP-B2 (mínimo), BP-B9, BP-C1 (só rótulos de menu) | 1 commit (arquivo de navegação) | Teste de menu + e2e: "Nota fiscal de entrada" a 1 clique |
| **S2** | **Fechar a entrada** | Nenhuma entrada de mercadoria termina sem próximo passo | BP-A1, BP-A2, BP-A3, BP-D15, BP-A4 | por tela | e2e: NF-e completa vê CTAs e contas geradas; recebimento não duplica |
| **S3** | **Início que orienta** | Ao logar, o lojista sabe o que fazer | BP-B6, BP-D9, BP-A11 | card a card | e2e: cada card leva ao destino certo |
| **S4** | **Comprar continua** | Do produto/estoque baixo/fornecedor ao pedido e à chegada | BP-D1, BP-D2, BP-D3, BP-D5 (+ BP-E2 completo se aprovado) | por link | e2e: produto → pedido; estoque baixo → comprar |
| **S5** | **Dinheiro claro** | "Quanto devo / quanto me devem" em 2 cliques, com números confiáveis | BP-B3, BP-B4, BP-A6, BP-A8, BP-A9, BP-A10, BP-C1 (Financeiro), BP-D14 | por item | Números iguais ao rolar; sem código cru |
| **S6** | **Vender e receber** | Venda a prazo confirmada; PDV ↔ painel; fechamento com próximo passo | BP-D4, BP-D6, BP-D7, BP-D8, BP-B5, BP-A12, BP-D17, BP-D18 | por tela | e2e: venda a prazo mostra título; gerente volta ao painel |
| **S7** | **Investigar** | Relatório/Kardex levam ao registro | BP-A5, BP-D12, BP-D16 | por lista | e2e: 4 listas abrem o produto |
| **S8** | **Integridade** *(após E1)* | Fechar riscos de dados | BP-F1, BP-F2, BP-F3 (+ backfill) | **migrations — revisão própria** | testes de RPC/idempotência |
| **S9** | **Consistência** | Um padrão visual e de estados | BP-D13, BP-D19, N8, BP-P1, BP-P5, BP-P6 | por componente | snapshot/comportamento |
| **S10** | **Limpeza** | Fim da árvore `/gerente` | BP-F4 (após corrigir links vivos) | 1 PR isolado | `check:entity-ssot` + e2e de redirects |

**Ordem de valor:** S1 → S2 → S3 respondem à queixa do cliente; S4–S6 fecham os dois ciclos; S8 depende de E1; S9–S10 são consolidação.

---

## 13. Critérios de aceitação

### 13.1 Globais (verificáveis, valem para todo o redesign)

| # | Critério |
|---|---|
| G1 | **Regra dos 2 cliques:** as 7 intenções da seção 5.1 são alcançáveis em ≤ 2 cliques a partir do Início, **sem expandir nenhum menu** |
| G2 | **Sem beco sem saída:** as 10 telas finais de fluxo (NF-e concluída, recebimento sem nota, pedido recebido, transferência, venda a prazo, recibo, comprovante de fechamento, recebimento de cliente, pagamento de conta, produto salvo) exibem ≥ 1 CTA de próximo passo |
| G3 | **Vocabulário:** nenhum texto visível em PT contém "remessa", "De-Para", "Liquidar", "OC" isolado, "Fila fiscal" nem códigos de enum (verificado por `grep`) |
| G4 | **Contexto:** todo builder de deep-link (`*Query`, `ROUTES`) tem teste garantindo que a página de destino **lê** o parâmetro |
| G5 | **Feedback:** as 12 ações principais (salvar produto, importar, dar entrada, receber pedido, finalizar venda, receber, pagar, sangria, suprimento, fechar caixa, abrir caixa, transferir) mostram sucesso citando a consequência |
| G6 | **Números confiáveis:** nenhum KPI depende de quantas linhas estão carregadas |
| G7 | **Nada escondido:** zero itens de menu atrás de colapsável; itens internos marcados |
| G8 | **Operador:** ≥ 8 de 10 tarefas da seção 14 sem ajuda, dentro dos tempos-alvo |
| G9 | **Preservação:** nenhum item da seção 10 regride (testes existentes verdes) |
| G10 | **Reversibilidade:** cada sprint pode ser revertida sem migration (exceto S8) |

### 13.2 Por sprint
- **S1:** item "Nota fiscal de entrada" no menu; nenhum item em "Mais"; teste de navegação atualizado.
- **S2:** após "Dar entrada no estoque" aparecem ≥ 3 CTAs e o número/valor de contas geradas; 2º clique no recebimento manual não duplica.
- **S3:** ≥ 5 cards com destino correto; loja vazia mostra "Primeiros passos" (se E4 aprovado).
- **S4:** produto salvo com fornecedor mostra "Fazer pedido de compra"; linha de estoque baixo tem "Comprar".
- **S5:** "Contas a pagar" mostra total real; nenhum `CARTAO_DEBITO` visível.
- **S6:** toda venda com título mostra "Título a receber R$ X gerado"; gerente sai do PDV para o painel sem digitar URL.
- **S7:** clicar em qualquer linha das 4 listas de Relatórios abre o produto.
- **S8:** vincular pedido no recebimento manual **não** permite receber o mesmo pedido de novo.

---

## 14. Teste final do operador

**Protocolo:** 3 pessoas que nunca viram o Jinlong (idealmente lojistas). Sem explicação prévia. *Think-aloud*. O observador **não ajuda**; anota cada pergunta, cada volta e o tempo. Ambiente de teste com: 1 fornecedor, 1 XML de exemplo (com duplicatas), 1 XML sem duplicatas, 1 cliente com saldo, 1 produto com estoque baixo, caixa fechado.

| # | Tarefa dita ao operador | Sucesso = | Alvo | Hipótese hoje |
|---|---|---|---|---|
| T1 | "Chegou mercadoria **com nota fiscal**. Lance a nota e deixe o estoque atualizado." | Estoque atualizado **e** o operador diz que foi gerada conta a pagar | ≤ 3 min, sem ajuda | **Falha** (P0-1; nenhuma menção às contas) |
| T2 | "Chegou mercadoria **sem nota**. Registre a entrada." | Entrada única e correta | ≤ 2 min | Parcial (ambiguidade "Recebimento") |
| T3 | "Cadastre um produto e **peça mais dele** ao fornecedor." | Pedido criado | ≤ 3 min | **Falha** (Compras em "Mais"; sem CTA) |
| T4 | "O pedido chegou. Registre o recebimento **e** lance a nota, se tiver." | Estoque creditado **uma** vez | ≤ 3 min | Risco de duplicidade (F1) |
| T5 | "Descubra **quanto você deve** a este fornecedor." | Valor correto | ≤ 60 s | **Falha** (sem link; KPI parcial) |
| T6 | "Descubra **quanto este cliente deve** e registre que ele pagou R$ 50." | Saldo correto e recebimento registrado | ≤ 2 min | Sucesso parcial (painel de 8 itens; sem confirmação) |
| T7 | "Venda a um cliente **a prazo**." | Título gerado **e o operador percebe** | ≤ 2 min | Falha na percepção (BP-D4/E12) |
| T8 | "Este produto está acabando. **Resolva.**" | Chega a comprar ou registrar entrada | ≤ 90 s | Parcial ("Repor" leva à entrada) |
| T9 | "**Por que** o estoque deste produto mudou ontem?" | Encontra o movimento causador | ≤ 90 s | Sucesso |
| T10 | "**Feche o caixa** e depois veja o fechamento no painel." | Fecha e chega a Caixas | ≤ 2 min | Falha na volta (sem caminho PDV→painel) |
| T11 | "Qual foi o **produto mais vendido** do mês? Abra a ficha dele." | Abre o produto | ≤ 60 s | **Falha** (links de Relatórios) |
| T12 | "Loja nova: **o que faço primeiro?**" | Segue "Primeiros passos" | ≤ 30 s para decidir | **Falha** (não existe) |

**Aprovação do redesign:** G8 (≥ 8 de 10 tarefas centrais sem ajuda). **Medir por tarefa:** tempo, cliques, voltas, perguntas feitas, onde hesitou. **Repetir** antes e depois de S1 e depois de S6 para provar melhoria com dado, não com opinião.

---

## Respostas objetivas

**Qual é o modelo mental do Jinlong?** Dois ciclos que giram juntos — *mercadoria* (produto → fornecedor → pedido → chegada → estoque → venda) e *dinheiro* (contas a pagar/receber → caixa → fechamento) — sobre três cadastros (produto, cliente, fornecedor) e três documentos (pedido, nota, venda). A interface deve responder cinco perguntas: o que faço agora, onde está, o que aconteceu, qual o próximo passo, para onde volto.

**O que precisa mudar primeiro?** O **primeiro clique**: menu por intenção, sem "Mais", com "Nota fiscal de entrada" e "Entrada de mercadoria" visíveis (S1), e o **fim** de cada entrada de mercadoria dizendo o que aconteceu, inclusive as contas a pagar geradas (S2).

**Quanto é reorganização e quanto é funcionalidade nova?** Reorganização, rótulo, link e feedback são a esmagadora maioria (classes A–D). Lacunas reais de produto são poucas: **conta a pagar manual (E3)**, **vínculo pedido↔nota (E1)**, **relatório de contas (E7)**, **onboarding (E4)** e **definição de venda a prazo (E12)**. Riscos de dados que precisam ser **confirmados clicando** antes de virar tarefa: **BP-F1** (pedido vinculado que não é baixado) e o link de NF-e em Contas a pagar (BP-A3).

**Precisa de redesign visual?** Não como ponto de partida. Precisa de **consistência estrutural** (cabeçalho estável, 4 estados, um toast, sheets × modais, KPIs reais). Visual vem por último (seção 9).

**O que precisamos concordar antes de implementar?** (1) o agrupamento do menu da seção 4.1; (2) a matriz de nomenclatura da seção 6; (3) as decisões **E1, E2, E3, E12** (S0); (4) a ordem S1→S7; (5) que **F1 e o link de NF-e (A3)** sejam verificados clicando no ambiente antes de entrarem no backlog.
