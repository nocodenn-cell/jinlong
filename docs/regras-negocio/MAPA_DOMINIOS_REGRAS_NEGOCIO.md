# Mapa de Domínios e Regras de Negócio do Jinlong

| Campo | Valor |
|--------|--------|
| **Status** | Canônico — pré-requisito para novos módulos grandes |
| **Data** | 2026-10-07 |
| **Governança** | [GOVERNANCA_REGRAS_NEGOCIO.md](./GOVERNANCA_REGRAS_NEGOCIO.md) |
| **Confrontação** | Código (`pdv-importados`, `shared-core`, `backend/supabase`) + ADRs 005–012 + inventários `docs/architecture/` |
| **Auditoria SSoT (2026-10-07)** | [AUDITORIA_SSoT_DOMINIOS.md](./AUDITORIA_SSoT_DOMINIOS.md) · [INVENTARIO_IMPLEMENTACAO_DOMINIOS.md](./INVENTARIO_IMPLEMENTACAO_DOMINIOS.md) — **NO-GO** módulos grandes até SSOT-001…004 |
| **Legenda de maturidade** | **Operacional** = dono ativo em produção · **Parcial** = artefato existe, dono ainda misturado · **Planejado** = domínio futuro sem SSoT próprio |

---

## Como usar este mapa

Para cada feature nova:

1. Localizar o **domínio dono** da informação crítica.
2. Verificar se já existe **regra canônica** / writer / RPC.
3. Se outro domínio precisa mudar o dado: usar **contrato/orquestrador** documentado — nunca UPDATE silencioso.
4. Preencher o [checklist](./CHECKLIST_FEATURE_DOMINIO.md).

Estrutura de cada linha:

**Domínio → entidade → dado crítico → dono → regra canônica → operações permitidas → integrações → eventos → consequências F/F/E → auditoria**

(F = financeira · Fi = fiscal · E = estoque)

---

## 1. Domínios operacionais (já existem no código)

### 1.1 Produtos (`products`)

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `produtos`, `categorias`, `marcas`, `precos_atacado`, `vinculos_fornecedor_produto`, `gtin_lookup_cache` |
| **Dados críticos** | Identidade SKU, códigos, preços de **cadastro**, custo de cadastro (`preco_custo`), margem permitida, campos fiscais do SKU, status publicação |
| **Dono** | **products** — ADR-007 · UI `/admin/catalogo` |
| **Regra canônica** | CRUD via actions gerente/admin; create+estoque inicial = RPC `criar_produto_com_estoque_inicial` (orquestra inventory); preço **efetivo** na venda = RPC `calcular_preco_produto` (autoridade Postgres; TS espelho) |
| **Operações permitidas** | Criar/editar/publicar produto; gerir faixas atacado; upload imagem |
| **Quem só consulta** | PDV (leitura + resolução de preço); Estoque (FK); Fiscal (classificação no SKU); Intelligence |
| **Integrações** | → inventory (estoque inicial); ← NF-e De-Para; ← customers/suppliers (FK fornecedor) |
| **Eventos** | cadastro / publicação / alteração de preço cadastro |
| **Consequências** | F: não · Fi: campos NCM/CFOP no SKU (dono fiscal usa); E: só via RPC atômica no create |
| **Auditoria** | `historico_precos_produto`, `historico_tiers_crud`; guards margem (`124`/`125`) |
| **Maturidade** | **Operacional** |
| **Inventário** | [inventario_products_autoridade.md](../architecture/inventario_products_autoridade.md) |

**Proibido:** PDV criar produto; Estoque/Financeiro criar produto completo; segundo motor de preço atacado (`regras_preco` fora da cadeia automática).

---

