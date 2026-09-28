> **UX-03.2 · 2026-09-18 · Análise somente.** Semântica da Ordem de Compra (OC) em recebimento total, parcial, múltiplas entregas, NF-e e entrada sem documento. Sem código, migration, RPC, UI ou teste; nenhum arquivo existente foi alterado; sem commit.
> **Nota de escopo:** o texto original da missão UX-03.2 não estava disponível na conversa; trabalhei a partir da sua descrição. Refina o **B-1** de `DECISOES_PRODUTO_UX03_1.md` — não reabre o restante.
> Categorias: **[F]** fato comprovado · **[B]** bug comprovado · **[UX]** problema de UX · **[DP]** decisão de produto · **[DA]** decisão de arquitetura · **[H]** hipótese · **[T]** teste necessário. O que **não foi executado** contra banco ou navegador está indicado.

# 1. Resumo executivo

1. **[F] Hoje a OC mistura dois significados.** Seu "estado" junta o *andamento comercial* (rascunho → confirmada → em trânsito) com o *resultado do recebimento* (recebida). `RECEBIDA` é um único valor para "chegou tudo", "chegou parte", "chegou nada" e "chegou por outra via".
2. **[F] A OC não tem saldo.** Só guarda a quantidade pedida e uma quantidade recebida que é **gravada de uma vez**, no único recebimento possível. Não existe "pedi 100, chegaram 60, faltam 40".
3. **[F] A OC não sabe de nenhum outro caminho de entrada.** Nota fiscal e entrada sem nota não a enxergam; ela não enxerga nenhuma delas.
4. **[UX] Consequência prática:** se a mercadoria entra por qualquer via que não seja o "Receber" do próprio pedido, o pedido **fica "Em trânsito" para sempre** e só sai duplicando o estoque (receber) ou cancelando (perdendo o histórico). O KPI "Valor em trânsito" continua contando o valor **cheio**.
5. **A decisão B-1 não é binária.** Ao analisar os cenários, ela se decompõe em **três formas** que produzem telas diferentes: **(B)** pedido e entrada separados; **(A1)** entrada vinculada **sempre encerra** o pedido; **(A2)** entrada vinculada **acumula** e o pedido tem **saldo**. Só A2 resolve entrega parcial e múltiplas entregas.
6. **[H → recomendação técnica, não decisão]** A2 com **saldo derivado das quantidades** (sem novo estado armazenado) é a forma que cobre todos os cenários com a menor mudança de modelo. Exige **vínculo por item**, não só por pedido.
7. **O que a decisão mínima para desenhar passa a ser:** *"o pedido pode ficar parcialmente recebido, com saldo a receber?"* — isso, mais o que já foi decidido em B-1 (vínculo sim/não), fixa o formato das telas.

# 2. O que a OC é hoje

## 2.1 O que ela guarda [F]

| Nível | Campo | Observação comprovada |
|---|---|---|
| Pedido | fornecedor (entidade) **opcional** + nome livre | `fornecedor_id` é nulo-permitido; existe `fornecedor_nome` em texto. Um pedido pode existir **sem** fornecedor cadastrado (`109_ordens_compra.sql`). |
| Pedido | data de emissão, data prevista de chegada, observação, estado | Não há condição de pagamento, valor total gravado, nota vinculada nem entrega vinculada. |
| Item | produto **opcional** ou descrição livre | Item pode não ter produto cadastrado (só descrição). |
| Item | quantidade, preço unitário, unidade | A unidade (`UN` por padrão) é **informativa**: o recebimento credita a quantidade **diretamente** como saldo, sem conversão. |
| Item | quantidade recebida | Gravada **uma vez**, igual à quantidade conferida, no recebimento. |
| Item | quantidade conferida, motivo de divergência, status da conferência | `EM_CONFERENCIA` → `CONFERIDO` (bate) ou `DIVERGENTE` (não bate, aceito com motivo). |

## 2.2 Estados e o que cada um significa de fato [F]

| Estado | Significado operacional comprovado | Quem chega nele | O que permite |
|---|---|---|---|
| **Rascunho** | Pedido em preparação | criação | editar, confirmar, cancelar |
| **Confirmada** | Combinado com o fornecedor | ação do usuário | editar, marcar em trânsito, cancelar. **Não** permite receber pelo pedido. |
| **Em trânsito** | Enviado/a caminho | ação do usuário | conferir e receber, cancelar. **Não** permite editar. |
| **Recebida** | Encerrado pelo recebimento do próprio pedido | só pelo "Receber" do pedido | nada (terminal) |
| **Cancelada** | Encerrado sem receber | ação do usuário | nada (terminal) |

