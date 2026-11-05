# PDV-100.1 — Defeitos, causa raiz, correções e decisões pendentes

**Data:** 2026-11-03 · **Branch:** `claude/jinlong-pdv-operational-validation-56c18a` · **PR:** #655
**Parecer:** permanece **NO-GO** (ver seção 7).

Este documento complementa [PDV_100_RELATORIO_VALIDACAO.md](PDV_100_RELATORIO_VALIDACAO.md). Cada item traz reprodução, causa raiz, o que foi corrigido e o que depende de decisão.

Legenda: **CORRIGIDO** (código + teste de regressão), **DECISÃO** (precisa de decisão de produto/arquitetura antes de alterar), **NÃO REPRODUZIDO** (investigado, sem falha reproduzida nesta rodada), **EVIDÊNCIA** (mapeamento, sem alteração).

| ID | Tema | Status |
|---|---|---|
| D-01 | Quantidade digitada corrompe o valor | CORRIGIDO (PDV-100) |
| D-02 | Apagar o campo remove a linha | CORRIGIDO (PDV-100) |
| D-03 | Login não redireciona na 1ª tentativa | NÃO REPRODUZIDO |
| D-04 | Unidade de medida e fração | CORRIGIDO (regra) + DECISÃO (wholesale ver D-11) |
| D-05 | Valor recebido, troco e rastreabilidade | EVIDÊNCIA + DECISÃO |
| D-06 | Fechamento com venda em espera | CORRIGIDO (banco + UI) |
| D-07 | Integração venda × caixa × financeiro | EVIDÊNCIA + DECISÃO |
| D-08 | Enter antes da lista de busca | NÃO REPRODUZIDO |
| D-09 | Recebido residual após esvaziar o carrinho | CORRIGIDO |
| D-10 | Consultas repetidas a `usuarios` | NÃO REPRODUZIDO como loop |
| D-11 | Atacado: `produtos.preco_atacado` ignorado na venda | DECISÃO (novo) |

---

## D-04 — Unidade de medida

**Fonte oficial.** A lista de unidades vem do formulário de produto: `UnidadeCode = 'UN' | 'KG' | 'CX' | 'FD' | 'M'` (`pdv-importados/components/gerente/produtos/form/produtoForm.types.ts`) e o enum do schema `produtoFormSchema.ts`. A coluna `produtos.unidade_medida` é `text` com default `'UN'` e **não tem CHECK** no banco (verificado em `pg_constraint`). Os 17 produtos do seed são todos `UN`.

**Não existe `MT`.** O requisito cita MT; o sistema usa `M` (metro). Nenhuma unidade foi acrescentada.

**Regra definida** (`shared/format/unidadeMedida.ts`, SSoT):

| Unidade | Tipo | Quantidade aceita |
|---|---|---|
| UN, CX, FD | inteira | inteiro ≥ 1 |
| KG, M | fracionável | ≥ 0,001 com até 3 casas (igual a `numeric(10,3)`) |

Unidade ausente ou desconhecida é tratada como **UN** (regra conservadora).

**Reprodução (antes).** Digitar 2,5 num produto UN era aceito no carrinho e persistido na venda.

**Validação em camadas:**
- Servidor: `recalcularItensNoServidor` (`app/caixa/server/caixaPrecoAutoritativoServer.ts`) busca `unidade_medida` no banco e rejeita a venda com `err_srv_quantidade_unidade` (função pura em `app/caixa/server/validacaoQuantidadeUnidade.ts`). O cliente não é confiável para isso.
- Cliente: o campo de quantidade só confirma valores válidos para a unidade (`CaixaCartList.tsx`). Os botões +/− vão para o inteiro vizinho em unidade inteira (`ajustarQuantidadeUnidade`).
- `unidade_medida` entrou em `PRODUTO_COLS`, `ProdutoCaixaDTO` e `metaPdv` do item do carrinho.

