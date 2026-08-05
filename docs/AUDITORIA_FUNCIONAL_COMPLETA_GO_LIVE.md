# Auditoria Funcional Completa — Jīn Lóng ERP (Go-Live)

> **Evidência do estado funcional do sistema antes do Go-Live** (runtime, 2026-08-03).
> Escopo: auditoria **funcional, operacional e de UX** — não auditoria de código.
> Referência de mercado: **Bling** (fluxo operacional e experiência de uso).
>
> ⚠️ **Consolidação de 2026-08-05.** Este documento é **evidência**, não autoridade e não fila
> de execução. Onde ele diverge das ADRs aprovadas em 2026-08-04, **as ADRs vencem**:
> - **B2 (fiscal)** deixa de ser bloqueador de Go-Live no sentido técnico. É **FLX-02**,
>   *decisão comercial de escopo*: a infra fiscal está construída e o cron apenas desagendado
>   (mig 285). Permanece bloqueante do §8.3 do guia (pilar Empresa) se a decisão for "com fiscal".
> - **Autoridade normativa:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md`.
> - **Fila única de execução:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`.

| Campo | Valor |
|---|---|
| Data | 2026-08-03 |
| Branch | `chore/node22-alignment` |
| Método | Runtime (navegador, sessão GERENTE, base real) + leitura de código dirigida |
| Ambiente | `next dev` local · Supabase `kbabmewnahysfvlybiak` |
| Telas auditadas | 22 (CORE 12 · MAIS 5 · SISTEMA 3 + PDV entrada) |
| Base de evidência | 113 produtos · 101 saldos · 114 eventos de auditoria · 9 funcionários · 1 cliente · 0 fornecedores |
| **Veredito global** | ❌ **NÃO PRONTO** — 3 bloqueadores legais/fiscais |

## Como ler este documento

- 🔴 Crítico — impede Go-Live ou gera risco legal/financeiro
- 🟠 Alto — degrada operação diária de forma relevante
- 🟡 Médio — atrito de produtividade
- 🟢 Baixo — polimento

Toda afirmação abaixo é **verificada** (runtime ou `caminho:linha`). Onde não foi possível
confirmar, está escrito **"não verificado"** — nunca inferido como fato.

---

## 1. Sumário executivo

O sistema está **muito mais maduro em Produto/Engenharia do que em Operação**, o que
confirma o baseline de pilares (Produto 4/5, Eng 4/5, Operação 1/5).

**O que está genuinamente bom:**

- Guarda de rota: **20/20 rotas** retornam `307 → /login` sem sessão. Sem vazamento.
- Camada de permissão: **100% dos módulos** de Server Action passam por
  `assertGerenteSession()` / `assertAdminSession()` — inclusive os que parecem não ter,
  por centralizarem a guarda em `app/gerente/shared/actionHelpers.ts:65-194`.
- Catálogo é o módulo mais maduro do sistema: 9 filtros, ordenação, paginação,
  exportação CSV, importação CSV e NF-e, ações em lote.
- Worker fiscal tem **arquitetura real** (adapter HTTP, retry, erro transitório, timeout).
- Escalada de privilégio bloqueada: gerente não edita Dono/Admin (verificado em runtime).

**O que impede o Go-Live:** os três bloqueadores não são de UX — são **legais e fiscais**.
Nenhum deles exige reescrita: são lacunas de conexão e de cobertura, não de arquitetura.

---

## 2. Os 3 bloqueadores

### 🔴 B1 — Trilha de auditoria cobre apenas operação, não cadastro

**Evidência (código).** `app/admin/auditoria/actions.ts:6-22` declara explicitamente que a
tela é *somente-leitura sobre ledgers que já existem*. O tipo `AuditoriaTipo`
(`actions.ts:41-47`) tem exatamente 6 valores: `VENDA`, `CANCELAMENTO`, `AJUSTE_ESTOQUE`,
`ALERTA`, `DESCONTO`, `DEVOLUCAO`. **Nenhum de cadastro.**

