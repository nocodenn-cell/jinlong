# Jinlong 金龙 — Prontidão fiscal 2026–2027 (CBS / IBS / IS)

Auditoria técnica, fiscal e arquitetural. Somente leitura.
Data de referência: **11 de outubro de 2026**.
Repositório: `fastproduct` (branch de leitura: `main` em `76d4b400`).
Escopo desta entrega: este arquivo. Nenhum código, migration, teste, credencial, banco, deploy ou configuração da Focus NFe foi alterado. O PR #535 e a branch `sprint/go-live-01` não foram editados, comentados, rebaseados nem recebidos push.

Classificação usada no diagnóstico: **IMPLEMENTADO**, **PARCIAL**, **AUSENTE**, **NÃO VERIFICADO**.
“Implementado” exige regra que grave, calcule ou transmita o dado. Tela, coluna ou comentário sozinhos não contam.

Separação de normas: **legislação aprovada**, **regulamentação publicada**, **nota técnica / ato operacional**, **proposta ou previsão**. O que não estava regulamentado de forma confirmada até 11/10/2026 fica como **pendente de definição**. O que não foi possível abrir na fonte fica como **não confirmado**.

---

## 1. Resumo executivo

O Jinlong tem um módulo fiscal real de NFC-e/NF-e (fila, worker, adapter da Focus NFe, snapshot da venda, XML e trilha de eventos). Esse módulo cobre o desenho antigo: NCM, CFOP, CSOSN/CST de ICMS, PIS, COFINS, origem e regime da loja. Ele **não contém nenhum campo, cálculo ou tag de CBS, IBS ou Imposto Seletivo**. Busca no código por `IBSCBS`, `cClassTrib`, `ibs_cbs` e `vIBS` não retornou ocorrência.

A emissão está fechada de propósito antes do HTTP quando o grupo tributário do item está incompleto (`FOCUS_DTO_INCOMPLETO`). Na prática, o sistema não manda à SEFAZ um XML com IBS/CBS errado: ele não consegue montar um corpo fiscal completo. O enfileiramento automático nasce desligado (`auto_enqueue_fiscal` default `false`). O caixa pode vender sem documento. O que falta é a capacidade de autorizar documento conforme a reforma.

O público inicial (varejo e atacado no Simples Nacional) não aplica as alíquotas-teste de 2026. A obrigatoriedade documental do Simples, no cronograma da Receita Federal e do Comitê Gestor do IBS, começa em **1º de janeiro de 2027**. Loja em Lucro Presumido ou Lucro Real já estava no cronograma de **3 de agosto de 2026**. O cadastro aceita os quatro regimes; o padrão novo é Simples Nacional.

As duas migrations da janela fiscal da GO-LIVE 02 não implementam a reforma. Elas fecham bypass de loja e o `INSERT` direto na fila. No relatório de 10/10/2026 elas ainda não estavam aplicadas em produção. Esta auditoria não reabriu o banco. As duas seguem **obrigatórias agora** para operar a fila com segurança, e **não substituem** o trabalho de CBS/IBS.

Recomendação: **NO-GO** para tratar o Jinlong como pronto para 2027 e para começar código antes da aprovação deste relatório. **GO CONDICIONAL**, em decisão separada, só para o pacote mínimo do Horizonte A (seção 9): classificar o item e mapear os campos que a Focus já publica, sem motor tributário próprio e sem executar as duas migrations nesta trilha.

---

## 2. Legislação confirmada

### 2.1 Legislação aprovada

| Norma | O que faz | Publicação / data no texto | Vigência relevante |
|---|---|---|---|
| Emenda Constitucional nº 132, de 20 de dezembro de 2023 | Cria o IBS (art. 156-A) e a CBS (art. 195, V) e o Imposto Seletivo (art. 153, VIII). Fixa a transição nos arts. 125 a 133 do ADCT. | Promulgada em 20/12/2023. Texto em <https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm> | 2026: teste. 2027: CBS plena e IS, com IBS ainda em alíquota constitucional reduzida. ICMS/ISS até 2032, extintos em 2033. |
| Lei Complementar nº 214, de 16 de janeiro de 2025 | Institui IBS, CBS e IS, cria o Comitê Gestor do IBS e regra a transição, o Simples e os documentos fiscais. | Texto compilado consultado em <https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm> | Efeitos por artigo. Arts. 343 a 348 regem 2026–2028. Art. 544, III: revogações do art. 542 (PIS/Cofins) a partir de 01/01/2027. |
| Lei Complementar nº 227, de 2026 | Institui o CGIBS em lei própria e altera a LC 214, a LC 123 e outras normas. O texto oficial traz “Brasília, 13 de janeiro de 2026”. | <https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm> | Art. 182: entra em vigor na data da publicação. A data do DOU, distinta da data de Brasília, **não foi confirmada** nesta leitura. |

Trechos que mandam na operação do PDV:

