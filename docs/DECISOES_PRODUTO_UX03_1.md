> UX-03.1 · 2026-09-18 · **Análise somente.** Nenhum arquivo existente foi alterado; sem código, migration, RPC, UI, teste ou commit. Reduz o `DECISOES_PRODUTO_UX03.md` ao mínimo necessário para desenhar. Grau de certeza: **ALTO** = comprovado no código/migração · **MÉDIO** = comprovado em parte ou inferência direta · **BAIXO** = proposta, não comprovada.

# 1. O que já podemos congelar

Significados abaixo só afirmam o que o código comprova. Onde o conceito é proposta, está dito.

| CONCEITO | SIGNIFICADO OPERACIONAL | GRAU DE CERTEZA |
|---|---|---|
| **Pedido / Ordem de Compra** | Registro do que foi pedido a um fornecedor (itens, quantidades, preço combinado), com estados Rascunho → Confirmada → Em trânsito → Recebida ou Cancelada. Sozinho não mexe em estoque nem em dinheiro. **Hoje também tem o seu próprio "Receber"**: confere, credita o estoque e **sempre** encerra o pedido, mesmo com menos do que o pedido. Um item de pedido pode não ter produto cadastrado (só descrição); nesse caso o recebimento não credita estoque. | **ALTO** — não se afirma que "Pedido" seja a palavra certa para o lojista, nem que ele deva continuar recebendo sozinho |
| **Entrada de mercadoria** | O momento em que mercadoria que chegou **passa a constar no estoque, depois de conferida (contada)**, deixando registro no histórico. É o denominador comum dos três caminhos existentes: nenhum credita sem quantidade conferida maior que zero. | **ALTO** para esse denominador comum · **BAIXO** para "Entrada" como tela/entidade única (é vocabulário previsto no banco e nunca usado) |
| **NF-e** | Documento fiscal **emitido pelo fornecedor**, lido do XML. Identifica a compra (chave única: não entra duas vezes) e traz itens e parcelas. **Importar não muda o estoque.** Ao confirmar a conferência: entra estoque, o custo é atualizado, nascem as contas a pagar, o fornecedor é criado/atualizado pelo CNPJ e produtos desconhecidos viram rascunho. A loja não emite nada na compra. | **ALTO** — não comprovado: nota em papel, consulta automática de notas |
| **Estoque** | Saldo por produto e loja **mais** histórico permanente de movimentos. Só muda por operação registrada (entrada, venda, ajuste, transferência, cancelamento). Não há reserva nem inventário formal. | **ALTO** |
| **Custo** | Custo de compra do produto. Atualizado **somente** quando uma NF-e é confirmada (opção ligada por padrão; é pulado se violar a margem do produto). Pedido e entrada sem nota **não** o atualizam. É o **último custo**, não custo médio. | **ALTO** |
| **Contas a Pagar** | Dívida com fornecedor (valor, vencimento, status). Hoje **só nasce da confirmação de uma NF-e**, uma por parcela do XML. Pode ser paga em partes (dinheiro sai do caixa; demais formas não) e cancelada. Não há criação manual. Pagamento e cancelamento **não dependem** de NF-e. | **ALTO** |
| **Venda** | Ato do PDV que, numa só operação, baixa o estoque, registra o(s) pagamento(s), afeta o caixa se houver dinheiro, enfileira o documento fiscal (emissão real fora de escopo) e, **se sobrar saldo com cliente**, cria a conta a receber. Pode ser cancelada (reverte estoque e cancela o título). | **ALTO** |
| **Conta a Receber** | Dívida de cliente. Nasce (a) na venda com saldo pendente e cliente — **um título por venda, sem vencimento** — ou (b) manualmente, com vencimento opcional. É recebida em partes; dinheiro exige caixa aberto e entra na gaveta. | **ALTO** — **não comprovado** o que "a prazo" significa para o negócio |
| **Caixa** | Turno de gaveta: abertura com troco inicial, fechamento com contagem cega, sangria e suprimento. O saldo físico muda com venda em dinheiro, recebimento em dinheiro, pagamento de conta em dinheiro e sangria/suprimento. | **ALTO** |