**Evidência de ponta a ponta (UI):** o carrinho já tinha 2,5 de uma chaleira (UN) de antes da regra. Ao finalizar, o servidor respondeu: *"A quantidade de "硅胶折叠水壶 · Chaleira silicone retrátil" deve ser inteira (unidade UN). Ajuste o item e tente novamente."* O carrinho foi preservado.

**Testes de regressão:**
- `lib/format/unidadeMedida.test.ts`: UN/CX/FD inteiras; KG/M com 3 casas; NaN/infinito; normalização; +/−.
- `app/caixa/server/validacaoQuantidadeUnidade.test.ts`: UN rejeita 2,5; KG e M aceitam fração; primeiro item inválido; unidade ausente vira UN.
- `CaixaCartList.behavior.test.tsx`: UN não confirma 2,5 digitado; KG confirma 2,125; + em UN com 2,5 vai a 3.

**Não feito (decisão):** CHECK no banco para `unidade_medida` (migration). Não criado porque a validação em servidor já cobre o caminho de venda; fica como recomendação para o banco.

---

## D-05 — Recebimento, troco e rastreabilidade

**Como o dinheiro é processado hoje (mapeado no código):**
1. O operador digita **Recebido** (parcela DINHEIRO, valor 150,00 no teste) em `useCaixaPagamentos`.
2. `CaixaPageClient.tsx` (`handleFinalizar`) calcula `excesso = totalPagamentos − totalLiquido`. Se houver excesso e ele couber em dinheiro, **reduz a parcela DINHEIRO pelo excesso** antes de enviar. O troco é, portanto, um desconto na própria parcela.
3. O RPC `finalizar_venda_transacional_canonica_v4` grava em `vendas_pagamentos` o valor **já líquido** (134,90). A função não contém nenhuma referência a troco ou valor recebido.
4. `trg_vendas_pagamentos_credita_caixa` credita `caixas.saldo_atual` com o valor gravado (134,90), não com 150,00.
5. No fechamento, `calcular_valor_sistema_dinheiro_caixa` soma o dinheiro gravado. Ele bate com o físico: fundo + entradas − troco entregue.

**O que é persistido:**
- `vendas_pagamentos`: `id, venda_id, forma_pagamento, valor, created_at, parcelas`. **Não há** valor recebido nem troco.
- `vendas`: total bruto, desconto e líquido.
- Não há tabela de movimentação de caixa com entrada e troco separados (`movimentos_caixa` ficou vazio no teste).

**Conclusão:** os **totais batem** (fundo + Σ dinheiro aplicado = saldo do sistema). Não há perda de dinheiro no cálculo. O problema é **rastreabilidade**: não se consegue provar, depois da venda, quanto o cliente entregou nem quanto de troco foi devolvido. Isso é auditoria e não conciliação.

**Risco de duplicidade:** o caminho atual não gera movimento de caixa extra para o troco, então não há duplicação hoje. Qualquer solução precisa manter isso.

**Proposta (DECISÃO, não implementada):**
- Adicionar em `vendas_pagamentos` duas colunas opcionais, só para DINHEIRO: `valor_recebido numeric(10,2)` e `troco numeric(10,2)`, com `valor = valor_recebido − troco`.
- O cliente passa `valorRecebido` na parcela DINHEIRO; o RPC v4 (ou versão nova) valida `valor_recebido − troco = valor` e grava as duas colunas.
- Movimento de caixa: não criar linha nova para o troco. O saldo continua vindo de `valor` (líquido), como hoje.

Motivo de não implementar agora: exige migration e alteração do RPC canônico (SSoT do fechamento e do caixa). Pelo pedido, isso precisa de aprovação antes.

---

## D-06 — Fechamento de caixa com venda em espera

**Reprodução (antes):** o caixa fechou com uma venda EM_ESPERA ligada a ele (ver relatório). A venda ficou presa a um caixa FECHADO.

