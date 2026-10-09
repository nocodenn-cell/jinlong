# Jornadas Operacionais — Jinlong

**Como ler:** "Telas" e "trocas de contexto" foram contadas pelas **rotas e abas** que o usuário atravessa (verificável no código). **Cliques não foram medidos em runtime** — a linha "Cliques (estimado)" é projeção de leitura e deve ser substituída por medição no teste de usabilidade (`PLANO_TESTES_USABILIDADE.md`). A jornada A (PDV) se apoia em `audit-fluxos_operacionais_jinlong.md` (17/09), parcialmente reconferido: itens já corrigidos foram removidos.

Legenda de confiança: **A** = lido no código nesta sprint · **M** = herdado do audit de 17/09, não reconferido · **N** = não verificado.

---

## A. Realizar uma venda — `/caixa`

| Etapa | Estado | Conf. |
|---|---|---|
| Localizar produto (bipe/busca) | `CaixaSearchBar`, no fluxo | M |
| Varejo × atacado, quantidade | Preço escalonado no carrinho (`CaixaCartList`) | M |
| Cliente | Abas Produto/Cliente/Pagamento; Alt+C ou menu Operações — pouco visível | M |
| Pagar, finalizar (F4) | RPC única; recibo mostra cliente (`CaixaReciboModal.tsx:186`) | **A** |
| Histórico / reimpressão | Fora do PDV: `/admin/vendas` → detalhe → reimpressão (`VendaReimpressaoModal`) | **A** |
| Devolução/cancelamento autorizado | Detalhe de venda mostra cancelamento; **fluxo de devolução não localizado nas telas admin** | N |

Telas: 1 (PDV) para vender · 2 (PDV→Painel) para consultar histórico. **Saída do fluxo:** só para consultar venda passada (esperado). Não há atalho PDV → painel exceto "Ir para PDV" no sentido inverso; operador (OPERADOR) **não acessa** `/admin` (`painelGerencial.ts`).
Ressalva: a navegação do painel **não toca** o PDV; esta sprint não deve aumentar o tempo da venda.

## B. Cadastrar e vender um produto novo

| Etapa | Onde | Conf. |
|---|---|---|
| Cadastrar, categoria, custo, preço varejo/atacado, qtd. mínima, estoque inicial | **uma só tela** (modal `ProdutoForm`; RPC `criar_produto_com_estoque_inicial`); atacado fica em "Mais detalhes" | M |
| Publicar/disponibilizar | Gate de publicação existe (`CatalogoPublicacaoActions.tsx`) | **A** (existência) |
| Achar no PDV | `/caixa` busca | M |

Telas: 1 (Catálogo+modal) → 1 (PDV). **Jornada já é curta.** O problema não é fragmentação, é descobrir o atacado (3 níveis de revelação). Recomendação: **não mexer na estrutura**; só tornar "atacado" visível no formulário.

## C. Comprar e receber mercadorias — **maior fragmentação** (parcialmente resolvida)

> **Correção (09/10, ao implementar o PR 6):** a "porta única de recebimento" **já existe**. `RecebimentoGerentePageClient.tsx` tem o bloco "Como chegou?" (NF-e · Ordem de Compra · Sem documento · Receber sem valores · Histórico), com texto de ajuda por via, e a OC abre `…/recebimento?modo=pedido&oc=<id>` (`OcDetalheModal.tsx`) com aviso de duplicidade. Entregue por #459, #464 e UX-018. Os trechos abaixo que dizem "3 portas sem pergunta" ou "sem vínculo OC↔recebimento" descrevem o estado de 17/09 e **estão desatualizados**.


Caminho com Ordem de Compra: `Fornecedores` (1) → `Compras` (2, criar OC) → detalhe da OC → "Registrar Recebimento" (conferência + crédito, 2 RPCs em 1 clique) → `Financeiro > A pagar` (3, verificar obrigação) → `Estoque` (4, conferir saldo).
Caminho NF-e: `Estoque > Entradas` → `Importar NF-e` (4 fases) → link para A pagar (**existe**, `ImportarNfePageClient.tsx:1189`).
Caminho manual: `Estoque > Entradas` (origem em texto livre; 1 item por vez).

