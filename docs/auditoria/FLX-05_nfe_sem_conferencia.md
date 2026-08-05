# FLX-05 — `importar_nfe_transacao` credita estoque e gera contas a pagar sem etapa de conferência

**Data:** 2026-08-05
**Status:** **FECHADO.** Migration `296_nfe_conferencia.sql` aplicada em produção em **2026-08-05 21:33:57 UTC** (versão `20260805213357` em `supabase_migrations.schema_migrations`), verificada no efeito pelo próprio bloco `DO $verify$` da migration, e provada com smoke real pós-aplicação (sem rollback) — seção 11. Camada de app/UI implementada e testada localmente (typecheck, lint, 1082 testes verdes nos dois pacotes) antes da aplicação.
**Prioridade:** **P0** (bloqueio de integridade estoque/financeiro antes de qualquer uso real do caminho NF-e)
**Relacionados:** FLX-04 (`docs/auditoria/v2/01_tickets_confirmados.md`), Onda B (`docs/ONDA_B_RECEBIMENTO.md`)
**Pacote:** 4.5 — Integridade de Entrada de Mercadoria (continuação direta do FLX-04, deliberadamente à frente do Pacote 5/Financeiro — decisão de prioridade de 2026-08-05)
**Migration desenhada:** [`backend/supabase/migrations/296_nfe_conferencia.sql`](../../backend/supabase/migrations/296_nfe_conferencia.sql)
**Smoke test:** [`backend/supabase/scripts/smoke_flx05_nfe_conferencia.sql`](../../backend/supabase/scripts/smoke_flx05_nfe_conferencia.sql) — já rodado com sucesso em produção dentro de `BEGIN...ROLLBACK` (seção 6)

---

## Decisão de arquitetura (2026-08-05)

**Conferência NATIVA em tabelas próprias de `importacoes_nfe` (opção A). Não usar `remessas`.**

Mesma linha do FLX-04: terceira implementação da máquina de estados (OC nativa, remessa-na-migration, agora NF-e nativa), aceitando a duplicação de padrão em troca de não reabrir a Onda B — que está marcada como aplicada no histórico do Supabase mas cujo efeito real não existe em produção (seção 3, achado desta investigação). Rotear NF-e por `remessas` exigiria primeiro reparar essa migration divergente: escopo maior e risco maior do que este ticket cobre. Detalhe completo da decisão e o porquê no cabeçalho de `296_nfe_conferencia.sql`.

---

## Resumo executivo

`importar_nfe_transacao` é o único dos três caminhos de entrada de mercadoria (NF-e, remessa, ordem de compra) que credita estoque **e** gera título financeiro a partir de um valor declarado (XML da nota) sem qualquer contagem física intermediária. `remessas` tem `registrar_conferencia_remessa` (na migration, ver ressalva abaixo) e `ordens_compra` ganhou o gate nativo no FLX-04. NF-e ficou de fora dos dois.

**Correção em relação à minha primeira leitura nesta conversa:** eu havia dito que NF-e era "o caminho vivo em produção". Não é. Consultei o banco de produção (projeto `jinlong`, `kbabmewnahysfvlybiak`) diretamente:

| Tabela | Linhas em produção |
|---|---|
| `fornecedores` | **0** |
| `importacoes_nfe` | **0** |
| `contas_pagar` | **0** |
| `ordens_compra` / `ordens_compra_itens` | **0** |
| `remessas` / `remessa_itens` | **2** (ambas `CONCLUIDA`, `quantidade_conferida = quantidade_esperada`) |

`importar_nfe_transacao` sempre faz `INSERT ... INTO fornecedores` como primeiro efeito; `fornecedores = 0` prova, sem ambiguidade, que a RPC nunca rodou em produção. O caminho que realmente moveu estoque no piloto foi `ENTRADA_AJUSTE` (20 de 22 movimentos de entrada reais, todos com `motivo=ACERTO_INVENTARIO | obs=Estoque inicial no cadastro de produto` — cadastro de produto, não recebimento disfarçado) e `ENTRADA_REMESSA_LOJA` (2, ambos batendo).

