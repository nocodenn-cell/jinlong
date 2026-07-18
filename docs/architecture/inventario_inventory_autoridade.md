# Inventário Inventory — entidades e autoridade

| Campo | Valor |
|--------|--------|
| **Missão** | Inventory 0 — Inventário e autoridade |
| **Data** | 2026-07-18 |
| **Pré-requisitos** | ADR-005 · ADR-007 (products) · [inventario_dominio_modulo_tabela_writer.md](./inventario_dominio_modulo_tabela_writer.md) § inventory |
| **Referência de domínio** | Products 0 ([inventario_products_autoridade.md](./inventario_products_autoridade.md)) |
| **ADRs** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md) · [ADR-007](../adr/ADR-007-products-domain-boundary.md) |
| **Escopo** | Diagnóstico factual — **não** cria `shared-core/inventory`, **não** move código, **não** altera RPC/UI/migrations |

---

## 1. Diagnóstico executivo

Inventory é o domínio de **saldo físico e movimentos** (kardex). É **tier E** na migração frontend (após products), mas a autoridade de mutação já mora quase toda no **Postgres** (RPCs SECURITY DEFINER + lock de linha).

| Dimensão | Estado hoje | Implicação para o contrato |
|----------|-------------|----------------------------|
| UI SSoT | `/admin/estoque/*` | entity-ssot — ajuste manual só aqui (pós-create) |
| Writers TS | `app/gerente/estoque/*` (+ recebimento, transferências, NF-e) | Dual-layer admin UI ↔ gerente actions |
| Saldo | tabela `estoque` (PK lógica loja+produto) | **inventory owns** |
| Kardex | `movimentos_estoque_log` + `tipos_movimento_estoque` | Writers SQL nas RPCs — app só lê |
| Baixa venda | `decrementar_estoque_seguro` via `finalizar_venda_*` | Efeito inventory, orquestração **sales-led** |
| Inventário físico | **Sem** entidade própria | Motivo `ACERTO_INVENTARIO` no ajuste manual |
| Reservas | **Não existem** | `vendas_em_espera` explicitamente *não* reserva estoque |
| `shared-core/inventory` | **Inexistente** | Próximas missões — após ADR-008 |

**Veredito:** inventário suficiente para ADR-008. **Não** iniciar contracts/adapters sem congelar: (1) saldo = Postgres; (2) sales só solicita baixa via orquestrador; (3) cash não conhece estoque.

---

## 2. Entidades do domínio

### 2.1 Núcleo — saldo

| Entidade | Artefato | Propósito | Evidência |
|----------|----------|-----------|-----------|
| Saldo por loja+SKU | `estoque` | `quantidade_atual`, `estoque_minimo`, `version`, `updated_at` | `001_schema_inicial.sql`; multi-loja `032` (unique `(loja_id, produto_id)`) |
| View alerta | `v_estoque_baixo` | Leitura deficit (`estoque_minimo - quantidade_atual`) | `032`; security invoker `040` |
| Concorrência | `estoque.version` | Incremento em updates; backup otimista além de `FOR UPDATE` | `016_estoque_atomic_lock.sql` |

**Não há** coluna de “quantidade reservada” nem “disponível” persistida — disponível ≈ `quantidade_atual` (transferência expõe via RPC de leitura).

### 2.2 Movimentos / kardex

| Entidade | Artefato | Propósito | Evidência |
|----------|----------|-----------|-----------|
| Catálogo de tipos | `tipos_movimento_estoque` | Códigos (entrada/saída, exige gerente) | `034` |
| Kardex físico | `movimentos_estoque_log` | Delta, tipo, usuário, loja, produto; opcional `remessa_id`, `venda_id` | `034`; `venda_id` em `127` |
| View unificada | `v_kardex_unificado` | Une log físico + ramos legados (anti-dupla contagem venda) | `127` |

**Tipos canônicos observados** (seed/evoluções):

| Código | Semântica |
|--------|-----------|
| `ENTRADA_REMessa_LOJA` | Entrada por remessa/conferência |
| `ENTRADA_AJUSTE` / `SAIDA_AJUSTE` | Ajuste manual (delta +/−) |
| `SAIDA_AVARIA` | Perda/quebra no ajuste |
| `TRANSFERENCIA_SAIDA` / `TRANSFERENCIA_ENTRADA` | Transferência entre lojas |
| `ENTRADA_NFE` | Importação NF-e de compra |
| `SAIDA_VENDA` | Baixa na finalização (físico desde mig. 127) |
| `ENTRADA_CANCELAMENTO_VENDA` | Reposição no cancel (view/kardex lógico) |
| `ENTRADA_DEVOLUCAO_CLIENTE` | Devolução/troca pós-venda (`248`) |

