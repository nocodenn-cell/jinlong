# Auditoria dos Fluxos Operacionais — Jinlong

| Campo | Valor |
|---|---|
| Data | 2026-09-17 |
| Escopo | `pdv-importados/` (produto real) + material do Claude Design (`https://claude.ai/artifact/1SgjZBWK1WJ9nwkzfx2y14`, referência de UX apenas) |
| Método | Leitura de código atual (3 auditorias paralelas, ~113 tool calls, evidência file:line) + leitura direta do design + verificação de navegação |
| **Regra de ouro** | Nada foi implementado, alterado ou commitado. Este documento é só leitura e análise. |

---

## 0. Achado central (leia isto antes do resto)

A frase do cliente — "não tem fluxo" — **não é falta de funcionalidade**. As três auditorias de código, de forma independente, convergiram para o mesmo padrão:

> **O dado certo já existe no banco e já é calculado no backend, mas morre antes de chegar à tela.** A "próxima ação" que faltaria é, na maioria dos casos, um `<Link>` que não foi escrito — não uma feature que falta construir.

Exemplos que provam isso, todos com evidência de código:
- `app/admin/vendas/actions.ts` já calcula `tem_conta_receber` e `valor_aberto_cr` por venda — `VendaDetailSheet.tsx` nunca renderiza esses campos.
- Toda linha de todo relatório em `RelatoriosContent.tsx` já carrega o `id` do produto/venda no DTO — nenhuma linha é um link.
- A função `adminEstoqueProdutoQuery()` que abre o Estoque já filtrado num produto existe e é usada em duas telas (`CatalogoTable.tsx`, `ProdutoFormModal.tsx`) — mas não nas outras quatro telas que precisariam dela (Relatórios, Auditoria, `EstoqueSection` de edição).
- `contas_receber.venda_id` existe na tabela — `receivableReader.ts` nem seleciona essa coluna no `SELECT`.

Isso muda a natureza do trabalho da próxima sprint: a maior parte dos gaps de "clareza"/"próxima ação" não exige nova arquitetura, RPC nova ou tela nova — exige **ligar pontas que já existem**. Está detalhado por item na seção E.

Um segundo achado central, específico e mais sério: **existem dois módulos completos e paralelos de "receber mercadoria"** (Ordens de Compra em `/admin/compras` e recebimento manual em `/admin/estoque/recebimento`) que não se comunicam — nenhuma referência cruzada a `ordem_compra_id`. Isso é risco de duplicidade de lançamento de estoque, não só um problema de clareza. Ver Fluxo 2.

---

## 1. Sobre o material do Claude Design

O link fornecido (`.../artifact/1SgjZBWK1WJ9nwkzfx2y14`) não é um protótipo clicável simples — é um **Design System** com 276 arquivos publicados, que já inclui sua própria autocrítica em `project/GAP_ANALYSIS.md` (14,8 KB, lido na íntegra). Isso foi tratado como **dado**, não como verdade — mas é um dado valioso porque o próprio autor do design já fez parte do trabalho de separar ideia de fluxo vs. componente/estética, incluindo:

- **Vocabulário de "conferência" já é reconhecido como inconsistente** no produto real (achado C1 do `GAP_ANALYSIS.md`), embora a contagem exata de "quantas conferências diferentes existem" precisasse de correção (ver Fluxo 2 — são pelo menos 4 mecanismos, não 3).
- O componente `FlowSteps` (a "trilha de etapas") é **auto-classificado como não confiável no estado atual**: o passo 1 ("Pedido de compra") é inventado — não existe vínculo compra→importação no código —, e o passo de reconciliação de itens (que existe, é obrigatório e bloqueia o avanço) **não aparece** na trilha. O próprio autor recomenda: aplicar só em `importar-nfe`, com passos derivados do `status` real (não hardcoded), medir taxa de abandono de conferência antes de replicar, e **não replicar em Compras, Vendas ou Caixa**.
- Os módulos "Vendas, Compras, Clientes, Fornecedores, Usuários, Relatórios e Auditoria" foram **deliberadamente não recriados** (README do `ui_kits/erp`) — o kit cobre só Dashboard, Catálogo, Produto, Estoque (fluxo de conferência) e Financeiro/Fiscal. Isso limita onde a comparação da seção C pode ser realmente feita: para Vendas/Compras/Clientes/Fornecedores/Auditoria/Relatórios não há material do design para comparar — a coluna "Claude Design" fica "sem referência" nesses fluxos, e a auditoria se apoiou só no código atual.

