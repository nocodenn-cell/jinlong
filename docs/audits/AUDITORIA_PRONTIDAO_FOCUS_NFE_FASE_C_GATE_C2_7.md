# Prontidão Focus NFe — Fase C / Gate C2.7: Fechamento do primeiro cenário fiscal

**Data:** 2026-09-02
**Escopo:** investigação pura, conforme instruído. **Nenhum código alterado, nenhuma migration criada, nenhum dado preenchido, nenhuma chamada à Focus.** Investigação feita contra o código-fonte e o Postgres local efêmero (mesmo ambiente do Gate C1.5/C2.6, ainda de pé).

---

## 1. AUDITORIA DO GAP `list_produtos_gerente_filtrados`

### Cadeia rastreada (RPC → mapper → tela → edição → formulário → UPDATE)

1. **RPC**: `public.list_produtos_gerente_filtrados` — `RETURNS TABLE(id, nome, codigo_barras, preco_varejo, preco_atacado, quantidade_gatilho_atacado, origem, tem_nf, ativo, categoria_id, fornecedor_id, marca_id, unidade_medida, observacao, imagem_url, tags, total_count)`. Confirmado via `pg_get_function_result` direto no banco: **nenhum campo fiscal** (nem os 6 antigos — ncm/cfop_produto/csosn/cest/cst_pis/cst_cofins — nem o novo icms_origem).
2. **Mapper**: `app/admin/produtos/productReader.ts:225-269` (`mapFilteredRow`) lê `r.ncm`, `r.csosn`, `r.cst_pis`, `r.cst_cofins`, `r.icms_origem` de uma linha que **nunca tem essas chaves** — todas resolvem `?? null`.
3. **Tela**: `app/admin/catalogo/page.tsx:99-126` (server component) chama `buscarProdutosComFiltros` → `listComFiltrosImpl` → a RPC acima, e passa o resultado direto para `<CatalogoTable produtos={produtos}>`. Esta é, na prática, a tela de catálogo/produtos do gerente — não existe uma página separada em `app/gerente/produtos/*.tsx` (os arquivos ali são `actions.ts`/`produtoFormSchema.ts`/tipos, sem página própria).
4. **Abertura de edição**: `CatalogoTable.tsx:28-30` declara `CatalogoProduto = ProdutoGerenteRow & { sku: string }` com comentário explícito no código: *"Sendo superconjunto de ProdutoGerenteRow, pode ser passado diretamente ao modal de edição"*. Linha 386: `onClick={() => setEditando(row)}` — `row` é o objeto **exato** vindo da listagem, sem refetch, sem transformação. Linha 420-423: `<ProdutosEditarCatalogoModal produto={editando} .../>` → repassa direto para `<ProdutoFormModal produto={produto} .../>`.
5. **Formulário**: `useProdutoForm.ts`'s `buildSnapshot(produto)` (Onda C2.6) hidrata o estado a partir desse `produto` — que nunca teve dado fiscal real.
6. **UPDATE**: `productUpdater.ts`'s `mapUpdateProductInputToRow` (linha 92-134) monta `ProdutoUpdatePayload` **sempre com todas as chaves fiscais presentes** (`icms_origem: input.icmsOrigem ?? null` — linha 123, incondicional, nunca omitida). `defaultUpdateRow` (linha 259-306) envia esse objeto completo como `p_payload` para a RPC `atualizar_produto_com_faixa_atacado`, cujo `SET` só preserva a coluna quando a CHAVE está **ausente** do JSON (`CASE WHEN p_payload ? 'icms_origem' THEN ... ELSE icms_origem END`) — e a chave nunca está ausente.

### Respostas às 4 perguntas

* **Ela é usada para hidratar edição?** Sim — é a ÚNICA fonte. Não existe `getById` nem qualquer outra consulta entre o clique em "editar" e a abertura do modal (confirmado por busca exaustiva na cadeia).
* **Ao editar produto existente, os campos fiscais podem aparecer vazios?** Sim — **sempre**, independente do valor real gravado no banco. NCM/CFOP/CEST/`icms_origem` aparecem em branco; CSOSN/CST_PIS/CST_COFINS aparecem com o **valor default** (`400`/`07`/`07`), nunca com o valor real, porque `buildSnapshot` cai em `produto.csosn ?? FISCAL_DEFAULTS.csosn` e `produto.csosn` é sempre `null`.
* **Salvar sem alterar pode apagar algum campo fiscal?** **Sim, sempre.** Todo save via este formulário (mesmo sem tocar na seção fiscal) sobrescreve NCM/CFOP/CEST/`icms_origem` com `NULL` e CSOSN/CST_PIS/CST_COFINS com os valores default — apagando qualquer classificação fiscal real que existisse. Confirmado que não há mecanismo de merge/preservação em nenhum ponto da cadeia (`ProdutoFormModal.tsx`, `useProdutoForm.ts`, `productUpdater.ts`).
* **Existe outra consulta que hidrata os dados completos antes da edição?** Não. `getById` (`productReader.ts`) também não traria os campos fiscais mesmo se fosse chamada — `PRODUTO_COLS` também não os inclui — mas isso é irrelevante aqui porque `getById` nunca é chamada neste fluxo.

