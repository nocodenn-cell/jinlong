# 00 — Auditoria do estado atual (Sprint 0 · JINLONG-IMPORT-00)

| Campo | Valor |
|---|---|
| Data | 2026-10-10 |
| Base analisada | HEAD `a39a5309` (worktree `jinlong-layout-flow-analysis-f72d7d`) |
| Método | Análise estática de código, migrations SQL, testes e documentação do repositório |
| Não realizado | Nenhuma consulta ao Supabase remoto/produção; nenhuma migration; nenhum teste de banco executado; nenhum arquivo de aplicação alterado |

**Limite principal:** as migrations do repositório podem divergir de produção. A própria ESPEC multiempresa registra 3 migrations só em produção e 27 só no repositório (`docs/architecture/ESPEC_MULTIEMPRESA_V1.md`, Anexo B). Quando este documento diz "função vigente", refere-se à **última definição no repositório**. Qualquer afirmação sobre produção está marcada como NÃO VALIDADO.

**Legenda de evidências**

- **CONFIRMADO** — observado diretamente em arquivo, com linha.
- **INFERIDO** — conclusão lógica a partir de evidências confirmadas.
- **NÃO VALIDADO** — depende de produção, de execução de teste ou de dado real que não foi acessado.
- **DECISÃO NECESSÁRIA** — escolha de negócio, contábil ou fiscal que não cabe ao código.

Caminhos de migrations são relativos a `backend/supabase/migrations/`.

---

## 1. Resumo executivo

1. **CONFIRMADO** — Não existe no repositório nenhum conceito de landed cost, declaração de importação (DI/DUIMP), tributos de importação (II, IPI, PIS/COFINS-importação), câmbio, moeda original, nem rateio de despesas. A busca por `landed`, `rateio`, `DUIMP`, `DI`, `II` retornou apenas falsos positivos.
2. **CONFIRMADO** — O custo que entra no sistema é o **custo unitário da NF-e de compra** (`vUnCom ÷ fator`), arredondado a 2 casas, gravado em `produtos.preco_custo` pela confirmação da NF-e. Frete, seguro, despesas e tributos não compõem esse valor.
3. **CONFIRMADO** — O parser de NF-e lê apenas itens (`prod`) e duplicatas. Não lê totais (`ICMSTot`), frete, seguro, desconto ou tributos, e o XML original não é persistido.
4. **CONFIRMADO** — O núcleo de entrada é sólido e reutilizável: lock de pedido com `FOR UPDATE`, idempotência por chave com hash de payload, razão de recebimentos append-only, guard de obrigação financeira (SSOT-003) e trigger que impede alteração do kardex.
5. **CONFIRMADO** — Multiempresa não está implementada. Não há tabelas `empresas`, `usuario_vinculos`, `plataforma_admins`, coluna `empresa_id` nem helpers `fp_*` em nenhuma migration.
6. **CONFIRMADO** — `financeiro_comando_operacional` não trata contas a pagar (0 ocorrências de `contas_pagar`). Serve a contas operacionais e recebíveis de venda. **Não deve ser reutilizado** para obrigações de importação.
7. **Conclusão:** o Import Intelligence precisa de um domínio novo de **processo de importação e custo**, sobre a base de entrada já existente. O que falta é a camada de custo e tributos, não uma reescrita do estoque nem do financeiro.

---

## 2. Estado por componente solicitado