Arquivos lidos na íntegra: `project/README.md`, `project/GAP_ANALYSIS.md`, `project/ui_kits/erp/README.md`, `project/ui_kits/pdv/README.md`, `project/components/FlowSteps/README.md`, `project/components/Index/{Shell,Dashboard,Catalogo,Produto,Estoque,Financeiro}.jsx`, `project/components/Index2/{Pdv,Carrinho,Pagamento,AberturaCaixa}.jsx`, `project/assets/notes/MIGRATION-REPORT.md`.

---

## 2. Navegação (verificação solicitada)

Evidência: `pdv-importados/lib/navigation/adminV2SidebarNav.ts` + `pdv-importados/components/ui/admin-v2/SidebarNav.tsx` + `AdminV2Shell.tsx:50,80`.

| Item pedido | Estado atual | Veredito |
|---|---|---|
| Implantação/GO-LIVE fora da navegação operacional | Em `ADMIN_V2_SISTEMA_ITEMS`, `adminOnly: true`; `showAdminOnlyItems = session.perfil === 'ADMIN'` — só visível para perfil interno ADMIN, nunca para GERENTE/loja | **OK, confirmado** |
| Diagnóstico do Caixa fora da navegação operacional | Mesmo mecanismo (`adminOnly: true`) | **OK, confirmado** |
| Comissões em "Operação" | Está em `ADMIN_V2_EXPANDED_ITEMS`, dentro do grupo **"Mais"**, que é `useState(false)` — **colapsado por padrão** — ao lado de Fornecedores e Compras. Não está no grupo `CORE` (que é, na prática, "Operação": Visão geral, Vendas, Catálogo, Clientes, Funcionários, Estoque, Auditoria, Financeiro, Relatórios) | **GAP confirmado** — ver item #10 do Top 10 |
| "Ir para PDV" disponível | Em `ADMIN_V2_SISTEMA_ITEMS`, **sem** `adminOnly` — visível para todos os perfis, ao lado de Configurações/Suspensão | **OK, confirmado** |
| Nada perdido de "Mais" | `git log -p` no arquivo mostra a última reorganização estrutural (commit `28b14b76`) consolidando Catálogo/Estoque em hubs, sem remover itens de navegação — não há evidência de remoção recente. **Não foi feita busca exaustiva de todo o histórico do arquivo**, então isto fica como verificação parcial, não uma garantia total | **Parcialmente verificado** |

---

## A) Mapa dos 8 fluxos atuais

### Fluxo 1 — Cadastro → Produto → Preço → Estoque
`/admin/catalogo` (lista) → botão "Novo" → modal `ProdutoFormModal.tsx` (`ProdutoForm.tsx`: Essencial → Preços/margem em tempo real → Categoria+Fornecedor → Estoque inicial → toggle "Mais detalhes": Comercial/atacado, Compra, Fiscal) → salvar (RPC única `criar_produto_com_estoque_inicial`) → **tela pós-salvo com CTAs explícitos** ("Ajustar estoque", "Imprimir etiqueta").

### Fluxo 2 — Fornecedor → Compra/Recebimento → Conferência → Estoque
Dois caminhos paralelos e desconectados:
- **A (Ordens de Compra):** `/admin/fornecedores` → `/admin/compras` (`ComprasContent.tsx`, status RASCUNHO→CONFIRMADA→EM_TRANSITO→RECEBIDA) → `OcDetalheModal.tsx` → botão único "Registrar Recebimento" dispara 2 RPCs em sequência automática (`registrar_conferencia_ordem_compra` + `receber_ordem_compra`).
- **B (Recebimento manual):** `/admin/estoque/recebimento` (`RecebimentoGerentePageClient.tsx`) — origem em texto livre, 1 produto por submissão, RPC atômica única `criar_confirmar_remessa_entrada` (cria e confirma junto).

### Fluxo 3 — Importação NF-e → Conferência → Estoque
`/admin/estoque/importar-nfe` (`ImportarNfePageClient.tsx`, 1053 linhas) — upload XML → `previewImportacaoNfe` classifica RECONHECIDO_EAN/RECONHECIDO_DEPARA/DESCONHECIDO → resolução obrigatória → `executarImportacaoNfe` → **Conferência** (item a item) → `registrarConferenciaNfe` → `confirmarImportacaoNfe` (credita saldo). Máquina de 4 fases real, retomável (`listarImportacoesNfePendentes`).

### Fluxo 4 — Cliente → Venda → Pagamento → Caixa
`/caixa` → `CaixaSearchBar` (bipe/busca) → `CaixaCartList.tsx` (carrinho, preço escalonado) → abas Produto/Cliente/Pagamento (`CaixaPdvOperadorTabs`) → `CaixaPdvMetodoPagamentoSelector` → Finalizar (F4) → RPC única `finalizar_venda_transacional_canonica_v4` → `CaixaReciboModal` + toast + saldo do turno atualizado.

