# Plano de Testes de Usabilidade

Nada aqui foi executado. Metas da missão (≤10 s para achar, ≤2 níveis, −25% de cliques em jornadas fragmentadas) são **hipóteses**; ainda **não existe baseline medido**, então o primeiro passo é medir o estado atual.

## 1. Participantes (mínimo viável)
| Grupo | Qtd. | Observação |
|---|---|---|
| Dono/gerente, comerciante chinês (usa ZH) | 3 | Sessão no idioma ZH; intérprete ou facilitador falante nativo |
| Dono/gerente brasileiro | 3 | PT |
| Funcionário que opera o painel esporadicamente | 2 | Baixa familiaridade |
| O proprietário do produto | 1 | Quem relatou "não acho nada" — caso-âncora |
OPERADOR de caixa só entra no teste de não-regressão do PDV (a navegação nova não o toca).

## 2. Ambiente
Homologação isolada ou local com dados fictícios (nunca `jinlong.app`, nunca credenciais reais). Duas versões lado a lado: **A = atual**, **B = branch dos PRs 1–3**. Metade dos participantes começa por A, metade por B (contrabalanceado).

## 3. Tarefas (10 mais frequentes) e métricas
| # | Tarefa (sem dizer onde fica) | Jornada |
|---|---|---|
| T1 | Ver as vendas de ontem e reimprimir um comprovante | A |
| T2 | Cadastrar produto com preço de atacado a partir de 12 unidades | B |
| T3 | Chegou mercadoria de um fornecedor: dar entrada no estoque | C |
| T4 | Ver quais contas a pagar vencem esta semana | C/F |
| T5 | Descobrir por que o caixa de ontem fechou com diferença | D |
| T6 | Ver quanto de comissão um funcionário tem a receber | E |
| T7 | Ver o resultado do mês | F |
| T8 | Ver quais produtos estão acabando e repor um | F/C |
| T9 | Descobrir quem alterou o estoque de um produto | G |
| T10 | Imprimir etiquetas de um produto | B |

Por tarefa registrar: **tempo até o primeiro clique correto**, **tempo total**, **nº de cliques**, **nº de trocas de módulo**, **erros de navegação** (entrou no lugar errado), **pediu ajuda?**, **concluiu?**.
Pós-tarefa: pergunta única "Foi fácil achar?" (1–5). Fim: SUS curto.

## 4. Critérios de sucesso (a validar após o baseline)
- ≥ 80% concluem T1–T10 sem ajuda em B.
- Mediana do primeiro clique correto ≤ 10 s (meta de hipótese).
- Cliques em T3, T5, T6, T8 (fragmentadas) ≥ 25% menores que A — **se o baseline confirmar a fragmentação**; caso contrário, rever a meta.
- Nenhum aumento de tempo em T1 do PDV (venda) — medido separadamente no `/caixa`.

## 5. Checklists técnicos por PR
**Regressão funcional:** todas as 32 rotas `/admin` abrem pela nova navegação; `?tab=`/`?view=` antigos funcionam; redirects `/gerente/*` ok (`LEGACY_GERENTE_REDIRECTS`); testes existentes `adminV2SidebarNav`, `hubNavModel`, `hubOperationalPaths`, `isAdminNavActive`, `SidebarNav.behavior`, `adminPolicy` verdes.
**Autorização:** GERENTE não vê "Interno"; paleta nunca lista destino negado; nenhuma Server Action nova sem `assertAdminSession`.
**Acessibilidade:** operável só por teclado; foco visível; `aria-current` na aba/ item ativo; contraste AA nos estados ativo/hover; leitor de tela anuncia grupo e posição; Ctrl+K com foco preso e `Esc`.
**Bilíngue:** PT e ZH sem string fixa em PT (incluir rótulos de grupo e aria); nenhum texto truncado em sidebar 240 px e abas; revisão por falante nativo dos termos críticos abaixo; fonte `Noto Sans SC` carregada.
**Responsivo:** 375, 768, 1280 px; abas com rolagem horizontal; gaveta no mobile.
**Performance:** sem novas consultas ao banco na navegação; bundle da paleta carregado sob demanda.

## 6. Termos ZH a validar com falante nativo (comércio)
| PT | ZH atual (dicionário) | Dúvida |
|---|---|---|
| Caixas | 钱箱 (caixa registradora física) | Para *turno de caixa* pode ser 收银/班次; "收银历史" já usado no item |
| Receber mercadoria | 收货 | Confirmar contra "入库" (entrada em estoque) |
| Contas a pagar / a receber | 应付 / 应收 | Confirmar uso corrente |
| Atacado / Varejo | 批发 / 零售 | OK provável |
| Conciliação | 对账 | Confirmar |
| Suspensão de vendas | 暂停销售 | OK provável |
| Pedido de compra | 采购单 | Confirmar |
| Etiquetas | 标签 | OK provável |