**Causa raiz:** `internal.fechar_caixa_atomico` (banco) só bloqueava `movimentacoes_caixa` pendentes. Vendas em espera não eram verificadas.

**Correção:**
- Migration `backend/supabase/migrations/20261103120000_fechar_caixa_bloqueia_vendas_em_espera.sql`: recria a função com a checagem `EXISTS (vendas_em_espera com caixa_id do caixa e status IN ('EM_ESPERA','RETOMADA'))` → `RAISE 'FECHAR_CAIXA_VENDAS_EM_ESPERA'`. O resto do corpo é idêntico ao anterior. CONVERTIDA e DESCARTADA não bloqueiam.
- Mensagem ao operador: `caixaErroOperador` mapeia o código para *"Há vendas em espera neste caixa. Conclua ou descarte as vendas em espera antes de fechar o caixa."* (PT e ZH).

**Por que migration:** a regra precisa valer no banco, que é a fonte de verdade do fechamento. A checagem só no TypeScript teria janela de corrida.

**Testes:**
- Banco (`BEGIN … ROLLBACK`, script em `/tmp/test_d06.sql` do stack local): com espera EM_ESPERA na transação, `fechar_caixa_atomico` lança `FECHAR_CAIXA_VENDAS_EM_ESPERA`. Com a única espera DESCARTADA, o fechamento passa.
- Unitário: `caixaErroOperador.test.ts` (mensagem PT e ZH, sem vazar o código).
- UI (PDV local): com duas esperas (EM_ESPERA) o botão Fechar caixa mostrou a mensagem e o caixa continuou ABERTO. Depois de **Descartar** as duas, o fechamento passou (200,00 contado = 200,00 do sistema, diferença 0).

**Recuperação e descarte:** recuperação testada na validação anterior (E1–E4). Descarte testado agora: status DESCARTADA gravado no banco.

**Observação encontrada no caminho:** a lista EM ABERTO mostra vendas em espera de **todos** os caixas do operador, inclusive de caixas já fechados. Ao descartar o "Pedido #2", que pertencia a um caixa fechado, a ação foi aceita pela UI. Isso precisa de regra (ver pendências).

---

## D-07 — Integração venda × caixa × financeiro (evidência)

**Gatilhos da venda** (consultados no banco):
- `vendas`: `financeiro_venda_captura` (constraint trigger, deferido, `internal.financeiro_capturar_venda`), `trg_registrar_comissao`, `trg_vendas_caixa_aberto_bi/bu`.
- `vendas_pagamentos`: `financeiro_split_captura` (mesma função), `trg_vendas_pagamentos_credita_caixa` (saldo do caixa, só DINHEIRO), `trg_vendas_pagamentos_parcelas`.

**O que `internal.financeiro_capturar_venda` faz:** para cada pagamento **não DINHEIRO** cria uma linha em `financeiro_recebiveis_venda` (`forma`, `bruto`, `previsao`, `conta_financeira_id`). Para PIX, se houver conta configurada para a forma (`financeiro_conta_forma`), cria o movimento em `movimentos_financeiros` e marca o recebível como RECEBIDO. Dinheiro não entra no financeiro: vai para o saldo do caixa.

**Resultado observado:**
- PIX de 137,00 (venda 237,00 com dinheiro 100,00): `financeiro_recebiveis_venda` com 1 linha, `status = PENDENTE`, `conta_financeira_id = NULL`.
- `contas_financeiras` da loja Matriz: **0 linhas**. `financeiro_contas_forma`: sem configuração. Por isso `movimentos_financeiros` ficou vazio.
- Venda de 3 modalidades (50 dinheiro + 45 PIX + 40 débito): 2 recebíveis pendentes sem conta, com o mesmo padrão.

