# Arquitetura de Regras de Negócio — FastProduct / Jīn Lóng ERP

> 🔒 **DOCUMENTO CONGELADO — Referência oficial da Rodada de Implementação R1** (congelado em 2026-08-04)
> **Status:** **Fonte Normativa Única** das regras de negócio (v2.1)
> **Escopo:** monorepo `fastproduct` (`backend`, `pdv-importados`, `pdv-local`, `shared-core`)
>
> Durante a rodada R1 este documento **não sofre alteração de conteúdo normativo**. O Claude Code implementa
> conforme ele; não o reinterpreta nem o edita. Alterações exigem nova decisão da direção e abertura de R2.
> Única exceção permitida durante R1: atualizar a coluna **Estado** do Cap. 7 (`Divergente` → `Vigente`)
> quando houver evidência verificável de correção.
>
> **Regra de uso:** consultar **antes** de qualquer alteração de regra de negócio.
> Em caso de conflito entre a implementação e este documento, **este documento é a autoridade funcional**.
>
> **Documentos irmãos desta rodada (congelados junto):**
> `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` · `docs/ENCERRAMENTO_FASE_ARQUITETURA.md` ·
> validação de coerência em `docs/ARQUITETURA_REGRAS_NEGOCIO_VALIDACAO.md`.

## Como usar

| Situação | O que fazer |
|---|---|
| Vou implementar uma regra existente | Localizar a regra no **Cap. 7 (Catálogo RN)** e alterar **apenas a autoridade** indicada no **Cap. 2** |
| Vou criar uma regra nova | Primeiro registrar `RN-XXX` no Cap. 7, depois implementar |
| Encontrei implementação divergente | Abrir ticket citando o `RN-XXX` violado — não corrigir fora de escopo |
| A decisão ainda não existe | Ver **Cap. 8 (ADRs)**; se estiver pendente, **não implementar** — escalar à direção |

**Documentos irmãos (não duplicar conteúdo):**
`.cursor/rules/entity-ssot.mdc` (telas oficiais de CRUD) · `docs/adr/` (ADRs técnicos de fronteira de domínio) ·
`docs/auditoria/` (achados e tickets) · `docs/AUTHORIZATION_MATRIX.md` (perfis e permissões).
Este arquivo governa **regras de negócio**; aqueles governam fronteiras, telas, permissões e achados.

---

## Capítulo 1 — Princípios Gerais

### Princípio 1 — Single Source of Truth

Cada regra possui **uma única autoridade**. Nunca implementar a mesma regra em múltiplos lugares
com comportamentos diferentes.

Exemplo — preço:

- ❌ Componente React calcula
- ❌ Hook calcula
- ❌ Outra RPC recalcula
- ✔ Somente `public.calcular_preco_produto`

Duplicação de cálculo é dívida, mesmo quando os dois lados concordam hoje.

**Exceção arquitetural aprovada — espelho offline de pricing.**
`shared-core/src/pricing/calcularPrecoCanonico.ts` é uma porta TypeScript **bit-a-bit** de
`calcular_preco_produto` (migration 250), e existe porque o `pdv-local` é offline-first e não alcança a RPC
sem rede. Não é fonte de verdade concorrente: a RPC é a autoridade, o espelho é derivado.
Está protegido por `scripts/pricing-rpc-guard.mjs` (proíbe `PricingService` em runtime online) e por testes de
paridade (`offlineRpcEquivalence.golden.test.ts`, `operationalParity.prod-fixture.test.ts`).
**Não remover.** Alterar a regra de preço implica alterar a RPC **e** o espelho na mesma PR, com a golden
test passando.


### Princípio 2 — O banco protege os dados

O banco nunca deve aceitar estado inválido.

| Camada | Responsabilidade |
|---|---|
| Frontend | UX: avisar cedo, guiar, esconder o que não se aplica |
| TypeScript (`shared-core/src/*/policies`) | Contrato tipado e testável da regra |
| Service / Action | Orquestração e idempotência |
| RPC (PL/pgSQL) | Transação atômica e autorização efetiva |
| Banco (CHECK / FK / UNIQUE / RLS / Trigger) | **Garantia final** |

Ordem obrigatória: **Frontend → TypeScript → Service → RPC → Banco.**
O banco sempre tem a última palavra.

> **Desequilíbrio conhecido (auditoria v3):** hoje o projeto valida bem em TypeScript e
> sub-valida no banco. Como toda RPC é chamável diretamente por qualquer usuário autenticado,
> regra que só existe em TS é **convenção, não garantia**. Toda regra nova nasce com espelho no banco.

### Princípio 3 — Cadastro não é Operação

Cadastrar não significa autorizar uso. Um produto pode existir sem fornecedor, sem categoria e sem NCM —
mas isso não implica que ele possa ser vendido, entrar em pedido ou gerar documento fiscal.

### Princípio 4 — A regra é aplicada no momento correto

Nunca bloquear antes da necessidade. Cada fase tem requisitos próprios:

```
Cadastro → Publicação → Venda → Fiscal
```

Exigir NCM no cadastro é erro de desenho; exigir NCM na emissão fiscal é a regra correta.

### Princípio 5 — Atomicidade

Venda, estoque e financeiro mudam **na mesma transação** ou não mudam.
Nenhum fluxo pode deixar estado parcial observável. Idempotência via `client_request_id`
ou chave de idempotência equivalente é obrigatória em toda operação re-tentável.

### Princípio 6 — Rastreabilidade

Toda mudança de estado de entidade de negócio gera evento/auditoria no banco (trigger ou RPC),
nunca por chamada do frontend.

---

## Capítulo 1-A — Precedência entre Regras (hierarquia normativa)