Isso muda a severidade, não a decisão: `feature_flags.importacao_xml.enabled = true`, a tela (`/gerente/estoque/importar-nfe`) está completa e publicada, a action (`executarImportacaoNfe`) e o adapter (`InventoryMovementWriter.importNfe`) já chamam a RPC em produção. Não há nenhum obstáculo entre um gerente e a primeira chamada real. **É um buraco fechável antes de ser pisado, não um vazamento em andamento.** Isso é uma janela, não uma isenção — o ticket continua P0 porque corrigir agora é gratuito (zero dado a migrar) e corrigir depois exige lidar com contas a pagar já geradas de importações divergentes.

---

## 1. Mapa de chamadores

**Correção sobre a base do código:** o corpo realmente vigente de `importar_nfe_transacao` em produção **não é o do arquivo `104_contas_pagar_nfe.sql`** — é o de `294_fornecedores_multi_tenant.sql`, que reescreveu a função por completo (fluxo VINCULAR/CRIAR vindo da tela, De-Para em `vinculos_fornecedor_produto`, produto novo nasce `status_publicacao='DRAFT'`/`ativo=false`, contadores `v_novos`/`v_vinculados`). Só descobri isso ao confirmar `pg_get_functiondef` em produção — os arquivos de migration por si só não bastam para saber qual versão está ativa (mesma lição do achado da seção 3). `296_nfe_conferencia.sql` foi escrita em cima do corpo de 294, não do de 104.

```
ImportarNfePageClient.tsx (UI)
  → previewImportacaoNfe()          [app/gerente/estoque/importar-nfe/actions.ts]
      resolve produto por De-Para (vinculos_fornecedor_produto) ou GTIN
      NÃO toca em estoque/financeiro — é só leitura
  → executarImportacaoNfe()         [mesma actions.ts]
      → InventoryMovementWriter.importNfe()   [app/admin/estoque/inventoryMovementWriter.ts:320]
          → supabase.rpc('importar_nfe_transacao', {...})
              [corpo vigente: 294_fornecedores_multi_tenant.sql; reescrita nesta
              investigação em 296_nfe_conferencia.sql — assinatura preservada]
```

Dentro da própria RPC (transação única, sem chamada externa), no corpo vigente (294):
- `INSERT ... fornecedores` (upsert por `loja_id, cnpj` — TB-05 já corrigiu isso)
- `INSERT ... importacoes_nfe` (idempotência por `chave_acesso`)
- por item: resolve produto por `produto_id_destino` (VINCULAR explícito) → De-Para → GTIN → `ref_fornecedor`; cria produto (`DRAFT`) se não resolvido e `acao≠VINCULAR`; grava `vinculos_fornecedor_produto`; `UPDATE estoque.quantidade_atual += q_com * fator`; `INSERT movimentos_estoque_log` (`tipo_codigo = 'ENTRADA_NFE'`); se produto já existia, `UPDATE produtos SET preco_custo = ...`
- por duplicata: `INSERT contas_pagar` com `valor := dup->>'valor'` (valor de face da NF-e) — **usando nomes de coluna que não existem mais** (seção 3.1, achado novo)

Não há segunda RPC, trigger, ou job que faça conferência antes ou depois. Não existe `conferirNfe` no `MovementWriterRpc` (compare com `conferirOc`, que o FLX-04 adicionou — `inventoryMovementWriter.ts:35-40`). Nenhum outro arquivo do repositório cria estoque ou `contas_pagar` a partir de NF-e — busquei por `contas_pagar`, `importacoes_nfe` e `importar_nfe_transacao` em todo o código e migrations; os únicos pontos de escrita são os listados acima.

`ContasPagarListClient.tsx` e `payableReader.ts` **leem** `contas_pagar` (incluindo o vínculo `nfe_importacao_id`) mas não escrevem a partir de NF-e.

**Novos chamadores introduzidos por esta correção** (ainda não implementados — só a RPC existe, desenhada; camada de app é o próximo passo, seção 7):
- `registrar_conferencia_nfe(p_importacao_id, p_itens)` — precisará de um método novo no `InventoryMovementWriter` (`registrarConferenciaNfe`, espelhando `registrarConferenciaRemessa`) e um comando novo em `shared-core/src/inventory/contracts.ts`.
- `confirmar_importacao_nfe(p_importacao_id)` — idem (`confirmarImportacaoNfe`).
- A tela (`ImportarNfePageClient.tsx`) precisa de um jeito de o operador informar a quantidade **conferida** por linha — hoje só existe `q_com` (somente leitura, do XML) e `fator` (editável). Sem esse campo, não há como chamar `registrar_conferencia_nfe` com um valor que não seja o próprio declarado da nota, o que anularia o propósito do ticket.