Transições: `Rascunho → Confirmada | Cancelada`; `Confirmada → Em trânsito | Cancelada`; `Em trânsito → Recebida | Cancelada` (`compras/actions.ts:15-21`). **Não há volta.**

## 2.3 O que a OC nunca faz nem sabe [F]

- Não gera conta a pagar; não atualiza custo (o preço do pedido nunca é usado depois).
- Não conhece NF-e, entrada sem nota ou qualquer entrega além do seu próprio "Receber".
- Não aceita recebimento parcial: o "Receber" **sempre** encerra, mesmo com quantidade menor (`receber_ordem_compra` seta `RECEBIDA` incondicionalmente).
- Item sem produto cadastrado: o recebimento **não credita estoque** para ele, mas o pedido fecha assim mesmo.

# 3. Cenários

Exemplo usado: **pedido de 100 unidades** do produto X ao fornecedor F.

## 3.1 Matriz do comportamento atual [F]

| # | Cenário | Como entra hoje | Estoque | O pedido depois | Custo / conta a pagar | Veredito |
|---|---|---|---|---|---|---|
| **C1** | **Total pelo próprio pedido** (chegam 100) | "Receber" do pedido: operador digita 100 | +100 | **Recebida** ✔ | nenhum | Funciona, mas sem custo nem conta a pagar |
| **C2** | **Total pela NF-e** (100, com XML) | Importar NF-e | +100 | **Continua "Em trânsito"** | custo ✔ · conta a pagar ✔ | Pedido "pendurado" |
| **C3** | **Total sem documento** (100, sem nota) | Entrada sem nota, com vínculo ao pedido | +100 | **Continua "Em trânsito"** (o vínculo só confere que não está "Recebida") | nenhum | Pedido "pendurado" |
| **C4** | **Parcial** (chegam 60) | "Receber": digita 60 | +60 | **Recebida** — os 40 que faltam **somem do radar** | nenhum | Perda de informação |
| **C4b** | Parcial pela NF-e ou sem nota (60) | idem C2/C3 | +60 | Continua "Em trânsito" (100) | conforme via | Pedido mostra 100 pendentes, mas 60 já entraram |
| **C5** | **Excesso** (chegam 110) | "Receber": digita 110 | +110 | **Recebida**, item **DIVERGENTE** | nenhum | Aceito; sem limite nem alerta específico |
| **C6** | **Duas entregas** (60 + 40) | 1ª e 2ª por qualquer via | soma correta **se** cada via for usada uma vez | Ver abaixo | ver via | **Não modelado** |
| **C7** | **Uma NF-e cobre dois pedidos** ou **um pedido tem duas NF-e** | NF-e (importa cada nota) | soma correta | Pedidos **não sabem** | conta a pagar por nota ✔ | **Não modelado** |
| **C8** | **Divergências de cadastro**: fornecedor diferente, unidade diferente (caixa × unidade), preço diferente, item sem produto | — | — | — | — | Ver 3.2 |
| **C9** | **Nada chegou / pedido substituído** | Cancelar | — | **Cancelada** | — | ✔ (só se nada foi recebido) |
| **C10** | **Erro do operador** | ver 3.2 | — | — | — | — |

## 3.2 Detalhe dos cenários problemáticos

**C2/C3/C4b — o pedido "pendurado".** [F] `Em trânsito` só sai por `Recebida` (que credita de novo o estoque) ou `Cancelada` (que registra "não recebido" para algo que foi recebido). [UX] O operador não tem como dizer "este pedido foi atendido por fora". [F] O KPI "Valor em trânsito" soma quantidade × preço de **todos** os itens de todos os pedidos `Em trânsito` — **não desconta** o que já entrou (`obterKpisCompras`).

**C4 — parcial pelo pedido.** [F] O "Receber" grava `quantidade_recebida = conferida` e fecha. Não há como registrar "faltam 40 a receber". [UX] O modal sequer oferece um atalho "receber tudo": as quantidades nascem em 0 e exigem digitação item a item.

**C5 — excesso.** [F] O servidor só recusa conferida **negativa**; o atributo `max` do campo não é aplicado (o modal não é um formulário). O excesso é aceito e marcado `DIVERGENTE`, sem regra sobre quanto a mais é aceitável. [H] Fisicamente a mercadoria chegou; bloquear obrigaria o operador a mentir na contagem.