### 2.3 Ajustes

| Conceito | Onde mora | Nota |
|----------|-----------|------|
| Ajuste manual de saldo | RPC `ajustar_estoque_manual` | Motivos: `COMPRA`, `PERDA`, `QUEBRA`, `ACERTO_INVENTARIO`, `OUTRO` (+ obs obrigatória se OUTRO) |
| UI | `/admin/estoque` → `atualizarEstoqueProduto` | Chama RPC (service_role + `p_ator_id` desde mig. 269) |
| Estoque inicial (create) | RPC `criar_produto_com_estoque_inicial` | Orquestrador products+inventory; se qty>0 chama ajuste com `ACERTO_INVENTARIO` |

### 2.4 Entradas

| Fluxo | Artefato | Writer |
|-------|----------|--------|
| Remessa / recebimento sem NF | `remessas` + `remessa_itens` → RPC `confirmar_remessa_entrada` | `app/gerente/recebimento/actions.ts` |
| NF-e compra | `importacoes_nfe` + RPC `importar_nfe_transacao` | `app/gerente/estoque/importar-nfe/actions.ts` |
| Transferência (entrada destino) | RPC `transferir_estoque_seguro` | `app/gerente/transferencias/actions.ts` |
| Cancel / devolução | RPCs sales-led | Reposição em `estoque` + log/idempotência |

### 2.5 Saídas

| Fluxo | Artefato | Writer |
|-------|----------|--------|
| Venda PDV | `decrementar_estoque_seguro` (+ `estoque_baixas`) | Dentro de `finalizar_venda_transacional_canonica_v4` |
| Ajuste negativo / avaria | `ajustar_estoque_manual` | Gerente/admin |
| Transferência (saída origem) | `transferir_estoque_seguro` | Gerente |
| Sync legado | `decrementar_estoque_idempotente` → delega ao seguro | Edge/sync — `070`/`071` (authenticated revoked) |

### 2.6 Inventário físico

| Conceito | Estado | Implicação |
|----------|--------|------------|
| Sessão de contagem (documento, contagem cega, fechamento) | **Ausente** como tabela/RPC | Dívida de produto (roadmap P1 em artifact Missão 3) |
| Acerto pontual | Motivo `ACERTO_INVENTARIO` no ajuste manual | Substitui inventário formal hoje |
| UI | Select no `AjusteSaldoModal` | Não há fluxo “abrir inventário → conferir → fechar” |

### 2.7 Reservas

| Conceito | Estado | Evidência |
|----------|--------|-----------|
| Reserva de estoque no carrinho / venda em espera | **Não existe** | Mig. `24703`: *“Vendas pausadas no PDV (pré-finalização). Não reserva estoque.”* |
| Soft-hold / allocation | **Não existe** | — |

### 2.8 Auxiliares de idempotência / auditoria inventory

| Artefato | Papel |
|----------|-------|
| `estoque_baixas` | Idempotência baixa venda (venda_id + produto_id) — `007` |
| `estoque_reposicoes_cancelamento` | Idempotência reposição no cancel — `050` |
| `estoque_reposicoes_devolucao` | Idempotência devolução/troca — `248` |
| `transferencias_idempotencia` | Idempotência transferência — `082` |
| `importacoes_nfe` | Idempotência por `chave_acesso` — `075` |

### 2.9 Satélites (leitura / UI, não saldo)

| Artefato | Papel | Dono |
|----------|-------|------|
| Etiquetas | Leitura estoque + produto | inventory UI (`imprimir-etiquetas`) |
| Relatórios | `relatorio_previsao_estoque`, `relatorio_cobertura_estoque`, sem giro | inventory read / analytics |
| De-Para NF-e | `vinculos_fornecedor_produto` | inventory/compras-led (pode criar SKU — exceção ADR-007) |

---

## 3. Autoridade dos dados

Para cada conceito: quem **cria**, quem **altera**, quem **apenas lê**.

