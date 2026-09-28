# Ficha de decisão B-1 — Ordem de Compra e recebimento parcial

> Para o dono do produto · 2026-09-18 · Baseada em `DECISOES_PRODUTO_UX03.md`, `DECISOES_PRODUTO_UX03_1.md` e `DECISOES_PRODUTO_UX03_2.md`. Nenhuma implementação, nenhuma auditoria nova. Os números dos exemplos são **ilustrativos**; as regras descritas são as do sistema.

## 1. O PROBLEMA EM UMA FRASE

Hoje o pedido de compra é encerrado por **um único recebimento**, e o sistema **não acompanha o que ainda falta chegar**; além disso, se a mercadoria entra por nota fiscal ou por entrada sem nota, o pedido **não fica sabendo**.

## 2. O QUE O JINLONG FAZ HOJE

Somente fatos comprovados no código:

- O pedido guarda o que foi pedido (produto, quantidade, preço) e passa por **Rascunho → Confirmada → Em trânsito → Recebida** (ou **Cancelada**). Não volta de estado.
- O "Receber" do pedido só existe quando ele está **Em trânsito**. O operador digita a quantidade contada de cada item; o sistema credita o estoque com a **quantidade contada** e **sempre marca o pedido como Recebida**, mesmo que tenha chegado menos.
- **Não existe saldo:** o pedido guarda a quantidade pedida e a quantidade recebida (gravada uma única vez). Não existe "faltam N".
- Depois de **Recebida**, o pedido não pode ser reaberto nem receber novamente.
- Nota fiscal (NF-e) e entrada sem nota **não enxergam** o pedido, e o pedido não enxerga nenhuma delas. Na entrada sem nota existe um campo "Vincular a uma Ordem de Compra", mas ele **só confere que o pedido ainda não foi recebido**; não altera o pedido.
- Se a mercadoria entra por nota ou por entrada sem nota, o pedido **continua "Em trânsito"**. As únicas saídas são **Receber** (que credita o estoque de novo) ou **Cancelar**. O indicador "Valor em trânsito" continua contando o valor **cheio** do pedido.
- O pedido **nunca** gera conta a pagar nem atualiza custo (só a nota fiscal faz isso).
- Só gerente, dono e administrador podem receber pedido.

## 3. OPÇÃO A — SEM RECEBIMENTO PARCIAL

**O pedido é encerrado no primeiro recebimento. O sistema não acompanha saldo.** (É o comportamento de hoje; a variante "entrada vinculada também encerra o pedido" tem o mesmo efeito sobre os 40.)

**Exemplo:** pedido = **100** unidades; chegam **60**.

| | O que acontece |
|---|---|
| **As 60** | O operador registra 60 no "Receber". Entram **60** no estoque, com registro no histórico. |
| **As 40** | **Não ficam registradas em lugar nenhum como pendentes.** O pedido mostra "recebido 60" ao lado de "pedido 100" só se alguém abrir e comparar; não há lista, alerta ou indicador. |
| **Estado do pedido** | **Recebida** (terminal). Não pode ser reaberto. |
| **Estoque** | +60. Correto para o que chegou. |
| **Próxima entrega (40)** | **Não pode** ser recebida pelo pedido. Se for lançada por entrada sem nota, o vínculo com o pedido é **recusado** ("já foi recebida") e ela entra **sem vínculo**; por nota fiscal também entra **sem vínculo**. O estoque fica certo, mas nada liga as 40 ao pedido. |
| **Risco operacional** | A falta **some do radar**: o lojista precisa anotar fora do sistema ou fazer novo pedido. Se a 1ª entrega chegar por **nota** em vez do "Receber", o pedido fica **pendurado** com 100 e o operador pode **duplicar o estoque** ao clicar "Receber" depois. |

## 4. OPÇÃO B — COM RECEBIMENTO PARCIAL

**O pedido acompanha o que já chegou e o que falta. Cada entrada (pelo pedido, por nota ou sem nota) vinculada ao pedido abate o saldo.** *(Não existe hoje; é uma proposta.)*

**Mesmo exemplo:**

| Momento | Pedido | Recebido | Saldo | Estado do pedido |
|---|---|---|---|---|
| Pedido feito | 100 | 0 | 100 | Em trânsito |
| **1ª entrada:** chegam 60 | 100 | **60** | **40** | **Parcial** (continua aberto) |
| **2ª entrada:** chegam 40 | 100 | **100** | **0** | **Completo** (encerra sozinho) |
| *Se só chegassem 30 na 2ª e o restante nunca vier* | 100 | 90 | 10 | O operador **encerra com falta** (registra que 10 não vieram) |

Regras do modelo: conta como "recebido" a quantidade **contada** (não a declarada na nota); mais do que o pedido é aceito e sinalizado como "a mais"; "Cancelar" fica para pedido em que **nada** foi recebido.

