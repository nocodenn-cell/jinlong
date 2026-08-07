# Auditoria UI/UX — Jinlong

**Aberto em:** 2026-08-07 · **Sprint:** UI/UX 01 · **Status:** mapeamento, sem implementação

> Base: `Jinlong/04_PDV.md`, `Jinlong/05_CADASTRO_PRODUTO.md`,
> `Jinlong/07_DECISOES_ARQUITETURAIS.md` e as auditorias da frente de migrations
> (`docs/RELATORIO_FECHAMENTO_SPRINT_MIGRATIONS_20260807.md`).
>
> **Regras desta sprint:** não refatorar arquitetura, não alterar regras de
> negócio, não criar abstrações sem necessidade. Objetivo: menos cliques,
> operação mais rápida, experiência de ERP comercial maduro.
>
> **Referência de fluxo:** Bling como benchmark de *fluxo*, não de aparência.

---

## Como ler este documento

Cada achado tem: **tela · problema · impacto operacional · prioridade · proposta ·
risco técnico**.

Prioridades: **P0 venda** (bloqueia ou atrasa a venda) · **P1 operação**
(atrasa rotina não-venda) · **P2 melhoria**.

**Separação deliberada entre o que está verificado e o que falta medir.** A §1
lista achados com evidência em código ou em log desta sessão. A §2 lista o escopo
que exige observação com o sistema rodando e ainda **não** foi medido — está
declarado como pendente em vez de preenchido com suposição, porque um documento
de UX cheio de achados não verificados é pior que um documento curto.

---

## 1. Achados verificados

### UX-01 · Erro de venda em espera aparece depois da venda concluída

| Campo | Conteúdo |
|---|---|
| **Tela** | PDV → fechamento de venda a partir de pedido em espera |
| **Problema** | `caixaVendaEspera.impl.ts:186` chamava `converter_venda_em_espera`, que não existia em produção. O erro (PGRST202) chegava à tela **depois** de a venda já ter sido finalizada e registrada. |
| **Impacto** | O operador vê erro numa operação que **deu certo**. Sem saber disso, tende a repetir — risco de venda duplicada, que é o P0 histórico deste PDV. |
| **Prioridade** | **P0 venda** |
| **Proposta** | Causa corrigida (migration 310). O que fica para UX: **separar visualmente "venda concluída" de "pós-processamento falhou"**. Erro em etapa posterior à venda nunca deve usar a mesma linguagem de erro de venda. |
| **Risco técnico** | Baixo — mudança de mensageria, sem tocar no fluxo transacional. |

### UX-02 · Pedido em espera some da lista ao ser retomado

| Campo | Conteúdo |
|---|---|
| **Tela** | PDV → lista de vendas em espera → retomar |
| **Problema** | `retomar_venda_em_espera` (versão antiga) gravava `status='RETOMADA'` no ato da retomada, e `listar_vendas_em_espera` filtra `EM_ESPERA`. Retomar o cupom errado e desistir **apagava o pedido do cliente**. |
| **Impacto** | Re-digitação completa do carrinho na frente do cliente. |
| **Prioridade** | **P0 venda** |
| **Proposta** | Causa corrigida (migration 310 — retomar não consome). Para UX: confirmar que a lista mostra o pedido como "em atendimento" sem removê-lo, e que existe caminho explícito de "devolver à espera". |
| **Risco técnico** | Baixo. |

### UX-03 · Limite de desconto do PDV divergia do limite do servidor

| Campo | Conteúdo |
|---|---|
| **Tela** | PDV → aplicar desconto manual em item |
| **Problema** | `unifiedCartStore.ts` tinha `const maxPermitido = 15`, enquanto a autoridade é `pdv_config.max_desconto_manual_item_percentual`. Mudar o limite no banco não mudava o PDV. |
| **Impacto** | Operador bloqueado (ou liberado) no valor errado e **só descobre quando o trigger recusa a venda** — no fechamento, com o cliente esperando. |
| **Prioridade** | **P0 venda** |
| **Proposta** | Causa corrigida (migration 313 + store). Para UX: **mostrar o teto vigente no campo de desconto** em vez de deixá-lo implícito, e validar durante a digitação, não no fechamento. |
| **Risco técnico** | Baixo. |