| Conceito | Dono | Writer atual | Fonte de verdade |
|----------|------|--------------|------------------|
| Saldo `estoque.quantidade_atual` | **inventory** | RPCs: `decrementar_estoque_seguro`, `ajustar_estoque_manual`, `confirmar_remessa_entrada`, `transferir_estoque_seguro`, `importar_nfe_transacao`, `criar_produto_com_estoque_inicial`, `cancelar_venda_transacional`, `devolver_ou_trocar_venda` | **Postgres** (linha `estoque`) |
| `estoque.estoque_minimo` | **inventory** | `ajustar_estoque_manual`; create inicial (RPC 270 / defaults config) | **Postgres** |
| Linha `estoque` (INSERT) | **inventory** | RPC 270; `importar_nfe_transacao`; transferência destino; **legado** `garantirLinhaEstoque` (INSERT TS) | Preferir RPC; insert TS = dívida |
| Kardex `movimentos_estoque_log` | **inventory** | Somente RPCs SQL (app **não** INSERT direto no fluxo canônico) | **Postgres** |
| Tipos de movimento | **inventory** | Migrations (seed) | Catálogo DB |
| Remessa / itens | **inventory** | Actions recebimento + RPC confirmar | **Postgres** |
| Transferência | **inventory** | `transferir_estoque_seguro` | **Postgres** |
| Import NF-e (estoque + log) | **inventory** (orquestra; pode tocar products) | `importar_nfe_transacao` | **Postgres** |
| Baixa venda | **inventory** (efeito) / **sales** (orquestra) | `finalizar_venda_*` → `decrementar_estoque_seguro` | **Postgres** |
| Reposição cancel/devolver | **inventory** (efeito) / **sales** (orquestra) | `cancelar_venda_transacional`, `devolver_ou_trocar_venda` | **Postgres** |
| Idempotência baixa/reposição | **inventory** | Tabelas `estoque_baixas` / reposições (escritas nas RPCs) | **Postgres** |
| Snapshot custo na venda | **sales** (snap) / **products** (cadastro) | `itens_venda.custo_unitario_snap` ← `produtos.preco_custo` | **Não** é ledger de estoque |
| Preço / catálogo | **products** | Fora deste domínio | ADR-007 |
| `caixas` / movs caixa | **cash** | Sem writer de estoque | ADR-CAIXA-002 |

### 3.1 Quem cria / altera / lê (resumo)

| Conceito | Cria | Altera | Só lê |
|----------|------|--------|-------|
| Saldo | Create produto (270), NF-e, transferência destino, `garantirLinhaEstoque` legado | Venda, cancel, devolução, ajuste, remessa, NF-e, transferência | PDV (`caixaEstoqueServer`), listagens, kardex UI, relatórios, etiquetas |
| Movimento kardex | RPCs de mutação de saldo | **Imutável** por desenho (append-only; venda imutável `127`) | `obterKardexProduto`, views, dashboard |
| Remessa | Gerente recebimento | Confirmação (status via RPC) | Listagens recebimento |
| Inventário físico | — (não modelado) | Ajuste com motivo acerto | — |
| Reserva | — | — | — |

---

## 4. Writers existentes

### 4.1 Mapa por caminho de negócio

| Caminho | RPC / mecanismo | App entry | Notas |
|---------|-----------------|-----------|-------|
| **Venda baixa estoque** | `finalizar_venda_transacional_canonica_v4` → `decrementar_estoque_seguro` | `pdv-importados/app/caixa/server/caixaVendas.impl.ts` | Grava `estoque_baixas` + `SAIDA_VENDA` no log (`127`) |
| **Cancelamento restaura** | `cancelar_venda_transacional` | `caixaVendas.impl.ts` → `cancelarVendaImpl` | + `estoque_reposicoes_cancelamento`; orquestra também cash(A) |
| **Devolução / troca** | `devolver_ou_trocar_venda` | `app/gerente/vendas/devolverOuTrocarVenda.impl.ts` | + `estoque_reposicoes_devolucao`; `ENTRADA_DEVOLUCAO_CLIENTE` |
| **Ajuste manual** | `ajustar_estoque_manual` | `app/gerente/estoque/actions.ts` → `atualizarEstoqueProduto` | UI `/admin/estoque`; motivos incl. inventário |
| **Entrada remessa** | `confirmar_remessa_entrada` | `app/gerente/recebimento/actions.ts` | Insert remessa+itens depois RPC |
| **Entrada NF-e** | `importar_nfe_transacao` | `app/gerente/estoque/importar-nfe/actions.ts` | Pode criar/atualizar `produtos` + custo; `ENTRADA_NFE` |
| **Transferência** | `transferir_estoque_seguro` (+ `obter_estoque_disponivel_transferencia`) | `app/gerente/transferencias/actions.ts` | Idempotência `082`; contratos JSON em `docs/contracts/v1/` |
| **Estoque inicial (create)** | `criar_produto_com_estoque_inicial` | Adapter `criarProdutoComEstoqueInicialRpc.ts`; PDV relâmpago `caixaCadastroRelampago.impl.ts` | products-led; efeito inventory |
| **Inventário** | *mesmo* ajuste com `ACERTO_INVENTARIO` | Modal ajuste admin | Sem sessão de contagem |
| **Linha zero legada** | INSERT direto `estoque` | `garantirLinhaEstoque` | Bypass kardex — dívida |
| **Listagem** | `gerente_estoque_list_page` | `obterListaEstoqueGerente` | Read |
| **Kardex UI** | SELECT `movimentos_estoque_log` | `app/admin/estoque/actions.ts` → `obterKardexProduto` | Read-only |
| **Sync offline (legado)** | `decrementar_estoque_idempotente` → seguro | Edge / docs sync | Authenticated revoke `071` |

