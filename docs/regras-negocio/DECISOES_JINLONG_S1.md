# Decisões do Jinlong — auditoria de integração (S1 em diante)

| Campo | Valor |
|---|---|
| Data | 2026-10-29 |
| Origem | Auditoria de integração Importação × Compras × NF-e × Recebimento × Estoque × AP × Custo × Preço |
| Relacionado | `PLANO_APLICACAO_S1_PRODUCAO.md`, PR #648 |

## Decisões

| ID | Tema | Decisão |
|---|---|---|
| D1 | Custo médio | Média ponderada móvel por loja. Quatro casas decimais internas; dois decimais em valores monetários exibidos. Data de corte só depois de reconciliação. Tributos recuperáveis sujeitos à validação contábil. |
| D2 | `produtos.preco_custo_medio` | Mantida temporariamente por compatibilidade. Sem cache adicional. Estoque é a fonte de verdade antes de qualquer migração. |
| D3 | Conciliação NF-e × duplicatas | Diferença máxima de R$ 0,01 por arredondamento, depois de identificar o valor financeiro conciliável. Não presumir que o total da NF-e é igual à soma das duplicatas em todos os casos. |
| D4 | Contas a pagar da importação | Obrigações individualizadas por credor e documento, sem duplicar AP existente. Tributos só quando representam obrigação financeira identificada. |
| D5 | Importação Internacional | Módulo opcional. Ativação exclusiva por operador SaaS autorizado. Planos comerciais definidos depois. |
| D6 | Transferências entre CNPJs | Bloquear operações não suportadas pelo fluxo fiscal. Remetente, documento e CFOP definidos conforme a operação e validados pela contabilidade. |
| D7 | Preço de venda | Margem mínima gera aviso. Alteração aprovada por DONO, ou por GERENTE expressamente autorizado. Restrições legais e comerciais continuam bloqueantes. |
| D8 | Custo landed da importação | Custo aprovado não altera o custo médio antes do recebimento físico. |
| D9 | Funções legadas | Planejar a aposentadoria. Revogação só após análise de consumidores, testes e aprovação específica. |
| D10 | Perfil ADMIN global | Permanece temporariamente, com acesso controlado e auditado. Retirada após migração comprovada dos consumidores. |
| D11 | Nomenclatura | Separar "NF-e de Entrada" de "Importação Internacional". |
| D12 | Origem do crédito de estoque | Recebimento físico é a origem do crédito. NF-e posterior é vinculada sem novo crédito. |
| D13 | CMV de vendas passadas | Ajuste contábil de CMV no período apropriado, mediante política validada. Vendas históricas nunca são reescritas. |
| D14 | Produtos entre lojas | Produtos continuam por loja no MVP. Identificação de produtos equivalentes planejada, sem catálogo global obrigatório. |

## Como estas decisões foram aplicadas no PR #648

- **D12:** a NF-e vinculada a recebimento já prevista no fluxo atual não gera crédito novo. A proteção contra dupla creditação entre origens fica para o S2.
- **D14:** a `produto_equivalencias` (G14) é uma tradução opcional. Sem equivalência, a transferência usa o mesmo `produto_id`, válido para o catálogo da empresa (fase 5). A regra inicial que exigia equivalência foi ajustada na revisão do PR.
- **D6:** a transferência entre CNPJs distintos é bloqueada para todos os perfis (S1b).
- **D1, D2, D3, D4, D5, D7, D8, D9, D10, D11, D13:** registradas aqui para os próximos sprints (S2, S3, S4, S5, S6, S7, S8 e S9). Nenhuma foi implementada ainda.

## Pendências de validação

- **D3 e D6:** dependem de validação contábil e fiscal.
- **D1 e D13:** dependem de validação contábil antes da implementação do custo médio.
