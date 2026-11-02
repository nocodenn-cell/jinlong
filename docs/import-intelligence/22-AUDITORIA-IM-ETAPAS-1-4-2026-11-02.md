# 22 — Auditoria somente leitura e planejamento do custo de importação (2026-11-02)

| Campo | Valor |
|---|---|
| Data | 2026-11-02 |
| Base | branch `claude/jinlong-import-costs-audit-555ab3`, worktree `jinlong-nfe-import-audit-909b7b` (HEAD herdado do `main` na criação) |
| Método | leitura de código, migrations, testes e docs; execução do verificador Node de referência; pesquisa web para o benchmark |
| Não realizado | migration, deploy, merge, consulta a produção ou Supabase remoto, instalação de dependências (ver §8) |
| Relação com o material pedido | "IM-01 / IM-02" não aparece no repositório. O equivalente existente é `docs/audits/PLANO_CONSOLIDADO_IMPORTACAO_IM-F01_F05_2026-10-29.md` (IM-F01..F05) e `docs/import-intelligence/05-PLANO-DE-SPRINTS.md` (S0..S6). O "modelo SQL" e o "motor TypeScript" de referência foram tomados como as migrations `20261021130000`–`20261021210000` e `shared-core/src/import/`. |

Legenda: **EXISTE** (implementado e com evidência de código); **PARCIAL** (implementado com lacuna relevante); **AUSENTE** (não implementado); **DEFEITO** (implementado, mas incorreto ou inseguro na forma atual). Itens marcados *não reverificado* vieram de `00-AUDITORIA.md` (2026-10-10) e não foram reconfirmados nesta rodada.

---

## 1. Resumo executivo

1. O módulo de importação já existe em código, bem mais do que o `00-AUDITORIA.md` de 2026-10-10 descreve: motor puro em `shared-core/src/import/` (landed cost, rateio, decimal, tributação, valor aduaneiro, conciliação de obrigações, precificação, aprovação), 14 tabelas `import_*` com RLS, RPCs de operação/apuração/aprovação e UI em `pdv-importados/app/admin/importacoes/`. São 13 tabelas `import_*` mais 3 de parâmetros e catálogo tributário.
2. **O módulo não toca o caminho operacional.** Nenhuma migration `import_*` referencia `estoque`, `produtos.preco_custo`, `contas_pagar` ou `movimentos_estoque_log` (contagem de `contas_pagar` = 0 nas 5 migrations do módulo). Por isso ele não gera custo publicado, estoque, AP nem preço. Isso já está registrado em `PROXIMOS_PASSOS.md` (P1), e é coerente com a política "manter desligado".
3. **Os defeitos que bloqueiam custo confiável continuam abertos no caminho NF-e:** parser perde zeros à esquerda (`nfeParser.ts:97`, `parseTagValue: true`); não lê totais, frete, seguro, desconto ou tributos; `preco_custo` e `custo_unitario` são `numeric(10,2)`; `preco_custo_medio` não tem escritor; a conta a pagar não é conciliada com a nota; `ON DELETE CASCADE` em `contas_pagar.nfe_importacao_id`; regra automática `preço = custo × 1,5` ainda na migration `20261005173427` (linha 174).
4. **O motor de cálculo é o ponto mais maduro:** aritmética em `bigint` escalado, rateio por maior resto com resíduo registrado, conservação exigida antes de qualquer saída, status de recuperabilidade obrigatório. O verificador de referência em Node roda sem dependências e **falha 0/21 no Windows por causa de finais de linha** (`core.autocrlf=true`), não por divergência de cálculo (ver §3.1, D-07).
5. **A ausência mais relevante é o caminho de publicação:** não existe RPC que grave custo landed em `produtos`, nem fluxo de aprovação de preço de varejo/atacado com efeito no cadastro. Isso é correto por ora, mas exige decidir a precedência entre custo NF-e e custo landed antes de publicar (ver §6).
6. **Recomendação:** não ligar o módulo a estoque ou preço ainda. Seguir a sequência S1b → S2 → S3 → S4 → S5 já prevista, com quatro correções antes de qualquer publicação (§7): idempotência de apuração, unicidade de despesas por documento de origem, recálculo confirmado no servidor, e câmbio por fatura/data.

---

## 2. Auditoria do estado atual (Etapa 1)

### 2.1 Matriz por módulo pedido