**Evidência (varredura).** Dos **17 módulos** de Server Actions em `app/gerente/*/actions.ts`,
**apenas `vendas/actions.ts`** referencia auditoria. Os outros 16 — produtos, clientes,
fornecedores, funcionários, configurações, categorias, marcas, compras — **gravam no banco
sem deixar rastro algum**.

**Evidência (runtime).** Filtro "Tudo" → 114 eventos, todos operacionais. Zero eventos de
criação/alteração/exclusão de cadastro.

**Impacto.** A especificação exige auditoria completa em todos os módulos, com usuário, data,
hora, valor anterior, valor novo e módulo. Hoje é impossível responder *"quem mudou o preço
deste produto?"* ou *"quem excluiu este cliente?"*. Risco em disputa comercial e LGPD.

**Correção mínima.** Uma tabela `auditoria_cadastros` — **nome canônico adotado em 2026-08-05**,
prevalecendo sobre `produtos_auditoria` de `docs/auditoria/PLANO_VALIDACAO_F5_RUNTIME.md`, por ser
genérica e cobrir os 16 módulos a partir de um único ponto — (usuário, módulo, entidade, ação,
valor_anterior JSONB, valor_novo JSONB, ocorrido_em) + gravação no helper compartilhado
`app/gerente/shared/actionHelpers.ts` — como as guardas de sessão já são centralizadas ali,
**um único ponto cobre a maioria dos módulos de cadastro de uma vez**. Depois, incluir o novo
tipo na timeline.

### 🔴 B2 — Emissão fiscal nunca chega à SEFAZ

**Evidência.** `app/caixa/server/caixaFiscalEnqueueServer.ts:9-13`: `resolveFiscalDocType()`
retorna `'NFC_E_STUB'` como padrão. Runtime: a fila fiscal exibe `NFC_E_STUB` **PENDENTE**.
No worker, `backend/supabase/functions/fiscal-worker/fiscal_providers.ts:4-14`,
`processWithMockProvider` devolve chave sintética `NFE-MOCK-…`.

**Nuance importante — não é vaporware.** `processWithHttpProvider` (`fiscal_providers.ts:16-96`)
é uma implementação **séria**: timeout com `AbortController`, classificação de erro
transitório (5xx/429/408/504), validação de resposta, tratamento de JSON inválido. A
arquitetura está pronta; **falta plugar o provedor concreto e as credenciais**.

**Impacto.** Vender sem emitir documento fiscal é infração tributária. Bloqueia Go-Live real.

**Correção mínima.** Configurar `provider_url` + token do provedor (Focus NFe já é a
referência citada no projeto), promover `NFCE` como tipo padrão e homologar em ambiente
SEFAZ de homologação com uma venda ponta a ponta.

### 🔴 B3 — Loja não configurada (impede B2 mesmo depois de conectado)

**Evidência (runtime).** `/admin/configuracoes` → aba Loja: **Nome, CNPJ, Razão social,
Inscrição estadual, CNAE, endereço completo — todos em branco**. Série fiscal NFC-e=1, NF-e=1.

**Impacto.** Sem CNPJ e IE não existe emissão possível. B2 não pode sequer ser testado.

**Correção mínima.** Preencher e **tornar o gate de Go-Live dependente disso** — a tela
`/admin/implantacao` já existe como gate oficial com checklist persistido; este item deveria
ser um bloqueio duro nela.

---

## 3. Integridade de dados (classe de problema, não caso isolado)

### 🔴 D1 — Duplicatas por ausência de constraint

**Runtime.** Produtos: `cachorro grande`×2, `cadeira ferro`×2, `caneta`×6, `gato branco`×4,
`quadro negro`×2, `papel`×2, `regua`×2. Categorias: `galo`×2, `geladeira`×2, `mobilia`×2.

**Causa raiz (verificada).** Existe `produtos_codigo_barras_loja_unique` nas migrações — por
isso produtos *com* código de barras estão protegidos. Mas:
- produtos **sem** código de barras escapam completamente da constraint;
- **não existe nenhum índice único para categorias e marcas** (varredura em
  `backend/supabase/migrations/*.sql` não retorna nada para categoria/marca).