### Fluxo 5 — Venda → Financeiro/Recebimento
Venda com saldo pendente + cliente → RPC cria `contas_receber` automaticamente → deveria aparecer em `/admin/vendas` e em `/admin/financeiro` (aba "A receber") — mas os dois módulos não têm link cruzado de UI, apesar do dado relacional (`venda_id`) existir no banco.

### Fluxo 6 — Caixa → Movimentação → Fechamento
`CaixaPdvOperacoesMenu` (Suprimento Ctrl+Shift+S / Sangria Ctrl+Shift+R, atrás de menu) → `CaixaMovimentacaoModal` → alçada de gerente acima do limite → Fechamento (F6) → `CaixaValorNumericoModal` (contagem de espécie, PIX/cartão corretamente excluídos) → divergência > R$5 pede motivo → RPC atômica `fechar_caixa_atomico` → `CaixaFechamentoReciboModal`.

### Fluxo 7 — Estoque → Movimentação → Histórico/Auditoria
`/admin/estoque` (hub, abas Saldos/Recebimento/Transferências/Importar NF-e/Etiquetas) → ícone por linha abre `KardexSheet` (histórico do produto) ou `AjusteSaldoModal`. `/admin/auditoria` existe como módulo à parte, lendo a mesma tabela de movimentos, mas sem porta de entrada/saída conectada ao Estoque.

### Fluxo 8 — Relatórios → Análise → Ação
`/admin/dashboard` → botão "Relatórios" → `/admin/relatorios` (abas Visão/Produtos/Estoque/Margem/Vendas, `RelatoriosContent.tsx`) → listas e tabelas → **fim do fluxo** (só 1 link genérico de saída, para `/admin/estoque` sem filtro).

---

## B) Gaps encontrados (lista completa, por fluxo)

### Fluxo 1
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 1.1 | Campos fiscais (NCM/CFOP/CSOSN/CST/CEST/ICMS) nunca obrigatórios, escondidos atrás de 2 níveis ("Mais detalhes" + `<details>`) | P1 | `/admin/catalogo` (modal novo) | `FiscalSection.tsx:14-17`, `produtoForm.clientValidation.ts` | sem validação de nenhum campo fiscal | erro fiscal só aparece na emissão da nota, não no cadastro |
| 1.2 | CTA "Ajustar estoque" pós-salvo só filtra a lista, não abre o modal de ajuste | P2 | `/admin/estoque` | `EstoqueTable.tsx:158-177` | — | um clique a mais logo após um fluxo que já enfatizou urgência |
| 1.3 | Faixas de atacado só acessíveis em "Mais detalhes" | P3 | modal produto | `ProdutoForm.tsx:111-158` | — | quem cadastra rápido pode não perceber que atacado existe |
| 1.4 | Em edição, aviso de estoque zerado linka para Estoque sem filtro (diferente da criação, que filtra) | P3 | modal produto | `EstoqueSection.tsx:109-113` | — | inconsistência entre criar vs. editar |

### Fluxo 2
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 2.1 | **Dois módulos de recebimento não se comunicam** — nenhuma referência cruzada a `ordem_compra_id`/`fornecedor_id` | **P0/P1** | `/admin/compras`, `/admin/estoque/recebimento` | `app/gerente/compras/actions.ts:443-480` vs `app/gerente/recebimento/actions.ts:90-133` | origem em texto livre no manual | risco real de duplicidade de lançamento de estoque |
| 2.2 | Na OC, conferência + crédito de estoque disparam como 1 clique sem confirmação intermediária, apesar do backend ter sido desenhado como 2 passos | P1 | `/admin/compras` | `actions.ts:455-479`, `OcDetalheModal.tsx:108-128` | comentário "FLX-04... fluxo de dois passos" não exposto na UI | nenhuma chance de revisar antes de creditar |
| 2.3 | Recebimento manual não é retomável (1 clique = conferido+creditado, 1 item/submit) | P1 | `/admin/estoque/recebimento` | `actions.ts:78-111` | RPC atômica `criar_confirmar_remessa_entrada` | sem salvar progresso parcial em remessas com muitos itens |
| 2.4 | Vocabulário inconsistente: "esperada/conferida" (manual) vs "quantidade/recebida" (OC) vs "NF-e/conferida" (NF-e) | P2 | 3 rotas | — | — | dificulta reconhecer que é "a mesma operação" |