Quando duas regras válidas apontam para comportamentos diferentes, vence a de **maior precedência**.
Esta hierarquia não revoga regra alguma: ela define quem cede.

| Nível | Domínio | Princípio | Em conflito, o que acontece |
|---|---|---|---|
| **P1** | **Segurança e Isolamento** | Nenhum dado vaza entre tenants; nenhuma autorização é decidida pelo cliente | A operação é **negada**. Nunca se relaxa isolamento ou autorização para viabilizar outra regra |
| **P2** | **Integridade Financeira** | Dinheiro registrado corresponde a dinheiro movimentado | A operação é **negada** ou revertida atomicamente |
| **P3** | **Integridade de Estoque** | Saldo reflete movimento real e rastreável | A operação é **negada** ou registrada como divergência auditável |
| **P4** | **Integridade Fiscal** | Documento fiscal reflete a venda que existiu | A venda **não é desfeita**; o documento vai para erro/DLQ e é reprocessado |
| **P5** | **Regras Comerciais** | Preço, desconto, margem, comissão, crédito | A regra comercial cede — bloqueio, aviso ou exigência de autorização |
| **P6** | **Experiência do Usuário** | Fluidez, menos cliques, menos fricção | UX **sempre cede**. UX antecipa e explica a regra; nunca a contorna |

### Por que Fiscal fica em P4, e não em P2

A ordem proposta na missão colocava Integridade Fiscal acima da Financeira. **A arquitetura implementada
diz o contrário, e está tecnicamente correta:** o fiscal é assíncrono, idempotente e desacoplado do
checkout (`fiscal_enfileirar_documento_venda` + worker + máquina de estados da mig 092, com DLQ e backoff).

Se o fiscal tivesse precedência sobre o financeiro, uma falha da SEFAZ ou da Focus NFe derrubaria o caixa:
venda válida, dinheiro recebido, e o sistema recusando registrar. É exatamente o desenho que os ERPs de
mercado evitam. A venda é **fato consumado**; o documento fiscal é **obrigação decorrente** — reprocessável,
nunca destrutiva do fato. Colocar fiscal em P4 preserva RN-014 e o Princípio 5.

**Ressalva importante:** P4 refere-se à **emissão** (assíncrona). A **decisão de permitir a operação
fiscal** é P1/P5 e ocorre antes: por ADR-002, NCM é exigido no momento de emitir, e essa exigência
bloqueia a emissão, não a venda.

### Regras de aplicação

1. **Precedência resolve conflito, não cria permissão.** Uma regra P1 não autoriza violar P2 — ela vence
   quando ambas não podem ser satisfeitas simultaneamente.
2. **Nunca se resolve conflito relaxando o nível mais alto.** Se UX exige um caminho que fere estoque,
   muda-se a UX.
3. **Conflito entre regras do mesmo nível é lacuna de arquitetura**, não escolha do implementador:
   **parar e reportar**.
4. **Toda cessão de regra deixa rastro.** Se uma regra comercial cede a uma de integridade, o motivo é
   auditável (RN-021).

### Precedência aplicada às ADRs

| Situação | Nível | Resultado |
|---|---|---|
| Isolamento de fornecedor por loja (ADR-001) × conveniência de cadastro único | P1 × P6 | Isolamento vence |
| Emissão fiscal exige NCM (ADR-002) × venda já concluída | P4 × P2 | Venda permanece; emissão fica pendente |
| Bloqueio por limite de crédito (ADR-003) × fechar a venda rápido | P5 × P6 | Modo configurado na loja vence |
| Conferência antes de creditar estoque (ADR-004) × urgência de repor | P3 × P6 | Conferência vence |
| Trilha de reabertura de caixa (ADR-005) × simplificar operação | P2 × P6 | Trilha vence; histórico nunca é apagado |
| Produto sem fornecedor pode ser vendido (ADR-006) | P5 | Regra comercial explícita: vender é permitido, comprar não |
| Margem indisponível sem custo (ADR-007) × dashboard "bonito" sem buracos | P5 × P6 | `NULL` vence; **jamais** valor artificial |

---

## Capítulo 2 — Autoridade das Regras

Tabela normativa. A coluna "Autoridade Oficial" é o **único** lugar onde a regra pode mudar de comportamento.

| Domínio | Autoridade Oficial | Onde vive | Nunca implementar em |
|---|---|---|---|
| Vendabilidade e status inicial de produto | `evaluateProduct` / `statusInicialProduto` / `PRODUCT_RULES` | `shared-core/src/engine/productEngine.ts` | Componentes, hooks, actions, queries com `.eq('ativo')` fora do módulo central |
| Preço de venda | `public.calcular_preco_produto` (espelho offline: `pricing/calcularPrecoCanonico.ts`) | `backend/supabase/migrations` | Componentes React, hooks, actions |
| Promoção | `public.calcular_promocao_aplicavel` | migrations | Cálculo paralelo no PDV |
| Margem mínima | Triggers `trg_fn_produtos_margem`, `trg_fn_precos_atacado_margem`, `trg_fn_regras_preco_margem` | migrations | Validação só de tela |
| Desconto do gerente | `shared-core/src/managerDiscount/policy.ts` + trigger `trg_fn_itens_venda_limite_desconto` | shared-core + banco | Hooks locais, componente de PDV |
| Estoque (movimento) | `InventoryMovementWriter` (`shared-core/src/inventory/contracts.ts`) → RPCs `registrar_movimentacao`, `ajustar_estoque_manual`, `transferir_estoque_seguro`, `decrementar_estoque_idempotente` | shared-core + migrations | `UPDATE` direto em `estoque` |
| Criação de produto com saldo | `public.criar_produto_com_estoque_inicial` | migrations | 2º round-trip parcial no modal |
| Venda (fechamento) | `public.finalizar_venda_transacional_canonica_v4` | migrations | Frontend, orquestração em action |
| Cancelamento / devolução | `public.cancelar_venda_transacional`, `public.devolver_ou_trocar_venda` | migrations | Estorno manual em tela |
| Caixa | `public.fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`, `recalcular_saldo_caixa`, trigger `trg_fn_vendas_caixa_aberto` | migrations | Cálculo de saldo na UI |
| Comissão | `public.fn_registrar_comissao`, `resumo_comissoes_por_operador`, `marcar_comissoes_pagas` | migrations | Tela / relatório recalculando |
| Financeiro | `public.registrar_pagamento_contas_pagar`, `registrar_liquidacao_receber` + CHECKs de saldo | migrations | Baixa manual sem RPC |
| Fiscal | `public.fiscal_enfileirar_documento_venda` e família `fiscal_*` | migrations + fiscal worker | Componentes, chamada direta à Focus NFe pela UI |
| Permissões | **RLS + Policy** (+ `AUTHORIZATION_MATRIX.md`) | banco | Apenas esconder botão |
| Auditoria | Triggers / `registrar_venda_evento` / `ensure_venda_evento_registrado` | banco | Log disparado pelo frontend |
| KPIs e relatórios | RPCs agregadas (`kpis_venda_eventos_gerente`, `dashboard_gerente_resumo`, família `relatorio_*`) | migrations | `reduce()` sobre dados paginados na página |
| Multi-tenant | `loja_id` + FK + UNIQUE composto + RLS | banco | Filtro em query do cliente |

