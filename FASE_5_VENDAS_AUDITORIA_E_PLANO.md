# Fase 5 — Vendas (PDV + Histórico + Integração Completa)
## Auditoria e Plano de Implementação

**Data:** 2026-07-17
**Escopo:** domínio de Vendas (PDV web `pdv-importados`, PDV local offline `pdv-local`, RPCs/migrations em `backend/supabase`)
**Método:** leitura direta de código-fonte, migrations SQL e execução dos guards de CI existentes. Nenhuma suposição feita a partir de documentação sem confirmação no código.

---

## 1. Inventário completo do domínio de Vendas

### 1.1 Camadas envolvidas

| Camada | Localização | Papel |
|---|---|---|
| PDV web (caixa online) | `pdv-importados/app/caixa/` | UI + Server Actions do caixa |
| PDV local (offline) | `pdv-local/` (Tauri/Rust) | Vendas offline, sincroniza via outbox |
| Sync/Outbox | `backend/supabase/functions/sync-outbox/index.ts` | Ponto único de entrada das vendas do PDV local |
| Gerente/Retaguarda | `pdv-importados/app/gerente/vendas/` | Cancelamento, devolução/troca, listagem administrativa de vendas |
| Banco (RPCs) | `backend/supabase/migrations/*.sql` (269 migrations) | Regras transacionais, idempotência, auditoria |

### 1.2 RPCs de venda ativas hoje (confirmado por grep + guard)

