# Prontidão Focus NFe — Fase C / Gate C2.5: Contrato DTO Fiscal

**Data:** 2026-09-02
**Escopo:** fechar os gaps do DTO NFC-e com a evidência oficial adicional colada pelo usuário (`doc.focusnfe.com.br/reference/emitir_nfce`). C1/C2 preservados — nenhuma migration reaberta.

**Limitação declarada logo de início**: `WebFetch`/`WebSearch` foram testados novamente nesta rodada (2 tentativas) e continuam falhando com o mesmo erro de infraestrutura já registrado na Fase B ("issue with the selected model"). Não consegui consultar `https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html` nem obter exemplos de resposta reais. Isso bloqueia **parcialmente** este gate — os itens que dependiam exclusivamente dessa página (items[]/formas_pagamento[]/mapeamento de resposta sem heurística) continuam pendentes, reportados abaixo com precisão, não inventados.

---

## O que fechei com a evidência que o usuário colou nesta mensagem

### `natureza_operacao` — DECISÃO (não gap)

A documentação oficial confirma: se omitido, a Focus aplica seu próprio padrão para venda ao consumidor. O Jinlong não tem hoje nenhuma regra de negócio própria para este campo (não existe em produto/loja/pdv_config — confirmado desde a Fase A). **Decisão: o campo fica deliberadamente ausente do envelope.** O comportamento default documentado passa a pertencer exclusivamente à Focus (infraestrutura), nunca ao domínio Jinlong. Implementado em `fiscal_focus_dto.ts` como `omittedByDesign`, distinto de `gaps` (que significa "falta e precisa ser resolvido") — este é "ausente por decisão correta". Testado (`fiscal_focus_dto.test.ts`, `fiscal-provider-adapter.test.ts`): o campo nunca aparece no corpo HTTP real, com nenhum valor.

### `modalidade_frete` / `local_destino` / `presenca_comprador` — mapeados como constantes de negócio

| Campo | Valor | Evidência do enum | Justificativa Jinlong |
|---|---|---|---|
| `modalidade_frete` | `"9"` (Sem frete) | Confirmado nesta mensagem | Jinlong é PDV de varejo presencial — em toda a auditoria desta missão (Fase A a C2), não existe nenhuma captura de frete/entrega no domínio |
| `presenca_comprador` | `"1"` (presencial) | Confirmado nesta mensagem | Mesma razão — "venda no balcão", sem fluxo de entrega no sistema |
| `local_destino` | `"1"` (operação interna) | Confirmado nesta mensagem | Único valor hoje **detectável**: o snapshot não captura UF do destinatário (nem quando `cliente_id` está presente — `clientes` só tem `nome`/`documento`/`tipo`, sem endereço). Registrado como gap residual (`local_destino_interestadual_exterior`) para o dia em que o Jinlong vender para cliente identificado de fora do estado |

**Isso não é "inventar CST/CSOSN/CFOP/NCM"** (dado fiscal que exigiria fonte tributária) — é aplicar um enum confirmado a um fato operacional já estabelecido e estável do negócio (PDV presencial, sem frete). Testado.

### `data_emissao` — decisão arquitetural (não mudei C1)

**Conclusão**: `data_venda` (congelada no snapshot C1) ≠ `data_emissao` (exigida pela Focus com timezone e janela temporal próxima do envio real). São coisas semanticamente diferentes por definição — a primeira é um fato de negócio imutável (quando a venda aconteceu); a segunda só pode ser calculada no instante em que a requisição HTTP realmente sai, porque uma venda pode ficar pendente (erro, retry, reprocesso manual, reconciliação) por tempo suficiente para que reusar `data_venda` violasse a janela aceita pela Focus — e nesse caso a venda ficaria **presa em erro para sempre**, já que a causa do erro (data fora da janela) nunca mudaria sozinha.

**Decisão implementada** (correção ao C2.3, não ao C1): `data_emissao` deixou de ser mapeada a partir de `payload.data_venda` em `fiscal_focus_dto.ts` — passou a ser calculada em `fiscal-provider-adapter.ts`, no momento exato do `POST`/`emitirNfe` (`new Date().toISOString()`), nunca lida de um snapshot congelado. C1 continua intocado: `documentos_fiscais_pendentes.payload.data_venda` continua existindo e correto — é a data da venda, não a da emissão, e essas são responsabilidades diferentes que já estavam corretamente separadas em C1 (eu só as havia confundido no mapeamento de C2.3, agora corrigido). Testado: uma venda com `data_venda` de 2020 gera um `data_emissao` real, dentro da janela de execução do teste, com timezone explícito.