### Classificação

**P0 — risco confirmado de perda/corrupção de dado fiscal.** Não é um problema apenas de exibição: é destrutivo em toda edição salva pela tela de catálogo do gerente, para os 7 campos fiscais (os 6 pré-existentes + `icms_origem`, herdado por simetria na Onda C2.6, não introduzido por ela — o padrão já estava quebrado antes).

**Pré-existência confirmada**: o bug já afetava NCM/CFOP/CSOSN/CEST/CST_PIS/CST_COFINS antes da Onda C2.6 — a onda apenas estendeu `icms_origem` ao mesmo padrão (documentado no gate anterior como achado fora de escopo). Não foi introduzido por mim nesta sessão.

**Menor fix proposto (não implementado, aguardando autorização):**
1. Uma migration aditiva estendendo o `RETURNS TABLE` e o `SELECT` final de `list_produtos_gerente_filtrados` para incluir `ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem` (mesmo padrão já usado para os demais campos da função — nenhuma mudança de filtro/paginação/RLS).
2. Nenhuma mudança de código TypeScript seria necessária — `RpcProdutoFilteredRow`/`mapFilteredRow`/`mapListRowToGerente` já leem essas colunas (ficaram "fantasma" desde antes da Onda C2.6); a migration sozinha fecha a cadeia inteira.
3. Efeito colateral a considerar antes de implementar: a mesma correção precisa ser confirmada contra RLS/policies da RPC (`SECURITY INVOKER`, já filtra por loja) — sem alteração de escopo de acesso, só de colunas retornadas.

**Bloqueia a primeira homologação?** Não diretamente — se o produto de teste for classificado uma única vez (via CREATE ou SQL direto) e **nunca editado depois** pela tela de catálogo, o dado fiscal permanece correto no banco e a NFC-e de teste pode ser tentada. Mas bloqueia qualquer fluxo operacional real de correção/ajuste fiscal pelo contador/gerente — **deve ser corrigido antes de qualquer uso operacional**, mesmo que não seja um bloqueador estrito do primeiro teste técnico.

---

## 2. DADOS NECESSÁRIOS DO CONTADOR PARA HOMOLOGAÇÃO

Não escolhi nenhum valor abaixo — são exatamente os campos que precisam ser respondidos pelo responsável fiscal/contador da loja, para UM produto de teste específico:

| # | Campo | Pergunta exata a fazer | Por que é necessário |
|---|---|---|---|
| 1 | Regime tributário da empresa | Simples Nacional, Lucro Presumido ou Lucro Real? (Confirmar se o valor já em `pdv_config.regime_tributario` = `SIMPLES_NACIONAL` está correto para a loja real, ou é só o default do schema.) | Determina se o item usa CSOSN (Simples) ou CST (Presumido/Real) — nunca os dois. |
| 2 | NCM do produto de teste | Qual o NCM (8 dígitos) deste produto específico? | Obrigatório pelo SEFAZ; não existe default seguro. |
| 3 | CFOP da operação | Qual CFOP para venda presencial ao consumidor final, dentro do estado, com esta mercadoria? | Depende de regime + operação; hoje há um `cfop_padrao` em `pdv_config`, mas precisa confirmação de que é o correto para este cenário. |
| 4 | ICMS origem | Este produto é nacional ou estrangeiro? Se estrangeiro: importação direta ou mercado interno? Tem similar nacional (lista CAMEX)? Se nacional: qual o % de conteúdo importado (0%, ≤40%, {'>'}40%, {'>'}70%)? | Determina o código `icms_origem` ('0'..'8') — não pode ser inferido de `produtos.origem` (canal de compra, não classificação fiscal). |
| 5 | CST ou CSOSN | Se Simples Nacional: qual CSOSN (ex.: 102, 400, 500)? Se Presumido/Real: qual CST ICMS? | Determina o regime de tributação do ICMS do item — não deve ser convertido automaticamente entre os dois sistemas. |
| 6 | CST PIS | Qual o CST PIS aplicável a este produto/operação? (ex.: 01, 07, 49) | Requerido pela Focus; hoje `cst_pis` tem default `'07'` no schema, mas isso é um default de conveniência do Jinlong, não uma confirmação fiscal. |
| 7 | CST COFINS | Qual o CST COFINS aplicável? (mesmo raciocínio do PIS) | Idem. |
| 8 | CEST | Este produto está sujeito a substituição tributária (ICMS-ST)? Se sim, qual o CEST (7 dígitos)? | Campo condicional — "obrigatório só quando aplicável"; se não aplicável, deixar em branco é a resposta correta. |
| 9 | Alíquotas/base/valores adicionais | Para o CST/CSOSN escolhido acima, quais alíquotas de ICMS/PIS/COFINS (e bases de cálculo) se aplicam, se houver? | Alguns CSTs exigem base+alíquota+valor como campos adicionais na Focus; sem confirmar o CST exato, não é possível saber quais desses campos serão exigidos (ver seção 5). |