- EC 132, ADCT art. 125: em 2026 o IBS estadual é 0,1% e a CBS é 0,9%. O montante recolhido compensa PIS/Cofins. O § 4º permite à lei complementar dispensar o recolhimento de quem cumprir as obrigações acessórias.
- EC 132, ADCT art. 126: a partir de 2027 cobram-se a CBS e o Imposto Seletivo; extinguem-se PIS/Cofins (art. 195, I, “b”, e IV, e art. 239), desde que a CBS esteja instituída. O IPI vai a zero, com exceção da Zona Franca de Manaus.
- EC 132, ADCT art. 127: em 2027 e 2028 o IBS é 0,05% estadual e 0,05% municipal, e a CBS de referência é reduzida em 0,1 ponto percentual.
- EC 132, ADCT arts. 128 e 129: ICMS e ISS caem de 2029 a 2032 e extinguem-se em 2033. O Jinlong não pode aposentar ICMS em 2027.
- LC 214, arts. 343 e 346: repetem 0,1% (IBS estadual) e 0,9% (CBS) para fatos geradores de 2026.
- LC 214, art. 344: IBS de 01/01/2027 a 31/12/2028 em 0,05% + 0,05%.
- LC 214, art. 347: de 01/01/2027 a 31/12/2028 a CBS é a alíquota de referência, reduzida em 0,1 ponto percentual. O percentual cheio da referência **não está nesse artigo**.
- LC 214, art. 348, III, “c”: as alíquotas de 2026 **não se aplicam** ao optante pelo Simples Nacional.
- LC 214, art. 348, § 1º: dispensa o recolhimento de IBS e CBS em 2026 para quem cumprir as obrigações acessórias. O § 2º mantém PIS/Cofins integrais nesse ano.
- LC 214, art. 41: optante do Simples ou MEI segue as regras desses regimes; pode optar pelo regime regular de IBS/CBS.
- LC 214, art. 62: União, Estados, DF e Municípios adaptam os autorizadores de DF-e para o leiaute com IBS e CBS. É obrigação do fisco, não um campo novo do PDV. Os efeitos desse artigo começam em 01/01/2025 (art. 544, II).
- LC 214, arts. 409 e 410: o IS incide uma vez sobre produção, extração, comercialização ou importação dos bens e serviços do Anexo XVII (veículos, embarcações e aeronaves, fumígenos, bebidas alcoólicas, bebidas açucaradas, bens minerais, concursos de prognósticos e fantasy sport). Não é tributo geral de mercadoria importada.
- LC 214, art. 422: alíquotas do IS saem em lei ordinária. **Pendente de definição** o percentual: esta auditoria não localizou a lei ordinária com as alíquotas vigentes em 11/10/2026.
- LC 214, art. 349: resolução do Senado fixa a alíquota de referência da CBS para 2027–2033, no ano anterior. Busca no Senado em 11/10/2026 **não confirmou** resolução já publicada com o percentual de 2027. A Rádio Senado, em 30/04/2026, tratava a fixação como tarefa ainda a cumprir em 2026 (<https://www12.senado.leg.br/radio/1/noticia/2026/04/30/aliquotas-de-bens-e-servicos-e-do-imposto-seletivo-devem-ser-fixadas-este-ano>).

### 2.2 Regulamentação publicada

| Ato | Papel | Fonte consultada |
|---|---|---|
| Decreto nº 12.955, de 29 de abril de 2026 | Regulamento da CBS. Publicado no DOU de 30/04/2026. | <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm> e ficha do DOU <https://www.in.gov.br/web/dou/-/decreto-n-12.955-de-29-de-abril-de-2026-702415229> |
| Decreto nº 13.075, de 21 de julho de 2026 | Altera o Decreto 12.955. Trecho lido: obrigatoriedade de CNPJ e de documento fiscal de pessoa física e produtor rural pessoa física produz efeitos em 01/01/2027. O decreto inteiro não foi relido artigo a artigo. | <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13075.htm> |
| Resolução CGIBS nº 06/2026 | Regulamento do IBS, citada pela Receita como base do art. 112 cumprido pelo Ato Conjunto nº 4. O PDF da resolução **não foi lido** nesta auditoria. Existência: confirmada pela notícia oficial abaixo. Texto dispositivo: **não confirmado** além dessa citação. | Notícia da RFB de 31/07/2026 |

### 2.3 Notas técnicas e atos operacionais

**NT 2025.002-RTC, versão 1.40, maio de 2026.** PDF hospedado pelo CGIBS: <https://www.cgibs.gov.br/upload/arquivos/202606/17141803-nt-2025-002-v1-40-rtc-nf-e-ibs-cbs-is-final.pdf>.

É a versão mais nova cujo texto foi aberto. O histórico interno vai da 1.00 (03/2025) à 1.40 (05/2026). A 1.36 registra alterações dos Ajustes SINIEF nº 49/25 e 8/26; o texto desses ajustes no CONFAZ **não foi aberto**. A listagem do Portal Nacional da NF-e redirecionou e não foi lida. **Não confirmado** se existe versão posterior à 1.40 até 11/10/2026.

O que a v1.40 afirma, e que esta auditoria usa:

- Substitui, para NF-e e NFC-e, a RT NT 2024.002 IBS/CBS v1.10.
- Inclui o grupo de IBS, CBS e IS no item, com CST e `cClassTrib`.
- Regra UB12-10 (rejeição 1115, “IBS/CBS não informado”), modelos 55 e 65: em produção, para emitente CRT 3 (regime normal), a partir de nota com data de emissão igual ou maior que **03/08/2026**. Para CRT 1 (Simples), CRT 2 (Simples excesso de sublimite) e CRT 4 (MEI), a mesma regra em produção a partir de **04/01/2027**.
- A própria NT diz que a orientação específica de Simples, excesso de sublimite, MEI e monofásico sairia em NT futura, porque a tributação desses contribuintes começa em 2027 (art. 348 da LC 214).
- Regras de validação do Imposto Seletivo (UB06-10, UB07-10, UB08-10, UB11-10) estão marcadas como **implementação futura** nessa versão.

Cronograma da v1.40 para CRT 3, coluna produção: em janeiro/2026 o preenchimento não era exigido pela regra de validação, embora a NT diga que permanecia obrigatório pela legislação; em **03/08/2026** o preenchimento passa a ser obrigatório na validação.

**Ato Conjunto RFB/CGIBS nº 1, de 22 de dezembro de 2025.** Ementa confirmada na página da Receita (atualizada em 09/09/2026): obrigações acessórias para informar a apuração de IBS e CBS em 2026. <https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/legislacao/atos-conjuntos>. O PDF do ato não foi relido artigo a artigo. Notícia do CGIBS e nota da SEFAZ-ES descrevem 2026 como ano de apuração informativa, com dispensa de penalidade até o primeiro dia do quarto mês depois da publicação da parte comum dos regulamentos. A data exata em que essa janela de penalidade se encerrou **não foi confirmada** nesta auditoria. Não se usa a data de 01/04/2026 citada em material da Focus sem lastro nesse ato.

**Ato Conjunto RFB/CGIBS nº 4, de 30 de julho de 2026.** Cronograma de obrigatoriedade dos DF-e do art. 112 dos regulamentos. Notícia oficial da Receita, 31/07/2026: <https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-e-comite-gestor-do-ibs-publicam-o-cronograma-de-implementacao-dos-documentos-fiscais-eletronicos-da-reforma-tributaria-do-consumo>.

Datas que interessam ao Jinlong, copiadas dessa tabela:

| Documento | Início |
|---|---|
| NF-e (bens materiais) | 03/08/2026 |
| NFC-e (varejo) | 03/08/2026 |
| NF-e de sujeito passivo de IBS/CBS não contribuinte de ICMS | 01/12/2026 |
| NF-e de importação | 01/01/2027 |
| NF-e de tributação monofásica (combustíveis) | 01/01/2027 |
| Documentos do Simples Nacional (NF-e, NFC-e e outros) | 01/01/2027 |

A mesma notícia marca “publicação dos leiautes” do bloco Simples como **01/09/2026**. Se esse leiaute específico foi de fato publicado até 11/10/2026: **não confirmado**.

O portal do CT-e reproduz o § 1º do art. 1º do Ato 4: para optante do Simples, a obrigatoriedade começa em 01/01/2027; a NF-e monofásica também. <http://www.cte.fazenda.gov.br/portal/informe.aspx?informe=176>.

Atos 2 (27/05/2026, publicação do manual de split payment), 3 (19/06/2026, DeRE) e 5 (12/08/2026, Programa Nacional de Conformidade Tributária em 2026) constam da mesma página da Receita. Split payment e DeRE não são obrigação confirmada do PDV de mercadorias desta auditoria. Ficam como **pendente de definição** para o caixa.

### 2.4 SEFAZ-PE

Nota de esclarecimento: em 2026, com base na NT 2025.002 v1.32 de 25/11/2025, IBS e CBS teriam caráter informativo, não integrariam o total da nota nem a base do ICMS. <https://www.sefaz.pe.gov.br/Noticias-Destaque/Paginas/NOTA-DE-ESCLARECIMENTO.aspx>.

Essa nota cita a v1.32, anterior à v1.40 e ao Ato Conjunto nº 4. Serve para o ano-teste e para a base do ICMS em Pernambuco. Não substitui o cronograma de 03/08/2026 (regime normal) nem o de 01/01/2027 (Simples). A página de documentos da SEFAZ-PE manda o contribuinte continuar emitindo e acompanhar as NTs no Portal Nacional: <https://www.sefaz.pe.gov.br/Servicos/ICMS/Paginas/Documentos_Fiscais.aspx>.

NFC-e em Pernambuco continua exigindo credenciamento, certificado e CSC. Esta auditoria não consultou o ambiente autorizador da SVRS/SEFAZ-PE para ver se a rejeição 1115 já está ligada.

### 2.5 Proposta ou previsão — não tratar como vigente

- Percentual da alíquota de referência da CBS em 2027: previsto em resolução do Senado. Não localizado.
- Alíquotas do IS em lei ordinária: previstas no art. 422. Não localizadas.
- NT futura de Simples/MEI/monofásico anunciada pela própria NT 2025.002 v1.40.
- Leiaute do Simples com data de publicação indicada em 01/09/2026: cumprimento **não confirmado**.
- Versão da NT 2025.002 posterior à 1.40: **não confirmado**.
- Split payment no caixa e apuração assistida como rotina do emissor: fora do que está obrigatório para este PDV até a data de referência.

---

## 3. Obrigações de 2026 e de 2027

Cada linha distingue a obrigação, a base, a publicação, a vigência, o início operacional, quem é atingido, o efeito no documento e a fonte.

### 3.1 Ano de 2026

| # | Obrigação | Base | Publicação | Vigência | Início operacional | Quem | Efeito em NF-e/NFC-e | Fonte |
|---|---|---|---|---|---|---|---|---|
| 1 | CBS de 0,9% e IBS estadual de 0,1% sobre fatos geradores de 2026, com compensação em PIS/Cofins e dispensa de recolhimento se as obrigações acessórias forem cumpridas | EC 132, ADCT art. 125; LC 214, arts. 343, 346 e 348 | EC 20/12/2023; LC 16/01/2025 | 01/01/2026 a 31/12/2026 | Informação no DF-e conforme cronograma abaixo. Recolhimento dispensado no § 1º do art. 348 | Regime regular. **Não** se aplica ao Simples (art. 348, III, “c”) | Destacar IBS/CBS quando o leiaute exigir. Não substituem PIS/Cofins em 2026 | Planalto, textos citados |
| 2 | PIS e Cofins continuam devidos em 2026 | LC 214, art. 348, § 2º; EC 132, ADCT art. 126 (extinção só em 2027) | 16/01/2025 | Todo o ano de 2026 | Imediato | Todos os regimes que já recolhem PIS/Cofins, inclusive Simples pela guia própria | Grupos PIS/COFINS permanecem | LC 214 compilada |
| 3 | Preencher IBS/CBS na NF-e e na NFC-e do regime normal | NT 2025.002 v1.40, regra UB12-10; Ato Conjunto RFB/CGIBS nº 4/2026 | NT: maio/2026 (PDF no CGIBS em junho/2026). Ato: 30/07/2026, notícia 31/07/2026 | Validação de produção a partir de 03/08/2026 para CRT 3 | **03/08/2026** — já vencido na data de referência | Lucro Presumido e Lucro Real (CRT 3). O Jinlong grava esses regimes | Rejeição 1115 se o grupo `IBSCBS` faltar no item | PDF da NT; notícia da RFB |
| 4 | Simples Nacional e MEI fora das alíquotas-teste e com documento novo só em 2027 | LC 214, art. 348, III, “c”; Ato 4; NT UB12-10, observação 3 | Mesmas datas | 2026 sem as alíquotas dos arts. 343 e 346 | Documento: **01/01/2027**. Validação NT: **04/01/2027** | Optante do Simples, excesso de sublimite e MEI | Em 2026 a NT não liga a rejeição 1115 para esses CRT. O leiaute específico do Simples estava previsto para 01/09/2026 — publicação **não confirmada** | NT v1.40; notícia da RFB de 31/07/2026 |
| 5 | IBS/CBS de 2026 não entram na base do ICMS em Pernambuco, no entendimento da SEFAZ-PE | Nota da SEFAZ-PE fundada na NT v1.32 e na LC 87/1996, art. 13 | Página sem data de atualização posterior à v1.40 | Exercício de 2026 | Durante 2026 | Contribuinte de ICMS em PE | Valores informativos não compõem o total nem a base, segundo essa nota | <https://www.sefaz.pe.gov.br/Noticias-Destaque/Paginas/NOTA-DE-ESCLARECIMENTO.aspx> |
| 6 | IS em 2026 | EC 132, ADCT art. 126, I, “b” (cobrança a partir de 2027); NT marca validações de IS como implementação futura | — | Cobrança constitucional em 2027 | **Pendente de definição** para o XML em 2026 | Só NCM/serviço do art. 409 | Não exigir IS no cupom de 2026 com base nesta NT | EC 132; NT v1.40 |

### 3.2 Ano de 2027

| # | Obrigação | Base | Publicação | Vigência | Início operacional | Quem | Efeito em NF-e/NFC-e | Fonte |
|---|---|---|---|---|---|---|---|---|
| 1 | Extinção de PIS/Cofins e cobrança da CBS | EC 132, ADCT art. 126, II; LC 214, art. 542 c/c art. 544, III | EC 20/12/2023; LC 16/01/2025, com redação da LC 227/2026 | 01/01/2027 | 01/01/2027 | Regime regular. Simples: pelas regras do Simples ou pela opção do regime regular (LC 214, art. 41) | PIS/Cofins deixam de ser o tributo federal da operação. CBS entra. Percentual de referência **pendente de definição** (resolução do Senado não localizada) | Planalto |
| 2 | IBS de transição: 0,05% UF + 0,05% município | EC 132, ADCT art. 127; LC 214, art. 344 | Mesmas | 01/01/2027 a 31/12/2028 | 01/01/2027 | Regime regular. Simples conforme o cronograma do Ato 4 | Dois grupos (UF e município), não mais só a alíquota estadual de 2026 | Planalto |
| 3 | NFC-e e NF-e do Simples com os campos novos | Ato Conjunto nº 4; NT UB12-10 observação 3 | 30/07/2026 e NT maio/2026 | 01/01/2027 (ato) e 04/01/2027 (validação) | **01/01/2027** | Público padrão do Jinlong | CST IBS/CBS + `cClassTrib` por item. Códigos da tabela oficial. A NT de detalhe do Simples ainda era “futura” na v1.40 | RFB; NT |
| 4 | Imposto Seletivo | EC 132, ADCT art. 126, I, “b”; LC 214, arts. 409 a 422 | LC 16/01/2025 | Cobrança a partir de 2027 | Alíquota e validação de schema: **pendente de definição** / implementação futura na NT v1.40 | Só itens do Anexo XVII | Grupo `IS` quando o NCM estiver na lista. Não é default de loja de importados | Planalto; NT |
| 5 | IPI reduzido a zero, com ressalva da ZFM | EC 132, ADCT art. 126, III; LC 214, art. 454 | — | 01/01/2027 | 01/01/2027 | Industrializados fora da exceção. Varejo puro em geral não apura IPI de saída | Não inventar destaque de IPI de saída no PDV | Planalto |
| 6 | ICMS permanece | EC 132, ADCT arts. 128 e 129 | — | Redução só em 2029; extinção em 2033 | Contínuo | Todo mundo que hoje destaca ICMS, inclusive Simples pelo regime próprio | CSOSN/CST e CFOP continuam. IBS não os substitui em 2027 | EC 132 |
| 7 | Crédito presumido de estoque de CBS em 01/01/2027 | LC 214, art. 381 | 16/01/2025 | 01/01/2027 | Forma de inventário: ato do Poder Executivo, **pendente de definição** se já publicado — não localizado | Contribuinte do regime regular da CBS | Não é campo de cupom. É apuração. Não construir tela de estoque fiscal até o ato existir | LC 214, art. 381, § 2º |
| 8 | Devolução de venda anterior a 2027 | LC 214, art. 379; NT UB12-10, exceção 1 (`finNFe=4` que referencia nota anterior a 2026) | — | 01/01/2027 para o crédito de CBS da devolução | Quando houver devolução documental | Quem emite NF-e de devolução | A exceção da NT evita exigir IBS/CBS em devolução de nota pré-2026. O Jinlong não emite hoje esse `finNFe` | LC 214; NT |

---

## 4. Diagnóstico do módulo fiscal

Arquitetura atual, em uma frase: a venda congela um snapshot; a RPC `fiscal_enfileirar_documento_venda` grava `documentos_fiscais_pendentes`; o Edge `fiscal-worker` monta JSON da Focus, posta em `/v2/nfce` ou `/v2/nfe` e, se autorizado, guarda o XML. Isolamento de leitura está em policy. O isolamento das RPCs `SECURITY DEFINER` está no arquivo `20261009220000`, não comprovado em produção nesta data.

| Capacidade | Status | Evidência | Leitura |
|---|---|---|---|
| Arquitetura fiscal (fila, worker, estados) | PARCIAL | `backend/supabase/functions/fiscal-worker/index.ts:Deno.serve:27`; orquestração em `fiscal_worker_orchestration.ts`; fila em `documentos_fiscais_pendentes` | O cano existe. O corpo tributário que o cano carrega para na reforma e até no grupo clássico de CST. |
| Integração Focus NFe | PARCIAL | `fiscal-provider-adapter.ts:focusEndpointPath:19`; `buildFocusEmitUrl:28`; `postFocusEmit:530`; `FocusProvider.callProvider:577` | URL, token, timeout, ref e classificação de resposta estão implementados. O POST real só ocorre se o DTO não estiver bloqueante. |
| Emissão NFC-e | PARCIAL | `buildFocusNfceEnvelope` em `fiscal_focus_dto.ts:293`; caminho default `/v2/nfce` | Cenário presencial (`modalidade_frete=9`, `presenca_comprador=1`, `local_destino=1`) está fixo no envelope. Tributos do item não entram. |
| Emissão NF-e | PARCIAL | `focusEndpointPath` escolhe `/v2/nfe` quando `tipo_doc=NFE`; `validarDestinatario` em `fiscal_focus_dto.ts:258` | Exige nome e documento. Sem UF do destinatário o envelope fica bloqueante (`local_destino_interestadual_exterior`). Não há modelo de nota de crédito/débito da reforma. |
| Configuração tributária da empresa | PARCIAL | `20260621000500_209_fiscal_campos_loja_pdvconfig.sql:61-82`; UI em `ConfiguracoesContent.tsx` (select de regime por volta da linha 643) | CNPJ, IE, série, CFOP padrão, CST padrão e regime (`SIMPLES_NACIONAL`, `LUCRO_PRESUMIDO`, `LUCRO_REAL`, `MEI`). Não há CRT enviado à Focus, nem vigência, nem flag “opta pelo regime regular de IBS/CBS”. Default de regime: Simples. Default de enfileirar: `false` (linha 66). |
| Cadastro fiscal de produto | PARCIAL | `20260621000600_210_fiscal_campos_produto.sql:9-15`; `FiscalSection.tsx` (NCM, CFOP, CSOSN, CST PIS, CEST) | NCM (8 dígitos ou nulo), CFOP, CSOSN default `400`, CEST, CST PIS/COFINS default `07`. Não há CST IBS/CBS nem `cClassTrib`. NCM nulo é permitido; há índice `idx_produtos_sem_ncm`. |
| Cálculos tributários | AUSENTE para CBS/IBS/IS; PARCIAL para o legado | `mapSnapshotItemToFocus` em `fiscal_focus_dto.ts:181-188` empurra gap `tributacao_icms_pis_cofins` e não lê `csosn` / `cst_pis` / `cst_cofins`. `buildFocusNfceEnvelope:354-355` torna bloqueante qualquer gap cujo campo contém `tributacao` | O snapshot até congela CSOSN, PIS e COFINS (`20260902140300_fiscal_payload_snapshot_icms_origem.sql` por volta da linha 492). O mapeador descarta. Não há fórmula de 0,9%, 0,1% ou 0,05%. Isso é falha fechada, não cálculo errado. |
| Origem da mercadoria | IMPLEMENTADO no domínio; PARCIAL na nota | `fiscal_focus_dto.ts:mapSnapshotItemToFocus:168-178`; testes em `fiscal_focus_dto.test.ts` | `icms_origem` `0`–`8` é obrigatório no item. `produtos.origem` (ex.: importação manual) não vira origem fiscal. Importado sem `icms_origem` bloqueia o item. |
| Geração e guarda de XML | PARCIAL | `fiscal_xml_orchestration.ts:processXmlDocumento:131` e upload em `:187` (`upsert: false`); hash em `sha256Hex:66`; path em `computeXmlStoragePath:85` | XML autorizado é baixado do provedor e gravado sem sobrescrever. Não há gerador local de XML da reforma. Documento que não autoriza não gera XML. |
| Rejeição da SEFAZ | PARCIAL | `fiscal_classify.ts:classifyFiscalError:3`; `classifyFocusEmitResponse` em `fiscal-provider-adapter.ts:112` | Timeout, cadastro e texto com “sefaz/rejeicao/cfop/cst/ncm” são classificados. Não há mapa das rejeições 1115/1020 da NT 2025.002. Rejeição nova cairia no balde genérico se o texto não contiver essas palavras. |
| Webhooks fiscais | AUSENTE | Única menção de rota é desenho em `docs/FISCAL_FOCUS_NFE_CONTRATO.md` (caminho `/api/webhooks/focus`). Não há handler em `app/api` | O worker consulta. Não há receptor de POST da Focus. |
| Fila de emissão | IMPLEMENTADO no código; aplicação de produção da trava de INSERT não reconfirmada | RPC `fiscal_enfileirar_documento_venda` reescrita em `20261009220000_fiscal_rpc_isola_loja.sql:275`; `ON CONFLICT (venda_id, tipo_doc)` em `:385` | Uma venda e um tipo não duplicam documento ativo. `SEM_NF` é recusada (`:367`). |
| Idempotência | IMPLEMENTADO no desenho da fila e do XML | Conflito da fila acima; XML com lease em `20260903170000_fiscal_xml_lease_concorrencia.sql`; ref estável em `resolveFocusRef` (`fiscal-provider-adapter.ts:459`) | Reenvio não deve criar segunda nota se a ref for a mesma. Não foi executado contra a Focus nesta auditoria. |
| Auditoria de operações | PARCIAL | `INSERT` em `documentos_fiscais_eventos` dentro de `fiscal_reprocessar_documento` (`20261009220000` por volta da linha 145); timeline de UI em `fiscalEventTimeline.ts` | Há trilha de reprocesso, erro e status. Não há histórico de vigência de alíquota nem de quem alterou `cClassTrib`, porque o campo não existe. |
| Isolamento entre lojas | PARCIAL | RLS em `094_fiscal_rls_loja_scope_transferencias_idempotencia.sql:27` (`doc_fiscal_pendentes_select_loja`). Correção do `current_user` em `internal.fiscal_sessao_privilegiada` (`20261009220000:49`) | A policy restringe leitura. As RPCs `SECURITY DEFINER` só ficam corretas depois do arquivo de 09/10/2026. A GO-LIVE 02, em 10/10/2026, leu o catálogo de produção e classificou esse arquivo como não aplicado. Esta auditoria não repetiu a leitura. |
| Credencial por loja | IMPLEMENTADO como metadado | `20260902130100_fiscal_provider_config.sql` | Token não fica no Postgres; a linha aponta o nome canônico da variável. Ambiente é coluna explícita. Homologação e produção no mesmo projeto Supabase estão documentadas como limite conhecido nesse arquivo. |
| Entrada de NF-e de fornecedor (IBS/CBS no XML de compra) | AUSENTE | Nenhuma ocorrência de `IBSCBS` / `cClassTrib` no repositório, inclusive no fluxo de importação | Estoque importa NF-e pelo fluxo já existente. O parser não conhece os grupos novos. |
| Devolução e cancelamento fiscal | PARCIAL | `cancelarDocumentoFiscal` em `pdv-importados/app/gerente/financeiro/actions.ts:157` chama `fiscal_cancelar_documento`. Não há `finNFe` de devolução | Cancelamento de documento está desenhado na RPC. A GO-LIVE 02 registrou a função ausente no catálogo de produção em 10/10/2026. Devolução mercantil não gera NF-e de devolução com os grupos da reforma. |
| Eventos de apuração (211110 e correlatos) | AUSENTE | Sem referência no código | São eventos da NT para a apuração assistida. Não há emissor. |
| Split payment | AUSENTE | Sem referência | Ato Conjunto nº 2 só autoriza publicar manual. Sem obrigação de caixa confirmada. |

O princípio já adotado no DTO — não inventar nome de campo e não calcular em paralelo o que o provedor calcula (`OMITTED_BY_DESIGN` em `fiscal_focus_dto.ts:36-60`) — é o caminho certo para a reforma. O que falta é uma decisão explícita, com a tabela oficial, dos poucos campos que a Focus marca como obrigatórios e que o domínio não tem.

---

## 5. As duas migrations da GO-LIVE 02

Fonte da lista: `docs/auditorias/GO-LIVE-02-AUTORIZACAO-JANELA-FISCAL.md` (10/10/2026, PR #535, branch `sprint/go-live-01`), itens 3 da seção “Operações que exigem autorização”:

1. `backend/supabase/migrations/20261009220000_fiscal_rpc_isola_loja.sql`
2. `backend/supabase/migrations/20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` (corpo sem o `BEGIN`/`COMMIT` interno, na mesma transação)

A matriz do `docs/auditorias/GO-LIVE-02-RELATORIO.md` (seção 6, 10/10/2026) classificou as duas como **não aplicadas**: ledger `remote_ausente` e efeito ausente no catálogo. Esta auditoria não acessou produção nem staging. Depois de 10/10/2026 a aplicação está **não confirmada**.

Nenhuma das duas cria coluna de CBS, IBS ou IS. Nenhuma deve ser executada por causa deste relatório.

### 5.1 `20261009220000_fiscal_rpc_isola_loja.sql`

| Item | Conteúdo |
|---|---|
| Nome | `20261009220000_fiscal_rpc_isola_loja.sql` |
| Objetivo | Fechar bypass de autorização. Dentro de `SECURITY DEFINER`, `current_user` é o dono (`postgres`), então o predicado antigo nunca rodava. Operador da loja A conseguia reprocessar, enfileirar e gravar evento da loja B. Gerente da loja A cancelava documento da loja B. |
| Tabelas lidas ou gravadas | `usuarios`, `documentos_fiscais_pendentes`, `vendas`, `caixas`, `documentos_fiscais_dlq`, `documentos_fiscais_eventos`. Não cria tabela. Não altera linha de venda por DDL. |
| Funções | Cria `internal.fiscal_sessao_privilegiada()` (`:49`). Substitui `fiscal_reprocessar_documento(uuid)` (`:61`), `fiscal_cancelar_documento(uuid, text)` (`:179`), `fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)` (`:275`) e `fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb)` (`:444`). |
| Permissões e RLS | `REVOKE` de `PUBLIC` e `anon`; `GRANT EXECUTE` a `authenticated` e `service_role`. Não reescreve policy. A RLS da 094 continua sendo a barreira de tabela; esta migration é a barreira da função que ignora RLS. |
| Dependências | `auth.uid()`, `auth.role()`, `usuarios.ativo`, `usuarios.perfil`, `usuarios.loja_id`, `caixas.loja_id`, `vendas.caixa_id`. A GO-LIVE 02 registrou que não depende de `20261006120000` nem do lote financeiro `20261007*`. Exige que a assinatura de quatro argumentos de `fiscal_enfileirar_documento_venda` já exista. O `CREATE` de `fiscal_cancelar_documento` é o mesmo texto de `20261007161220`; reaplicar esse outro arquivo não é o script de recuperação. |
| Risco operacional | Troca de corpo de função na hora em que o worker e a tela chamam essas RPCs. A janela pedida pela GO-LIVE 02 pausa o worker e exige dump do dia. Aplicar só este arquivo, sem o revoke, deixa o `INSERT` direto aberto. |
| Impacto em dados existentes | `CREATE OR REPLACE` não reescreve XML nem payload antigo. Chamada real depois do `COMMIT` passa a negar outra loja (`FISCAL_REPROCESSO_LOJA`, `FISCAL_CANCELAR_LOJA`). |
| Piloto | A tela já chama `fiscal_cancelar_documento` (`actions.ts:cancelarDocumentoFiscal:157`). Sem a função no banco, o cancelamento fiscal do painel falha. Com a função antiga, o cancelamento fura loja. |
| Relação com a reforma | Nenhuma. Não guarda CST nem `cClassTrib`. É pré-requisito de segurança para qualquer emissão, antiga ou nova. |
| Classificação | **OBRIGATÓRIA AGORA** para a segurança da fila e para o cancelamento que a tela já dispara. Não é “necessária só antes de 2027”. Não autoriza execução: a GO-LIVE 02 mantém NO-GO até autorização escrita, dump do dia e restore de prova. |

### 5.2 `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql`

| Item | Conteúdo |
|---|---|
| Nome | `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` |
| Objetivo | `REVOKE INSERT` em `documentos_fiscais_pendentes` de `authenticated` e `anon`, para que a fila só nasça pela RPC. Prova estrutural exige a RPC presente e o privilégio ausente. |
| Tabelas | Privilégio de `public.documentos_fiscais_pendentes`. Não muda colunas nem linhas. |
| Funções | Nenhuma criada. A prova chama `to_regprocedure('public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)')`. |
| Permissões e RLS | Só revoga `INSERT`. `SELECT`/`UPDATE` da RLS 094 permanecem. `service_role` não está no `REVOKE` e segue podendo enfileirar, que é o caminho do worker e do sync. |
| Dependências | A RPC de enqueue já tem de existir, senão a prova aborta. Pode ir na mesma transação, depois de `20261009220000`. Não depende do lote de caixa. O arquivo traz `BEGIN`/`COMMIT` próprios; a janela da GO-LIVE 02 manda aplicar o corpo sem esse par, dentro da transação única. |
| Risco operacional | Baixo sobre dados. Alto se algum cliente ainda fizer `INSERT` direto: a venda deixa de enfileirar por esse atalho. O comentário do arquivo diz que o stub `enfileirarDocFiscalStub` foi removido. |
| Impacto em dados existentes | Nenhum rewrite. Fecha um buraco de gravação. |
| Piloto | Sem o revoke, sessão `authenticated` ainda insere na fila, fora da RPC que valida loja e tipo de venda. |
| Relação com a reforma | Nenhuma. Impede fila falsa. Não modela tributo novo. |
| Classificação | **OBRIGATÓRIA AGORA**, no mesmo change da anterior, pela razão operacional da GO-LIVE 02. Não implementa 2027. **PODE AGUARDAR** apenas se a decisão for manter o fiscal desligado e sem usuário autenticado gravando na fila — não é o estado que a tela de cancelamento assume. |

Ordem já escrita na GO-LIVE 02, e que este relatório não altera: dump e restore do dia; pré-check; uma transação com `20261009220000` e depois o corpo de `20261007163200`; worker pausado; nenhum outro arquivo; nada de `migration repair` antes do `COMMIT`. Recuperação de função: só reaplicar `20261009220000`.

---

## 6. Compatibilidade com a Focus NFe

Responsabilidade da Focus, pelo que a documentação consultada descreve: receber JSON, assinar, transmitir à SEFAZ, devolver status, chave, protocolo e XML. Guia de reforma: <https://focusnfe.com.br/guides/reforma-tributaria/>. Esse guia afirma que a API de NF-e e de NFC-e já tem os campos novos e aponta a documentação de campos. A página de item aberta nesta auditoria é a de NF-e: <https://campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html>. Página exclusiva de NFC-e, campo a campo: **não consultada**. A NT trata o grupo UB nos modelos 55 e 65; o adapter do Jinlong usa o mesmo `buildFocusNfceEnvelope` para os dois, mudando só o path.

Campos que a página de item marca como reforma e obrigatórios (trechos lidos):

| Campo JSON Focus | Tag | Obrigatoriedade na página | No Jinlong |
|---|---|---|---|
| `ibs_cbs_situacao_tributaria` | `CST` | obrigatório, 3 caracteres | AUSENTE |
| `ibs_cbs_classificacao_tributaria` | `cClassTrib` | obrigatório, 6 caracteres | AUSENTE |
| `is_situacao_tributaria` | `CSTIS` | obrigatório na página | AUSENTE. Na NT, validação ainda “implementação futura” e o fato gerador constitucional é 2027, só para o Anexo XVII |
| `is_classificacao_tributaria` | `cClassTribIS` | obrigatório na página | AUSENTE. Mesma ressalva |

A mesma página também lista base, alíquota e valor (`ibs_cbs_base_calculo`, `cbs_aliquota`, `is_base_calculo`, `is_aliquota`, `is_valor`) e os códigos “regulares” (`ibs_cbs_situacao_tributaria_regular`, `ibs_cbs_classificacao_tributaria_regular`). **Não confirmado** se a Focus calcula base e valor quando o integrador manda só CST e `cClassTrib`, ou se exige alíquota e valor prontos. O Jinlong já omite `valor_bruto` de propósito para não duplicar arredondamento da Focus. A mesma regra deve valer aqui: homologar o mínimo que a API rejeita quando falta, e não construir um segundo calculador.

O que continua sendo do Jinlong:

- Regime da loja (Simples, MEI, Lucro Presumido, Lucro Real) e, quando existir regulamentação, a opção pelo regime regular de IBS/CBS.
- NCM, origem, CFOP, CSOSN/CST atuais enquanto ICMS e PIS/Cofins existirem.
- CST IBS/CBS e `cClassTrib` por produto, com vigência, porque a tabela liga o código a um artigo da LC 214. Isso é cadastro, não motor.
- Alíquotas de transição que a lei já fixou em número (0,9% e 0,1% em 2026 para regime regular; 0,05% + 0,05% de IBS em 2027–2028). A CBS de 2027 não tem número fechado: não hardcodar.
- Preservar XML, chave, protocolo e a trilha. A Focus oferece backup; o worker já tenta guardar o XML autorizado. As duas camadas não são redundância inútil: uma é o provedor, a outra é o arquivo da loja se o contrato acabar.
- Não emitir documento fiscal real nesta trilha. Homologação usa o ambiente cujo host o próprio código já separa (`homologacao.focusnfe.com.br` como exemplo de base no comentário de `fiscal-provider-adapter.ts:11`). Token segue fora do Git.

Diferença NF-e x NFC-e no código hoje: NFC-e é o default; NF-e exige destinatário identificado e continua sem UF, então interestadual não sai. A reforma não muda esse furo. Atacado com NF-e para outro estado continua bloqueado por falta de UF, com ou sem IBS.

Erros: o classificador não conhece rejeição 1115 nem CST IBS inexistente (rejeição 1020 da NT). Quando a emissão deixar de ser bloqueada no DTO, essas rejeições precisam cair em `REJEICAO_REGRA_FISCAL` por código, não por substring.

Homologação de reforma no Jinlong: **não verificada**. Nenhum POST foi feito à Focus, em homologação ou produção.

Material da Focus que não foi usado como norma: a frase do guia sobre “validação ativa em 01/04/2026”. A fonte de obrigação é o Ato Conjunto e a NT, não o blog do provedor. O guia também resume IBS como substituto imediato de ICMS e ISS; a Constituição só reduz ICMS/ISS a partir de 2029 e os extingue em 2033. Para desenho do PDV, prevalece o calendário constitucional.

---

## 7. Matriz de lacunas

Prioridade só sobe a P0 quando há obrigação já aplicável a um regime que o sistema cadastra, ou quando a fila atual está insegura. P0 da reforma e P0 operacional da GO-LIVE 02 estão separados de propósito.

| Requisito | Situação atual | Evidência | Obrigatoriedade | Prioridade | Solução recomendada |
|---|---|---|---|---|---|
| CBS no item | AUSENTE | Nenhuma ocorrência no repositório | Regime normal: grupo obrigatório na validação desde 03/08/2026. Simples: 01/01/2027 (Ato 4) e 04/01/2027 (NT) | P0 para quem emite em Lucro Presumido/Real. P0 de 01/01/2027 para o Simples, que é o default | Gravar CST IBS/CBS e `cClassTrib` no produto, congelar no snapshot, mapear para `ibs_cbs_situacao_tributaria` e `ibs_cbs_classificacao_tributaria`. Não criar motor. |
| IBS no item (UF e, em 2027, município) | AUSENTE | Idem | Idem. Alíquotas de 2026 e de 2027–2028 já estão na LC | P0 no mesmo corte | Mandar os percentuais que a lei já fixou. CBS cheia de 2027 fica de fora até a resolução do Senado. |
| NF-e / NFC-e com grupo `IBSCBS` | PARCIAL (cano sim, grupo não) | `buildFocusEmitBody` + gap bloqueante | Ato Conjunto nº 4 | P0 | Estender o DTO existente. Manter fail-closed enquanto o campo obrigatório faltar. |
| Focus NFe | PARCIAL | Adapter pronto; campos de reforma ignorados | Contrato do provedor, não uma lei | P0 junto com o grupo | Usar os nomes já publicados na página de campos. Homologar antes de produção. Não duplicar assinatura, fila da SEFAZ nem cálculo. |
| Isolamento das RPCs fiscais | PARCIAL no Git; produção não reconfirmada | `20261009220000`; GO-LIVE 02 seção 6 | Segurança do piloto, não a reforma | P0 operacional, fora do pacote CBS | Seguir a janela já escrita. Não misturar com backup nem com este PR de documentação. |
| `INSERT` direto na fila | PARCIAL (revoke no Git) | `20261007163200:12` | Idem | P0 operacional, mesma janela | Mesma transação da anterior. |
| PIS/Cofins no XML em 2026 e saída em 2027 | PARCIAL | Colunas e snapshot existem; DTO não envia (`fiscal_focus_dto.ts:185`) | Devidos até 31/12/2026; extintos em 01/01/2027 no regime regular | P1 | Primeiro destravar o grupo que a Focus já documenta para PIS/COFINS/CSOSN, com vigência até 31/12/2026. Em 2027, parar de exigir o grupo antigo só para regime regular, quando a rejeição da SEFAZ confirmar a troca. Simples: aguardar o leiaute anunciado. |
| ICMS / CSOSN / CFOP | PARCIAL | Colunas no produto; não saem no JSON | ICMS segue até 2032 | P1 | Mapear o que já está no snapshot. Não apagar em 2027. |
| NCM obrigatório de fato | PARCIAL | `ncm` nulo permitido; gap bloqueia o item se a emissão rodar | NT e SEFAZ exigem NCM no item | P1 | Travar novo produto ativo sem NCM de 8 dígitos no catálogo. Não é tela nova: o campo já está em `/admin/catalogo`. |
| Origem de importado | PARCIAL | `icms_origem` fail-closed; `origem` comercial ignorada | Origem `1` ou `2` muda ICMS e, na reforma, o enquadramento | P1 | Exigir `icms_origem` no cadastro do produto importado. Não inferir da palavra “China”. |
| Regime → CRT | PARCIAL | `regime_tributario` no snapshot; DTO não lê | A NT liga a rejeição 1115 no CRT | P1 | Traduzir Simples/MEI/Presumido/Real para CRT na hora do mapeamento, sem pedir o CRT de novo ao operador. |
| `cClassTrib` com vigência | AUSENTE | — | Tabela oficial por item a partir da obrigatoriedade do CRT | P1 | Coluna com início de vigência. Troca de tabela não regrava nota já emitida. |
| Webhook Focus | AUSENTE | Só documento de contrato | Não é obrigação legal; é confiabilidade | P1 se a emissão sair de stub | Um receptor autenticado que só reconcilia status. A Focus continua dona da transmissão. |
| Rejeições 1115 e 1020 | AUSENTE | `classifyFiscalError` não cita esses códigos | Operacional quando a validação ligar | P1 | Classificar pelo código da SEFAZ devolvido no JSON da Focus. |
| Devolução documental (`finNFe=4`) e cancelamento | PARCIAL | RPC de cancelamento; zero `finNFe` | Devolução de venda antiga tem regra própria em 2027 | P1 para atacado que devolve com NF-e; P2 para varejo que só cancela NFC-e no prazo | Não inventar nota de crédito da reforma agora. Cobrir cancelamento (já desenhado) e, no Horizonte B, devolução que referencia a chave anterior. |
| UF do destinatário | AUSENTE no snapshot | `fiscal_focus_dto.ts:281-289` | NF-e interestadual | P1 para atacado; P2 para balcão | Usar UF já existente em cliente, se o cadastro tiver, e congelar no snapshot. Sem UF, manter o bloqueio. |
| PIX no pagamento da nota | PARCIAL | `mapPagamentoToFocus` bloqueia PIX (`fiscal_focus_dto.ts:214`) | NFC-e exige forma de pagamento coerente com a venda | P1 | Gravar a modalidade que a loja usa (a Focus já separa dinâmico, estático e automático). Não chutar `17`. |
| IS | AUSENTE | — | 2027, só Anexo XVII. Validação da NT ainda futura | P2 | Lista por NCM, desligado por default. Loja de utilidades e eletrônicos não liga IS. Bebida, fumo e veículo ligam quando a lei ordinária e a NT saírem. |
| Eventos de apuração IBS/CBS | AUSENTE | — | Apuração assistida do fisco. Não há data em que o PDV de balcão tenha de registrar perecimento ou imobilização | P2 | Não emitir evento até uma operação real do cliente exigir. A Focus, se passar a oferecer o evento, é o caminho. |
| Split payment | AUSENTE | — | Manual autorizado pelo Ato 2; sem data para o varejo | P3 | Aguardar regulamentação aplicável ao recebimento do caixa. |
| Motor tributário próprio | AUSENTE — e deve continuar ausente | Comentário de omissão deliberada em `fiscal_focus_dto.ts:36` | Não há obrigação de calcular fora do autorizador | P3 | Não fazer. |
| Entrada de XML de compra com IBS/CBS | AUSENTE | Busca zerada | Crédito do regime regular em 2027 depende do documento de entrada | P2 | No importador de NF-e já existente, ler e guardar os grupos. Não criar segundo cadastro de fornecedor. |
| Histórico de configuração fiscal | AUSENTE | Regime é coluna atual, sem vigência | Nota emitida tem de ser explicável pela regra do dia | P1 | Snapshot da venda já é o histórico do documento. Falta vigência só no cadastro (produto e loja), para a próxima nota. |

---

## 8. Riscos fiscais e operacionais

**P0 — conformidade do documento**

- Loja em Lucro Presumido ou Lucro Real não consegue emitir NF-e/NFC-e com o grupo exigido desde 03/08/2026. Se `auto_enqueue_fiscal` permanecer `false`, a loja vende sem documento novo; não emite documento errado. Se alguém ligar a fila, o worker recusa com `FOCUS_DTO_INCOMPLETO` antes do POST (`FocusProvider.callProvider:592`).
- A partir de 01/01/2027 o mesmo buraco atinge o Simples, que é o default de `pdv_config.regime_tributario`.

**P0 — operação da fila, herdado da GO-LIVE 02, sem relação com alíquota**

- Enquanto `20261009220000` não estiver aplicada, o predicado morto descrito no próprio arquivo continua no banco que a GO-LIVE leu em 10/10/2026. Esta data não foi reaberta.
- `fiscal_cancelar_documento` pode continuar ausente enquanto a tela chama a RPC.
- `INSERT` de `authenticated` na fila pode continuar concedido até `20261007163200`.

**P1**

- Hardcodar CBS de 2027 antes da resolução do Senado produz nota com alíquota inventada.
- Tratar todo importado como contribuinte de IS, ou todo Simples como regime regular, erra o público.
- Somar 1% (0,9% + 0,1%) no preço de 2026 ignora a dispensa de recolhimento do art. 348, § 1º, e a nota da SEFAZ-PE. Em 2027 a CBS substitui PIS/Cofins: a margem muda, mas o percentual ainda não está fechado.
- NCM nulo e origem vazia bloqueiam o item ou, se alguém afrouxar o fail-closed, geram rejeição.
- PIX e NF-e sem UF continuam impedindo autorização mesmo depois de CBS/IBS.
- Sem webhook, autorização assíncrona de NF-e depende de consulta. O código trata HTTP 202 de NFC-e como inesperado (`FOCUS_NFCE_202_INESPERADO`).
- XML só existe depois da autorização. Documento bloqueado no DTO não deixa arquivo para a contabilidade.
- Importação de NF-e de fornecedor não lê IBS/CBS. Em 2027 o crédito do regime regular fica sem lastro dentro do sistema.

**P2**

- NT nova depois da 1.40 pode mover a data da UB12-10 de novo, como a própria série já fez. Congelar cronograma no código sem data de vigência envelhece em uma versão.
- Eventos de apuração e split payment podem tornar-se obrigatórios para casos que o varejo de balcão ainda não tem. Antecipar agora aumenta superfície sem obrigação confirmada.
- Estoque de 01/01/2027 para crédito presumido de CBS (art. 381) depende de ato ainda não localizado. Inventário fiscal feito cedo demais usa regra errada.

**P3**

- Motor próprio de IBS/CBS divergente da Focus e da SEFAZ.
- Reescrever o worker “porque a reforma mudou tudo”. O cano (fila, idempotência, XML, loja) serve. O que muda é o cadastro e o mapeamento.

Risco de regressão que a implementação futura tem de respeitar: autenticação da RPC, isolamento de loja, snapshot imutável da venda e o default `auto_enqueue_fiscal = false`. Ligar emissão em produção não faz parte de nenhum horizonte até homologação com rejeição 1115 coberta.

---

## 9. Plano de adequação

Nada abaixo é autorização para codar. A implementação começa só depois de aprovação explícita deste relatório. As duas migrations não entram neste plano: elas já têm janela própria na GO-LIVE 02 e não devem ser misturadas com backup nem com CBS/IBS.

### Horizonte A — outubro a dezembro de 2026

Obrigação já vigente para regime normal e preparação do Simples, cujo prazo documental é 01/01/2027.

| Atividade | Complexidade | Depende de | Risco | Critério de aceite | Teste |
|---|---|---|---|---|---|
| A1. Cadastro de CST IBS/CBS e `cClassTrib` no produto, com data de início, editado só em `/admin/catalogo` | Média | Tabela oficial vigente no Portal Nacional (não embutir a tabela inteira no Git se ela mudar toda semana; fixar a versão usada) | Código velho na nota nova | Produto ativo de loja que vai emitir não salva sem os dois códigos quando o regime da loja já está no cronograma | Teste do formulário e da action de catálogo. `check:entity-ssot` |
| A2. Congelar os dois códigos no snapshot da venda, ao lado de NCM/CFOP/CSOSN | Média | A1 e a função que já monta o snapshot (`20260902140300` é a última forma lida) | Regravar snapshot antigo | Venda nova leva os códigos. Venda antiga permanece com o JSON que tinha | Teste de enqueue com payload congelado |
| A3. Mapear para os nomes Focus confirmados, mantendo fail-closed | Média | A2 e uma chamada de homologação (não produção) que mostre se base/alíquota são exigidas | Inventar nome de campo | `buildFocusEmitBody` deixa de bloquear por ausência de IBS/CBS quando o snapshot tem os códigos; continua bloqueando quando não tem | Estender `fiscal_focus_dto.test.ts`. Nenhum POST real no CI |
| A4. Traduzir `regime_tributario` em comportamento: Simples não recebe alíquota-teste de 2026; Lucro Presumido/Real recebe 0,9% e 0,1% só se a homologação mostrar que a API pede alíquota | Baixa | A3 | Cobrar 1% de optante do Simples | Teste por regime. MEI explícito | Testes de mapeamento |
| A5. Destravar CSOSN/CST/PIS/COFINS já presentes no snapshot, com os nomes da mesma página de campos | Média | Confirmar os nomes na página Focus (não estão no DTO porque a sessão antiga não os confirmou) | Nota de 2026 sem PIS/Cofins, que ainda são devidos | Item de regime normal leva os grupos velhos e os novos | Teste de DTO |
| A6. Classificar rejeição 1115/1020 | Baixa | Amostra de JSON de homologação | Operador não sabe por que a nota voltou | `classifyFiscalError` devolve `REJEICAO_REGRA_FISCAL` pelo código | Teste unitário com fixture |
| NCM e `icms_origem` obrigatórios para produto que participa de emissão | Baixa | Cadastro atual | Estoque parado por produto incompleto | Lista de produtos ativos sem NCM ou sem origem, antes de ligar a fila | Teste de validação do catálogo |

Fora do Horizonte A: executar `20261009220000` e `20261007163200`, ligar `auto_enqueue_fiscal`, webhook, IS, nota de devolução, motor de preço.

### Horizonte B — janeiro de 2027

Só o que a norma já marca para 01/01/2027 ou 04/01/2027.

| Atividade | Complexidade | Depende de | Risco | Critério de aceite | Teste |
|---|---|---|---|---|---|
| B1. Liga o grupo IBS/CBS para Simples e MEI na data em que a NT e o leiaute do Simples estiverem publicados | Média | Leiaute cuja publicação em 01/09/2026 **não foi confirmada**. Se não houver leiaute, parar e registrar pendência | Aplicar regra de Lucro Real em CSOSN 400 | Cupom de Simples homologado com o CRT certo | Homologação Focus + SEFAZ de PE, um CNPJ de teste |
| B2. IBS 0,05% UF + 0,05% município; CBS com a alíquota que o Senado tiver fixado. Se a resolução não existir em 31/12/2026, não inventar número | Baixa | Resolução do Senado | Alíquota chute | Teste falha se a constante de CBS 2027 não tiver fonte | Teste com a resolução anexada no comentário do teste |
| B3. Deixar de exigir PIS/Cofins para regime regular quando a SEFAZ rejeitar o grupo antigo, e mantê-los enquanto aceitar | Média | Comportamento real do autorizador em janeiro | Tirar PIS cedo | Flag por vigência, não `if (ano >= 2027)` espalhado | Teste dos dois lados da data |
| B4. Devolução que referencia chave anterior, para atacado | Alta | Chave guardada no XML | Nota de devolução sem documento de origem | `finNFe` de devolução só com chave existente. Exceção da UB12-10 para origem anterior a 2026 | Teste de mapeamento, sem transmitir |
| B5. IS só com NCM do Anexo XVII e só quando a validação deixar de ser “implementação futura” | Média | Lei ordinária de alíquota + NT | IS em eletrônicos e bazar | Default desligado. Liga por NCM | Teste de lista |

### Horizonte C — depois, se a norma ou o cliente chegar lá

| Atividade | Quando | Complexidade |
|---|---|---|
| C1. Ler IBS/CBS no XML de entrada da importação de NF-e | Crédito do regime regular passar a ser usado dentro do sistema | Média |
| C2. Eventos de apuração (perecimento, imobilização, não ocorrência) | Uma operação real exigir | Média por evento, via Focus se a API existir |
| C3. Webhook de status | Emissão deixar de ser excepcional | Baixa, com autenticação já prevista no contrato interno |
| C4. Split payment no recebimento | Ato que obrigue o varejo. Hoje não há | Alta, e fora do fiscal puro |
| C5. Crédito presumido de estoque em 01/01/2027 | Ato do Executivo do art. 381, § 2º | Média, no estoque oficial, não no caixa |
| C6. Motor próprio | Só se a Focus não aceitar CST + `cClassTrib` + alíquotas legais e a SEFAZ exigir valor calculado que o provedor não devolve. Hoje isso **não está demonstrado** | Não iniciar |

Critério comum de aceite: documento de homologação autorizado com os grupos exigidos para aquele CRT; documento de produção antigo permanece armazenado; venda sem fiscal continua possível enquanto `auto_enqueue_fiscal` for `false`; nenhuma secret no Git; nenhuma migration da janela GO-LIVE 02 dentro do PR da reforma.

---

## 10. Estimativa de esforço

Esforço é tamanho de mudança, não calendário.

| Pacote | Tamanho | O que mexe | O que não mexe |
|---|---|---|---|
| A1–A4, cadastro + snapshot + DTO de IBS/CBS | Médio | Catálogo, função de snapshot, `fiscal_focus_dto.ts`, testes | Worker, fila, RLS, Focus, banco de produção |
| A5, religar ICMS/PIS/COFINS no DTO | Médio | O mesmo DTO, nomes confirmados na página de campos | Alíquota inventada |
| A6 e NCM/origem obrigatórios | Pequeno | Classificador e validação do catálogo | Layout novo |
| B1–B3, Simples e virada de 01/01/2027 | Médio | Vigência por regime | Segundo motor |
| B4, devolução com chave | Grande | Fluxo de devolução e referência de DF-e | Cancelamento simples, que já tem RPC |
| B5, IS condicional | Pequeno a médio | Lista de NCM e campos `is_*` | Catálogo inteiro |
| C2–C4 | Grande | Eventos, webhook, pagamento | Não começar com a reforma do cupom |
| Janela `20261009220000` + `20261007163200` | Pequeno no SQL, alto no procedimento | Só aqueles dois arquivos, no rito da GO-LIVE 02 | Este relatório não a executa |

O caminho curto é A1–A6 mais homologação de um CNPJ de teste. Isso não deixa o sistema “pronto para 2027” sozinho: B1 depende do leiaute do Simples e B2 da alíquota que ainda não foi localizada.

---

## 11. Fontes oficiais consultadas

Legislação e regulamento:

- EC 132/2023: <https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm>
- LC 214/2025 compilada: <https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm>
- LC 227/2026: <https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm>
- Decreto 12.955/2026: <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm>
- DOU do Decreto 12.955: <https://www.in.gov.br/web/dou/-/decreto-n-12.955-de-29-de-abril-de-2026-702415229>
- Decreto 13.075/2026 (lido em parte): <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13075.htm>

Administrações e notas técnicas:

- NT 2025.002-RTC v1.40 (PDF no CGIBS): <https://www.cgibs.gov.br/upload/arquivos/202606/17141803-nt-2025-002-v1-40-rtc-nf-e-ibs-cbs-is-final.pdf>
- Página de atos conjuntos da Receita Federal: <https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/legislacao/atos-conjuntos>
- Notícia da Receita sobre o Ato Conjunto nº 4, 31/07/2026: <https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-e-comite-gestor-do-ibs-publicam-o-cronograma-de-implementacao-dos-documentos-fiscais-eletronicos-da-reforma-tributaria-do-consumo>
- Informe do portal do CT-e com o art. 1º do Ato 4, inclusive o § 1º do Simples: <http://www.cte.fazenda.gov.br/portal/informe.aspx?informe=176>
- SEFAZ-PE, nota sobre base do ICMS em 2026: <https://www.sefaz.pe.gov.br/Noticias-Destaque/Paginas/NOTA-DE-ESCLARECIMENTO.aspx>
- SEFAZ-PE, documentos fiscais: <https://www.sefaz.pe.gov.br/Servicos/ICMS/Paginas/Documentos_Fiscais.aspx>
- Rádio Senado, 30/04/2026, sobre a ainda necessária fixação da alíquota de referência: <https://www12.senado.leg.br/radio/1/noticia/2026/04/30/aliquotas-de-bens-e-servicos-e-do-imposto-seletivo-devem-ser-fixadas-este-ano>

Provedor (documentação técnica, não norma):

- Guia de reforma: <https://focusnfe.com.br/guides/reforma-tributaria/>
- Campos do item da NF-e: <https://campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html>
- Referência de emissão: <https://doc.focusnfe.com.br/reference/emitir_nfe>

Fontes internas usadas só como evidência de código e da janela já decidida, não como norma:

- `docs/auditorias/GO-LIVE-02-AUTORIZACAO-JANELA-FISCAL.md`
- `docs/auditorias/GO-LIVE-02-RELATORIO.md`
- `docs/auditorias/GO-LIVE-01-CHECKLIST-FISCAL.md`

Não confirmado, e por isso fora da tabela de obrigações fechadas:

- versão da NT 2025.002 posterior à 1.40 no Portal Nacional (a listagem redirecionou);
- texto integral da Resolução CGIBS nº 06/2026;
- texto integral dos Ajustes SINIEF 49/25 e 8/26;
- resolução do Senado com o percentual da CBS de 2027;
- lei ordinária com alíquotas do IS;
- publicação real, até 11/10/2026, do leiaute de Simples datado de 01/09/2026 na notícia da Receita;
- se a SVRS/SEFAZ-PE já devolve rejeição 1115 em produção;
- se a Focus exige valor calculado além de CST e `cClassTrib`;
- estado do ledger de produção depois de 10/10/2026.

---

## 12. Recomendação GO / NO-GO

**NO-GO** para declarar o Jinlong pronto para emitir em conformidade em 2027.

**NO-GO** para iniciar implementação a partir deste arquivo, enquanto ele não for aprovado.

**NO-GO** para executar `20261009220000_fiscal_rpc_isola_loja.sql` e `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` dentro de uma frente de reforma ou de backup. As duas são **obrigatórias agora** como segurança da fila, no rito já escrito da GO-LIVE 02, e não carregam CBS/IBS.

**GO CONDICIONAL** para autorizar, em decisão separada e depois da aprovação deste relatório, somente o Horizonte A: cadastro com vigência de CST IBS/CBS e `cClassTrib`, snapshot, mapeamento para os campos que a página da Focus já nomeia, religação do grupo antigo de ICMS/PIS/COFINS que já está no snapshot, e classificação das rejeições 1115 e 1020. Sem motor tributário, sem POST em produção, sem ligar `auto_enqueue_fiscal`, sem alíquota de CBS 2027 inventada, sem IS genérico.

Condição extra por regime:

- Simples Nacional e MEI, default do produto: a obrigação documental confirmada começa em 01/01/2027. O Horizonte A existe para chegar nessa data com homologação feita. Não destacar 0,9% e 0,1% nesse regime em 2026.
- Lucro Presumido e Lucro Real: o cronograma de 03/08/2026 já passou na data de referência. Enquanto a fila estiver desligada, o caixa não emite documento irregular; também não emite documento conforme. Ligar a fila dessas lojas antes do Horizonte A homologado é NO-GO.

O caixa, o estoque e o financeiro não precisam parar por causa desta auditoria. O que não pode ser anunciado ao piloto é emissão fiscal pronta para a reforma.