| Módulo | Situação | Evidência | Lacuna / defeito |
|---|---|---|---|
| Importação de NF-e (entrada) | PARCIAL | `pdv-importados/lib/nfe/nfeParser.ts:97-98`; `backend/supabase/migrations/20261005173427_entrada_manual_fornecedor_sem_cnpj.sql` | **DEFEITO** `nfeParser.ts:97` (`parseTagValue: true`): `cProd "0012"` vira `12`, `cEAN` perde zeros (A-03, reconfirmado). Não lê `ICMSTot`, `vFrete`, `vSeg`, `vOutro`, `vDesc` nem `det/imposto` (grep sem resultado, reconfirmado; A-11). |
| Conciliação de produtos (NF-e × cadastro) | PARCIAL | `docs/audits/SPRINT_NFE_CORRETIVA_ESTADO_2026-10-30.md`; `20261030120000_nfe_conciliacao_duplicatas.sql` | Depende do `cProd` correto (acima). Vínculo fornecedor-produto (`211_vinculos_fornecedor_produto_depara`) herda o defeito. |
| Compras / ordens de compra | EXISTE | `20260918100000_oc_recebimento_parcial.sql` (recebimento parcial, saldo por item, replay por chave, `FOR UPDATE`) | Recebimento não tem custo, por desenho. Não alimenta landed. |
| Fornecedores | PARCIAL | `20260805190920_294_fornecedores_multi_tenant.sql:15` (`UNIQUE (loja_id, cnpj)`) | Fornecedor por loja, não por empresa (A-15). |
| Contas a pagar | PARCIAL | `108_contas_pagar_schema_e_rpc_pagamento.sql:16` (`ON DELETE CASCADE`); `20261007163100` (AP por duplicata) | **DEFEITO** duplicatas não são conciliadas com o total da nota (A-02). Reproduzido em homologação em 2026-10-30 (`PROXIMOS_PASSOS.md`, P0). Nenhuma ligação `import_*` → `contas_pagar` (0 ocorrências). |
| Recebimento e movimentação | EXISTE (kardex) / PARCIAL (vínculo) | `034_remessas_movimentos_transferencias.sql:47-57`; `20260903190000` (kardex imutável) | Kardex sem valor, sem FK para NF-e/OC (A-09, não reverificado). |
| Custo médio | AUSENTE | `20260816135000_reconcilia_produtos_codigo_interno.sql` (criação); busca por `preco_custo_medio\s*=` retorna 0 escritores | **DEFEITO** coluna exibida como custo médio e sempre sem produtor (A-07). |
| Histórico de preços | EXISTE | `20260709184734_259_historico_precos_produto.sql` (trigger `AFTER UPDATE` em `produtos`, inclui `preco_custo_anterior/novo`) | Não guarda origem (NF-e, apuração). |
| Precificação varejo / atacado | PARCIAL | `shared-core/src/import/precificacao.ts` (simulação, `arredondarComercial`, faixas de atacado); `atualizar_preco_varejo_produto` persiste sem aprovação (`PROXIMOS_PASSOS.md` P1) | **DEFEITO** regra `preco_varejo = ROUND(custo × 1,5, 2)` em `20261005173427:174`, sem registro de origem nem aprovação (A-10). Sem fluxo de aprovação persistido. |
| Auditoria | EXISTE | `import_auditoria`, `import_aprovacoes` com trigger imutável (`130100`, linhas 252–265) | Não verificado se `importacoes_nfe` tem trilha equivalente. |
| Isolamento multiempresa | PARCIAL | `20261019120000_multiempresa_fase1_base.sql` (`empresas`); `empresa_id` em 26 migrations; `fp_*` (`130000`, `130100:274-304`) | `empresa_id` nas tabelas `import_*` é `NOT NULL` (`130100:31-48`), mas a RLS mantém DONO global (A-08). Falta `tenant_guard` nas `import_*` (`PROXIMOS_PASSOS.md` P1). Helper legado `LOJA_MATRIZ_ID` ainda em código (A-19, não reverificado). |

### 2.2 Módulo de importação internacional (`import_*`)