**Impacto.** Operador escolhe o item errado. Em Transferências o combobox mostra
6× "caneta" **indistinguíveis** — erro de estoque garantido.

**Correção mínima.** `CREATE UNIQUE INDEX … ON categorias (lower(nome), loja_id)` e idem para
marcas; para produtos sem código, unicidade por `(lower(nome), loja_id)` ou exibir SKU/ID no
combobox. Depois, script de deduplicação (merge, não delete).

### 🔴 D2 — Catálogo 113 ≠ Estoque 101

**Runtime.** Catálogo: "113 produtos encontrados". Estoque: "101 estoque".
**12 produtos não têm linha de estoque** — não aparecem para reposição e comportam-se de
forma imprevisível no PDV.

**Correção mínima.** Backfill criando `estoque` zerado para os 12 órfãos + garantir que
todo caminho de criação use a RPC atômica `criar_produto_com_estoque_inicial` (mig 270),
que já existe justamente para isso.

### 🟠 D3 — Dados de teste misturados a dados reais em produção

**Runtime.** Catálogo e Transferências expõem `QA CSV NOVO 1778…`, `SMOKE_UI_G1_…`,
`Missao4.2 Cancel…`, `[CTR:DONE] pdv`, `[TX270] com estoque`. Transferências oferece as
**lojas** `PROBE_1784431715968`, `SMOKE_1784431560866` etc. como destino selecionável.

**Impacto.** Transferir estoque real para uma loja de teste é perda contábil silenciosa.

**Correção mínima.** Expurgo dos seeds antes do Go-Live + flag `is_teste` nas lojas,
filtrada em todos os seletores.

---

## 4. Matriz de cobertura

Legenda: ✅ completo · ⚠️ parcial · ❌ ausente · — não aplicável

| Tela | CRUD | Fluxo | Regras | Auditoria | Permissões | UX | Go-Live |
|---|---|---|---|---|---|---|---|
| **CORE** |
| Visão Geral | — | ✅ | ✅ | — | ✅ | ⚠️ | ⚠️ |
| Vendas e Caixa | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Catálogo | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ |
| Categorias de Produtos | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ⚠️ |
| Marcas | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ |
| Clientes | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ⚠️ |
| Funcionários | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ |
| Estoque | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Recebimento | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| Auditoria | — | ✅ | ❌ | — | ✅ | ✅ | ❌ |
| Financeiro e Fiscal | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ | ❌ |
| Relatórios | — | ✅ | ⚠️ | — | ✅ | ✅ | ⚠️ |
| **MAIS** |
| Fornecedores | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ |
| Compras | ⚠️ | ⚠️ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| Transferências | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ❌ |
| Comissões | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| Categorias Financeiras | ✅ | ✅ | ⚠️ | ❌ | ✅ | ❌ | ⚠️ |
| **SISTEMA** |
| Configurações | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ |
| Suspensão de Vendas | ✅ | ⚠️ | ✅ | ❌ | ✅ | ❌ | ⚠️ |
| Ir para PDV | — | ✅ | — | — | ✅ | ✅ | ✅ |

**Leitura da matriz.** A coluna **Auditoria é a mais vermelha do sistema** — e é
exatamente a exigida pela especificação em todos os módulos. A coluna **Permissões é a mais
verde**: essa base está sólida e não precisa de trabalho.

---

## 5. Ranking — 10 telas mais críticas

