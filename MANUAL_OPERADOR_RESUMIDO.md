# Manual do Operador — Referência Rápida (piloto)

**Imprima e cole ao lado da tela do PDV.** Só descreve o que está no sistema neste piloto.

> **Escopo deste piloto:** uma loja, um caixa, venda presencial no navegador.
> Formas aceitas: **Dinheiro, PIX, Cartão débito e Cartão crédito**.
> **Não existe fiado (venda a prazo) e o sistema não emite nota fiscal.**

---

## Antes de vender

1. Abra o endereço do PDV no navegador e entre com **seu e-mail e senha** (`[ENDEREÇO DO PDV — preencher na instalação]`).
2. Você vai direto para a tela do caixa.
3. Se o caixa estiver fechado, clique em **Abrir caixa**, confirme o operador e informe o **valor inicial (fundo)** que está na gaveta.

---

## Passo a passo de uma venda

### 1. Adicionar produtos

- Digite o **código de barras**, o **código** ou o **nome** no campo de busca (atalho **F2** ou **Ctrl+B**).
- Adicione o produto ao cupom.
- Se o produto não aparecer, **não tente cadastrar**: o cadastro é do gerente. Chame o gerente.

### 2. Conferir quantidades e preços

- Para mudar a quantidade ou remover um item, use os controles da linha do produto no cupom.
- **Ctrl+Z** desfaz a última remoção.
- Confira o total antes de cobrar.

### 3. Desconto

- Desconto **só com o gerente**. Clique em **Desconto gerente**, digite a **senha do gerente** e o percentual (o máximo aparece na tela).
- O desconto do gerente **só vale para venda paga totalmente em dinheiro**. Em outra forma, a tela não aplica.

### 4. Cobrar

1. Pressione **F4** ou **F9** para finalizar.
2. Escolha a forma: **1** = Dinheiro, **2** = PIX, **3** = Crédito, **4** = Débito (ou clique nela).
3. Informe o valor recebido, se for dinheiro. Se houver troco, a tela mostra **"Troco p/ cliente"**.
4. Para dividir o pagamento em mais de uma forma, clique em **Dividir pagamento** (até 4 formas). O campo **"Falta"** mostra quanto ainda não foi coberto.
5. Confirme a venda **somente quando "Falta" estiver em 0,00**.

> ### ⚠️ Regra do piloto: nunca finalize com "Falta" acima de zero
>
> Se o cliente não tem o valor todo, **não confirme**. Se aparecer a mensagem **"Pagamento parcial requer seleção de cliente"**, **cancele** e chame o gerente.
> Essa tela ainda existe no sistema, mas no piloto **não há fiado**: não escolha cliente para cobrir o saldo.

Se a soma das formas passar do total e não houver dinheiro para o troco, o sistema mostra **"A soma das parcelas passa do total e não há dinheiro suficiente para dar troco"**. Ajuste os valores.

### 5. Erro ao finalizar

- A tela mostra uma mensagem de erro. **Anote o texto exato.**
- Confira se a venda já aparece no caixa antes de tentar de novo.
- Se a mensagem continuar, **chame o gerente**. Não repita a venda várias vezes.

---

## Situações comuns

### "Produto não encontrado"
→ Confira o código de barras ou busque pelo nome.
→ Se o produto não existe no cadastro, chame o gerente.

### "Estoque insuficiente"
→ Reduza a quantidade ou ofereça outro produto.

### "PIX ou cartão não aceito" (venda não conclui na forma escolhida)
→ Chame o gerente. A loja precisa ter a conta de PIX e cartão configurada antes de vender nessas formas.

### "O cliente quer pagar depois" (fiado)
→ **Não existe neste piloto.** Chame o gerente antes de finalizar.

### "O cliente quer desconto"
→ Desconto é do gerente. Chame o gerente **antes** de finalizar.

### "Fechar caixa" não funciona: venda em espera
→ Antes de fechar o caixa, finalize ou coloque em espera e resolva as vendas em espera do seu turno. Se a mensagem continuar, chame o gerente.

---

## Atalhos de teclado

| Tecla | O que faz |
|---|---|
| **F1** | Mostra a lista de atalhos |
| **F2** ou **Ctrl+B** | Foca a busca de produto |
| **F3** | Consulta rápida |
| **F4** ou **F9** | Finalizar venda |
| **F6** | Fechar caixa |
| **F8** | Novo cupom (limpa o cupom atual **sem** finalizar) |
| **F12** | Reimprimir o último comprovante |
| **1, 2, 3, 4** | Escolher a forma: Dinheiro, PIX, Crédito, Débito |
| **Ctrl+Z** | Desfazer remoção de item |
| **Ctrl+Shift+S** | Suprimento (entrada de dinheiro no caixa) |
| **Ctrl+Shift+R** | Sangria (retirada de dinheiro do caixa) |
| **Esc** | Fecha janela ou cancela ação |