### 1.2 Estoque (`inventory`)

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `estoque`, `movimentos_estoque_log`, `tipos_movimento_estoque`, `remessas`/`remessa_itens`, reposições cancel/devolução |
| **Dados críticos** | `quantidade_atual`, disponibilidade (≈ saldo), kardex, estoque mínimo |
| **Dono** | **inventory** — ADR-008 · UI `/admin/estoque/*` |
| **Regra canônica** | Saldo só via RPCs (`ajustar_estoque_manual`, `decrementar_estoque_seguro`, `transferir_estoque_seguro`, `confirmar_remessa_entrada`, paths NF-e); app **não** UPDATE direto |
| **Operações permitidas** | Ajuste, recebimento, transferência, kardex, entrada NF-e (efeito estoque) |
| **Quem só consulta** | PDV (disponibilidade); Intelligence; relatórios |
| **Integrações** | ← sales (baixa/reposição orquestrada); ← compras/NF-e (entrada); ← products (create inicial) |
| **Eventos** | `STOCK_ADJUSTED`, `STOCK_IN`, `STOCK_OUT`, `STOCK_TRANSFER` |
| **Consequências** | F: NF-e pode gerar AP (financial); Fi: não; E: **é** o dono |
| **Auditoria** | kardex (`movimentos_estoque_log` + `v_kardex_unificado`); ator em ajuste (mig. 269) |
| **Maturidade** | **Operacional** |
| **Inventário** | [inventario_inventory_autoridade.md](../architecture/inventario_inventory_autoridade.md) |

**Proibido:** Importações/Compras/Financeiro alterar `estoque` fora de RPC; reservas inventadas na UI; tratar `vendas_em_espera` como baixa.

---

### 1.3 Vendas (`sales`)

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `vendas`, `itens_venda`, `vendas_pagamentos`, `devolucoes`, `vendas_em_espera`, descontos |
| **Dados críticos** | Situação da venda, itens, pagamentos da venda, parcial → CR |
| **Dono** | **sales** — ADR-005 · UI venda `/caixa`; cancel `/admin/vendas` |
| **Regra canônica** | `finalizar_venda_transacional_canonica_v4`; cancel `cancelar_venda_transacional`; devolver `devolver_ou_trocar_venda` |
| **Operações permitidas** | Finalizar, cancelar, devolver/trocar, park/espera |
| **Quem só consulta** | Financial (origem do CR); Fiscal (enfileira doc); Intelligence |
| **Integrações** | → inventory (baixa); → cash (efeito `saldo_atual` em cancel/devolver); → financial (CR parcial); → fiscal (enqueue) |
| **Eventos** | `SALE_REGISTERED`, `SALE_CANCELLED`, `SALE_PARTIAL_RETURN` |
| **Consequências** | F: sim (parcial/CR); Fi: enqueue; E: baixa/reposição |
| **Auditoria** | `vendas_canceladas_auditoria`; snapshots de preço/desconto na venda |
| **Maturidade** | **Operacional** |
| **Inventário** | [inventario_dominio_modulo_tabela_writer.md](../architecture/inventario_dominio_modulo_tabela_writer.md) § sales |

**Proibido:** Venda escrever `movimentacoes_caixa`; segundo SSoT de pagamento fora de `vendas_pagamentos`.

---

### 1.4 Caixa (`cash`)

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `caixas`, `movimentacoes_caixa` |
| **Dados críticos** | Turno aberto/fechado, `saldo_atual` (físico A), esperado \(E(c)\) |
| **Dono** | **cash** — ADR-009 · ADR-CAIXA-002 · UI `/caixa` |
| **Regra canônica** | \(E(c)\) = `calcular_valor_sistema_dinheiro_caixa`; movs via `registrar_movimentacao` / aprovar / cancelar / estornar |
| **Operações permitidas** | Abrir, fechar, sangria, suprimento, autorização gerente |
| **Quem só consulta** | Relatórios de turno; Intelligence |
| **Integrações** | ← sales (efeito físico em cancel/devolver); **não** owns AR/AP |
| **Eventos** | abertura, fechamento, movimentação |
| **Consequências** | F: liquidez física ≠ saldo contábil/financeiro; Fi: não; E: não |
| **Auditoria** | Movimentações com aprovação; fechamento cego |
| **Maturidade** | **Operacional** |
| **Inventário** | [inventario_cash_autoridade.md](../architecture/inventario_cash_autoridade.md) |

**Proibido:** Usar `saldo_atual` como esperado contábil; misturar AR/AP no domínio cash.

---