**Dívida registrada:** existem `finalizar_venda_transacional`, `_canonica_v2`, `_v3` e `_v4` no histórico
de migrations. A autoridade é a **v4**; as anteriores são legado e não recebem regra nova
(ver RN-020).

---

## Capítulo 3 — Estados Oficiais

Estados substituem cadeias de `if`. Para cada estado define-se: campos obrigatórios, campos opcionais,
operações permitidas e operações proibidas.

### Produto

Estados reais no banco (`produtos.status_publicacao`, migration 232) — **três**, não cinco:

```
DRAFT → PUBLICADO → INATIVO
```

`vendável` **não é estado**: é predicado derivado — `ativo === true && status_publicacao === 'PUBLICADO'`,
decidido exclusivamente por `evaluateProduct` em `shared-core/src/engine/productEngine.ts`.

| Estado | Origem | Obrigatório | Permitido | Proibido |
|---|---|---|---|---|
| `DRAFT` | import CSV/NF-e (`statusInicialProduto('import')` → `ativo=false`) | nome | editar, precificar, publicar | vender |
| `PUBLICADO` | cadastro humano (`statusInicialProduto('human')` → `ativo=true`) | nome, preço válido (RN-001) | vender (se `ativo`), entrar em pedido | — |
| `INATIVO` | despublicação | — | consultar, reativar | vender, novo pedido |

Por **ADR-002**, NCM não é requisito de nenhum destes estados — é requisito da operação fiscal.
Por **ADR-006**, fornecedor não é requisito de nenhum destes estados.
Por **ADR-007**, custo ausente não impede nenhum destes estados; impede apenas o cálculo de margem.

### Demais entidades — estados vigentes no banco

Transcritos das constraints existentes. Não inventar estados novos.

| Entidade | Estados (CHECK no banco) | Origem |
|---|---|---|
| Venda | `CONCLUIDA`, `CANCELADA` | mig 001 |
| Caixa | `ABERTO`, `FECHADO` (+ `ERRO` operacional em `obter_status_caixa_operador`) | mig 230 |
| Movimentação de caixa | `pendente`, `aprovado`, `cancelado` | mig 045 |
| Ordem de Compra | `RASCUNHO`, `CONFIRMADA`, `EM_TRANSITO`, `RECEBIDA`, `CANCELADA` | mig 109 |
| Recebimento (`remessas`) | `RASCUNHO`, `EM_CONFERENCIA`, `CONFERIDO`, `DIVERGENTE`, `CONCLUIDA`, `CANCELADA` | mig `20260801120000` |
| Conta a Pagar | `PENDENTE`, `PARCIAL`, `PAGO`, `ATRASADO`, `CANCELADO` | mig 108 |
| Conta a Receber | `ABERTO`, `PARCIAL`, `QUITADO`, `CANCELADO` | mig 035 |
| Documento fiscal | máquina de estados explícita | mig 092 |
| Cliente / Fornecedor | sem máquina de estados (entidades de cadastro simples) | — |

Transições de recebimento são espelhadas em `shared-core/src/inventory/policies/recebimentoStatus.ts`
(`RECEBIMENTO_TRANSITIONS`, `podeConferirRecebimento`, `statusAposConferencia`).


---

## Capítulo 4 — Matriz de Regras (camadas)

Legenda: **aviso** = UX não bloqueante · **UI** = feedback visual · **✔** = validação efetiva · **—** = não se aplica.

| Regra | Front | TS | RPC | Banco | Auditoria |
|---|---|---|---|---|---|
| Produto ativo para venda | aviso | ✔ | ✔ | CHECK | evento |
| Preço de produto publicado | aviso | ✔ | ✔ | CHECK | evento |
| NCM na **emissão fiscal** (nunca no cadastro — ADR-002) | aviso | ✔ | ✔ | `chk_produto_ncm_formato` (só formato) | evento |
| Estoque não negativo | aviso | ✔ | ✔ | Trigger | evento |
| Limite de desconto | UI | ✔ | ✔ | `trg_fn_itens_venda_limite_desconto` | evento |
| Margem mínima | UI | ✔ | ✔ | Trigger | evento |
| Margem indisponível sem custo (ADR-007) | UI (`—`) | ✔ | ✔ | — | — |
| Comissão | UI | ✔ | ✔ | CHECK | evento |
| Pagamento ≤ saldo aberto | UI | ✔ | ✔ | CHECK | evento |
| Limite de crédito por modo da loja (ADR-003) | UI | ✔ | ✔ | Configuração | evento |
| Venda só com caixa aberto | UI | ✔ | ✔ | `trg_fn_vendas_caixa_aberto` | evento |
| Conferência antes de creditar estoque (ADR-004) | UI | ✔ | ✔ | Estado de `remessas` | evento |
| Reabertura de caixa com motivo e papel (ADR-005) | UI | ✔ | ✔ | Estado + trilha | evento (imutável) |
| Isolamento por loja | — | — | ✔ | RLS + UNIQUE | evento |