| Componente | Estado atual (evidência) | Reutilizar? | Observação |
|---|---|---|---|
| **Compras e fornecedores** | `fornecedores` com `UNIQUE (loja_id, cnpj)` (`20260805190920_294_fornecedores_multi_tenant.sql:15`). CNPJ opcional em entrada manual (`20261005173427_entrada_manual_fornecedor_sem_cnpj.sql`). | Sim, com ressalva | Fornecedor é por loja: o mesmo CNPJ em duas lojas vira dois cadastros (A-15). |
| **Recebimento de pedidos (OC)** | `receber_ordem_compra` (`20260918100000_oc_recebimento_parcial.sql:439-584`). Saldo por item, razão `ordens_compra_recebimentos` (`:107-131`), trava `FOR UPDATE` (`:490`), replay por chave (`:509-519`). | **Sim** | Entrada física sem obrigação financeira, por regra de produto (SSOT). Não altera custo. |
| **Importação de NF-e** | Parser `pdv-importados/lib/nfe/nfeParser.ts:85-181`. RPC `importar_nfe_transacao` (versão vigente `20261005173427_entrada_manual_fornecedor_sem_cnpj.sql`). Idempotência por `chave_acesso UNIQUE` (`075_importacao_nfe_compra.sql:68`). | Sim, com ressalvas | Parser perde zeros à esquerda (A-03); não lê totais (A-11); não guarda XML (A-04). |
| **Estoque e kardex** | `estoque` com `CHECK (quantidade_atual >= 0)` (`20260904090000_estoque_quantidade_protecao.sql:75`). `movimentos_estoque_log` imutável por trigger (`20260903190000_kardex_estoque_log_imutavel.sql:84-104`). | Sim | Kardex sem custo e sem FK para NF-e ou OC (A-09). |
| **Preço de custo** | `produtos.preco_custo numeric(10,2)` (`001_schema_inicial.sql:71`). Confirmação de NF-e sobrescreve com o unit cost da nota (`20261007163100_ssot_003_nfe_obrigacao_duplicata.sql:141-153`). | **Não** como fonte de landed | Escala insuficiente (A-06) e custo sem componentes (A-01). |
| **Custo médio** | `produtos.preco_custo_medio numeric(10,2) DEFAULT 0` (`20260816135000_reconcilia_produtos_codigo_interno.sql:53`). Nenhum RPC ou UPDATE do repositório escreve essa coluna. | Não | Coluna órfã exibida na UI (A-07). ADR-008 deixa valuation fora de escopo. |
| **Histórico de preços** | `historico_precos_produto` alimentada por trigger `AFTER UPDATE` em `produtos` (`20260709184734_259_historico_precos_produto.sql:11-22, 77-80`), inclui `preco_custo_anterior/novo`. | **Sim** | Já registra mudanças de custo da NF-e, mas sem vínculo com a importação que as originou. |
| **Financeiro e contas a pagar** | AP criada por duplicata em `confirmar_importacao_nfe` com `nfe_importacao_id` (`20261007163100...:160-171`). Pagamento por `registrar_pagamento_contas_pagar` e cancelamento por `cancelar_conta_pagar` (`20260814095445_auditable_ar_ap_reversals.sql`). Status em maiúsculas: `PENDENTE, PARCIAL, PAGO, ATRASADO, CANCELADO` (`108_contas_pagar_schema_e_rpc_pagamento.sql:25,158-159`). | **Sim** (contas a pagar) | Não existe conciliação entre soma das duplicatas e valor da nota (A-02). |
| **Fiscal e emissão de NF-e** | Emissão em Edge Function `fiscal-worker` e contrato em `docs/FISCAL_FOCUS_NFE_CONTRATO.md`. Persistência de XML **emitido** em `20260903150000_fiscal_xml_persistence.sql`. `fiscal_provider_config` não existe em produção (ESPEC §11). | Não se aplica diretamente | Frente fiscal de emissão é separada. A NF-e de **entrada** não usa esse fluxo (A-04). |
| **Empresas, lojas, permissões e RLS** | `usuarios.loja_id` é único (um valor por usuário). RPCs de entrada tratam DONO e ADMIN como globais. 23 ocorrências de `?? LOJA_MATRIZ_ID` em código de aplicação (não-teste). ESPEC v1 com decisões D1–D19 fechadas, **execução não autorizada**. | **Não** (ainda) | Ver seção 6 e A-08, A-19. |
| **Auditoria e idempotência** | Padrões sólidos: `remessas (loja_id, idempotency_key)` + `payload_hash` (`20260828150000_fase4_remessa_idempotencia_payload_hash.sql`); `ordens_compra_recebimentos (ordem_id, idempotency_key, ordem_item_id)` (`20260918100000:143-145`); `financeiro_comandos` com `request_id` (`20261006180000`). | **Sim** (padrão) | Replicar o padrão, não criar um novo. |

---

## 3. Investigação dos pontos nomeados na missão

### 3.1 `confirmar_importacao_nfe`