| # | Tela | Severidade | Razão |
|---|---|---|---|
| 1 | **Financeiro e Fiscal** | 🔴 | Emissão é stub; título diz "somente leitura" mas há form "Criar título" — contradição operacional |
| 2 | **Auditoria** | 🔴 | Cobre 6 tipos operacionais; 16 de 17 módulos não geram rastro |
| 3 | **Configurações** | 🔴 | Loja em branco (CNPJ/IE) → bloqueia fiscal; sem UI para % de comissão |
| 4 | **Comissões** | 🔴 | Sem UI para configurar percentual (campo existe no BD, ver §6) |
| 5 | **Transferências** | 🔴 | Lojas de teste selecionáveis; produtos duplicados indistinguíveis; sem histórico |
| 6 | **Compras** | 🟠 | Sem cabeçalho padrão (sem título/Sair); depende de fornecedores (há 0) |
| 7 | **Estoque** | 🟠 | 12 produtos órfãos vs catálogo |
| 8 | **Recebimento** | 🟠 | 1 produto por vez — Bling recebe a nota inteira |
| 9 | **Categorias de Produtos** | 🟠 | Duplicatas sem constraint; 89 de 113 produtos sem categoria |
| 10 | **Vendas e Caixa** | 🟠 | Sem busca por ID/cliente e sem exportação |

---

## 6. Achados por tela (destaques verificados)

### Visão Geral (`/admin/dashboard`)
- 🟡 Rótulo do menu diz "Visão geral", o título da página diz "Dashboard comercial" — inconsistência de nomenclatura.
- 🟡 A tabela "Últimos pedidos" **não respeita o filtro de período** (com "Hoje" ativo e KPIs zerados, ela mostra vendas de 18–20/07).
- 🟢 KPIs mostram "↑ 0%" mesmo sem base de comparação — sinal falso de tendência.
- ✅ Alerta de estoque baixo (68) funcional e ligado à navegação.

### Vendas e Caixa (`/admin/vendas`)
- 🟠 Sem busca por ID de venda ou cliente, e **sem exportação** — o Bling tem ambos.
- 🟡 O estado vazio menciona filtro por "forma de pagamento", mas esse filtro não está na tela.
- ✅ Único módulo que grava auditoria de forma consistente.

### Catálogo (`/admin/catalogo`)
- ✅ **Melhor tela do sistema.** 9 filtros, ordenação, paginação (6 páginas), CSV import/export, NF-e, ações em lote, publicar/inativar/duplicar.
- 🔴 Nenhuma alteração de produto ou preço gera auditoria.
- 🟡 Produtos duplicados visíveis (ver D1).

### Categorias de Produtos / Marcas
- 🔴 Duplicatas por falta de índice único (D1).
- 🟠 Só 24 vínculos de categoria para 113 produtos → filtro por categoria tem pouca serventia.
- 🟡 Sem exclusão — apenas ativar/inativar (defensável, mas diverge do Bling).

### Clientes (`/admin/clientes`)
- ✅ Segurança e arquitetura exemplares: `assertGerenteSession()` nas 4 actions; separação reader/writer/updater/exclusion; campos de consentimento LGPD no tipo (`ClienteInput`).
- 🟠 Sem filtro, ordenação, paginação ou exportação (Catálogo tem tudo isso — inconsistência entre telas).
- 🟢 "1 clientes" — plural incorreto.

### Funcionários (`/admin/funcionarios`)
- ✅ Escalada de privilégio bloqueada: com sessão GERENTE, os botões de Dono/Admin vêm `disabled`.
- 🔴 **Campo `comissao_percentual` existe no banco e nas RPCs, mas não existe na UI.** Ver §7.
- 🔴 Criação/desativação de funcionário não gera auditoria.

### Estoque e Recebimento
- ✅ Estoque tem Kardex por item, ajuste, filtros, paginação e grava auditoria corretamente.
- 🔴 Divergência 113 vs 101 (D2).
- 🟠 Recebimento aceita **um produto por vez**; sem tratamento de divergência esperado×conferido além do registro, e sem aprovação. O Bling recebe a nota inteira multi-item.

### Auditoria (`/admin/auditoria`)
- 🔴 Ver B1. A tela em si é bem construída (filtros por período e tipo, KPIs, timeline) — o problema é a **cobertura da origem dos dados**, não a tela.
- 🟠 Sem exportação da trilha — auditoria que não se exporta não serve a auditor externo.