---

## CONTRATO ITEMS

**PENDENTE — não pôde ser fechado nesta sessão.**

| FOCUS FIELD | TIPO | REQUIRED? | ORIGEM JINLONG | REGRA | STATUS |
|---|---|---|---|---|---|
| (nome de campo Focus para código do produto) | — | — | `payload.itens[].produto_id`/`codigo_barras` | — | **PENDENTE** |
| (nome de campo Focus para descrição) | — | — | `payload.itens[].nome` | — | **PENDENTE** |
| (nome de campo Focus para NCM) | — | — | `payload.itens[].ncm` | — | **PENDENTE** |
| (nome de campo Focus para CEST) | — | — | `payload.itens[].cest` | — | **PENDENTE** |
| (nome de campo Focus para CFOP) | — | — | `payload.itens[].cfop` | — | **PENDENTE** |
| (nome de campo Focus para unidade comercial) | — | — | `payload.itens[].unidade_medida` | — | **PENDENTE** |
| (nome de campo Focus para quantidade) | — | — | `payload.itens[].quantidade` | — | **PENDENTE** |
| (nome de campo Focus para valor unitário) | — | — | `payload.itens[].preco_unitario` | — | **PENDENTE** |
| (nome de campo Focus para valor bruto) | — | — | derivável (`quantidade × preco_unitario`) | — | **PENDENTE** |
| (nome de campo Focus para desconto) | — | — | `payload.itens[].desconto_unitario` | — | **PENDENTE** |
| (grupo/campos ICMS — origem, CSOSN/CST) | — | — | `payload.itens[].csosn` (Simples Nacional; sem CST para outros regimes — gap já registrado na Fase A) | — | **PENDENTE** |
| (grupo/campos PIS) | — | — | `payload.itens[].cst_pis` | — | **PENDENTE** |
| (grupo/campos COFINS) | — | — | `payload.itens[].cst_cofins` | — | **PENDENTE** |

**Motivo:** `https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html` (indicada pelo usuário como fonte oficial completa) não pôde ser consultada — `WebFetch`/`WebSearch` falharam. O Jinlong TEM todos os dados de origem (coluna à direita, já confirmados desde a Fase A/C1) — falta exclusivamente o nome exato de cada campo no JSON da Focus. Não inventei nenhum nome de campo (`codigo_produto`, `descricao`, `uCom`, `qCom` etc. seriam só suposições, ainda que plausíveis por eu conhecer o layout público da NFe brasileira em geral — a Focus pode usar nomes JSON diferentes da tag XML, e eu não tenho como confirmar isso nesta sessão).

## CONTRATO PAGAMENTOS

**PENDENTE — mesmo motivo.**

| JINLONG | FOCUS | REGRA | EVIDÊNCIA |
|---|---|---|---|
| DINHEIRO | — | — | **PENDENTE** — `payload.pagamentos[].forma_pagamento = 'DINHEIRO'` já existe (confirmado C1.5, exemplo real capturado) |
| PIX | — | — | **PENDENTE** |
| Cartão | — | — | **PENDENTE** — nem confirmei se o Jinlong distingue crédito/débito hoje (não verificado nesta sessão) |
| Pagamento misto (split) | — | — | **PENDENTE** — o Jinlong já suporta split de verdade (`payload.pagamentos[]` é array real, múltiplas entradas — confirmado em C1), falta o código Focus para cada forma |

## CONTRATO RESPOSTAS

**PENDENTE — mesmo motivo (exemplos oficiais de resposta não acessados).**

O que já está implementado (Gate C2, não heurística nova): classificação por HTTP status (200/201 com chave+protocolo → autorizado; 202 → processando; 404 em consulta → não_encontrado; 5xx/429/408 → erro_transitorio; demais 4xx → erro_definitivo). O que continua **heurística não confirmada** (registrado como tal no código desde C2, não escondido): distinguir "rejeitado" de "erro_definitivo" quando o HTTP é 2xx mas sem chave/protocolo reconhecível — sem os exemplos reais de corpo de resposta (rejeição, referência já utilizada, erro de validação), não consigo fechar isso "sem heurística" como o usuário pediu.

**Teste "consulta NFC-e rejeitada" (item 5 da lista C2.10) permanece BLOQUEADO** — não resolvido nesta rodada, pelo mesmo motivo de acesso.

## GAPS (resumo)