- **Versão vigente:** `20261007163100_ssot_003_nfe_obrigacao_duplicata.sql:18-177`. Substitui o corpo de `20261005225856` e a versão de `20260918100000:942`.
- **Autorização:** perfil `GERENTE/DONO/ADMIN` (`:46`). GERENTE restrito à loja do usuário (`:59-61`). DONO e ADMIN globais (padrão ESPEC §8, linha 203).
- **Fluxo:** trava a NF-e (`:50-53`), exige status `EM_CONFERENCIA` (`:63-65`), bloqueia se há item não conferido (`:67-73`), valida remessa vinculada (`:75-78`) ou OC vinculada com status `CONFIRMADA|EM_TRANSITO` (`:80-86`).
- **Guard SSOT-003:** se `Σ(quantidade_conferida × custo_unitario) > 0` e não há duplicata, aborta com `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA` (`:88-106`).
- **Estoque:** só quando não há remessa, cria `ENTRADA_NFE` (`:113-131`). Com OC vinculada, abate o saldo por produto via `_oc_abater_por_produto` (`:133-138`).
- **Custo:** `produtos.preco_custo = custo_unitario` da nota (`:141-153`), somente se `atualizar_custo` e se a regra de preço de varejo/atacado não ficar abaixo do custo.
- **Obrigação:** uma `contas_pagar` por duplicata com `nfe_importacao_id` (`:160-171`).
- **Idempotência:** natural, por transição de status em `FOR UPDATE` (`:50-53`, `:173-175`).

**Veredito:** reutilizar a estrutura (estoque, abatimento de OC, AP por duplicata, guard). Não reutilizar a regra de custo como fonte de landed. Achados A-01, A-02, A-05, A-08.

### 3.2 `receber_ordem_compra`

- **Definição:** `20260918100000_oc_recebimento_parcial.sql:439-584`.
- **Pontos fortes:** replay por `(ordem_id, idempotency_key)` com comparação de hash (`:509-519`); lock do pedido antes de qualquer efeito (`:490`); crédito por item sob lock (`_oc_creditar_item`, `:241-306`); estado derivado do saldo (`_oc_atualizar_estado`, `:380-400`); trigger que só permite mudar `quantidade_recebida` e status `RECEBIDA` via RPC (`:183-231`).
- **Ressalvas:**
  - Autorização: GERENTE comparado com `usuarios.loja_id` (`:494`); DONO e ADMIN sem filtro de loja (`:473`).
  - Se `produto_id` é nulo, o item é creditado no pedido sem movimento de estoque (`:554-568`). É um caso de dado inconsistente que deveria ser bloqueado.
  - Não há custo: correto por desenho (`:34-35` do cabeçalho), mas significa que OC não alimenta landed.

**Veredito:** reutilizar como entrada física parcial. Pendências de autorização (A-08).

### 3.3 `criar_confirmar_remessa_entrada`

- **Definição vigente:** `20260918100000_oc_recebimento_parcial.sql:682-868`, com 5 argumentos (o último `p_ordem_compra_id DEFAULT NULL`).
- **Pontos fortes:** idempotência por `(loja_id, idempotency_key)` com `payload_hash` que inclui o id do pedido (`:748-756`, `:737-746`); validação de produto e quantidades antes de qualquer efeito (`:772-786`); pedido validado e travado antes do estoque (`:789-795`); abatimento estrito, produto fora do pedido é erro (`:838-843`).
- **Ressalvas:**
  - Loja obtida só de `usuarios.loja_id` (`:713-716`).
  - Tipo de movimento gravado como `'ENTRADA_REMessa_LOJA'` (`:834`), código real do catálogo (`034_remessas_movimentos_transferencias.sql:14`). A documentação SSOT e o rótulo de UI usam `ENTRADA_REMESSA_LOJA` (A-12).
  - Vínculo com OC na tabela `remessas` é texto (`origem_ref`, `:797-805`), dívida já registrada no SSOT. O vínculo estruturado existe só em `ordens_compra_recebimentos`.

**Veredito:** reutilizar a idempotência e o padrão de conferência atômica. Não reutilizar o vínculo textual.

### 3.4 `financeiro_comando_operacional`

- **Definição:** `backend/supabase/migrations/20261006180000_financeiro_contas_operacionais.sql:43-120`.
- **Escopo real:** altera contas financeiras (`ALTERAR_CONTA`), mapeia forma de pagamento para conta (`CONFIGURAR_CONTA_FORMA`) e associa turno a reserva de numerário (`VINCULAR_TURNO_CONTA`). Também registra recebíveis automáticos de venda (`internal.financeiro_capturar_venda`, `:122+`).
- **Não trata:** contas a pagar. 0 ocorrências de `contas_pagar` no arquivo (CONFIRMADO).
- **Autorização:** via `internal.financeiro_loja()` (`20261005004647_financeiro_loja_contas_ledger.sql:70-76`), que usa `usuarios.loja_id` único.

