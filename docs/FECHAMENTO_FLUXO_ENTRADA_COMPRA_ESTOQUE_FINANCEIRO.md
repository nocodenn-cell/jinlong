# Fechamento da frente — Entrada → Compra → Recebimento → Estoque → Financeiro

**Status:** frente encerrada para desenvolvimento; **pendente de validação em ambiente alvo**.
**Escopo:** paridade operacional com o Bling no fluxo de entrada de mercadoria, mais o
fechamento dos três P0 de integridade encontrados no QA.
**Fora de escopo (não tocado):** PDV, produtos, clientes, relatórios, fiscal além do
necessário ao fluxo, redesign global.

> Documento canônico desta frente. `docs/MISSAO_ESTOQUE_COMPRAS_ADMIN_V2.md` é anterior e tem
> outro escopo (chrome/UI Admin V2, explicitamente *sem* alterar regras de negócio) — não foi
> substituído nem duplicado aqui.

---

## 1. O que foi implementado

### P0-1 — Origem do número da NF-e

`contas_pagar.nfe_numero` guardava o número da **duplicata**, não o da nota. A coluna nasceu
como `numero_duplicata` e foi renomeada em `108_contas_pagar_schema_e_rpc_pagamento.sql`, mas
`confirmar_importacao_nfe` continuou gravando `v_dup.numero_duplicata`. Toda parcela aparecia
na tela como "NF-e #1" / "NF-e #2".

Corrigido **na origem**: `parcela_numero` passa a guardar o número da duplicata e `nfe_numero`
recebe `importacoes_nfe.numero_nf`. O backfill **move** o dado existente em vez de descartá-lo.
Títulos sem `nfe_importacao_id` não são tocados — não há nota de onde derivar o número, e
sobrescrever seria inventar dado. O contorno temporário que existia no frontend foi removido:
leitor e tela voltaram a ler as colunas direto.

### P0-2 — Compra gera obrigação financeira

`receber_ordem_compra` creditava estoque e encerrava a ordem sem criar título. O modelo não
suportava: `ordens_compra` não tinha campo de prazo e `contas_pagar.vencimento` é `NOT NULL`.
Derivar uma data (hoje, +30 dias) seria inventar regra financeira inexistente no Jinlong —
descartado.

Regra implementada, mínima e declarada: `ordens_compra.data_vencimento` passa a existir, e o
recebimento gera **um** título quando — e somente quando — há fornecedor cadastrado **e** prazo.
Valor = `quantidade_conferida × preco_unitario`: a mesma grandeza que credita estoque credita o
financeiro. Ordem com fornecedor apenas em texto livre não gera título, porque
`contas_pagar.fornecedor_id` é `NOT NULL`.

Idempotência em duas camadas: a guarda de status já existente (`OC_STATUS_INVALIDO`) e
`contas_pagar.ordem_compra_id` com índice único parcial.

### P0-3 — Guarda de dupla entrada OC ↔ NF-e

Não existia vínculo entre ordem e nota: receber a ordem e importar a NF-e da mesma compra
creditava o estoque duas vezes, sem alerta — e, depois do P0-2, duplicaria também a dívida.

`importacoes_nfe.ordem_compra_id` (opcional) + índice único parcial declaram o vínculo. A RPC
`vincular_importacao_nfe_ordem_compra` valida loja, perfil e estado dos dois lados. Guardas em
ambas as portas, **no banco**:

- `confirmar_importacao_nfe` recusa com `IMPORT_NFE_OC_JA_RECEBIDA`;
- `receber_ordem_compra` recusa com `OC_NFE_JA_CREDITADA`;
- confirmar a nota vinculada **encerra a ordem**, de modo que a guarda de status pré-existente
  bloqueia o segundo crédito mesmo que a guarda específica fosse removida no futuro;
- o financeiro segue a nota: ordem com nota vinculada não gera título próprio.

**Limite deliberado:** sem vínculo declarado, o sistema não tem como saber que uma nota e uma
ordem são a mesma compra. Bloquear por heurística (mesmo fornecedor, valores próximos)
recusaria remessas legítimas. Por isso a proteção é o vínculo explícito, e a UI passou a
oferecê-lo na conferência.