### Fluxo 3
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 3.1 | **Conferência nasce pré-preenchida com a quantidade da NF-e**, contradizendo o próprio comentário do código ("campo em branco = ainda não contei") | **P1** | `/admin/estoque/importar-nfe` | `ImportarNfePageClient.tsx:132-157` (preenchimento) x `:69-76` (comentário) x `:798` (UI) | `aplicarConferencia` usa `quantidade_conferida ?? quantidade_nfe` | risco de "conferência de carimbo" sem contagem física real |
| 3.2 | Divergência só é sinalizada se o operador editar o campo manualmente (consequência direta de 3.1) | P1 | idem | `:371-376` | `divergeDaNota` nunca aciona sozinho | dados de auditoria de divergência não confiáveis |
| 3.3 | Sem indicador de progresso persistente (stepper) — as 4 fases são seções condicionais | P2 | idem | `:675-888` | — | operador não sabe quanto falta, especialmente ao retomar dias depois |

### Fluxo 4
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 4.1 | Recibo/cupom nunca inclui o cliente vinculado, mesmo em venda fiado | P1 | `/caixa` | `CaixaReciboModal.tsx:20-31` | tipo `ReciboVenda` sem campo cliente | comprovante não prova quem é o devedor |
| 4.2 | Vincular cliente à venda é quase invisível (Alt+C ou menu "Operações", sem botão na área principal) | P1/P2 | `/caixa` | `CaixaOperadorContextBar.tsx`, `CaixaPdvOperacoesMenu.tsx:136-141` | — | maioria das vendas provavelmente fica anônima |
| 4.3 | Busca de cliente sem resultado não oferece cadastro rápido | P2 | `/caixa` | `CaixaSelecionarClienteModal.tsx:133-135` | só `EmptyState` | operador sai do PDV para cadastrar cliente |
| 4.4 | Resumo do turno não aparece na tela principal no mobile/tablet | P2 | `/caixa` (mobile) | `CaixaPageClient.tsx:1625,1681-1711` | `hidden md:flex` | operador mobile não vê saldo do turno antes de agir |
| 4.5 | i18n hardcoded (strings PT-BR fixas, `toLocaleString("pt-BR")`) em componentes do caixa | P3 | `/caixa` | `CaixaRailTurnoSummary.tsx:70`, `CaixaReciboModal.tsx:83-91` | — | quebra em sessão ZH |

### Fluxo 5
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 5.1 | `VendaDetailSheet` nunca exibe `tem_conta_receber`/`valor_aberto_cr`, apesar de calculados no backend | **P1** | `/admin/vendas` | `actions.ts:48-49,168-169` vs `VendaDetailSheet.tsx` | campo buscado, nunca renderizado | gerente não vê saldo pendente ao abrir a venda |
| 5.2 | Nem `VendasTable` nem `VendaDetailSheet` mostram o nome do cliente da venda | **P1** | `/admin/vendas` | zero ocorrência de "cliente" em `actions.ts` | — | venda a prazo indistinguível de venda anônima |
| 5.3 | Sem link cruzado Vendas↔Financeiro em nenhum sentido | **P1** | `/admin/vendas`, `/admin/financeiro` | `receivableReader.ts:101` (não seleciona `venda_id`) | — | investigar um título exige busca manual por nome |
| 5.4 | `contasRecebeId` retornado pela RPC de finalização nunca chega à UI do PDV | P2 | `/caixa` | `caixaVendas.impl.ts:416`, zero uso em `CaixaPageClient.tsx` | — | operador não confirma que gerou título a receber |

### Fluxo 6
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 6.1 | Sangria/suprimento sem destaque visual próprio (só menu/atalho) | P2 | `/caixa` | `CaixaPdvOperacoesMenu.tsx:143-155` | — | descoberta depende de memorizar atalho |
| 6.2 | Comprovante de fechamento não orienta o próximo passo | P2 | `/caixa` | `CaixaFechamentoReciboModal.tsx:92-99` | só "Imprimir"/"Fechar" | operador infere pelo estado do header |
| 6.3 | i18n hardcoded no comprovante de fechamento | P3 | `/caixa` | `:29-37` | `toLocaleString("pt-BR")` | idem 4.5 |