**Ainda não congeláveis:** "Entrada" como conceito único (depende de B-1) e "venda a prazo" (depende de B-2).

# 2. Decisões BLOQUEADORAS

Das cinco decisões (D-1 a D-5) sobraram **duas**. As demais foram removidas com o motivo na tabela ao final.

## B-1 — O pedido é encerrado pela entrada?

**DECISÃO.** Relação entre Pedido e Entrada de mercadoria (era D-1, absorve a parte estrutural de D-2 e D-5).

**PERGUNTA AO DONO DO PRODUTO.** Quando a mercadoria de um pedido chega e é registrada na loja — com nota ou sem nota —, esse registro deve dar o pedido como atendido?
- **A.** Sim: o pedido é encerrado por esse registro (o operador escolhe se fecha ou se continua aberto para o que faltou).
- **B.** Não: pedido e entrada continuam separados, como hoje.

**POR QUE BLOQUEIA O UX.** Define o formato da tela de Entrada (tem campo "Pedido" ou não), as telas do Pedido (estados, "chegou tudo / faltou") e o papel do pedido na porta de entrada (referência ou caminho próprio). **Nenhuma resposta é neutra:** A compromete o roadmap com uma mudança de dados (vínculo gravado no banco); B compromete o UX com avisos permanentes e com pedidos que só saem por cancelamento (perdendo o histórico de que foram atendidos).

**O QUE MUDA SE A RESPOSTA FOR A OU B.**

| | A (encerra) | B (separados) |
|---|---|---|
| Tela de Entrada | ganha bloco "Pedido (opcional)" | sem campo de pedido |
| Tela de Pedido | mostra "recebido por…"; pode ficar parcial | mantém só o seu "Receber" |
| Porta "pedido" | vira **referência** anexada à entrada | continua **caminho próprio** (e é o pior caminho quando também há nota: sem custo e sem conta a pagar) |
| Pedido atendido "por fora" | encerra sozinho | precisa de saída própria (hoje: cancelar) |
| Avisos de duplicidade | somem quando o vínculo é usado | permanentes |

*Prazo:* decidir **antes de desenhar** Entrada e Pedido. *Detalhe que pode ficar para depois sem retrabalho relevante:* "sempre fecha" × "operador escolhe" (acrescentar o controle depois é barato).

## B-2 — Venda a prazo: escolha do operador ou "pagar menos"?

**DECISÃO.** Significado de "venda a prazo" e se ela tem data (era D-4; o nome sai de D-5).

**PERGUNTA AO DONO DO PRODUTO.** Quando o cliente vai pagar depois, o operador deve escolher isso **de propósito** na venda (informando quando o cliente vai pagar), ou basta registrar um pagamento **menor que o total** com o cliente selecionado, como hoje?
- **A.** Escolha explícita, com data.
- **B.** Continua implícito, sem data.

**POR QUE BLOQUEIA O UX.** Altera o passo de pagamento do PDV — a tela mais frequente e mais sensível a velocidade — e as colunas/filtros de "A receber" no Financeiro (só existe "vencido" onde há data). Também fixa o nome que o lojista lê.

**O QUE MUDA SE A RESPOSTA FOR A OU B.**

| | A (explícita, com data) | B (implícita) |
|---|---|---|
| PDV | condição/botão "a prazo" + data + confirmação | painel de pagamento igual; passa a mostrar "A receber R$ X" e pedir confirmação |
| Financeiro "A receber" | vendas a prazo entram em "vencidos" e ordenam por vencimento | essas vendas **nunca** aparecem como vencidas — passa a ser regra declarada, não acidente |
| Recibo e mensagens | mostram data e nome único | mostram só o saldo |
| Erro de digitação | protegido por confirmação | protegido só se a confirmação for acrescentada |