---

## 2. Migrations

| Arquivo | Conteúdo |
|---|---|
| `backend/supabase/migrations/20260911120000_contas_pagar_numero_nfe_canonico.sql` | `parcela_numero`; backfill; `confirmar_importacao_nfe` grava número da nota |
| `backend/supabase/migrations/20260911130000_receber_ordem_compra_gera_contas_pagar.sql` | `ordens_compra.data_vencimento`; `contas_pagar.ordem_compra_id` + índice único; `receber_ordem_compra` gera título |
| `backend/supabase/migrations/20260911140000_vinculo_oc_nfe_guarda_dupla_entrada.sql` | `importacoes_nfe.ordem_compra_id` + índice único; `vincular_importacao_nfe_ordem_compra`; guardas nas duas RPCs |

As três trazem bloco `DO $verify$` que falha se a correção não estiver no lugar — incluindo
verificações de que as invariantes anteriores (conferência obrigatória, número da nota) **não
foram perdidas** nas reescritas das funções.

**Propriedade verificada:** as três são idempotentes (`ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, FK sob `DO` guardado). O backfill do
P0-1 também é: numa segunda execução, `COALESCE(parcela_numero, nfe_numero)` preserva o valor já
correto.

---

## 3. Testes SQL transacionais

Todos em `BEGIN … ROLLBACK`, com dados sintéticos — não persistem nada.

| Arquivo | Asserções | Resultado |
|---|---|---|
| `backend/scripts/contas-pagar-numero-nfe-canonico.test.sql` | 3 | 0 falhas |
| `backend/scripts/receber-ordem-compra-gera-ap.test.sql` | 5 | 0 falhas |
| `backend/scripts/vinculo-oc-nfe-dupla-entrada.test.sql` | 5 | 0 falhas |

**Total: 13 asserções, 0 falhas** (última execução confirmada no encerramento da frente).

O que provam, em resumo:

- conferência continua obrigatória antes de qualquer crédito;
- 2 títulos com `nfe_numero` = número da nota e `parcela_numero` 1/2, com valores e vencimentos da nota;
- pedido de 10 / conferido 8 gera título de **R$ 100,00** (8 × 12,50), não R$ 125,00;
- recebimento repetido recusado, com título único por ordem;
- ordem sem prazo não gera título **e não é bloqueada**;
- fornecedor só em texto livre não vira obrigação financeira;
- ordem recebida antes ⇒ NF-e recusada; NF-e confirmada antes ⇒ ordem recusada, com **kardex de crédito único (+4, não +8)**;
- índice único impede segunda nota na mesma ordem.

---

## 4. Invariantes preservadas

Nenhuma foi alterada. Confirmadas por asserção nos testes acima e/ou pelos blocos `DO $verify$`:

- conferência física obrigatória antes do crédito de estoque;
- quantidade sempre vinda de `quantidade_conferida`, nunca de parâmetro do cliente;
- idempotência de recebimento e de importação;
- proteção contra reimportação da mesma chave de NF-e;
- kardex imutável (trigger que bloqueia `UPDATE`/`DELETE`);
- isolamento por loja e checagem de perfil nas RPCs;
- funções canônicas mantidas — corpos copiados verbatim, alterando apenas o trecho necessário.

---

## 5. QA operacional realizado

Executado autenticado contra o stack Supabase **local**, com o app apontado para ele.

**Caminho NF-e:** Entrada → Importar XML → pré-visualização com parcelas → vínculo com ordem
oferecido na conferência → conferência item a item → confirmação → título exibido como
**"NF-e #23577 · parcela 1"**, R$ 378,00, venc. 20/11/2026 → retorno à nota pela rota canônica
`?id=`.

**Caminho Compra:** ordem real recebida via RPC → título **"Ordem de compra 50467B28"**,
R$ 600,00 (15 × 40,00), venc. 28/12/2026, `PENDENTE` — verificado no banco e visível na tela.

**Caminho sem nota:** Recebimento com origem, quantidade esperada e conferida, consequência
declarada antes do submit.

---

## 6. QA visual / mobile realizado

Varredura autenticada em **1280 px** e **390 px** sobre: Estoque, Entrada, Importar NF-e,
Compras (filtrada), Recebimento, Contas a Pagar — mais o formulário de nova ordem e o detalhe de
ordem recebida.

**Resultado final: 0 px de overflow horizontal nas 12 combinações** (6 telas × desktop/mobile),
medido após o fim do esqueleto de carregamento. Sem erros de console.

O ciclo foi repetido três vezes (varredura → correção → nova varredura). Uma medição inicial de
706 px em Contas a Pagar era **artefato do harness** (medição durante o carregamento), não
defeito de produto; o harness passou a esperar `aria-busy` sair antes de medir.

---

## 7. Defeitos encontrados e corrigidos

### Rodada de QA do fluxo

| # | Defeito | Causa | Correção |
|---|---|---|---|
| 1 | Contas a Pagar não identificava a nota ("NF-e #1") | coluna renomeada sem ajustar quem escreve | P0-1 na origem |
| 2 | Vencimento exibido um dia antes (15/10 vira 14/10) | `new Date('YYYY-MM-DD')` é UTC, render em fuso negativo | `dataLocal()` interpretando data pura como local |
| 3 | Compras era beco sem saída | aba no hub, mas página sem `EstoqueHubNav` | hub renderizado + atalho já filtrado (`?status=EM_TRANSITO`) |
| 4 | Overflow horizontal (22 px / 21 px) | grade KPI ad-hoc em vez da classe do design system | `admin-v2-grid-kpi` |
| 5 | Pós-confirmação ambíguo | área de upload seguia no topo com o XML colado | oculta quando a entrada conclui |
| 6 | Link "NF-e #" quebrado | apontava para rota legada que descarta a query | `hrefImportacaoNfe()` + `?id=` lido e validado na página |

### Rodada de Engineer Loop

| # | Defeito | Causa | Correção |
|---|---|---|---|
| 7 | Financeiro abria "quebrado" | `/admin/financeiro` sem `loading.tsx` | esqueleto de cabeçalho, abas, KPIs e linhas |
| 8 | Atalhos passavam por rota legada | `financeiroContasPagar` é `redirect()` | `hrefFinanceiroPagar()` nos 3 pontos do fluxo |
| 9 | Jargão de dev na tela do operador | "atualizado **pela RPC**", "**regra de negócio na base**" | reescrito em linguagem de operador, pt e zh |
| 10 | Rótulo enganoso no estado vazio | botão "Confirmar entrada" apenas rolava até o formulário | "Registrar a primeira" |
| 11 | 3º caminho sem declaração de consequência | só NF-e e Compra declaravam | `ConsequenciaOperacao` no Recebimento |
| 12 | Importar NF-e não orientava em repouso | tela abria só com drop zone | bloco "Como funciona" com os 3 passos e efeitos |
| 13 | Ações fora da tela no mobile | colunas sem prioridade responsiva | `hidden sm:table-cell` + coluna de identificação `sticky` |
| 14 | Banner em tempo futuro para ordem já recebida | mesmo título nos dois estados | "O que aconteceu" no estado `RECEBIDA` |
| 15 | Prazo invisível no detalhe da ordem | campo que decide o título não era exibido | linha "Vencimento" nos metadados |

Além disso, o texto do painel de Contas a Pagar ("vêm só da importação de NF-e — sem lançamento
manual") **deixou de ser verdade com o P0-2** e foi corrigido nos dois idiomas.

---

## 8. Evidências

**Duráveis (versionadas):** as 3 migrations, os 3 testes SQL, os testes de front
(`efeitosConfirmacaoNfe.test.ts`, `estoqueHubEntrada.test.ts`, `payableReader.test.ts`
atualizado) e o E2E versionado `pdv-importados/e2e/entrada-mercadoria.spec.ts`.

**Efêmeras:** os screenshots do QA visual foram gerados em `pdv-importados/test-results/`, que é
**gitignored** (`.gitignore:28`) e é limpo pelo Playwright a cada execução. Foram revisados
durante a sessão — cada correção da tabela acima foi confirmada visualmente — mas **não
constituem artefato permanente**. No encerramento restaram apenas
`test-results/qa-loop/oc-form-vencimento.png` e `oc-detalhe-recebida.png`. A varredura é
reproduzível re-executando o harness contra o stack local.

---

## 9. Testes finais

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` (tsconfig completo) | OK |
| ESLint (`app`, `components`, `lib`) | OK |
| `route-guard` | OK — 28 rotas `/admin` com página |
| `check-types-drift` | OK — tipos em dia com o banco (6.597 linhas) |
| Vitest (suíte completa) | **1.328 passando**; 2 arquivos falhando (ver abaixo) |
| Testes SQL transacionais | OK — 13 asserções, 0 falhas |
| `next build` | OK |
| Paridade i18n pt/zh | OK — 0 assimetrias |

**Sobre as 2 falhas de Vitest:** `app/admin/produtos/productUpdater.semRpc.integracao.test.ts` e
`produtosFiscalEdicao.integration.test.ts`. São **pré-existentes e ambientais**, fora desta
frente: as chaves em `.env.local` apontam para o projeto Supabase **remoto** enquanto o stack
local está no ar (`insert produto: No suitable key or wrong key type`). Não foram introduzidas
por esta frente e não tocam o fluxo de entrada.

---

## 10. Gaps P1 — não implementados por decisão de negócio

### P1-4 — Estorno de entrada de NF-e

Investigado; **não improvisado**. O que já existe: kardex imutável (estorno tem de ser
lançamento oposto — padrão correto), `historico_precos_produto.preco_custo_anterior` (o custo
pré-importação é recuperável), `cancelar_conta_pagar` e `estornar_pagamento_contas_pagar`.

O que falta, e são decisões de negócio:

1. `importacoes_nfe.status` tem `CHECK (status IN ('EM_CONFERENCIA','CONCLUIDA'))` — não há estado para entrada estornada;
2. `estoque.quantidade_atual >= 0` — se a mercadoria já foi vendida, o estorno viola a constraint: bloquear, permitir parcial ou permitir negativo é decisão;
3. `chave_acesso` é única — decidir se estornar libera a chave para reimportar a nota corrigida;
4. falta a RPC `estornar_importacao_nfe` amarrando: recusar se algum título gerado já tem pagamento, cancelar títulos, lançar kardex oposto, restaurar custo do histórico e reabrir a ordem vinculada.

### P1-5 — Lançamento manual de contas a pagar

A condição ("somente se o modelo existente já permitir") **não está satisfeita**: dos campos
requeridos, `categoria` e auditoria (`criado_por`) **não existem** em `contas_pagar`. É aditivo e
pequeno — duas colunas (`categoria_id` FK para `categorias_financeiras`, que já existe, e
`criado_por`) mais uma RPC com validação — mas é escrita financeira nova.

---

## 11. BLOQUEADORES GO-LIVE

Somente itens com evidência. **Atualizado em 2026-09-11** após a validação do pipeline oficial —
ver [`PIPELINE_MIGRATIONS_VALIDACAO_2026-09-11.md`](./PIPELINE_MIGRATIONS_VALIDACAO_2026-09-11.md).

1. **Migrations não aplicadas no ambiente alvo.** As três existem apenas no repositório e no
   stack local. Nenhum ambiente remoto as recebeu.

2. **Backfill do P0-1 precisa ser validado no ambiente alvo.** Os títulos já existentes em
   produção continuam com o número da duplicata em `nfe_numero`. Até o backfill rodar lá, a tela
   de Contas a Pagar exibirá "NF-e #1" para as parcelas históricas. Idempotência **comprovada**
   (hash de `contas_pagar` inalterado após reaplicar), mas a contagem de linhas afetadas deve ser
   conferida no alvo (no local foram 12).

3. ~~**As migrations nunca passaram pelo caminho de apply do CLI.**~~ **RESOLVIDO em 2026-09-11.**
   `migration up --local` aplicou as três e `db reset --local` reconstruiu do zero; ledger local
   ficou em 369 = 369 arquivos, drift zero.

4. **O alvo tem uma migration que o repositório não tem: `20260910114603`.** Aplicada via SQL
   Editor do Supabase Studio em 10/09. Enquanto não for reconciliada, o CLI **recusa** o apply
   oficial contra o alvo. Conteúdo já representado no repositório por
   `20260909200000_cancelar_venda_saldo_caixa_insuficiente.sql` (`origin/main`, commit `8bc56764`)
   — definições byte-idênticas. Risco de dados: nulo; é divergência de identificador.

5. **O alvo está 17 migrations atrás, fora desta frente.** Um `migration up` no alvo aplicaria
   **20** migrations, não 3 — as 17 restantes são de fiscal e pagamentos (02–03/09) e exigem
   janela de validação e rollback próprios. **Não aplicar automaticamente.**

6. **Risco estrutural:** 36 dos 349 registros do ledger remoto carregam assinatura do Studio
   (`NOTIFY pgrst`). Aplicar DDL pelo Dashboard é prática recorrente — sem política que impeça,
   o drift reaparece.

**Pré-requisito operacional:** o `main` local está 1 commit atrás de `origin/main`
(`6ab4c673` → `8bc56764`). Sem `git pull`, o `migration up` local volta a ser recusado.

---

## 12. PENDÊNCIAS NÃO BLOQUEADORAS

- **E2E versionado não executável localmente.** `e2e/entrada-mercadoria.spec.ts` usa o helper
  padrão de login; os usuários de fixture do seed local (`*.seed@local.test`) **não têm senha**
  (`seed.sql` não define `encrypted_password`, e o `seed-dev-users.mjs` citado nos comentários do
  seed não existe no repositório). O QA desta frente usou magic link da service role no stack
  local. O spec deve rodar no CI, onde as credenciais existem — mas está **não validado**.
- **P1-4 estorno** — ver seção 10.
- **P1-5 lançamento manual de AP** — ver seção 10.
- **Fornecedor "opcional" na ordem de compra.** O campo está rotulado como opcional, mas é ele
  que decide se o título nasce. O banner de consequência explica no momento do recebimento;
  tornar explícito já no formulário exigiria decidir se fornecedor passa a ser obrigatório.
- **Sticky no mobile.** Ao rolar a tabela de Estoque, o cabeçalho da coluna fixada cobre
  parcialmente o vizinho ("SALDO" aparece como "LDO"). Inerente a coluna fixa; todos os valores
  permanecem legíveis.

---

## 13. PRÓXIMA ETAPA — PRÉ GO-LIVE

Passos de validação. **Nenhum implementado nesta tarefa.**

1. **Aplicar/verificar migrations no ambiente alvo** — aplicar as três pelo caminho oficial do
   CLI e conferir o ledger `supabase_migrations.schema_migrations`; confirmar que os blocos
   `DO $verify$` passaram.
2. **Executar smoke SQL pós-migration** — rodar os três testes transacionais contra o alvo (são
   `ROLLBACK`, não persistem) e conferir o backfill do P0-1: contagem de linhas afetadas e
   ausência de título com `nfe_numero` divergente de `importacoes_nfe.numero_nf`.
3. **Validar fluxos críticos no ambiente alvo** — NF-e (parcelas, conferência, confirmação,
   título com número da nota, retorno pela `?id=`) e Compra (prazo, conferência, recebimento,
   título) com dados reais; confirmar o crédito único quando ordem e nota estiverem vinculadas.
4. **Validar RLS / isolamento por loja** — que as novas colunas e a RPC de vínculo respeitam o
   escopo de loja e o perfil, inclusive para `DONO`/`ADMIN` multi-loja.
5. **Validar E2E versionado no CI** — destravar `entrada-mercadoria.spec.ts` (provisionar senha
   das fixtures ou ajustar o harness) e confirmar que passa no pipeline.
6. **Validar observabilidade** — que erros das novas RPCs (`IMPORT_NFE_OC_JA_RECEBIDA`,
   `OC_NFE_JA_CREDITADA`, `VINCULO_OC_NFE_*`) chegam ao Sentry com mensagem tratada, e não como
   erro cru de banco.
7. **Validar impressão / navegador no equipamento do piloto** — as telas do fluxo no hardware e
   navegador reais do cliente, incluindo a viewport efetivamente usada.
8. **Somente depois declarar GO / NO-GO.**
