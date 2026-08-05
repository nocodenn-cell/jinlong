# Matriz de Rastreabilidade — RN → ADR → Autoridade → Arquivos → Teste → Estado

> **Natureza:** artefato de fechamento da Rodada R1. **Somente leitura sobre código e documentos.**
> Nenhuma regra nova, nenhuma ADR nova, nenhuma decisão alterada.
> **Fonte normativa:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md` v2.1 (congelado, Cap. 7 e Cap. 2).
> **Fonte de verificação:** `docs/ARQUITETURA_REGRAS_NEGOCIO_VALIDACAO.md` §1, §3, §7.
> **Data:** 2026-08-04

## Como ler

- **ADR** — decisão aprovada que rege a RN. `—` significa que a regra não depende de ADR.
- **Autoridade** — o único lugar onde a regra pode mudar de comportamento (Cap. 2).
- **Teste** — teste automatizado localizável no repositório. `✗ ausente` é lacuna real, já
  registrada em §11.4 da arquitetura e no risco R6 do encerramento. Não é achado novo.
- **Estado** — cópia fiel do Cap. 7. Esta matriz **não altera estado de RN**.

**Regra de uso:** esta matriz é índice, não autoridade. Em divergência, o Cap. 7 vence.

---

## 1. Matriz principal (RN-001 … RN-035)

| RN | ADR | Autoridade | Testes | Estado |
|---|---|---|---|---|
| RN-001 | — | CHECK banco + `calcular_preco_produto` (migs 234/245/250) | `calcularPrecoCanonico.spec.ts`, `productPriceReader.test.ts` | Divergente (TB-02/TB-03) · **aguarda PF-01** |
| RN-002 | ADR-002 | Família `fiscal_*` + `chk_produto_ncm_formato` (mig 210/280) | ✗ ausente | Vigente |
| RN-003 | — | `registrar_pagamento_contas_pagar` + CHECKs (mig 108) | `financial.spec.ts`, `payableReader.test.ts` | Divergente (TB-07) |
| RN-004 | — | `trg_fn_vendas_caixa_aberto` (`_bi`/`_bu`) | `finalizarVendaCaixa.integration.test.ts` | Vigente |
| RN-005 | — | `decrementar_estoque_seguro` + triggers (migs 016/017/029/030/032/038/070/127) | `inventory.spec.ts`, `onda-a-ledger-estoque.test.ts` | Vigente |
| RN-006 | — | `shared-core/src/managerDiscount/policy.ts` + `trg_fn_itens_venda_limite_desconto` (mig 122) | `managerDiscount/policy.test.ts` | Vigente |
| RN-007 | — | CHECK banco — **inexistente no código** | ✗ ausente | Divergente (TB-02) · **aguarda PF-01** |
| RN-008 | — | Triggers `trg_fn_*_margem` (migs 124/125, 9 triggers) | ✗ ausente | Vigente |
| RN-009 | ADR-001 | `loja_id` + FK + UNIQUE composto + RLS | ✗ ausente (existe `testar_isolamento_loja` como RPC, não como teste de CI) | Divergente (TB-05, P0) |
| RN-010 | — | CHECK banco (ausente); hoje `validateClienteInput.ts` + `customerWriter.ts` | `validateClienteInput.spec.ts`, `customerWriter.test.ts` (só TS) | Divergente (TB-04) |
| RN-011 | — | `criar_produto_com_estoque_inicial` (mig 270, `20260718135138`) | ✗ ausente | Vigente |
| RN-012 | — | Chaves de idempotência por RPC (`venda_evento_idempotency_key`, `chk_mov_caixa_idempotency_key_not_blank`) | `saleEvent.spec.ts` | Vigente |
| RN-013 | — | `InventoryMovementWriter` (`shared-core/src/inventory/contracts.ts`) → RPCs de estoque | `inventory.spec.ts`, `validateAdjustInventory.spec.ts`, `inventoryMovementWriter.test.ts` | Vigente |
| RN-014 | — | `fiscal_enfileirar_documento_venda` + `functions/fiscal-worker` (migs 062/066/069/090/099/114) | ✗ ausente | Vigente |
| RN-015 | — | RPCs agregadas `kpis_*` / `relatorio_*` | ✗ ausente (há `dashboardUtils.test.ts`, que testa formatação, não a autoridade) | Vigente |
| RN-016 | — | RLS + Policy (199 policies) + `AUTHORIZATION_MATRIX.md` | `admin-policy-consistency.test.ts`, `admin-gerente-authority.test.ts` | Divergente (SEC-01/SEC-02) |
| RN-017 | — | `relatorio_tz_validado` + `relatorio_settings_normalize_timezone` (migs 012/013) | ✗ ausente | Divergente (TB-06) |
| RN-018 | — | Cap. 1 Princípio 3 + `productEngine.ts` (`statusInicialProduto`) | `productEngine.spec.ts` | Vigente |
| RN-019 | — | `.cursor/rules/entity-ssot.mdc` + mig `20260730093000` | `check:entity-ssot`, `caixaSemCadastroProduto.test.ts` | Vigente |
| RN-020 | — | `finalizar_venda_transacional_canonica_v4` (v2/v3 = stub `LEGACY_DISABLED_USE_V4`) | `guard:rpc` (`scripts/rpc-gate-guard.mjs`) | Vigente |
| RN-021 | — | Triggers + `registrar_venda_evento` / `ensure_venda_evento_registrado` | `saleEvent.spec.ts` (parcial: cobre emissão, não a trilha completa) | Vigente |
| RN-022 | — | `.cursor/rules/security.mdc` (política) + `.gitleaks.toml` | `scripts/secret-scan.sh` | Vigente |
| RN-023 | — | `PRODUCT_RULES` / `statusInicialProduto` (migs 232/233) | `productEngine.spec.ts` | Vigente |
| RN-024 | — | CHECK `vendas_identidade_totais` (mig 279) | ✗ ausente | Vigente |
| RN-025 | — | `chk_mov_caixa_sangria_apenas_dinheiro`, `chk_mov_caixa_nao_estornar_si_mesmo` | `cashMovementReader.test.ts` (parcial) | Vigente |
| RN-026 | — | `obter_limite_sangria_sem_gerente` (mig 047) + `aprovar_movimentacao` | ✗ ausente | Vigente |
| RN-027 | — | `tg_documentos_fiscais_estado_bi/_bu` (mig 092) + backoff (mig 093) | ✗ ausente | Vigente |
| RN-028 | — | `pricing_version_id` (migs 249/254) + congelamento de comissão (`20260711020053`) | `pricingVersionRpcError.test.ts` (parcial: erro, não congelamento) | Vigente |
| RN-029 | — | `calcular_promocao_aplicavel` (mig 274) | `calcularPrecoCanonico.spec.ts` (precedência no espelho offline) | Vigente |
| RN-030 | ADR-006 | ADR-006 + `ordens_compra.fornecedor_id` (mig 109) | ✗ ausente | Vigente |
| RN-031 | ADR-007 | Triggers `trg_fn_*_margem` + RPCs de margem | ✗ ausente | Divergente (BR-03) |
| RN-032 | ADR-003 | Configuração da loja + RPC de venda | ✗ ausente | Divergente (BR-01) |
| RN-033 | ADR-004 | `registrar_conferencia_remessa` / `confirmar_remessa_entrada` (`20260801120000`) + `recebimentoStatus.ts` | `recebimentoStatus.spec.ts`, `onda-b-recebimento.test.ts` | Divergente (FLX-04) |
| RN-034 | ADR-005 | RPC de reabertura (a criar) + trilha; imutabilidade da mig 206 | ✗ ausente | Divergente (BR-04) |
| RN-035 | ADR-007 | RPC de venda (`custo_unitario_snap` derivado no servidor) | ✗ ausente | Divergente (BR-03) |

---

## 2. Arquivos envolvidos por família de regra

Agrupado para não repetir caminhos linha a linha. Todos os caminhos foram verificados no repositório.

| Família | RN | Arquivos |
|---|---|---|
| Produto / vendabilidade | 001, 018, 019, 023, 030, 031 | `shared-core/src/engine/productEngine.ts`, `shared-core/src/products/policies/validateProductInput.ts`, `shared-core/src/catalog/isProdutoVendavel.ts`, `pdv-importados/app/admin/produtos/*`, `pdv-importados/app/admin/catalogo/*` |
| Preço / promoção / margem | 001, 007, 008, 028, 029 | `shared-core/src/pricing/calcularPrecoCanonico.ts`, `shared-core/src/pricing/resolution.ts`, `backend/supabase/migrations/{234,245,249,250,254,274}`, `scripts/pricing-rpc-guard.mjs` |
| Venda / desconto / totais | 004, 006, 012, 020, 024, 035 | `shared-core/src/managerDiscount/policy.ts`, `shared-core/src/pdv/saleEvent.ts`, `pdv-importados/app/caixa/*`, migs `243`, `268`, `279` |
| Estoque | 005, 011, 013, 033 | `shared-core/src/inventory/contracts.ts`, `shared-core/src/inventory/policies/*`, `pdv-importados/app/admin/estoque/*`, migs `016–070`, `127`, `269`, `270` |
| Caixa | 004, 025, 026, 034 | `shared-core/src/cash/*`, `pdv-importados/app/caixa/server/cashSession.ts`, migs `045`, `047`, `206`, `207`, `227`, `230` |
| Financeiro | 003, 032 | `shared-core/src/financial/*`, `pdv-importados/app/admin/financeiro/*`, migs `035`, `104`, `108`, `112` |
| Fiscal | 002, 014, 027 | `backend/supabase/functions/fiscal-worker/*`, migs `062`, `066`, `069`, `090`, `092`, `093`, `099`, `114`, `210`, `280`, `285` |
| Multi-tenant | 009, 016 | `backend/supabase/migrations/075` (fornecedores — lacuna), `112`, `266`, policies RLS |
| Auditoria / BI | 015, 021 | `pdv-importados/app/admin/auditoria/*`, migs `20260707000000`, `20260707020000`, `228`, `238–242`, `264` |
| Cadastro cliente | 010 | `shared-core/src/customers/policies/validateClienteInput.ts`, `pdv-importados/app/admin/clientes/customerWriter.ts`, migs `253`, `266` |
| Segurança / segredo | 016, 022 | `.cursor/rules/security.mdc`, `.gitleaks.toml`, `scripts/secret-scan.sh`, `docs/AUTHORIZATION_MATRIX.md` |

---

## 3. Verificação de completude — nenhuma regra solta

| Pergunta | Resposta |
|---|---|
| Alguma RN sem autoridade nomeada? | **Não.** As 35 têm autoridade declarada. RN-007 tem autoridade **nomeada e não implementada** (é o próprio ticket TB-02) — é lacuna de código, não de rastreabilidade |
| Alguma RN sem estado declarado? | **Não.** 24 `Vigente` · 11 `Divergente`, todas com ticket |
| Alguma regra ativa em produção sem RN? | **Não.** As 7 órfãs detectadas na validação foram catalogadas como RN-023…RN-029 |
| Alguma ADR sem RN correspondente? | **Não.** ADR-001→RN-009 · 002→RN-002 · 003→RN-032 · 004→RN-033 · 005→RN-034 · 006→RN-030 · 007→RN-031/RN-035 |
| Alguma RN sem teste? | **Sim — 16 das 35** (tabela §4). Já rastreado; é o risco R6, não achado novo |

---

## 4. Cobertura de teste — leitura consolidada

| Situação | Qtd | RNs |
|---|---|---|
| Teste automatizado localizável | 17 | 001, 003, 004, 005, 006, 010, 012, 013, 016, 018, 019, 020, 022, 023, 029, 033 (+021 parcial) |
| Cobertura parcial (testa efeito adjacente, não a autoridade) | 3 | 021, 025, 028 |
| Sem teste automatizado | 15 | 002, 007, 008, 009, 011, 014, 015, 017, 024, 026, 027, 030, 031, 032, 034, 035 |

**Cobertura declarada: 17/35 (≈49%) com teste direto.** Este número é o baseline honesto de R1 —
não há evidência para afirmar mais. Toda correção de RN divergente deve nascer com teste
(Cap. 9, item 3 da arquitetura).

---

## 5. Camada de governança executável (autoridade sem RN, por desenho)

Estes gates não são regras de negócio — são a **verificação** delas. Registrados aqui para
que a matriz não pareça omitir autoridade real.

| Gate | Script | O que guarda |
|---|---|---|
| `guard:core` | `scripts/core-rule-guard.mjs` | Regras de núcleo em `shared-core` |
| `guard:pdv` | `scripts/pdv-flow-guard.mjs` | Fluxo do PDV |
| `guard:routes` | `scripts/route-guard.mjs` | Rotas e guarda de sessão |
| `guard:rpc` | `scripts/rpc-gate-guard.mjs` | RN-020 (só `_v4`) |
| `guard:pricing` | `scripts/pricing-rpc-guard.mjs` | Exceção offline de pricing (Cap. 1) |
| `guard:deps` | `scripts/dep-version-guard.mjs` | Versões de dependência |
| `guard:migrations` | `scripts/migration-sequence-guard.mjs` | DAT-02 (numeração) |
| `guard:domain` | `scripts/domain-boundary-guard.mjs` | Fronteira de domínio |
| `check:entity-ssot` | `pdv-importados/scripts/check-entity-ssot-boundary.mjs` | RN-019 (telas oficiais) |
| `check:vendabilidade` | `scripts/check-vendabilidade-invariant.mjs` | Predicado de vendabilidade |

Agregado em `npm run guard:all`.