**Nota**: itens 6 e 7 acima têm default no schema do Jinlong (`'07'`), mas — como já registrado no Gate C2.5 — esse é um default de conveniência do sistema, não uma confirmação fiscal por produto. Recomendo que o contador confirme explicitamente mesmo esses dois campos para o produto de teste, em vez de assumir que o default do schema está correto para o cenário real.

---

## 3. PIX

**Situação confirmada (reconfirmado no schema local nesta rodada)**: `formas_pagamento` não tem nenhuma coluna de modalidade — schema atual: `id, loja_id, codigo, nome, taxa_percentual, prazo_compensacao_dias, ativo, created_at, updated_at`. O Jinlong só conhece o código genérico `PIX`, sem distinguir dinâmico (Focus `17`), estático (`20`) ou automático (`23`).

**Pergunta operacional mínima necessária:**
> "Quando um cliente paga com PIX no PDV físico, como o QR Code é gerado? (a) QR Code fixo impresso/exibido no caixa, reaproveitado para várias vendas (estático); (b) QR Code gerado na hora, específico para o valor daquela venda, via app do banco ou maquininha (dinâmico); (c) Cobrança recorrente/agendada (PIX Automático — improvável em PDV de varejo presencial, mas preciso perguntar para não presumir)."

Sem essa resposta, não é possível mapear `PIX` para `17`/`20`/`23` sem adivinhar.

**`PIX: BLOCKED — decisão operacional necessária`**

**Não bloqueia o primeiro teste de homologação**: conforme autorizado, o cenário mínimo pode usar `DINHEIRO` (já mapeado e confirmado: `01`, `indicador_pagamento: '0'`), reduzindo variáveis e adiando a decisão de PIX para depois do primeiro NFC-e válido.

---

## 4. CENÁRIO NFC-e MÍNIMO (venda presencial, 1 item, sem frete, consumidor anônimo, DINHEIRO, sem desconto)

