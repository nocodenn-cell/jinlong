# Prontidão Focus NFe — Fase C / Gate C2.5: Contrato DTO Fiscal (fechamento)

**Data:** 2026-09-02
**Escopo:** fechar os gaps do DTO NFC-e com evidência oficial da Focus, colada pelo usuário em duas rodadas (rodada 1: `doc.focusnfe.com.br/reference/emitir_nfce`; rodada 2: `campos.focusnfe.com.br/nfe/{NotaFiscalXML,ItemNotaFiscalXML,FormaPagamentoXML}.html` + confirmação de 404/estados de consulta). `WebFetch`/`WebSearch` continuam indisponíveis nesta sessão (falha de infraestrutura, testada e confirmada 3x ao longo desta missão) — nada abaixo vem de acesso direto a essas páginas, só do que foi colado. C1/C2 preservados — nenhuma migration reaberta.

---

## ITEMS — READY (parcial) com gaps precisos

Contrato oficial confirmado (`campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html`, colado pelo usuário) mapeado para o snapshot C1:

| FOCUS FIELD | REQUIRED | SNAPSHOT FIELD | STATUS |
|---|---|---|---|
| `numero_item` | sim | — (computado: índice 1-based no array) | **CONFIRMADO** |
| `codigo_produto` | sim | `itens[].produto_id` (UUID) | **CONFIRMADO** — nota: `produtos.codigo_interno` seria mais alinhado a "código interno do produto" mas não está no snapshot C1; `produto_id` já satisfaz o contrato formal (identificador interno único, ≤60 chars). Não bloqueante |
| `codigo_barras_comercial` | não | `itens[].codigo_barras`, só quando formato GTIN-8/12/13/14 | **CONFIRMADO** (opcional) |
| `codigo_barras_proprio_comercial` | não | — | **N/A** — Jinlong não distingue código GTIN de proprietário no cadastro; nunca preenchido (evita classificar errado) |
| `descricao` | sim | `itens[].nome` | **CONFIRMADO** |
| `codigo_ncm` | sim | `itens[].ncm` | **CONFIRMADO o mapeamento** / **PENDENTE REGRA FISCAL a nível de dado** — cadastro Jinlong permite produto sem NCM (Fase A); quando ausente, aquele item específico bloqueia (não inventa) |
| `cest` | condicional | `itens[].cest` | **CONFIRMADO** (omitido corretamente quando ausente, igual ao "só quando aplicável" da Focus) |
| `cfop` | sim | `itens[].cfop` | **CONFIRMADO** |
| `unidade_comercial` | sim | `itens[].unidade_medida` | **CONFIRMADO** — já estava congelado no snapshot C1, não é gap |
| `quantidade_comercial` | sim | `itens[].quantidade` | **CONFIRMADO** |
| `valor_unitario_comercial` | sim | `itens[].preco_unitario_original` (valor de lista, pré-desconto) | **CONFIRMADO o campo origem** / ⚠️ escolha de `preco_unitario_original` (não `preco_unitario`) segue convenção padrão NFe (bruto separado de desconto) — **não confirmada campo a campo nesta rodada**, sinalizada para validação em homologação |
| `valor_bruto` | não | — | **N/A** (omittedByDesign — Focus calcula automaticamente quando ausente, confirmado) |
| `valor_desconto` | não | `quantidade × itens[].desconto_unitario` | **CONFIRMADO** (mesma ressalva de convenção acima) |
| `unidade_tributavel`/`quantidade_tributavel`/`valor_unitario_tributavel` | não | — | **N/A** (omittedByDesign — fallback documentado para os campos comerciais) |
| `inclui_no_total` | não | — | **N/A** (omittedByDesign — default=1 já é o que Jinlong sempre quer) |
| Grupo ICMS (origem/CSOSN-CST) | sim | `itens[].csosn` | **PENDENTE REGRA FISCAL** — ver TRIBUTAÇÃO |
| Grupo PIS | sim | `itens[].cst_pis` | **PENDENTE REGRA FISCAL** — ver TRIBUTAÇÃO |
| Grupo COFINS | sim | `itens[].cst_cofins` | **PENDENTE REGRA FISCAL** — ver TRIBUTAÇÃO |