### 4.2 RPCs inventory (canônicas)

| RPC | Mutação | Perfil típico |
|-----|---------|---------------|
| `ajustar_estoque_manual` | Saldo + kardex ajuste | GERENTE/DONO; OPERADOR em path estoque inicial PDV (`20260718135500`) |
| `decrementar_estoque_seguro` | Baixa + `estoque_baixas` + `SAIDA_VENDA` | Chamada pela TX de venda |
| `confirmar_remessa_entrada` | Entrada remessa + log | GERENTE+ |
| `transferir_estoque_seguro` | Saída origem + entrada destino + log | GERENTE+ |
| `obter_estoque_disponivel_transferencia` | Leitura | GERENTE+ |
| `importar_nfe_transacao` | Entrada NF-e (+ products lateral) | GERENTE+ |
| `criar_produto_com_estoque_inicial` | INSERT estoque (+ ajuste opcional) | products+inventory |
| `gerente_estoque_list_page` | Leitura paginada | GERENTE+ |
| `relatorio_previsao_estoque` / `relatorio_cobertura_estoque` | Leitura analítica | GERENTE+ |

### 4.3 Actions / services (borda app)

| Path | Papel |
|------|-------|
| `pdv-importados/app/gerente/estoque/actions.ts` | Ajuste, listagem, KPIs, `garantirLinhaEstoque` |
| `pdv-importados/app/admin/estoque/actions.ts` | Kardex read; reexporta list/ajuste gerente |
| `pdv-importados/app/gerente/recebimento/actions.ts` | Remessa + confirmar |
| `pdv-importados/app/gerente/transferencias/actions.ts` | Transferência segura |
| `pdv-importados/app/gerente/estoque/importar-nfe/actions.ts` | Preview + `importar_nfe_transacao` |
| `pdv-importados/app/caixa/server/caixaEstoqueServer.ts` | **Read** resumo saldo no PDV |
| `pdv-importados/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc.ts` | Adapter create atômico |

### 4.4 Scripts / legado

| Item | Status |
|------|--------|
| `decrementar_estoque_idempotente` (pré-070) | Delegado ao seguro; não usar path antigo |
| Inserts diretos `estoque` em cleanup exclusão produto | Legado products (D-P7) — efeito inventory |
| `pdv-importados/CONFLITO_ESTOQUE_ANALYSIS.md` | Doc histórico concorrência offline — autoridade continua no `FOR UPDATE` no sync |
| `pdv-local` | Sem writer local de estoque no `src/` (piloto web: sync → RPC canônica) |
| Overloads `transferir_estoque_entre_lojas` (034/044) | Preferir `transferir_estoque_seguro` (`082`) |

---

## 5. Regras de negócio atuais

### 5.1 Estoque negativo

| Regra | Valor | Autoridade |
|-------|-------|------------|
| Baixa de venda | **Não** permite negativo — falha `ESTOQUE_INSUFICIENTE` se `quantidade_atual < p_quantidade` | `decrementar_estoque_seguro` (`016`/`127`) |
| Ajuste manual | Alvo `p_quantidade_atual >= 0` — rejeita negativo | `ajustar_estoque_manual` |
| Transferência | Exige saldo suficiente na origem | `transferir_estoque_seguro` / validação app |
| Remessa / NF-e | Entradas aumentam saldo (não criam negativo) | RPCs respectivas |