| Componente | Situação | Evidência |
|---|---|---|
| Operação (processo) com máquina de estados `RASCUNHO → APROVADA / CANCELADA`, unicidade `(empresa_id, referencia)` | EXISTE | `130100:31-48`; `import_mudar_estado` (`:787-817`) |
| Reabrir (somente DONO) e cancelar (DONO/GERENTE), motivo ≥ 10 caracteres, sem DELETE | EXISTE | `:787-817`; trigger `trg_historico_imutavel` (`:265`) |
| Itens com fator de conversão, `quantidade_estoque > 0`, pesos e volume | EXISTE | `130100:61-76` |
| Câmbio por operação e moeda | PARCIAL | `import_cambios` com `UNIQUE (operacao_id, moeda)` (`:54-58`): **uma taxa por moeda por operação**. Não há taxa por fatura, por data, nem diferença cambial. |
| Despesas e descontos | PARCIAL | `import_despesas` (`:80-97`) com `documento_id` opcional e **sem unicidade** por documento de origem (risco de duplicar frete). `import_descontos` (`:98-111`). |
| Tributos com `status_recuperabilidade` (`PENDENTE_VALIDACAO`, `RECUPERAVEL_*`, `NAO_RECUPERAVEL`, `GLOSADO`) e regra versionada | EXISTE | `130100:113-135`; `shared-core/src/import/landedCost.ts:414-458` |
| Documentos com `sha256` e caminho com prefixo `empresa/operacao` | EXISTE | `130100:136-158`; storage privado (`:840-871`) |
| Motor landed cost (função pura, `bigint` escalado) | EXISTE | `shared-core/src/import/landedCost.ts` (534 linhas), `decimal.ts` |
| Rateio por maior resto, HALF_UP, resíduo registrado | EXISTE | `shared-core/src/import/rateio.ts:43`; `landedCost.ts:474-475`, `:195` (exige `MAIOR_RESTO_ITEM_ID_ASC`) |
| Conservação antes de saída (`LANDED_CONSERVACAO_FALHOU`) | EXISTE | `landedCost.ts` (§6.1 do doc 01); `import_registrar_apuracao` exige `status = OK` para aprovar |
| Versionamento de apuração | EXISTE | `UNIQUE (operacao_id, versao)` (`:176`); concorrência por `versao_dados` com `FOR UPDATE` (`:677-716`) |
| **Idempotência de apuração** | **DEFEITO** | `import_registrar_apuracao` (`:677-749`) não procura apuração com o mesmo `entrada_sha256`. Reenvio idêntico cria versão N+1 com o mesmo conteúdo. |
| Aprovação de apuração | PARCIAL | `import_aprovar_apuracao` (`:749-786` e redefinida em `20261021130200_import_hub_campos.sql:214-255`). Só service_role. **Ponto de confiança:** `p_verificacao->>'recalculo_confere'` é um booleano informado pelo chamador, não recalculado no banco. |
| Publicação de custo em `produtos.preco_custo` | AUSENTE | Nenhuma `import_*` escreve em `produtos` (grep). Equivale ao `CustoPublisher` da proposta original. |
| Aprovação de preço de varejo/atacado a partir do custo landed | AUSENTE | Só simulação em TypeScript (`precificacao.ts`). |
| Integração com estoque, kardex e OC/NF-e | AUSENTE | Por desenho, `PROXIMOS_PASSOS.md` (P1). |
| Integração com contas a pagar | AUSENTE | 0 referências a `contas_pagar`. |
| Estorno / retificação de custo publicado | AUSENTE | Nada a estornar ainda. Reprocessamento por nova apuração: EXISTE. |
| Câmbio PTAX (BCB) | AUSENTE | `pdv-importados/lib/import/hub/inteligenciaVa.test.ts:12` usa `fonte: 'PTAX'` como rótulo de fixture. Não há cliente da API. |
| Catálogo tributário | PARCIAL / **DEFEITO** | `shared-core/src/import/tributacao.ts:49-73` embute `CATALOGO_TRIBUTARIO_DEMO` ("demo-2026-10-21") e `CATALOGO_TRIBUTARIO_PESQUISADO_PE` ("pesquisado-pe"). `20261021210000_import_nacional_uf.sql` cria `tributos_catalogo_uf` com RLS. Alíquotas não validadas (doc 20, linha 177: "status `PESQUISADO` (não verificadas)"). |
| Parâmetros por empresa e override | EXISTE | `empresa_parametros_importacao`, `empresa_tributos_override` (`20261021210000`) |
| Testes | PARCIAL | 16 `*.spec.ts` em `shared-core/src/import/` (inclui `landedCost.adversarial`, `rateio.spec`, `conciliacaoObrigacoes.spec`); SQL em `backend/scripts/import-intelligence-*.test.sql` (BEGIN…ROLLBACK). **Não executados nesta rodada** (§8). |

### 2.3 Verificador de referência

`node docs/import-intelligence/fixtures/referencia/landed-cost-referencia.mjs` → **0/21 PASS** neste Windows.

Causa verificada: a comparação é byte a byte (`esperado === texto`). Com `core.autocrlf=true`, os `expected.json` estão em CRLF e a saída em LF. Com normalização de `\r`, os 21 casos batem (verificado). `docs/import-intelligence/21-CALC-001-1-CONCILIACAO.md:16` já reconhece que a conciliação normaliza para LF por fora do script. O defeito é do script, que deveria normalizar sozinho. Ver D-07.

---

## 3. Achados (registro)

Severidade: **P0** bloqueia publicação de custo ou causa dano financeiro, fiscal ou de estoque; **P1** precisa de correção antes de publicar custo importado; **P2** dívida ou risco latente.