**Conclusão:** nenhum lançamento redundante foi criado (a função usa `ON CONFLICT DO NOTHING` e um único movimento por recebível). O vazio em `movimentos_financeiros` é **falta de configuração de contas no ambiente**, não falha de cálculo. Isso precisa ser confirmado com o módulo financeiro antes de liberar. Sem conta configurada, o PIX e o cartão ficam PENDENTES para sempre.

**Fonte oficial dos saldos (mapeada):**
- Caixa: `caixas.saldo_atual` (atualizado pelo trigger de dinheiro) e `calcular_valor_sistema_dinheiro_caixa` no fechamento.
- Financeiro: `movimentos_financeiros` (saldo por conta). Recebíveis em `financeiro_recebiveis_venda`.
- Estoque: `estoque` + `movimentos_estoque_log` (kardex). Conferido: 3 linhas `SAIDA_VENDA` com `venda_id`.

**Crédito de cliente:** a forma de pagamento do caixa é `DINHEIRO | PIX | CARTAO_DEBITO | CARTAO_CREDITO`. "Crédito de cliente" não existe como forma. O fluxo de venda com saldo devedor vai para contas a receber (BA-001, `pagamentoParcialExigeCliente`). Não testado nesta rodada.

**Decisão pendente:** configurar contas e formas da loja (ambiente de homologação) e definir se PIX/cartão sem conta devem bloquear a venda ou ficar pendentes. Não criar lançamento manual.

---

## D-09 — Recebido residual

**Reprodução:** removi o único item do carrinho; o campo "Recebido" continuou com R$ 79,00.

**Causa raiz:** `useCaixaPagamentos` só reajusta a parcela única quando ela está zerada ou quando não é DINHEIRO. Uma parcela DINHEIRO com valor digitado, quando o total cai para zero, não era alterada.

**Correção** (`app/caixa/hooks/useCaixaPagamentos.ts`): se o total líquido ficar ≤ 0,009, a parcela única é zerada.

**Teste de regressão:** `useCaixaPagamentos.behavior.test.tsx` → "recebido digitado não sobrevive quando o total cai a zero" (11/11 passam no arquivo).

---

## D-11 — Atacado: `produtos.preco_atacado` ignorado (novo, DECISÃO)

**Reprodução:** USB-C (varejo 22,50; `produtos.preco_atacado` 17,90; sem faixas em `precos_atacado`). Com 6 unidades, o carrinho mostrou **R$ 135,00** (varejo) e não 107,40.

**Causa raiz:** `internal.calcular_preco_produto` (SSoT do preço autoritativo) só considera a tabela `precos_atacado` (faixas com `quantidade_minima`). O campo `produtos.preco_atacado` não entra no cálculo, embora apareça no catálogo e no snapshot do item (`metaPdv.precoAtacado`).

**Impacto:** dois valores de atacado no sistema (`produtos.preco_atacado` e `precos_atacado`) com fontes diferentes. O operador vê um, o cliente pode esperar outro. Não há perda de valor (o preço cobrado é o de varejo), mas a regra comercial não está sendo aplicada.

**Decisão necessária:** qual é a fonte oficial do atacado: faixas (`precos_atacado`) ou o campo do produto? Se for o campo, ele precisa virar faixa ou entrar no RPC, o que muda o SSoT de preço. Não alterado nesta rodada.

**Teste de atacado com faixa real:** não executado (não há faixa cadastrada no seed).

---

## Não reproduzidos

**D-03 (login).** Na rodada anterior, a 1ª tentativa de login ficou em `/login`. Nesta rodada: logout e login novamente com `e2e-operador@localhost.test` redirecionaram para `/caixa` (verificado pela URL). A 1ª tentativa coincidiu com a recompilação do Fast Refresh do Next (`[Fast Refresh] rebuilding … done in 42424ms` nos logs), o que sugere latência de desenvolvimento e não defeito do produto. Mantido como monitoramento.