### UX-04 · Três recursos de observabilidade visual entregues e desligados

| Campo | Conteúdo |
|---|---|
| **Tela** | PDV e painel admin |
| **Problema** | `pdv_config_flags_visuais()` em produção era um stub (`SELECT false,false,false,false`) sem ler `pdv_config`. `show_margin_visual`, `show_preco_fonte` e `show_stock_alerts` ficavam permanentemente `false`. |
| **Impacto** | Indicador de margem, fonte do preço (varejo/atacado/promoção) e alerta de estoque foram construídos e nunca apareceram. O operador não vê **por que** um preço foi aplicado — informação central para vender no atacado com confiança. |
| **Prioridade** | **P1 operação** |
| **Proposta** | Causa corrigida (migration 311). Para UX: decidir se essas flags devem nascer ligadas, e desenhar como a fonte do preço aparece na linha do carrinho sem poluir. |
| **Risco técnico** | Baixo — as flags já existem e são reversíveis por configuração. |

### UX-05 · Falhas de registro de auditoria são silenciosas para o operador

| Campo | Conteúdo |
|---|---|
| **Tela** | PDV → fechamento de venda |
| **Problema** | `registrarAlertasLevesVenda.ts:80` engole qualquer erro num `catch` que só faz `console.warn`. Combinado com o kill switch desligado, a seção ALERTA da trilha de auditoria (`app/admin/auditoria/actions.ts:279`) ficava sempre vazia — e a leitura de `system_alerts` também degrada em silêncio (`const rows = error ? [] : …`). |
| **Impacto** | A trilha aparenta estar completa quando não está. Quem audita não distingue "sem anomalias" de "não registrou". |
| **Prioridade** | **P1 operação** |
| **Proposta** | Manter o `catch` (a venda não pode falhar por causa do alerta), mas **a tela de auditoria precisa distinguir "nenhum evento" de "fonte indisponível"**. |
| **Risco técnico** | Baixo. Não alterar o comportamento best-effort da escrita. |

### UX-06 · Telas de Gerente duplicadas em Admin V2

| Campo | Conteúdo |
|---|---|
| **Tela** | `/gerente/*` × `/admin/*` |
| **Problema** | O `check-entity-ssot-boundary` reporta 5 páginas legadas marcadas `@legacy Gerente; migrado para Admin V2; remover após validação`: `compras`, `financeiro`, `produtos`, `relatorios`, `vendas`. |
| **Impacto** | Dois caminhos para a mesma operação. Treinamento ambíguo, divergência de comportamento e manutenção dobrada. |
| **Prioridade** | **P1 operação** |
| **Proposta** | Decidir e executar a remoção do caminho legado — é decisão de produto, não refatoração. Enquanto coexistirem, sinalizar o legado na própria UI. |
| **Risco técnico** | Médio — exige confirmar paridade funcional antes de remover. |

### UX-07 · Cadastro de fornecedor embutido no formulário de produto

| Campo | Conteúdo |
|---|---|
| **Tela** | Cadastro de produto → campo Fornecedor |
| **Problema** | `components/gerente/produtos/form/fields/FornecedorCombobox.tsx` cria fornecedor inline; o guard marca como `[ssot:shortcut]`, preferindo `/admin/fornecedores`. |
| **Impacto** | **Ambíguo, e por isso listado sem veredito.** Cadastro inline reduz cliques (bom para o objetivo desta sprint) e ao mesmo tempo cria fornecedores sem os campos que a especificação exige. Precisa de decisão explícita, não de remoção automática. |
| **Prioridade** | **P2 melhoria** |
| **Proposta** | Definir o conjunto mínimo de campos para criação inline e exigir complemento depois, ou remover o atalho. Não decidir sem olhar a especificação de fornecedor. |
| **Risco técnico** | Baixo. |

### UX-08 · `CaixaPageClient.tsx` concentra a orquestração do PDV

| Campo | Conteúdo |
|---|---|
| **Tela** | PDV (todo) |
| **Problema** | 1638 linhas num único client component, coordenando scan, carrinho, desconto, gerente, pagamentos, movimentação de caixa e espera. |
| **Impacto** | Não é problema de UX para o operador **hoje**. É risco de execução para esta sprint: toda melhoria de fluxo passa por esse arquivo, elevando a chance de regressão em cada mudança. |
| **Prioridade** | **P2 melhoria** |
| **Proposta** | **Não refatorar nesta sprint** (a regra é explícita). Registrar como restrição de planejamento: mudanças no PDV pedem teste de comportamento junto. |
| **Risco técnico** | Alto se refatorado agora; nulo se apenas observado. |