### Fluxo 7
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 7.1 | Estoque crítico sem ação de reposição — sem deep-link para Recebimento/Compras | **P0** | `/admin/estoque?visao=critico` | `EstoqueTable.tsx:158-191`, `RecebimentoGerentePageClient.tsx` (não aceita produto pré-selecionado) | — | operador memoriza o nome e busca de novo do zero |
| 7.2 | Kardex e Auditoria leem os mesmos dados (`movimentos_estoque_log`) mas não se conectam | **P1** | `/admin/estoque`, `/admin/auditoria` | `AuditoriaTimeline.tsx:278-294` (texto puro, sem Link), `KardexSheet.tsx` (sem botão para auditoria) | — | investigar movimentação exige decorar nome e buscar na outra tela |
| 7.3 | Alertas de sistema na Auditoria (`ALERTA`) não linkam para produto/Kardex | **P1** | `/admin/auditoria?tipo=ALERTA` | `AuditoriaTimeline.tsx:107-126,278-294` | — | alerta que pede investigação imediata não tem saída |
| 7.4 | Link de "estoque mínimo" na edição de produto não usa o helper de deep-link já existente | P2 | edição de produto → `/admin/estoque` | `EstoqueSection.tsx:129-134` vs `ProdutoFormModal.tsx:528-530` | `href` cru vs `adminEstoqueProdutoQuery()` | às vezes filtra, às vezes não — sem motivo aparente |
| 7.5 | Ajuste de saldo termina em silêncio, sem toast de confirmação | P3 | `/admin/estoque` | `AjusteSaldoModal.tsx:70-71` | só `router.refresh()` | incerteza se o ajuste foi gravado |

### Fluxo 8
| # | Gap | Sev. | Rota | Arquivo | Evidência | Impacto |
|---|---|---|---|---|---|---|
| 8.1 | Nenhuma linha de produto/venda em Relatórios é clicável, em 7 listas diferentes, apesar do id já vir em todos os DTOs | **P0** | `/admin/relatorios` (todas as abas) | `RelatoriosContent.tsx:178-511` | `<div>`/`<tr>` estáticos | dono vê "mais vendido" e não consegue ir até ele |
| 8.2 | "Divergência de Estoque" reporta inconsistência sem caminho de investigação | **P0** | `/admin/relatorios?tab=estoque` | `:385-420` | — | sinal que pede ação imediata fica sem saída |
| 8.3 | Único CTA de saída ("Abrir estoque") é genérico, não usa `adminEstoqueProdutoQuery` já existente | **P1** | `/admin/relatorios?tab=estoque` | `:226-230` | — | larga o usuário na lista geral sem filtro |
| 8.4 | Dashboard/Relatórios nunca linkam para Financeiro (sem KPI de vencidos ali) | P1 (confiança média) | `/admin/dashboard`, `/admin/relatorios` | zero ocorrência de `ROUTES.admin.financeiro` nesses módulos | não verificado se existe KPI *dentro* do Financeiro | dono não vê sinal de "tem dinheiro vencido" nas telas que mais olha |
| 8.5 | Tabela de Vendas em Relatórios não linka para o detalhe da venda | P2 | `/admin/relatorios?tab=vendas` | `:463-511` | — | sem atalho para investigar uma venda específica |

---

## C) Claude Design × Produto atual

