# Arquitetura da Informação Proposta — Jinlong

Base: `AUDITORIA_NAVEGACAO_JINLONG.md`, `MAPA_FUNCIONALIDADES.md`, `JORNADAS_OPERACIONAIS.md`, `DUPLICIDADES_FRAGMENTACAO.md`.
Substitui as seções 3–5 de `PLANO_LAYOUT_NAVEGACAO_JINLONG.md` (que fica como insumo histórico).

## 1. A hipótese de 8 destinos, confrontada com o código

| Pergunta | Resultado |
|---|---|
| Todo o inventário cabe nos 8 destinos da missão? | **Não.** `/admin/vendas` e `/admin/caixas` (operação diária, reimpressão, histórico de turnos) **não têm casa** na lista: a missão manda Vendas para Relatórios e Caixas para Financeiro. Mas `/admin/vendas` é tela **operacional** (detalhe, reimpressão, export) e `/admin/caixas` é histórico de turno. Colocá-las em Relatórios/Financeiro move o uso diário para dentro de módulos de análise/contabilidade |
| Os itens listados em cada destino existem? | **Parcialmente.** Não existem: importação de produtos, histórico de preços, inventário (só ajuste), perfis/permissões editáveis, impressoras, integrações |
| "Pessoas" faz sentido como grupo? | **Parcial.** Clientes e Funcionários sim. Fornecedores é parceiro de compra (jornada C). Comissões é liquidação financeira (§DUPLICIDADES 3) |
| "Compras" como destino próprio? | **Sim, mas pequeno** (2 telas: Pedidos, Fornecedores). Justifica-se pela jornada C ser a mais fragmentada. "Receber mercadoria" **permanece em Estoque** (rota e regra intocadas) e aparece em Compras como entrada contextual |
| 8 é um número útil? | O objetivo é "achar em ≤10 s", não um número. **9 destinos agrupados por tarefa** servem melhor do que 8 com Vendas escondida |

**Veredito sobre a hipótese:** **ajustar**, não aceitar como está. Mudanças: (+) Vendas como destino; (−) Fornecedores sai de Pessoas para Compras; (−) Comissões sai de Pessoas para Financeiro; (−) Auditoria e Caixas mudam conforme abaixo.

## 2. Navegação principal proposta (9 + PDV)

```
[ Abrir PDV ]                      ← ação destacada, topo da sidebar (todos os perfis do painel)

 Início
 Vendas                  Vendas · Caixas
 Produtos                Produtos · Categorias · Marcas · Etiquetas
 Estoque                 Saldos · Movimentações · Transferências · Receber mercadoria*
 Compras                 Pedidos de compra · Fornecedores · (atalho) Receber mercadoria
 Financeiro              Resumo · A receber · A pagar · Contas e conciliação · Comissões · Fiscal
 Pessoas                 Clientes · Funcionários
 Relatórios              Vendas · Financeiro/DRE · Produtos e estoque · Clientes · Auditoria
 Configurações           Loja · Impostos · Preferências · Suspensão · Categorias financeiras

 ── Interno (somente ADMIN) ──  Provisionamento · Implantação · Diagnóstico do Caixa
```
\* "Receber mercadoria" = rota `/admin/estoque/recebimento`, com 3 caminhos explícitos: contra pedido de compra (OC), NF-e (XML), manual.

Entradas visíveis ao gerente: **9 + PDV = 10** (hoje: 20). Cada destino com ≤ 6 abas. Nenhuma rota é removida.

## 3. Decisões por área