*Prazo:* decidir antes de desenhar o **passo de pagamento do PDV**; as demais etapas do UX-04 não dependem disso. *Ficam de fora:* limite de crédito, parcelas, fiscal (seção 3).

## Decisões removidas desta seção

| Origem | Por que saiu | Padrão adotado até decisão contrária |
|---|---|---|
| D-2 (porta única × nomes; menu) | Resolvida por padrão: *Entrada de mercadoria* = **ação** no hub de Estoque e no Início, sob a regra de menu vigente. Item de menu pode ser somado depois sem redesenhar fluxo. | Manter a regra atual de menu |
| D-3 (conta a pagar avulsa) | Aditiva (seção 3). | Contas a pagar = consequência de nota |
| D-5 (documento principal) | Virou o modelo provisório da seção 6; o vocabulário é confirmado pelas falas do cliente (seção 4) e é troca de texto. | Vocabulário provisório da seção 6 |
| D-1 (parcial, fornecedor divergente, receber pedido sozinho, custo) | Detalhes de B-1 ou regras internas (seção 3). | Manter o "Receber" do pedido como está |
| D-4 (limite, parcelas, nome, fiscal) | Não alteram o formato de nenhuma tela (seção 3). | Comportamento atual |

# 3. Decisões que NÃO bloqueiam o UX

## 3.1 Podem esperar — com a confirmação técnica feita

| Item | Por que não bloqueia | Confirmação técnica | Retrabalho se decidido depois |
|---|---|---|---|
| **Conta a pagar avulsa** | Acrescenta um botão e um formulário numa tela existente; nenhum fluxo de compra depende dele. | Tabela aceita título sem NF-e (vínculo com a nota é opcional; há campos de descrição e observação; só exige fornecedor cadastrado). Pagamento e cancelamento não referenciam NF-e. O "A receber" já tem o mesmo padrão de tela. | **BAIXO** |
| **Entrada sem nota gerar conta a pagar** | Bloco opcional e aditivo na tela de entrada sem nota. Padrão: não gera. | Hoje nenhuma entrada sem nota cria título; o vínculo teria de ser novo. | **BAIXO** (sobe para MÉDIO se o cliente disser que nota em papel é comum) |
| **Parcelas na venda a prazo** | O passo de pagamento pode nascer com **uma** data. | `contas_receber` tem `UNIQUE(venda_id)`; a própria migração já prevê "substituir por `UNIQUE(venda_id, parcela_numero)`" — evolução planejada, não decisão nova. | **MÉDIO** só se o desenho tratar a data como algo que não pode virar lista |
| **Conta corrente do cliente** | Nenhuma tela ou regra atual pressupõe. | Modelo atual é um título por venda. | Fora do escopo |
| **Limite de crédito e aviso** | Comportamento já existe (avisar / bloquear / pedir gerente); falta mostrar o aviso e ter onde configurar — texto e configuração, não formato de tela. | Modo é uma coluna por loja, com padrão "avisar"; o resultado da venda no PDV não mapeia o aviso. | **BAIXO** |
| **Fornecedor da nota diferente do do pedido** | Mensagem dentro do bloco de B-1 (só existe se B-1 = A). | — | **BAIXO** |
| **Custo atualizado por outras vias** | Nenhuma tela depende. Custo médio está fora do escopo do domínio de estoque. | Só a confirmação da NF-e atualiza custo. | **BAIXO** |
| **Item de menu / página "Entrada de mercadoria" / busca global** | Melhoram a descoberta; não mudam o modelo. | Os testes do menu travam "no máximo 10 itens" e "recebimento/transferência só como aba de Estoque". | **BAIXO** |
| **Relatórios de contas (idade da dívida etc.)** | Consequência do modelo, não parte dele. | — | **BAIXO** |

## 3.2 Parecem decisões, mas são implementação futura

Nenhuma delas exige resposta do dono do produto.