**Veredito:** **não reutilizar** para importação. Usá-lo como atalho de AP criaria o "segundo financeiro" que a missão proíbe (A-20).

### 3.5 `movimentos_estoque_log`

- **Definição:** `034_remessas_movimentos_transferencias.sql:47-57`. Colunas: `loja_id, produto_id, tipo_codigo (FK → tipos_movimento_estoque), quantidade_delta numeric(10,3), remessa_id, usuario_id, observacao, anexo_url, created_at`.
- **Imutabilidade:** triggers `BEFORE UPDATE/DELETE/TRUNCATE` (`20260903190000_kardex_estoque_log_imutavel.sql:84-104`).
- **Ausências:** sem custo, sem valor, sem FK para `importacoes_nfe`, `ordens_compra` ou `contas_pagar`. A ligação com a NF-e é só texto em `observacao`, por exemplo `'Importação NF-e <uuid>'` (`ssot_003:121`). A ligação com OC está em `ordens_compra_recebimentos.movimento_estoque_id` (`20260918100000:120`).

**Veredito:** reutilizar como kardex. Não usar como fonte de custo. Ligação estruturada é gap (A-09).

### 3.6 `produtos.preco_custo`

- **Tipo:** `numeric(10,2)` (`001_schema_inicial.sql:71`). Sem escala para custo unitário com fração.
- **Escritores encontrados:** confirmação de NF-e (`ssot_003:141-153`), criação de produto (`criar_produto_com_estoque_inicial`, `criar_produto_autoria_atomica`), atualização de produto com faixa atacado (`20260816143000`, `20260902140200`).
- **Leitura:** desde N1 (`20261009180001_revoga_leitura_direta_preco_custo.sql`), o role `authenticated` não lê a coluna diretamente. A leitura passa pela view `produtos_custos` (`pdv-importados/app/gerente/estoque/importar-nfe/actions.ts:354-365`).
- **Veredito:** continua sendo o custo de referência operacional. Não deve receber landed automaticamente sem decisão (DECISÃO-01). Escala é gap (A-06).

### 3.7 `produtos.preco_custo_medio`

- **Criação:** `20260816135000_reconcilia_produtos_codigo_interno.sql:53`, `DEFAULT 0.00`, `numeric(10,2)`.
- **Escrita:** nenhum RPC, trigger ou UPDATE do repositório atribui valor a essa coluna. Busca por `preco_custo_medio` em `*.sql` retornou só criação, reconciliação e proteções de leitura.
- **Uso:** exibido como "custo médio" em `components/gerente/produtos/form/sections/PrecosSection.tsx:148-152`.
- **Veredito:** coluna sem produtor. Se produção tiver o mesmo comportamento, a UI mostra 0 ou valor antigo como custo médio (A-07, NÃO VALIDADO em produção).

### 3.8 `docs/architecture/ESPEC_MULTIEMPRESA_V1.md`

- **Estado:** "DECISÕES FECHADAS (D1–D19)", "execução em produção não autorizada" (linha 3).
- **Implementado no repositório:** nada. Busca por `usuario_vinculos|fp_pode_loja|plataforma_admins|fp_empresas_do_usuario|empresa_id` em `backend/supabase/migrations` retornou zero arquivos (CONFIRMADO).
- **Pontos da espec que afetam este projeto:** §8 (RPCs de entrada no padrão "só GERENTE restrito", linha 203), §12 (ordem de migração, etapa 8 para RPCs), §11 (`sync-outbox` fora do primeiro corte).

### 3.9 `docs/regras-negocio/SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md`

- **Estado:** política de produto de 2026-10-07. Consistente com o código (`ssot_003`).
- **Regra central:** só NF-e com duplicata reconhece obrigação. OC e remessa geram estoque sem AP (tabela, linhas 17-21). Valor econômico > 0 sem duplicata é rejeitado (linhas 33-37).
- **Divergências:** nomenclatura `ENTRADA_REMESSA_*` contra código real `ENTRADA_REMessa_LOJA` (A-12). Afirmação de que o vínculo OC↔remessa é "textual" (linha 20) é correta para `remessas`, mas incompleta: existe vínculo estruturado em `ordens_compra_recebimentos`.