| Fluxo | Atual | Claude Design | Diferença | Decisão |
|---|---|---|---|---|
| 1. Produto | Formulário em seções fixas; tela pós-salvo com CTAs concretos ("Ajustar estoque", "Imprimir etiqueta") — já é o ponto mais forte do sistema | Abas (Identidade/Preços/Estoque/Fiscal/Notas) + painel lateral fixo "Resumo comercial" (margem, giro, última entrada) sempre visível; aba Estoque diz explicitamente "saldo é somente leitura — mexa em Estoque › Entrada" | O atual já ganha no pós-save; o design ganha em manter contexto comercial visível durante a edição e em declarar por escrito onde o saldo é de fato alterado | **ADAPTAR** — portar a ideia do resumo lateral persistente e a frase explícita "onde mexer no saldo"; não portar abas/componentes |
| 2. Fornecedor→Compra→Conferência | Dois módulos desconectados (gap 2.1, o mais sério da auditoria) | O próprio `GAP_ANALYSIS.md` do design já identificou isso como o problema #1 (achado C1) e classificou seu próprio `FlowSteps` como **não confiável** aqui (passo inventado, passo real omitido) | O design não resolve o problema — ele documenta a causa raiz melhor do que qualquer comparação visual faria | **INVESTIGAR** a unificação de vocabulário (decisão de produto, não de UI) antes de qualquer coisa; **IGNORAR** o componente `FlowSteps` como está |
| 3. Importação NF-e | Máquina de 4 fases real, retomável, reconciliação obrigatória — mas sem stepper persistente e com bug de pré-preenchimento (3.1) | `FlowSteps` com estado done/current/todo aplicado exatamente aqui, com passos derivados do status (recomendação do próprio autor) | A ideia do stepper responde a um gap real (falta indicador de progresso); o bug de pré-preenchimento é achado independente, fora do radar do design | **APROVEITAR** a ideia do stepper com estado derivado do status real, só nesta tela — depois de corrigir 3.1, que é prioridade maior |
| 4. Venda/Caixa | Cliente vinculável só via Alt+C ou menu "Operações" (gap 4.2) | Botão "Cliente (F3)" no mesmo nível hierárquico da busca de produto, sempre visível na barra superior | Ganho real e barato: o design trata "vincular cliente" como ação de primeira classe, não secundária | **APROVEITAR** — mover o CTA para a área principal do carrinho |
| 5. Venda→Financeiro | Sem link cruzado (gaps 5.1-5.3) | `Financeiro.jsx` do kit também não resolve — mostra "NFC-e falhou... a venda está registrada" como texto solto, sem link de volta para a venda | O design tem a mesma lacuna que o produto real | **IGNORAR** — sem referência útil aqui |
| 6. Caixa→Fechamento | Não verificado se a abertura de turno mostra resumo do fechamento anterior | `AberturaCaixa.jsx` mostra "o caixa anterior foi fechado às 22:04, sangria conferida, sem diferença" antes de abrir o novo turno | Ideia de continuidade entre turnos, baixo risco de implementar | **INVESTIGAR** se já existe; se não, **ADAPTAR** |
| 7. Estoque→Kardex/Auditoria | Kardex e Auditoria desconectados (7.2); Estoque crítico sem ação de reposição (7.1) | `Estoque.jsx` do kit não modela Auditoria, mas mostra o mesmo CTA ("Nova entrada"/"Continuar") repetido tanto no cabeçalho do hub quanto na linha específica do documento pendente | Reforça (de forma independente) que "ação disponível na própria linha da tabela" é o padrão que falta em Estoque crítico | **ADAPTAR** — replicar "CTA também na linha", não o componente |
| 8. Relatórios | Nenhuma linha clicável em nenhuma lista, apesar do id já existir no DTO (8.1, o gap de maior alcance) | Relatórios **não foi recriado** no kit (README documenta isso como omissão deliberada) — mas o `Dashboard.jsx` do mesmo kit tem todo `KpiCard` com `onClick`, e a tabela de estoque crítico com `onRowClick` para o produto | Sem referência direta em Relatórios, mas o padrão "linha/KPI sempre acionável" aparece consistentemente em outra tela do mesmo kit — é validação independente do achado 8.1, não uma ideia nova | **APROVEITAR** o padrão geral (linha de tabela = link para o registro), aplicado a todas as tabelas de Relatórios |
| Navegação | Comissões em "Mais" colapsado; Implantação/Diagnóstico corretamente internos | `Shell.jsx` do kit usa grupos simples "Operação"/"Cadastros"/"Análise" sem sistema "Mais" nem `adminOnly` — não modela perfis | Simplificação de protótipo sem lógica de permissão — não comparável ao problema real de UX aqui | **IGNORAR** como referência; o ajuste é local (ver item 10 do Top 10) |

---

## D) Top 10 (ordenado por impacto operacional, não por estética)

1. **Dois módulos de recebimento de mercadoria não se comunicam** (Fluxo 2, gap 2.1) — risco de duplicidade de lançamento de estoque.
2. **Estoque crítico sem ação de reposição** (Fluxo 7, gap 7.1) — vê o problema, não é levado à solução.
3. **Conferência de NF-e nasce pré-preenchida com a quantidade da nota** (Fluxo 3, gap 3.1) — mina o propósito de existir uma conferência física.
4. **Nenhuma linha de Relatórios é clicável**, apesar do id já estar em todos os DTOs (Fluxo 8, gap 8.1) — afeta as 7 listas do módulo.
5. **"Divergência de Estoque" no relatório sem caminho de investigação** (Fluxo 8, gap 8.2) — alerta sem saída.
6. **Vendas e Financeiro sem link cruzado em nenhum sentido** (Fluxo 5, gaps 5.1-5.3) — nem a venda mostra saldo pendente, nem o título linka pra venda.
7. **Recibo de venda fiado nunca mostra o cliente vinculado** (Fluxo 4/5, gap 4.1) — comprovante não prova quem é o devedor.
8. **Associar cliente à venda é quase invisível no PDV** (Fluxo 4, gap 4.2) — raiz que agrava os itens 6 e 7.
9. **Kardex e Auditoria leem os mesmos dados mas não se conectam** (Fluxo 7, gap 7.2) — dois históricos paralelos do mesmo fato.
10. **Comissões (e, por extensão, Fornecedores/Compras) enterrados em "Mais" colapsado**, fora de "Operação" (Navegação + Fluxo 2) — quebra a entrada do próprio Fluxo 2 e contraria pedido explícito do cliente.