| Área | Decisão | Por quê |
|---|---|---|
| **Início** | Mantém `dashboard`. Barra de views (`ExecutiveAnalyticsHubNav`) **sai** daqui | Evita 2º menu de relatórios (B.3 da auditoria) |
| **Vendas** | Hub novo com 2 abas (Vendas, Caixas). Rotas inalteradas | Operação diária ≠ relatório; jornada D |
| **Produtos** | Hub existente. **Etiquetas** pertence aqui | Remove DN #6 |
| **Estoque** | Hub existente sem "Etiquetas" como aba (atalho por linha já existe). Aba "Entradas" → "Receber mercadoria" | Rótulo diz o que faz |
| **Compras** | Hub novo: Pedidos + Fornecedores | Jornada C |
| **Financeiro** | 9 controles → 6 grupos **sem mudar os ids `?tab=`**: "Contas e conciliação" agrupa `contas`+`recebiveis`+`conciliacao` com seletor secundário; `resultado` vira seção/atalho do Resumo; "Comissões" entra como aba (rota `/admin/comissoes` mantida; hub linka) | Compatibilidade de URLs e favoritos |
| **Pessoas** | Hub: Clientes + Funcionários. Link bidirecional Funcionário↔Comissões | Falta de link (jornada E) |
| **Relatórios** | **Um** controle de views (sidebar item único + abas internas). Aba "legado" só sai após tabela de equivalência | DF/DN 1–3 |
| **Auditoria** | Aba dentro de Relatórios, **mais** link a partir do Kardex/produto. Separar "CRM" de "Auditoria" no nome | Jornada G; DN #5 |
| **Configurações** | 3 abas atuais + atalhos para Suspensão e Categorias financeiras (rotas intactas) | DN #11 |
| **Interno** | Grupo separado e recolhido; ver §4 | Cosmético hoje (B.4 da auditoria) |

## 4. Funções sensíveis fora da navegação operacional

- **Provisionamento**: ADMIN, já imposto em policy e página → manter.
- **Implantação** e **Diagnóstico do Caixa**: hoje escondidos só na sidebar. **Decisão pendente do produto**: restringir a rota por perfil (mudança em `adminPolicy.RESOURCE_PROFILES`, **fora do escopo de UX**) ou aceitar que são telas de DONO. A navegação nova não deve ser tratada como controle de acesso.
- **Suspensão de vendas**: sensível, mas operacional para o dono → fica em Configurações, com confirmação já existente.
- **Liquidação de comissões**: ação financeira → exigir o mesmo `sensitive:comissoes` (já existe).

## 5. Novos elementos de navegação (todos aditivos)

| Elemento | Escopo inicial | Custo/risco |
|---|---|---|
| Busca de comandos (`Ctrl+K`) | **Somente destinos e ações de navegação** (lista estática derivada do mesmo arquivo da sidebar, filtrada por perfil). Sem busca de produtos/clientes/vendas na 1ª entrega | Baixo; sem consulta ao banco, sem RLS. Busca de entidades é 2ª etapa: requer RPC com isolamento por loja e orçamento de latência |
| Breadcrumb curto | Grupo › Aba | Baixo |
| Cartão "Pendências" no Início | Estoque baixo, contas vencendo, caixa aberto, importações NF-e pendentes — **todos com leitores existentes** (`contarEstoqueBaixo`, `listarImportacoesNfePendentes`, financeiro) | Médio: é funcionalidade nova, não navegação; separar em PR próprio |

## 6. Governança (12 perguntas da missão) — aplicado à proposta

| Pergunta | Resposta |
|---|---|
| Resolve problema comprovado? | Sim: P1–P10 da auditoria |
| Reduz complexidade percebida? | 20 → 10 itens visíveis; 1 controle de views em vez de 2 |
| Preserva arquitetura? | Sim: `HubTabDef`, `AdminHubTabNav`, `ROUTES` reaproveitados |
| Reduz acoplamento? | Neutro; Fase 3 do plano pode ler a sidebar e a paleta da mesma fonte |
| Fortalece SSOT? | Sim: uma lista de destinos alimenta sidebar, paleta e testes |
| Compatibilidade? | Rotas, `?tab=` e `?view=` preservados |
| Testabilidade? | Testes de navegação existentes cobrem; ver plano |
| Segurança? | Não altera autorização |
| Incremental / reversível? | Sim (PRs independentes) |
| Alternativa mais simples? | Só renomear + reordenar (PR 1 já entrega 60% do ganho) |