- **Entrada sem nota com vários itens.** A RPC **já aceita uma lista de itens**; só a tela envia um. É UX puro. **Correção ao UX-03:** a frase "o pedido é o único caminho multi-item sem documento" vale para a *tela*, não para o modelo. Padrão sem arrependimento: desenhar a entrada sem nota já como lista.
- **Correção de dado da conta a pagar gerada pela NF-e** (descrição vazia; número da parcela no lugar do número da nota) — bug, não decisão.
- **Horário do "vencido"** (usa data UTC) — bug.
- **KPI de Contas a pagar somando só a página carregada** — correção de leitura.
- **Mostrar o aviso de limite de crédito; mostrar "A receber R$ X" no recibo** — exibição de dado que já existe.
- **Texto contraditório do Financeiro ("fiado desabilitado")** — só se reescreve **depois** de B-2; até lá não é tarefa.
- **Uso da origem já prevista no banco; ligação do Kardex ao documento; "sempre fecha × escolhe"** — consequências de B-1, não perguntas.

## 3.3 Precisam de investigação técnica adicional (não são decisões)

| Investigação | Por que importa | Muda o desenho? |
|---|---|---|
| **Como a nota "encontra" os itens do pedido** | Item de pedido pode não ter produto cadastrado (só descrição); nota usa produtos reconhecidos. Define até onde o vínculo de B-1-A funciona. | Só a forma do bloco "Pedido", não a decisão |
| **Como o documento fiscal da venda representa a parte não paga na hora** | Pode exigir uma forma de pagamento declarada. | Só se B-2 = A e o fiscal exigir campo no PDV — **fechar antes de implementar B-2-A** |
| **Confirmar que o banco real tem as colunas de origem da entrada** | Houve migração de correção de divergência entre ambientes. | Não |
| **Reproduzir "pedido em trânsito + nota confirmada + Receber pedido" em banco de teste** | Comprova o duplo crédito de estoque (hoje demonstrado por leitura, não executado). | Não muda a decisão; muda a urgência |

# 4. Perguntas para o CLIENTE

Cinco perguntas, na linguagem do lojista. Fazer **antes** de fechar B-1 e B-2.

**1. "Quando você compra mercadoria de um fornecedor e ela chega na loja, o que você tem em mãos e o que faz primeiro? Chegam muitos produtos diferentes de uma vez?"**
*Por que importa:* mostra quantas entregas chegam com nota eletrônica, com nota em papel ou sem nada — ou seja, qual caminho de entrada é o principal e se a tela sem nota precisa ser uma lista. Decide a ordem das portas e o peso da nota em papel (seção 3.1).

**2. "Você costuma fazer o pedido ao fornecedor antes da mercadoria chegar? Quando chega, vem tudo de uma vez ou em partes?"**
*Por que importa:* se o pedido é rotina ou exceção e se entrega parcial é comum. É a evidência que falta para responder **B-1** (encerrar o pedido, deixá-lo parcial ou nem ter pedido no dia a dia).

**3. "Quem, na sua loja, confere a mercadoria e dá entrada no sistema: você, um gerente ou um funcionário do balcão?"**
*Por que importa:* dar entrada só é permitido a gerente/dono/administrador, e o funcionário do balcão não acessa o painel. Se quem recebe é o balcão, a tela de entrada tem um problema de acesso que nenhum desenho de fluxo resolve sozinho.

**4. "Além de mercadoria, o que mais você paga todo mês? Onde anota isso hoje?"**
*Por que importa:* confirma se contas a pagar avulsa deixa de ser "pode esperar" e vira necessidade do dia 1 (**conta a pagar avulsa**, seção 3.1).

**5. "Você vende para o cliente pagar depois? Como combina a data e como cobra?"**
*Por que importa:* é a evidência para **B-2**: se há data combinada e cobrança ativa (então "vencido" precisa existir) ou se é confiança sem data; e se há parcelas.

# 5. Perguntas que NÃO devemos fazer ao cliente

São responsabilidade do produto/engenharia. Perguntar ao usuário transfere um risco que ele não tem como avaliar.

