# Financeiro da loja

O módulo `/admin/financeiro` reúne planejamento, contas bancárias, despesas, títulos a receber, depósitos de PIX/cartão, conciliação e resultado gerencial. O saldo da gaveta continua sob responsabilidade de Caixas/PDV, conforme ADR-010.

## Contas e saldos (sprint ações rápidas)

A aba **Contas e saldos** exibe o **saldo registrado no sistema** por conta (caixa/reserva ou banco), entradas e saídas do período e extrato com origem/usuário. O saldo inicial continua sendo movimento auditável `SALDO_INICIAL`; o saldo atual não é editável diretamente.

Formas de pagamento podem apontar para uma conta financeira padrão (`formas_pagamento.conta_financeira_id`). Dinheiro → reserva; PIX/cartão → banco. Cartão/PIX só aumentam o saldo bancário na liquidação do recebível (após taxa). A captura de venda pré-preenche a conta sugerida, sem creditar saldo.

Ações rápidas fixas no topo do Financeiro: Registrar venda (PDV oficial), Receber, Pagar / Registrar despesa, Transferir. No Estoque: Entrada de mercadoria, Retirar, Ajustar — reutilizando NF-e/recebimento/ajuste existentes, sem gerar pagamento automático.

Inativação de conta preserva histórico; não há exclusão. Integração bancária real e importação automática de Pix/boletos ficam fora desta sprint.

---


1. Em **Categorias financeiras**, confirme o tipo de cada categoria: Receita, Despesa ou Ambos.
2. Em **Contas e movimentos**, cadastre cada banco e a reserva de numerário fora do PDV. Informe o saldo efetivamente conferido na data inicial. Saldo inicial não é receita e admite conta devedora.
3. Em **A pagar**, cadastre aluguel, energia, salários e outras despesas manuais. Fornecedor é opcional quando houver favorecido. O parcelamento divide o total; a recorrência repete o valor mensal por um número definido de meses, até 60. Vencimentos no dia 31 se ajustam ao último dia de cada mês.
4. Registre pagamentos e recebimentos na conta financeira correspondente. Baixas parciais atualizam o título e a conta na mesma transação. Dinheiro recebido/pago no PDV continua pelo fluxo existente. Use os históricos dos títulos para estornar baixas incorretas.
5. Em **PIX e cartões**, confira a taxa em reais, a conta e a previsão de depósito. É possível dividir um recebível em até 60 parcelas mensais, conferindo cada parcela separadamente. Registrar um depósito recebido movimenta o banco; uma previsão não movimenta saldo.
6. Em **Conciliação**, importe o CSV do banco e confira cada correspondência. Importar o extrato não cria receitas ou despesas. A conciliação exige conta e valor assinado iguais e permite desfazer com motivo, sem apagar histórico.

## Rotina e regras

- **Resumo:** projeção diária de 90 dias, saldos de 7/30/90 dias e pendências. Títulos vencidos entram em hoje; sem vencimento, taxa ou previsão não entram na projeção. Dívidas canceladas ficam fora.
- **Transferências:** bancos recebem duas contrapartidas. Para numerário do PDV, vincule uma sangria/suprimento já aprovado; a gaveta não se movimenta novamente. Estornar o movimento original também estorna sua contrapartida bancária.
- **Movimentos avulsos:** somente quando não houver título correspondente. Não registre um pagamento de despesa duas vezes como título e movimento avulso.
- **Novas vendas:** pagamentos eletrônicos geram recebíveis ao concluir a transação, incluindo vendas mistas. Dinheiro não gera depósito bancário. Não há reconstrução automática de recebimentos históricos ou de saldos antigos.
- **Pós-venda:** reembolsos eletrônicos se distribuem entre os recebíveis da venda, com preservação dos centavos, e compensam a conta vinculada quando já houve recebimento. A taxa original continua sendo despesa; eventual devolução de taxa deve ser conferida no extrato e registrada como ajuste. Dinheiro devolvido e crédito de cliente não descontam banco. Reembolsos por outra conta/meio exigem conferir e ajustar as contrapartidas na conciliação.
- **Correção de depósito:** o registro recebido pode ser estornado com motivo e voltar a pendente. Depósitos com reembolso posterior exigem revisão do pós-venda antes da correção.
- **Resultado:** o resultado de caixa exclui abertura e transferências. A estimativa gerencial combina vendas líquidas, custo histórico dos itens, despesas manuais por competência e taxas conferidas. Compras por NF-e ficam fora das despesas operacionais para não descontar mercadoria duas vezes. Custos/taxas ausentes ficam sinalizados; não é uma DRE contábil completa.
- **Histórico:** valores realizados não são reescritos. Correções criam contrapartidas e guardam usuário, data e motivo. Repetir uma requisição com os mesmos dados não duplica seu efeito.