---

## 2. Autoridade de quantidade hoje — comparação com FLX-04 e com Onda B

| | Autoridade da quantidade creditada | Autoridade do valor a pagar | Gate de conferência |
|---|---|---|---|
| **`ordens_compra` (pós FLX-04)** | `ordens_compra_itens.quantidade_conferida`, gravada por `registrar_conferencia_ordem_compra` | — (OC não gera `contas_pagar` diretamente) | ✅ `receber_ordem_compra` recusa (`OC_CONFERENCIA_PENDENTE`) se algum item não foi conferido |
| **`remessas`** | *ver ressalva na seção 3* — na migration, `remessa_itens.quantidade_conferida` via `registrar_conferencia_remessa` | — (remessa não gera `contas_pagar`) | ✅ na migration, `confirmar_remessa_entrada` recusa sem conferência completa |
| **`importar_nfe_transacao`** | `q_com` (quantidade comercial do XML) × `fator` (conversão de unidade, também do payload do cliente) | `dup->>'valor'` (valor de face da duplicata do XML) | ❌ nenhum |

`v_q_entrada := v_q_com * v_fator` é calculado e usado no mesmo `LOOP`, na mesma chamada, sem round-trip para o operador confirmar contagem física. O `fator` é editável na tela (`ImportarNfePageClient.tsx:257-274`, campo numérico por linha) — ou seja, mesmo a conversão de unidade que determina a quantidade final de estoque é um input de formulário sem segunda validação.

**Invariante que o FLX-04 estabeleceu e que este ticket estende:** estoque só nasce de contagem física, nunca de quantidade declarada por documento (nota, pedido) ou digitada em um único passo. NF-e é hoje a única porta que viola isso.

---

## 3. Achado colateral — Onda B está registrada como aplicada mas não está no banco

Ao comparar as duas opções de design (gate nativo em `importacoes_nfe`/item, análogo ao FLX-04, vs. reaproveitar a máquina de estados de `remessas`), fui checar se `remessas` realmente tem o que `docs/ONDA_B_RECEBIMENTO.md` descreve. Não tem.

**O que a migration `20260801120000_recebimento_conferencia_explicita.sql` declara:**
- Colunas em `remessas`: `origem_tipo`, `origem_ref`, `conferido_por`, `conferido_em`, `divergencia_motivo`
- Função nova `registrar_conferencia_remessa(uuid, jsonb, text)`
- `confirmar_remessa_entrada` reescrita para exigir status `CONFERIDO`/`DIVERGENTE`

**O que existe de fato no banco de produção** (`information_schema.columns` e `pg_proc`, consultados agora):
- `remessas` tem: `id, loja_id, origem_descricao, status, observacao, anexo_url, created_by, created_at, finalized_at` — **sem** `origem_tipo`, `origem_ref`, `conferido_por`, `conferido_em`, `divergencia_motivo`
- `registrar_conferencia_remessa` **não existe** em `pg_proc`
- `confirmar_remessa_entrada(uuid)` existe, mas isso não prova qual versão do corpo está ativa

**E ao mesmo tempo:** `supabase_migrations.schema_migrations` tem a linha `20260801120000 | recebimento_conferencia_explicita` — **marcada como aplicada**.

Explicação mais provável: `backend/docs/auditoria/supabase-migration-repair-20260802/README.md` documenta um `supabase migration repair` rodado em 2026-08-02 (um dia depois da Onda B) para reconciliar o histórico local com o remoto. O README lista os objetos que foram *validados* nesse reparo (`vendas_em_espera`, `vendas_pagamentos`, `contas_receber`, três RPCs de venda) — a Onda B não está nessa lista. `migration repair` marca uma versão como aplicada no histórico **sem executar o SQL**; é plausível que a Onda B tenha sido marcada como já aplicada durante a reconciliação sem que seu conteúdo tivesse de fato rodado antes.