**Conclusão:** saldo negativo **não** é permitido nos writers canônicos.

### 5.2 Movimentação obrigatória

| Mutação de saldo | Gera linha em `movimentos_estoque_log`? |
|------------------|----------------------------------------|
| Venda (desde 127) | Sim — `SAIDA_VENDA` |
| Ajuste com delta ≠ 0 | Sim — entrada/saída/avaria |
| Remessa confirmada | Sim — `ENTRADA_REMessa_LOJA` |
| NF-e | Sim — `ENTRADA_NFE` |
| Transferência | Sim — saída + entrada |
| `garantirLinhaEstoque` (INSERT 0) | **Não** (só cria linha) |
| Create 270 com qty 0 | Linha estoque; ajuste só se qty > 0 |

Regra de produto desejada: **toda alteração de quantidade** passa por RPC que audita. Exceção legada: INSERT zero sem kardex.

### 5.3 Auditoria / histórico

| Camada | Artefato |
|--------|----------|
| Kardex operacional | `movimentos_estoque_log` (+ `v_kardex_unificado`) |
| Idempotência venda | `estoque_baixas` |
| Cancel / devolução | tabelas `estoque_reposicoes_*` + eventos sales (`SALE_*`) |
| UI | Sheet kardex admin (últimos 60) |
| Motivo ajuste | Codificado em `observacao` (`motivo=… \| obs=…`) |

### 5.4 Quantidade disponível

| Conceito | Implementação |
|----------|---------------|
| Disponível para venda / transferência | ≈ `estoque.quantidade_atual` (sem reservas) |
| RPC transferência | `obter_estoque_disponivel_transferencia` → `quantidade_disponivel` |
| Alerta mínimo | `quantidade_atual <= estoque_minimo` (listagens / `v_estoque_baixo`) |

### 5.5 Custo

| Conceito | Dono | Nota |
|----------|------|------|
| `produtos.preco_custo` | **products** | Cadastro; NF-e pode atualizar (orquestração inventory-led) |
| `itens_venda.custo_unitario_snap` | **sales** | Snapshot visual — *não* usado em cálculo de estoque (`235`) |
| Custo médio / valuation de estoque | **Ausente** | Inventory **não** mantém ledger de custo |

### 5.6 Lote / validade

| Conceito | Estado |
|----------|--------|
| Lote / série / validade em estoque | **Não modelado** (sem tabela de lotes de inventário) |
| `data_validade` em `regras_preco` | Pricing legado — **não** inventory |

### 5.7 Multi-loja e concorrência

| Regra | Detalhe |
|-------|---------|
| Escopo | Unique `(loja_id, produto_id)` |
| Lock | `SELECT … FOR UPDATE` nas baixas/ajustes/transferências |
| Idempotência | Chaves por venda/produto, transferência, chave NF-e |
| Offline | Conflito resolvido no sync: primeiro `FOR UPDATE` ganha; segundo `ESTOQUE_INSUFICIENTE` |

---

## 6. Fronteiras com outros domínios

### 6.1 Matriz

| Domínio | Relação com Inventory |
|---------|------------------------|
| **Products** | Fornece **identidade** do produto (`produto_id`). Não é dono do saldo contínuo. Create atômico (RPC 270) é a única orquestração products→inventory canônica no cadastro. |
| **Inventory** | Dono de **saldo**, **movimentos**, **ajustes**, remessas, transferências, entrada NF-e (estoque). UI SSoT `/admin/estoque/*`. |
| **Sales** | **Solicita baixa** (e reposição no cancel/devolver) via orquestradores RPC — não edita saldo por UPDATE direto na app. |
| **Cash** | **Não conhece estoque.** Sem writers de `estoque` / kardex. `saldo_atual` e \(E(c)\) são independentes. |

### 6.2 Orquestradores cross-cut (não god modules)

| Orquestrador | Domínios | Efeito inventory |
|--------------|----------|------------------|
| `finalizar_venda_transacional_canonica_v4` | sales + inventory | Baixa saldo + `SAIDA_VENDA` |
| `cancelar_venda_transacional` | sales + inventory + cash(A) | Reposição saldo |
| `devolver_ou_trocar_venda` | sales + inventory + cash(A) | Reposição parcial/total |
| `criar_produto_com_estoque_inicial` | products + inventory | INSERT estoque (+ ajuste) |
| `importar_nfe_transacao` | inventory (+ products se cria/atualiza SKU/custo) | Entrada + kardex; create lateral permitido |