> Os atalhos **Alt+Z**, **Alt+C**, **Alt+B** e **Alt+Q** só existem no layout clássico do PDV. Confirme na instalação se ele está ativo.

---

## Sangria e suprimento

### Sangria (tirar dinheiro do caixa)
1. **Ctrl+Shift+R**.
2. Escolha o motivo: **Troco inicial**, **Pagamento de fornecedor**, **Retirada para depósito** ou **Outro**.
3. Digite o valor.
4. **Acima do limite de sangria sem gerente** (valor configurado pela loja), o sistema pede a **senha do gerente**.
5. Confirme.

### Suprimento (colocar dinheiro no caixa)
1. **Ctrl+Shift+S**.
2. Escolha o motivo, digite o valor e confirme.

---

## Troca de operador

Use quando outro operador vai assumir o mesmo caixa (o turno continua aberto).

1. Feche ou coloque em espera a venda atual. **Não é possível trocar com venda no cupom ou em finalização.**
2. Clique em **Trocar operador** e confirme.
3. O sistema volta para a tela de login. O próximo operador entra com o **próprio e-mail e senha**.
4. Ao entrar, clique em **Assumir este caixa** para continuar o turno.

Se o caixa estiver em uso por outro operador, só um gerente pode assumir.

### Bloqueio com PIN (se a loja usar)

Algumas lojas pedem um **PIN de 4 números** para desbloquear o caixa depois de um tempo parado. O botão **Bloquear** só aparece quando essa regra está ligada.

- Digite o **seu** PIN. Errar 5 vezes bloqueia por **5 minutos**. Errar 10 vezes exige o **gerente**.
- Seu PIN não pode ser sequência (1234) nem repetido (1111).
- O PIN não substitui o login: você entra com e-mail e senha.

---

## Fechamento do caixa (fim do dia)

1. Finalize ou coloque em espera as últimas vendas.
2. Clique em **Fechar caixa** (ou **F6**).
3. Conte o dinheiro físico e informe o **saldo contado (dinheiro)**.
4. Confirme. Antes de confirmar, confira com o sistema.
5. Saia do sistema.

> Não feche o caixa sem contar o dinheiro físico.

---

## Quando chamar o gerente

- Você não consegue entrar, ou a tela fica carregando por muito tempo.
- Uma venda não finaliza depois de 2 tentativas.
- Aparece qualquer mensagem de erro que não some.
- Um cliente quer desconto, fiado, ou pagar parte do valor.
- Você precisa de um produto que não está cadastrado.

**Contato do suporte:** `[CONTATO DO SUPORTE — preencher na instalação]`
**Horário de atendimento:** `[HORÁRIO — preencher na instalação]`

---

**Versão:** 1.2 (piloto)
**Data:** 2026-11-07
**Impressão recomendada:** A4, laminado.

### Mudanças da 1.1 → 1.2

| O que | Por quê |
|---|---|
| Escopo do piloto no topo: sem fiado, sem nota fiscal | Alinha ao contrato do primeiro cliente (plano de liberação, fase F) |
| Botão de dividir passou a ser **"Dividir pagamento"** e o campo de saldo passou a ser **"Falta"** | Rótulos reais da tela (`src/lib/i18n/pt.json`, `pdv_pgto_dividir` e `pdv_pgto_diferenca`). A versão 1.1 dizia "Restante" |
| Regra "Falta acima de zero" reescrita | A versão 1.1 dizia que a venda vira "crédito do cliente". A tela pede cliente e registra o saldo como contas a receber. Por isso o operador não pode finalizar com saldo |
| Desconto gerente: só em venda 100% dinheiro | Regra da tela (`pt.json`, `desconto_gerente_so_dinheiro`) |
| Atalho **Alt+B** corrigido (era "método de pagamento"; é a aba de pagamento no layout clássico), **Alt+C** é cliente | `app/caixa/caixaAtalhos.ts:59-60` |
| Atalhos 1 a 4 (formas) incluídos | `app/caixa/caixaAtalhos.ts:63-64` |
| Telefone e horário de suporte removidos | Não incluir contatos reais no repositório. Preencher na instalação |
| Removidos passos que não foram confirmados no código (ex.: "Comprovante impresso", "Enter no campo de valor") | Ver origem abaixo |

---

## Origem das afirmações (para quem instala)

Caminhos relativos a `pdv-importados/` quando não indicados. "pt.json" = `src/lib/i18n/pt.json`.