**Consequência prática para este ticket e para qualquer trabalho futuro:**
1. A nota de fechamento do FLX-04 ("`remessas` não tem `origem_tipo` nem `origem_id`... `registrar_conferencia_remessa` não existe em produção") **está correta contra o banco real**, mesmo estando errada contra o arquivo de migration e contra `docs/ONDA_B_RECEBIMENTO.md`. Não é um erro de investigação do FLX-04 — é o histórico de migrations mentindo.
2. **Reaproveitar `remessas` para NF-e (opção B abaixo) não é reuso de algo pronto** — exige primeiro reaplicar (ou recriar) o conteúdo da Onda B, que hoje só existe no arquivo.
3. **`supabase_migrations.schema_migrations` não é fonte confiável de "isso está em produção"** para qualquer migration tocada pelo reparo de 2026-08-02 ou aplicada por volta dessa data. Vale auditar se há outras migrations na mesma situação antes de assumir schema a partir do histórico — sinalizo mas não investiguei além da Onda B, que é a única relevante para esta decisão.

Isso não é escopo do FLX-05 em si, mas foi o que forçou a decisão de design da seção 4 — reaproveitar `remessas` deixou de ser "reuso de algo pronto".

### 3.1. Segundo achado colateral — o corpo vigente (294) já nasceu quebrado para duplicatas

Ao reconstruir `importar_nfe_transacao` a partir do corpo realmente vigente (seção 1), tentei provar a migration em produção dentro de uma transação com `ROLLBACK` (mesma técnica do FLX-04) e o **meu primeiro rascunho falhou** — não pelo desenho do FLX-05, mas porque copiei a estrutura de duplicatas do arquivo `104` (nomes de coluna antigos) em vez do corpo vigente. Ao corrigir para usar o corpo de 294, achei que 294 estava certo — mas 294 **também** está errado, só que de um jeito que nunca disparou:

`294_fornecedores_multi_tenant.sql` insere duplicatas assim:
```sql
INSERT INTO public.contas_pagar (
  importacao_nfe_id, fornecedor_id, loja_id, numero_duplicata, data_vencimento, valor, status
) VALUES (..., 'pendente')
```

Mas a migration `108_contas_pagar_schema_e_rpc_pagamento.sql` (muito anterior) renomeou essas colunas: `importacao_nfe_id → nfe_importacao_id`, `numero_duplicata → nfe_numero`, `data_vencimento → vencimento`, `valor → valor_total`, e o `CHECK` de status exige maiúsculo (`contas_pagar_status_check`, confirmado via `pg_get_constraintdef` — só aceita `PENDENTE/PARCIAL/PAGO/ATRASADO/CANCELADO`). **O `INSERT` de 294 teria falhado com `column "numero_duplicata" does not exist` (ou equivalente) na primeira NF-e importada com duplicata** — um terceiro bug dormente, independente do FLX-05, que só não apareceu porque `contas_pagar` também tem 0 linhas.

Quem escreveu 294 (comentário: *"Corpo idêntico ao vigente em produção, exceto essa linha e loja_id"*) claramente copiou de uma versão anterior a 108 sem checar o schema atual de `contas_pagar` — mesma classe de erro que eu mesma quase repeti copiando de 104. **Padrão a observar:** este projeto já teve duas migrations seguidas (294 e quase esta) errarem por assumir "corpo vigente" a partir de um arquivo em vez de `pg_get_functiondef` direto no banco. Vale considerar isso como prática obrigatória antes de qualquer `CREATE OR REPLACE FUNCTION` em RPC que já existe — não fica registrado como ticket aqui por ser uma prática, não um bug, mas está registrado para a próxima pessoa que mexer numa RPC "vigente".

`296_nfe_conferencia.sql` corrige por construção: duplicatas agora vão para `importacoes_nfe_duplicatas` (tabela nova, nomes de coluna próprios) e só viram `contas_pagar` em `confirmar_importacao_nfe`, já com os nomes corretos e status maiúsculo — provado na seção 6.

---

## 4. Decisão de design — implementada

Ver "Decisão de arquitetura" no topo do documento e o cabeçalho de `296_nfe_conferencia.sql` para o raciocínio completo. Resumo: **opção A (nativa)**, não opção B (`remessas`), porque a opção B dependia de reparar a Onda B primeiro — escopo maior que este ticket, e decisão que cabe a outra conversa, não a esta correção pontual.

