# Mapa de Funcionalidades — Jinlong

Fonte: `AUDITORIA_NAVEGACAO_JINLONG.md` (matriz de rotas). Aqui as rotas são agrupadas por **tarefa do usuário**, não por pasta.
Estado: **Existe** = tela encontrada no código. **Parcial** = existe parte. **Não existe** = grep sem resultado.

| Domínio | Tarefa do usuário | Onde está hoje | Estado |
|---|---|---|---|
| **Vender** | Vender, buscar produto, pagar, recibo | `/caixa` (PDV) | Existe |
| | Abrir/fechar caixa, sangria, suprimento | `/caixa` | Existe |
| | Consultar vendas, reimprimir, ver cancelamento | `/admin/vendas` | Existe |
| | Histórico de turnos e divergências | `/admin/caixas` | Existe |
| | Devolução/troca | PDV (referência em histórico git "Sprint B devolução/troca"); tela admin **não confirmada** | Parcial — verificar |
| **Produtos** | Cadastrar/editar produto (rápido e completo) | `/admin/catalogo`, `/novo`, `/novo/completo`, `/[id]/completo` | Existe |
| | Preço varejo/atacado e qtd. mínima | Dentro do cadastro (seção Comercial, "Mais detalhes") | Existe |
| | Categorias, marcas | `/admin/categorias-produtos`, `/admin/marcas-produtos` | Existe |
| | Etiquetas | `/admin/estoque/imprimir-etiquetas` | Existe |
| | Importação de produtos em massa | — | **Não existe** |
| | Histórico de preços | — | **Não existe** |
| **Estoque** | Saldos, Kardex, ajuste | `/admin/estoque` | Existe |
| | Movimentações | `/admin/estoque/movimentacoes` | Existe |
| | Transferências entre locais | `/admin/estoque/transferencias` | Existe |
| | Inventário/contagem | só ajuste (`inventoryAdjustment.ts`) | **Parcial** |
| | Alertas de estoque baixo | Badge na sidebar + dashboard | Existe |
| **Compras** | Fornecedores | `/admin/fornecedores` | Existe |
| | Ordem de compra (rascunho→recebida) | `/admin/compras` | Existe |
| | Receber mercadoria — contra OC | `/admin/compras` (botão no detalhe da OC) | Existe |
| | Receber mercadoria — manual | `/admin/estoque/recebimento` | Existe |
| | Receber mercadoria — NF-e | `/admin/estoque/importar-nfe` | Existe |
| | Divergências de recebimento | dentro da conferência (OC / NF-e) | Existe (sem tela própria) |
| **Financeiro** | A receber, A pagar | `/admin/financeiro?tab=receber|pagar` | Existe |
| | Contas, PIX/cartões, conciliação | `?tab=contas|recebiveis|conciliacao` | Existe |
| | Resultado (caixa por categoria) | `?tab=resultado` | Existe |
| | Fiscal / documentos | `?tab=fiscal`, `/financeiro/documento/[id]` | Existe |
| | Categorias financeiras | `/admin/categorias-financeiras` | Existe |
| | Comissões: apuração e liquidação | `/admin/comissoes` | Existe |
| **Pessoas** | Clientes | `/admin/clientes` | Existe |
| | Funcionários (OPERADOR/GERENTE) | `/admin/funcionarios` | Existe |
| | Perfis e permissões editáveis | — (perfis fixos em código) | **Não existe** |
| | Configuração de % de comissão | **não localizada** nesta passada (verificar `ComissoesFilters`/`Configurações`) | A verificar |
| **Análise** | KPIs, vendas, DRE, estoque, CRM/RFV | `/admin/dashboard`, `/admin/relatorios` | Existe |
| | Auditoria (linha do tempo) | `/admin/auditoria` | Existe |
| **Sistema** | Loja, impostos, preferências | `/admin/configuracoes` | Existe |
| | Suspensão de vendas | `/admin/suspensao` | Existe |
| | Impressoras / integrações | — | **Não existe** como tela |
| | Implantação, Diagnóstico, Provisionamento | `/admin/implantacao`, `/diagnostico-caixa`, `/provisionamento` | Existe (internas) |

**Uso:** qualquer proposta de navegação só pode referenciar linhas "Existe" ou "Parcial". Linhas "Não existe" são backlog de produto, fora do escopo de UX.