| # | Afirmação | Origem |
|---|---|---|
| O1 | Login com e-mail e senha | `app/login/LoginForm.tsx:241-277` |
| O2 | Operador cai em `/caixa` | `lib/admin/policy/adminPolicy.ts:195-200` |
| O3 | Atalhos F1–F12, Ctrl+B, Ctrl+Z, Ctrl+Shift+S/R | `app/caixa/caixaAtalhos.ts:44-56` |
| O4 | Alt+Z, Alt+C, Alt+B, Alt+Q, Alt+S só no layout clássico | `app/caixa/caixaAtalhos.ts:57-62`; `pt.json` `layout_preview_banner` |
| O5 | Formas 1–4 na ordem Dinheiro, PIX, Crédito, Débito | `app/caixa/caixaAtalhos.ts:63-64`; `pt.json` `pdv_metodo_pagamento_*` |
| O6 | "Dividir pagamento", "Recebido", "Falta", "Troco p/ cliente", máx. 4 formas | `pt.json` `pdv_pgto_*` (1302–1311) |
| O7 | Pagamento parcial pede seleção de cliente | `app/caixa/CaixaPageClient.tsx:1113-1120`, `:1184`; `pt.json` `msg_pagamento_parcial_requer_cliente` |
| O8 | Soma passa do total sem dinheiro para troco | `app/caixa/CaixaPageClient.tsx:1128-1145`; `pt.json` `msg_pagamento_excesso_sem_dinheiro` |
| O9 | Desconto gerente: "Desconto gerente", só venda 100% dinheiro, senha e percentual | `pt.json` `validar_gerente` (1409), `desconto_gerente_so_dinheiro` (1419), `modal_gerente_*` (1446–1456); `app/caixa/CaixaGerenteModal.tsx:183` |
| O10 | Limite de sangria sem gerente e senha do gerente acima dele | `app/caixa/CaixaPageClient.tsx:175` (padrão 200, origem da atualização NÃO COMPROVADA); `app/caixa/CaixaMovimentacaoModal.tsx:71` |
| O11 | Motivos de sangria/suprimento | `app/caixa/CaixaMovimentacaoModal.tsx:37-41`; `pt.json` `motivo_*` (1481–1484) |
| O12 | Abrir caixa: operador e "Valor inicial (fundo)" | `pt.json` `abrir_turno_*` (1241–1244); `app/caixa/CaixaAbrirTurnoModal.tsx` |
| O13 | Fechar caixa com F6; "Saldo contado (dinheiro)" | `app/caixa/caixaAtalhos.ts:49`; `pt.json` `comprovante_fechamento_saldo_contado` (1533) |
| O14 | Venda em espera bloqueia fechamento | `backend/supabase/migrations/20261106100000_d1_fechamento_bloqueia_vendas_em_espera.sql`; `app/caixa/server/caixaErroOperador.ts:140-142` |
| O15 | Troca de operador: bloqueia com venda no cupom ou em finalização; volta ao login; "Assumir este caixa" | `pt.json` `troca_bloqueada_carrinho` (1180), `troca_bloqueada_finalizando` (1181), `troca_btn` (1176), `troca_assumir_btn` (1185); `app/caixa/CaixaTrocaOperador.tsx:121` |
| O16 | Bloquear só aparece com PIN exigido | `app/caixa/CaixaTrocaOperador.tsx:216` |
| O17 | PIN 4 números; sem sequência nem repetido | `lib/pdv/pinRegras.ts:1-18`; `pt.json` `meu_pin.regra` (1933) |
| O18 | 5 erros = 5 min; 10 = gerente libera | `backend/supabase/migrations/20261021230000_pdv_operador_pin_p0.sql:131-147`; `pt.json` `troca_erro_pin_bloqueado` (1201), `troca_erro_pin_bloqueado_gerente` (1202) |
| O19 | F8 limpa o cupom sem finalizar | `pt.json` `cart_bar_excluir_title` (texto "atalho: F8 Novo cupom"); `app/caixa/caixaAtalhos.ts:50` |
| O20 | Erro de venda: mensagem genérica quando o código não é mapeado | `app/caixa/server/caixaErroOperador.ts:189-192` |

**Não incluído por não ser confirmado no código:** "Comprovante impresso automaticamente", "Enter no campo de valor confirma", "Enter no campo de busca adiciona produto", o gesto exato de alterar quantidade na linha (NÃO COMPROVADO; confirmar na instalação), "cadastro de produto só pelo gerente" (procedimento do piloto, não verificado em tela), cores de preço (amarelo/vermelho), "Descontos (amarelo)", a mensagem "Erro ao finalizar", horários de atendimento e telefone.