| Não perguntar | Por quê |
|---|---|
| "Quer que o sistema impeça lançar a mesma mercadoria duas vezes?" | Ninguém responde "não". É obrigação do produto; a pergunta real é B-1 (como impedir), que é do dono do produto. |
| "Como você quer chamar essas telas?" | Cada lojista usa uma palavra. Observam-se as falas (perguntas 1, 2, 5) e o produto escolhe **um** vocabulário. |
| "Onde quer o botão / quer item novo no menu?" | Decisão de desenho; usuário sem referência de comparação responde o que já conhece. |
| "Deve haver conferência antes de entrar no estoque?" | Princípio de controle do produto (base da rastreabilidade). Não é preferência. |
| "Qual método de custo usar (último, médio)?" | Política financeira/contábil; consultar contador, não operador. |
| "Qual limite e regra de crédito padrão?" | O padrão precisa proteger o lojista dele mesmo (hoje o padrão é crédito irrestrito e sem aviso); o cliente ajusta depois. |
| "Como a nota fiscal da venda deve mostrar o pagamento?" | Exigência fiscal; validar com fiscal/contador. |
| "Quem pode fazer o quê no sistema?" | Modelo de permissões é do produto; só se pergunta **quem faz hoje** (pergunta 3). |
| Qualquer pergunta que cite banco, vínculo, motor ou tela | Não são conceitos do lojista; a decisão é interna. |

# 6. Modelo operacional provisório

Construído só a partir do que o código comprova. **[comprovado]** = existe hoje; **[proposto]** = vocabulário/organização sugerida, não existe como tela ou dado.

## 6.1 Compra — três fluxos que **não coincidem**

```
FÍSICO — a mercadoria                                           [comprovado]
 FORNECEDOR envia ─▶ MERCADORIA CHEGA ─▶ CONFERIR (contar) ─▶ ENTRA NO ESTOQUE (fica no histórico)

FISCAL — o documento                                            [comprovado]
 FORNECEDOR emite a NOTA FISCAL ─▶ a loja recebe o arquivo (XML) ─▶ IMPORTAR (reconhece produtos e fornecedor)
   └─ a loja não emite documento nenhum na compra; importar a nota NÃO mexe no estoque e pode acontecer antes da conferência

FINANCEIRO — o dinheiro                                         [comprovado]
 PEDIDO (sem efeito no dinheiro)
 NOTA traz as PARCELAS ─(ao confirmar a entrada)─▶ CONTA A PAGAR (uma por parcela) ─▶ PAGAR
                                                     └─ em dinheiro: sai do caixa · outras formas: não passam pelo caixa
 CUSTO do produto ◀─ atualizado pela nota, na mesma confirmação
```

**Onde os três se encontram:** em um único ponto — **a confirmação da entrada da nota**: estoque (físico), custo e contas a pagar (financeiro) e fechamento da importação (fiscal). Nos outros dois caminhos só o físico acontece:

| Caminho | Físico | Fiscal | Financeiro |
|---|---|---|---|
| Entrada com nota | ✔ | ✔ (a nota) | ✔ (conta a pagar + custo) |
| Entrada sem nota | ✔ | — | — |
| Receber o pedido diretamente **[comprovado]** | ✔ | — | — |

**Onde não coincidem:** (1) o fiscal (importar a nota) **não depende** do físico e pode acontecer antes da conferência — o estoque só entra na confirmação; (2) o financeiro nasce na **confirmação da entrada**, não na emissão da nota nem na importação; (3) o pedido, que não tem efeito fiscal nem financeiro, hoje **mexe no físico**; (4) a mesma mercadoria pode ter até três registros (pedido, nota, entrada) sem ligação entre eles.

**Como organizar para o lojista [proposto]:**

```
PEDIDO (opcional; é uma referência)
   │  (se existir, é informado na entrada)
   ▼
ENTRADA DE MERCADORIA (quando a mercadoria chega e é conferida)
   ├─ com NOTA FISCAL (XML) ─▶ estoque + custo + contas a pagar
   └─ SEM NOTA ─────────────▶ só estoque
```

## 6.2 Venda — três fluxos que **coincidem na finalização**, mas divergem depois