---

## 4. Achados (registro de risco)

Severidade: **P0** bloqueia Sprint 1 ou causa dano financeiro/fiscal/de estoque se não tratado. **P1** precisa de correção antes de publicar custo importado. **P2** dívida ou risco latente.

| ID | Sev. | Achado | Evidência | Impacto |
|---|---|---|---|---|
| **A-01** | P0 | Custo registrado é o unit cost da NF-e, sem componentes de importação | `ssot_003:141-153`; `nfeParser.ts:142-158`; `20260904120000_importar_nfe_duplicata_invalida_aborta.sql:156` (`v_custo_unit := v_v_un / v_fator`) | Custo de importado subestimado (frete internacional, seguro, II, IPI, PIS/COFINS-importação, AFRMM, armazenagem e despesas ficam de fora). Precificação e margem distorcidas. |
| **A-02** | P0 | Obrigação não é conciliada com o valor econômico | XML: `ssot_003:96-106` checa só `count(duplicatas) > 0`. Caminho XML não compara `Σ duplicatas` com `Σ(qtd × custo)` nem com total da nota (o total nem é lido, `nfeParser.ts`). Caminho manual compara `Σ parcelas = Σ itens`, só na camada de app (`notaManualFinanceiro.ts`, `erroFinanceiroNotaManual`). | AP pode diferir do estoque e do custo (diferenças de frete, IOF, desconto, duplicata parcial). Tolerância é DECISÃO-05. |
| **A-03** | P0* | Parser perde zeros à esquerda em `cProd` e `cEAN` | `nfeParser.ts:95` (`parseTagValue: true`). Probe read-only com o `fast-xml-parser` do projeto: `cProd "0012"` → número `12`; `cEAN "07891234567890"` → `7891234567890`. | Vínculo fornecedor-produto (depara) falha, ou dois SKUs diferentes colidem (`"0012"` e `"12"`), creditando estoque e custo no produto errado. *P0 se fornecedores usam códigos com zeros à esquerda (NÃO VALIDADO com XMLs reais). |
| **A-04** | P0 | XML original da NF-e de entrada não é persistido | `075_importacao_nfe_compra.sql:60-69` (sem coluna de XML/hash); `20260805213357_296_nfe_conferencia.sql:95-108` (snapshot parcial de itens). Persistência de XML existe só para NF-e **emitida** (`20260903150000_fiscal_xml_persistence.sql`). | Reprocessamento determinístico (Etapa C.17) e auditoria do dado de origem são impossíveis sem reimportar o arquivo. |
| **A-05** | P0 | NF-e confirmada sem vínculo com OC/remessa já recebida pode duplicar estoque | Vínculo OC é opcional (`20260918100000:880-925`). Sem vínculo, `confirmar_importacao_nfe` credita `ENTRADA_NFE` integral (`ssot_003:113-131`). Não há checagem por chave ou por item contra recebimentos já feitos. Para remessa existe `associar_documento_entrada` (`20261005225856`), mas não há equivalente para OC. | Estoque em duplicidade. **INFERIDO** do desenho; depende do fluxo operacional real (NÃO VALIDADO). |
| **A-06** | P1 | Precisão insuficiente em custo unitário | `20261005173427_entrada_manual_fornecedor_sem_cnpj.sql:134, 174, 230` (`ROUND(v_custo_unit, 2)`); `296:100` (`custo_unitario numeric(10,2)`); `001:71` (`preco_custo numeric(10,2)`). | Exemplo: `vUnCom 3,33333 ÷ fator 12 = 0,27778` gravado como `0,28` (erro de ~+0,8%). Afeta custo de caixa/embalagem. |
| **A-07** | P1 | `preco_custo_medio` sem produtor | `20260816135000:53`; busca em `*.sql` sem atribuição; UI `PrecosSection.tsx:148-152` | Custo médio exibido com valor 0 ou antigo. NÃO VALIDADO em produção. |
| **A-08** | P1 | Autorização de entrada usa perfil global para DONO/ADMIN e `usuarios.loja_id` único para GERENTE | `ssot_003:46,59-61`; `20260918100000:473,494,715,908`. ESPEC §8 (linha 203) prevê `fp_pode_loja`. | Hoje aceitável (1 empresa). **Antes do cliente 2 vira P0**: DONO de um CNPJ opera entradas de outro. GERENTE multi-loja não consegue operar a segunda loja. |
| **A-09** | P1 | Kardex sem vínculo estruturado com NF-e, OC ou custo | `034:47-57` (sem FK nem custo); `ssot_003:121` (vínculo só em texto) | Reconciliação estoque ↔ NF-e depende de busca em texto livre. Sem custo no kardex não há valorização histórica. |
| **A-10** | P1 | Regra de preço automática na criação de produto por NF-e | `20261005173427:174` (`preco_varejo = ROUND(custo × 1.5, 2)`, `preco_atacado` idem) | Regra comercial embutida sem registro de origem. Se não foi aprovada pelo negócio, viola "não inventar regras". NÃO VALIDADO. |
| **A-11** | P1 | Parser não lê totais nem tributos | `nfeParser.ts:142-158` (lê `prod`), `:166-172` (lê `cobr/dup`). Não lê `ICMSTot`, `det/imposto`, `vFrete`, `vSeg`, `vOutro`, `vDesc`. | Landed e validação de obrigação exigem nova leitura do XML, o que depende de A-04. |
| **A-12** | P2 | Tipo de movimento com grafia divergente da documentação e dos rótulos | Código real: `034:14`, `20260918100000:834` (`ENTRADA_REMessa_LOJA`). Rótulo: `pdv-importados/lib/format/vendaLabels.ts:76` (`ENTRADA_REMESSA_LOJA`). SSOT: linhas 20 e 43. | Rótulo cai no fallback `humanizarCodigo`. Não há erro funcional. |
| **A-13** | P2 | RPC legada `confirmar_remessa_entrada(uuid)` ainda definida e com `EXECUTE` para `authenticated` | Definição `20260828140000_fase3_tenant_isolation_transferencias_remessas.sql:322`; grant `:422`. Wrapper `inventoryMovementWriter.ts:49-51, 169`, sem chamador de produção (só testes). | Superfície de API sem uso. Deve ser revogada após confirmar em produção (NÃO VALIDADO). |
| **A-14** | P2 | Exclusão de NF-e apagaria obrigações em cascata | `108_contas_pagar_schema_e_rpc_pagamento.sql:16` (`nfe_importacao_id ... ON DELETE CASCADE`); `296:97,153` (itens e duplicatas em cascata). Nenhum `DELETE` de `importacoes_nfe` encontrado no repositório. | Latente. Qualquer rotina futura de exclusão de NF-e apaga AP. Gate: proibir DELETE em `importacoes_nfe` ou trocar a FK. |
| **A-15** | P2 | Fornecedor é único por loja, não por empresa | `294:15` (`UNIQUE (loja_id, cnpj)`) | Mesmo fornecedor em duas lojas vira dois cadastros. Consolidação de custo por fornecedor fica difícil. |
| **A-16** | P2 | Vínculo remessa ↔ OC é textual em `remessas` | `20260918100000:797-805` (`origem_ref` = id como texto) | Dívida já registrada no SSOT. Mitigado pelo vínculo estruturado em `ordens_compra_recebimentos`. |
| **A-17** | P2 | Linhas de estoque criadas por INSERT direto na aplicação | `pdv-importados/app/gerente/estoque/actions.ts:48, 175` (`quantidade_atual: 0`). Protegido pelo `CHECK` e pela regra de INSERT com saldo zero (`20260904090000`). | Baixo risco. Padronizar em RPC no futuro. |
| **A-18** | P2 | Margem histórica cai no custo atual quando não há snapshot | `20260621003400_238_relatorio_margem_por_venda.sql:11-14, 51-52` (`COALESCE(iv.custo_unitario_snap, p.preco_custo)`) | Vendas antigas sem snapshot são recalculadas com custo de hoje. |
| **A-19** | P0 | Multiempresa inexistente; `LOJA_MATRIZ_ID` como fallback | Zero ocorrências de `empresa_id`, `usuario_vinculos`, `fp_*` em migrations. 23 ocorrências de `?? LOJA_MATRIZ_ID` em código de aplicação (não-teste). ESPEC §9 descreve 2 passos de remoção. | Bloqueia qualquer segundo CNPJ ou empresa, incluindo importadora separada das lojas. Operação atual de cliente único não é afetada. |
| **A-20** | P1 | Risco de "segundo financeiro" | `financeiro_comando_operacional` não trata AP (`20261006180000`, 0 ocorrências de `contas_pagar`) | Reutilizar como atalho duplicaria a fonte de obrigação. Proibir por gate. |
| **A-21** | P1 | Sem moeda original nem câmbio | `075` e `296` não têm campos de moeda ou câmbio; NF-e de entrada está em BRL | Etapas C.1–C.3 da missão não são representáveis hoje. |