### Financeiro e Fiscal (`/admin/financeiro`)
- 🔴 Fila fiscal com `NFC_E_STUB` (B2).
- 🟠 **Contradição de UX**: cabeçalho "Histórico de títulos (somente leitura)" convivendo com formulário "Criar título" logo abaixo, e subtítulo dizendo que fiado está desabilitado.
- 🟡 Abas A receber / A pagar / Fila fiscal são navegação por link (recarrega), não abas locais.
- ✅ **Contas a Pagar é a aba mais madura do módulo** e destoa positivamente do resto:
  `registrarPagamentoAction`, `cancelarContaPagarAction` e
  `exportarContasPagarParaCSVAction` (`app/gerente/financeiro/contas-pagar/actions.ts:112,155,181`),
  todas com `assertGerenteSession()`. É a **única exportação existente no financeiro** —
  o padrão a replicar em A Receber e na trilha de auditoria.
- 🟡 Assimetria entre abas: A Pagar tem pagamento/cancelamento/CSV; A Receber é
  essencialmente consulta. Mesma tela, dois níveis de maturidade.

### Relatórios (`/admin/relatorios`)
- ✅ Conteúdo forte: Curva ABC, margem por venda, cobertura de estoque, top produtos, CSV.
- 🟠 Aviso honesto porém grave: *"Custo não é confiável (pode haver divergências de preço_custo)"* — margem e ABC ficam indicativos, não decisórios.
- 🟡 XLSX desabilitado ("em breve").
- 🟡 Cobertura de 7470 dias exibida sem tratamento de outlier.

### Fornecedores / Compras
- 🔴 **0 fornecedores** com 113 produtos: cadeia de suprimentos desconectada; Compras é inoperável e o filtro por fornecedor do Catálogo é inútil.
- 🟠 Compras **não usa o cabeçalho padrão** — sem título, sem botão Sair, sem seletor de idioma. Quebra de consistência visível.
- ✅ Ambas com CRUD, busca, filtros de status e estados vazios bem escritos.

### Transferências
- 🔴 Lojas `PROBE_*` e `SMOKE_*` selecionáveis (D3).
- 🔴 Combobox com duplicatas indistinguíveis (D1).
- 🟠 Sem histórico de transferências na tela — só o formulário.
- ✅ Bom padrão: resumo antes de confirmar, saldo projetado, botão desabilitado até validar, troca origem/destino.

### Comissões
- 🔴 Sem UI para configurar percentual (ver §7).
- ✅ `marcarComissoesPagas` **existe** em `app/gerente/comissoes/actions.ts:111` — a ação de quitação está implementada, apenas não era observável com a lista vazia.

### Categorias Financeiras
- 🟠 **Acessibilidade**: botões de ação sem rótulo — um é literalmente `"✓"` e o outro tem texto vazio. Falha WCAG e ambiguidade operacional.
- 🟠 Sem busca, sem filtro por tipo (receita/despesa) — a coluna "tipo" existe no schema mas não é exibida nem filtrável.

### Configurações / Suspensão
- 🔴 Loja em branco (B3).
- 🔴 **Estado ambíguo no kill-switch**: label diz "Vendas estão ATIVAS" com o checkbox **desmarcado**. Num controle que interrompe faturamento, ambiguidade é inaceitável.
- 🟡 Subtítulo da página de suspensão está vazio.
- ✅ Confirmado que o PDV lê o estado: `app/caixa/CaixaPageClient.tsx:777-785` consome `vendas_suspensas`.

---

## 7. Correções de alto retorno e baixo custo

Estes três casos têm **backend pronto e só falta UI** — melhor relação esforço/impacto do backlog:

| Item | O que já existe | O que falta |
|---|---|---|
| **% de comissão** | `funcionarios_meta.comissao_percentual numeric(5,2)` com CHECK 0–100; `fn_criar_funcionario` e `fn_atualizar_funcionario` **já aceitam** `p_comissao_percentual`, `p_comissao_tipo`, `p_comissao_valor` (mig `20260711143312_267`) | Campo no formulário de Funcionários |
| **Auditoria de cadastro** | Guardas de sessão já centralizadas em `app/gerente/shared/actionHelpers.ts` | Gravar o evento no mesmo helper + tabela destino |
| **Emissão fiscal** | Adapter HTTP completo com retry/timeout/classificação de erro | Credenciais + provider_url + homologação |
| **Exportação nas listagens** | Padrão pronto e funcionando em `exportarContasPagarParaCSVAction` (`app/gerente/financeiro/contas-pagar/actions.ts:181`) | Replicar em Vendas, Clientes, Auditoria |

---

## 8. Comparação com o Bling

**Onde o Jīn Lóng está melhor:**
- Curva ABC e cobertura de estoque nativas no relatório padrão.
- Bilinguismo PT/中文 em toda a interface — diferencial real para o público-alvo.
- Kardex acessível em um clique a partir da linha do produto.
- Resumo pré-confirmação em Transferências (o Bling é mais seco nesse fluxo).

**Onde o Bling está claramente melhor:**
- Recebimento multi-item por nota (aqui é um produto por vez).
- Auditoria/histórico por registro em todos os cadastros.
- Emissão fiscal funcionando de fato.
- Busca e exportação onipresentes em toda listagem.
- Ordem de compra → recebimento → contas a pagar como fluxo encadeado.

**O que não vale copiar do Bling:**
- Excesso de campos fiscais no cadastro de produto (aqui o cadastro rápido é uma boa decisão).
- Menu extenso e profundo — a divisão CORE/MAIS/SISTEMA daqui é mais legível.

---

## 9. Roadmap de correção

### Sprint 1 — Desbloqueio de Go-Live (obrigatório)
1. B3 — preencher dados da loja e transformar em gate duro em `/admin/implantacao`.
2. B2 — conectar provedor fiscal real e homologar venda ponta a ponta na SEFAZ.
3. B1 — tabela de auditoria de cadastro + gravação no helper compartilhado.
4. D3 — expurgar seeds de teste e ocultar lojas `PROBE_*`/`SMOKE_*`.
5. Suspensão — corrigir a ambiguidade label × checkbox.

**Critério de saída:** venda real emitindo NFC-e autorizada + alteração de produto visível na trilha de auditoria.

### Sprint 2 — Integridade e operação
6. D1 — índices únicos (categorias, marcas, produtos sem código) + deduplicação.
7. D2 — backfill dos 12 produtos órfãos de estoque.
8. Comissões — expor `comissao_percentual` na UI de Funcionários.
9. Cadastrar fornecedores reais e vincular aos produtos.
10. Confiabilidade de `preco_custo` (remove o disclaimer dos relatórios).
11. Compras — aplicar o cabeçalho padrão.

### Sprint 3 — Paridade com Bling e UX
12. Recebimento multi-item por nota.
13. Busca + exportação em Vendas, Clientes, Auditoria.
14. Acessibilidade dos botões em Categorias Financeiras (e varredura do mesmo padrão nas demais telas).
15. Dashboard — corrigir "Últimos pedidos" para respeitar o período; unificar nomenclatura.
16. Financeiro — resolver a contradição "somente leitura" × "criar título".

---

## 10. Limites desta auditoria

Declarados para não inflar a confiança do relatório:

- Sessão auditada: **GERENTE**. Perfis DONO, ADMIN e OPERADOR não foram percorridos —
  as diferenças de permissão observadas em Funcionários indicam que vale repetir a
  passagem com OPERADOR.
- Ambiente `next dev`: **tempos de render não são representativos** de produção. A coluna
  Performance foi deliberadamente omitida da matriz em vez de preenchida com dado fraco.
- Não foram executadas mutações destrutivas (excluir, transferir, cancelar) na base — o
  comportamento de escrita foi verificado por leitura de código, não por execução.
- Responsividade mobile e atalhos de teclado: **não verificados**.
- O PDV (`/caixa`) foi auditado apenas na entrada/acesso, conforme escopo.
