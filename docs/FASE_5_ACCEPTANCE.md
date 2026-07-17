# Fase 5 (Vendas/PDV) — Documento de Aceite

**Data:** 2026-07-17
**Branch:** `claude/sales-phase-5-audit-94kz17` (PR [#199](https://github.com/nocodenn-cell/fastproduct/pull/199))
**Documento base:** `FASE_5_VENDAS_AUDITORIA_E_PLANO.md` (auditoria + plano original)
**Status geral:** ⚠️ **Implementação e arquitetura concluídas; fase NÃO homologada, NÃO aplicada em banco real, NÃO pronta para produção.** Ver seção 14.

---

## 1. Objetivo da Fase 5

Transformar o PDV no centro operacional do ERP Jinlong, fechando o ciclo Produto → Estoque → Cliente → Venda → Financeiro → Fiscal → Auditoria. Antes de abrir a fase, foi feita uma auditoria do domínio de Vendas (ver seção "Auditoria" de `FASE_5_VENDAS_AUDITORIA_E_PLANO.md`) para confirmar Single Source of Truth, identificar drift e dívida técnica, e só então planejar entregas incrementais.

## 2. Escopo originalmente planejado

Auditoria + 9 entregas incrementais (numeradas 1–9), definidas em `FASE_5_VENDAS_AUDITORIA_E_PLANO.md` seção 5, cobrindo: enforcement de CI para RPCs privilegiadas, cancelamento/devolução acessíveis do caixa, integridade de venda em espera, cliente em venda em espera, ledger de espera, orçamento, reabertura de venda, kits de produto, e histórico (cliente/etiqueta/NF-e).

## 3. Escopo efetivamente entregue

Todas as 9 entregas foram endereçadas. Duas ampliações de escopo foram incorporadas **a pedido explícito do usuário durante a execução**, fora do plano original:

- Evolução da autorização privilegiada de uma implementação específica de senha para um **Authorization Service** com providers intercambiáveis (PASSWORD real, PIN e QR Code stub) e infraestrutura de `AuthorizationChallenge`.
- Kits de produto tratados como **modelagem + serviço de domínio desenhado**, com a integração real com a baixa de estoque (que tocaria a RPC de finalização congelada) deliberadamente adiada por decisão conjunta.

Nenhuma migration foi aplicada a um banco real nesta sessão; nenhum teste automatizado foi executado (ambiente sem `node_modules`). Ver seção 14.

## 4. Entregas 1–9 — status

| # | Entrega | Status | Commit |
|---|---|---|---|
| 1 | Guard de CI para `cancelar_venda_transacional`/`devolver_ou_trocar_venda` | ✅ Concluída | `aa106ab` |
| 2 | Cancelamento/devolução direto do caixa (token pontual de gerente) + Authorization Service | ✅ Concluída | `8e93663`, `082539a` |
| 3 | RLS/integridade de `vendas_em_espera` | ✅ Concluída | `aa106ab` |
| 4 | Cliente em venda em espera | ✅ Concluída | `aa106ab` |
| 5 | Ledger de park/resume/discard/convert | ✅ Concluída | `aa106ab` |
| 6 | Orçamento (venda não vinculante) | ✅ Concluída | `406b09d` |
| 7 | Reabertura de venda concluída | ✅ Concluída (decisão: **não implementar**, via ADR) | `a36ee12` |
| 8 | Kits de produto | ⚠️ **Parcial por decisão explícita** — 8a (modelagem) e 8b (precificação) concluídos; 8c (baixa de estoque composta) e 8d (UI) adiados | `be7fb23` |
| 9 | Histórico: cliente da venda, reimpressão NF-e, etiqueta pelo operador | ✅ Concluída (NF-e real bloqueada pela Fase 6) | `7f0655a` |

## 5. ADRs criadas

- **ADR-VENDAS-001** — `docs/adr/ADR-VENDAS-imutabilidade-pos-conclusao.md`. Decisão: venda `CONCLUIDA` é imutável; não há reabertura. Fluxo oficial de correção: cancelamento e/ou devolução parcial + nova venda. Gerou o item de backlog "Duplicar/Refazer Venda".

Nenhuma outra ADR formal foi criada nesta fase. As decisões de arquitetura da Entrega 2 (Authorization Service) e da Entrega 8 (kits, `InventoryExpansionService`) estão documentadas em comentários extensos no próprio código e nos commits, mas **não foram formalizadas como ADR** — ver recomendação na seção 16.

## 6. Migrations criadas

| Migration | Conteúdo |
|---|---|
| `270_vendas_em_espera_rls_integridade_cliente.sql` | RLS restrita por operador/loja, `WITH CHECK` em UPDATE, `UNIQUE(operador_id, numero_local)`, validação de caixa, RPC `marcar_venda_em_espera_convertida`, `listar_vendas_em_espera` com `cliente_id`/`nome_cliente`. |
| `271_vendas_em_espera_ledger_eventos.sql` | Tabela `vendas_em_espera_eventos` (ledger append-only) + trigger `trg_vendas_em_espera_log_evento` (PARK/RESUME/DISCARD/CONVERT). |
| `272_cancelamento_devolucao_token_gerente.sql` | Função `autorizar_operacao_privilegiada` (SSoT de autorização); novo parâmetro `p_gerente_token` em `cancelar_venda_transacional` e `devolver_ou_trocar_venda` (com `DROP FUNCTION` das assinaturas antigas — evita overload duplicado); colunas `gerente_autorizador_id`/`autorizado_via` em `vendas_canceladas_auditoria` e `venda_pos_venda_operacoes`. |
| `273_orcamentos.sql` | Tabela `orcamentos` + RPCs `criar_orcamento`, `listar_orcamentos`, `obter_orcamento`, `cancelar_orcamento`, `marcar_orcamento_convertido`, `proximo_numero_orcamento`, `expirar_orcamentos_vencidos`. |
| `274_authorization_challenges.sql` | Tabela `authorization_challenges` (entidade `AuthorizationChallenge`) + RPCs `criar_authorization_challenge`, `obter_authorization_challenge`, `aprovar_authorization_challenge` (stub funcional), `rejeitar_authorization_challenge`. |
| `275_kits_modelagem.sql` | `produtos.tipo_produto` (SIMPLES\|KIT); tabelas `kit_composicoes` (versionada), `kit_composicao_itens`, `venda_kit_expansao` (snapshot, sem escritor ainda); RPCs `criar_kit_composicao`, `obter_kit_composicao_atual`. |
| `276_vendas_cliente_id_drift_fix.sql` | `ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cliente_id` — fecha drift real encontrado (coluna já usada pela v4 desde a Fase 5b sem migration correspondente no repositório). |

**Nenhuma destas 7 migrations foi aplicada a um banco Postgres/Supabase real nesta sessão.** Ver seção 14.

## 7. Arquivos relevantes alterados

Lista completa via `git diff --name-status main..claude/sales-phase-5-audit-94kz17`:

**Novos (28 arquivos, além das 7 migrations):**
```
docs/adr/ADR-VENDAS-imutabilidade-pos-conclusao.md
pdv-importados/app/caixa/CaixaCancelarVendaModal.tsx
pdv-importados/app/caixa/CaixaDevolverVendaModal.tsx
pdv-importados/app/caixa/CaixaGerenteSenhaModal.tsx
pdv-importados/app/caixa/CaixaOrcamentosModal.tsx
pdv-importados/app/caixa/hooks/useAutorizacaoGerentePontual.ts
pdv-importados/app/caixa/server/caixaAuthorizationChallenge.impl.ts
pdv-importados/app/caixa/server/caixaOrcamento.impl.ts
pdv-importados/app/caixa/server/caixaVendaDevolucao.impl.ts
pdv-importados/core/inventory/InventoryExpansionService.ts
pdv-importados/core/ports/kitComposicao.ts
pdv-importados/lib/adapters/supabase/kitComposicaoRepository.ts
pdv-importados/lib/authorization/AuthorizationProvider.ts
pdv-importados/lib/authorization/AuthorizationService.ts
pdv-importados/lib/authorization/index.ts
pdv-importados/lib/authorization/providers/PasswordAuthorizationProvider.ts
pdv-importados/lib/authorization/providers/PinAuthorizationProvider.ts
pdv-importados/lib/authorization/providers/QrCodeAuthorizationProvider.ts
pdv-importados/lib/authorization/types.ts
pdv-importados/lib/errors/operacaoPrivilegiadaErro.ts
FASE_5_VENDAS_AUDITORIA_E_PLANO.md
```

**Modificados (17 arquivos):**
```
docs/BACKLOG_TECNICO.md
pdv-importados/app/caixa/CaixaEmAbertoList.tsx
pdv-importados/app/caixa/CaixaHistoricoSheet.tsx
pdv-importados/app/caixa/CaixaPageClient.tsx
pdv-importados/app/caixa/CaixaPdvOperacoesMenu.tsx
pdv-importados/app/caixa/TODO_auditoria_255.md
pdv-importados/app/caixa/actions.ts
pdv-importados/app/caixa/caixaHistoricoRecibo.test.ts
pdv-importados/app/caixa/server/caixaErroOperador.ts
pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts
pdv-importados/app/caixa/server/caixaVendas.impl.ts
pdv-importados/app/caixa/server/cancelarVendaPerfil.ts
pdv-importados/app/gerente/vendas/devolverOuTrocarVenda.impl.ts
pdv-importados/app/gerente/vendas/devolverVendaErro.ts
pdv-importados/app/gerente/vendas/parseDevolverVendaForm.ts
pdv-importados/lib/gerente/produtosCsvContract.ts
pdv-importados/src/lib/i18n/pt.json
pdv-importados/src/lib/i18n/zh.json
scripts/rpc-gate-guard.mjs
```

(Correção do SHA do `actions/checkout` foi feita em PR separada — [#200](https://github.com/nocodenn-cell/fastproduct/pull/200) — não faz parte deste escopo.)

## 8. Decisões arquiteturais tomadas

1. **`autorizar_operacao_privilegiada` como SSoT única de autorização no banco.** Cancelamento e devolução chamam essa função em vez de reimplementar a checagem perfil-próprio-ou-token. Decisão do usuário, migration 272.
2. **Authorization Service (domínio) + Providers intercambiáveis no cliente.** `AuthorizationService.authorize({operation, request})` despacha por `request.method`; a operação de negócio nunca conhece o provider. Um `AuthorizationChallenge` aprovado (futuro QR/PIN) sempre produz um token na mesma tabela `tokens_desconto_gerente` que o SSoT do banco já valida — **zero mudança necessária nas RPCs de venda quando o método QR for implementado de verdade.**
3. **Orçamento como tabela própria (`orcamentos`), não como novo status em `vendas`.** `vendas` tem CHECK restritivo e é lida por relatórios/consistência assumindo transação real; orçamento não é uma transação. Decisão tomada durante a implementação (não estava no plano original, que sugeria "novo status de venda").
4. **Reabertura de venda: rejeitada.** Vendas concluídas são imutáveis (ADR-VENDAS-001) — imutabilidade fiscal e reuso do mecanismo já existente de cancelamento/devolução em vez de duplicá-lo para edição in-place.
5. **Kits: fronteira de domínio Vendas × Estoque.** `InventoryExpansionService` traduz "venda de kit" em movimentos de componente; vendas/recibo/financeiro/auditoria continuam vendo o kit como 1 item. Decisão do usuário: não modificar a v4 congelada nesta sessão; desenhar o serviço pronto para plugar.
6. **Composição de kit é versionada, nunca editada in-place.** Uma mudança de composição cria nova versão e desativa a anterior — endereça a preocupação de rastreabilidade histórica levantada pelo usuário. `venda_kit_expansao` existe como snapshot imutável por `item_venda_id`, ainda sem escritor (aguarda 8c).
7. **Drift de `vendas.cliente_id` reconciliado, não ignorado.** Coluna usada pela v4 desde a Fase 5b sem migration correspondente no repositório — `ADD COLUMN IF NOT EXISTS` fecha o gap com segurança nos dois cenários possíveis.

## 9. Backlog gerado

- **Duplicar/Refazer Venda** (`docs/BACKLOG_TECNICO.md`, item 6) — decorrente do ADR-VENDAS-001. Duplica itens de uma venda do histórico para um novo carrinho, com preço sempre revalidado na nova finalização (nunca herdado).
- **Kits 8c/8d** (baixa de estoque composta + UI de venda) — depende de ambiente com banco real para validar a integração com a v4 sem risco de corromper estoque/kardex.
- **PIN e QR Code (autorização)** — providers stub; falta UI de PIN, app mobile, leitura de câmera, websocket/push, e o `aprovar_authorization_challenge` real sendo chamado por um app externo.
- **NF-e no histórico do caixa** — emissão/reimpressão real depende da Fase 6 (Focus NFe), ainda não iniciada.

## 10. Pendências deliberadamente adiadas

| Item | Motivo | Onde fica quando retomado |
|---|---|---|
| Kits 8c (baixa de estoque composta) | Exige tocar `finalizar_venda_transacional_canonica_v4`, que está congelada; risco de corromper estoque/kardex sem poder validar contra banco real neste ambiente | `core/inventory/InventoryExpansionService.ts` já pronto; falta decidir o mecanismo de integração com a v4 e testar |
| Kits 8d (UI de venda) | Depende de 8c | — |
| `PinAuthorizationProvider` | Sem UI/RPC de PIN | `lib/authorization/providers/PinAuthorizationProvider.ts` (stub) |
| `QrCodeAuthorizationProvider` (fluxo completo) | Sem app mobile/websocket/push — fora de escopo explícito desta sprint | Cria challenge real; falta polling + exibição do QR + app aprovador |
| Emissão/reimpressão real de NF-e no caixa | Bloqueado pela Fase 6 (Fiscal), aguardando credenciais Focus NFe | — |
| Testes SQL/E2E das novas RPCs | Sem ambiente de banco/CI funcional nesta sessão | — |
| Remoção da coluna `desconto_gerente_token` do persist de `vendas_em_espera` | TODO pré-existente, não relacionado a esta fase, não revisitado | `TODO_auditoria_255.md` |

## 11. Riscos conhecidos

1. **Nenhuma migration desta fase foi validada contra um banco Postgres real.** SQL foi escrito e revisado manualmente, mas nunca executado — erros de sintaxe, de tipo, ou de referência a colunas/tabelas inexistentes só serão descobertos no primeiro `db push` real.
2. **`vendas.cliente_id` (migration 276) parte de uma suposição não confirmada.** A suposição de que a coluna já existe em produção (drift) vs. nunca existiu (bug latente na v4) não foi verificada contra o banco real — o `ADD COLUMN IF NOT EXISTS` é seguro nos dois cenários, mas **se o cenário for "nunca existiu"**, isso significa que toda venda com cliente e saldo pendente desde a Fase 5b pode ter falhado silenciosamente em produção até esta migration ser aplicada. Isso precisa ser investigado com prioridade alta na homologação, não tratado como um detalhe da migration.
3. **CI do repositório está quebrado por um problema de infraestrutura não relacionado a este código** (todo job falha em ~2-3s, mesmo em PRs alheias — ver PR #200). Isso significa que **nenhum guard automático rodou de fato** nesta fase além dos scripts executados manualmente neste ambiente local — os guards passaram quando executados diretamente, mas o CI real do GitHub não confirmou isso de forma independente.
4. **`autorizar_operacao_privilegiada` consome o token de `tokens_desconto_gerente` antes do resto da transação terminar.** Isso é seguro por atomicidade (rollback desfaz o consumo se a operação falhar depois), mas é um comportamento sutil que precisa de um teste de integração específico (token não pode ser "queimado" numa tentativa que falha).
5. **Cross-module coupling**: `pdv-importados/app/caixa/server/caixaVendaDevolucao.impl.ts` chama `devolverOuTrocarVendaImpl` de `app/gerente/vendas/` — o caixa agora depende de um módulo do painel de gerente. Deliberado (evita duplicar o caller único da RPC), mas é acoplamento novo entre duas áreas que antes eram independentes.
6. **`PasswordAuthorizationProvider` (em `lib/authorization`, pensado como domínio reutilizável) importa `validarGerenteDesconto` de `app/caixa/actions`.** Se uma área fora do caixa (ex.: `admin`) precisar de autorização privilegiada no futuro, herdará uma dependência do módulo de Server Actions do caixa. Ver seção 13.4.

## 12. Revisão do histórico: dados "ao vivo" do catálogo vs. snapshot da venda

Verificação item a item de tudo que aparece no detalhe de uma venda no histórico do caixa (`HistoricoVendaDetalhe`/`HistoricoVendaItemDetalhe`, `caixaVendaEspera.impl.ts`), separando o que é evidência histórica real (congelada no momento da venda) do que é lido "ao vivo" do cadastro atual:

| Campo | Fonte | Congelado na venda? | Avaliação |
|---|---|---|---|
| `itens[].nome` | `venda_eventos.items` (jsonb gravado por `venda_eventos_items_from_sale`, migration 228, executada **uma vez**, no momento do registro do evento) | ✅ Sim — o `jsonb_agg` faz `SELECT p.nome` no instante do INSERT e o resultado fica congelado na coluna; renomear o produto depois não altera vendas antigas | Correto como está. Não precisa de mudança. |
| `itens[].precoUnitario`/`total` | Mesma fonte (`venda_eventos.items`) | ✅ Sim | Correto como está. |
| `itens[].codigoBarras`, `itens[].precoVarejoAtual` | `SELECT ... FROM produtos WHERE id IN (...)` a cada leitura do histórico (função `anexarDadosAtuaisDeCatalogoParaEtiqueta`, adicionada nesta fase) | ❌ **Não — deliberadamente.** Reflete o cadastro atual, não o do dia da venda | **Correto por design, mas requer disciplina de uso**: esses dois campos existem só para alimentar a reimpressão de etiqueta (uma etiqueta deve ter o código de barras/preço *atuais*, não os da venda antiga). O nome da função e o comentário no código deixam isso explícito para não ser reaproveitado por engano em auditoria/relatório. Nenhuma mudança necessária — risco já mitigado pelo nome e pelo comentário. |
| `clienteNome` | `SELECT nome FROM clientes WHERE id = vendas.cliente_id` a cada leitura do histórico | ❌ **Não** | **Gap real, sem mitigação de nome/comentário (diferente do caso acima).** Se o nome do cliente for corrigido/alterado depois da venda, o histórico passa a mostrar retroativamente o nome novo. Para a maioria dos casos de uso (correção de erro de digitação) isso é até desejável; mas para fins de auditoria estrita ("o que o operador viu no momento da venda"), não é um snapshot fiel. **Não implementado nesta sessão** (fora do pedido original da Entrega 9, que só pedia "cliente aparece no histórico"). Fica documentado aqui como candidato a snapshot futuro: se necessário, gravar `nome_cliente_snapshot` no momento da venda (mesmo padrão já usado para nome de produto em `venda_eventos.items`). |
| `numeroNf`, `chaveNf` | Colunas diretas de `vendas` (não são join) | ✅ Sim — gravadas no momento da venda/emissão, não recalculadas na leitura | Correto como está. |
| Composição de kit (futuro, Entrega 8c) | `venda_kit_expansao` referenciando `kit_composicao_id` (versão imutável) | ✅ Sim, por design — ainda sem escritor (8c adiado) | Já desenhado corretamente antes de existir a funcionalidade — não é um gap, é uma decisão tomada preventivamente (seção 8, item 6). |

**Conclusão:** dos cinco pontos onde o histórico toca dado externo à própria venda, quatro já são snapshot correto (três pré-existentes, um novo — kit — desenhado corretamente antes do uso) e um é deliberadamente "ao vivo" por ser o comportamento certo para o caso de uso (etiqueta). **Um único gap real de rastreabilidade histórica foi identificado: nome do cliente.** Não foi implementado snapshot para esse campo nesta sessão (não fazia parte do escopo pedido e adicionaria uma coluna nova em `vendas` sem uma necessidade concreta ainda demonstrada) — fica registrado aqui como local documentado para quando/se a necessidade aparecer.

## 13. Auditoria arquitetural final

### 13.1 Existe alguma violação da Arquitetura Hexagonal?

**Não há violação grave; há uma inconsistência de padrão pré-existente que esta fase não resolveu nem piorou de forma nova.**

Evidência: o código de domínio *novo* desta fase (`core/inventory/InventoryExpansionService.ts`, `core/ports/kitComposicao.ts`, `lib/adapters/supabase/kitComposicaoRepository.ts`) segue estritamente o padrão porta/adapter já estabelecido em `core/ports/produto.ts`/`lib/adapters/supabase/produtoRepository.ts` — o serviço de domínio não importa Supabase, só a interface `KitComposicaoRepositoryPort`.

Já `lib/authorization/providers/PasswordAuthorizationProvider.ts` importa `validarGerenteDesconto` diretamente de `@/app/caixa/actions` (uma Server Action, camada de aplicação/infra) em vez de passar por uma porta formal — isso é consistente com a maioria dos `*.impl.ts` do caixa (que chamam Supabase direto), mas quebra a pureza que o resto do `lib/authorization/` tentou manter. **Não é uma regressão** (o padrão já era misto antes desta fase — a maior parte de `app/caixa/server/*.impl.ts` sempre chamou Supabase direto), mas é uma oportunidade perdida de manter o `AuthorizationProvider` 100% desacoplado de Next.js Server Actions.

### 13.2 Existe duplicação de regra de negócio?

**Não.** Autorização: uma única função SQL (`autorizar_operacao_privilegiada`) e um único serviço TS (`AuthorizationService`). Cancelamento/devolução: caller único garantido por `rpc-gate-guard.mjs` (guard estendido nesta fase para cobrir as duas RPCs). Expansão de kit: uma única implementação (`InventoryExpansionService`), sem consumidor ainda, logo sem chance de duplicação.

### 13.3 Existe violação do Single Source of Truth?

**Não — e um SSoT quebrado foi reparado.** `vendas.cliente_id` era lido/escrito pela v4 sem uma migration correspondente no repositório (o repositório não era fonte de verdade do schema real) — migration 276 fecha esse gap. Nenhum SSoT novo foi fragmentado: `tokens_desconto_gerente` continua sendo o único formato de "prova de autorização" independente do método (senha hoje, QR/PIN no futuro).

### 13.4 Alguma decisão desta fase aumentou acoplamento?

**Sim, dois pontos identificados (ambos já registrados nos riscos, seção 11.5 e 11.6):**
1. `app/caixa` → `app/gerente/vendas` (reuso de `devolverOuTrocarVendaImpl` para devolução no caixa).
2. `lib/authorization/providers/PasswordAuthorizationProvider` → `app/caixa/actions`.

Ambos foram decisões deliberadas para não duplicar um caller único de RPC (o objetivo maior — SSoT — venceu o objetivo menor — zero acoplamento entre módulos). Nenhum dos dois é circular nem impede evolução futura, mas ambos devem ser revisitados se o Authorization Service ou o fluxo de devolução precisarem ser usados por uma área do sistema fora do caixa.

### 13.5 Alguma decisão dificulta futuras integrações (especialmente Fiscal/Focus NFe)?

**Não — pelo contrário, duas decisões desta fase facilitam a Fase 6:**
1. Kits não tocaram a v4, então a Fase 6 não vai encontrar "itens de kit" misturados com itens reais em `itens_venda` — a complexidade de decompor um kit para fins fiscais (se necessário) só aparece quando 8c for implementado, e por design (`venda_kit_expansao`) já existe um snapshot correto para isso.
2. A exibição de `numero_nf`/`chave_nf` no histórico é só leitura de colunas já existentes em `vendas` — não assume nenhum formato de resposta do Focus NFe, não cria contrato prematuro com um provedor que ainda não foi integrado.

### 13.6 Existe alguma dívida técnica criada deliberadamente?

**Sim, listada de forma consolidada na seção 10.** Todas as dívidas desta fase têm dono, motivo e local de retomada documentados — nenhuma é um item "solto" sem contexto.

## 14. Classificação de status por dimensão

| Dimensão | Status | Detalhe |
|---|---|---|
| **Arquitetura** | ✅ Concluída | Decisões revisadas na seção 13; nenhuma violação grave encontrada; padrões consistentes com o restante do repositório. |
| **Implementação** | ⚠️ Concluída com exceções documentadas | Entregas 1–7 e 9 completas; Entrega 8 parcial (8a/8b feitos, 8c/8d adiados por decisão); providers PIN/QR são stubs por design. |
| **Documentação** | ✅ Concluída | `FASE_5_VENDAS_AUDITORIA_E_PLANO.md`, ADR-VENDAS-001, este documento, comentários extensos no código explicando cada decisão. |
| **Testes** | ❌ Não concluída | Nenhum teste automatizado foi executado nesta sessão (ambiente sem `node_modules`). Um fixture de teste existente foi atualizado manualmente para compilar (`caixaHistoricoRecibo.test.ts`), mas não foi executado. Nenhum teste novo foi escrito para as RPCs/serviços novos. |
| **Banco** | ❌ Não concluída | As 7 migrations desta fase nunca foram aplicadas a um banco Postgres/Supabase real. Sintaxe e lógica foram revisadas manualmente, não validadas por execução. |
| **Homologação** | ❌ Não iniciada | Depende de: aplicar as migrations num ambiente real, rodar a suíte de testes, e execução funcional guiada (ver checklist seção 15). |
| **Produção** | ❌ Não iniciada | Bloqueada até homologação concluir. Ver checklist seção 16 e riscos seção 11 (especialmente o risco #2, que precisa investigação antes de qualquer deploy). |

**Não é correto dizer "Fase 5 concluída" sem qualificação.** A afirmação precisa é: *arquitetura e implementação concluídas e documentadas; banco, testes e homologação pendentes antes de produção.*

## 15. Checklist para homologação

- [ ] Aplicar as 7 migrations (270–276) em um ambiente Supabase de homologação (`supabase db push` ou equivalente).
- [ ] **Prioridade alta**: verificar se `vendas.cliente_id` já existia em produção antes da migration 276, ou se vendas com cliente e saldo pendente falharam silenciosamente até agora (ver risco #2). Investigar logs/histórico de erros da v4 relacionados a `cliente_id`.
- [ ] Rodar `npm install` e a suíte de testes completa (`npm test` em `pdv-importados`), incluindo `caixaHistoricoRecibo.test.ts` (fixture ajustado nesta sessão, nunca executado).
- [ ] Rodar `npm run typecheck` — nunca executado nesta sessão.
- [ ] Rodar os 5 guards estáticos (`guard:core`, `guard:pdv`, `guard:rpc`, `guard:pricing`, `guard:migrations`) contra o estado real do banco.
- [ ] Testar manualmente, em ambiente real:
  - [ ] Cancelamento de venda pelo operador comum (com senha de gerente) e pelo gerente logado (sem senha) — migration 272.
  - [ ] Devolução parcial pelo operador comum e pelo gerente — migration 272.
  - [ ] Criar orçamento, listar, converter em venda, cancelar — migration 273.
  - [ ] Colocar venda em espera com cliente, retomar, verificar `CONVERTIDA` — migration 270.
  - [ ] Histórico do caixa: cliente aparece quando presente; reimpressão de etiqueta gera PDF correto; NF-e exibe `numero_nf` quando presente — migration 276.
  - [ ] `criar_authorization_challenge`/`aprovar_authorization_challenge` via chamada direta de API (sem UI ainda) — migration 274.
  - [ ] `criar_kit_composicao`/`obter_kit_composicao_atual` via chamada direta de API (sem UI ainda) — migration 275.
- [ ] Validar rollback de cada migration (ou confirmar que são aditivas e não precisam de rollback — a maioria é `CREATE TABLE IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`, mas migration 272 faz `DROP FUNCTION` de assinaturas antigas — confirmar que nenhum caller de produção ainda usa a assinatura antiga de 3 parâmetros de `cancelar_venda_transacional` ou 9 parâmetros de `devolver_ou_trocar_venda`).
- [ ] Confirmar que os guards de CI do GitHub Actions voltaram a funcionar (ver PR #200) antes de considerar qualquer verificação de CI como evidência real.

## 16. Checklist para produção

- [ ] Checklist de homologação (seção 15) 100% concluído, sem achados bloqueantes.
- [ ] Risco #2 (drift de `vendas.cliente_id`) investigado e, se aplicável, plano de correção de dados históricos definido.
- [ ] Backup do banco de produção antes de aplicar as migrations 270–276.
- [ ] Monitoramento ativo (Sentry/logs) nas primeiras 24h após deploy, com atenção especial a: `CANCELAR_VENDA_*`, `DEVOLVER_VENDA_*`, `OPERACAO_PRIVILEGIADA_*` (códigos de erro novos).
- [ ] Comunicar à operação (gerentes/operadores) o novo fluxo de cancelamento/devolução com token de gerente antes do rollout, para evitar confusão no primeiro uso.
- [ ] Formalizar como ADR as decisões arquiteturais da Entrega 2 (Authorization Service) e Entrega 8 (fronteira Vendas/Estoque de kits) — hoje só documentadas em comentários de código e commits (ver seção 5).
- [ ] Decidir e agendar a entrega de Kits 8c/8d (baixa de estoque composta) como item de roadmap explícito, não deixar "parado" sem data.

## 17. Critérios objetivos para considerar a fase concluída

Reafirmando e consolidando os critérios já definidos em `FASE_5_VENDAS_AUDITORIA_E_PLANO.md` seção 6, com status atualizado:

1. ✅ Guards de CI cobrindo cancelamento e devolução (Entrega 1).
2. ✅ Zero TODOs abertos sem decisão registrada (`TODO_auditoria_255.md` atualizado).
3. ✅ Paridade operador/gerente em cancelamento/devolução (Entrega 2).
4. ✅ Cliente presente em 100% dos pontos do ciclo de venda com UI de cliente.
5. ✅ RLS de `vendas_em_espera` fechada por loja (Entrega 3).
6. ✅ Ledger de auditoria completo (desconto, cancelamento, devolução, espera).
7. ✅ Orçamento implementado; reabertura formalmente descartada via ADR.
8. ⚠️ Kits: 8a/8b implementados; 8c/8d explicitamente movidos para entrega própria (não é item pendurado — tem dono e plano de retomada).
9. ⏸️ **Não verificável nesta sessão**: `v_venda_consistencia_anomalias` com 0 anomalias em produção por 7 dias — depende de as migrations estarem aplicadas e o sistema rodando em produção.
10. ⚠️ `docs/venda-golden-flow.md` **não foi atualizado** nesta fase para cobrir os 4 fluxos com o mesmo nível de detalhe da finalização — pendência real, não fechada.

**A fase está funcionalmente e arquiteturalmente completa para os itens 1–8. Os itens 9 e 10 exigem, respectivamente, produção rodando e um trabalho de documentação ainda não feito — nenhum dos dois pode ser marcado como concluído por esta sessão.**
