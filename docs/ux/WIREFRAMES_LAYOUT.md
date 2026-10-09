# Wireframes e Layout — Jinlong

Wireframes de baixa fidelidade (ASCII) para aprovação da estrutura. **Não são protótipos clicáveis** nem alteram páginas; protótipos com componentes reais do design system (`admin-v2`) ficam para depois da aprovação, em rota isolada não publicada.
Tokens e componentes existentes a reutilizar: `AdminV2Shell`, `AdminHubTabNav`/`HubTabDef`, `PageHeader`, `KpiStrip`, `DenseDataTable`, `SectionCard`, `StatusBadge` (ver `components/ui/admin-v2`). **Não criar novo design system.**

## 0. Shell (todas as telas)

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ 金龍 Jinlong │  Estoque › Receber mercadoria     [🔍 Buscar… Ctrl+K] [中|PT] [👤]│  ← cabeçalho: contexto, busca, idioma, usuário
│ Loja Centro ▾│──────────────────────────────────────────────────────────────│
│ [▶ Abrir PDV]│  Título da tela                          [ Ação principal ]  │
│              │  Aba 1 · Aba 2 · Aba 3                    (máx. 6, 1 barra)  │
│ ◉ Início     │──────────────────────────────────────────────────────────────│
│ ○ Vendas     │  Filtros (1 linha; avançados em "Mais filtros")              │
│ ○ Produtos   │  Dados / formulário                                          │
│ ○ Estoque ②  │                                                              │
│ ○ Compras    │  Ações secundárias na linha / rodapé                         │
│ ○ Financeiro │                                                              │
│ ○ Pessoas    │                                                              │
│ ○ Relatórios │                                                              │
│ ○ Config.    │                                                              │
│ ▸ Interno*   │   * só ADMIN                                                 │
│ « recolher   │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```
Regras: 1 barra de abas por tela; 1 ação primária no canto superior direito; badge só onde há ação (Estoque baixo); sidebar recolhível em ícones; mobile = menu em gaveta.

## 1. Dashboard (Início)

Estrutura: título + período → faixa de 4 KPIs úteis (vendas hoje, a receber vencido, estoque baixo, caixa aberto — cada KPI **é link**) → coluna principal (vendas por hora; pedidos recentes) + coluna lateral **"Precisa de atenção"** (lista de pendências com link). Ação principal: **Abrir PDV**. Hoje: dashboard + barra de 5 views. Mudança: sai a barra de views; entra "Precisa de atenção" (PR separado, ver plano).

## 2. Produtos
```
Produtos                                     [ + Novo produto ]
Produtos · Categorias · Marcas · Etiquetas
[🔍 nome/código]  [Categoria ▾] [Estoque ▾]  Mais filtros
Código | Produto | Categoria | Varejo | Atacado (≥qtd) | Estoque | ⋯
```
Mudança: coluna **Atacado** visível; Etiquetas é daqui. Ações por linha: editar, etiqueta, ver movimentações.

## 3. Cadastro de produto (página completa)
Seções em uma página rolável com âncora lateral: Essencial · Preços (varejo / atacado + qtd. mínima, **abertos por padrão**) · Classificação · Estoque inicial · Fiscal (recolhido). Salvar/Cancelar fixos no rodapé; aviso de alterações não salvas. **Não** transformar em assistente de etapas.

## 4. Estoque
```
Estoque                         [ Receber mercadoria ]
Saldos · Movimentações · Transferências
Saldos: [🔍]  [Visão: Todos | Crítico | Zerado]
Produto | Saldo | Mín. | Status | ⋯  (Repor · Kardex · Etiqueta · Ajustar)
```
Ação principal passa de aba para botão. "Entradas" some como aba (vira o botão).

## 5. Compras
```
Compras                                        [ + Nova ordem ]
Pedidos de compra · Fornecedores
Status ▾ Fornecedor ▾    (RASCUNHO → CONFIRMADA → EM TRÂNSITO → RECEBIDA)
Detalhe da OC: [ Receber ]  → vai a "Receber mercadoria" já com a OC
```

## 6. Receber mercadoria (`/admin/estoque/recebimento`)
```
Receber mercadoria
 ( ) Tenho um pedido de compra   → lista OCs abertas
 ( ) Tenho a nota fiscal (XML)   → Importar NF-e
 ( ) Entrada manual              → formulário atual
```
**Só a porta de entrada muda.** As regras (`registrar_conferencia_ordem_compra`, `criar_confirmar_remessa_entrada`, importação NF-e) ficam intactas. Vínculo OC↔manual requer aprovação de negócio.

## 7. Financeiro
```
Financeiro                                       [ + Lançamento ]
Resumo · A receber · A pagar · Contas e conciliação ▾ · Comissões · Fiscal
 └ Contas e conciliação:  ( Contas ) ( PIX e cartões ) ( Conciliação )   ← seletor secundário
Resumo: vencido | vence hoje | saldo   + atalho "Resultado de caixa"
```
Os 9 controles viram 6. URLs `?tab=` preservadas. "Resultado" e "DRE" rotulados distintamente com link entre si.

## 8. Pessoas
```
Pessoas              [ + Novo ]
Clientes · Funcionários
Funcionário: linha → painel com [ Ver comissões ]    ← link novo
```

## 9. Relatórios
```
Relatórios                         Período [ ▾ ]  [ Exportar ]
Vendas · Financeiro (DRE) · Produtos e estoque · Clientes · Auditoria
```
Um único controle de abas. Linhas já clicáveis (produto/venda). Auditoria ganha link para produto/Kardex.

## 10. Configurações
```
Configurações
Loja · Impostos · Preferências · Suspensão de vendas · Categorias financeiras
```
As duas últimas abrem as rotas existentes (`/admin/suspensao`, `/admin/categorias-financeiras`) mantendo o contexto do grupo.

## Responsividade
- Desktop: layout acima. Tablet: sidebar recolhida em ícones. Celular: gaveta; tabelas viram cartões (já existe `SaldoMobileCards`).
- Mobile prioriza **consulta** (Início, Vendas, Estoque baixo, A receber/A pagar). Cadastros longos (produto completo, NF-e, conciliação) permanecem desktop-first — sem forçar paridade.

## Antes × depois (itens que o usuário vê)

| | Hoje | Proposto |
|---|---|---|
| Itens na sidebar (gerente) | 20 | 10 (9 + PDV) |
| Controles de navegação de relatórios | 5 (sidebar) + 5 (barra interna) + 5 (abas legado) | 1 grupo, 5 abas |
| Controles no Financeiro | 9 | 6 (+ seletor secundário) |
| Páginas sem sub-navegação | 20 | ≤ 6 |
| Busca de destinos | não existe | `Ctrl+K` |