---

## 2. Escopo declarado e ainda não medido

Estes itens estão no pedido da sprint e **exigem observação com o sistema
rodando** — cronometrar fluxo, contar cliques, testar leitor físico. Não foram
medidos e **não vou preenchê-los por suposição**.

### PDV

| Item | O que precisa ser medido | Método |
|---|---|---|
| Velocidade de venda | Tempo do 1º bip ao comprovante, em venda de 1 item e de 10 itens | Cronometrar com leitor real |
| Quantidade de cliques | Cliques/teclas por venda, por caminho (bip, busca, espera) | Contagem manual por cenário |
| Pesquisa de produto | Tempo até o resultado; comportamento com termo ambíguo | Já existe `variantesChaveLeitura`; medir acerto |
| Leitura de código de barras | Taxa de erro do pipeline `IDLE→SCANNING→RESOLVING→ADDING_TO_CART` | Leitor físico + códigos reais do estoque |
| Carrinho | Edição de quantidade, remoção, desfazer (`ultimoRemovido` já existe) | Percurso guiado |
| Aplicação de desconto | Cliques até aplicar; clareza do teto (ver UX-03) | Percurso guiado |
| Seleção varejo/atacado | Se a troca de faixa é percebida pelo operador (ver UX-04) | Percurso guiado |
| Múltiplos pagamentos | Cliques para split; correção de valor digitado errado | Percurso guiado |
| Venda em espera / recuperação | Cliques para guardar e retomar; achabilidade na lista | Percurso guiado |
| Fechamento de venda | Passos até concluir; clareza do troco | Percurso guiado |

**Ativo já existente a considerar antes de propor mudança:**
`CaixaKeyboardShortcutsReference.tsx` — há atalhos de teclado implementados. Em
PDV maduro o teclado vence o mouse; medir **adoção** antes de propor reduzir
cliques de mouse pode mudar a conclusão.

### Cadastro de produtos

Campos que a especificação (`Jinlong/05_CADASTRO_PRODUTO.md`) exige por impacto
operacional futuro: fornecedor, categoria, marca, estoque mínimo, localização,
imagem, preço de custo, varejo, atacado, histórico de preço.

Pendente: mapear quais são obrigatórios hoje × quais a especificação exige, e
onde o formulário força preenchimento que poderia ser diferido. `produtos` já
tem `localizacao_prateleira`, `nome_reduzido_pdv`, `ncm`, `marca_id`,
`fornecedor_id`, `imagem_url` — a estrutura existe; falta avaliar o fluxo.

### Auditoria UX transversal

Pendente: telas inconsistentes, componentes duplicados além do UX-06, problemas
de navegação, excesso de cliques, falta de feedback operacional.

**Restrição de desenho, válida desde já:** o sistema precisa manter
rastreabilidade completa das operações. Toda proposta de reduzir passos deve
declarar o que acontece com o registro de auditoria daquele passo — UX-05 mostra
o custo de tratar auditoria como efeito colateral silencioso.

---

## 3. Lição da sprint anterior aplicável ao desenho

A frente de migrations fechou com um padrão que vale para UX:

> Falha que se disfarça de outra coisa custa meses.

Três exemplos concretos: um gate de RLS que acusava regressão quando o problema
era credencial vencida (3 meses cego); uma seção de auditoria sempre vazia que
parecia "sem anomalias"; um erro de pós-venda com a mesma cara de erro de venda.

**Consequência para esta sprint:** ao reduzir cliques, não reduzir *sinal*. Cada
passo removido deve deixar claro o que aconteceu — especialmente quando falha.

---

## 4. Próximo passo

1. Sessão de observação do PDV com leitor real e operador, preenchendo a §2.
2. Percurso completo do cadastro de produto contra `Jinlong/05_CADASTRO_PRODUTO.md`.
3. Só então priorizar e propor — nenhuma implementação antes deste documento estar
   preenchido.
