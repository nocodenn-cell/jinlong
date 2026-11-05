# JL-GO-LIVE-01 — Golden flow operacional do PDV: matriz de resultados

Data: 2026-11-05. Ambiente: cópia descartável `sec_gf01` (criada de `homolog_real`, migration `20261104180000` aplicada), via `sec_gf01_run` para cada execução. Nenhuma alteração em produção (`jinlong`) nem no homolog (`jinlong-homolog-palm`). Sem deploy, push ou merge.

Roteiro executável: `backend/scripts/go-live-01-golden-flow.test.sql`
Saída da execução: `docs/qa/evidencias/go-live-01_golden_flow_run.txt` (34 asserções `OK`, saída 0, 1,7 s).

Como rodar (cópia descartável, nunca produção):

```bash
docker exec supabase_db_fastproduct psql -U postgres -c "CREATE DATABASE sec_gf01_run TEMPLATE sec_gf01"
docker exec -i supabase_db_fastproduct psql -U postgres -d sec_gf01_run -v ON_ERROR_STOP=1 < backend/scripts/go-live-01-golden-flow.test.sql
```

## Veredito

**NO-GO mantido.** Os fluxos operacionais críticos estão comprovados no banco da cópia. Não há GO porque três itens da Etapa 4 e 5 não foram executados ou estão bloqueados (ver "Pendências").

## Matriz por fluxo

Legenda: PASSOU (verificado no banco dentro da transação) · FALHOU · NÃO TESTADO · BLOQUEADO · NÃO SUPORTADO (recusado pelo servidor nesta versão, com asserção negativa).

| # | Fluxo | Resultado | Evidência no banco (asserção) |
|---|---|---|---|
| 1 | Login do operador | PASSOU (camada RPC) / BLOQUEADO (tela) | `obter_status_caixa_operador` resolve caixa ABERTO do operador (bloco 1). Login de tela: ver E2E |
| 2 | Abertura de caixa | PASSOU, com ressalva | Caixa criado com `valor_inicial = 100`; saldo inicial = 100 (bloco 2). Não há RPC de abertura no banco: a abertura é inserção direta em `caixas`, a confirmar na tela |
| 3 | Busca por nome e código de barras | PASSOU | Mesmo produto ativo da loja por `codigo_barras` e por `nome` (bloco 3) |
| 4 | Venda simples | PASSOU | 2 × 10,00 em dinheiro: total 20, estoque −2, caixa +20 (bloco 4) |
| 5 | Venda fracionada 0,500 kg | PASSOU | Quantidade 0,5 gravada; estoque −0,5; PIX não entra no caixa em dinheiro (bloco 5) |
| 6a | Desconto permitido pelo operador | PASSOU | Manual 10% (limite 15%): desconto 1,00 gravado, caixa +9 (bloco 6a) |
| 6b | Desconto bloqueado | PASSOU | Manual 25% sem gerente: recusado `DESCONTO_MANUAL_EXCESSIVO`; nenhuma venda, estoque e caixa inalterados (bloco 6b) |
| 6c | Desconto com token do gerente | PASSOU | Global 25% com token: gravado, caixa +7,50, token marcado como usado (bloco 6c) |
| 7 | Pagamento dividido DINHEIRO + PIX | PASSOU | 30 = 10 dinheiro + 20 PIX; 2 parcelas; caixa recebe só os 10 (bloco 7) |
| 7b | Idempotência (repetir a mesma venda) | PASSOU | Sem parcela duplicada, sem baixa dupla de estoque ou caixa (bloco 7b) |
| 8 | Venda em espera e retomada | PASSOU | Salvar não baixa estoque; retomada dupla recusada `venda_em_espera_em_uso`; conversão baixa exatamente 1 (bloco 8) |
| 9 | Pagamento parcial a prazo (FIADO) | NÃO SUPORTADO | `FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO`; nenhum título gravado (bloco 9) |
| 9b | Crédito de cliente | NÃO TESTADO | Não exercitado nesta rodada |
| 10 | Comprovante | NÃO TESTADO | Não há RPC nem tabela de comprovante no banco; a emissão é de tela. Ver E2E |
| 11 | Cancelamento de venda | PASSOU | Estornado 20 em dinheiro, caixa −20, estoque +2, auditoria e devolução gravadas; repetição recusada; operador recusado (bloco 11). Gate A05 também passa |
| 12 | Devolução com estoque, caixa e auditoria | PASSOU | Estoque +1, caixa −9, 1 linha de pós-venda para a chave; repetição com a mesma chave sem efeito duplo; operador recusado `DEVOLVER_VENDA_SEM_PERMISSAO` (bloco 12) |
| 12b | Devolução com estorno financeiro (contas a receber) | NÃO TESTADO | Depende de título a prazo, que está desabilitado (item 9) |
| 13 | Transferência entre lojas | PASSOU | A −5, B +5 (mesma empresa); repetição com a mesma chave sem duplicar; saldo divergente recusado `TRANSFERENCIA_CONCORRENCIA`; destino de outra empresa recusado `ACESSO_EMPRESA_INVALIDA` (bloco 13) |
| 14 | Ajuste manual de estoque autorizado | PASSOU | Gerente ajusta de 90 para 87 com registro em `movimentos_estoque_log`; operador recusado `AJUSTE_ESTOQUE_PERFIL`; saldo defasado recusado `AJUSTE_ESTOQUE_SALDO_ALTERADO` (bloco 14) |
| 15 | Fechamento com diferença | PASSOU | Contado = sistema − 5,00: diferença −5,00 gravada, status FECHADO; venda em caixa fechado recusada `CAIXA_FECHADO` (bloco 15) |
| 16 | Reabertura do caixa | PASSOU | Gerente reabre com token de uso único: turno novo ABERTO, caixa anterior FECHADO preservado; reuso do token recusado `RETOMAR_CAIXA_TOKEN_INVALIDO` (bloco 16) |
| 16b | Consulta do histórico de vendas | PASSOU | Gerente vê 6 vendas no período, incluindo a cancelada (bloco 17) |