| Campo | Origem | Status |
|---|---|---|
| `cnpj_emitente` | `lojas.cnpj` (via snapshot `emitente.cnpj`) | **READY** (arquitetura) — depende de a loja real ter CNPJ cadastrado; dado operacional, não técnico |
| `modalidade_frete` | constante `'9'` (sem frete) — já hardcoded no DTO | **READY** |
| `local_destino` | constante `'1'` (interno) — já hardcoded no DTO | **READY** |
| `presenca_comprador` | constante `'1'` (presencial) — já hardcoded no DTO | **READY** |
| `natureza_operacao` | omitido de propósito — Focus aplica default de venda ao consumidor (confirmado 2x pela doc oficial) | **READY** (decisão documentada, não é gap) |
| `data_emissao` | calculada em tempo real no envio (`new Date().toISOString()`) | **READY** |
| `items[].codigo_produto` | `produto_id` (snapshot) | **READY** |
| `items[].descricao` | `produtos.nome` (snapshot) | **READY** |
| `items[].codigo_ncm` | `produtos.ncm` — **precisa estar preenchido no produto de teste** | **NEEDS DADO HUMANO** (item 2 da ficha do contador) |
| `items[].cfop` | `produtos.cfop_produto` ou `pdv_config.cfop_padrao` | **NEEDS DADO HUMANO** (item 3) |
| `items[].icms_origem` | `produtos.icms_origem` (Onda C2.6, capacidade pronta) | **NEEDS DADO HUMANO** (item 4) — capacidade técnica PASS desde C2.6, falta o valor real |
| `items[].unidade_comercial` | `produtos.unidade_medida` (default `'UN'`) | **READY** |
| `items[].quantidade_comercial` | `1` (cenário fixado) | **READY** |
| `items[].valor_unitario_comercial` | `produtos.preco_varejo` do item de teste | **READY** (arquitetura) — precisa de um preço real cadastrado, trivial |
| `items[].cest` | `produtos.cest`, opcional | **READY** condicionalmente — só se o contador confirmar que se aplica (item 8) |
| `items[].tributacao (ICMS CST/CSOSN + PIS/COFINS)` | grupo ainda não mapeado — ver seção 5 | **BLOCKED** |
| `formas_pagamento[]` (DINHEIRO) | `01`, `indicador_pagamento: '0'` — confirmado e mapeado | **READY** |
| Resposta da Focus (autorizada/rejeitada/processando) | classificação de estado remoto | **BLOCKED** — ver seção 6 |
| Credencial Focus (token de homologação) | `fiscal_provider_config` + secret Supabase — mecanismo pronto desde C2.1 | **NEEDS DADO OPERACIONAL** — precisa do token real de homologação da Focus cadastrado como secret, e uma linha em `fiscal_provider_config` para a loja de teste |
| Produto de edição sem corromper dado fiscal | ver seção 1 | **P0 — recomendado corrigir antes de qualquer edição real do produto de teste pela UI** (não bloqueia se o produto for classificado 1x e nunca reeditado) |

---

## 5. TRIBUTAÇÃO

**BLOCKED.** O grupo de campos ICMS (CST/CSOSN detalhado — base de cálculo, alíquota, valor) e PIS/COFINS (campos condicionais por CST) **nunca teve nome de campo confirmado** pela documentação oficial colada nesta missão, em nenhuma das rodadas do Gate C2.5. `icms_origem` foi a única exceção — um subcampo isolado e confirmado, que já foi modelado e mapeado na Onda C2.6.

Sem essa confirmação, não é possível saber, por exemplo: se `icms_situacao_tributaria` sozinho basta para CSOSN 400 (não tributada) ou se a Focus exige adicionalmente uma base/valor mesmo quando "não tributada"; quais campos aparecem quando o CST/CSOSN escolhido pelo contador (item 5 da ficha) é diferente de 400.

**Recomendação de design para quando os dados chegarem (não implementado agora):** o mapper deve declarar explicitamente uma tabela fechada de combinações regime+CST/CSOSN suportadas. Para uma combinação na tabela: mapear os campos confirmados. Para qualquer combinação fora da tabela: retornar um gap bloqueante `TRIBUTACAO_NAO_SUPORTADA` (nome de erro sugerido, não implementado) em vez de aproximar/computar um valor. Isso significa que o primeiro cenário de homologação só poderá usar exatamente o CST/CSOSN que o contador confirmar e que a documentação Focus cobrir explicitamente — não uma tributação "genérica".

**TRIBUTAÇÃO: BLOCKED**

---

## 6. RESPOSTAS FOCUS

**BLOCKED — inalterado desde o Gate C2.5.** Confirmado (2ª rodada do Gate C2.5) que a consulta de status pode retornar, entre outros, os rótulos textuais "Processando autorização", "Autorizada", "Autorizada completa", "Cancelada", "Erro autorização", além de HTTP 404 = não encontrado (este último, sim, confirmado 1:1). O que falta, especificamente:

* O **corpo JSON exato** (nomes de campo e valores) que a Focus devolve para cada um dos 5 estados — hoje `classifyFocusConsultaResponse` trata qualquer 2xx sem chave/protocolo como "processando", o que pode confundir "Erro autorização" (2xx sem chave) com "ainda processando".
* Se existe um campo de status explícito (ex.: `status: "autorizado"` / `status: "erro_autorizacao"`) ou se a distinção é feita apenas pela presença/ausência de outros campos (`chave_nfe`, `mensagem_sefaz`, etc.).
* Um exemplo real de corpo para "Cancelada" — hoje não existe nenhum tipo `cancelado` no union `FocusRemoteState` porque não há como detectá-lo.

**Sem esses exemplos, mantenho o comportamento conservador já documentado em `fiscal_types.ts`** (nunca declarar erro definitivo sem certeza) — não uso heurística textual nova.