**Implementado em `mapSnapshotItemToFocus`** (novo, `fiscal_focus_dto.ts`): mapeia todos os campos CONFIRMADO acima; bloqueia (retorna `item: null`, não um objeto incompleto) quando falta um campo obrigatório sem tributação (`codigo_produto`/`descricao`/`codigo_ncm`/`cfop`/`unidade_comercial`/`quantidade_comercial`/`valor_unitario_comercial`); sempre reporta o gap de tributação (bloqueante para emissão real, não para o resto do mapeamento). Nunca reconsulta `produtos` — só usa o que já está congelado no snapshot C1.

**Veredito ITEMS: READY estruturalmente, BLOCKED para emissão real** (por causa do grupo de tributação, ver abaixo).

## PAGAMENTOS — READY (parcial)

Contrato oficial confirmado (`campos.focusnfe.com.br/nfe/FormaPagamentoXML.html` + lista de códigos colada pelo usuário):

| JINLONG | FOCUS | REGRA | EVIDÊNCIA |
|---|---|---|---|
| `DINHEIRO` | `01` | Direto | Código Jinlong confirmado via seed real (`20260806011719_302_...sql:43`) + código Focus confirmado nesta rodada |
| `CARTAO_CREDITO` | `03` | Direto para o código; **dados transacionais não capturados** (`tipo_integracao`/`cnpj_credenciadora`/`bandeira_operadora`/`numero_autorizacao` ausentes de `vendas_pagamentos`) | Código Jinlong confirmado; gap de dados transacionais reportado, não inventado |
| `CARTAO_DEBITO` | `04` | Idem | Idem |
| `PIX` | — | **PENDENTE REGRA** — Jinlong só tem o enum genérico `PIX` (mesma migration), sem distinguir dinâmico (`17`)/estático (`20`)/automático (`23`). Não mapeado sem essa definição, exatamente como instruído | Confirmado que o Jinlong não guarda modalidade — decisão de produto pendente (qual modalidade a loja realmente usa, ou passar a registrar) |
| `indicador_pagamento` | `"0"` (à vista) sempre | `payload.pagamentos[]` só contém pagamentos JÁ recebidos no ato da venda (`vendas_pagamentos`, C1) — saldo pendente vira `contas_receber`, documento separado, nunca uma entrada deste array | Derivação estrutural do próprio modelo de dados, não suposição |
| Pagamento misto | Múltiplas entradas em `formas_pagamento[]` | Cada linha de `payload.pagamentos[]` (já suporta split desde C1) vira uma entrada — PIX no meio bloqueia só a própria entrada, não as demais | Testado |

**Implementado em `mapPagamentoToFocus`**. Cartão: código confirmado e enviado; campos transacionais adicionais ficam de fora (gap reportado por linha).

**Veredito PAGAMENTOS: READY** para Dinheiro e Cartão (com gap de dados transacionais no cartão); **BLOCKED** para PIX (decisão de produto pendente, não dado técnico faltando).

## TRIBUTAÇÃO — BLOCKED

O material colado nesta rodada confirmou os campos NÃO-tributários do item (seção 1) mas **não incluiu os nomes de campo dos grupos ICMS/PIS/COFINS** (a página `NotaFiscalXML.html`/`ItemNotaFiscalXML.html` colada não trouxe essa parte, ou eu não a recebi). Sei que:
- Regime tributário confirmado no snapshot: `Simples Nacional` (default `pdv_config.regime_tributario`, presente em `emitente.regime_tributario`).
- CSOSN confirmado no snapshot: `itens[].csosn` (default `'400'`, Simples Nacional).
- PIS/COFINS confirmados no snapshot: `itens[].cst_pis`/`cst_cofins` (default `'07'` = isento).