### 6.3 Entity-ssot UI

| Entidade | Rota oficial |
|----------|----------------|
| Estoque (saldo manual) | `/admin/estoque` |
| Recebimento | `/admin/estoque/recebimento` |
| Transferências | `/admin/estoque/transferencias` |
| Import NF-e | `/admin/estoque/importar-nfe` |
| Etiquetas | `/admin/estoque/imprimir-etiquetas` |
| Produto (catálogo) | `/admin/catalogo` — **não** ajustar saldo pós-create |

PDV: só lê saldo; create mínimo + estoque inicial via RPC 270 (relâmpago). Financeiro: sem CRUD de estoque.

```
Products ──identidade──► Inventory ──saldo/movs──► (leitura) Sales / Relatórios
                              ▲
                              │ baixa / reposição (RPC)
                            Sales
Cash ──//── (sem aresta para estoque)
```

---

## 7. Dívidas encontradas

| ID | Tipo | Descrição | Severidade |
|----|------|-----------|------------|
| **D-I1** | Bloqueador piloto (doc/contrato) | Sem `shared-core/inventory` nem ADR-008 — risco de misturar saldo em products ou reimplementar baixa em TS | **Bloqueador** para scaffold |
| **D-I2** | Bloqueador piloto (produto) | Inventário físico formal inexistente (só motivo no ajuste) — operação Jinlong listou “sessão de contagem” como P1 | **Bloqueador** se piloto exigir contagem; senão melhoria |
| **D-I3** | Legado | `garantirLinhaEstoque` INSERT direto sem kardex | Média |
| **D-I4** | Legado / dual-layer | UI `/admin/estoque` ↔ writers `gerente/estoque` (+ redirects) | Alta (migração) — espelha D-P1 |
| **D-I5** | Lacuna inventário 5.1a | Lista completa de writers SQL de `movimentos_estoque_log` ainda parcial em docs transversais | Baixa (este doc fecha o mapa canônico) |
| **D-I6** | Melhoria futura | Sem reservas — venda em espera não segura saldo | Produto (aceitar ou modelar) |
| **D-I7** | Melhoria futura | Sem lote/validade / custo médio de estoque | Fora do piloto típico importados |
| **D-I8** | Legado | RPC transferência antiga `transferir_estoque_entre_lojas` vs `transferir_estoque_seguro` | Baixa se UI só usa a segura |
| **D-I9** | Legado sync | Paths Edge/`decrementar_estoque_idempotente` — manter delegação; não reabrir authenticated | Controlada |
| **D-I10** | Melhoria futura | Kardex UI limitado a 60 linhas; sem paginação/export canônico do log | Baixa |
| **D-I11** | Cross-cut | NF-e atualiza `preco_custo` / cria SKU — fronteira inventory→products (já na ADR-007); contrato inventory deve citar a exceção | Documentar no ADR-008 |

### Classificação pedida

| Classe | IDs |
|--------|-----|
| **Bloqueador piloto** | D-I1; D-I2 **se** contagem física for requisito do piloto |
| **Melhoria futura** | D-I6, D-I7, D-I10; D-I2 se piloto aceitar só acerto manual |
| **Legado** | D-I3, D-I4, D-I5, D-I8, D-I9 |

---

## 8. Recomendação ADR-008

Preparar decisão (Missão Inventory 1) — **sem implementar** nesta missão.

### 8.1 Inventory owns

| Owns | Exemplos |
|------|----------|
| **Saldo** | `estoque` (`quantidade_atual`, `estoque_minimo`, `version`) |
| **Movimentos** | `movimentos_estoque_log`, `tipos_movimento_estoque`, views kardex |
| **Ajustes** | `ajustar_estoque_manual` + motivos (incl. acerto inventário) |
| Fluxos de estoque | remessa, transferência, entrada NF-e (efeito estoque), idempotência de baixa/reposição |
| UI SSoT | `/admin/estoque/*` |

### 8.2 Inventory does **not**

| Não fazer | Motivo / dono |
|-----------|----------------|
| Cálculo de preço efetivo ou cadastro de preço | **products** + Postgres `calcular_preco_produto` |
| Catálogo / CRUD completo de SKU | **products** (`/admin/catalogo`) — exceto create lateral NF-e já documentado |
| Financeiro / caixa / \(E(c)\) / `movimentacoes_caixa` | **cash** / **sales** (pagamentos) |
| Reservas (até existir requisito) | Não inventar na extração |
| Valuation / custo médio de estoque | Fora do escopo até missão explícita |