---

## 5. Itens NÃO VALIDADOS (dependem de produção ou de dados reais)

1. Se as funções vigentes em produção são as mesmas do repositório (drift de 3+27 migrations, ESPEC Anexo B).
2. Se `confirmar_remessa_entrada(uuid)` existe e tem `EXECUTE` em produção (A-13).
3. Se algum fornecedor real usa código de produto com zeros à esquerda ou alfanumérico com zeros (A-03).
4. Se o fluxo operacional de fato recebe pelo pedido e depois confirma a NF-e sem vincular (A-05).
5. Se `preco_custo_medio` tem valor em produção (A-07).
6. Se a regra `preço = custo × 1,5` foi aprovada pelo negócio (A-10).
7. Volume real de NF-e com diferença entre duplicatas e total (A-02).
8. Regime tributário da empresa importadora e regras de recuperabilidade (ver `03-MATRIZ-FISCAL.md`).
9. Estado de RLS em produção para as tabelas de entrada (a análise usa as policies do repositório).

---

## 6. Multiempresa — estado real (resumo)

- **Implementado:** lojas (`lojas`), usuários com `perfil` e `loja_id`, RLS por loja em tabelas de entrada (`importacoes_nfe_itens_gerente_all` usa `u.loja_id = imp.loja_id` para GERENTE e aceita DONO/ADMIN globalmente, `296:124-140`), e fornecedores isolados por loja (`294:19-39`).
- **Não implementado:** empresa como entidade, vínculo usuário × empresa × papel × loja, helpers `fp_*`, guarda RESTRICTIVE, seletor de empresa, licença e status de empresa.
- **Consequência:** não há como distinguir "empresa importadora" de "loja de outro CNPJ" no modelo de dados. Qualquer funcionalidade multi-CNPJ depende da ESPEC v1 antes de publicar dado de custo entre empresas.