Célula vazia onde deveria haver **✔** ou constraint = dívida rastreável, não "decisão de escopo".

---

## Capítulo 5 — Multi-tenant

Toda entidade de negócio responde a uma pergunta: **quem é o dono?**

Obrigatório para qualquer tabela de negócio nova:

```
loja_id (NOT NULL) → FK para lojas → UNIQUE composto (loja_id, chave_natural) → RLS filtrando por loja
```

- Chave natural **nunca** é única globalmente (`UNIQUE (loja_id, documento)`, não `UNIQUE (documento)`).
- Policy que filtra apenas por perfil **não** é isolamento de tenant.
- **Nunca criar tabela compartilhada entre lojas sem ADR aprovado.**

**Divergência conhecida — TB-05 (P0, auditoria v3):** `fornecedores` não tem `loja_id`, o CNPJ é único
globalmente e a policy `fornecedores_gerente_all` filtra só por perfil. Consequência: vazamento entre
tenants. **Decidido por ADR-001** (Cap. 8): fornecedor pertence à loja. Correção liberada para
implementação no Pacote 3. Referência de padrão correto: `clientes`.

---

## Capítulo 6 — Fluxos Oficiais

### Venda

```
Abrir Caixa → Carrinho → Validação → Pagamento → Estoque → Financeiro → Fiscal → Auditoria → KPIs
```

Etapas Pagamento→Financeiro são **atômicas** (`finalizar_venda_transacional_canonica_v4`).
Fiscal é **assíncrono e idempotente** (enfileiramento + worker), nunca bloqueia o caixa.

### Compra

```
Fornecedor → Pedido (OC) → Recebimento → CONFERÊNCIA → Estoque → Financeiro → Auditoria
```

Por **ADR-004**, a conferência é etapa **obrigatória e bloqueante**: nenhum crédito de estoque ocorre
antes de a conferência estar finalizada. Por **ADR-006**, fornecedor é requisito **deste fluxo**, não
do cadastro de produto.

Fluxos divergentes destes diagramas exigem ADR antes da implementação.

---

## Capítulo 7 — Catálogo de Regras de Negócio (RN)

Identificador **permanente**. Nunca reutilizar número; regra revogada fica como `REVOGADA` com a data.
Auditorias futuras devem citar `RN-XXX`, não descrever o problema em prosa.