### 1.5 Financeiro (`financial`)

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `contas_receber`, `liquidacoes_receber`, `contas_pagar`, `contas_pagar_pagamentos`, `categorias_financeiras`, comissões, `contas_financeiras` / ledger operacional |
| **Dados críticos** | Títulos AR/AP, liquidações, saldo financeiro operacional, comissões |
| **Dono** | **financial** — ADR-010 · UI `/admin/financeiro` |
| **Regra canônica** | Liquidar AR: `registrar_liquidacao_receber`; pagar AP: `registrar_pagamento_contas_pagar`; CR parcial = sales-led na RPC venda |
| **Operações permitidas** | Criar título, liquidar, pagar, cancelar AP, marcar comissões |
| **Quem só consulta** | Contábil (futuro); Intelligence; dashboards |
| **Integrações** | ← sales (CR parcial); ← NF-e/`confirmar_importacao_nfe` (AP); origem rastreável obrigatória em código novo |
| **Eventos** | título criado, liquidado, pago, cancelado |
| **Consequências** | F: **é** o dono; Fi: UI fiscal é satélite (não owns docs); E: não |
| **Auditoria** | Pagamentos/liquidações com ator; trilha de origem (NF-e id, venda id) |
| **Maturidade** | **Operacional** (dívidas D-F1 criar cliente inline — legado) |
| **Inventário** | [inventario_financial_autoridade.md](../architecture/inventario_financial_autoridade.md) |

**Proibido:** Compras/Importações manter “segundo financeiro”; Financeiro criar cliente/fornecedor completo (entity-ssot).

---

### 1.6 Fiscal (`fiscal`)

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `documentos_fiscais_pendentes`, eventos/timeline/DLQ, `fiscal_provider_config` (quando existir), campos fiscais em `produtos`/`lojas` |
| **Dados críticos** | Status do documento, chave/protocolo, erros, classificação fiscal usada na emissão |
| **Dono** | **fiscal** — worker `backend/supabase/functions/fiscal-worker`; UI fila em `/admin/financeiro?tab=fiscal` |
| **Regra canônica** | Fila + state machine + Focus como **adapter**; DTOs Focus não vazam para sales/PDV |
| **Operações permitidas** | Enfileirar, claim, emitir, consultar, reprocessar, DLQ |
| **Quem só consulta** | Financeiro (aba); Intelligence |
| **Integrações** | ← sales (enqueue pós-venda); provider externo (Focus) |
| **Eventos** | enqueued, processing, authorized, rejected, cancelled |
| **Consequências** | F: indireta; Fi: **é** o dono; E: não |
| **Auditoria** | `documentos_fiscais_eventos`, correlation id, DLQ |
| **Maturidade** | **Parcial / operacional base** (worker pode estar inativo sem Vault — ver remediação fiscal) |

**Proibido:** Segundo motor fiscal na UI de vendas; misturar regra Focus no domínio de venda.

---

### 1.7 Clientes (`customers`) e Fornecedores (`suppliers`)

| Domínio | Entidade | UI SSoT | Dono | Nota |
|---------|----------|---------|------|------|
| Customers | `clientes` | `/admin/clientes` | customers | entity-ssot; financeiro não cadastra completo (legado D-F1) |
| Suppliers | `fornecedores` | `/admin/fornecedores` | suppliers | `FornecedorCombobox` no produto = dívida — não replicar |

---

### 1.8 Compras (`purchases`) — parcial

| Campo | Conteúdo |
|-------|----------|
| **Entidades** | `ordens_compra`, `ordens_compra_itens`; recebimento via remessa / NF-e |
| **Dados críticos** | Situação do pedido de compra, itens, vínculo com entrada |
| **Dono atual** | **Parcial** — UI/legado em `gerente/compras` + estoque recebimento; **não** há ADR de Compras dedicado |
| **Regra canônica hoje** | OC: mig. `109`/`110`; NF-e compra: `importacoes_nfe` + `confirmar_importacao_nfe` (efeito estoque + AP) |
| **Lacuna** | `remessas` / `importacoes_nfe` **não** referenciam OC de forma canônica (dívida UX-03); Central de Compras futura deve **eleger dono** sem duplicar AP/estoque |
| **Maturidade** | **Parcial** |

**Gate para Central de Compras / Demanda Comercial:** não criar saldo, AP ou custo paralelo; solicitar entrada ao Estoque e título ao Financeiro.

