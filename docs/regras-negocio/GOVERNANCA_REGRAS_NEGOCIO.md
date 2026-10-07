# Governança de Regras de Negócio do Jinlong

| Campo | Valor |
|--------|--------|
| **Status** | **OBRIGATÓRIO** para todas as novas sprints e módulos |
| **Data** | 2026-10-07 |
| **Mapa operacional** | [MAPA_DOMINIOS_REGRAS_NEGOCIO.md](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) |
| **Checklist de feature** | [CHECKLIST_FEATURE_DOMINIO.md](./CHECKLIST_FEATURE_DOMINIO.md) |
| **ADRs base** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · entity-ssot · inventários em `docs/architecture/` |
| **Gate de agentes** | `.cursor/rules/business-rules-governance.mdc` |

---

## Objetivo

Garantir que a evolução do Jinlong preserve **consistência, confiabilidade, rastreabilidade e uma única fonte de verdade**, evitando conflitos entre funcionalidades atuais e futuras.

Esta diretriz passa a ser obrigatória para todas as novas sprints e módulos.

---

## 1. Regra fundamental — um único dono

Cada informação ou regra crítica deverá possuir **um único domínio responsável**.

| Domínio | Responsabilidade |
|---------|------------------|
| **Produtos** | Cadastro e identidade do produto |
| **Estoque** | Saldo e movimentações |
| **Vendas** | Demanda comercial concluída (pedidos/vendas PDV) |
| **Caixa** | Turno físico, \(E(c)\), sangria/suprimento |
| **Compras** | Aquisição e pedidos a fornecedores |
| **Importações** | Processo de importação e custo nacionalizado |
| **Financeiro** | Contas, liquidações e movimentações financeiras |
| **Fiscal** | Regras e resultados fiscais |
| **Contábil** | Conciliação, pré-fechamento e visão contábil |
| **Intelligence** | Análise, previsão e recomendação (somente leitura dos SSoT) |
| **Mobile** | Interface operacional sobre os domínios existentes |

Essa divisão segue o princípio de **Single Source of Truth** já definido na arquitetura (ADR-005, entity-ssot).

---

## 2. Proibição de regras duplicadas

Uma regra crítica **não** poderá possuir implementações independentes em diferentes módulos.

Vale especialmente para:

- saldo de estoque;
- custo;
- custo nacionalizado;
- margem;
- preços;
- contas a pagar;
- contas a receber;
- saldo financeiro;
- impostos;
- classificações fiscais;
- disponibilidade de produto;
- situação de pedidos.

Interfaces, relatórios e Intelligence deverão **consumir** a fonte canônica.

---

## 3. Contratos entre domínios

Um domínio **não** deverá alterar silenciosamente os dados internos de outro.

Exemplos corretos:

| De → Para | Contrato |
|-----------|----------|
| Importações → Estoque | solicita entrada (RPC/orquestrador); **não** UPDATE direto em `estoque` |
| Compra/Importação → Financeiro | consequência econômica via título/movimento; **sem** segundo controle financeiro |
| Vendas → Estoque | baixa via orquestrador canônico (`finalizar_venda_*`); app não reimplementa |
| Vendas → Financeiro | CR parcial via RPC de venda (sales-led); liquidação fica em financial |

Isso preserva limites claros entre módulos (ADR-005 §4).

---

## 4. Checklist obrigatório para nova funcionalidade

Antes da implementação, toda feature deverá responder as 13 perguntas em
[CHECKLIST_FEATURE_DOMINIO.md](./CHECKLIST_FEATURE_DOMINIO.md).

Se as respostas não estiverem claras, a implementação **ainda não está pronta** para desenvolvimento.

---

## 5. Regra financeira transversal

Toda operação com consequência econômica deverá terminar corretamente no **Financeiro**, preservando sua origem.

Exemplo de cadeia:

**Demanda → Compra → Importação → Recebimento → Estoque → Financeiro**

O usuário deverá conseguir navegar do lançamento financeiro até a operação que o originou.

---

## 6. Número Explicável

Todo número crítico apresentado pelo Jinlong deverá ser rastreável.

O sistema deverá conseguir responder:

1. De onde veio esse valor?
2. Quais registros participaram?
3. Qual cálculo foi utilizado?
4. Qual regra estava vigente?
5. O valor está confirmado, estimado ou pendente?

Especialmente obrigatório para Financeiro, Fiscal, Importações, Contabilidade e Jinlong Intelligence.

---

## 7. Auditoria obrigatória

Alterações críticas deverão preservar:

**quem → quando → o quê → valor anterior → valor posterior → origem → motivo → aprovação (quando necessária).**

---

## 8. Gate arquitetural

> **Nenhuma nova funcionalidade será aprovada se criar uma segunda fonte de verdade, duplicar uma regra existente ou modificar outro domínio sem contrato explícito.**

Verificação prática antes do PR:

1. Preencher o [checklist de feature](./CHECKLIST_FEATURE_DOMINIO.md).
2. Confrontar o [mapa de domínios](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md).
3. Rodar guards relevantes (`npm run guard:domain`, `npm run check:entity-ssot -w pdv-importados`, etc.).
4. Marcar a seção **Governança de domínio** no template de PR.

---

## 9. Ação antes das novas sprints

Antes de implementar os grandes módulos planejados, o [Mapa de Domínios](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) deverá estar atualizado e confrontado com código/banco:

- Jinlong Importações;
- Central Fiscal;
- Contabilidade Assistida;
- Jinlong Intelligence;
- Demanda Comercial e Central de Compras;
- Jinlong Mobile / Operação por Scanner.

---

## Princípio final

**O Jinlong pode crescer em funcionalidades sem crescer em contradições.**

Quanto mais módulos forem adicionados, mais importante será manter:

**uma regra → um responsável → uma fonte de verdade → múltiplos consumidores.**