| ID | Regra | Autoridade | Impacto | Estado |
|---|---|---|---|---|
| RN-001 | Produto publicado deve possuir preço válido | Banco (CHECK) + `calcular_preco_produto` | Venda | Divergente (TB-02/TB-03) |
| RN-002 | **NCM não é obrigatório no cadastro**; é obrigatório para emissão fiscal | RPC fiscal + `chk_produto_ncm_formato` | Fiscal | Vigente (ADR-002) |
| RN-003 | Pagamento nunca pode exceder o saldo aberto | Banco (CHECK) + `registrar_pagamento_contas_pagar` | Financeiro | **Vigente** (TB-07, migration 299, 2026-08-05) |
| RN-004 | Venda só pode ser registrada com caixa aberto | `trg_fn_vendas_caixa_aberto` | Caixa/Venda | Vigente |
| RN-005 | Estoque não pode ficar negativo sem autorização explícita | Triggers + `decrementar_estoque_seguro` | Estoque | Vigente |
| RN-006 | Desconto acima do limite exige autorização de gerente | `managerDiscount/policy.ts` + `trg_fn_itens_venda_limite_desconto` | Venda | Vigente |
| RN-007 | Preço de atacado deve ser menor que o de varejo | Banco (CHECK) | Preço | Divergente (TB-02) |
| RN-008 | Margem mínima não pode ser violada por preço ou regra de preço | Triggers `trg_fn_*_margem` | Preço | Vigente |
| RN-009 | Toda entidade de negócio pertence a exatamente uma loja | `loja_id` + RLS | Multi-tenant | Divergente (TB-05, P0) |
| RN-010 | CPF/CNPJ e e-mail devem ser válidos no banco, não só em TS | Banco (CHECK) | Cadastro | Divergente (TB-04) |
| RN-011 | Criação de produto com saldo inicial é uma única transação | `criar_produto_com_estoque_inicial` | Produto/Estoque | Vigente |
| RN-012 | Operação re-tentável é idempotente por `client_request_id` | RPCs | Todos | Vigente |
| RN-013 | Movimentação de estoque só via `InventoryMovementWriter`/RPC | shared-core + RPCs | Estoque | Vigente |
| RN-014 | Documento fiscal é enfileirado, nunca emitido no caminho síncrono da venda | `fiscal_enfileirar_documento_venda` | Fiscal | Vigente |
| RN-015 | KPI é derivado de RPC agregada, nunca de página da UI | RPCs `relatorio_*`, `kpis_*` | BI | Vigente |
| RN-016 | Permissão efetiva é do banco; a UI apenas reflete | RLS + Policy | Segurança | Divergente (SEC-01/SEC-02) |
| RN-017 | Data/hora de corte usa o fuso da loja, não o do servidor | RPC + `relatorio_tz_validado` | Relatórios | Divergente (TB-06) |
| RN-018 | Cadastro incompleto é permitido; bloqueio ocorre na operação que exige o dado | Cap. 1, P3 | Produto | Vigente |
| RN-019 | Criação de produto acontece apenas no módulo Produtos (`/admin/catalogo`) | entity-ssot.mdc | Produto/PDV | Vigente |
| RN-020 | Regra nova entra somente na versão canônica vigente da RPC (`_v4`) | Cap. 2 | Venda | Vigente |
| RN-021 | Mudança de estado de entidade gera evento de auditoria no banco | Triggers / `registrar_venda_evento` | Auditoria | Vigente |
| RN-022 | Segredo e endpoint sensível vêm de variável de ambiente | `.cursor/rules/security.mdc` | Segurança | Vigente |
| RN-023 | Status inicial por origem: humano → `PUBLICADO`+`ativo`; import → `DRAFT`+inativo | `PRODUCT_RULES` / `statusInicialProduto` | Produto | Vigente |
| RN-024 | Totais da venda são identidade: `total_liquido = total_bruto - total_desconto` | `vendas_identidade_totais` (mig 279) | Venda | Vigente |
| RN-025 | Sangria só em dinheiro; estorno não pode referenciar a si mesmo | `chk_mov_caixa_sangria_apenas_dinheiro`, `chk_mov_caixa_nao_estornar_si_mesmo` | Caixa | Vigente |
| RN-026 | Sangria acima do limite exige autorização de gerente | `obter_limite_sangria_sem_gerente` (mig 047) + `aprovar_movimentacao` | Caixa | Vigente |
| RN-027 | Documento fiscal segue máquina de estados com backoff em erro | `tg_documentos_fiscais_estado_bi/_bu` (092), mig 093 | Fiscal | Vigente |
| RN-028 | Preço e comissão são congelados por versão na venda | `pricing_version_id` (249, 254), congelamento de comissão (`20260711020053`) | Venda | Vigente |
| RN-029 | Precedência de preço: promoção → atacado → varejo | `calcular_promocao_aplicavel` (mig 274) | Preço | Vigente |
| RN-030 | **Produto pode existir sem fornecedor**; compra exige fornecedor | ADR-006 + `ordens_compra.fornecedor_id` | Produto/Compra | Vigente (ADR-006) |
| RN-031 | **Produto pode existir sem custo**; margem é indisponível sem custo válido. Nunca assumir custo zero | ADR-007 + triggers `trg_fn_*_margem` | Preço/BI | **Vigente** (BR-03, migration 300, 2026-08-05) |
| RN-032 | **Limite de crédito é parametrizável por loja**: `AVISO` \| `BLOQUEIO` \| `AUTORIZACAO_GERENTE` | ADR-003 + configuração da loja | Financeiro | **Vigente** (BR-01, migration 298, 2026-08-05) |
| RN-033 | **Recebimento exige conferência** antes de creditar estoque (total/parcial/sobra/falta/avaria) | ADR-004 + `registrar_conferencia_remessa` | Compra/Estoque | Divergente (FLX-04) |
| RN-034 | **Reabertura de caixa** exige GERENTE+, motivo obrigatório e trilha; histórico nunca apagado | ADR-005 | Caixa | Divergente (BR-04) |
| RN-035 | `custo_unitario_snap` é definido pelo servidor, nunca aceito do cliente | `finalizar_venda_transacional_canonica_v4` (migration 300) | Venda/BI | **Vigente** (BR-03, migration 300, 2026-08-05) |

**Estado `Divergente`** = regra é a autoridade funcional, a implementação atual não a cumpre,
ticket aberto na auditoria. Divergente **não** autoriza implementar diferente: autoriza corrigir.

---

## Capítulo 8 — ADRs de Regra de Negócio (APROVADAS)

**Todas as decisões abaixo estão APROVADAS pela direção em 2026-08-04.** Nenhuma está pendente.
O Claude Code deve implementar conforme estas decisões, sem reinterpretá-las.

| ADR | Decisão aprovada | Efeito normativo | Camadas de implementação | Tickets |
|---|---|---|---|---|
| **ADR-001** | **Fornecedor pertence à loja.** Todas as entidades relacionadas respeitam isolamento por `loja_id`. | `fornecedores` recebe `loja_id NOT NULL` + FK + `UNIQUE (loja_id, cnpj)`; RLS por loja. Remove `uq_fornecedores_cnpj` global. | Migration · RLS · RPC (`importar_nfe_transacao`) · Front-end · Validação | TB-05 (P0) |
| **ADR-002** | **NCM não é obrigatório no cadastro.** Torna-se obrigatório apenas em operação fiscal (NF-e/NFC-e). | Cadastro e venda não bloqueiam por NCM ausente. `fiscal_enfileirar_documento_venda` é a fronteira de exigência. | RPC · Fluxo operacional · Validação | BR-02 |
| **ADR-003** | **Limite de crédito é parametrizável por loja**, em três modos: `AVISO`, `BLOQUEIO`, `AUTORIZACAO_GERENTE`. | `clientes.limite_credito` deixa de ser decorativo; o modo vive na configuração da loja, não no cliente. | Migration · Configuração · RPC · Serviço · Front-end | BR-01 |
| **ADR-004** | **Recebimento de compra exige conferência.** Estoque só é atualizado após conferência. Modalidades: total, parcial, sobra, falta, avaria. | `receber_ordem_compra` não pode creditar estoque sem conferência. Fluxo canônico = `remessas` + `registrar_conferencia_remessa`. | Migration · RPC · Fluxo operacional · Serviço · Front-end | FLX-04 |
| **ADR-005** | **Reabertura de caixa exige gerente ou superior, motivo obrigatório e auditoria completa.** Histórico jamais é apagado. | Novo estado/transição de caixa com trilha; imutabilidade de vendas fechadas preservada. | Migration · RPC · RLS · Auditoria · Front-end | BR-04 |
| **ADR-006** | **Produto pode existir sem fornecedor.** Venda permanece permitida. Processos de compra exigem fornecedor. | Fornecedor é requisito de OC/recebimento, nunca de cadastro ou venda. | Validação · Fluxo operacional · Front-end | — |
| **ADR-007** | **Produto pode existir sem custo.** Margem não é calculável sem custo válido. **Jamais assumir custo zero.** | Onde falta custo, margem é `NULL`/indisponível — nunca `0` nem `100%`. Guards de margem não bloqueiam por custo ausente; bloqueiam por custo inválido. | RPC · Serviço · Migration · Front-end · Validação | BR-03 |