**RESPOSTAS FOCUS: BLOCKED** — informação exata faltante: corpo JSON de exemplo (com todos os campos) para cada um dos 5 estados de consulta (Processando/Autorizada/Rejeitada-Erro/Cancelada/Não encontrada), idealmente capturado de uma consulta real em homologação.

---

## ENTREGA — RESUMO

### PRODUTO EDIT FLOW
**P0 GAP** — toda edição salva pela tela `/admin/catalogo` apaga (NCM/CFOP/CEST/`icms_origem` → NULL; CSOSN/CST_PIS/CST_COFINS → default) os campos fiscais reais do produto, porque `list_produtos_gerente_filtrados` não os retorna e não existe refetch antes da abertura do modal de edição. Não bloqueia o primeiro teste técnico (se o produto de teste não for reeditado pela UI depois de classificado), mas deve ser corrigido antes de qualquer operação real. Menor fix: 1 migration aditiva no `RETURNS TABLE`/`SELECT` da RPC — zero mudança de TypeScript necessária.

### DADOS DO CONTADOR
Lista de 9 itens na seção 2 — regime tributário, NCM, CFOP, ICMS origem (com as sub-perguntas de nacional/estrangeiro/% conteúdo importado), CST ou CSOSN, CST PIS, CST COFINS, CEST (se aplicável), alíquotas/base/valores adicionais dependentes do CST escolhido.

### PIX
**BLOCKED** — decisão operacional necessária (modalidade do QR: estático/dinâmico/automático). Não bloqueia o primeiro teste, que pode usar DINHEIRO.

### CENÁRIO NFC-e MÍNIMO
Tabela completa na seção 4. A maioria dos campos estruturais está **READY** (arquitetura pronta desde C1/C2/C2.6); os que faltam são **dados humanos** (NCM/CFOP/icms_origem do produto de teste, credencial Focus de homologação) — exceto o grupo de tributação detalhada e a classificação de resposta remota, que são **BLOCKED** por falta de documentação Focus.

### TRIBUTAÇÃO
**BLOCKED** — grupo CST/CSOSN detalhado + PIS/COFINS condicional nunca confirmado pela documentação oficial recebida.

### RESPOSTAS FOCUS
**BLOCKED** — falta o corpo JSON exato de cada um dos 5 estados de consulta (Processando/Autorizada/Rejeitada/Cancelada/Não encontrada).

### BLOQUEADORES PARA PRIMEIRA HOMOLOGAÇÃO (lista final mínima)
1. **Dados humanos do produto de teste** — os 9 itens da ficha do contador (seção 2), no mínimo NCM/CFOP/icms_origem/CST-CSOSN para viabilizar ao menos um item sem o grupo de tributação detalhada (se a Focus aceitar o item sem esse grupo — não confirmado, ver bloqueador 2).
2. **Documentação Focus do grupo de tributação** (CST/CSOSN detalhado + PIS/COFINS) — sem isso, não sabemos se um item "mínimo" (sem esses campos) é sequer aceito pela Focus, ou se ela rejeita por campo obrigatório ausente.
3. **Documentação Focus das respostas de consulta** (JSON de exemplo dos 5 estados) — necessária para reconciliação confiável, mas não impede um PRIMEIRO envio (poderíamos observar o HTTP status/corpo real da resposta de homologação como parte do próprio teste, uma vez autorizado a chamar a Focus — o que esta rodada não autoriza).
4. **Credencial Focus de homologação** (token real da conta de testes) — dado operacional, não técnico.
5. **Decisão de modalidade PIX** — não bloqueia se o teste usar DINHEIRO.
6. **(Recomendado, não bloqueador do teste) Corrigir o P0 do fluxo de edição** — antes de qualquer operação real pós-teste.

---

## C2.7 GATE: READY FOR HUMAN INPUT

Não existe mais nenhum defeito arquitetural/técnico que impeça avançar — o que resta são exclusivamente: (a) dados fiscais/operacionais que só o contador/responsável fiscal da loja pode fornecer, e (b) documentação oficial da Focus (grupo de tributação + exemplos de resposta de consulta) que só pode vir da própria Focus ou de testes reais em homologação, ainda não autorizados nesta missão. O P0 do fluxo de edição é uma correção recomendada, não um bloqueador do primeiro teste em si.

Parado. Não criei migration, não alterei tributação, não preenchi produtos, não chamei a Focus, não iniciei XML/C3, não mexi em webhook/cancelamento/CC-e, não apliquei produção.