O que a migration implementa (detalhe completo no arquivo):
- `importacoes_nfe` ganha `status` (`EM_CONFERENCIA`/`CONCLUIDA`) — mesmo papel de `ordens_compra.status`.
- `importacoes_nfe_itens` — uma linha por item do XML, com `quantidade_nfe` (declarado), `quantidade_conferida` (`NULL` até conferir), `status_conferencia`, auditoria (`conferido_por`/`conferido_em`).
- `importacoes_nfe_duplicatas` — duplicatas do XML ficam pendentes aqui, não em `contas_pagar`, até a confirmação.
- `importar_nfe_transacao` (reescrita, assinatura idêntica): mantém 100% da lógica de catálogo (VINCULAR/CRIAR, De-Para, produto rascunho, backfill NCM/GTIN) — só para de creditar estoque, atualizar custo e gerar `contas_pagar`.
- `registrar_conferencia_nfe(p_importacao_id, p_itens)` — grava contagem física por item, deriva `CONFERIDO`/`DIVERGENTE` (mesma regra do FLX-04: bate = CONFERIDO, qualquer diferença = DIVERGENTE, ambos aceitos).
- `confirmar_importacao_nfe(p_importacao_id)` — tudo-ou-nada (recusa se algum item ainda `EM_CONFERENCIA`), credita **quantidade_conferida**, atualiza custo, gera `contas_pagar`, marca `CONCLUIDA`. Idempotente: segunda chamada é recusada.

---

## 5. Impacto técnico

- **Estoque:** `estoque.quantidade_atual` creditado com `q_com * fator` sem verificação. Divergência entre o que a nota diz e o que fisicamente chegou (falta, avaria, item trocado) não é detectável — o sistema já teria contabilizado a mercadoria como recebida.
- **Financeiro:** `contas_pagar.valor_total` gravado com `dup->>'valor'` — valor de face da duplicata da NF-e, desacoplado de qualquer verificação de recebimento. Uma nota com quantidade divergente gera uma dívida integral e não-condicional ao fornecedor, mesmo que a mercadoria não tenha chegado inteira.
- **Kardex:** `movimentos_estoque_log` grava `ENTRADA_NFE` com a quantidade creditada — a trilha de auditoria registra a entrada como fato consumado, mesma classe de problema que a Onda B corrigiu para `confirmar_remessa_entrada` (COALESCE) e que o FLX-04 corrigiu para OC.
- **Idempotência:** preservada (`UNIQUE (chave_acesso)` em `importacoes_nfe`) — não é o problema aqui.
- **Superfície de teste:** `inventoryMovementWriter.test.ts`, `p0-roteiro-operacional.matrix.test.ts` e `consolidacao-post-audit.test.ts` fixam que as três portas passam pelo `InventoryMovementWriter` e que `ContasPagarListClient` referencia `ROUTES.admin.importNfe` — qualquer correção precisa manter esses contratos verdes.

---

## 6. Migration e prova funcional

**Migration completa:** [`296_nfe_conferencia.sql`](../../backend/supabase/migrations/296_nfe_conferencia.sql) — tabelas, RPCs, grants e um bloco `DO $verify$` (mesmo padrão da 295/FLX-04) que checa estrutura, gate e grants dentro da própria transação de aplicação.

**Prova funcional em produção (2026-08-05, transação com `ROLLBACK`, zero dado residual)** — mesma técnica descrita no fechamento do FLX-04. Rodei a migration inteira + o smoke test (`smoke_flx05_nfe_conferencia.sql`) dentro de `BEGIN...ROLLBACK` contra o projeto `jinlong`:

| Cenário pedido | Resultado |
|---|---|
| Sem conferência → confirmar bloqueia | ✅ `IMPORT_NFE_CONFERENCIA_PENDENTE` |
| Divergente → registra | ✅ item A (nota=10, conferido=7) gravou `status_conferencia=DIVERGENTE`, `divergencia_obs`, `conferido_por`, `conferido_em`; item B (nota=20, conferido=20) gravou `CONFERIDO` |
| Conferido → credita a quantidade **aceita** | ✅ `estoque.quantidade_atual` do produto A foi a **7** (o conferido), não 10 (o da nota); produto B foi 20 |
| (extra) `contas_pagar` só nasce na confirmação | ✅ inexistente até `confirmar_importacao_nfe`; depois, 1 linha, `valor_total=150.00`, `status='PENDENTE'` |
| (extra) segunda confirmação é idempotente-recusada | ✅ `IMPORT_NFE_STATUS_INVALIDO` |
| (extra) kardex reflete o conferido | ✅ `movimentos_estoque_log` tem `quantidade_delta=7` para o produto A, não 10 |
| Pós-`ROLLBACK`: `fornecedores`/`importacoes_nfe`/`contas_pagar`/produtos de teste | ✅ todos em 0 — zero traço em produção |

A primeira tentativa desta prova **falhou** — não por causa do desenho do FLX-05, mas porque eu tinha reconstruído `importar_nfe_transacao` a partir do arquivo `104` em vez do corpo realmente vigente (`294`). O erro (`ON CONFLICT (cnpj)` não casa com o índice único real, que é `(loja_id, cnpj)` desde o TB-05) apontou exatamente para esse engano — corrigido antes de eu reportar a prova acima como válida. Registrado na seção 1 e no cabeçalho da migration.

---

## 7. Riscos de quebrar operação existente

- **Dado em produção: risco zero, confirmado.** Zero linhas em `fornecedores`, `importacoes_nfe`, `contas_pagar` antes e depois da prova — não há backfill, não há migração de dado histórico, não há risco de dupla-contagem em cima de importações já feitas.
- **Contrato externo da RPC preservado.** Assinatura de `importar_nfe_transacao` inalterada (8 args); o retorno ganha de volta `produtos_novos`/`produtos_vinculados` (que o corpo de 294 já produzia e que o writer já lê — eu tinha derrubado esses campos no primeiro rascunho por copiar de 104; corrigido).
- **Camada de app/UI: implementada.** Escopo completo, nesta ordem:
  1. `InventoryMovementWriter`: métodos `registrarConferenciaNfe`/`confirmarImportacaoNfe` (espelhando `registrarConferenciaRemessa`/`confirmRemessaEntrada` — portas separadas, não encadeadas automaticamente pelo writer, mesma decisão de design da remessa) + tipos em `shared-core/src/inventory/contracts.ts` (`RegistrarConferenciaNfeCommand/Result`, `ConfirmarImportacaoNfeCommand/Result`) + `ImportNfeResult` ganhou `importacaoId` tipado (antes só vinha em `raw: unknown`).
  2. Novo código de erro `NFE_IMPORTACAO_ID_REQUIRED` em `errorCodes.ts`, com entradas em `inventoryMessages.ts`, `estoqueInicialCadastro.ts` (segundo `Record<InventoryErrorCode,...>` que existia no repo) e `pt.json`/`zh.json`.
  3. `app/gerente/estoque/importar-nfe/actions.ts`: `obterItensConferenciaNfe` (leitura direta de `importacoes_nfe_itens`, RLS cobre o escopo) e `confirmarConferenciaImportacaoNfe` (chama `registrarConferenciaNfe` → `confirmarImportacaoNfe` em sequência, curto-circuitando se a conferência falhar — mesmo padrão de `criarRemessaConferencia`).
  4. `ImportarNfePageClient.tsx`: **campo novo de "quantidade conferida" por linha**, pré-preenchido com a quantidade da nota e editável, numa seção de conferência que aparece depois do "Importar". Botão "Confirmar entrada" separado — dois momentos de UI (importar, depois conferir-e-confirmar), cada um com um clique, igual ao raciocínio da Onda B para `remessas`. Isso É uma UI nova (diferente do FLX-04, que não precisou porque OC já tinha esse campo) — necessária porque sem ela não existe como o operador declarar uma contagem física distinta da nota.