### Esclarecimentos normativos

Não alteram nenhuma decisão aprovada. Eliminam ambiguidade de leitura.

**ADR-001 — escopo do isolamento**
- Isolamento vale para `fornecedores` **e** para toda entidade que o referencie (`ordens_compra`,
  `vinculos_fornecedor_produto`, `remessas`).
- O mesmo CNPJ **pode** existir em lojas diferentes, como registros distintos. Não há entidade global
  de fornecedor, nem tabela-ponte compartilhada.
- Fornecedor sem loja inferível no backfill é **exceção de dados** — parar e reportar, nunca atribuir
  a uma loja por conveniência.

**ADR-002 — fronteira única de exigência**
- A exigência de NCM ocorre **exclusivamente** no momento de enfileirar/emitir documento fiscal.
- Cadastro, publicação, venda, pedido e recebimento **não** verificam NCM.
- Formato continua validado quando o campo está preenchido (`chk_produto_ncm_formato`); ausência ≠ inválido.

**ADR-003 — precedência de configuração**
- **A configuração da loja prevalece sobre qualquer configuração individual de cliente ou operador.**
  O `limite_credito` do cliente é o **valor**; o modo (`AVISO` / `BLOQUEIO` / `AUTORIZACAO_GERENTE`)
  é da loja e não é sobreponível no cliente nem na venda.
- Sem modo configurado, o padrão é `AVISO` — o mais conservador operacionalmente e o que preserva
  o comportamento atual.
- `AUTORIZACAO_GERENTE` reutiliza o mecanismo existente de autorização de gerente; não cria um segundo.

**ADR-004 — o que exatamente libera o estoque**
- **Somente conferência finalizada movimenta estoque.** Estados `CONFERIDO` e `DIVERGENTE` são
  finalizações válidas; `EM_CONFERENCIA` **não** movimenta nada.
- O estoque credita **a quantidade conferida**, nunca a quantidade prometida pelo documento.
- As cinco modalidades são classificações do resultado da conferência, não caminhos alternativos que
  a dispensem: **sobra, falta e avaria também exigem conferência finalizada**.
- Avaria não credita estoque vendável; é registrada como divergência auditável.

**ADR-005 — imutabilidade do histórico**
- **O histórico de auditoria é imutável: nunca `UPDATE`, nunca `DELETE`, apenas `INSERT`.**
- Reabertura de caixa **não altera** o registro de fechamento anterior: cria um novo evento que o
  sucede. O fechamento original permanece consultável para sempre.
- Motivo é obrigatório, não vazio, e fica no evento — não em log de aplicação.
- Autorização é `GERENTE`, `DONO` ou `ADMIN`, verificada **no banco**, nunca só na tela.
- A imutabilidade de vendas de caixa fechado (mig 206) permanece: reabrir não torna vendas editáveis.

**ADR-006 — processos que exigem fornecedor**
Exigem fornecedor (bloqueiam sem ele):
- Ordem de Compra (`ordens_compra.fornecedor_id`)
- Recebimento / remessa de entrada
- Importação de NF-e de compra
- Conta a pagar originada de compra

Não exigem fornecedor (jamais bloqueiam):
- Cadastro, edição, publicação e inativação de produto
- Venda, devolução e troca
- Ajuste, transferência e inventário de estoque
- Precificação, promoção e comissão

**ADR-007 — propagação da indisponibilidade**
- **Qualquer indicador dependente de custo retorna `NULL`/indisponível quando o custo é ausente ou
  inválido — nunca `0`, nunca `100%`, nunca valor estimado ou herdado.**
- Alcança: margem por venda, margem por produto, CMV, curva ABC, resumo executivo, dashboards, exports
  e relatórios agregados. Um agregado que contenha itens sem custo deve sinalizar a exclusão, não diluí-los.
- A UI apresenta indisponibilidade de forma explícita (ex.: "—" com explicação), nunca zero.
- **Custo ausente ≠ custo inválido.** Ausente → indicador indisponível, operação permitida.
  Inválido (negativo, por exemplo) → rejeitado pelos guards de margem.

> **Numeração:** esta série `ADR-00X` é de **decisões de regra de negócio** e é independente da série
> `docs/adr/ADR-005..010`, que trata de fronteiras técnicas de domínio.

### Decisão de escopo (não é ADR)

**Go-Live com ou sem emissão fiscal** é decisão de escopo comercial, não de arquitetura: a infraestrutura
fiscal está construída (RPCs, worker, máquina de estado, cron desagendado na mig 285). Ligar ou não o fiscal
não altera nenhuma regra deste documento nem bloqueia código. Registrado em FLX-02.

### Parâmetros funcionais ainda não decididos

