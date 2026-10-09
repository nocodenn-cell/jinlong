# Duplicidades e Fragmentação — Jinlong

Classificação (conforme a missão): **DF** duplicidade funcional · **DN** duplicidade de navegação · **AC** acesso contextual legítimo · **FP** fragmentação de processo.
Evidências: ver `AUDITORIA_NAVEGACAO_JINLONG.md`.

## 1. Classificação

| # | Caso | Tipo | Evidência | Recomendação (preserva SSOT) |
|---|---|---|---|---|
| 1 | "Vendas & Caixas" (view) × "Vendas" × "Caixas" × aba Vendas do legado | **DN** + parcial **DF** (view e aba legado mostram vendas do período) | `adminV2SidebarNav.ts:57,101,108`; `RelatoriosContent.tsx:569` | Vendas/Caixas = operação. View de relatórios = análise. Remover aba legado Vendas depois de confirmar que a view cobre os mesmos dados |
| 2 | Barra de views dentro da página + 5 itens na sidebar | **DN** | `ExecutiveVisaoGeralStub.tsx`, `RelatoriosContent.tsx:693` | Um só controle: sidebar (item único "Relatórios") **ou** barra interna |
| 3 | "Relatórios (detalhe)" e 5 abas legado × 4 views executivas | **DF** provável (Produtos/Estoque/Margem × "Produtos & Estoque") — **não comparado campo a campo**, ver ressalva | `adminV2SidebarNav.ts:185`, `RelatoriosContent.tsx` | Mapear aba→view, só então aposentar. Manter redirect de `?tab=` |
| 4 | Aba "Resultado" do Financeiro × view "DRE & Financeiro" | **DF provável**: Resultado é *caixa por categoria*, DRE é *competência em cascata*; o próprio texto da aba diz "não é lucro contábil" (`FinanceiroWorkspace.tsx:54`) | idem | **Não fundir** (regras distintas). Rotular claramente ("Resultado de caixa" × "DRE") e linkar um ao outro |
| 5 | Auditoria (item) × "CRM & Auditoria" (view) | **DN** parcial | sidebar | Auditoria = linha do tempo (1 destino). View CRM/RFV = análise de clientes: renomear para não sugerir auditoria |
| 6 | Etiquetas em Catálogo e Estoque | **DN** | `catalogoHubNav.ts:15`, `estoqueHubNav.ts:20` | Dono: Produtos. No Estoque, atalho contextual (já existe por linha: `adminEtiquetasProdutoQuery`) |
| 7 | Contas a pagar: `/financeiro/contas-pagar` × `?tab=pagar` | era **DN**; **já resolvida** por redirect | `contas-pagar/page.tsx` | Nada a fazer |
| 8 | Receber mercadoria: OC × manual × NF-e | **FP — já mitigada no código** (seletor "Como chegou?", `?modo=pedido&oc=`, aviso de duplicidade na OC; ver correção em JORNADAS_OPERACIONAIS §C). Era FP + risco de lançar a mesma entrada 2× (audit 2.1) | `compras/actions.ts` × `recebimento/actions.ts` | **Não unificar as regras.** Unificar a *porta de entrada*: tela "Receber mercadoria" pergunta "contra pedido / NF-e / manual". Vínculo OC↔recebimento manual é decisão de negócio (precisa de aprovação) |
| 9 | Fornecedores / Compras / Entradas em 3 lugares | **FP** de navegação | sidebar + hub Estoque | Compras agrupa Pedidos + Fornecedores; "Receber mercadoria" fica em Estoque com link cruzado |
| 10 | Clientes / Funcionários / Fornecedores / Comissões | **FP** leve: pessoas ≠ mesmo domínio (cliente e fornecedor são parceiros; funcionário é equipe) | sidebar | Agrupar **Clientes + Funcionários**; Fornecedores segue em Compras; Comissões onde a liquidação ocorre (ver §3) |
| 11 | Categorias financeiras só dentro do hub Financeiro | **DN** invertida (cadastro de config escondido no módulo) | `AdminHubTabNav.tsx:73` | Acesso também em Configurações |
| 12 | Cadastro de produto: modal rápido × página completa | **AC** legítimo (rápido vs. fiscal completo) | `ProdutoFormModal`, `/novo/completo` | Manter; diferenciar rótulos |
| 13 | Dashboard → Estoque, Venda → Financeiro, Relatório → Produto | **AC** legítimo | links já existentes | Manter e ampliar (§2) |

## 2. Links contextuais — o que já existe e o que falta

| Contexto | Estado |
|---|---|
| Produto → recebimento (Repor) | **Existe** (`EstoqueTable.tsx:225`) |
| Produto → etiquetas | **Existe** |
| Relatório → produto / venda | **Existe** |
| Venda → financeiro (saldo a receber) | **Existe** (`VendaDetailSheet.tsx:230`) |
| Conta a receber → venda de origem | **Existe** (`ContasReceberTable.tsx:13`) |
| Fornecedor → compras / contas a pagar | **Existe** |
| NF-e ↔ conta a pagar | **Existe** nos dois sentidos |
| Kardex → auditoria | **Existe** (`KardexSheet.tsx:23`) |
| Auditoria → produto/Kardex | **Existe** (botão "Ver Kardex" no painel de detalhe do evento, `AuditoriaTimeline.tsx:298-312`). Correção: a auditoria de 08/10 dizia "falta" por procurar só `<Link>` |
| Funcionário → Comissões | **Feito no PR 3** (`?operador=` abre o detalhe). Comissões → Funcionário: não feito (a tela de funcionários não tem deep-link por id) |
| **Caixa (histórico) → vendas do turno** | **Falta e exige mudança de banco**: `listar_vendas_gerente` (RPC) só filtra por período/status/pagamento, não por caixa. Fora do escopo (sem migrations). Decisão de produto pendente |
| Configurações → Suspensão / Categorias financeiras | **Feito no PR 3** (atalhos sob o título) |
| Pedido de compra → recebimento | **Existe** (botão "Receber em Entradas" com `?modo=pedido&oc=`; o banco recusa excesso). Correção: eu o havia listado como faltante |
| Busca global | **Falta** |

## 3. Pessoas × Financeiro: onde fica Comissões?

Comissões tem **apuração + liquidação (pagamento)** (`LiquidacaoResultModal.tsx`) e é tratada como dado sensível financeiro (`sensitive:comissoes`). Quem a consulta é o dono/financeiro, mas quem a explica é o funcionário. Recomendação: **item único em Financeiro** ("Comissões"), com link bidirecional em Funcionários. Não duplicar a tela.

## 4. Ressalva metodológica

Os itens 3 e 4 foram classificados por leitura de rótulos e textos, **sem comparar campo a campo os dados exibidos**. Antes de remover qualquer aba legado, fazer a tabela "aba antiga → painel novo" (tarefa do PR 7).