**Mudanças de modelo necessárias:**

1. **Vínculo por item** entre o que entrou (nota ou entrada sem nota) e o item do pedido — vínculo só no pedido inteiro **não basta** para calcular o saldo de cada item.
2. **Acumular** a quantidade recebida (hoje é gravada uma vez, no único recebimento).
3. **Regra de encerramento:** o pedido fecha quando o saldo zera ou quando o operador o encerra com falta.
4. **Situação "parcial" calculada a partir das quantidades** (sem criar um novo estado armazenado no banco).
5. As operações de **entrada sem nota, nota fiscal e "Receber" do pedido** passam a atualizar o pedido na mesma operação; a do pedido também precisa de trava contra recebimento simultâneo.

## 5. COMPARAÇÃO

| Critério | A — sem parcial | B — com parcial |
|---|---|---|
| **Simplicidade** | Alta: é o modelo atual; um recebimento fecha o pedido | Média: o pedido passa a ter saldo, entregas e "encerrar com falta" |
| **Controle de compras** | Baixo: o que faltou não é acompanhado | Alto: pedido / recebido / saldo visíveis |
| **Entregas parciais** | Não suporta (a falta se perde) | Suporta |
| **Múltiplas entregas** | Não suporta (o pedido fecha na 1ª) | Suporta: cada entrega abate o saldo |
| **Risco de duplicidade** | **Permanece** quando a entrada vem por nota ou sem nota (pedido "pendurado" + "Receber") — só reduzido por avisos | **Reduz**: o pedido sabe o que já entrou. Depende de o operador informar o pedido ao lançar a entrada |
| **Rastreabilidade** | Baixa: pedido ligado só ao seu próprio "Receber" | Alta: cada entrada ligada ao pedido, item a item |
| **Impacto técnico** | Nenhum (comportamento atual) | Médio-alto: vínculo por item, acúmulo, 3 operações alteradas, trava de concorrência; sem novo estado no banco |
| **Impacto no UX** | Mínimo: guardas e avisos | Novas colunas Pedido/Recebido/Saldo, lista de entregas, ação "Encerrar com falta", bloco "Pedido" na tela de Entrada |

## 6. PERGUNTA AO DONO DO PRODUTO

> **"Quando você pede 100 unidades e o fornecedor entrega apenas 60, você precisa que o sistema controle automaticamente que ainda faltam 40?"**

**SE SIM →** escolhe-se **B**. O sistema passa a mostrar o saldo e a receber as entregas seguintes no mesmo pedido. Consequências: (a) o operador precisa **informar o pedido** ao lançar cada entrada — sem isso o saldo não abate; (b) exige mudança de dados e de três operações de entrada, antes de a tela do pedido poder ser construída; (c) a lista e o detalhe do pedido e a tela de Entrada são desenhados com saldo desde o início.

**SE NÃO →** escolhe-se **A**. O pedido fecha no primeiro recebimento e a falta é tratada **fora do sistema** (o lojista espera, cancela ou faz outro pedido). Consequências: (a) nenhuma mudança de dados; telas simples, com guardas e avisos; (b) o risco de pedido "pendurado" e de duplicar estoque continua, mitigado só por avisos; (c) **se mais tarde o lojista quiser acompanhar saldo, as telas do pedido e da Entrada precisarão ser redesenhadas** — a mudança de dados é aditiva, mas o desenho não é.

## 7. RECOMENDAÇÃO TÉCNICA

*(Recomendação, não decisão.)* Do ponto de vista técnico e operacional, **B** é a única opção que cobre entrega parcial e múltiplas entregas, elimina o pedido "pendurado" quando o vínculo é usado e corrige o indicador "Valor em trânsito". Seu custo é o vínculo por item e a alteração de três operações. **A** reproduz, mesmo com vínculo, a perda da informação do que faltou, e adiar B para depois do desenho é a situação de **maior retrabalho** (telas do pedido e da Entrada).

Uma ressalva que **depende do cliente**: se, ouvido o cliente 1, a falta for sempre tratada com **novo pedido** e as entregas chegarem inteiras, **A basta para o go-live** e B pode ser adotado depois, aceitando o redesenho descrito acima.

Independentemente da decisão, valem para as duas opções: impedir receber o pedido com todas as quantidades zeradas, oferecer "receber tudo" para o caso normal e avisar que lançar a mesma mercadoria por outro caminho duplica o estoque.

## 8. DECISÃO

*(Preenchimento exclusivo do dono do produto.)*

- [ ] **A — não controlar recebimento parcial**

- [ ] **B — controlar recebimento parcial**

Decidido por: ______________________  Data: ____ / ____ / ________

Observações: ____________________________________________________________