**Revisão de 2026-08-04 (consolidação final): não é um, são três.** Nenhum é ADR — são parâmetros de
valor, não escolhas de arquitetura. Nenhum bloqueia os Pacotes 1–4. Todos exigem decisão da direção
antes de o item correspondente ser implementado.

| # | Parâmetro pendente | Afeta | Bloqueia | Impacto se implementado sem decisão |
|---|---|---|---|---|
| **PF-01** | Faixa válida de preço de produto: `> 0` ou `>= 0`? E comparador atacado × varejo: `<` ou `<=`? | RN-001, RN-007 | TB-02, TB-03 | Agente escolheria arbitrariamente; produto com preço zero fica criável e ineditável |
| **PF-02** | Qual fuso horário é a verdade para agregação de vendas por dia: fuso configurável da loja (caminho SQL) ou fuso do servidor (caminho TS)? | RN-018 | SSOT-03 | Dashboard e relatórios continuam divergindo na virada do dia |
| **PF-03** | Modo de crédito **padrão** para lojas existentes no backfill de ADR-003 | RN-032 | parte de BR-01 | **Mitigado:** o esclarecimento normativo de ADR-003 define `AVISO` como padrão. Confirmar se a direção aceita |

**Recomendação técnica para PF-02** (não é decisão tomada): o fuso configurável da loja é o
tecnicamente correto — é o único que se mantém válido com lojas em fusos diferentes, condição normal de
um SaaS multi-tenant. Fuso de servidor é fonte de verdade acidental.

**Fora deste conjunto — decisão de escopo comercial, não funcional:** Go-Live com ou sem emissão fiscal
(FLX-02). A infraestrutura fiscal está construída; o cron está apenas desagendado (mig 285). Não altera
regra alguma deste documento nem bloqueia código.

**Confirmação formal:** exceto PF-01, PF-02 e PF-03, **nenhuma outra decisão funcional permanece aberta**
na arquitetura de regras de negócio. As 7 ADRs cobrem integralmente as decisões estruturais.


---

## Capítulo 9 — Padrão de implementação (Claude Code e agentes)

Ao corrigir uma regra de negócio, na ordem:

1. Corrigir **a autoridade oficial** (Cap. 2) — e só ela.
2. Remover implementações duplicadas da mesma regra.
3. Atualizar/criar testes (`shared-core/src/*/**.spec.ts` e/ou teste de migration).
4. Atualizar este documento (Cap. 7: estado da RN).
5. Atualizar a auditoria correspondente em `docs/auditoria/`, se houver ticket.
6. **Nunca** introduzir nova fonte de verdade.
7. Regra nova → **primeiro** registrar `RN-XXX` no Cap. 7, depois codificar.

Restrições herdadas de `.cursor/rules/`:

- Não refatorar fora do escopo pedido; sinalizar dívida no resumo.
- Não remover código ou comportamento sem confirmação explícita.
- Sem segredos versionados; toda nova env var vai para `.env.example` com placeholder.
- Verificação antes de PR que toca CRUD: `npm run check:entity-ssot`.
- **Gate completo obrigatório antes de qualquer PR:** `npm run guard:all`, que agrega
  `guard:core`, `guard:pdv`, `guard:routes`, `guard:rpc`, `guard:pricing`, `guard:deps`,
  `guard:migrations`, `guard:domain` e `check:entity-ssot`. Há ainda `npm run check:vendabilidade`.
  Esses scripts **são autoridade executável** — se reprovarem, a implementação está errada, não o guard.