- **Testes automatizados — todos verdes.** SQL: `smoke_flx05_nfe_conferencia.sql` (seção 6), reexecutável dentro de `BEGIN...ROLLBACK`. TypeScript: 6 testes novos em `inventoryMovementWriter.test.ts` (mirroring os 2 do FLX-04 — expõe `importacaoId`, delega `registrarConferenciaNfe`/`confirmarImportacaoNfe`, propaga falha, rejeita lista vazia sem chamar RPC) + ajuste no stub de `inventory.spec.ts` (shared-core). **Suíte completa: 891 testes (pdv-importados) + 191 (shared-core) = 1082 verdes; `tsc --noEmit` e `eslint` limpos nos dois pacotes.**
- **Feature flag:** `importacao_xml` continua `enabled=true`. Com a camada de app pronta, o fluxo completo (importar → conferir → confirmar) já está implementado e testado — só falta a migration no banco para o caminho funcionar de ponta a ponta.

---

## 8. Critério de aceite

Entrada de estoque e criação de `contas_pagar` por NF-e exigem uma transição de conferência explícita, com `conferido_por`/`conferido_em` registrados; tentativa de confirmar sem conferência completa levanta exceção; quantidade creditada e valor a pagar refletem o **conferido**, nunca o declarado na nota; nenhuma mudança de contrato externo (`ImportNfeCommand`) sem necessidade. **Banco: atendido e provado (seção 6). App/UI: implementado e testado (seção 7).**

## 9. Status e próximos passos

1. ~~Decisão de arquitetura~~ — feita: opção A (nativa), ver topo do documento.
2. ~~Desenho e prova da migration~~ — feito: `296_nfe_conferencia.sql` + `smoke_flx05_nfe_conferencia.sql`, provados em produção com `ROLLBACK`.
3. ~~Camada de app~~ — feita: writer, contracts, actions, campo de conferência na tela. 1082 testes verdes, typecheck e lint limpos (seção 7).
4. ~~Aplicar a migration~~ — feito: 2026-08-05 21:33:57 UTC, ver seção 11.
5. ~~Smoke real pós-aplicação~~ — feito, sem rollback, ver seção 11.3.
6. **Commit do código** (writer, contracts, actions, UI, testes, i18n, documentação) — próximo passo, ver seção 12.

## 11. Aplicação em produção e smoke real pós-migration (2026-08-05)

### 11.1. Validação somente leitura, imediatamente antes de aplicar

- `list_migrations`: histórico idêntico ao verificado antes — última entrada `20260805193920 | 295_ordem_compra_conferencia`, nenhuma migration nova, nenhum drift desde a última checagem.
- `pg_get_functiondef('importar_nfe_transacao(...)')`: **byte-a-byte igual** ao corpo capturado anteriormente (versão de 294, com o bug pré-108 de nomes de coluna intacto) — confirma que nada mudou a função entre a investigação e a aplicação.
- Contagens: `fornecedores=0`, `importacoes_nfe=0`, `contas_pagar=0`, `ordens_compra=0` — inalteradas.
- `importacoes_nfe_itens`, `importacoes_nfe_duplicatas`, `registrar_conferencia_nfe`, `confirmar_importacao_nfe`: confirmados **inexistentes** antes de aplicar — sem aplicação parcial anterior, sem colisão de nome.

Nenhum drift inesperado. Seguiu para aplicação.

### 11.2. Aplicação

`apply_migration` no projeto `jinlong` (`kbabmewnahysfvlybiak`), nome `296_nfe_conferencia`, conteúdo idêntico ao arquivo. Sucesso — o próprio bloco `DO $verify$` dentro da migration (que aborta a transação inteira se qualquer checagem estrutural falhar) passou sem exceção.

- **Aplicada em:** 2026-08-05 21:33:57 UTC
- **Versão registrada:** `20260805213357` — `supabase_migrations.schema_migrations`
- **Confirmado pós-aplicação:** `registrar_conferencia_nfe` e `confirmar_importacao_nfe` existem em `pg_proc`.

### 11.3. Smoke real pós-aplicação — SEM rollback, dados reais commitados

Diferente da prova da seção 6 (transação com `ROLLBACK`), esta rodada usa `importar_nfe_transacao` → `registrar_conferencia_nfe` → `confirmar_importacao_nfe` de verdade, com `auth.uid()` simulado para um usuário real da matriz (`Dono E2E`, `d45e3cf3-…`, loja `a0000001-…`, uma identidade de teste já existente no ambiente do piloto — não uma conta de cliente real). Cada passo abaixo é uma chamada separada e commitada; nenhuma delas foi revertida.