**D-08 (Enter antes da lista).** Nesta rodada, digitar o código de barras 7898512340001 e apertar Enter na sequência adicionou o item de imediato. A falha anterior não foi reproduzida. Sem reprodução, não há correção. Mantido como monitoramento.

**D-10 (consultas repetidas a `usuarios`).** Medido: 14 requisições `select=loja_id` com a página parada; a contagem não cresceu em 30 s. O crescimento da rodada anterior acompanhou ações e navegação. A origem no navegador é `CaixaCarrinhoAuthSync` (uma leitura por evento de sessão, em dev com StrictMode, pode dobrar). Não é loop.

---

## Decisão 1 — Provisionamento e perfil ADMIN (contrato atual)

**Contrato mapeado no código e no banco:**
- Perfil ADMIN descontinuado (`20261028110000_corte_admin_papeis.sql`): trigger `fp_bloquear_perfil_admin` impede criar ou reativar ADMIN. Papéis do cliente: DONO, GERENTE, OPERADOR.
- Provisionamento de empresa: a porta pública `plataforma_provisionar_empresa` é **fail-closed** (`20261028121000_provisionamento_automatico_bloqueado.sql`). Só libera com `saas.parametros.provisionamento_automatico = 'habilitado'` (após homologação do hub comercial) ou em **contingência** com `fp.provisionamento_contingencia` + `fp.provisionamento_responsavel`, gravada em `internal.provisionamento_contingencia_log`. Só `service_role`/`postgres` executam a função.
- O app das lojas não provisiona: `app/admin/provisionamento/actions.ts` (`requireAdminSession`) devolve *"O provisionamento de lojas não está disponível no app das lojas."*, e a página mostra o aviso `apenas_admin`.
- Mecanismo oficial de provisionamento: o hub comercial (fora do app das lojas). Procedimento manual: contingência documentada.

**Achado:** `app/admin/provisionamento/page.tsx` tem `if (session)` sempre verdadeiro, então o formulário do wizard nunca é renderizado. Isso confirma o contrato (fechado), mas o código do wizard está inacessível e deveria sair em limpeza futura.

**Fixture de homologação:** primeiro usuário da empresa = DONO. O seed local (`npm run seed:dev-users`) cria o DONO `e2e-dono@localhost.test` na empresa piloto, loja Matriz. Esse é o caminho sancionado para fixtures locais (não usa service role no navegador).

**Adaptação do smoke test** (`e2e/smoke-fase1-provisionamento-homologacao.spec.ts`):
1. Contrato fail-closed: DONO não vê o formulário de provisionamento e recebe o aviso de indisponibilidade. **Passou.**
2. DONO cadastra produto. **Passou.**
3. DONO abre caixa, vende e fecha. **Passou.**
4. Dashboard do DONO. **Passou.**
- ADMIN não é criado nem usado. Não substituí ADMIN por DONO como "administrador": o DONO aparece só como responsável da empresa fixture, e o teste 1 verifica que o app não provisiona.
- Causa da falha original: o teste criava ADMIN (`PERFIL_ADMIN_DESCONTINUADO`). Sem mudança de código de produto.

**Não feito:** a rota de administração da plataforma (mecanismo próprio e isolado) não existe no repositório. Documentado como pendência; não foi criada, porque exige decisão de negócio.

---

## Decisão 2 — Atacado (proposta de regra única, não implementada)

**Fontes encontradas:**
| Fonte | Onde | Usada na venda? |
|---|---|---|
| `produtos.preco_atacado` + `produtos.quantidade_gatilho_atacado` | catálogo, lista de produtos, `metaPdv.precoAtacado` | **Não**: o RPC `internal.calcular_preco_produto` não lê essas colunas |
| `precos_atacado` (faixas por `quantidade_minima`, escopo por loja) | tabela | **Sim**: é a única fonte do preço ATACADO no servidor |
| Preço manual (`MANUAL`) | seleção do operador | Sim, com limite de alçada (`desconto_maximo_operador_percentual`, 10%) e token de gerente acima disso |
| Promoção (`PROMOCAO`) | snapshot do cliente | Sim, com a mesma alçada |