```
FÍSICO                                                          [comprovado]
 PRODUTO SAI (baixa no estoque, com histórico) ─ dinheiro entra na GAVETA (se pago em dinheiro)

FISCAL                                                          [comprovado]
 documento fiscal é enfileirado na finalização (assíncrono; emissão real fora de escopo hoje)

FINANCEIRO                                                      [comprovado]
 PAGAMENTO(S) ─▶ CAIXA
 se sobra SALDO e há CLIENTE ─▶ CONTA A RECEBER (sem data) ─▶ RECEBER depois ─▶ CAIXA (se dinheiro)
 CANCELAR a venda ─▶ devolve estoque e cancela o título
```

**Coincidem:** baixa de estoque, pagamentos, título e enfileiramento fiscal ocorrem na mesma finalização. **Divergem:** o fiscal é assíncrono; o recebimento do saldo acontece **depois** e em outra tela (Financeiro), não no PDV.

## 6.3 Vocabulário provisório (troca de texto; confirmar com as falas do cliente)

| Termo provisório | Significado | Substitui / esclarece |
|---|---|---|
| **Pedido** | O que se pediu ao fornecedor | "Ordem de compra", "OC" |
| **Entrada de mercadoria** | Mercadoria que chegou, foi conferida e entrou | "Recebimento", "Entrada sem NF", "Recebimento e remessa" |
| **Nota fiscal de entrada** | Documento do fornecedor, importado do XML | "Importar NF-e" |
| **Conferir** | Contar o que chegou | "Conferência", "Conferência da entrada" |
| *nome da venda com saldo* | **pendente de B-2** | "fiado", "pagamento parcial", "a prazo" |

# 7. Risco de retrabalho

Se a decisão sair **depois** que o desenho estiver pronto.

| Decisão | Risco | Motivo |
|---|---|---|
| **B-1** Pedido encerrado pela entrada | **ALTO** | Muda a forma da tela de Entrada, os estados e a lista do Pedido e o papel do pedido na porta de entrada. Desenhar sob uma hipótese e errar reordena telas, não textos. |
| **B-2** Venda a prazo explícita, com data | **ALTO** (PDV) · **MÉDIO** (Financeiro) | Acrescenta um passo ou controle ao pagamento do PDV; no Financeiro acrescenta coluna/filtro de vencimento e a noção de "vencido". |
| **Parcelas** na venda a prazo | **MÉDIO** | Só se o desenho assumir uma data única que não pode virar lista (modelo atual já prevê a evolução). |
| **Vocabulário** (seção 6.3) | **MÉDIO** se mudar depois do texto final · **BAIXO** se antes | Não muda estrutura, mas percorre todas as telas, mensagens e menus. |
| **Nota em papel gera conta a pagar** | **BAIXO** (sobe a MÉDIO se for comum) | Bloco opcional na entrada sem nota. |
| **Conta a pagar avulsa** | **BAIXO** | Botão e formulário numa tela existente; nenhum fluxo de compra depende. |
| **Entrada sem nota multi-item** | **BAIXO** se já nascer como lista · **MÉDIO** se nascer como formulário de um produto | Migrar de formulário simples para lista muda a tela inteira; não exige decisão do produto. |
| **Item de menu / página de Entrada** | **BAIXO** | Somar entrada de menu não altera nenhum fluxo. |
| **Limite de crédito e aviso** | **BAIXO** | Mensagem e configuração. |
| **Fornecedor divergente; custo por outras vias** | **BAIXO** | Regra interna ou mensagem. |
| **Fiscal da venda com saldo** | **BAIXO**, exceto se exigir forma de pagamento declarada no PDV (aí acompanha B-2) | Em geral invisível ao operador. |

# 8. GO / NO-GO PARA UX-04

**Ainda falta uma decisão essencial antes de desenhar.**

**Falta exatamente:** **B-1** — *"Quando a mercadoria de um pedido chega e é registrada na loja, esse registro deve dar o pedido como atendido?"*