| RPC | Caller único autorizado | Enforced por |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4` | `pdv-importados/app/caixa/server/caixaVendas.impl.ts` | `scripts/rpc-gate-guard.mjs` |
| `registrar_venda_com_itens` | `backend/supabase/functions/sync-outbox/index.ts` | `scripts/rpc-gate-guard.mjs` |
| `cancelar_venda_transacional` (migrations 050, 059) | `pdv-importados/app/caixa/server/caixaVendas.impl.ts` (`cancelarVendaImpl`, chamado por `gerente/vendas/actions.ts` via `@/app/caixa/actions`) | manual (sem guard dedicado) |
| `devolver_ou_trocar_venda` (migration 248) | `pdv-importados/app/gerente/vendas/devolverOuTrocarVenda.impl.ts` | manual (sem guard dedicado) |
| `colocar_venda_em_espera` / `retomar_venda_em_espera` / `listar_vendas_em_espera` (migration 24703) | `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts` | manual |

### 1.3 Funcionalidades já implementadas (verificado no código)

- Abertura/finalização de venda (v4), com validação de preço autoritativa server-side.
- Cancelamento de venda (RPC `cancelar_venda_transacional`, com split e auditoria para não-dinheiro — migration 059).
- Devolução/troca de venda (RPC `devolver_ou_trocar_venda`, migration 248, 624 linhas — item a item, com estorno e venda substituta).
- Venda em espera (park/resume), sem cliente persistido (débito técnico conhecido, ver `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`).
- Múltiplas formas de pagamento por venda (`pagamentos: []`, UI com `adicionarParcela` em `CaixaPageClient.tsx:282`), incluindo normalização de troco na última parcela em dinheiro.
- Cálculo canônico de troco: `caixaPagamentoSaldo.ts:56` (`calcularTroco`), única fonte usada por UI e validação.
- Pagamento parcial/crediário: quando soma de pagamentos < total, exige `clienteId` e a RPC v4 cria `contas_receber` automaticamente e idempotente (migration `24702`).
- Preço varejo/atacado/manual/promoção como `tipoPreco` (`VAREJO | ATACADO | MANUAL | PROMOCAO` — `finalizarVendaValidation.ts:24`).
- Desconto de gerente com token de autorização (`descontoGerenteToken` + `descontoGerentePercentual`), auditado.
- Auditoria/ledger de eventos de venda (`venda_eventos`, migrations 228/229/231), com view de anomalias de consistência (`v_venda_consistencia_anomalias`, migration 244) checando: itens presentes, exatamente 1 evento `SALE_REGISTERED`, pagamentos batendo com total.
- Histórico de vendas no caixa: filtros, impressão de cupom/etiqueta, exportação CSV (lista e detalhe) — `CaixaHistoricoSheet.tsx`.
- Baixa de estoque automática em ambos os fluxos (v4 no próprio SQL; offline via `aplicarBaixaEstoquePorItem`).

### 1.4 Funcionalidades da Fase 5 ausentes ou incompletas (gap real, verificado)

| Item pedido na Fase 5 | Status | Evidência |
|---|---|---|
| **Orçamento** (venda não vinculante, converte depois) | ❌ Não existe | Nenhuma ocorrência de "orçamento"/"quote" no domínio de vendas; venda em espera não é a mesma coisa (não gera documento, expira/decai diferente) |
| **Reabertura de venda concluída** | ❌ Não existe | Nenhuma RPC/UI de "reabrir"; só cancelamento (irreversível) ou devolução parcial |
| **Kits de produto** | ❌ Não existe | Nenhuma coluna/tabela `kit` nas migrations; produto é sempre unitário |
| **Edição de venda em aberto pelo operador do caixa** | ⚠️ Parcial | Só existe edição via carrinho antes de finalizar; não há "editar venda já concluída" (correto — isso é escopo de devolução/cancelamento, não edição) |
| **Cancelamento/devolução direto do caixa (operador)** | ⚠️ Só gerente | `VendaCancelarModal.tsx` e `VendaDevolucaoModal.tsx` vivem em `app/gerente/vendas/`, não em `app/caixa/`. Operador de caixa não cancela/devolve sem ir à tela de gerente |
| **Cliente associado a venda em espera** | ⚠️ Débito técnico conhecido | `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`, TODO em `caixaVendaEspera.impl.ts:314` |
| **Histórico: cliente da venda / reimpressão NF-e / etiqueta pelo operador** | ⚠️ Parcial | `TODO_auditoria_255.md` linhas 14-16 |
| **Guard de CI para `cancelar_venda_transacional` / `devolver_ou_trocar_venda`** | ⚠️ Ausente | `rpc-gate-guard.mjs` só cobre v4 e `registrar_venda_com_itens`; nada impede um segundo caller dessas duas RPCs de gerente amanhã |
| **Ledger explícito de eventos de park/resume/discard da venda em espera** | ⚠️ Ausente | TODO em `TODO_auditoria_255.md` linha 10 |
| **RLS de `vendas_em_espera`** | ⚠️ Aberto demais | TODO linha 5-8: SELECT sem escopo de loja, falta `WITH CHECK`, falta unicidade `(operador_id, numero_local)` |

### 1.5 O que NÃO é gap (checado e descartado)

- Múltiplas formas de pagamento: existe, completo (parcelas + normalização de troco).
- Integração com estoque: baixa automática nos dois fluxos, confirmada em código.
- Integração financeira (crediário → contas_receber): automática e idempotente desde a Fase 5b (migration `24702`).
- Auditoria de desconto/cancelamento/devolução: já gera evento e é fiscalizada pela view de anomalias (migration 244).
- Duplicação de RPC / fluxo duplo: os 4 guards (`guard:core`, `guard:pdv`, `guard:rpc`, `guard:pricing`) **passam limpos hoje** (rodado nesta auditoria, saída OK em todos).

---

## 2. Mapa dos fluxos (PDV → Estoque → Financeiro → Fiscal)

```
Web caixa (online):
  CaixaPageClient → actions.ts → caixaVendas.impl.ts
    → caixaPrecoAutoritativoServer.ts (revalida preço no servidor)
    → rpc finalizar_venda_transacional_canonica_v4  [TX ATÔMICA]
        ├─ vendas + itens_venda
        ├─ baixa de estoque (dentro da mesma TX)
        ├─ vendas_pagamentos (1..N formas)
        ├─ contas_receber (se saldo pendente + cliente)
        └─ venda_eventos (SALE_REGISTERED, ensure_venda_evento_registrado)
    → registrar_pricing_version_venda (best-effort)
    → registrarAlertasLevesVenda (best-effort)

PDV local (offline):
  Tauri/Rust → outbox local → POST /sync-outbox
    → dispatchOutboxEvent(VENDA_REGISTRADA) → processVenda
        → rpc registrar_venda_com_itens (ON CONFLICT DO NOTHING = idempotente)
        → aplicarBaixaEstoquePorItem (separado, não é atômico com o insert)
        → fiscal enqueue best-effort

Pós-venda (retaguarda / gerente):
  VendasGerenteListClient → actions.ts
    → cancelarVendaGerenteAction → rpc cancelar_venda_transacional
        └─ estorna caixa (se dinheiro) + venda_eventos + revalida /financeiro, /estoque
    → devolverOuTrocarVendaImpl → rpc devolver_ou_trocar_venda
        └─ devolve item a item, estorna valor, pode gerar venda substituta (troca)