---

## E) Menor mudança por item do Top 10

| # | Problema | Causa | Menor mudança | Arquivos envolvidos | Risco | Dependências |
|---|---|---|---|---|---|---|
| 1 | Recebimento em 2 módulos isolados | Recebimento manual usa "origem" texto livre, sem `ordem_compra_id`; OC não aparece no hub de recebimento | Campo opcional "Ordem de compra" (combobox) no recebimento manual; na lista de OCs `EM_TRANSITO`, CTA "Registrar recebimento" que abre o recebimento manual pré-preenchido | `RecebimentoGerentePageClient.tsx`, `OcDetalheModal.tsx`, actions de compras/recebimento | Médio — mexe em fluxo crítico de estoque; exige decisão de produto sobre unificar vocabulário antes | Nenhuma migração obrigatória se for campo aditivo |
| 2 | Estoque crítico sem reposição | Linha crítica só tem Ajustar/Kardex | 3º botão "Repor" na linha, apontando para `/admin/estoque/recebimento?produto=<id>`; `RecebimentoGerentePageClient` passa a ler esse query param e pré-popular a busca | `EstoqueTable.tsx`, `RecebimentoGerentePageClient.tsx`, `routes.ts` | Baixo | Nenhuma |
| 3 | Conferência NF-e pré-preenchida | `aplicarConferencia` usa `quantidade_conferida ?? quantidade_nfe` como default | Deixar o campo vazio/placeholder até o operador digitar, conforme o próprio comentário do código já pretendia | `ImportarNfePageClient.tsx:132-157,798` | Baixo técnico, médio operacional (muda comportamento que operadores já usam — precisa comunicação) | Nenhuma |
| 4 | Relatórios sem linhas clicáveis | Componentes renderizam `<div>`/`<tr>` estático | Envolver cada linha num `<Link>` usando o id já presente no DTO | `RelatoriosContent.tsx` (7 listas) | Baixo | Nenhuma — dado já existe |
| 5 | Divergência de estoque sem investigação | Seção só lista números | Link "Ver Kardex" por linha, reusando `KardexSheet` já existente | `RelatoriosContent.tsx:385-420`, `KardexSheet.tsx` | Baixo | Nenhuma |
| 6 | Vendas↔Financeiro sem link | `receivableReader.ts` não seleciona `venda_id`; `VendaDetailSheet`/`VendasTable` não renderizam o que já é calculado | (a) adicionar `venda_id` ao select; (b) exibir `tem_conta_receber`/`valor_aberto_cr` com link no `VendaDetailSheet`; (c) exibir nome do cliente na `VendasTable` | `receivableReader.ts:101`, `VendaDetailSheet.tsx`, `VendasTable.tsx` | Baixo | Nenhuma — dado já calculado no backend |
| 7 | Recibo sem cliente | `ReciboVenda` não tem campo cliente | Incluir nome do cliente no recibo quando presente | `CaixaReciboModal.tsx:20-31` | Baixo | Nenhuma |
| 8 | Cliente invisível no PDV | Só Alt+C / menu Operações | Botão "Cliente" visível na área principal do carrinho, mesmo nível dos outros CTAs | `CaixaOperadorContextBar.tsx`, `CaixaPdvOperacoesMenu.tsx` | Baixo — só visibilidade, lógica já existe | Nenhuma |
| 9 | Kardex×Auditoria desconectados | Nenhuma das duas telas linka para a outra | `KardexSheet`: link "Ver na auditoria" filtrado por produto; `AuditoriaTimeline`: nome do produto vira `<Link>` para `adminEstoqueProdutoQuery` | `KardexSheet.tsx`, `AuditoriaTimeline.tsx:278-294` | Baixo | Nenhuma |
| 10 | Comissões em "Mais" | Item está em `ADMIN_V2_EXPANDED_ITEMS` em vez de `ADMIN_V2_CORE_ITEMS` | Mover Comissões para `ADMIN_V2_CORE_ITEMS`. Fornecedores/Compras: avaliar separadamente (podem ter sido colocados lá intencionalmente no commit `d428eaed` — confirmar com quem decidiu) | `adminV2SidebarNav.ts:79-83` | Baixo | Confirmar intenção original do agrupamento antes de mexer em Fornecedores/Compras |

---

## F) Plano de implementação (missões pequenas, priorizadas: fluxo > clareza > velocidade > consistência > acessibilidade > estética)