| # | Passo | Evidência real |
|---|---|---|
| 1 | `importar_nfe_transacao` (2 itens, 1 duplicata) | `{"ok":true,"importacao_id":"43c2caac-…","itens_processados":2,"produtos_novos":2,"produtos_vinculados":0}` |
| 2 | Estado logo após importar | 2 linhas em `importacoes_nfe_itens`, ambas `status_conferencia=EM_CONFERENCIA`, `quantidade_nfe` 10 e 20; `estoque.quantidade_atual=0` nos dois produtos; `contas_pagar` com 0 linhas para esta importação |
| 3 | **Confirmar SEM conferência** | `ERROR: P0001: IMPORT_NFE_CONFERENCIA_PENDENTE` — bloqueado |
| 4 | `registrar_conferencia_nfe`: item A nota=10/conferido=7 (com motivo), item B nota=20/conferido=20 | `{"ok":true,"itens_conferidos":1,"itens_divergentes":1}` |
| 5 | **Divergência registrada — auditoria completa** | item A: `status_conferencia=DIVERGENTE`, `divergencia_obs="smoke real: 3 unidades nao chegaram"`, `conferido_por=d45e3cf3-…`, `conferido_em=2026-08-05 21:35:51 UTC`. Item B: `CONFERIDO`, mesma auditoria |
| 6 | `confirmar_importacao_nfe` (agora com tudo conferido) | Sucesso — `importacoes_nfe.status` vira `CONCLUIDA` |
| 7 | **Estoque — quantidade ACEITA, não a da nota** | Produto A: `quantidade_atual=7` (nota dizia 10); Produto B: `quantidade_atual=20`. `preco_custo` atualizado (5.00 / 2.50) |
| 8 | **Kardex** | `movimentos_estoque_log`: `tipo_codigo=ENTRADA_NFE`, `quantidade_delta=7` para A (observação: *"Importação NF-e … (conferido, divergente da nota)"*) e `20` para B — nunca 10 |
| 9 | **Contas a pagar** | 1 linha, `valor_total=150.00`, `status=PENDENTE`, `vencimento=2026-09-04`, vinculada a `nfe_importacao_id` e `fornecedor_id` corretos — só existe a partir daqui, não desde o passo 1 |
| 10 | **Segunda confirmação** | `ERROR: P0001: IMPORT_NFE_STATUS_INVALIDO` — bloqueada, idempotência confirmada |

**Todos os cinco critérios pedidos (bloqueio, divergência, conferência com quantidade aceita ≠ nota, kardex, contas_pagar) mais auditoria e idempotência — confirmados com dados reais, não simulados.**

**Nota de limpeza:** este smoke real deixou dados de teste visíveis no piloto — fornecedor "Fornecedor Smoke FLX-05 (pos-aplicacao)", produtos "Produto Smoke FLX05 Real A/B" (catálogo, com estoque 7 e 20), e uma conta a pagar de R$150,00. Mesma convenção já usada em `smoke_item4_integracao_recebimento_financeiro_fiscal.sql` (que também não faz cleanup). Diferente daquele caso, este piloto tem um cliente real operando — sinalizo aqui em vez de decidir sozinha: se quiser, eu removo essas linhas (produto, fornecedor, estoque, contas_pagar; o registro de kardex por convenção deste projeto é imutável — ver migration 127 — então esse ficaria mesmo com o resto limpo).

## 12. Arquivos tocados nesta investigação

**Banco:** `backend/supabase/migrations/296_nfe_conferencia.sql`, `backend/supabase/scripts/smoke_flx05_nfe_conferencia.sql`

**Domínio (shared-core):** `src/inventory/contracts.ts`, `src/inventory/index.ts`, `src/inventory/errorCodes.ts`, `src/inventory/inventory.spec.ts`

**App:** `app/admin/estoque/inventoryMovementWriter.ts`, `app/admin/estoque/inventoryMovementWriter.test.ts`, `app/admin/estoque/inventoryMessages.ts`, `app/gerente/estoque/importar-nfe/actions.ts`, `app/gerente/estoque/importar-nfe/ImportarNfePageClient.tsx`, `lib/gerente/estoqueInicialCadastro.ts`, `src/lib/i18n/pt.json`, `src/lib/i18n/zh.json`

**Documentação:** este arquivo.
