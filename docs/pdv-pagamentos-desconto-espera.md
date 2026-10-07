# PDV — pagamentos, desconto e espera

Base: `origin/main` 069339477cf93af9a3fb5ae48b330c912e540c4c. Alterações isoladas na branch `codex/pdv-pagamentos-desconto`.

## Correções e comportamento

- Recebido em dinheiro e valores de pagamento dividido usam entrada textual decimal: aceita vírgula, ponto decimal e colagem BRL; não reformatam a cada tecla. Valores externos e auto-completar continuam sincronizados. Negativos, expoentes, mais de dois decimais e números fora da precisão segura são rejeitados.
- Trocar dinheiro por PIX/crédito/débito repõe o total exato, sem herdar o valor entregue em espécie. Pagamento eletrônico único acompanha mudanças de total e apresenta seu valor claramente. Valores parciais são informados pelo pagamento dividido.
- Desconto manual fica visível ao lado da busca: escolher produto, valor por unidade ou percentual, visualizar redução da linha e aplicar. Desconto é incremental sobre o preço atual. Totais e recibo usam o carrinho existente, com tipo MANUAL.
- Alçada configurada do operador, inclusive zero, descontos acumulados e preço mínimo são respeitados. O store aceita a alçada explícita do PDV; chamadores antigos mantêm o limite de 15%. O servidor continua revalidando a alçada. Não foi aberta exceção de autorização.
- Desconto gerencial existente continua exigindo autorização e pagamento totalmente em dinheiro. Desconto manual do operador funciona nas quatro formas dentro da alçada.
- Fonte base 16px, rótulos pequenos 14px e valores digitados 18px; ícones das formas 32px, textos/bordas mais escuros e pagamento com superfície branca. Estilos limitados ao PDV.

## Espera

Ações de colocar em espera, retomar e descartar possuem bloqueio de concorrência na UI. Falhas de listagem/gravação aparecem ao operador. Botões de espera e pagamento ficam desabilitados durante operações relevantes. Erros ao converter/devolver um pedido deixaram de ser engolidos: são registrados e avisados, sem transformar uma venda já concluída em nova tentativa.

O contrato existente do banco é EM_ESPERA → RETOMADA (claim exclusivo) → CONVERTIDA após concluir. Abandonar devolve RETOMADA → EM_ESPERA. Segunda retomada é recusada. Conversão repetida é idempotente. O cliente e descontos MANUAL são restaurados; preços comerciais são revalidados. Token de gerente não é restaurado e exige nova autorização.

Limites existentes: reparcar cria outro pedido e descarta a origem em chamadas separadas; converter/devolver também são operações separadas da venda. Uma falha pode deixar uma origem RETOMADA para recuperação. O bloqueio da UI não equivale a idempotência de criação no banco quando a resposta de rede se perde. Não se afirma garantia absoluta de todo cenário de indisponibilidade/concorrência. Não houve alteração desse contrato SQL nesta sprint.

## Administrativo e backend

A finalização mantém `finalizar_venda_transacional_canonica_v4`, com itens, bruto, desconto, líquido e pagamentos. O administrativo consulta os mesmos registros de `vendas`, `itens_venda` e `vendas_pagamentos`; não foi criado registro paralelo. O troco permanece limitado ao dinheiro e o valor enviado representa o pagamento líquido da venda.

Consulta somente de leitura no projeto Jinlong em 06/10/2026 confirmou: DINHEIRO, PIX, CARTAO_CREDITO e CARTAO_DEBITO ativos; retomada com claim e bloqueio da segunda retomada; finalização com controle de excesso, gravação de pagamentos e proteção de retry divergente. Registros do usuário são testes fictícios, preservados.

## Verificação

- Build de produção Next.js concluído; TypeScript e lint dos arquivos alterados/novos aprovados.
- 380 testes em 59 arquivos: caixa, pagamentos, desconto, espera, recibos e consulta administrativa.
- `backend/scripts/pdv-venda-espera.test.mjs`: SQL atual de claim, devolução, conversão, descarte e permissões em PostgreSQL descartável PGlite.
- `backend/scripts/pdv-pagamentos-transacao.test.mjs`: corpo SQL atual da finalização, quatro métodos, desconto persistido, divisão, retry e rollback. Fixtures isolam funções de estoque, arredondamento e evento; não substituem homologação do schema completo nem testes com múltiplas sessões.
- Navegador: componentes reais com respostas simuladas, quatro vendas, dinheiro/troco, desconto e total, divisão com vírgula/auto-completar, colocar em espera/retomar/finalizar. Prévia sem banco e sem cobrança.

PIX e cartões são registros operacionais no caixa. A validação não comprova liquidação bancária nem transação de adquirente/TEF. Nenhuma integração de cobrança foi criada ou presumida. A nova interface precisa de publicação e smoke test no ambiente publicado; não houve deploy, migration ou gravação no banco remoto.