O que falta e não foi confirmado: os NOMES de campo JSON do grupo ICMS (provavelmente algo como um objeto `icms` com `origem`/`csosn` ou campos flat `icms_origem`/`icms_csosn` — **não inventado**, genuinamente desconhecido) e dos grupos PIS/COFINS (situação tributária, base de cálculo, alíquota, valor — se aplicável ao CST usado).

**Veredito TRIBUTAÇÃO: BLOCKED.** Gap exato: nomes de campo dos grupos ICMS/PIS/COFINS em `campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html` (seção de tributação, não recebida ainda).

## RESPOSTAS — BLOCKED (com ganho real de precisão)

Confirmado nesta rodada (sem JSON, só os rótulos e a regra geral):
- **HTTP 200 sozinho não determina o estado** — o body precisa ser interpretado. Isso valida a arquitetura já implementada em C2 (que nunca decidiu só por status), mas não fecha a implementação sem heurística como pedido.
- **404 = referência não encontrada no provider, não rejeição fiscal** — CONFIRMADO. Já implementado assim desde C2 (`classifyFocusConsultaResponse`, `res.status === 404 → nao_encontrado`) — deixa de ser suposição, vira fato confirmado.
- **Estados reais de consulta**: "Processando autorização", "Autorizada", "Autorizada completa", "Cancelada", "Erro autorização" (+ 404). Isso é MAIS do que eu sabia antes — em particular, "Cancelada" é um estado que `FocusRemoteState` **não representa hoje** (não adicionei o tipo sem saber detectá-lo — documentado como lacuna explícita em `fiscal_types.ts`).
- **Risco residual identificado e documentado** (não corrigido, porque corrigir exigiria adivinhar o campo): "Erro autorização" pode ser um 2xx sem chave/protocolo — exatamente o padrão que meu classificador de consulta hoje trata como `processando` (lado conservador). Ou seja, uma consulta genuinamente REJEITADA pode hoje ficar classificada como "ainda processando" em vez de erro. Mantive o comportamento conservador (nunca declarar erro sem certeza) em vez de adivinhar — mas registrei isso como risco real, não teórico, em `fiscal_types.ts`.

**Teste "consulta NFC-e rejeitada" continua BLOQUEADO** — não virou PASS, porque isso exigiria inventar o JSON exato. O usuário já indicou que fornecerá os JSONs separadamente.

**Veredito RESPOSTAS: BLOCKED.** Gap exato: corpo JSON real de cada um dos 5 exemplos de consulta/emissão (NFC-e e NF-e).

## SNAPSHOT — READY

| FOCUS FIELD | REQUIRED | SNAPSHOT FIELD | STATUS |
|---|---|---|---|
| `numero_item` | sim | computado | READY |
| `codigo_produto` | sim | `produto_id` | READY (ver nota codigo_interno acima) |
| `descricao` | sim | `nome` | READY |
| `codigo_ncm` | sim | `ncm` | READY (mapeamento); dado pode faltar por produto |
| `cest` | condicional | `cest` | READY |
| `cfop` | sim | `cfop` | READY |
| `unidade_comercial` | sim | `unidade_medida` | **READY — já estava no snapshot C1, não é gap** |
| `quantidade_comercial` | sim | `quantidade` | READY |
| `valor_unitario_comercial` | sim | `preco_unitario_original` | READY |
| `valor_bruto` | não | (omitido) | READY |
| `valor_desconto` | não | `desconto_unitario` | READY |

**Nenhum campo obrigatório de item está ausente do snapshot C1.** Não precisei reabrir nenhuma migration — confirma que o design do snapshot em C1 já antecipou corretamente o que seria necessário. **Veredito SNAPSHOT: READY.**

---

## DATA EMISSÃO — decisão confirmada, documentando retry/reconciliação