---

## 2. Domínios planejados (bloqueados até mapa + contrato)

Antes de implementar, atualizar este mapa com writers/RPCs reais e ADR dedicado.

### 2.1 Importações (internacional / custo nacionalizado)

| Campo | Conteúdo |
|-------|----------|
| **Problema** | Processo de importação e **custo nacionalizado** como SSoT |
| **Estado hoje** | NF-e de compra nacional (`importacoes_nfe`) vive sob fluxo de **estoque + AP** — **não** é o módulo Importações planejado |
| **Dono alvo** | **importacoes** (novo) |
| **Não owns** | saldo (`inventory`); AP (`financial`); identidade SKU (`products`) |
| **Contratos obrigatórios** | Importação → solicita entrada estoque; Importação → consequência econômica → Financeiro; custo nacionalizado = **uma** fórmula/versão vigente |
| **Número explicável** | Custo nacionalizado deve citar componentes, regra vigente e status (estimado/confirmado) |
| **Pré-requisito** | ADR Importações + inventário writers + checklist feature |

### 2.2 Contabilidade Assistida (`accounting`)

| Campo | Conteúdo |
|-------|----------|
| **Dono alvo** | Visão contábil, conciliação, pré-fechamento |
| **Não owns** | AR/AP operacionais (`financial`); caixa físico (`cash`); estoque |
| **Consome** | Financeiro, Fiscal, Sales (leitura) |
| **Pré-requisito** | Não materializar segundo ledger de AP/AR |

### 2.3 Central Fiscal (evolução)

| Campo | Conteúdo |
|-------|----------|
| **Dono** | Continua **fiscal** |
| **Risco** | Duplicar classificação (produto vs emissão) ou segundo status de documento |
| **Pré-requisito** | Manter Focus como adapter; UI pode sair da aba financeiro sem mudar dono dos dados |

### 2.4 Jinlong Intelligence

| Campo | Conteúdo |
|-------|----------|
| **Dono** | **intelligence** — somente análise/recomendação |
| **Regra** | **Read-only** sobre SSoT existentes; proibido recalcular saldo/custo/margem com regra própria persistida como verdade |
| **Número explicável** | Toda métrica cita fonte, período, algoritmo e se é estimado |
| **Estado** | Cockpit read-only já previsto em GO_LIVE; expandir só como consumidor |

### 2.5 Demanda Comercial

| Campo | Conteúdo |
|-------|----------|
| **Dono alvo** | Demanda/previsão comercial (não confundir com `sales` PDV) |
| **Não owns** | Estoque, preço de venda canônico, AP |
| **Integra** | → Compras (pedido); consulta inventory/products |

### 2.6 Jinlong Mobile / Scanner

| Campo | Conteúdo |
|-------|----------|
| **Dono** | **mobile** = interface |
| **Regra** | Zero regra de negócio nova; chama os mesmos contratos dos domínios |
| **Proibido** | CRUD paralelo de produto/cliente/estoque |

---

## 3. Matriz rápida — dado crítico → dono

| Dado crítico | Dono canônico | Artefato / autoridade | Consumidores |
|--------------|---------------|------------------------|--------------|
| Identidade produto | products | `produtos` + `/admin/catalogo` | todos |
| Preço efetivo venda | products + Postgres | `calcular_preco_produto` | sales, PDV local |
| Preço/custo cadastro | products | colunas `produtos` | margem UI, guards |
| Custo nacionalizado | **importacoes** (planejado) | — (ainda não SSoT) | financial, intelligence |
| Saldo estoque | inventory | `estoque` + RPCs | PDV, compras, intelligence |
| Disponibilidade | inventory | ≈ `quantidade_atual` | PDV |
| Situação venda | sales | `vendas.status` | fiscal, financial |
| Pagamentos da venda | sales | `vendas_pagamentos` | cash (E(c) lê), financial |
| Esperado caixa \(E(c)\) | cash | RPC `calcular_valor_sistema_dinheiro_caixa` | fechamento |
| `saldo_atual` gaveta | cash | contador físico A | UI caixa |
| Contas a receber | financial | `contas_receber` | contábil, intelligence |
| Contas a pagar | financial | `contas_pagar` | contábil, intelligence |
| Documento fiscal | fiscal | `documentos_fiscais_*` | financial UI, intelligence |
| Classificação fiscal SKU | products (cadastro) / fiscal (uso emissão) | `produtos` NCM/… | fiscal-worker |
| Situação OC | purchases (parcial) | `ordens_compra` | estoque, financial |
| Cliente | customers | `/admin/clientes` | sales, financial |
| Fornecedor | suppliers | `/admin/fornecedores` | products, compras, NF-e |