| ID | Sev. | Achado | Evidência | Status em relação a 00-AUDITORIA |
|---|---|---|---|---|
| D-01 | P0 | Parser perde zeros à esquerda em `cProd` e `cEAN` | `nfeParser.ts:97` | Aberto (A-03) |
| D-02 | P0 | Conta a pagar sem conciliação com a nota; `ON DELETE CASCADE` | `20261030120000`; `108:16` | Aberto (A-02, A-14) |
| D-03 | P0 | Custo NF-e gravado sem frete, seguro, tributos, descontos; parser não lê totais | `nfeParser.ts` (sem `ICMSTot`) | Aberto (A-01, A-11) |
| D-04 | P1 | Apuração não idempotente por `entrada_sha256` | `130100:677-749` | **Novo** |
| D-05 | P1 | Despesas sem unicidade por documento de origem; risco de duplicar frete ou tributo quando o parser ler `vFrete` | `130100:80-97` | **Novo** (risco latente) |
| D-06 | P1 | Aprovação confia em `recalculo_confere` vindo do chamador | `130100:749-786`, `130200:214-255` | **Novo** |
| D-07 | P2 | Verificador de referência falha 0/21 em Windows com `autocrlf=true` | `landed-cost-referencia.mjs:330-334` | **Novo** |
| D-08 | P1 | Câmbio: uma taxa por moeda por operação; sem diferença cambial | `130100:54-58` | **Novo** |
| D-09 | P1 | Catálogo tributário "demo" e "pesquisado" embutidos no código | `tributacao.ts:49-73` | **Novo** |
| D-10 | P1 | `preco_custo` e `custo_unitario` em `numeric(10,2)` | `001:71`; `296:100`; `ROUND(…,2)` | Aberto (A-06) |
| D-11 | P1 | `preco_custo_medio` sem produtor | busca de escritores vazia | Aberto (A-07) |
| D-12 | P1 | Regra `preço = custo × 1,5` automática | `20261005173427:174` | Aberto (A-10) |
| D-13 | P1 | XML da NF-e de entrada não persistido | `296` (sem `xml`/`sha256`) | Aberto (A-04) |
| D-14 | P1 | Autorização DONO global e `usuarios.loja_id` único para GERENTE | `130100:274-304`; `ssot_003` | Aberto (A-08) |
| D-15 | P1 | Dupla fonte de custo em potencial: custo NF-e em `preco_custo` e custo landed (quando publicado) | desenho; `PROXIMOS_PASSOS.md` | **Novo** (risco de desenho) |
| D-16 | P2 | Módulo não ligado a estoque, custo, AP nem preço | 0 referências cruzadas | Intencional, mantido |
| D-17 | P2 | Testes do motor e SQL não executados nesta sessão | §8 | Pendente de execução |

---

## 4. Benchmark técnico (Etapa 2)

Pesquisa com a ferramenta de busca (modo padrão). Fontes e limites estão em cada linha. Nenhum código foi copiado.