| Métrica | Valor |
|---|---|
| Módulos distintos atravessados | Fornecedores, Compras, Financeiro, Estoque = **4** (sidebar: 4 itens em 3 grupos diferentes) |
| Caminhos paralelos para "chegou mercadoria" | **3** (OC / NF-e / manual) sem pergunta inicial "tem pedido?" |
| Vínculo OC↔recebimento manual | **Inexistente** (audit 2.1; risco de duplicidade) |
| Obrigação financeira após receber OC | Não confirmado nesta sprint se a OC gera título a pagar (N) |
| Divergência | Só dentro das conferências; sem tela de histórico (N) |

Conclusão: **fragmentação de processo comprovada** (FP). Reduz-se por *porta única "Receber mercadoria"* e links, **sem fundir as regras transacionais**.

## D. Fechar o caixa

PDV: Fechamento (F6), contagem de espécie, divergência >R$5 exige motivo, RPC atômica (M). Painel: `/admin/caixas` (abertos + histórico). **Sem link** entre a linha do turno e as vendas daquele turno ou o comprovante (**A**: `caixas/_components` sem `Link`). Gerente que investiga divergência sai de Caixas e filtra Vendas à mão (2 telas, contexto perdido).

## E. Administrar funcionários

`Funcionários` (cadastro, perfil só OPERADOR/GERENTE — `funcionarioPolicies.ts`) → `Comissões` (apuração/liquidação). **Sem link entre as duas telas.** Permissões: **não há atribuição de permissões**; perfil é fixo (4 valores). "Configurar comissões" e "consultar desempenho" **não localizados** nesta passada (N) — verificar antes de prometer na nova IA.

## F. Proprietário acompanha o negócio

`Visão Geral` (1) concentra KPIs, pedidos recentes, estoque, atalho do caixa. Caminhos adicionais: vendas (Relatórios view), DRE (view), contas vencendo (Financeiro > A receber/A pagar), caixa (Caixas). O **Dashboard não linka para Financeiro** (zero `ROUTES.admin.financeiro` em `dashboard/` — herdado do audit 8.4, M). "Pendências operacionais" como lista única: **não existe**. O dono navega em 4–5 módulos para responder "como está o negócio".

## G. Auditoria

`Auditoria` (1): linha do tempo com filtros. `Estoque > Kardex` → link para auditoria **existe** (`KardexSheet.tsx:23`); o inverso **não** (`AuditoriaTimeline` sem `Link`). Usuário responsável/data: presentes na linha do tempo (M). Cancelamentos: visíveis no detalhe da venda (A) e na auditoria (N).

---

## Resumo comparativo (base para metas)

| Jornada | Módulos | Fragmentada? | Principal desperdício | Dá para reduzir ≥25% sem mexer em regra? |
|---|---|---|---|---|
| A Venda | 1 | Não | Cliente pouco visível | Não aplicável (não tocar) |
| B Produto novo | 2 | Não | Atacado escondido | Só descoberta |
| **C Compra/Receber** | **4** | **Sim** | 3 portas sem pergunta; ida e volta Compras↔Financeiro↔Estoque | **Provável** (porta única + links) |
| **D Caixa** | 2 | Sim (leve) | Falta turno→vendas | Sim (1 link) |
| **E Funcionários** | 2 | Sim | Falta func.↔comissão | Sim (1 link) |
| **F Dono** | 4–5 | Sim | Sem pendências unificadas | Sim (cartão de pendências com links) |
| **G Auditoria** | 2 | Sim (leve) | Falta auditoria→produto | Sim (1 link) |

**Meta de −25% de cliques só se valida com medição de baseline.** Hoje não existe baseline medido; a primeira tarefa do plano de testes é medi-lo.