**Conflito:** há dois atacados com fontes diferentes. O USB-C do seed tem `preco_atacado = 17,90` e `quantidade_gatilho = 0`, mas nenhuma faixa. Com 6 unidades o carrinho cobra 135,00 (varejo), e não 107,40. O operador vê o 17,90 no catálogo e o cliente é cobrado pelo varejo.

**Proposta de regra única (aguarda aprovação):**
1. Fonte oficial do preço ATACADO = faixas `precos_atacado` (já é o SSoT do servidor).
2. Migração de dados: para produto com `preco_atacado > 0` e `quantidade_gatilho_atacado > 0` sem faixa, criar uma faixa equivalente (`quantidade_minima = quantidade_gatilho_atacado`, `preco_unitario = preco_atacado`, `loja_id = null`). Migração pequena e reversível.
3. `produtos.preco_atacado` passa a ser exibido como derivado da faixa de menor quantidade (ou sai da UI de edição), sem ser lido pelo cálculo.
4. Nenhum desconto novo: o atacado é regra comercial cadastrada, revalidada no servidor. Desconto manual continua limitado pela alçada.

**Segurança desta rodada (corrigido e testado):** para linhas `MANUAL`/`PROMOCAO`, o servidor usava o `precoOriginal` enviado pelo cliente para medir o desconto. Um cliente adulterado podia enviar `precoOriginal = precoUnitario`, e o desconto medido virava zero, contornando a alçada. A referência agora é o varejo vigente no servidor (`caixaPrecoAutoritativoServer.ts`). Testes: `caixaPrecoAutoritativoServer.test.ts` (2 casos: desconto medido contra o varejo do servidor; preço manual acima do varejo rejeitado).

**Não implementado:** a migração de faixas e a mudança de UI do atacado. Dependem da decisão acima.

---

## Decisão 3 — Diagnóstico das falhas do Playwright

**Causa raiz principal (confirmada):** a configuração não alinhava a porta. `playwright.config` tinha `baseURL` 3002, mas os helpers (`e2e/helpers/url.ts`) montam URLs com `PLAYWRIGHT_BASE_URL`/`PLAYWRIGHT_TEST_PORT` e o padrão é **3000**. Em `localhost:3000` responde outro serviço (HTTP 426 "Upgrade Required"), por isso o `login-form` nunca aparecia. Correção: `playwright.pdv100.config.ts` define `PLAYWRIGHT_BASE_URL` e `PLAYWRIGHT_TEST_PORT` antes de os workers subirem, e o guard recusa alvo não local.

**Segunda causa (confirmada):** o seed não tinha a senha do DONO alinhada ao `.env.local`. Corrigido rodando o seed sancionado (`npm run seed:dev-users`), que é idempotente.

| # | Teste | Classificação | Situação atual |
|---|---|---|---|
| 1 | caixa-atacado ID 36 | Problema de ambiente (porta) | Passa na reexecução |
| 2 | caixa-fluxos-criticos | Problema de ambiente (porta) | Passa |
| 3 | caixa-golden-flow-cycle5 "venda DINHEIRO" | Problema de ambiente (porta) | Passa |
| 4 | caixa-modais-abrir-fechar | Problema de ambiente, depois instabilidade | Passa na reexecução |
| 5 | caixa-pagamento-atalhos "tecla 1" | Problema de ambiente (porta) | Passa |
| 6 | caixa-venda-em-espera | Problema de ambiente (porta) | Passa |
| 7 | caixa-venda-multi-pagamento "duas parcelas" | Problema de ambiente, depois instabilidade | Passa na reexecução |
| 8 | caixa-venda "busca produto demo" | Problema de ambiente (porta) | Passa |
| 9 | caixa.spec "página carrega cabeçalho" | Problema de ambiente (porta) | Passa |
| 10 | caixa.spec "busca e sair" | Problema de ambiente (porta) | Passa |