```

**Ponto de atenção arquitetural:** o fluxo online é atômico (uma única transação SQL cobre venda+estoque+pagamento+financeiro+auditoria). O fluxo offline **não é atômico** entre insert da venda e baixa de estoque — são duas chamadas separadas (`registrar_venda_com_itens` depois `aplicarBaixaEstoquePorItem`). Isso é uma diferença estrutural real entre os dois canais, não um bug, mas deve ser documentado explicitamente no golden-flow (hoje só é dito "separadamente", sem alertar sobre a implicação de atomicidade).

---

## 3. TODOs, dívida técnica e código legado identificados

Nenhum código morto de RPC legada foi encontrado (`v2`/`v3` bloqueadas no banco e ausentes em produção — confirmado por `rpc-gate-guard.mjs`). TODOs reais encontrados:

1. `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts:313` — falta filtro explícito de `lojaId`.
2. `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts:314` — `TODO(fase-7)`: cliente da venda em espera não persiste (ver seção 1.4).
3. `pdv-importados/app/caixa/TODO_auditoria_255.md` — lista de 9 pendências pós-auditoria da migration 255, nenhuma delas bloqueante para os fluxos atuais, mas todas relevantes para Fase 5:
   - RLS de `vendas_em_espera` aberta demais (SELECT sem escopo de loja).
   - Falta `UNIQUE (operador_id, numero_local) WHERE status = EM_ESPERA`.
   - Falta validar que `p_caixa_id` pertence ao operador/loja.
   - Falta marcar venda em espera como `CONVERTIDA` após finalizar a retomada.
   - Falta ledger/auditoria explícito de park/resume/discard.
   - Histórico do PDV não mostra cliente da venda (depende de Fase 7).
   - Histórico do PDV sem impressão de etiqueta / emissão de NF-e pelo operador.
   - Vendas antigas sem `venda_eventos` mostram itens vazios no drill-down do histórico.

Nenhum `FIXME`/`HACK`/`XXX` encontrado no domínio de caixa/vendas.

---

## 4. Validação do Single Source of Truth

Executado nesta auditoria (2026-07-17), todos os guards de CI relacionados a vendas retornaram **OK**:

```
$ node scripts/rpc-gate-guard.mjs
[rpc-gate-guard] OK — fluxo de venda único e correto: v4 (web) | registrar_venda_com_itens (PDV local)