### Consistência (Etapa 3) por operação

| Verificação | Resultado |
|---|---|
| Total da venda (`vendas.total_liquido`, `total_desconto`) | PASSOU (blocos 4, 6a, 6c) |
| Valores por forma de pagamento (`vendas_pagamentos`) | PASSOU (blocos 4, 5, 7) |
| Saldo de caixa (`caixas.saldo_atual`) | PASSOU. Saldo final do caixa fechado = 127,50 (ver conta abaixo) |
| Movimentação de estoque (`estoque` e `movimentos_estoque_log`) | PASSOU (blocos 4, 5, 8, 11, 12, 13, 14) |
| Contas a receber / a pagar | NÃO TESTADO (prazo desabilitado; contas a pagar fora do fluxo de PDV) |
| Auditoria (`vendas_canceladas_auditoria`, `venda_pos_venda_operacoes`, `devolucoes`, `movimentos_estoque_log`) | PASSOU (blocos 11, 12, 14) |
| Idempotência | PASSOU: venda (7b), devolução (12), transferência (13), token (16) |
| Isolamento entre empresas | PASSOU: operador de outra empresa recusado em venda, transferência e histórico (bloco 18) |
| Integridade após falha | PASSOU: venda com item inválido não deixa venda, parcela ou estoque (bloco 19) |

Conta do saldo final (conferida): caixa 100 → +20 (venda 1) → +9 (desconto 10%) → +7,50 (desconto com token) → +10 (dinheiro do split) → +10 (venda da espera) → −20 (cancelamento) → −9 (devolução) = **127,50**. Estoque do arroz: 100 → 98 → 97 → 96 → 93 → 92 → +2 (cancelamento) 94 → +1 (devolução) 95 → −5 (transferência) 90 → 87 (ajuste) = **87**.

## Defeitos