A correção já feita (`data_emissao` calculada no momento real do envio, nunca lida de `payload.data_venda`) está conceitualmente confirmada pelo usuário. `data_venda` (fato histórico imutável) não foi sobrescrita nem afetada — continua só em C1, intocada.

**Como isso interage com o retry-seguro já certificado em C2 (não muda nada, só documentando a coerência):** o C2.7 garante que NUNCA se faz um novo POST sem antes consultar quando `tentativas > 0`. Isso significa que toda vez que um `data_emissao` novo é gerado para um POST, é porque: (a) é a primeira tentativa, ou (b) uma consulta prévia confirmou `nao_encontrado` (Focus genuinamente não processou a tentativa anterior). Em ambos os casos, gerar uma `data_emissao` fresca naquele exato momento é seguro e correto — a garantia de não-duplicação vem inteiramente da `ref` estável (nunca regenerada) e do consultar-antes-de-postar, não da data. `data_emissao` e a proteção contra duplicidade são preocupações ortogonais — uma não enfraquece a outra.

---

## DECISÕES DE NEGÓCIO AINDA NECESSÁRIAS

1. **Modalidade de PIX** que a(s) loja(s) realmente usam (dinâmico/estático/automático) — ou decisão de passar a registrar isso por transação.
2. **Regra de tributação completa** (grupos ICMS/PIS/COFINS) — depende de fechar o gap de TRIBUTAÇÃO acima primeiro; depois, confirmar que os defaults atuais (CSOSN 400, PIS/COFINS 07) realmente reflete a operação real da primeira loja piloto.
3. **Dados transacionais de cartão** (se a Focus exigir `bandeira_operadora`/`numero_autorizacao` como obrigatórios para forma `03`/`04`) — decisão de produto: capturar esses dados no PDV, ou confirmar que são de fato opcionais.
4. **UF do destinatário** — só relevante se/quando o Jinlong vender para cliente identificado fora do estado (hoje não detectável).

---

## DIFF

100% confinado a `backend/supabase/functions/fiscal-worker/` (`fiscal_focus_dto.ts`, `fiscal_focus_dto.test.ts`, `fiscal_types.ts` — comentário). C1 intocado.

## TESTES

`deno check` PASS. `deno test`: **53/53 PASS** (48 anteriores + 5 novos/reescritos desta rodada: item completo, item sem NCM bloqueia, valor_desconto/valor_bruto, GTIN inválido não enviado, dinheiro, PIX pendente, cartão com gap, misto, forma desconhecida). Dos 17 cenários pedidos nesta rodada do gate: item 4 (item completo) agora **PASS**; 5 (dinheiro) **PASS**; 6 (PIX) **PASS** (prova que fica pendente, corretamente); 7 (cartão) **PASS** (prova o código + o gap); 8 (misto) **PASS**. Item "consulta NFC-e rejeitada" continua **NOT RUN**. `tsc --noEmit` do `pdv-importados` — PASS, sem regressão.

## C2.5 GATE: BLOCKED

Bloqueadores reais restantes, únicos e precisos:

1. **TRIBUTAÇÃO** — nomes de campo dos grupos ICMS/PIS/COFINS em `ItemNotaFiscalXML.html` (seção de tributação não recebida).
2. **RESPOSTAS** — corpo JSON real dos 5 exemplos de consulta/emissão (NFC-e e NF-e) — o usuário já indicou que vai fornecer separadamente.

Nenhum valor foi inventado para transformar isso em PASS. Tudo que pôde ser fechado com o material recebido (ITEMS estrutural, PAGAMENTOS exceto PIX, SNAPSHOT, `natureza_operacao`, frete/local/presença, `data_emissao`) foi fechado e testado nesta rodada. Parado aqui — não vou iniciar C3, não vou chamar a Focus, não vou aplicar produção, não vou fazer push/merge. Fazendo commit do progresso real desta rodada.