| Referência | O que serve | Licença / custo | Limitação para a stack | Aplicabilidade |
|---|---|---|---|---|
| **ERPNext — Landed Cost Voucher** ([docs](https://docs.frappe.io/erpnext/user/manual/en/stock-transactions-landed-cost-voucher)) | Voucher separado que rateia encargos sobre itens de um recebimento | ERPNext é GPL-3.0 (conferir no repositório antes de usar qualquer trecho; não copiar) | A documentação oficial só rateia por **valor ou quantidade**. Peso não é opção nativa ([fórum](https://discuss.frappe.io/t/landed-cost-voucher-distribute-cost-by-weight-erpnext-v15/156776)). Voucher é um documento a posteriori, com uma base por voucher | Bom modelo de **voucher de custos com rateio** e ordem de aplicação. A base por peso, volume e valor aduaneiro já está no motor do Jinlong |
| **Odoo Community — landed costs** ([busca](https://apps.odoo.com/apps/modules/19.0/custom_stock_valuation)) | Custos adicionais em recebimento; custo médio com estimado; lançamento de ajuste manual quando estimado ≠ efetivo | Módulos de comunidade citados como LGPL-3. **A licença do módulo core `stock_landed_costs` não foi confirmada** (a busca não trouxe o manifesto) | Stack Python/PostgreSQL com ORM próprio. Não aplicável como dependência | Referência conceitual para **custo estimado × efetivo** e ajuste de valoração. Confirmar licença no manifesto antes de qualquer uso |
| **BCB — PTAX (OData)** ([portal](https://opendata.bcb.gov.br/dataset/american-dollar-bid-and-offer-daily-rates/resource/51085b3c-7bf1-4e26-a889-7b80c1c54378)) | Cotação oficial de venda e compra por dia | Dados abertos, licença ODbL (conforme o portal). Sem custo | Serviço OData em `olinda.bcb.gov.br/olinda/service/PTAX/version/v1/odata/`. **O nome exato do endpoint (`CotacaoDolarDia`) e os campos não foram confirmados** pela busca; conferir no `$metadata` antes de codar | **Alta.** Consulta server-side com cache e registro da cotação usada |
| **MDIC — Comex Stat** ([referência](https://github.com/strategicprojects/comexr)) | Estatística de importação e exportação por NCM, país e via | Gratuito. Documentação oficial em `comexstat.mdic.gov.br` (não recuperada pela busca) | Limite de requisições (erros de rate limit reportados por clientes). Dados atualizados com defasagem de meses | **Baixa para o custo.** Útil para benchmark de tributos e para planejamento, não para apuração |
| **Portal Único Siscomex / DUIMP** ([fazcomex](https://www.fazcomex.com.br/npi/o-cronograma-de-ligamento-novo-processo-de-importacao-npi-do-portal-Unico-siscomex/), [Manual DUIMP, docs.portalunico.siscomex.gov.br](https://docs.portalunico.siscomex.gov.br)) | Fonte oficial dos dados de DUIMP: valor aduaneiro, tributos, despesas | Gratuito, mas exige **habilitação do CNPJ** (Sistema Habilita, certificado digital ou gov.br prata/ouro) e **credenciais de API** concedidas pelo Portal. Fontes de 2026 indicam que a API usa JSON com estrutura diferente da habitual e que houve release com campos obrigatórios novos | **Não integrar no MVP.** Usar importação manual e conferência por documento (planilha ou PDF). Integração entra depois de habilitação e de contrato de API |

**Conclusão do benchmark:** o caminho de menor risco é **reutilizar o modelo próprio** (já presente) e consumir apenas o PTAX, de forma gratuita e auditável. ERPNext e Odoo servem como referência de processo, não como dependência. Siscomex entra como fonte de entrada manual até haver habilitação e contrato.

---

## 5. Matriz de decisões sobre entidades (REUTILIZAR / ESTENDER / CRIAR / DESCARTAR)

| Entidade atual | Decisão | Justificativa |
|---|---|---|
| `empresas`, `lojas`, `usuarios`, helpers `fp_*` | REUTILIZAR | Multiempresa já existe (`20261019120000` e seguintes). Toda tabela nova usa `empresa_id`. |
| `empresa_modulos`, `modulos_catalogo` | REUTILIZAR | Controle de módulo por empresa já existe (`130000`). Serve para ligar a importação por plano (D5). |
| `import_operacoes` | ESTENDER | Adicionar estados `ENTRADA_REGISTRADA` e `PUBLICADA` e vínculo com pedido/OC/NF-e de origem. Mantém status atual. |
| `import_cambios` | ESTENDER | Trocar `UNIQUE (operacao_id, moeda)` por chave que inclua `fonte`, `data_cotacao` e `fatura_id` (D-08). Guardar a cotação efetivamente usada e a fonte (PTAX ou manual). |
| `import_itens` | ESTENDER | FK opcional para `importacoes_nfe_itens` e para `produtos` (hoje só `produto_id`). Guardar `cProd` como texto (D-01). |
| `import_despesas` | ESTENDER | Campo `documento_id` obrigatório quando houver documento de origem, e índice único `(operacao_id, tipo, documento_id)` quando não nulo (D-05). Campo `contas_pagar_id` para AP de despesa (sem criar financeiro paralelo). |
| `import_tributos` | REUTILIZAR | Já tem `status_recuperabilidade`, regra versionada e `regra_incorpora_custo`. |
| `import_descontos` | REUTILIZAR | Já tem valor com sinal e justificativa. |
| `import_documentos` | REUTILIZAR | Já tem `sha256` e caminho privado por empresa e operação. |
| `import_apuracoes`, `import_apuracao_itens`, `import_apuracao_rateios`, `import_divergencias` | REUTILIZAR | Versionamento, `UNIQUE (operacao_id, versao)` e conservação já existem. Só falta idempotência por `entrada_sha256` (D-04), por constraint ou por verificação antes do insert. |
| `import_aprovacoes`, `import_auditoria` | REUTILIZAR | Trilha imutável já existe. Publicação entra como `decisao = 'PUBLICADA'` e como linha de auditoria. |
| `tributos_catalogo_uf`, `empresa_parametros_importacao`, `empresa_tributos_override` | REUTILIZAR, com correção | Fonte configurável já existe. Remover os catálogos "demo" e "pesquisado" de `tributacao.ts` (D-09) e carregar a tabela só com alíquotas validadas e com `vigencia` (ver §9). |
| `importacoes_nfe`, `importacoes_nfe_itens`, `importacoes_nfe_duplicatas` | ESTENDER | Adicionar totais (`vNF`, `vProd`, `vFrete`, `vSeg`, `vOutro`, `vDesc`), tributos por item, `xml_sha256` e `xml_storage_path` (D-03, D-13). |
| `contas_pagar` | REUTILIZAR | Única fonte de obrigação. ESTENDER com origem `IMPORT_DESPESA` e `ON DELETE RESTRICT` no vínculo com a NF-e (D-02). |
| `financeiro_comando_operacional` | DESCARTAR para AP | Não trata contas a pagar (`PROXIMOS_PASSOS`, A-20). Não usar como atalho. |
| `movimentos_estoque_log` | ESTENDER via escritor único | Adicionar `custo_unitario` e `valor_total` apenas quando o escritor central (`estoque_aplicar_movimento`, S5) estiver pronto. Não escrever custo direto. |
| `produtos.preco_custo` | REUTILIZAR como custo vigente publicado | Única coluna de custo vigente. Escala a rever (D-10). Precedência com custo NF-e decidida antes da publicação (§6). |
| `produtos.preco_custo_medio` | REUTILIZAR | Preencher pelo escritor central de custo médio ponderado (S5). Não criar coluna nova. |
| `historico_precos_produto` | REUTILIZAR, ESTENDER com `origem_id` | Já registra custo anterior e novo. Incluir referência à apuração ou publicação que originou a mudança. |
| `ordens_compra_recebimentos`, `remessas` | REUTILIZAR | Recebimento físico é a origem do crédito de estoque (D12 do `PROXIMOS_PASSOS`). Não alterar custo. |
| `import_publicacoes_custo` (cabeçalho e itens) | **CRIAR** | Não existe lugar para registrar o que foi publicado por apuração, com custo anterior e novo por produto, aprovador e chave de idempotência. `historico_precos_produto` é disparado por trigger e não guarda origem. Esta tabela é trilha, não segunda fonte de custo: só a RPC escreve em `produtos`. |
| `import_sugestoes_preco` | **CRIAR** (pequena) | Preço sugerido por produto e por varejo/atacado, com status `PENDENTE / APROVADO / REJEITADO` e vínculo com a apuração. Não há hoje fluxo de aprovação de preço com registro. Alternativa: estender `import_aprovacoes`. Preferir a tabela própria se o volume de decisões de preço for separado da aprovação de custo. |
| Função `atualizar_preco_varejo_produto` | ESTENDER | Aceitar somente preço aprovado em `import_sugestoes_preco` ou por ação explícita do gerente com motivo. Manter os guards de margem de `124/125`. |
| Regra `preço = custo × 1,5` (`20261005173427:174`) | **DESCARTAR** | Regra comercial sem aprovação registrada (D7 e D-12). Substituir por sugestão exibida ao usuário. |
| Caminho NF-e que grava `preco_custo` como custo final | ESTENDER (rotular) | Enquanto não houver publicação landed, o valor vem marcado como **custo NF-e estimado**. Após S4, precedência explícita. |
| Catálogos tributários "demo" e "pesquisado" embutidos em código | **DESCARTAR** | Fonte de alíquota deve ser tabela parametrizada e validada, não constante no código (D-09). |

Total: **REUTILIZAR 12, ESTENDER 10, CRIAR 2, DESCARTAR 3** (26 linhas de entidade, não tabelas físicas; `historico_precos_produto` conta como ESTENDER).

---

## 6. Proposta funcional (Etapa 3)

### 6.1 Fluxo

```
Pedido internacional (import_operacoes, RASCUNHO)
  → Invoice e packing list (import_documentos, sha256)
  → Embarque e conhecimento (import_documentos, datas em import_operacoes)
  → Desembaraço: DUIMP conferida manualmente (valores e tributos em import_tributos)
  → Tributos e despesas (import_tributos, import_despesas, com status e regra)
  → Recebimento físico (ordens_compra_recebimentos / remessas, por item)
  → Rateio de custos (motor puro: rateio.ts, critério explícito e justificativa)
  → Apuração versionada (import_apuracoes, status OK e conservação)
  → Aprovação do custo (import_aprovacoes, DONO, recálculo confirmado no servidor)
  → Publicação do custo vigente (RPC única: produtos.preco_custo + preco_custo_medio + historico)
  → Estoque (movimento pelo escritor central; sem custo direto no kardex antes de S5)
  → Sugestão de preço (import_sugestoes_preco, PENDENTE)
  → Aprovação de preço (gerente ou dono; guard de margem)
  → Contas a pagar (contas_pagar, origem IMPORT_DESPESA, conciliada com o total da fatura)
```

### 6.2 Custo estimado × efetivo

- **Estimado:** custo da NF-e ou da simulação (`SIMULACAO`), marcado como tal em `import_apuracoes.tipo`.
- **Efetivo:** custo da apuração `APURACAO` aprovada, com tributos e despesas conferidos.
- `compararEstimadoReal` (`precificacao.ts:83`) já compara os dois. Diferenças acima de tolerância viram divergência, e a publicação de preço sugerido usa o efetivo.

### 6.3 Tributos recuperáveis × não recuperáveis

- Cada tributo tem `status_recuperabilidade` obrigatório. `PENDENTE_VALIDACAO` bloqueia (`landedCost.ts:418-423`).
- `RECUPERAVEL_RECONHECIDO` sai do custo e vai para crédito. `RECUPERAVEL_POTENCIAL` não entra no custo nem no crédito até reconhecimento. `NAO_RECUPERAVEL` e `GLOSADO` entram no custo.
- A decisão de recuperabilidade é do contador e registrada. O motor não decide.

### 6.4 Rateio

- Critérios: `VALOR_ADUANEIRO`, `PESO_LIQUIDO`, `PESO_BRUTO`, `VOLUME`, `QUANTIDADE_ESTOQUE`, `DIRETA`. Justificativa obrigatória e não vazia.
- Maior resto, ordem de item por id ascendente, resíduo gravado em `residuo_total_brl`. Soma exata obrigatória.
- Frete e seguro entram em despesa. Se o valor aduaneiro já incluir frete ou seguro, a verificação de duplicidade bloqueia (doc 01 §6.7). Essa verificação ainda precisa ser implementada no banco (D-05).

### 6.5 Câmbio

- Taxa com 10 casas (`import_cambios.taxa numeric(24,10)`), fonte registrada (`MANUAL`, `PTAX`, `DECLARADA_DI`).
- A cotação usada fica gravada na apuração, não apenas na operação, para reprocessamento determinístico.
- **Diferença cambial:** a obrigação em BRL (`contas_pagar`) pode diferir do custo BRL apurado na data do embarque. A diferença vai para conta de ajuste cambial da operação, não para o custo do produto, até decisão contábil. Esta regra é **proposta, sem validação contábil**.

### 6.6 Custo final por unidade

- `custo_total_brl ÷ quantidade_estoque`, escala 6, com resíduo registrado. O motor já faz isso.
- A persistência em `produtos.preco_custo` exige escala maior que `numeric(10,2)` (D-10). Migração de escala é forward-only e precisa de plano de leitura nas views (`produtos_custos`).

### 6.7 Precificação e aprovação

- Preço sugerido: margem-alvo e arredondamento comercial (`arredondarComercial`), por varejo e atacado.
- Nenhum preço muda sem registro em `import_sugestoes_preco` com status `APROVADO` ou com ação explícita do gerente e motivo.
- Guards de margem negativa já existem (`124`, `125`). Mantê-los.

### 6.8 Publicação, estorno e reprocessamento

- **Publicação:** RPC única, `SECURITY DEFINER`, `FOR UPDATE` na operação, idempotência por `(apuracao_id)` em `import_publicacoes_custo`. Escreve `produtos.preco_custo`, `preco_custo_medio` (via escritor central) e `historico_precos_produto`.
- **Estorno:** nunca `DELETE`. Gera publicação inversa que restaura o custo anterior, com motivo e aprovador. Para AP paga antes, exige regra própria (ver `PROXIMOS_PASSOS` P0, D-3).
- **Reprocessamento:** nova apuração (`versao + 1`) com o mesmo `entrada_sha256` deve ser recusada (D-04). Mudança de dados gera nova versão de dados (`versao_dados`) e obriga nova apuração.

### 6.9 Auditoria e rastreabilidade documental

- Cada passo grava em `import_auditoria` (já existe). Cada documento tem `sha256` (já existe). XML da NF-e precisa do mesmo padrão (D-13).

---

## 7. Plano de sprints (Etapa 4, item 5)

Sequência alinhada ao `05-PLANO-DE-SPRINTS.md` (S0–S6). As estimativas são **ordens de grandeza de uma pessoa desenvolvedora sênior, não validadas**.

| Sprint | Escopo | Critério de aceite | Esforço estimado |
|---|---|---|---|
| **S1a′** (fechamento do motor) | Corrigir normalização do verificador (D-07). Rodar as suítes do motor (`shared-core`) num ambiente com dependências. Remover catálogos demo de `tributacao.ts` (D-09) | 21/21 PASS no Windows e no Linux. Suíte `shared-core/src/import` verde. Nenhum catálogo tributário embutido | 1–2 dias |
| **S1b** | Parser: `parseTagValue: false` para `cProd`, `cEAN` e `cEANTrib` como texto (D-01). Ler totais, frete, seguro, outras despesas, descontos e tributos por item (D-03) | Teste com `cProd "0012"` e `"12"` gerando códigos distintos. Relatório de impacto em vínculos existentes antes de migrar (R-16 do `05-PLANO`) | 4–6 dias |
| **S2** | Persistência do XML com `sha256` (D-13). Escala de custo `numeric(14,6)` ou superior, forward-only (D-10). `ON DELETE RESTRICT` em `contas_pagar.nfe_importacao_id` (D-02) | Migração aditiva, com rollback. Nenhuma linha de custo existente é reescrita | 5–7 dias |
| **S3** | Conciliação duplicatas × total da NF-e com tolerância de R$ 0,01 e UNIQUE `(nfe_importacao_id, numero_duplicata)` (D-02). Unicidade de despesas por documento (D-05). Idempotência de apuração por `entrada_sha256` (D-04). Recálculo confirmado no servidor antes de aprovar (D-06). Cotação por fatura em `import_cambios` (D-08) | Testes de duplicidade e divergência. Reenvio idêntico retorna a apuração existente. Aprovação recusada sem recálculo | 7–9 dias |
| **S4** | Publicação de custo: `import_publicacoes_custo` e RPC única. Precedência explícita entre custo NF-e estimado e custo landed efetivo. Remover regra `× 1,5` (D-12) | Publicação idempotente. Falha no meio não deixa custo parcial (teste de transação). Custo anterior restaurável por publicação inversa | 6–8 dias |
| **S5** | Custo médio ponderado por loja via escritor central (D-11), `estoque_aplicar_movimento`, com modo sombra e regressão por escritor (`PROXIMOS_PASSOS` P1) | `preco_custo_medio` preenchido e conferido com kardex em testes de concorrência. Nenhum escritor de estoque fora do central | 8–12 dias (risco alto, depende do kardex) |
| **S6** | Sugestão e aprovação de preço (`import_sugestoes_preco`). Fechar `atualizar_preco_varejo_produto` (D-12) | Nenhum preço muda sem aprovação registrada. Guards de margem mantidos | 5–7 dias |
| **S7** | Câmbio PTAX por consulta server-side com cache e registro (§4). Diferença cambial em conta de ajuste | Cotação usada gravada na apuração. Teste com data sem cotação (fim de semana) | 5–8 dias |
| **S8** (multiempresa) | Tenant guard nas `import_*`. Retirar DONO global de RPCs de entrada (D-14). Testes de isolamento entre empresas | Matriz negativa de isolamento passa. Nenhum dado entre CNPJs (S5/S6 do `05-PLANO`) | 4–6 dias |

**Total estimado:** cerca de **41–63 dias-pessoa** (faixa ampla; S5 concentra o risco). Não inclui revisão contábil e fiscal, que é externa ao código.

**Gate de cada sprint:** não avançar para S4 sem S1b, S2 e S3 verdes. Não avançar para S5 sem S4 publicando em homologação.

---

## 8. Plano de testes (Etapa 4, item 6)

### 8.1 Unitários (motor)

- `shared-core/src/import/*.spec.ts` (16 arquivos). Acrescentar casos para: valores divergentes entre duas fontes; rateio com resíduo em 3 e 7 itens; quantidade zero; fator inconsistente; câmbio ausente; tributo `PENDENTE_VALIDACAO`; desconto de processo rateado.
- `docs/import-intelligence/fixtures/casos/*` (21 casos). Corrigir o verificador (D-07) antes de usar como gate.

### 8.2 Integração (banco)

- `backend/scripts/import-intelligence-*.test.sql` (BEGIN…ROLLBACK). Acrescentar:
  - **Idempotência:** mesma entrada duas vezes → uma apuração (D-04).
  - **Duplicidade:** despesa com mesmo documento de origem → rejeitada (D-05).
  - **Concorrência:** duas apurações e duas aprovações simultâneas na mesma operação; apenas uma vence, a outra recebe `IMPORT_DADOS_ALTERADOS_*` (`FOR UPDATE`).
  - **Falha parcial:** publicação que falha no meio (`produtos` atualizado e `historico` não) → rollback total.
  - **Permissões e RLS:** usuário de outra empresa não lê nem escreve (matriz negativa).

### 8.3 Concorrência de estoque

- `backend/scripts/test-nfe-conferencia-concurrency.mjs` e `estoque-ajuste-concorrente.test.mjs` como base. Acrescentar publicação concorrente com movimento de estoque (S5).

### 8.4 E2E

- `pdv-importados/e2e/importacoes-hub.spec.ts` e `importacoes-demo.spec.ts` existem. Acrescentar fluxo completo: criar operação → itens → tributos → rateio → apurar → aprovar → (S4) publicar → conferir custo no produto. Rodar em homologação com empresas fictícias A/B.

### 8.5 Ambiente

- Testes de banco exigem Postgres/Supabase local migrado. O Supabase local do repositório tem 412 de 439 migrations (`PROXIMOS_PASSOS` P1). Alinhar antes de rodar.

---

## 9. Dúvidas que dependem de decisão de negócio ou contábil

1. **Precedência de custo** (NF-e estimado × landed efetivo) na publicação (D-15). Depende de decisão de produto.
2. **Diferença cambial:** conta de ajuste ou custo do produto. Depende do contador.
3. **Recuperabilidade de II, IPI, PIS e COFINS-importação**, por regime. `PROXIMOS_PASSOS` já pede validação do contador (P3) antes de IM-F02.
4. **Alíquotas** em `tributos_catalogo_uf`: somente com fonte oficial e vigência. Não há alíquota universal no código.
5. **Estorno de AP paga antes da reversão** (D-3 do `PROXIMOS_PASSOS`).
6. **Módulo de importação para o primeiro cliente:** manter desligado até S4, conforme plano existente.

---

## 10. Estimativa de custo de infraestrutura (Etapa 4, item 7)

| Item | Custo adicional |
|---|---|
| Supabase (banco, RLS, RPCs, storage) | R$ 0,00, usa o projeto atual |
| Vercel (UI e server actions) | R$ 0,00, usa o projeto atual |
| BCB PTAX (OData) | R$ 0,00 (dados abertos) |
| MDIC Comex Stat | R$ 0,00 (gratuito, com limite de requisições); uso previsto só para benchmark |
| Portal Único Siscomex | R$ 0,00 para habilitação e API, mas com pré-requisitos (certificado digital ou conta gov.br e credenciais). Custo indireto: contador ou despachante, se necessário. Não previsto no MVP |
| Software open source (ERPNext, Odoo) | R$ 0,00 como referência. Não implantar |
| Armazenamento de XML e documentos | Marginal: centenas de KB por NF-e. Verificar cota do bucket |

**Orçamento adicional total previsto: R$ 0,00**, com a ressalva de que a revisão contábil e fiscal não é coberta por este documento.

---

## 11. Restrições respeitadas

- Nenhuma migration aplicada, nenhum deploy, nenhum merge, nenhuma consulta a produção ou a Supabase remoto.
- Nenhum arquivo de código de aplicação alterado. O único arquivo novo é este relatório. `PROXIMOS_PASSOS.md` recebe atualização de backlog.
- Nenhuma dependência instalada (§8.1 não executado; ver abaixo).

### Verificações não executadas e motivo

- **Suíte `shared-core/src/import` (Vitest):** não executada. `shared-core` não tem `node_modules`. Tentei instalar `vitest`, `zustand` e `typescript` em uma cópia de trabalho na pasta de scratchpad. A instalação foi negada pela política de execução desta sessão e não tentei contorná-la. Para executar: `npm ci` em `shared-core` e depois `npm test` ali, em ambiente com acesso à rede.
- **Testes SQL (`import-intelligence-*.test.sql`):** não executados. Exigem banco local migrado.
- **Testes de `pdv-importados`:** não executados nesta rodada.

Só o verificador Node de referência foi executado (sem dependências), e seu resultado está em §2.3.