Nenhum defeito de produto reproduzido nesta rodada. Todas as falhas que apareceram durante a construção do roteiro foram de fixture ou de uso da API, e foram corrigidas no roteiro, sem relaxar expectativa de segurança:

- `usuarios.loja_id` é NOT NULL: o DONO recebe loja (o gatilho de sincronização cria o vínculo).
- O gatilho `trg_usuarios_sync_vinculo` cria os vínculos de `usuario_vinculos`; inserir à mão duplicava a chave.
- `categorias` exige `empresa_id` quando há mais de uma empresa.
- `formas_pagamento.codigo` não aceita `FIADO`, `CREDIARIO`, `CREDITO_LOJA` ou `FIADO_LOJA` (constraint).
- Preço abaixo da referência exige `tipo_preco = 'MANUAL'`; o gerente aplica o desconto global sobre itens a preço cheio.
- O token de gerente para desconto vem de `tokens_desconto_gerente`; para reabertura, o requisitante precisa ser GERENTE.

Observações de comportamento que pedem decisão de produto (não são defeitos confirmados):

1. **Devolução e reabertura exigem gerente.** O operador é recusado (`DEVOLVER_VENDA_SEM_PERMISSAO`, `RETOMAR_CAIXA_REQUISITANTE_PERFIL`). Confirmar se é a regra desejada para o Jinlong.
2. **Ordem de validação na devolução.** Com itens vazios, a checagem de itens (`DEVOLVER_VENDA_ITENS_OBRIGATORIOS`) responde antes da de permissão. Ambas recusam, sem efeito; só muda a mensagem que um operador sem permissão recebe.
3. **Abertura de caixa sem RPC.** A abertura é inserção direta em `caixas` (RLS). Confirmar na tela que o fluxo não depende de RPC ausente.
4. **Cancelamento com caixa insuficiente.** O débito silencioso foi corrigido pela migration `20260909200000`, que rejeita explicitamente. O gate A05 prova isso e passou.

## Pendências (por que o veredito continua NO-GO)

1. **E2E de interface (Etapa 4): BLOQUEADO.** Motivos registrados:
   - O shell do agente está sem permissão para ler os arquivos `.env` do `pdv-importados`, então não há como confirmar a URL de teste nem obter as variáveis `PLAYWRIGHT_CAIXA_TEST_EMAIL` e `PLAYWRIGHT_CAIXA_TEST_PASSWORD`. Nenhuma credencial foi solicitada nem simulada.
   - A API local (`supabase_kong_fastproduct`, porta 54321) serve o banco `postgres` (3 lojas, origem não identificada como descartável). Os usuários e fixtures do golden flow estão em `sec_gf01`, que essa API não serve.
   - Solução necessária: indicar (a) a URL local da API e o banco que ela serve, (b) um usuário de teste com senha definida no `.env.test` do `pdv-importados`, e (c) confirmar que esse banco é descartável. Depois: `npx playwright test e2e/caixa-golden-flow-cycle5.spec.ts e2e/caixa-venda-multi-pagamento.spec.ts` com `PLAYWRIGHT_BASE_URL` local. Os specs já recusam alvo não local.
2. **Concorrência (Etapa 3 e 5): NÃO EXECUTADO.** Existem `backend/scripts/pdv-meios-pagamento-concorrencia.sh` e `backend/scripts/devolucao-concorrencia.sh`, que exigem duas sessões. Não rodados nesta rodada.
3. **Comprovante e crédito de cliente: NÃO TESTADOS.** Ver matriz (itens 9b e 10).
4. **Migration `20261104180000`: não aplicada no homolog.** Depende de autorização explícita.
5. **Contas a receber com devolução e contas a pagar no PDV: NÃO TESTADAS** (itens 12b e consistência).

## Commits

- Commit deste trabalho: roteiro `backend/scripts/go-live-01-golden-flow.test.sql`, saída em `docs/qa/evidencias/go-live-01_golden_flow_run.txt` e esta matriz. Sem push.
- Commits anteriores da mesma linha: `7d35133c`, `b41ca18a`, `cf4ffac2`.