**Falhas que permanecem (rodada com todos os specs):**
- `caixa-venda-multi-pagamento` "três parcelas (DINHEIRO + PIX + DÉBITO)": falha com `ensureCaixaAberto` preso em `loading` por 40 s. **Causa ainda desconhecida**. A tela mostra o caixa aberto com "Fechar caixa" visível, então o predicado do helper não lê o estado. Hipótese: estado compartilhado entre testes do mesmo arquivo (venda em espera "Pedido #1" deixada por teste anterior). Não confirmada.
- `caixa-golden-flow-cycle5` "quantidade fracionada": passa isolado; falha depois do teste "venda DINHEIRO" no mesmo arquivo. Mesmo padrão `loading`. **Causa ainda desconhecida**; é dependência de ordem.
- `caixa-fase5b-*` (contas a receber, golden flow 5b): **pulados** pelo próprio teste (dependem de cliente e de contas a receber); não executados nesta rodada.

**Testes atualizados para a regra D-04:** `caixa-golden-flow-cycle5.spec.ts` agora testa que 0,5 em produto UN é recusado e o total não muda (antes esperava fração aceita). Fração aceita fica coberta pelos testes unitários (KG/M).

**Fixture de atacado:** o teste "ID 36" cria sua própria faixa e passou. A tabela `precos_atacado` está vazia no seed; por isso o atacado depende de fixture do próprio teste (ver D-11).

**Não resolvido com timeout ou retry**, como pedido. A única mudança de tempo é o helper `esperarHidratacao` (espera o React anexar handlers), usado antes de clicar no catálogo, que antes falhava por clique em HTML sem hidratação.

## Decisão 4 — Financeiro (homologação isolada)

**Configuração:** no banco local (`supabase_db_fastproduct`), loja Matriz:
- `contas_financeiras`: "Banco Matriz (homolog PDV-100)" (BANCO) para PIX; "Maquininha (homolog PDV-100)" (BANCO) para CARTAO_DEBITO e CARTAO_CREDITO.
- `financeiro_contas_forma`: PIX → Banco; CARTAO_DEBITO/CREDITO → Maquininha; DINHEIRO sem conta (vai para o caixa).

**Recebíveis pendentes** (criados antes da configuração, com conta NULL): cinco recebíveis (PIX 137,00, 45,00, 13,50, 9,00; DÉBITO 40,00). Recebidos pelo contrato existente (`financeiro_comando_v1`): `CONFIGURAR_RECEBIVEL` (conta, previsão 03/11/2026, taxa 0) → `RECEBER_VENDA`.
- Resultado: 5 recebíveis `RECEBIDO`, 5 movimentos `RECEBIVEL_VENDA`, soma 244,50 = soma dos recebíveis.
- Repetição de `RECEBER_VENDA` em recebível já recebido: bloqueada pela regra do contrato ("Configure taxa, conta e previsão antes de receber"); movimentos continuaram 5. **Sem lançamento duplicado.**
- Taxa 0 foi usada porque não há taxa de operadora cadastrada no ambiente. Taxas reais não foram testadas.

**Não testado:** cartão de crédito com parcelas, conciliação com extrato (`IMPORTAR_EXTRATO`, `CONCILIAR`), estorno (`ESTORNAR_RECEBIVEL`) e pagamento de contas a pagar. Ficam como pendência.

**Dinheiro:** não gera recebível. Entra em `caixas.saldo_atual` e no fechamento (conferido na rodada anterior: fundo 200 + vendas 234,90 = 434,90).

**Script usado:** `C:\Users\aoliv\AppData\Local\Temp\claude\pdv\d4_receber.sql` (fora do repositório; executado em transação com `COMMIT` apenas no banco local).