## Formato do extrato

```csv
referencia;data;descricao;valor
BANCO-001;2026-10-04;Depósito;100.50
BANCO-002;2026-10-04;Tarifa;-3.20
```

Até 500 linhas por importação; datas `AAAA-MM-DD`; valores positivos para crédito e negativos para débito. A referência precisa ser estável e única dentro da conta. Reimportar uma referência idêntica não duplica; alterar os dados de uma referência já importada é recusado. Campos não podem conter ponto e vírgula. Não há conexão automática com bancos/adquirentes nesta entrega.

## Implantação e validação

A migration `financeiro_loja_contas_ledger` é aditiva e deve entrar antes da versão web. Não preenche saldos, taxas ou datas históricas por estimativa. A fila fiscal existente mantém seu modo atual; esta entrega não implementa emissão fiscal real. Comprovantes são registrados como referência/observação, sem envio de arquivo.

Escritas novas usam RPCs com perfil gerencial e loja do usuário. As tabelas novas têm RLS e não aceitam escrita direta de `anon`/`authenticated`. As baixas existentes continuam em suas RPCs; alterações diretas no histórico de pagamentos/liquidações são bloqueadas.

As três RPCs públicas usam `SECURITY DEFINER` intencionalmente, com autenticação, perfil, loja e permissões explícitas. O advisor pode apresentar o [aviso de execução de RPC privilegiada por usuário autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); os testes verificam os limites desse acesso. As funções internas não são executáveis por clientes.

Verificações:

```sh
npm run test:financeiro-loja -w fastproduct-backend
npm run test -w pdv-importados
npm run typecheck -w pdv-importados
npm run lint -w pdv-importados
npm run guard:all
npm run build -w pdv-importados
```

Os testes do banco usam PostgreSQL em memória e as migrations originais das RPCs de baixa/estorno, com catálogo preexistente simplificado. Cobrem centavos, vencimentos, competência, repetição, saldo, baixas/estornos, conciliação, venda mista, parcelamento, reembolso, correção de depósito, RLS, perfil e isolamento entre lojas. O CI também executa a suíte contra a instalação local completa do Supabase e verifica o contrato de tipos.

Em caso de problema na versão web, reverter a versão do aplicativo preserva o histórico novo no banco; as rotinas anteriores permanecem disponíveis. Não apagar as tabelas financeiras após o cliente começar a operar.

## Pendência anterior de alinhamento remoto

Auditoria final de 05/10/2026: [diagnóstico, fluxos, segurança, testes e classificação das 19 pendências](audits/FINANCEIRO_HARDENING_2026_10_05.md).
A migration `20261005091218_financeiro_hardening_final.sql` é uma proposta de
correção adicional nesta PR e não foi aplicada em produção. Ela corrige a
classificação do estorno de transferência PDV e restringe o acesso direto aos
títulos/históricos por loja, mantendo a criação manual de AR validada.

Na verificação de implantação de 04/10/2026, a migration financeira nova está registrada no remoto como `20261005004647`. O gate remoto identifica 19 migrations anteriores ausentes: 18 de vendas/fiscal/segurança e a proposta de validação de fechamentos `20260929120000`. Essas pendências não devem ser marcadas como aplicadas nem dispensadas pelo gate sem execução ou prova de equivalência.

A proposta de fechamento exige conferir os seis caixas históricos incompletos antes de impor a constraint. Não preencher valores de fechamento por estimativa. A aplicação das demais migrations altera o escritor central de vendas e a fila fiscal e depende de autorização específica para ampliar esta entrega; a revisão automática bloqueou essa aplicação. As melhorias financeiras preservam as rotinas fiscais existentes enquanto essa decisão está pendente.