### 8.3 Cláusulas sugeridas no ADR-008

1. **Saldo = Postgres** — adapters chamam RPCs; proibido UPDATE/INSERT de quantidade em actions “por conveniência”.  
2. **Sales solicita baixa** — só via orquestrador `finalizar_venda_*` / cancel / devolver; não há port TS que decrementa saldo fora disso.  
3. **Cash não conhece estoque** — sem imports de inventory em cash.  
4. **Products fornece identidade** — inventory referencia `produto_id`; estoque inicial só via RPC 270 (products-led).  
5. **Kardex append-only** — leitura na borda; escrita só RPC.  
6. **Exceção NF-e** — inventory-led pode criar/atualizar SKU/custo (já ADR-007); não amplia dono do catálogo.  
7. **Inventário físico** — decidir: (a) permanecer como motivo de ajuste no piloto, ou (b) missão futura de entidade de contagem — não misturar no scaffold de contracts.  
8. i18n na borda — codes de erro de RPC (`AJUSTE_ESTOQUE_*`, `ESTOQUE_INSUFICIENTE`, …) mapeados como em customers/products.

### 8.4 Pasta alvo futura (pós-ADR)

```
shared-core/src/inventory/
  types.ts
  contracts.ts
  errorCodes.ts
  policies/          # validação de ajuste/transferência — NÃO reimplementar baixa de venda
  index.ts
```

Ordem sugerida:

```
Inventory 0  inventário + autoridade     ← este doc
    ↓
Inventory 1  ADR-008 (fronteiras + cláusulas §8.3)
    ↓
Inventory 2  types/contracts/policies/errorCodes (+ specs) — sem wire UI
    ↓
Inventory 3+ Reader → Writer(ajuste RPC) → i18n borda → wire admin
```

**Não** começar por modal de inventário físico nem por mover telas.

---

## 9. GO / NO-GO

| Critério | Status |
|----------|--------|
| Entidades mapeadas (saldo, movimentos, ajustes, entradas, saídas, inventário físico, reservas) | OK |
| Autoridade (dono / writer / fonte de verdade) | OK |
| Writers por caminho de negócio + RPCs/actions/legado | OK |
| Regras (negativo, movimento, auditoria, disponível, custo, lote) | OK |
| Fronteiras products / inventory / sales / cash | OK |
| Dívidas classificadas | OK |
| Recomendação ADR-008 | OK |
| Criar `shared-core/inventory` / adapters / i18n / wire / migrations nesta missão | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Congelar este inventário como base do domínio Inventory | **GO** |
| Prosseguir **Missão Inventory 1 — ADR-008** | **GO** (quando autorizar) |
| Extrair contracts/adapters/wire agora | **NO-GO** |
| Reimplementar baixa de venda em TypeScript | **NO-GO** |
| Tratar inventory como submódulo de products na mesma extração | **NO-GO** (ADR-007) |

---

## Referências

- Writers transversais: [inventario_dominio_modulo_tabela_writer.md](./inventario_dominio_modulo_tabela_writer.md)  
- Frontend boundary: [inventario_frontend_boundary.md](./inventario_frontend_boundary.md)  
- Products 0 / ADR-007: [inventario_products_autoridade.md](./inventario_products_autoridade.md), [ADR-007](../adr/ADR-007-products-domain-boundary.md)  
- Template: [template_dominio_internacionalizado.md](./template_dominio_internacionalizado.md)  
- Entity-ssot: `.cursor/rules/entity-ssot.mdc`  
- Migrações-chave: `001`, `007`, `016`, `032`, `034`, `050`, `063`, `075`, `082`, `127`, `248`, `269`, `270`, `20260718135500`  
- UI SSoT: `pdv-importados/app/admin/estoque/`  
- Actions: `pdv-importados/app/gerente/estoque/actions.ts`, `recebimento/actions.ts`, `transferencias/actions.ts`, `estoque/importar-nfe/actions.ts`  
- Contratos RPC: `docs/contracts/v1/rpc-transferir-estoque-seguro.json`, `rpc-decrementar-estoque-seguro.json`  

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Inventário Inventory + autoridade + recomendação ADR-008 | 2026-07-18 |