1. **[fluxo]** Corrigir pré-preenchimento da conferência de NF-e (item 3) — 1 arquivo, comportamento crítico de auditoria.
2. **[fluxo]** Adicionar CTA de reposição na linha de estoque crítico + suporte a produto pré-selecionado no recebimento (item 2).
3. **[fluxo]** Decisão de produto: como o recebimento manual e as Ordens de Compra devem se relacionar (não é código, é uma reunião) — pré-requisito do item 1.
4. **[clareza]** Linkar todas as linhas de Relatórios ao registro correspondente (item 4) — maior alcance, menor risco, dado já existe.
5. **[clareza]** Expor `tem_conta_receber`/nome do cliente em Vendas + selecionar `venda_id` no Financeiro (item 6).
6. **[clareza]** Link "Ver Kardex" na divergência de estoque do relatório (item 5).
7. **[clareza]** Cliente no recibo de venda fiado (item 7).
8. **[velocidade]** Botão "Cliente" visível no PDV, fora do menu secundário (item 8).
9. **[consistência]** Link cruzado Kardex↔Auditoria (item 9).
10. **[consistência]** Mover Comissões para o grupo "Operação"/CORE da navegação (item 10).
11. **[consistência]** Padronizar vocabulário de "esperada/conferida" entre os 3 fluxos de entrada de estoque (gap 2.4) — depende do item 3 do plano.
12. **[acessibilidade/consistência]** Corrigir i18n hardcoded (pt-BR fixo) nos comprovantes do caixa (gaps 4.5, 6.3).
13. **[estética/velocidade]** Resumo do turno visível também no mobile (gap 4.4).

Cada item acima é isolado, validável sozinho e não depende de redesenho de arquitetura — exceto o item 3 (decisão de produto), que é pré-requisito explícito antes de tocar no item 1.

---

## G) O que não fazer agora

**Melhorias visuais que podem esperar:**
- Paleta de cores do Design System (jade/dourado vs. opção sóbria) — decisão de marca, não de fluxo.
- Trocar Recharts por gráficos SVG próprios, ou vice-versa.
- Qualquer refinamento de espaçamento/raio/tipografia vindo do kit.

**Componentes que não precisam ser criados:**
- `OriginBadge`, `PaymentBadge`, `FiscalBadge`, `DeltaChip` do kit — o próprio `GAP_ANALYSIS.md` do design já recomenda cortá-los em favor de `StatusChip` com `tone`.
- Um componente `FlowSteps`/stepper genérico para todos os módulos — só cogitar em `importar-nfe`, e só depois de medir taxa de abandono de conferência (recomendação do próprio autor do design, reforçada por esta auditoria).

**Refatorações que não são necessárias agora:**
- Consolidação do shell (`AdminV2Shell` + `GerenteHeaderNav` em um só) — ganho real, mas toca todas as rotas; não é um problema de fluxo prioritário hoje.
- Unificação arquitetural dos dois módulos de recebimento — a decisão de vocabulário/granularidade (item 3 do plano) vem antes de qualquer código.

**Partes do Claude Design que não devem ser incorporadas:**
- O componente `FlowSteps` como está hoje (passos fictícios, confirmado por evidência própria do design).
- Qualquer coisa do módulo `Financeiro.jsx` do kit — tem a mesma lacuna de link cruzado que o produto real, não resolve nada.
- `ui_kits` como referência visual de produção — são recriações; o código é a fonte da verdade (aviso do próprio `GAP_ANALYSIS.md`, seção 7, "Não fazer agora").

**Fluxos que já estão suficientemente bons:**
- Tela pós-salvo do cadastro de produto (Fluxo 1) — já é o padrão de CTA mais claro do sistema; considerar copiá-la, não redesenhá-la.
- Mecânica de estados da importação NF-e (Fluxo 3) — retomável, reconciliação obrigatória, gating correto; só precisa do ajuste pontual do item 3.
- Fechamento de caixa (Fluxo 6) — idempotência, RPC atômica, alçada de gerente e "blind closure" já sólidos; gaps restantes são todos P2/P3.

**Mudanças que exigem mais evidência antes de decidir:**
- Se existe ou não KPI de "contas vencidas" dentro do próprio módulo Financeiro (gap 8.4 foi reportado com confiança média — não foi lido o arquivo inteiro).
- Histórico completo de remoções no menu "Mais" (verificação parcial, só os últimos commits do arquivo de navegação foram revisados).
- Se a abertura de turno hoje já mostra ou não o resumo do fechamento anterior (comparação com `AberturaCaixa.jsx` do kit, item 6 da seção C) — não verificado neste ciclo.
- Se Fornecedores/Compras foram colocados em "Mais" por decisão deliberada (commit `d428eaed`, "separa ferramentas internas do menu do cliente") ou por omissão — precisa confirmação de quem tomou essa decisão antes de mover.