Ver `01-ARQUITETURA.md` seção 8 para o que pode ser construído isoladamente.

---

## 7. Evidências de testes existentes (referência para `04-TESTES-E-GATES.md`)

- `backend/scripts/ux04-oc-recebimento-parcial.test.sql` — recebimento parcial, saldo e OC.
- `backend/scripts/fase4-remessa-idempotencia-payload-hash.test.sql` — idempotência de remessa.
- `backend/scripts/nfe-duplicata-invalida-aborta.test.sql` — duplicata inválida aborta importação.
- `backend/scripts/nfe-conferencia-margem-nao-bloqueia-estoque.test.sql` — margem não bloqueia estoque.
- `backend/scripts/nfe-manual-sem-cnpj.test.sql` — entrada manual sem CNPJ.
- `backend/scripts/test-nfe-conferencia-concurrency.mjs` — concorrência na conferência.
- `backend/scripts/entrada-documento-posterior.test.mjs` — documento posterior à entrada.
- `backend/scripts/fase3-tenant-isolation-transferencias-remessas.test.sql` — isolamento de remessas por loja.
- `backend/scripts/test-rls-scope.mjs`, `sec04-token-gerente-tenant.test.sql` — escopo de RLS.
- `pdv-importados/lib/nfe/nfeParser.test.ts` — parser (cobre `SKU-1`, não zeros à esquerda).
- `pdv-importados/app/gerente/estoque/importar-nfe/notaManual.financeiro.test.ts` — soma de parcelas.
- `pdv-importados/app/gerente/recebimento/actions.vinculoOc.abateSaldo.test.ts` — abatimento de saldo.
- `pdv-importados/tests/remediacao-ssot-001-004.matrix.test.ts`, `kardex-unificado-anti-join-devolucao.matrix.test.ts` — kardex e SSOT.

Nenhum desses testes cobre landed cost, rateio, arredondamento de custo, retificação de NF-e ou multiempresa, porque essas funções não existem.