| Campo/comportamento | Motivo | O que resolveria |
|---|---|---|
| Schema de `items[]` | `campos.focusnfe.com.br` não acessível nesta sessão | Colar o conteúdo da página, ou `WebFetch` voltar a funcionar |
| Schema de `formas_pagamento[]` | idem | idem |
| Mapeamento resposta→estado sem heurística | Exemplos oficiais de resposta não acessados | Colar exemplos reais de POST/GET NFC-e/NF-e (sucesso, rejeição, "em processamento", "referência já utilizada") |
| `local_destino` interestadual/exterior | Snapshot não captura UF do destinatário | Decisão de produto: vale a pena capturar endereço do cliente identificado? (fora do escopo desta missão) |
| Destinatário — schema Focus | Mesma limitação de `campos.focusnfe.com.br` | idem items[] |

---

## DIFF

| Arquivo | Mudança |
|---|---|
| `fiscal_focus_dto.ts` | `modalidade_frete`/`local_destino`/`presenca_comprador` passam de gap para campo mapeado (constante); `natureza_operacao` movido de gap para `omittedByDesign` (novo campo no tipo de retorno); `data_emissao` removido deste arquivo (não é mais responsabilidade do mapeador de snapshot) |
| `fiscal-provider-adapter.ts` | `buildEmitBody` passa a calcular `data_emissao = new Date().toISOString()` no momento do envio, não lido do payload |
| `fiscal_focus_dto.test.ts` | Testes atualizados/novos para os 4 campos fechados |
| `fiscal-provider-adapter.test.ts` | +6 testes novos (frete/presença/local no corpo real, anônima, identificada, consulta ambígua, data_emissao fresca) |

100% confinado a `backend/supabase/functions/fiscal-worker/` — confirmado por `git status`. C1 (migrations) intocado.

## TESTES

| # | Cenário pedido | Resultado |
|---|---|---|
| 1 | NFC-e presencial sem frete | **PASS** |
| 2 | NFC-e anônima | **PASS** |
| 3 | NFC-e identificada | **PASS** |
| 4 | Item fiscal completo do cenário mínimo | **NOT RUN — bloqueado** (schema de item não confirmado) |
| 5 | Dinheiro | **NOT RUN — bloqueado** |
| 6 | PIX | **NOT RUN — bloqueado** |
| 7 | Cartão | **NOT RUN — bloqueado** (nem o suporte Jinlong foi verificado nesta sessão) |
| 8 | Pagamento misto | **NOT RUN — bloqueado** |
| 9 | `natureza_operacao` não vira string mágica | **PASS** |
| 10 | `local_destino` correto | **PASS** |
| 11 | `modalidade_frete` correto | **PASS** |
| 12 | `presenca_comprador` correto | **PASS** |
| 13 | Resposta autorizada | **PASS** (já coberto desde C2) |
| 14 | Resposta rejeitada | **PASS** (heurística já existente desde C2, não nova) |
| 15 | Referência em processamento (consulta ambígua) | **PASS** |
| 16 | Resposta inválida | **PASS** (já coberto desde C2) |
| 17 | Data de emissão dentro da regra correta | **PASS** |

**13/17 PASS, 4/17 NOT RUN/BLOCKED** (todos os 4 do mesmo motivo: schema de item/pagamento Focus não confirmado). Gates adicionais: `deno check` PASS, `deno test` completo do diretório — **48/48 PASS** (40 anteriores + 8 novos/ajustados desta rodada). `tsc --noEmit` do `pdv-importados` — PASS, sem regressão (nenhum arquivo tocado).

---

## C2.5 GATE: BLOCKED

**Bloqueador real único, com a menor forma de resolver:**

`items[]`/`formas_pagamento[]`/mapeamento de resposta sem heurística dependem do conteúdo de `https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html` e de exemplos reais de resposta da Focus — nenhum dos dois pôde ser acessado nesta sessão (`WebFetch`/`WebSearch` com falha de infraestrutura, mesma falha já registrada na Fase B).

**Menor correção**: colar aqui o conteúdo relevante (mesmo mecanismo que já destravou a Fase B) — nomes de campo de `items[]`/`formas_pagamento[]` da página indicada, e/ou exemplos de resposta (sucesso, rejeição, referência já usada, erro de validação) de POST/GET NFC-e e NF-e. Com isso eu fecho C2.5.1/C2.5.2/C2.5.4 na mesma sessão, sem reabrir o que já foi fechado aqui (`natureza_operacao`, frete/local/presença, `data_emissao`).

Parado. Não vou iniciar C3, não vou chamar a Focus, não vou aplicar produção, não vou fazer push/merge. Fazendo commit do que foi fechado nesta rodada (mudança real, testada, não especulativa) e aguardando.
