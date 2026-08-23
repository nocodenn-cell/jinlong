# Auditoria de internacionalizacao

## Conclusao

Portugues: **PARCIAL**. Mandarim: **REQUER VALIDACAO NATIVA**. Ingles: **NAO PRONTO**. Europa/outros mercados: **REQUER DESACOPLAMENTO**.

## Cobertura comprovada

- `pt.json` e `zh.json` possuem 2.516 valores folha cada e conjuntos de chaves identicos.
- O web tem provider, fallback, cookie/locale bridge e testes de alternancia.
- `htmlLang` mapeia `pt -> pt-BR` e `zh -> zh-CN`.
- Ha fonte Noto Serif SC e testes E2E pontuais para zh.
- A busca amostral encontrou 50 arquivos TS/TSX com texto JSX literal nas areas admin, componentes e desktop; isso nao inclui todos os textos em props/objetos.

## Inventario representativo de lacunas

| Tela/componente | Situacao | Evidencia |
|---|---|---|
| Desktop PDV | Hardcode PT e BRL; sem catalogo zh/en | `pdv-local/src/App.tsx:377,465-470,639-643,848-919` |
| Auditoria admin | estados vazio/detalhes hardcoded PT | `AuditoriaTimeline.tsx:118,240,249` |
| Sidebar admin v2 | grupos e “Mais” hardcoded | `SidebarNav.tsx:90-117` |
| Financeiro fiscal | titulo, erro, loading, timeline hardcoded | `DocumentoFiscalDetailSheet.tsx:87-134` |
| Financeiro receber | placeholders hardcoded | `FinanceiroReceberExtras.tsx:141,167` |
| Categorias financeiras | empty state hardcoded | `CategoriasFinanceirasContent.tsx:219-220` |
| Legal | documento inteiro PT, sem versao por locale | `components/legal/DocumentoLegal.tsx:58-279` |
| Fiscal produto | termos fiscais brasileiros literais | `FiscalSection.tsx:55-84`; requer contexto por pais, nao mera traducao |

## Achados

### I18N-001 - cobertura estrutural nao cobre strings hardcoded

- Severidade/status: **P1 - FALHA**; bloqueia: **sim para mandarim consistente/expansao**.
- Impacto: mistura de idiomas e testes frágeis; mensagens de erro/empty state escapam do catalogo.
- Correcao: extrator/linter CI, namespaces por dominio e migracao inventariada por tela.
- Regressao/aceite: zero literal de UI fora de allowlist; smoke PT/ZH por rota; chaves sem fallback inesperado.
- Dependencias/esforco/dono: frontend + traducao; **G**.

### I18N-002 - desktop e portugues/BRL-only

- Severidade/status: **P1 - COMPROVADO**; bloqueia: **sim**.
- Evidencia: `pdv-local/index.html:2` fixa `pt-BR`; `App.tsx:850-919` usa `R$` e `toLocaleString('pt-BR')`; mensagens sao literais PT.
- Impacto: PDV offline diverge do web, impossibilita mandarim/ingles e pode calcular/exibir moeda errada.
- Correcao/aceite: runtime compartilhado de locale, moeda, timezone e catalogo; persistencia por usuario/loja; golden receipts por locale.
- Dependencias/esforco/dono: desktop + shared-core + produto; **G**.

### I18N-003 - ingles exige mudanca de banco e tipos

- Severidade/status: **P1 - COMPROVADO**; bloqueia: **sim para ingles**.
- Evidencia: `normalizeIdioma.ts:1` limita `pt|zh`; migrations 072/074 e policies limitam `idioma_preferido` a esses valores; `catalogAdapter.ts:23` omite catalogo en de proposito.
- Impacto: adicionar JSON nao basta; persistencia rejeita ingles e fallbacks mascaram cobertura.
- Correcao/aceite: locale BCP-47 extensivel, migration controlada, catalogo `en-US`, negociacao server/client e testes de hydration.
- Dependencias/esforco/dono: banco + frontend + traducao; **G**.

### I18N-004 - fallback de en-US retorna portugues

- Severidade/status: **P2 - COMPROVADO**; bloqueia: expansao.
- Evidencia: `catalogAdapter.test.ts:32-40` exige `locale=en-US` mas `resolvedLocale=pt-BR`.
- Impacto: UI reporta locale ingles com texto portugues, criando mistura e risco de formatacao incorreta.
- Correcao/aceite: locale efetivo acompanha catalogo efetivo ou catalogo EN completo; nenhum fallback silencioso em producao.
- Dependencias/esforco/dono: frontend; **M**.

### I18N-005 - configuracao regional esta acoplada ao Brasil

- Severidade/status: **P2 - PARCIAL**; bloqueia expansao.
- Evidencia: helpers `BRL`, defaults `America/Sao_Paulo`, fiscal/CEP/documentos brasileiros e desktop `R$`; moeda nao aparece como configuracao independente comprovada por loja.
- Impacto: idioma chines pode continuar exigindo BRL no Brasil, enquanto ingles pode usar varias moedas; inferencia por locale e incorreta.
- Correcao/aceite: separar `ui_locale`, `currency`, `timezone`, `country`, `fiscal_region`, formatos de endereco/telefone e metodo de pagamento; testes combinatorios.
- Dependencias/esforco/dono: arquitetura + produto + financeiro; **G**.

## Qualidade linguistica e visual

Nao houve avaliacao por falante nativo nem browser visual nesta execucao. Antes do aceite, testar 320/768/1024/1440 px, zoom 200%, teclado/leitor de tela, impressao A4/termica, CJK, strings inglesas +30%, tabelas estreitas e alternancia de idioma com formulario sujo. Termos de caixa, sangria, suprimento, NF-e, ICMS, contas e comissoes exigem glossario aprovado; termos fiscais brasileiros nao devem ser “traduzidos” como se fossem regra chinesa/europeia.

Croacia/UE e sul/sudeste asiatico exigem descoberta propria de VAT, faturacao, pagamentos, endereco, consentimento, retencao e residencia de dados. **Ingles nao significa prontidao europeia; LGPD nao substitui GDPR.**