- Verificação funcional: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run check`, `npm run build`.
- **Regra de Evidência:** sem evidência verificável (teste, log, migration aplicada, PR aprovada),
  o status é **"Em Implementação"** — nunca "Concluído".

---

## Capítulo 10 — Comparativo com ERPs de mercado

Cada decisão tem fundamento, não preferência.

| Área | Padrão adotado | Inspiração |
|---|---|---|
| Cadastro flexível | Permitir cadastro incompleto; bloquear apenas na operação que exige o dado | Omie, Bling, Tiny |
| Integridade | CHECK, FK, UNIQUE e RLS como garantia final | SAP Business One, Odoo |
| Fluxos transacionais | Venda, estoque e financeiro atômicos | SAP, Protheus |
| Permissões | Backend e banco são a autoridade; UI apenas reflete | Odoo, SAP |
| KPIs | Sempre de consultas agregadas no backend, nunca de dados paginados da UI | Padrão de BI/ERP |
| Multi-tenant | Toda entidade de negócio pertence explicitamente a uma loja, salvo ADR contrário | Arquitetura SaaS consolidada |
| Fiscal | Fila assíncrona idempotente, desacoplada do checkout | NF-e/SEFAZ + integradores (Focus NFe) |

---

## Capítulo 11 — Auditoria Final de Consistência (2026-08-04)

Revisão de fechamento executada sobre a v2.0. Somente documentação; nenhum código tocado.

### 11.1 Respostas objetivas

| Pergunta | Resposta |
|---|---|
| Existe contradição restante? | **Não.** 3 encontradas nesta revisão, **todas corrigidas** (I-01, I-02, I-03 abaixo) |
| Existe ambiguidade? | **Não nas ADRs** — 7 blocos de esclarecimento normativo eliminaram as identificadas. Resta ambiguidade **declarada** em PF-01/02/03, explicitamente fora de escopo |
| Existe decisão repetida? | **Não.** As duas séries ADR (regra de negócio × fronteira técnica em `docs/adr/`) são disjuntas e o documento declara a separação |
| Existe regra impossível de implementar? | **Não.** As 35 RNs apontam para RPCs, triggers, constraints e módulos existentes ou construíveis. RN-001 e RN-007 são implementáveis, mas **aguardam PF-01** |
| Existe regra que conflita com outra? | **Não há conflito insolúvel.** As tensões legítimas estão resolvidas pelo Cap. 1-A |

### 11.2 Inconsistências encontradas e corrigidas nesta revisão

| ID | Local | Inconsistência | Correção |
|---|---|---|---|
| **I-01** | Cap. 5 (Multi-tenant) | TB-05 descrito como "bloqueado por ADR-001" — linguagem da fase em que a ADR estava pendente. ADR-001 **decide**, não bloqueia | Reescrito: "Decidido por ADR-001 · correção liberada no Pacote 3" |
| **I-02** | Cap. 6 (Fluxo de Compra) | "Conferência está bloqueada por ADR-004" — mesma inversão. Além disso o diagrama não continha a conferência | Diagrama passa a incluir `CONFERÊNCIA` como etapa bloqueante; texto alinhado a ADR-004 e ADR-006 |
| **I-03** | Cap. 8 | Afirmava um único parâmetro pendente. **Falso** — PF-02 (fuso de agregação, SSOT-03) é decisão funcional aberta, não coberta por nenhuma ADR | Seção reescrita listando PF-01, PF-02 e PF-03 |

**Severidade de I-01/I-02:** média. Um agente literal poderia ler "bloqueado por ADR" e **não implementar**
TB-05 e FLX-04 — exatamente os itens que as ADRs liberaram.
**Severidade de I-03:** alta. SSOT-03 estava no Pacote 6 sem sinalização de que exige decisão prévia.

### 11.3 Tensões legítimas entre regras (não são conflitos)

Resolvidas pela hierarquia do Cap. 1-A. Registradas para que ninguém as reabra como "contradição".

| Tensão | Regras | Resolução |
|---|---|---|
| Fonte única × espelho offline de pricing | Princípio 1 × RN-006 | Exceção arquitetural aprovada, com guard e golden tests (Cap. 1) |
| Venda sem NCM × documento fiscal exige NCM | ADR-002 × RN-002 | P2 > P4: venda vale, emissão fica pendente |
| Produto vendável sem custo × margem mínima | ADR-007 × RN-008 | Custo **ausente** → indicador `NULL`, venda permitida. Custo **inválido** → guard rejeita |
| Produto vendável sem fornecedor × compra exige fornecedor | ADR-006 | Requisito é do fluxo de compra, nunca do cadastro |
| Reabertura de caixa × imutabilidade de vendas fechadas | ADR-005 × mig 206 | Reabrir cria evento novo; não torna venda editável nem apaga histórico |

### 11.4 Lacunas remanescentes (rastreadas, não bloqueantes)

1. **Sem teste automatizado:** RN-002, 008, 009, 011, 014, 015. O guia exige criar o teste junto com a correção.
2. **Cliente e Fornecedor sem máquina de estados.** Correto hoje (cadastros simples). Se ganharem ciclo de
   vida — bloqueio, inadimplência, homologação — exigem ADR antes.
3. **Célula sem constraint no Cap. 4:** "Margem indisponível sem custo" não tem defesa de banco.
   Deliberado — é regra de apresentação/cálculo, não de integridade persistida.

### 11.5 Veredito de status normativo

**✅ Este documento pode ser tratado como a fonte normativa oficial das regras de negócio do
FastProduct / Jīn Lóng ERP para implementação pelo Claude Code.**

Sustentação:

1. **Toda regra tem autoridade única nomeada** (Cap. 2), verificada contra as 239 migrations e `shared-core`.
2. **Todo conflito tem regra de desempate** (Cap. 1-A) — o implementador não arbitra.
3. **Toda ADR tem esclarecimento normativo e camadas de implementação** (Cap. 8) — sem interpretação subjetiva.
4. **Toda pendência está declarada com nome, escopo e impacto** (PF-01/02/03) — o agente sabe onde parar.
5. **Toda regra tem estado auditável** (Cap. 7): `Vigente` ou `Divergente` com ticket.

**Condição de validade:** enquanto PF-01, PF-02 e PF-03 estiverem abertos, os itens que dependem deles
(TB-02, TB-03, SSOT-03) **não** são implementáveis sem decisão. Não é defeito do documento — é escopo
declarado. Todo o restante é normativo e suficiente.

---

## Histórico

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-08-04 | Criação. Autoridades extraídas do código real (239 migrations em `backend/supabase/migrations`, `shared-core/src/*`); RN-001..022 e ADR-001..005 derivados das auditorias v1–v3 (29 tickets). |
| 2.0 | 2026-08-04 | **Congelamento R1.** ADR-001..007 aprovadas pela direção. Resolvidas as 3 contradições da validação: exceção offline de pricing documentada (C1), Produto alinhado aos 3 estados reais do banco (C2), ADR-004 ratificada (C3). `productEngine` promovido a autoridade no Cap. 2. Cap. 3 completado com as 8 máquinas de estado vigentes. Cap. 7 ampliado para RN-001..035 (7 regras órfãs catalogadas + 5 novas RNs derivadas das ADRs). Cap. 9 passa a exigir `guard:all`. |
| **2.1** | **2026-08-04** | **Consolidação final — fonte normativa única.** Novo Cap. 1-A: hierarquia de precedência P1–P6 com justificativa técnica para Fiscal em P4. Esclarecimentos normativos nas 7 ADRs (sem alterar decisão). Coluna "Camadas de implementação" adicionada às ADRs. Correção de 3 inconsistências de linguagem residual (Cap. 5, Cap. 6 e fluxo de Compra tratavam ADRs aprovadas como bloqueio pendente). Cap. 4 alinhado a ADR-002/003/004/005/007. "Único parâmetro pendente" corrigido para **três** (PF-01 preço, PF-02 fuso, PF-03 padrão de crédito). Auditoria final anexada (Cap. 11). |