**C6 — múltiplas entregas.** [F] Pelo pedido: 1ª entrega fecha o pedido; a 2ª **não pode** ser recebida por ele (terminal) e o vínculo da entrada sem nota é recusado ("já foi recebida"). Por NF-e: cada nota entra, o pedido não muda. **Misturar vias** (1ª pelo pedido, 2ª pela nota) funciona no estoque e deixa o pedido com 60 recebidos de 100, fechado. [H] Nenhuma via representa "a 2ª entrega do mesmo pedido".

**C7 — muitos para muitos.** [F] Nenhuma relação entre nota e pedido existe. [DA] Um vínculo só no cabeçalho (nota → pedido) não cobre "uma nota, dois pedidos".

**C8 — divergências de cadastro.**
- *Fornecedor:* [F] o pedido pode nem ter fornecedor cadastrado; a nota cria/atualiza o fornecedor por CNPJ. Comparar fornecedor entre nota e pedido só é possível quando o pedido tem `fornecedor_id`.
- *Unidade:* [F] a nota converte `quantidade × fator` para a unidade do estoque e o custo por unidade; o pedido credita a quantidade **como está**. Para comparar quantidades, o pedido precisa estar em unidades de estoque. [T] Perguntar ao cliente em que unidade ele pede (seção 8).
- *Preço:* [F] o preço do pedido nunca é comparado com o custo da nota.
- *Item sem produto:* [F] não é casável com item de nota nem credita estoque. [DA] O casamento por item precisa de regra para esse caso.

**C10 — erros do operador.**
- [UX] **Receber com tudo zerado:** sem guarda no modal (não exige ao menos um item > 0; não pede confirmação). O servidor aceita 0; o pedido vira `Recebida` **sem creditar nada** e **não há como reabri-lo** (terminal). Não executado em navegador; conclusão por leitura do código.
- [T] **Clique duplo / duas sessões:** `receber_ordem_compra` lê o pedido **sem `FOR UPDATE`** (a RPC da NF-e usa). A trava de status só evita a repetição *depois* do primeiro commit. O botão fica desabilitado enquanto processa, o que reduz o risco. **Não reproduzido em banco.**

# 4. O que "pedido encerrado" pode significar

## 4.1 As quatro dimensões da semântica

| Dimensão | Pergunta | Hoje |
|---|---|---|
| **Quantidade** | Existe "pedido / recebido / saldo" por item? | Só pedido e um recebido gravado uma vez |
| **Fonte do recebimento** | O que conta como "recebido" de um pedido? | Só o "Receber" do próprio pedido |
| **Encerramento** | Quem/quando fecha o pedido? | O único "Receber" (sempre fecha) ou Cancelar |
| **Falta e excesso** | O que acontece com o que faltou ou sobrou? | Falta: desaparece · Excesso: aceito e marcado |

## 4.2 Três formas do modelo (é a decomposição de B-1)

**Forma B — pedido e entrada separados (como hoje).** O pedido é um documento de recebimento único.
**Forma A1 — vínculo que sempre encerra.** A entrada (nota ou sem nota) vinculada ao pedido o marca `Recebida`. Sem saldo.
**Forma A2 — vínculo que acumula, com saldo.** O pedido tem *pedido / recebido / saldo* por item. Cada entrada vinculada soma a quantidade **conferida**. O pedido fecha quando o saldo zera **ou** quando o operador o encerra com falta.

| | B | A1 | A2 |
|---|---|---|---|
| C2/C3 (total por nota/sem nota) | pedido pendurado | resolvido | resolvido |
| C4 (parcial) | pedido fecha e perde a falta | pedido fecha e perde a falta | **saldo visível; pedido continua aberto** |
| C6 (duas entregas) | não modelado | 2ª entrega não pode vincular (já fechado) | **cada entrega soma** |
| C5 (excesso) | aceito | aceito | aceito, **saldo negativo sinalizado** |
| Pedido "atendido por fora" | só cancelando | resolvido pelo vínculo | resolvido pelo vínculo |
| Mudança de dados | nenhuma | vínculo + 2 RPCs | vínculo **por item** + acúmulo + 2 RPCs |
| Mudança de estados | nenhuma | nenhuma | nenhuma (se o "parcial" for **derivado**) |

## 4.3 Estado derivado em vez de novo estado (para A2) [DA]

Manter os estados armazenados como andamento comercial (`Rascunho/Confirmada/Em trânsito/Cancelada`) e **derivar** o resultado do recebimento das quantidades:

| Resultado do recebimento (derivado) | Regra |
|---|---|
| Nada recebido | Σ recebido = 0 |
| **Parcial** | 0 < Σ recebido < Σ pedido |
| **Completo** | todos os itens com saldo ≤ 0 |
| **Encerrado com falta** | o operador encerrou com saldo > 0 |

Isso separa "andamento" de "resultado" e **evita mexer na restrição de estados** do banco. `Cancelada` passa a significar "não vai mais acontecer" e só se aplica quando **nada** foi recebido; "encerrar com falta" cobre o restante.

# 5. Regras por cenário (candidatas, sob A2)

| # | Cenário | Regra candidata | Alternativa | Se a regra estiver errada |
|---|---|---|---|---|
| C1 | Total pelo pedido | Continua como hoje; a quantidade esperada vem do saldo; fecha ao zerar | — | — |
| C2 | Total por NF-e | Informar o pedido ao importar; a quantidade **conferida** abate o saldo; a nota segue gerando custo e conta a pagar | Só sugerir o pedido, sem abater | Pedido pendurado volta |
| C3 | Total sem nota | Idem, sem custo nem conta a pagar | — | — |
| C4 | Parcial | Saldo fica aberto; o operador escolhe **esperar** ou **encerrar com falta** | Encerrar sempre | Falta desaparece (hoje) |
| C5 | Excesso | Aceitar e sinalizar "a mais"; nunca bloquear | Bloquear acima de tolerância | Operador conta errado para "caber" |
| C6 | Várias entregas | Cada entrega vinculada abate o saldo | — | Pedido não fecha sozinho |
| C7 | 1 nota × 2 pedidos / 2 notas × 1 pedido | **Fora da 1ª versão:** 1 entrada ↔ 1 pedido; itens sem correspondência ficam sinalizados. 2 notas × 1 pedido **funciona** (cada uma abate) | Suporte completo N:N | Maior complexidade; sem evidência de frequência |
| C8 | Fornecedor diferente | Avisar, não bloquear | Bloquear | Fricção; pedido sem fornecedor não tem o que comparar |
| C8 | Unidade | Pedido em unidades de estoque; sem conversão | Guardar unidade e fator | Comparação incorreta |
| C8 | Preço diferente | Só informar | Bloquear/alertar | — |
| C8 | Item sem produto | Não abate automaticamente; operador associa ou deixa sem casar | Exigir produto no pedido | Pedido nunca fecha |
| C9 | Cancelar | Só se nada foi recebido; senão "encerrar com falta" | Manter como hoje | "Cancelada" continua significando "atendido por fora" |
| C10 | Receber zerado | Exigir ao menos um item > 0 e/ou confirmação | — | Pedido fechado sem estoque |

# 6. O que isso decide no UX

**Muda com a forma escolhida (define o desenho):**

| Tela | B | A1 | A2 |
|---|---|---|---|
| Lista de pedidos | igual + aviso de pendurado | badge "atendido por…" | colunas **Pedido / Recebido / Saldo** e badge **Parcial** |
| Detalhe do pedido | igual + guarda contra receber zerado | histórico "recebido por…" | itens com saldo; **lista de entregas**; ação **Encerrar com falta** |
| Entrada (nota / sem nota) | sem campo de pedido | campo **Pedido** (opcional) | campo **Pedido** + **saldo por item** ao lado do que chegou |
| Quantidade "esperada" da entrada sem nota | digitada à mão | à mão ou do pedido | **pré-preenchida com o saldo** (o campo já existe na tela) |
| KPI "Valor em trânsito" | continua inflado | corrigido | corrigido (usa saldo) |

**Não muda com a forma (pode ser desenhado já) [UX]:** guarda contra "receber tudo zerado"; atalho "receber tudo" para o caso normal; rótulos do estado atual; o fato de que o pedido **nunca** gera conta a pagar nem custo; a entrada sem nota poder ser uma lista de itens.

# 7. Decisões (refinam B-1; não substituem)

**Decisão que define o formato:**

| # | Pergunta ao dono do produto | Se sim | Se não |
|---|---|---|---|
| **SD-1** | Um pedido pode ficar **parcialmente recebido**, com saldo a receber e entregas posteriores? | **A2**: saldo por item, lista de entregas, "encerrar com falta" | **B** ou **A1**: o pedido fecha em um só recebimento; falta é perda de informação |

**Decisões que têm padrão seguro** (não bloqueiam o desenho; ajustam regra):