$ node scripts/pdv-flow-guard.mjs
[pdv-flow-guard] OK — guard rails do fluxo de venda presentes (snapshot, #418, try/catch, totais)

$ node scripts/pricing-rpc-guard.mjs
[pricing-rpc-guard] OK — online RPC-only; offline pdv-local/src isolado (exceção declarada)

$ node scripts/core-rule-guard.mjs
[core-rule-guard] OK — nenhuma regra de negócio detectada na UI (core decide, UI apresenta)
```

**Conclusão:** para o núcleo de *finalização* de venda, o SSoT está sólido e mecanicamente garantido em CI. **Gap de enforcement**: `cancelar_venda_transacional` e `devolver_ou_trocar_venda` não têm guard equivalente — hoje têm caller único de fato (verificado por grep manual), mas nada impede regressão silenciosa se alguém adicionar um segundo caller. Isso deveria ser corrigido como parte da Fase 5 (extensão do `rpc-gate-guard.mjs`), não é um problema hoje, é um risco futuro sem trava.

---

## 5. Plano de entregas incrementais

Cada entrega é pequena, testável isoladamente e reversível (feature isolada, sem alterar o golden-flow congelado de finalização de venda). Ordem sugerida por risco/dependência.

### Entrega 1 — Fechar o gap de enforcement (baixo risco, alto valor)
- Estender `rpc-gate-guard.mjs` para cobrir `cancelar_venda_transacional` e `devolver_ou_trocar_venda` com caller único.
- Atualizar `docs/venda-golden-flow.md` com o mapa completo (finalização + cancelamento + devolução + espera).
- **Teste:** guard falha se um segundo arquivo chamar essas RPCs; guard passa no estado atual.
- **Reversível:** só adiciona uma checagem estática, não altera runtime.

### Entrega 2 — Cancelamento/devolução acessíveis do caixa (não só do gerente)
- Expor ação de cancelamento/devolução no PDV do operador (com o mesmo token/autorização de gerente já existente — reutilizar `descontoGerenteToken`/fluxo de autorização, não recriar).
- Reutilizar as RPCs e Server Actions existentes (`cancelarVendaGerenteAction`, `devolverOuTrocarVendaImpl`) — sem criar novo caminho de dados.
- **Teste:** E2E "operador cancela venda recente com token de gerente".
- **Reversível:** é só uma nova entrada de UI para uma capacidade já existente no backend.

### Entrega 3 — RLS e integridade de `vendas_em_espera`
- Corrigir RLS SELECT (escopo por loja).
- Adicionar `UNIQUE (operador_id, numero_local) WHERE status = 'EM_ESPERA'`.
- Validar `p_caixa_id` pertence ao operador/loja dentro da RPC.
- Marcar `CONVERTIDA` ao finalizar retomada.
- **Teste:** migração + teste SQL mínimo (`caixaVendaEspera.test.ts` já existe como base).
- **Reversível:** migration aditiva, sem quebrar dados existentes.

### Entrega 4 — Cliente na venda em espera (fecha `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`)
- UI de seleção de cliente na aba de espera (reaproveitar `CaixaClienteSeletor`/busca já usada em `caixaClientesSearch.impl.ts` da Fase 4).
- Passar `clienteId` para `colocar_venda_em_espera`, retornar em `retomar_venda_em_espera`, incluir em `listar_vendas_em_espera`.
- **Teste:** E2E "park com cliente → refresh → resume → cliente restaurado".
- **Reversível:** campo já existe no banco (nullable), é só parar de descartar no TypeScript.

### Entrega 5 — Ledger explícito de espera (park/resume/discard)
- Registrar evento em `venda_eventos` (ou tabela equivalente) para cada operação de espera.
- **Teste:** unitário de que cada operação gera exatamente 1 evento.
- **Reversível:** aditivo, não altera contrato de retorno das RPCs existentes.

### Entrega 6 — Orçamento (venda não vinculante) — ✅ concluída (migration 273)
- Implementado como **tabela própria `orcamentos`** (não como novo status em `vendas`) — decisão tomada durante a implementação: `vendas` tem CHECK restritivo e é lida por relatórios financeiros/consistência assumindo que toda linha é uma transação real; um orçamento não é uma transação. Conversão em venda reaproveita o fluxo normal de finalização v4 sem nenhuma alteração nele (orçamento só prefilla o carrinho).
- RPCs: `criar_orcamento`, `listar_orcamentos`, `obter_orcamento`, `cancelar_orcamento`, `marcar_orcamento_convertido`. UI: botões "Salvar orçamento"/"Orçamentos" no menu de operações do caixa.

### Entrega 7 — Reabertura de venda concluída — ✅ concluída (decisão formalizada, sem código de reabertura)
- **Decisão (ADR-VENDAS-001, `docs/adr/ADR-VENDAS-imutabilidade-pos-conclusao.md`):** venda `CONCLUIDA` é imutável — não existe e não haverá reabertura. Fluxo oficial de correção: cancelamento (Entrega 2) e/ou devolução parcial (Entrega 2) + nova venda quando necessário.
- Item de backlog decorrente, fora do escopo da Fase 5: **Duplicar/Refazer Venda** — duplica itens de uma venda do histórico para um novo carrinho (preço sempre revalidado na nova finalização, nunca herdado), sem reabrir nem referenciar a venda original.

### Entrega 8 — Kits de produto — ⚠️ parcial por decisão explícita (8a+8b feitos; 8c+8d adiados)
- **8a Modelagem — ✅ concluída (migration 275):** `produtos.tipo_produto` (SIMPLES|KIT); `kit_composicoes` **versionada** (nunca editada in-place — nova composição = nova versão, desativa a anterior, preserva histórico); `kit_composicao_itens`; `venda_kit_expansao` (snapshot imutável por `item_venda_id`, criada sem escritor ainda — existe para a integração futura já ter onde persistir). RPCs `criar_kit_composicao`/`obter_kit_composicao_atual`, restritas a GERENTE/DONO/ADMIN, com validação de auto-referência e kit aninhado (não suportado v1).
- **8b Precificação — ✅ não precisou de trabalho novo:** um kit é um `produto` como outro qualquer (tem `preco_varejo`/`preco_atacado` próprios) — o motor de preço (`calcular_preco_produto`) já funciona por `produto_id` sem alteração nenhuma. O kit não "soma o preço dos componentes"; tem preço próprio, como qualquer produto composto vendido no varejo.
- **8c Baixa de estoque composta — ⏸️ adiada, por decisão explícita:** desenhada e pronta para plugar (`core/inventory/InventoryExpansionService.ts` + porta `core/ports/kitComposicao.ts` + adapter Supabase), mas **não integrada a `finalizar_venda_transacional_canonica_v4`** — a RPC está congelada ("FREEZE: CORE TRANSACIONAL") e baixa estoque 1:1 pelo `produto_id` de cada linha de `p_itens`; um kit precisa aparecer como 1 linha (recibo/preço/margem/kardex) mas baixar N componentes, e resolver essa divergência dentro da v4 exige validação contra um banco real que este ambiente de execução não tem. Rejeitadas nesta sessão: (a) modificar a v4 sem poder testar, (b) expandir o kit em N linhas de componente antes da v4 (perderia o kit como item único no recibo). Fica para entrega futura, com ambiente de teste real.
- **8d UI de venda — ⏸️ adiada:** depende de 8c estar integrado (não faz sentido vender kit no PDV sem a baixa de estoque funcionando).

### Entrega 9 — Histórico: cliente da venda, reimpressão NF-e, etiqueta pelo operador
- Depende de `vendas.cliente_id` populado (parte disso já é resolvido pela Entrega 4 para vendas com espera; vendas diretas já podem ter `clienteId` — confirmar).
- **Teste:** histórico mostra cliente quando presente; reimpressão gera o mesmo documento fiscal, sem reemitir.

---

## 6. Critérios objetivos para declarar a Fase 5 concluída em 100%

1. **Guards de CI**: `guard:all` passa, incluindo extensão do `rpc-gate-guard.mjs` para cancelamento e devolução (Entrega 1).
2. **Zero TODOs abertos** da lista da seção 3 sem decisão registrada (implementado ou formalmente adiado com justificativa, como já é feito para Fase 7).
3. **Paridade operador/gerente**: operador de caixa consegue cancelar/devolver venda recente sem sair do PDV (Entrega 2), com auditoria idêntica à via gerente.
4. **Cliente presente em 100% dos pontos do ciclo de venda** onde já existe UI de cliente (venda direta, venda em espera, histórico) — sem descarte silencioso de `clienteId`.
5. **RLS de `vendas_em_espera` fechada por loja** e testada (Entrega 3).
6. **Ledger de auditoria completo**: toda operação de desconto, cancelamento, devolução E espera (park/resume/discard) gera evento rastreável — hoje só as 3 primeiras geram.
7. **Orçamento e reabertura**: ✅ orçamento implementado (Entrega 6, migration 273); reabertura formalmente descartada via ADR-VENDAS-001 (Entrega 7) — não é um item pendurado, é uma decisão aceita com item de backlog decorrente (Duplicar/Refazer Venda). Falta apenas: testes E2E do fluxo de orçamento.
8. **Kits**: ✅ 8a (modelagem) e 8b (precificação) concluídos. 8c (baixa de estoque composta) e 8d (UI de venda) explicitamente adiados por decisão — exigem tocar a v4 congelada e validar contra banco real; movidos para entrega própria quando houver ambiente de teste adequado. Não é item pendurado sem dono: `core/inventory/InventoryExpansionService.ts` já está desenhado e pronto para ser plugado.
9. **`v_venda_consistencia_anomalias` (migration 244) com 0 anomalias** em produção nas últimas 7 dias antes do fechamento da fase — mesma régua usada no golden-flow (`0 divergências em 7 checks`).
10. **`docs/venda-golden-flow.md` atualizado** cobrindo os 4 fluxos (finalizar, cancelar, devolver, espera) com o mesmo nível de detalhe hoje reservado só à finalização.

---

## 7. Recomendação de sequenciamento

Começar pelas Entregas 1-5 (baixo risco, fecham dívida técnica já mapeada e reforçam o SSoT existente) antes de abrir escopo novo (Orçamento, Reabertura, Kits — Entregas 6-8), que são funcionalidades genuinamente novas e devem ser tratadas com o mesmo rigor do golden-flow atual: um caller único, um guard de CI, e a mesma transação atômica onde fizer sentido.
