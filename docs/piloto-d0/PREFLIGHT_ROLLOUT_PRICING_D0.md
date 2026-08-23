# Preflight de rollout do pricing D0

## Bloqueio operacional

O inventário remoto somente leitura de 23/08/2026 encontrou **27 produtos** com
`preco_atacado` legado e sem tier ativo em `precos_atacado`. No comportamento
anterior, esses produtos podem obter atacado pelo fallback legado/global. Depois
da migration D0-01, produto sem tier aplicável recebe preço de varejo.

Esse conjunto não pode ser convertido automaticamente: não há quantidade mínima
por produto comprovada para criar o primeiro tier. Portanto, este PR não converte
configuração global em tier, não inventa quantidades e não altera dados remotos.
A configuração e a validação comercial precisam ocorrer antes do rollout.

O gate de rollout exige uma destas evidências aceitas pelo responsável comercial:

1. zero produtos ativos dependentes do legado; ou
2. lista formal dos produtos que devem permanecer somente no varejo; ou
3. tiers por produto configurados e validados.

O preflight reproduzível está em
[`backend/scripts/d0-pricing-legacy-preflight.sql`](../../backend/scripts/d0-pricing-legacy-preflight.sql).
Ele contém apenas consultas e retorna a listagem técnica e uma contagem agregada.
O resultado real não deve ser versionado se contiver dados comerciais.

## Waiver do lint do PDV local

O lint de `pdv-importados` é **não executável**, e não “aprovado”: ele falha antes
da análise de arquivos porque `@typescript-eslint/parser` não está disponível na
infra atual. A ausência é preexistente, a candidata não a introduziu e os
manifestos de pacotes permanecem idênticos ao upstream. Nenhuma dependência ou
configuração foi alterada para contornar o problema no D0.

Controles compensatórios desta candidata:

- TypeScript do PDV local;
- testes de pricing offline;
- testes diretamente relacionados às mudanças;
- revisão objetiva do diff.

A correção da infraestrutura de lint fica para trabalho separado, posterior ao
D0, sem ampliar o escopo desta PR.

