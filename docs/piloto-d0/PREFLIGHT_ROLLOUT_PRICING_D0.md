# Preflight de rollout do pricing D0

## Bloqueio operacional

**Atualizado em 23/08/2026 (segunda leitura, preflight corrigido).** A primeira
leitura de 23/08/2026 contava **27 produtos** comparando apenas *existência* de
tier ativo. Revisão do Codex na #321 apontou que esse critério esconde produtos
com tier ativo cujo `quantidade_minima` é maior que o limiar legado
(`pdv_config.quantidade_minima_atacado_padrao`, hoje 6): para quantidades entre
o limiar legado e o menor tier, `calcular_preco_produto` já cai para varejo hoje
mesmo antes da migration, mas o preflight antigo classificava esse produto como
"coberto". O preflight foi corrigido para comparar o **menor tier ativo** contra
o limiar legado, não apenas sua existência
([`backend/scripts/d0-pricing-legacy-preflight.sql`](../../backend/scripts/d0-pricing-legacy-preflight.sql)).

Nova leitura remota, somente SELECT (nenhuma escrita), com o preflight corrigido:
**34 produtos** com `preco_atacado` legado sem cobertura de tier equivalente
(29 ativos, 5 inativos). Dos 34, 7 têm algum tier ativo mas com `quantidade_minima`
acima do limiar legado (o grupo que o preflight antigo escondia); os demais 27 não
têm nenhum tier ativo — o número antigo era o subconjunto sem tier nenhum, não o
total real de produtos afetados pela migration.

No comportamento anterior, esses produtos podiam obter atacado pelo fallback
legado/global. Depois da migration D0-01, produto sem tier aplicável na
quantidade pedida recebe preço de varejo.

Esse conjunto não pode ser convertido automaticamente: não há quantidade mínima
por produto comprovada para criar o primeiro tier. Portanto, este PR não converte
configuração global em tier, não inventa quantidades e não altera dados remotos.
A configuração e a validação comercial precisam ocorrer antes do rollout.

O gate de rollout exige uma destas evidências aceitas pelo responsável comercial,
em uma destas alternativas — nenhuma foi escolhida automaticamente:

**A.** cadastrar tiers equivalentes aos preços legados para os 34 produtos (ou o
subconjunto ativo que o negócio decidir manter em atacado); ou
**B.** aceitar formalmente que esses produtos deixem de aplicar atacado
automático a partir do rollout; ou
**C.** manter o rollout bloqueado até uma das duas decisões acima.

O preflight reproduzível está em
[`backend/scripts/d0-pricing-legacy-preflight.sql`](../../backend/scripts/d0-pricing-legacy-preflight.sql).
Ele contém apenas consultas e retorna a listagem técnica e uma contagem agregada.
O resultado real (lista de 34 produtos, preços) não é versionado aqui por conter
dado comercial — foi entregue ao responsável fora deste repositório.

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