---

## 4. Orquestradores cross-domínio (contratos explícitos)

| Orquestrador | Domínios | Contrato |
|--------------|----------|----------|
| `finalizar_venda_transacional_canonica_v4` | sales + inventory (+ financial se parcial) | sales-led; não escreve `movimentacoes_caixa` |
| `cancelar_venda_transacional` | sales + inventory + cash(A) | efeitos por dono de tabela |
| `devolver_ou_trocar_venda` | sales + inventory + cash(A) | idem |
| `criar_produto_com_estoque_inicial` | products + inventory | TX atômica; pós-create saldo só em `/admin/estoque` |
| `confirmar_importacao_nfe` / `importar_nfe_transacao` | inventory + financial (+ products De-Para) | estoque + AP; não segundo financeiro |
| `receber_ordem_compra` / `confirmar_remessa_entrada` | purchases/inventory | entrada estoque |

Apps **chamam** o orquestrador; **não** reimplementam a política no TypeScript da UI.

---

## 5. Conflitos e dívidas conhecidas (não replicar)

| ID | Problema | Domínios | Ação |
|----|----------|----------|------|
| D-F1 | `criarCliente` no financeiro | financial × customers | Não expandir; link para `/admin/clientes` |
| UX-03 | OC sem FK em remessa/NF-e | purchases × inventory | Resolver no ADR Compras — sem segundo SSoT |
| NF-e sob Estoque | Importação nacional misturada na UI de estoque | inventory × purchases × financial | Central de Compras/Importações deve **explicitar** dono do processo sem mover saldo para fora de inventory |
| Dual-layer gerente/admin | Actions em `gerente/*` + UI `/admin/*` | vários | Camada de dados OK; UI nova só em `/admin/*` |
| Intelligence paralelo | Risco de métrica como “verdade” | intelligence × todos | Read-only + Número Explicável |
| `regras_preco` | Motor legado fora da cadeia atacado | products/pricing | Não reativar como SSoT |

---

## 6. Gate GO / NO-GO para módulos grandes

| Módulo futuro | GO somente se… | NO-GO se… |
|---------------|----------------|-----------|
| Importações | ADR + custo nacionalizado com uma fórmula + contratos estoque/financeiro | UPDATE direto em `estoque` ou AP paralelo |
| Central Fiscal | evolui fila/docs existentes | segundo status/documento ou Focus no domínio sales |
| Contabilidade | consome financial/fiscal | duplica AR/AP/ledger operacional |
| Intelligence | read-only + rastreio de número | persiste “saldo/custo próprio” |
| Demanda/Compras | dono de pedido claro; entrada via inventory | saldo ou preço efetivo recalculados localmente |
| Mobile | thin client dos contratos | CRUD entity fora do SSoT UI |

---

## 7. Fontes confrontadas

| Fonte | Uso neste mapa |
|-------|----------------|
| ADR-005 … ADR-012, ADR-CAIXA-002 | Fronteiras e donos |
| `inventario_*_autoridade.md`, `inventario_dominio_modulo_tabela_writer.md` | Writers/RPCs |
| `.cursor/rules/entity-ssot.mdc` | Telas oficiais de CRUD |
| `docs/regras-negocio/CONSOLIDACAO_P1_NUCLEO_PDV.md` | Preço, parcial, espera, estoque |
| `docs/GOVERNANCA_PMO_JINLONG.md` | Cobertura funcional |
| Migrations `075`, `104`/`108`, `109`/`110`, `034`, fiscal `035`+ | Evidência de schema |

---

## Princípio

**uma regra → um responsável → uma fonte de verdade → múltiplos consumidores.**