| # | Pergunta | Padrão até decisão contrária |
|---|---|---|
| **SD-2** | O que conta como "recebido" de um pedido? | Só o que for lançado **vinculado** ao pedido |
| **SD-3** | Chegou **mais** do que o pedido: aceitar e avisar, ou bloquear? | Aceitar e avisar |
| **SD-4** | Um único lançamento pode atender **mais de um** pedido? | Não na primeira versão |
| **SD-5** | Fornecedor diferente entre nota e pedido: avisar ou bloquear? | Avisar |

**Já decidido em B-1 (UX-03.1):** existe vínculo (A) ou não (B). SD-1 escolhe **entre A1 e A2**; se a resposta de B-1 for **B**, SD-1 deixa de existir.

**Recomendação técnica [não é decisão]:** **A2 com estado derivado**, por três razões comprovadas: (i) é a única forma que cobre entrega parcial e múltiplas entregas; (ii) A1 reproduz, com vínculo, a perda de informação de C4; (iii) o derivado evita alterar a restrição de estados do pedido. O custo é o **vínculo por item** (ver seção 9).

# 8. Perguntas ao cliente (as que faltam para SD-1)

Não repetem as de `DECISOES_PRODUTO_UX03_1.md`; aprofundam a pergunta 2.

1. **"Quando você pede 100 e chegam só 60, o que você faz com os 40 que faltam: espera chegar, cancela ou faz outro pedido?"**
   *Por que importa:* mostra se a falta é algo que o lojista quer **acompanhar** (então saldo, A2) ou **esquecer** (então A1 basta).
2. **"Quando o fornecedor entrega o mesmo pedido em mais de uma vez, cada entrega vem com a sua nota?"**
   *Por que importa:* confirma se C6 e "duas notas para um pedido" são frequentes, e se cada entrega é um lançamento separado.
3. **"Você já recebeu mais do que pediu, ou produto diferente do pedido? O que fez?"**
   *Por que importa:* define a política de excesso (SD-3) e se o item da nota pode não existir no pedido.
4. **"Você pede em caixas, pacotes ou em unidades soltas? E quando confere, conta em quê?"**
   *Por que importa:* a nota converte caixa em unidade; o pedido credita a quantidade como está. Define se a unidade do pedido precisa ser tratada.

# 9. Onde isso exige schema/RPC, só UX ou investigação

| Item | Só UX | Schema/RPC | Investigação [T] |
|---|---|---|---|
| Guarda contra receber zerado; atalho "receber tudo"; alerta de pedido pendurado | ✔ | | |
| Corrigir KPI "Valor em trânsito" para descontar recebido | ✔ (depende de A2 para ser exato) | | |
| Vínculo pedido ↔ entrada / nota | | ✔ (aditivo) | |
| **Vínculo por item** (cabeçalho **não** basta para saldo por item) | | ✔ | Regra quando o mesmo produto aparece em 2 linhas do pedido |
| Acúmulo de recebido e "encerrar com falta" | | ✔ (RPCs de entrada, nota e pedido) | |
| Estado derivado | | Só leitura; sem novo valor armazenado | |
| `FOR UPDATE` na RPC de recebimento do pedido | | ✔ | Reproduzir concorrência em banco de teste |
| Pedido sem produto cadastrado / sem fornecedor | | | Definir o casamento (SD-5, itens sem correspondência) |
| Duplo crédito (pedido em trânsito + nota + Receber pedido) | | | **Ainda não reproduzido** |

# 10. Impacto no Blueprint e no GO/NO-GO

- **B-1 deixa de ser "sim/não" e vira escolha entre três formas** (B, A1, A2); **SD-1** é a pergunta que as distingue. As demais SD têm padrão seguro.
- **Blueprint UX-02:** §3 F3/F7 (pedido e entrada), §2.2 (cadeias de consequência) e a lista de pedidos dependem de SD-1. **Já podem ser desenhados** os itens da seção 6 que não variam com a forma.
- **Risco de retrabalho se SD-1 vier depois do desenho:** **ALTO** para a lista e o detalhe do pedido (colunas e ações de saldo) e para a tela de Entrada (bloco "Pedido" com saldo); **BAIXO** para as regras SD-2 a SD-5.
- **GO/NO-GO para UX-04:** *ainda falta uma decisão essencial antes de desenhar* — **B-1, agora reduzida a SD-1**: *"um pedido pode ficar parcialmente recebido, com saldo a receber e entregas posteriores?"* (com B-1 = vínculo sim). Se a resposta de B-1 for **não vincular**, o desenho segue pela Forma B com as guardas da seção 6.
