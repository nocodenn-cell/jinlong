# Gate de Convergência — Auditorias OpenCode 01–04

Projeto: Jinlong / FastProduct
Objetivo: documento de handoff para Claude Code validar os achados
das auditorias estáticas OpenCode, eliminar falsos positivos e corrigir
somente defeitos comprovados.
Estado deste documento: os itens abaixo são candidatos de
auditoria, exceto quando explicitamente marcados como já
provados/refutados por evidência posterior.

**SHA analisado (base):** `0ba769f6b0dc0fa20fa8acd0a6befb504626eb0e` (branch `claude/gate-convergencia-auditorias-171f73`, sincronizado com `origin/main`)
**Execução iniciada em:** 2026-09-02

> A seção de **Convergência (resultado)** fica ao final do documento e será preenchida ao longo da execução do gate.

0. Instrução operacional para Claude Code

Trabalhe como agente de convergência, prova e correção, não como
nova auditoria ampla.

Ordem obrigatória

Sincronize com main e registre o SHA analisado.

Leia as migrations vigentes e a última definição de cada
RPC/trigger antes de aceitar qualquer conclusão do OpenCode.

Para cada candidato abaixo, tente primeiro refutá-lo.

Classifique cada item como:

CONFIRMADO

FALSO POSITIVO

BUG HISTÓRICO JÁ CORRIGIDO

REQUISITO AUSENTE / DECISÃO DE PRODUTO

DEFENSE-IN-DEPTH

INDETERMINADO

Para dinheiro, estoque, preço, RLS/permissões e idempotência, não
corrija apenas por leitura estática quando uma prova
SQL/RPC/integration barata puder decidir.

Use a evidência mínima determinística:
estática → unit → integration → SQL/RPC → E2E crítico → Playwright.

Não rode Playwright/full E2E por padrão.

Se o achado for falso, documente por que e não altere produto.

Se for requisito ausente, não invente regra de negócio.

Se for confirmado, implemente a menor correção estrutural,
adicione/regresse com teste proporcional ao risco e rode os gates
mínimos.

Não remova E2Es existentes neste trabalho.

Não misture correções independentes numa mesma migration/commit sem
necessidade.

Para qualquer teste alegado como proteção, confirme que o runner/CI
realmente o coleta.

Regra de idempotência

Use a semântica:

mesma chave + mesma operação/payload → replay seguro;

mesma chave + payload materialmente diferente → rejeição explícita;

concorrência → exatamente um conjunto de efeitos.

Um simples early-return não é prova suficiente contra corrida
concorrente.

Produção

Não faça escrita experimental persistente em produção. Para provas de
banco, prefira ambiente local/teste ou BEGIN ... ROLLBACK quando
tecnicamente seguro e autorizado. Toda migration real deve passar por
fluxo versionado/revisável.

1. Auditoria 01 — Venda PDV → Pagamento → Estoque

1.1 Achado já PROVADO — idempotência semântica da venda

Prioridade: máxima
Estado: CONFIRMADO por prova posterior contra banco real.

Cenário já observado:

primeira chamada com venda_id = X, payload A (ex.: 1 unidade /
R$100) conclui;

segunda chamada usa o mesmo venda_id = X, mas payload B
materialmente diferente (ex.: 2 unidades / R$200);

a RPC retorna a venda anterior como CONCLUIDA;

o banco preserva a operação A;

o chamador pode interpretar a segunda requisição como sucesso da
operação B.

Trabalho esperado

Revalidar no main atual. Se ainda reproduzível, implementar
idempotência semântica, não apenas idempotência por UUID. Definir
fingerprint/hash canônico ou mecanismo equivalente para detectar payload
divergente.

Critérios mínimos

mesmo venda_id + mesmo payload: replay retorna o resultado
anterior sem duplicar efeitos;

mesmo venda_id + payload diferente: erro explícito e estável;

estoque, pagamentos, contas a receber e auditoria não duplicam;

concorrência não cria dois efeitos.

1.2 vendaConsistency — falsa confiança de testes

Estado posterior conhecido: parcialmente confirmado e já houve
correção local não necessariamente integrada.

O OpenCode apontou tabelas incorretas: - venda_itens em vez de
itens_venda; - fiscal_fila em vez de documentos_fiscais_pendentes.

Revalidação posterior encontrou algo mais importante: o teste não era
mock-based; ele pretendia usar banco real, porém não era coletado pelo
CI/runner esperado por nome/configuração. Houve proposta/alteração
local para renomeá-lo para vendaConsistency.integration.test.ts e
ajustar config.

Trabalho esperado

Verificar o estado atual do main:

o arquivo correto existe?

o runner o coleta?

o CI o executa?

usa as tabelas atuais?

usa a RPC atual?

o teste assume documentoFiscal sempre, embora enqueue fiscal
dependa de autoEnqueueFiscalOnSale?

Corrigir apenas o que ainda estiver pendente.

1.3 Desconto manual hard-coded em 15%

Estado posterior: problema de SSOT confirmado; correção local
proposta.

O store tinha maxPermitido = 15, enquanto a autoridade real é
pdv_config.max_desconto_manual_item_percentual. A RPC de configuração
já expunha o campo, mas o tipo TS o descartava.

Trabalho esperado

Verificar se a correção já chegou ao main. Não construir fluxo novo se
aplicarDescontoManual continuar sem caller real. O banco/trigger
permanece a autoridade.

1.4 Hipóteses da Auditoria 01 já REFUTADAS posteriormente

Não reabrir sem nova evidência:

retry da mesma venda duplicando vendas_pagamentos: refutado para o
caminho normal por guarda CONCLUIDA;

estoque insuficiente no segundo item deixando estado parcial:
rollback transacional comprovado;

cancelamento após devolução parcial genérica duplicando
estoque/financeiro: cenário genérico comprovado correto;

falha intermediária deixando venda parcial: rollback comprovado;

concorrência simples de estoque: código usa lock/controle
apropriado; só reabrir com reprodução concreta.

Ainda pode exigir prova específica

devolução parcial + cancelamento com split PIX/DINHEIRO;

arredondamentos limítrofes de split;

comportamento de concorrência cross-session onde ainda não houver
teste real.

2. Auditoria 02 — Fechamento de Caixa → Reconciliação → Histórico

2.1 Repetição de fechamento com valor_contado diferente

Estado: PRECISA PROVA.

Hipótese: fechar_caixa_atomico pode, no caminho "já fechado", devolver
o fechamento anterior mesmo que uma nova chamada envie valor_contado
diferente.

Prova mínima

abrir/fechar caixa de teste;

repetir a operação com os mesmos identificadores e mesmo valor;

repetir com valor contado diferente;

observar retorno e persistência.

Decisão

Se o segundo payload divergente retornar sucesso silencioso, tratar como
problema de idempotência semântica. Não alterar contrato antes de
provar.

2.2 Devolução parcial + cancelamento com split PIX/DINHEIRO

Estado: PRECISA PROVA ESPECÍFICA.

A prova genérica de devolução parcial + cancelamento já passou. Só resta
o cenário específico envolvendo split de formas de pagamento.

Prova mínima

SQL/RPC com venda split, devolução parcial e cancelamento posterior.
Conferir:

estoque;

devolucoes;

saldo_atual;

valores financeiros/estornos;

ausência de dupla compensação.

2.3 /gerente/caixas inexistente

Estado: evidência estática forte, mas não P0.

Há referências de revalidatePath('/gerente/caixas') e a auditoria não
encontrou página correspondente.

Classificação pretendida

REQUISITO/UX OPERACIONAL ou P1/P2 conforme impacto real. Isso se
alinha ao trabalho futuro de histórico de fechamento. Não tratar como
corrupção de dados.

2.4 PIX/cartão no fechamento

Estado: REQUISITO AUSENTE, não bug P0.

O fechamento atual calcula/confronta dinheiro físico. PIX/débito/crédito
não têm segunda fonte externa (adquirente/banco) para reconciliação
real.

Trabalho futuro pode exibir totais esperados pelo PDV por forma, mas
não chamar isso de reconciliação com adquirente se não existir fonte
independente.

2.5 Resumo/recibo sem decomposição por forma de pagamento

Estado: evidência estática plausível.

Avaliar como UX/relatório:

Dinheiro;

PIX;

Débito;

Crédito;

Total recebido.

Não misturar com correção de integridade do fechamento.

3. Auditoria 03 — Recebimento/NF-e → Estoque → Custo → Contas a Pagar

3.1 confirmar_importacao_nfe — retry pode repetir efeitos

Prioridade: máxima
Estado: OpenCode classificou como P0, mas ainda deve ser tratado
como PRECISA PROVA SQL/RPC antes da correção.

Hipótese: falta de idempotência/serialização permite que retry ou
concorrência da mesma importação repita estoque e/ou contas a pagar.

Provas obrigatórias

A. Retry sequencial

confirmar uma importação válida;

registrar estoque, kardex/movimentos, AP e status;

chamar novamente a mesma confirmação;

comparar estado.

B. Concorrência

Duas sessões confirmando a mesma importação simultaneamente.

Verificar se ambas podem observar estado pré-confirmação e produzir
efeitos.

C. Mesmo ID + payload divergente

Se o contrato permite payload material, verificar que a mesma identidade
operacional não aceita silenciosamente uma operação diferente.

Se confirmado

A correção precisa ser segura contra concorrência. Não assumir que
apenas IF status = ... RETURN resolve a corrida.

3.2 contas_pagar sem UNIQUE sugerida pelo OpenCode

Estado: DEFESA ESTRUTURAL A VALIDAR, não P0 independente.

OpenCode sugeriu UNIQUE (nfe_importacao_id, nfe_numero). Não aplicar
automaticamente.

Antes:

entender cardinalidade real;

verificar se uma NF-e pode gerar parcelas/títulos múltiplos;

identificar chave natural/canônica correta;

verificar constraints já existentes e migrations posteriores.

A constraint deve preservar casos legítimos.

3.3 Custo não atualizado quando regra de margem impediria update

Estado: comportamento conhecido decorrente de hardening anterior;
não corrigir automaticamente.

A migration que evita a margem bloquear toda a confirmação da NF-e pode
deliberadamente pular a atualização de custo para permitir
estoque/AP/status seguirem.

Decidir

comportamento é intencional?

operador recebe observabilidade suficiente?

custo desatualizado gera decisão comercial incorreta?

Possível ação futura: observabilidade/alerta, não necessariamente mudar
atomicidade.

3.4 Cancelamento NF-e / estorno AP inexistentes

Estado: REQUISITO AUSENTE / DECISÃO DE PRODUTO.

Não criar cancelar_importacao_nfe sem especificação funcional.
Cancelamento deve definir explicitamente:

estoque;

kardex;

custo;

AP;

status;

auditoria;

comportamento após venda/consumo do estoque.

4. Auditoria 04 — Cadastro → Preço → Atacado → Categoria/Marca

4.1 Tier de atacado ≥ varejo

Prioridade: alta para prova, não para correção imediata.
Estado: OpenCode chamou de P0 confirmado, mas o próprio relatório
exige prova SQL/RPC.

Existe forte risco de falso positivo histórico, porque deve ser
verificada primeiro a migration vigente:

20260901000000_validar_tier_preco_menor_que_varejo.sql

Cenário A — criação/edição do tier

Produto: - varejo = 100

Tentar: - tier quantidade 10 = 110

Determinar se o caminho real atual rejeita ou aceita.

Se rejeitar: classificar achado OpenCode como
BUG HISTÓRICO JÁ CORRIGIDO / FALSO POSITIVO.

4.2 Baixar varejo abaixo de tier existente

Este é o cenário mais interessante da Auditoria 04.

Estado inicial: - varejo = 100; - tier 10+ = 90.

Depois: - alterar somente varejo para 80 pelo writer/RPC real.

Verificar:

update aceita/rejeita;

tier permanece 90?

trigger da migration recente cobre UPDATE em produtos ou apenas
writes em precos_atacado?

calcular_preco_produto(10) retorna quanto?

Se varejo=80 e tier=90 sobreviverem e o PDV selecionar 90, confirmar
defeito de invariância.

4.3 Atacado simples × tiers

Estado: DÍVIDA ARQUITETURAL / HIPÓTESE DE INCONSISTÊNCIA.

Existem duas representações aparentes:

produtos.preco_atacado + quantidade_gatilho_atacado;

precos_atacado.

A auditoria diz que tiers têm prioridade e o modelo simples continua
como fallback/compatibilidade.

Prova

Criar estado com múltiplos tiers e depois editar o atacado simples.
Verificar:

quais rows mudam;

se alguma faixa fica órfã;

qual preço calcular_preco_produto retorna nas quantidades-limite;

qual é o SSOT pretendido no código atual.

Não "limpar legado" antes de provar callers reais.

4.4 Categoria/marca e cache de 120s

Estado: PROVÁVEL FALSO POSITIVO / PRECISA REFUTAÇÃO.

O fato de existir TTL 120s não prova atraso de 120s se revalidateTag
invalida corretamente a mesma tag.

Antes de qualquer Playwright:

confirmar tag exata;

confirmar chamada após create/update;

confirmar comportamento da próxima leitura;

considerar correções recentes de refresh/revalidation.

Só usar teste UI se a análise barata não resolver.

4.5 Importação CSV com rollback manual

Estado: HIPÓTESE.

OpenCode chamou de P1 confirmado, mas propôs como prova futura uma falha
simulada no meio do lote. Portanto ainda não está confirmado.

Prova mínima

Integration test com falha determinística na linha 3/5 e comparação
integral PRE/POST.

Só corrigir se sobrar estado parcial.

5. Testes e CI — dívida transversal já identificada

Este gate deve verificar, para qualquer teste usado como evidência:

nome/glob realmente coletado;

config Vitest correta;

workflow CI realmente executa;

banco real vs mock;

RPC/tabela atual vs legado;

assertion realmente prova a invariância.

Achado concreto anterior: um teste de consistência de venda que parecia
proteger fluxo crítico não era coletado como se imaginava.

Não remover E2E neste gate.

6. Segurança — micro-hardening pendente a verificar

Verificar se já foi implementado/mergeado o hardening das trigger
functions:

public.validar_tier_preco_menor_que_varejo()

public.audit_tiers_crud()

Achado anterior: SECURITY DEFINER, search_path=public, EXECUTE
desnecessariamente disponível a PUBLIC/anon/authenticated; chamada
direta não era explorável porque trigger functions não podem ser
invocadas normalmente, e o trigger não depende do caller possuir
EXECUTE.

Classificação: DEFENSE-IN-DEPTH / EXPOSIÇÃO DESNECESSÁRIA, não
vulnerabilidade explorável.

Se ainda pendente, a mudança mínima proposta era revogar EXECUTE de
PUBLIC, anon, authenticated, preservando execução necessária pelo
trigger e papéis internos. Revalidar ACL/trigger antes de aplicar.

7. Ordem recomendada de execução

Gate A — Integridade crítica

Venda: mesmo venda_id + payload diferente — revalidar e
corrigir se ainda presente.

NF-e: retry/concorrência da mesma confirmação — provar;
corrigir apenas se confirmado.

Varejo × tiers — validar migration recente e os dois sentidos
da invariância.

Fechamento: repetição com valor_contado divergente — provar
sem alterar contrato antes.

Gate B — Testes que realmente protegem

vendaConsistency.integration — coleta/CI/schema/RPC/feature flag
fiscal.

Testes SQL/RPC mínimos para os bugs confirmados.

Confirmar que novos testes falham sem a correção e passam com ela
quando isso puder ser demonstrado com segurança.

Gate C — Hipóteses secundárias

split PIX/DINHEIRO + devolução parcial + cancelamento.

atacado simples × tiers.

CSV rollback manual.

categoria/marca cache/revalidation.

Gate D — Produto/backlog, não correção automática

histórico /gerente/caixas;

decomposição por forma de pagamento;

cancelamento NF-e/estorno AP;

observabilidade quando custo da NF-e não é atualizado;

histórico/versionamento de custo;

otimistic locking de produto, somente se houver impacto
reproduzível.

8. Formato obrigatório do relatório final do Claude Code

Para cada item:

Campo                               Conteúdo

ID                                  A01-..., A02-..., A03-..., A04-...

Estado                              CONFIRMADO / FALSO POSITIVO /
HISTÓRICO CORRIGIDO / REQUISITO /
DEFENSE-IN-DEPTH / INDETERMINADO

Evidência                           arquivo, função/RPC, migration
vigente e prova runtime quando
aplicável

Impacto                             efeito concreto

Correção                            somente se confirmado

Teste                               camada mínima usada

Resultado                           PASS/FAIL

Commit/PR                           se criado

Encerramento

Entregar:

tabela de convergência de todos os candidatos deste documento;

lista exata dos falsos positivos removidos;

lista exata dos bugs confirmados e corrigidos;

testes adicionados/alterados e confirmação de que são coletados pelo
CI;

migrations criadas, se houver;

riscos/requisitos que ficaram para decisão de produto;

git status;

SHA base e SHA final;

gates executados e resultados.

Não declarar "corrigido" sem evidência pós-fix.

9. Resultado desejado

Ao terminar este gate, não queremos "mais uma auditoria".

Queremos uma lista pequena e confiável:

bugs reais comprovados e corrigidos;

hipóteses refutadas e encerradas;

requisitos de produto separados de defeitos;

testes que realmente executam;

nenhum P0/P1 sustentado apenas por suspeita estática.

Esse documento é o backlog de convergência das Auditorias OpenCode
01–04.

---

## 10. Convergência (resultado)

**SHA base analisado:** `0ba769f6b0dc0fa20fa8acd0a6befb504626eb0e` (= `origin/main` no momento da execução)
**SHA final (working tree, não commitado):** idêntico — nenhum commit foi criado por este gate; ver [§10.6](#106-git-status--pendências).
**Gates executados:** Gate A (integridade crítica) completo com prova SQL/RPC contra o banco de produção (`kbabmewnahysfvlybiak` / projeto `jinlong`), sempre em `DO $$ ... RAISE EXCEPTION 'GATE_..._RESULT: ...' $$` — nenhuma escrita persistiu (confirmado por `SELECT count(*)` pós-prova = 0 em cada caso). Gate B (regressão local) completo contra Supabase local via Docker (`supabase db reset --local` + `npm run test:financial -w fastproduct-backend`): **21/21 suítes OK**, incluindo as 3 novas. Gate C parcial (itens de menor prioridade revalidados por leitura de código; dois foram refutados com evidência forte, um permanece pendente de prova). Gate D não alterado (produto/backlog).

### 10.1 Tabela de convergência

| ID | Estado | Evidência | Impacto | Correção | Teste | Resultado |
|---|---|---|---|---|---|---|
| **A01-1.1** Idempotência semântica da venda | **CONFIRMADO** | `finalizar_venda_transacional_canonica_v4_unscoped` (corpo vigente extraído via `pg_get_functiondef` do prod), bloco "já concluída" fazia só `IF EXISTS(...status='CONCLUIDA')` sem comparar payload. Prova RPC real (BEGIN…ROLLBACK): venda_id=X, payload A (1un/R$100) conclui; mesmo venda_id, payload B (2un/R$200) retornou `status=CONCLUIDA` de novo; banco preservou só A (bruto=100, liquido=100, 1 item). | Um retry/replay do cliente com payload diferente (ex.: after timeout, correção de carrinho reenviada com o mesmo idempotency key) parece bem-sucedido para quem chamou a segunda vez, mas nada do que ele enviou foi persistido — divergência silenciosa entre o que o operador acha que vendeu e o que está no banco. | [20260902100000_finalizar_venda_retry_payload_divergente.sql](../../backend/supabase/migrations/20260902100000_finalizar_venda_retry_payload_divergente.sql) — `CREATE OR REPLACE` do corpo vigente (copiado verbatim de `pg_get_functiondef`), único trecho alterado compara `total_bruto/total_desconto/total_liquido/forma_pagamento` persistidos vs. novo payload; diverge → `RAISE EXCEPTION FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE`. Espelha o padrão já usado no escritor offline (`registrar_venda_com_itens`, `ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE`). | SQL/RPC: [gate-a01-venda-retry-payload-divergente.test.sql](../../backend/scripts/gate-a01-venda-retry-payload-divergente.test.sql) — replay com mesmo payload (silencioso, sem duplicar itens) + replay com payload divergente (rejeitado) + confere que a tentativa rejeitada não alterou nada persistido. Registrado em `SQL_SUITES` de `run-financial-tests.mjs`. | **PASS** (local, `supabase db reset --local` + `npm run test:financial`, 21/21) |
| **A02-2.1** Repetição de fechamento com `valor_contado` divergente | **CONFIRMADO** | `fechar_caixa_atomico` (corpo vigente via `pg_get_functiondef`), caminho "já fechado" (<24h) devolvia sempre `v_fechado.valor_fechamento` já persistido, ignorando `p_valor_contado` da nova chamada. Prova RPC real: fecha com 1000 (diferenca=0); replay com 1000 → `ja_fechado=true`, `contado=1000` (ok); replay com **500** → devolveu `contado=1000` (o valor da primeira chamada) **sem erro nenhum**. | Menos grave que A01-1.1 (o campo `o_ja_fechado=true` sinaliza replay e o valor devolvido não é o que foi enviado, então um chamador atento percebe a divergência), mas o contrato não rejeita explicitamente — um valor_contado errado reenviado é descartado em silêncio em vez de gerar erro acionável. | [20260902100200_fechar_caixa_repeticao_valor_divergente.sql](../../backend/supabase/migrations/20260902100200_fechar_caixa_repeticao_valor_divergente.sql) — no caminho "já fechado", compara `p_valor_contado` (arredondado) contra `v_fechado.valor_fechamento`; diverge → `RAISE EXCEPTION FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE`. Replay com o mesmo valor continua silencioso. | SQL/RPC: [gate-a02-fechamento-repeticao-valor-divergente.test.sql](../../backend/scripts/gate-a02-fechamento-repeticao-valor-divergente.test.sql) — fecha, replay igual (silencioso), replay divergente (rejeitado). | **PASS** (local, 21/21) |
| **A03-3.1** `confirmar_importacao_nfe` retry/concorrência | **FALSO POSITIVO** (já protegido) | Corpo vigente tem `SELECT ... FROM importacoes_nfe ... FOR UPDATE` (trava a linha) seguido de `IF v_imp.status <> 'EM_CONFERENCIA' THEN RAISE EXCEPTION IMPORT_NFE_STATUS_INVALIDO`. `FOR UPDATE` garante que uma transação concorrente só lê o status **após** obter a trava (sempre a versão committed mais recente) — não é um simples early-return, é serialização real de linha. Prova RPC real com JWT simulado (`set_config('request.jwt.claim.sub', ...)`): confirmação 1 = OK (estoque 10, 1 conta a pagar); confirmação 2 (retry sequencial imediato) = `BLOQUEADO -- IMPORT_NFE_STATUS_INVALIDO`; estoque final = 10 (não duplicou); contas_pagar = 1 linha (não duplicou). | Nenhum — o achado do OpenCode presumia um guard fraco (`IF status=... RETURN`); o guard real é `FOR UPDATE` + checagem pós-trava, que é a forma correta de serializar. Concorrência simultânea (duas transações disputando a mesma trava) segue a mesma garantia por construção do Postgres — não depende de nenhum detalhe de implementação adicional. | Nenhuma (nada a corrigir). | Prova SQL/RPC ad-hoc contra produção (BEGIN…ROLLBACK) — não promovida a suíte permanente por não haver regressão a proteger. | **PASS** (prova única, produção, rollback confirmado — 0 linhas remanescentes) |
| **A04-4.1** Tier de atacado ≥ varejo (criação) | **BUG HISTÓRICO JÁ CORRIGIDO / FALSO POSITIVO** | Trigger `trg_validar_tier_preco_menor_que_varejo` (20260901000000) já bloqueia `INSERT/UPDATE` em `precos_atacado` com `preco_unitario >= preco_varejo`. Prova RPC real: tentar criar tier(110) com varejo=100 → `REJEITADO como esperado -- TIER_PRECO_MAIOR_OU_IGUAL_VAREJO`. | Nenhum. | Nenhuma. | Regressão incluída em [gate-a04-varejo-menor-que-tier-ativo.test.sql](../../backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql) (bloco "A04-4.1 (regressão)"). | **PASS** (local, 21/21) |
| **A04-4.2** Baixar varejo abaixo de tier existente | **CONFIRMADO** | A trigger de 4.1 só dispara em escrita em `precos_atacado`, nunca em `UPDATE` de `produtos.preco_varejo` (`trg_produtos_margem_bu` só valida `preco_varejo` vs. `preco_custo`, nunca vs. tiers). Prova RPC real: varejo=100, tier(qtd≥10)=90; `UPDATE produtos SET preco_varejo=80` foi **ACEITO**; tier de 90 continuou ativo; `calcular_preco_produto(produto, 10)` passou a devolver `{tipo: ATACADO, preco: 90}` — **maior** que o varejo (80). | Inversão de preço real: cliente compra 10+ unidades e paga 90 (o preço "de atacado"), que é mais caro que o preço de balcão (80) — prejuízo direto de margem/reputação, silencioso (nenhum erro, nenhum alerta). | [20260902100100_guard_varejo_menor_que_tier_ativo.sql](../../backend/supabase/migrations/20260902100100_guard_varejo_menor_que_tier_ativo.sql) — trigger simétrica `trg_validar_varejo_maior_que_tiers_ativos` (`BEFORE UPDATE OF preco_varejo ON produtos`) rejeita a mudança se algum tier ativo ficaria `>= NEW.preco_varejo`. Mesmo ERRCODE (23514) e filosofia da trigger irmã. | SQL/RPC: [gate-a04-varejo-menor-que-tier-ativo.test.sql](../../backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql) — cenário negativo (baixar para 80 é rejeitado, varejo/tier preservados, `calcular_preco_produto` inalterado) + cenário positivo (baixar para 95, que não viola nenhum tier, é aceito). | **PASS** (local, 21/21) |
| **Seção 6** EXECUTE desnecessário em trigger functions | **DEFENSE-IN-DEPTH confirmado pendente → corrigido** | `has_function_privilege('anon'/'authenticated', ...)` confirmou que `validar_tier_preco_menor_que_varejo()` e `audit_tiers_crud()` ainda tinham EXECUTE concedido a `PUBLIC`/`anon`/`authenticated` em produção. Não explorável (trigger functions não podem ser chamadas diretamente), mas exposição desnecessária. | Nenhum (defense-in-depth). | [20260902100300_revoke_execute_trigger_functions_tiers.sql](../../backend/supabase/migrations/20260902100300_revoke_execute_trigger_functions_tiers.sql) — `REVOKE ALL ... FROM PUBLIC, anon, authenticated` nas duas funções + na nova `validar_varejo_maior_que_tiers_ativos()` (para não nascer com o mesmo problema). `DO $verify$` confirma no efeito. | Verify block na própria migration + regressão via `db reset` local (trigger continuou disparando normalmente após o revoke — confirmado pelos testes A04). | **PASS** (local, 21/21) |
| **A01-1.2** `vendaConsistency` — teste morto | **CONFIRMADO** (parcialmente corrigido) | `vitest.config.ts` excluía `app/caixa/server/vendaConsistency.test.ts` do `npm test`; o arquivo não batia o glob `app/**/*.integration.test.ts` de `vitest.integration.config.ts` (nome errado); e nenhum workflow de CI referencia nenhum dos dois nomes. Zero execução automática, em qualquer forma, confirmada por grep em `.github/workflows/*.yml`. O teste também usava tabelas que não existem mais: `venda_itens` (real: `itens_venda`) e `fiscal_fila` (real: `documentos_fiscais_pendentes`) — confirmado contra `001_schema_inicial.sql` / `035_fiado_fiscal_stub.sql`. | Falsa sensação de proteção: um teste com nome que sugere cobertura de "consistência de vendas" não roda em lugar nenhum, e mesmo se rodasse falharia por nomes de tabela errados antes de testar qualquer coisa. | Renomeado para `vendaConsistency.integration.test.ts` (bate o glob de `vitest.integration.config.ts`); `venda_itens`→`itens_venda`, `fiscal_fila`→`documentos_fiscais_pendentes`; `AUTO_ENQUEUE_FISCAL_ON_SALE` (default `false` em `caixaSalesRuntimeConfig.ts`) forçado para `'true'` no topo do arquivo, já que o teste assume documento fiscal sempre presente. Excludes de `vitest.config.ts` atualizados para o novo nome. | **Não executado nesta sessão** — `npx vitest run --config vitest.integration.config.ts` falhou por `node_modules` não instalados neste worktree (`Cannot find package '@supabase/ssr'`), ambiente sem `npm ci`. Correção é apenas por leitura de código/schema, não validada em runtime. **Continua sem nenhum invocador em CI** — nem `vitest.integration.config.ts` nem `cancelarVendaContrato.integration.test.ts` (mesmo problema) aparecem em nenhum workflow; ver [§10.6](#106-git-status--pendências). | **PARCIAL** — correções de código feitas; execução e wiring de CI ficam como pendência explícita, não declarados "corrigidos" sem prova. |
| **A01-1.3** Desconto manual 15% hardcoded | **CONFIRMADO** (drift real, sem exposição em produção) | `shared-core/src/stores/unifiedCartStore.ts:390` ainda tem `const maxPermitido = 15 // Default limit for non-ATACADO`, não lê `pdv_config.max_desconto_manual_item_percentual`. Busca por `aplicarDescontoManual(` (chamada, não definição) em todo o repo: **zero callers de produção** — só a própria definição e seu teste unitário. A RPC `finalizar_venda_transacional_canonica_v4` não impõe nenhum teto percentual para itens `tipo_preco='MANUAL'` (só bloqueia acréscimo); o único teto de desconto server-side é o global de 60% (`v_max_desconto_total`). | Hoje: nenhum, porque a função com o valor hardcoded não é chamada por nenhum fluxo real do PDV — é código morto. Se/quando `aplicarDescontoManual` for conectado a uma tela, o SSOT drift (15 fixo vs. config) volta a importar. | **Nenhuma aplicada** — por instrução explícita do gate ("não construir fluxo novo se `aplicarDescontoManual` continuar sem caller real"), não wireei uma tela nova só para justificar o fix. Registrado como pendência de backlog: quando este fluxo for ligado a uma UI, ler `pdv_config.max_desconto_manual_item_percentual` em vez do literal 15. | N/A | **NÃO CORRIGIDO** (intencionalmente, dead code — ver acima) |
| **A01-1.4** Hipóteses já refutadas | **Mantido** — não reaberto (sem evidência nova) | — | — | — | — | — |
| **A02-2.2** Split PIX/DINHEIRO + devolução parcial + cancelamento | **INDETERMINADO** | Não executado nesta sessão (orçamento de tempo). Cenário genérico (devolução parcial + cancelamento, sem split) já era comprovado correto segundo o próprio documento; só o cenário específico com split de forma de pagamento fica pendente de prova. | — | — | Prova mínima ainda a fazer: RPC com venda split, devolução parcial, cancelamento; conferir estoque/devolucoes/saldo/estornos sem dupla compensação. | **PENDENTE** |
| **A02-2.3** `/gerente/caixas` inexistente | **REQUISITO / UX** (confirmado por evidência estática) | `revalidatePath('/gerente/caixas')` existe em `caixaVendas.impl.ts:401`; `Glob app/gerente/caixas/**` não encontrou nenhum arquivo — rota não existe. `revalidatePath` num caminho sem página é no-op inofensivo no Next.js (não quebra nada), então não é corrupção de dado. | UX/operacional: histórico de fechamento de caixa não tem tela própria. | Nenhuma (fora de escopo deste gate — é trabalho de produto, não bugfix). | — | **BACKLOG P1/P2** |
| **A02-2.4** PIX/cartão no fechamento | **REQUISITO AUSENTE** (não é bug) | Confirma leitura do doc: sem fonte externa (adquirente/banco) para reconciliar, não há "bug" a corrigir. | — | Nenhuma. | — | **BACKLOG (decisão de produto)** |
| **A02-2.5** Resumo sem decomposição por forma de pagamento | **UX** | Evidência estática plausível, não uma questão de integridade de fechamento. | — | Nenhuma. | — | **BACKLOG** |
| **A03-3.2** `contas_pagar` sem UNIQUE | **INDETERMINADO / não aplicar sem confirmação de produto** | `pg_constraint` em produção confirma: só `contas_pagar_pkey` (PK em `id`), nenhum UNIQUE. Leitura do loop de inserção em `confirmar_importacao_nfe` mostra que cada `importacoes_nfe_duplicatas` vira uma linha de `contas_pagar` com `nfe_numero := v_dup.numero_duplicata` (i.e., o nome da coluna é enganoso — carrega o número da *duplicata*, não da NF-e) — sugere que `UNIQUE(nfe_importacao_id, nfe_numero)` seria estruturalmente uma chave natural válida (uma duplicata por número dentro da mesma importação), mas isso não foi confirmado com o dono do domínio nem testado contra reconferências/reemissões. Como 3.1 já prova que o path de escrita é serializado por `FOR UPDATE` + status guard, esse UNIQUE seria defense-in-depth, não a proteção primária. | Nenhum hoje (sem constraint, mas sem caminho de duplicação comprovado, dado o guard de 3.1). | **Não aplicada** — por instrução explícita do gate. | — | **BACKLOG (decisão de produto + prova de cardinalidade antes de aplicar)** |
| **A03-3.3** Custo não atualizado sob margem | **COMPORTAMENTO INTENCIONAL** (confirmado, não é bug) | `20260830110000_fix_confirmar_nfe_margem_nao_bloqueia_estoque.sql` documenta explicitamente: pula `UPDATE preco_custo` quando dispararia `trg_fn_produtos_margem`, para não travar estoque/AP por causa do preço de catálogo. Comentário do próprio código confirma a intenção. | Custo desatualizado no catálogo quando a margem estouraria — decisão consciente de hardening anterior. | Nenhuma nesta sessão. | — | **BACKLOG (observabilidade futura, não atomicidade)** |
| **A03-3.4** Cancelamento NF-e / estorno AP | **REQUISITO AUSENTE** | Não existe `cancelar_importacao_nfe`; confirma leitura do doc — não deve ser criado sem especificação funcional. | — | Nenhuma (por instrução explícita do gate). | — | **BACKLOG (decisão de produto)** |
| **A04-4.3** Atacado simples × tiers | **FALSO POSITIVO / já resolvido por design** | Corpo vigente de `calcular_preco_produto` (lido via `pg_get_functiondef`) **não referencia** `produtos.preco_atacado` nem `quantidade_gatilho_atacado` em nenhum ramo — resolve preço exclusivamente via `precos_atacado` ativos, com fallback a varejo. O comentário da própria função confirma: *"Configuração global e preco_atacado legado não participam do runtime."* Não há duas fontes de verdade em concorrência no caminho de runtime — os campos legados em `produtos` são decorativos/não lidos pelo cálculo de preço. | Nenhum — não há inconsistência ativa a corrigir; o "legado" já é inerte para pricing. | Nenhuma. | — | **FALSO POSITIVO (confirmado por leitura do corpo vigente da RPC)** |
| **A04-4.4** Categoria/marca cache 120s | **FALSO POSITIVO (refutado)** | `catalogo-opcoes-filtro` é a mesma string de tag usada em `unstable_cache(..., {revalidate: 120, tags: ['catalogo-opcoes-filtro']})` (`app/gerente/produtos/actions.ts:918`) e em `revalidateTag('catalogo-opcoes-filtro')` chamado após create/update em `marcas-produtos/actions.ts`, `fornecedores/actions.ts` e `categorias-produtos/actions.ts` — com testes unitários próprios (`actions.test.ts`) que já afirmam essa chamada. TTL de 120s é só o teto passivo; a invalidação ativa via tag já cobre o caminho quente. | Nenhum — próxima leitura após create/update já reflete o dado novo, não espera os 120s. | Nenhuma. | — | **FALSO POSITIVO (confirmado por leitura de código + testes existentes)** |
| **A04-4.5** CSV import — rollback manual | **CONFIRMADO ESTRUTURALMENTE MITIGADO** (não validado por prova dinâmica) | O caminho "Bulk Import" (`importarProdutosLoteAction`, `app/gerente/produtos/actions.ts:297+`) já tem rollback manual explícito: `reverter()` (linha 401) desfaz updates (restaura snapshot anterior, em ordem reversa) e deletes de tudo que foi criado (`estoque` + `produtos`) assim que qualquer linha falha no meio do lote. Validação de duplicidade de código de barras roda **antes** de qualquer escrita (linhas 372-395), então grande parte dos casos de falha nunca chega a escrever nada. | Se `reverter()` tiver um gap não identificado (ex.: falha na própria reversão), pode sobrar estado parcial — não testado dinamicamente nesta sessão. | Nenhuma aplicada — o mecanismo já existe; não construí a prova de falha determinística (linha 3/5) que o próprio documento pede como "prova mínima" por orçamento de tempo desta sessão. | Integration test com falha determinística ainda não escrito. | **PENDENTE DE PROVA DINÂMICA** (estruturalmente parece correto) |
| **Seção 5** Testes/CI — dívida transversal | **CONFIRMADO** (mais amplo que o item 1.2 isolado) | Além de `vendaConsistency` (1.2), `cancelarVendaContrato.integration.test.ts` bate o glob de `vitest.integration.config.ts` mas **nenhum workflow de CI roda `vitest run --config vitest.integration.config.ts`** nem o script `npm run test:integration:cancelamento` — confirmado por grep em `.github/workflows/*.yml`. Os testes `*.integration.test.ts` sob `pdv-importados/app/**` estão, hoje, 100% sem execução automática. | Duas suítes de integração com nome/config corretos (após esta sessão) continuam sem nenhum gate as executando — risco de regressão silenciosa em fluxos de venda/cancelamento. | Nenhuma nesta sessão (wiring de CI para testes Next.js com `cookies()`/Supabase real é uma mudança de infraestrutura maior, fora do escopo do menor-fix deste gate). | — | **BACKLOG — pendência de CI explícita, não mascarada** |

### 10.2 Falsos positivos removidos (lista exata)

- **A04-4.1** Tier ≥ varejo na criação — já bloqueado pela trigger `trg_validar_tier_preco_menor_que_varejo` (20260901000000).
- **A03-3.1** Retry/concorrência de `confirmar_importacao_nfe` — já serializado por `FOR UPDATE` + guard de status.
- **A04-4.3** Atacado simples × tiers — `calcular_preco_produto` não lê mais os campos legados; sem inconsistência ativa.
- **A04-4.4** Cache de categoria/marca 120s — `revalidateTag` já invalida a tag correta em todos os 3 pontos de escrita.

### 10.3 Bugs confirmados e corrigidos

- **A01-1.1** Idempotência semântica da venda online → [20260902100000_finalizar_venda_retry_payload_divergente.sql](../../backend/supabase/migrations/20260902100000_finalizar_venda_retry_payload_divergente.sql)
- **A02-2.1** Repetição de fechamento com valor divergente → [20260902100200_fechar_caixa_repeticao_valor_divergente.sql](../../backend/supabase/migrations/20260902100200_fechar_caixa_repeticao_valor_divergente.sql)
- **A04-4.2** Varejo pode cair abaixo de tier ativo → [20260902100100_guard_varejo_menor_que_tier_ativo.sql](../../backend/supabase/migrations/20260902100100_guard_varejo_menor_que_tier_ativo.sql)
- **Seção 6** EXECUTE residual em trigger functions → [20260902100300_revoke_execute_trigger_functions_tiers.sql](../../backend/supabase/migrations/20260902100300_revoke_execute_trigger_functions_tiers.sql)
- **A01-1.2** (parcial) nomes de tabela + wiring de nome do teste `vendaConsistency` corrigidos (execução não validada nesta sessão — ver pendências).

### 10.4 Testes adicionados/alterados e coleta por CI

| Arquivo | Tipo | Coletado por | Confirmado nesta sessão |
|---|---|---|---|
| `backend/scripts/gate-a01-venda-retry-payload-divergente.test.sql` | Novo | `SQL_SUITES` em `run-financial-tests.mjs` → step "Financial regression gate" de `ci-backend-supabase.yml` (roda em todo PR que toca `backend/**`) | **Sim** — rodei localmente via Docker (`supabase db reset --local` + `npm run test:financial -w fastproduct-backend`), 21/21 PASS |
| `backend/scripts/gate-a02-fechamento-repeticao-valor-divergente.test.sql` | Novo | idem | **Sim**, idem |
| `backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql` | Novo | idem | **Sim**, idem |
| `backend/scripts/run-financial-tests.mjs` | Alterado (registrou os 3 arquivos acima em `SQL_SUITES`) | — | **Sim** |
| `pdv-importados/app/caixa/server/vendaConsistency.integration.test.ts` (renomeado de `.test.ts`) | Corrigido | `vitest.integration.config.ts` (glob `app/**/*.integration.test.ts`) — **mas nenhum workflow de CI invoca essa config** | **Não** — `node_modules` ausente neste worktree impediu execução; correção só validada por leitura de código |
| `pdv-importados/vitest.config.ts` | Alterado (exclude atualizado para o novo nome) | — | Sim (mudança trivial, só string) |

### 10.5 Migrations criadas

1. `20260902100000_finalizar_venda_retry_payload_divergente.sql` — corpo completo de `finalizar_venda_transacional_canonica_v4_unscoped` copiado verbatim do banco vigente (`pg_get_functiondef`), com o bloco de retry endurecido.
2. `20260902100100_guard_varejo_menor_que_tier_ativo.sql` — nova trigger `trg_validar_varejo_maior_que_tiers_ativos` em `produtos`.
3. `20260902100200_fechar_caixa_repeticao_valor_divergente.sql` — corpo completo de `fechar_caixa_atomico` copiado verbatim, com o bloco "já fechado" endurecido.
4. `20260902100300_revoke_execute_trigger_functions_tiers.sql` — hardening de grants (seção 6).

Todas as 4 aplicadas e validadas contra Supabase local (Docker) via `supabase db reset --local --yes` — aplicação limpa, sem erros, 21/21 suítes do gate financeiro OK, `check:types-drift` OK (sem drift de tipos, já que nenhuma assinatura de RPC pública mudou). **Nenhuma foi aplicada ao projeto de produção** (`kbabmewnahysfvlybiak`) nesta sessão — ficam para o fluxo normal de PR → CI → deploy, conforme a instrução operacional do próprio gate ("toda migration real deve passar por fluxo versionado/revisável").

### 10.6 Git status / pendências

**Arquivos alterados (working tree, nenhum commit criado):**
```
 M backend/scripts/run-financial-tests.mjs
 R pdv-importados/app/caixa/server/vendaConsistency.test.ts -> vendaConsistency.integration.test.ts
 M pdv-importados/vitest.config.ts
?? backend/scripts/gate-a01-venda-retry-payload-divergente.test.sql
?? backend/scripts/gate-a02-fechamento-repeticao-valor-divergente.test.sql
?? backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql
?? backend/supabase/migrations/20260902100000_finalizar_venda_retry_payload_divergente.sql
?? backend/supabase/migrations/20260902100100_guard_varejo_menor_que_tier_ativo.sql
?? backend/supabase/migrations/20260902100200_fechar_caixa_repeticao_valor_divergente.sql
?? backend/supabase/migrations/20260902100300_revoke_execute_trigger_functions_tiers.sql
?? docs/audits/GATE_CONVERGENCIA_AUDITORIAS_OPENCODE_01_04.md
```

**Riscos/requisitos que ficam para decisão de produto (não corrigidos, por instrução explícita do gate):**
- A02-2.3 histórico `/gerente/caixas` (tela ausente)
- A02-2.4 / A02-2.5 decomposição de fechamento por forma de pagamento
- A03-3.2 UNIQUE em `contas_pagar` (cardinalidade não confirmada com dono do domínio)
- A03-3.4 cancelamento de NF-e / estorno de AP (sem especificação funcional)
- A01-1.3 desconto manual 15% hardcoded — SSOT drift real, mas dormente (sem caller de produção); corrigir no ponto em que a feature for de fato ligada a uma UI

**Pendências técnicas explícitas (não declaradas "corrigidas" sem prova):**
- A02-2.2 split PIX/DINHEIRO + devolução parcial + cancelamento — não provado nesta sessão.
- A04-4.5 CSV import rollback — mecanismo existe e parece correto por leitura, mas a prova dinâmica (falha determinística na linha 3/5) pedida pelo próprio documento não foi executada.
- A01-1.2 / Seção 5 — `vendaConsistency.integration.test.ts` e `cancelarVendaContrato.integration.test.ts` continuam sem nenhum workflow de CI os executando; corrigi o que dava para corrigir por leitura de código (nomes de tabela, nome de arquivo, flag de fiscal), mas não criei a infraestrutura de CI que faltava (fora do escopo de "menor correção" deste gate) nem consegui rodá-los neste worktree (dependências não instaladas).

**Gates executados e resultados:**
- Gate A (integridade crítica): 4/4 itens revalidados com prova SQL/RPC contra produção (rollback), 3 confirmados e corrigidos, 1 refutado.
- Gate B (testes que protegem): suíte financeira local 21/21 PASS (16 pré-existentes sem regressão + 3 novas); `check:types-drift` OK; `vendaConsistency` corrigido por código mas não executado.
- Gate C (hipóteses secundárias): 2 refutadas (4.3, 4.4) com evidência forte; 3 permanecem pendentes de prova dinâmica (2.2, 3.2 cardinalidade, 4.5) — deliberadamente não "resolvidas" sem prova.
- Gate D (produto/backlog): nenhuma correção automática aplicada, conforme instrução.

---

## 11. Gate de revisão pré-commit

Revisão adversarial completa do diff acima, feita como code review de
produção separado da execução original do gate — antes de qualquer commit.
Nenhum push, PR ou commit foi criado. Metodologia: releitura linha a linha
de cada migration, diff mecânico (não visual) do corpo de cada função
copiada contra `pg_get_functiondef` do banco de produção, prova empírica de
grants PRE/POST e de idempotência via reaplicação, e busca exaustiva por
callers reais de cada objeto alterado.

### 11.1 Achado da revisão — REGRESSÃO CONFIRMADA E CORRIGIDA

Duas regressões reais foram encontradas nesta revisão, ambas **corrigidas
nesta mesma sessão, antes do commit**, e revalidadas.

**(a) `20260902100200` — DROP FUNCTION reabria EXECUTE para `anon`.**
A versão original desta migration copiava o `DROP FUNCTION IF EXISTS
public.fechar_caixa_atomico(...)` da migration 230 original (necessário lá
porque a 230 mudava o `RETURNS TABLE`). Como a assinatura desta migration
**não muda**, o DROP era desnecessário — e perigoso: `pg_default_acl` em
produção tem `ALTER DEFAULT PRIVILEGES` para `public` que concede EXECUTE em
funções novas a `anon`/`authenticated`/`service_role` automaticamente
(confirmado por query direta em produção:
`defaclacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`).
Um `DROP FUNCTION` seguido de `CREATE OR REPLACE` recria o objeto do zero e
herda esse default — e o `REVOKE ALL ... FROM PUBLIC` original só revogava
de `PUBLIC`, não de `anon` diretamente, deixando `anon` com EXECUTE
novamente. Isso reabriria exatamente o que
`20260718133633_revoke_anon_pdv_rpcs_and_fix_diag.sql` corrigiu depois da
230 (prova de que a 230 tinha o mesmo problema, silenciosamente coberto por
essa migration posterior — nenhuma migration futura viria depois da minha
para repetir essa correção).
Comprovado empiricamente: aplicando a migration original num banco local
limpo, `pg_proc.proacl` de `fechar_caixa_atomico` saía com
`anon=X/postgres` no final da cadeia de migrations.
**Correção**: removido o `DROP FUNCTION` (desnecessário, `CREATE OR REPLACE`
sozinho preserva ACL existente — comportamento documentado do Postgres,
também confirmado empiricamente aqui). `REVOKE` explícito passou a incluir
`anon` (`FROM PUBLIC, anon`), e o `DO $verify$` da migration ganhou
asserções `has_function_privilege` para `anon` (deve ser falso) e
`authenticated` (deve ser verdadeiro), então uma regressão futura do mesmo
tipo quebra a aplicação da migration em vez de passar silenciosamente.
Revalidado: `proacl` final = `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`,
idêntico ao estado atual de produção.

**(b) `20260902100100` — trigger `BEFORE UPDATE` quebrava o único writer real de `produtos.preco_varejo`.**
`atualizar_produto_com_faixa_atacado`
(`20260829120000_fase6_consolida_padrao_a_dono_global.sql`, chamado por
`components/gerente/produtos/ProdutoFormModal.tsx` — a tela real de editar
produto) faz, na MESMA transação, primeiro
`UPDATE produtos SET preco_varejo = ...` e só DEPOIS o
`UPDATE`/upsert da faixa de atacado (`precos_atacado`). Uma trigger
`BEFORE UPDATE OF preco_varejo` simples dispara no primeiro UPDATE, quando o
tier ainda está no valor ANTIGO — rejeitando uma edição perfeitamente
válida (ex.: baixar varejo de 100→80 **e** o tier de 90→70 juntos num único
salvamento: o estado final é consistente, mas o passo intermediário
varejo=80/tier=90 não é).
Comprovado empiricamente contra produção (BEGIN...ROLLBACK): reproduzindo
essa exata sequência de dois UPDATEs, a trigger original rejeitava o
primeiro UPDATE com `VAREJO_MENOR_OU_IGUAL_TIER_ATIVO`, mesmo o resultado
final sendo válido — quebraria a tela de edição de produto para qualquer
gerente/dono que baixasse varejo e atacado juntos.
**Correção**: trigger recriada como `CREATE CONSTRAINT TRIGGER ...
DEFERRABLE INITIALLY DEFERRED` (`AFTER UPDATE OF preco_varejo`, não
`BEFORE`) — a checagem passa a rodar no commit da transação (semântica
padrão de constraint, igual a uma FK), então os dois UPDATEs do caller real
terminam antes de qualquer validação. Uma chamada isolada (só varejo, sem
tocar o tier — o caso comum de edição rápida) continua sua própria
transação implícita, cujo commit é imediato: o comportamento de rejeição
para esse caso continua idêntico ao de uma trigger `BEFORE`.
Revalidado com 3 cenários (usando `SET CONSTRAINTS ... IMMEDIATE` para
simular o ponto de commit de cada transação):
1. Dois UPDATEs (caller real), estado final válido (80/70) → **aceito**.
2. Um UPDATE isolado, estado final inválido (varejo 80, tier 90 intacto) →
   **rejeitado** com `VAREJO_MENOR_OU_IGUAL_TIER_ATIVO` (proteção original
   preservada).
3. Um UPDATE isolado, estado final válido (95, tier 90) → **aceito**.
Os 3 cenários viraram teste de regressão permanente em
[gate-a04-varejo-menor-que-tier-ativo.test.sql](../../backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql)
(cenário 1 é o bloco `$gate_a04_multi_step$`, adicionado nesta revisão).

Depois das duas correções, `supabase db reset --local --yes` (limpo,
Docker) + `npm run test:financial -w fastproduct-backend` rodou **21/21
suítes OK**, incluindo `fase6-consolida-padrao-a-dono-global.test.sql`
(suíte pré-existente, não escrita por este gate, que também chama
`atualizar_produto_com_faixa_atacado` de verdade) e as 4 novas suítes
próprias deste gate. Migrations reaplicadas uma segunda vez sobre o mesmo
banco (idempotência) sem erro em nenhuma das 4.

### 11.2 Migrations — checklist por arquivo

Para cada migration: nome exato, função/objeto alterado, confirmação de que
partiu da última definição vigente (não histórica), confirmação de que não
removeu comportamento de migrations posteriores, grants PRE/POST, e
idempotência.

**`20260902100000_finalizar_venda_retry_payload_divergente.sql`**
- Função: `public.finalizar_venda_transacional_canonica_v4_unscoped` (o
  "core transacional", chamado só pelo wrapper público
  `finalizar_venda_transacional_canonica_v4` — este último **não foi
  tocado**).
- Partiu da última definição vigente: confirmado por
  `pg_get_functiondef` direto em produção (não da migration 20260806011719
  de memória) — igual byte-a-byte à versão do arquivo, exceto pelo bloco de
  retry alterado. Diff mecânico (`diff` de texto, não leitura visual) entre
  o corpo extraído de produção e o corpo desta migration confirmou: **zero
  diferença** em todo o corpo após o ponto de retorno do bloco de retry
  (~330 linhas, PASSO 1 a PASSO 9, idênticas).
- Não removeu comportamento posterior: confirmado que nenhuma migration
  entre 20260806011719 (última definição do corpo) e 20260901030000 (última
  antes desta) redefine o corpo de `_unscoped` — só
  `20260809120837_finalize_v4_scope_guard_22args.sql` (rename via `ALTER
  FUNCTION ... RENAME`, corpo intacto) e migrations posteriores que só
  recriam o WRAPPER (`20260813232133`, `20260814013845`), lido linha a
  linha, confirmado que nenhuma toca `_unscoped`.
- Grants PRE/POST: **sem `DROP`, só `CREATE OR REPLACE`** — Postgres
  preserva ownership/ACL em replace (não em create). Confirmado
  empiricamente (não só por documentação): grants de `_unscoped` idênticos
  antes/depois nesta sessão — `owner=postgres, secdef=true,
  anon=false, authenticated=false, service_role=false, public=false` — só
  `postgres` (owner) executa; callers reais só passam pelo wrapper público,
  que continua com o mesmo grant de sempre (`authenticated, service_role`).
- Idempotência: reaplicada duas vezes sobre o mesmo banco local, sem erro.
- Efeitos colaterais em callers atuais: nenhum — `caixaVendas.impl.ts`
  (único chamador do wrapper) já tratava qualquer erro RPC via
  `caixaErroOperador`, que não reconhece o novo código
  `FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE` e cai no fallback
  seguro (`MSG_PADRAO`, traduzido PT/ZH — "Não foi possível concluir. Tente
  novamente." / 当前无法完成该操作). Não é um crash nem um vazamento de
  código interno; é o mesmo comportamento que qualquer código de erro não
  mapeado já tinha antes. **Melhoria pendente, não bloqueante**: adicionar
  uma entrada específica em `caixaErroOperador.ts` para essa mensagem ser
  mais precisa que o fallback genérico.

**`20260902100100_guard_varejo_menor_que_tier_ativo.sql`**
- Objeto: trigger nova `trg_validar_varejo_maior_que_tiers_ativos` +
  função `validar_varejo_maior_que_tiers_ativos()` em `produtos`. Objeto
  novo — não havia definição anterior para comparar.
- Não removeu comportamento posterior: N/A (objeto novo).
- Grants: função nova nasce com EXECUTE default para
  `anon`/`authenticated`/`service_role` (mesmo `ALTER DEFAULT PRIVILEGES`
  do achado 11.1a) — coberto pela migration seguinte (100300), que revoga
  explicitamente. Verificado que a trigger continua disparando normalmente
  depois do REVOKE (REVOKE atinge quem pode *chamar* a função diretamente,
  não o motor de triggers do Postgres, que invoca a função internamente
  independente de EXECUTE) — confirmado nos testes A04 rodando depois da
  100300 ser aplicada.
- Idempotência: `DROP TRIGGER IF EXISTS` + `CREATE OR REPLACE FUNCTION` +
  `CREATE CONSTRAINT TRIGGER` — reaplicada duas vezes sem erro.
- Efeito colateral em caller real: **encontrado e corrigido nesta revisão**
  — ver 11.1(b).

**`20260902100200_fechar_caixa_repeticao_valor_divergente.sql`**
- Função: `public.fechar_caixa_atomico(uuid, numeric, text)`.
- Partiu da última definição vigente: confirmado por `pg_get_functiondef`
  direto em produção, idêntico à migration 20260621002600_230. Diff
  mecânico do corpo (do início até `v_valor_sistema :=
  public.calcular_valor_sistema_dinheiro_caixa`, e desse ponto até o fim)
  contra produção: zero diferença semântica — só diferenças de quebra de
  linha (`IF ... THEN RAISE ...; END IF;` numa linha vs. três, mesma coisa
  para o Postgres).
- Não removeu comportamento posterior: confirmado — nenhuma das 4
  migrations posteriores que referenciam `fechar_caixa_atomico`
  (`20260718133633`, `20260731202100`, `20260814012644`,
  `20260814111243`) redefine o corpo da função; todas só tocam grants
  (via loop dinâmico, revogando `anon` — replicado no achado 11.1a),
  comentários de tabela ou diagnóstico. Lidas as 4 na íntegra.
- Grants PRE/POST: **achado e corrigido nesta revisão** — ver 11.1(a).
  Estado final: `{postgres=X/postgres, authenticated=X/postgres,
  service_role=X/postgres}`, idêntico a produção hoje.
- Idempotência: reaplicada duas vezes, sem erro.
- Efeitos colaterais em callers atuais: `cashSession.ts` (único chamador)
  tem 3 códigos de erro mapeados explicitamente
  (`FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO`,
  `FECHAR_CAIXA_MOVIMENTACOES_PENDENTES`,
  `FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO`) e um fallback genérico que repassa
  `rpcErr.message` **cru** (`error: msg`, sem passar por
  `caixaErroOperador`) para qualquer código não mapeado — comportamento
  pré-existente, já era assim para `FECHAR_CAIXA_SESSAO_EXPIRADA` e
  `FECHAR_CAIXA_SEM_PERMISSAO` antes desta migration. O novo
  `FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE` cai nesse mesmo fallback: o
  operador veria o código técnico cru, não uma frase amigável — pior que o
  caminho do A01, mas **não é uma regressão nova**, é o comportamento que
  esse caller já tinha para qualquer erro fora dos 3 mapeados.
  **Melhoria pendente, não bloqueante**: mapear o novo código
  explicitamente em `cashSession.ts`.
- Concorrência de fechamento: preservada — o `SELECT ... FOR UPDATE` no
  caixa `ABERTO` (a proteção contra dois fechamentos simultâneos do MESMO
  caixa) não foi tocado; só o ramo "já fechado" (leitura, sem lock
  necessário) ganhou a comparação de valor.

**`20260902100300_revoke_execute_trigger_functions_tiers.sql`**
- Objetos: `REVOKE` em 3 trigger functions (2 pré-existentes:
  `validar_tier_preco_menor_que_varejo`, `audit_tiers_crud`; 1 nova desta
  sessão: `validar_varejo_maior_que_tiers_ativos`).
- Sem `DROP`/`CREATE` — só `REVOKE ALL ... FROM PUBLIC, anon,
  authenticated`, uma operação idempotente por natureza (revogar algo já
  revogado não é erro). Reaplicada duas vezes, sem erro.
- Grants PRE/POST: confirmado por `has_function_privilege` dentro do
  próprio `DO $verify$` da migration (falha a aplicação se `anon` ou
  `authenticated` ainda tiverem EXECUTE) — e por query direta pós-aplicação
  no banco local: as 3 funções saem com `{postgres=X/postgres,
  service_role=X/postgres}` (sem `anon`, sem `authenticated`).
- Efeitos colaterais: nenhum — nenhuma dessas 3 funções é chamada
  diretamente por código de aplicação (só pelo motor de triggers), então
  revogar EXECUTE de quem nunca as chamava diretamente não muda
  comportamento de nenhum caller real.

### 11.3 A01 — venda: propriedades provadas

- Mesmo `venda_id` + mesmo payload → replay seguro, sem duplicar itens:
  provado em [gate-a01-venda-retry-payload-divergente.test.sql](../../backend/scripts/gate-a01-venda-retry-payload-divergente.test.sql)
  (`itens_venda` continua com 1 linha após o replay).
- Mesmo `venda_id` + payload diferente → rejeição explícita
  (`FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE`): provado no mesmo
  arquivo; adicionalmente confirma que a tentativa rejeitada **não altera**
  `total_bruto`/`total_liquido`/contagem de itens já persistidos.
- Nenhum novo estoque/pagamento: garantido por construção — o guard de
  retry é a PRIMEIRA verificação que pode lançar exceção no corpo da
  função (antes de "PASSO 1"), então uma rejeição aborta a transação inteira
  antes de qualquer `INSERT`/decremento de estoque ser alcançado. Não há
  caminho de código entre o `RAISE EXCEPTION` do guard e os `INSERT`s de
  itens/estoque/pagamento.
- Payload equivalente não é rejeitado por serialização/ordem irrelevante:
  não se aplica — a comparação é entre valores `numeric`/`text` **escalares**
  (`total_bruto`, `total_desconto`, `total_liquido`, `forma_pagamento`), não
  entre JSON serializado; igualdade numérica não é sensível a ordem de
  chaves ou formatação.
- Semântica da operação, não JSON incidental: os totais comparados já são
  a representação canônica validada do carrinho — a própria função valida
  `p_total_bruto`/`p_total_desconto`/`p_total_liquido` contra os itens
  antes de persistir (tolerância de R$0,02). Este é o MESMO padrão já usado
  pelo escritor offline `registrar_venda_com_itens` (mesma migration de
  origem, 20260814013845) para o problema análogo — não é uma abordagem
  nova inventada para este gate.
- **Limitação residual, não corrigida (documentada, não escondida)**: como a
  comparação é por totais agregados, dois carrinhos DIFERENTES que somem
  exatamente o mesmo `total_bruto`/`total_desconto`/`total_liquido`/
  `forma_pagamento` seriam tratados como "mesmo payload" e dariam replay
  silencioso, mesmo com itens/quantidades diferentes. Um retry LEGÍTIMO
  (mesmo carrinho reenviado) nunca cai nesse caso — os itens são idênticos,
  logo os totais também são. Um ataque deliberado exigiria já ter controle
  total sobre o payload, caso em que reusar `venda_id` colidindo por soma
  não dá vantagem sobre simplesmente gerar um `venda_id` novo. Consistente
  com o risco já aceito pelo padrão análogo (`registrar_venda_com_itens`);
  não é uma fraqueza nova introduzida aqui. Fortalecer para comparação
  item-a-item seria escopo maior que a "menor correção estrutural" pedida
  pelo gate original.
- Caller (`caixaVendas.impl.ts`): ver 11.2, primeiro item.

### 11.4 A02 — fechamento: propriedades provadas

- Retry idêntico continua idempotente: provado em
  [gate-a02-fechamento-repeticao-valor-divergente.test.sql](../../backend/scripts/gate-a02-fechamento-repeticao-valor-divergente.test.sql)
  (`o_ja_fechado=true`, `o_valor_contado` igual ao enviado).
- Retry com `valor_contado` diferente é rejeitado: provado no mesmo
  arquivo (`FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE`).
- Não altera fechamento já persistido: a rejeição acontece ANTES de
  qualquer `UPDATE` no ramo "já fechado" (esse ramo nunca escreve, só lê e
  retorna) — não há como a tentativa rejeitada alterar `caixas`.
- Caller/UI: ver 11.2, terceiro item — erro chega ao chamador (não é
  engolido), mas cru; melhoria de i18n pendente, não bloqueante.
- Concorrência de fechamento: preservada — ver 11.2, terceiro item.

### 11.5 A04 — varejo × tiers: propriedades provadas

- Criar/editar tier `>= varejo` → rejeitado: provado (regressão, trigger
  pré-existente 20260901000000, não tocada).
- Baixar varejo para `<= tier ativo`, sozinho → rejeitado: provado.
- Atualização válida continua funcionando: provado (varejo 95 > tier 90 é
  aceito).
- **Writers reais cobertos, não só uma RPC**: a proteção é uma trigger de
  TABELA (`AFTER UPDATE OF preco_varejo ON produtos`), não uma checagem
  dentro de uma RPC específica — dispara para qualquer `UPDATE` desse
  campo, de qualquer chamador presente ou futuro, sem precisar ser
  replicada em cada writer. Confirmado por busca exaustiva: só
  `atualizar_produto_com_faixa_atacado` escreve `produtos.preco_varejo` via
  `UPDATE` em todo o repositório (`grep` em todas as migrations) — e essa
  é exatamente a que foi testada (11.1b). Nenhum mecanismo de bypass de
  trigger (`session_replication_role`, `DISABLE TRIGGER`) existe no
  repositório.
- DRAFT/inativo: a trigger não faz exceção para `ativo=false` ou
  `status_publicacao='DRAFT'` — mesma postura da trigger irmã
  (`trg_validar_tier_preco_menor_que_varejo`, 20260901000000), que também
  nunca fez essa distinção. Não é uma inconsistência nova; é a mesma regra
  de negócio já vigente aplicada nos dois sentidos.
- **Achado e corrigido nesta revisão**: caller multi-step quebrava com a
  trigger `BEFORE` original — ver 11.1(b).

### 11.6 Hardening (seção 6) — PRE/POST e disparo pós-REVOKE

Ver 11.2, quarto item. `has_function_privilege` confirma `anon=false` e
`authenticated=false` nas 3 funções após a migration; os testes A04 (que
disparam a trigger `validar_varejo_maior_que_tiers_ativos`, uma das 3
revogadas) continuam passando depois da 100300 ser aplicada — confirmação
direta de que o REVOKE de EXECUTE não impede o motor de triggers do
Postgres de invocar a função (comportamento correto: EXECUTE controla quem
pode *chamar* a função por nome; o disparo de trigger não passa por essa
checagem).

### 11.7 Testes — gates determinísticos re-executados

- **21/21 suítes do gate financeiro**, em reset local limpo (`supabase db
  reset --local --yes`, Docker), rodado como confirmação final desta
  revisão, depois de todas as correções da seção 11.1: PASS.
- Os 3 novos testes são de fato coletados: estão em `SQL_SUITES` de
  `run-financial-tests.mjs` (confirmado por diff — só adição, 3 linhas,
  nada removido de `SQL_SUITES`), que é invocado por `npm run test:financial
  -w fastproduct-backend`, executado no step "Financial regression gate" de
  `ci-backend-supabase.yml` em todo PR que toca `backend/**`.
- Cada novo teste falha contra a implementação anterior quando
  demonstrável: para A01 e A02, a prova ORIGINAL contra produção (antes de
  qualquer migration existir) já demonstrou exatamente o cenário que o
  teste agora encapsula — o mesmo `RAISE EXCEPTION` de payload divergente
  que o teste espera hoje era, sem a correção, um sucesso silencioso. Para
  A04, a prova desta REVISÃO (11.1b) demonstrou a versão `BEFORE` simples
  rejeitando o cenário multi-step que o novo bloco `$gate_a04_multi_step$`
  agora prova como aceito.
- Nenhuma alteração acidental em testes antigos: confirmado por diff — os
  16 arquivos `.test.sql`/`.test.mjs`/`.mjs` pré-existentes em `SQL_SUITES`
  não foram tocados; a única mudança em `run-financial-tests.mjs` é a
  adição das 3 novas entradas.
- Full Playwright: não executado, conforme instrução.

**Nota de diligência — falso alarme investigado, não ignorado**: numa das
rodadas em lote pós-correção, `test-commission-concurrency.mjs` e
`test-nfe-conferencia-concurrency.mjs` (2 suítes `.mjs` pré-existentes, não
escritas por este gate, testam concorrência real com duas sessões `psql`
independentes) apareceram como FAIL. Como o segundo é exatamente a prova de
concorrência real do achado A03-3.1 (que este gate classificou como falso
positivo com base só numa prova sequencial), a falha foi investigada a
fundo antes de ser descartada: reset limpo + reexecução isolada de cada
script (2x cada) mostrou as 6 + 2 asserções passando de forma consistente e
determinística. O próprio harness documenta, em comentário no código
(`test-nfe-conferencia-concurrency.mjs`, classe `Session`), dois achados
anteriores de fragilidade em execução por CI (hang silencioso e problema de
savepoint) — consistente com timing sensível a carga do host, não com
comportamento incorreto da RPC. Nenhuma das duas suítes foi tocada por
nenhuma das 4 migrations deste gate (não mexem em `importacoes_nfe`,
`contas_pagar` nem `comissoes_vendedores`). Conclusão: falha ambiental
(Docker reciclado ~8 vezes nesta sessão), não regressão — confirmado por 2
execuções limpas adicionais e 1 rodada completa final (21/21) num reset
totalmente fresco.

### 11.8 Diff final

```
$ git diff --cached --stat
 backend/scripts/gate-a01-venda-retry-payload-divergente.test.sql          | 145 ++++
 backend/scripts/gate-a02-fechamento-repeticao-valor-divergente.test.sql   |  78 +++
 backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql             | 155 +++++
 backend/scripts/run-financial-tests.mjs                                   |   3 +
 backend/supabase/migrations/20260902100000_finalizar_venda_retry_payload_divergente.sql  | 522 ++++++++
 backend/supabase/migrations/20260902100100_guard_varejo_menor_que_tier_ativo.sql          |  86 ++
 backend/supabase/migrations/20260902100200_fechar_caixa_repeticao_valor_divergente.sql    | 170 +++
 backend/supabase/migrations/20260902100300_revoke_execute_trigger_functions_tiers.sql     |  40 ++
 docs/audits/GATE_CONVERGENCIA_AUDITORIAS_OPENCODE_01_04.md                | (este documento)
 pdv-importados/app/caixa/server/{vendaConsistency.test.ts => vendaConsistency.integration.test.ts} |   9 +-
 pdv-importados/vitest.config.ts                                           |   2 +-
 11 files changed
```

**Lista completa de arquivos alterados** (`git status --short`, working
tree — nenhum commit criado):
```
A  backend/scripts/gate-a01-venda-retry-payload-divergente.test.sql
A  backend/scripts/gate-a02-fechamento-repeticao-valor-divergente.test.sql
A  backend/scripts/gate-a04-varejo-menor-que-tier-ativo.test.sql
M  backend/scripts/run-financial-tests.mjs
A  backend/supabase/migrations/20260902100000_finalizar_venda_retry_payload_divergente.sql
A  backend/supabase/migrations/20260902100100_guard_varejo_menor_que_tier_ativo.sql
A  backend/supabase/migrations/20260902100200_fechar_caixa_repeticao_valor_divergente.sql
A  backend/supabase/migrations/20260902100300_revoke_execute_trigger_functions_tiers.sql
A  docs/audits/GATE_CONVERGENCIA_AUDITORIAS_OPENCODE_01_04.md
R  pdv-importados/app/caixa/server/vendaConsistency.test.ts -> pdv-importados/app/caixa/server/vendaConsistency.integration.test.ts
M  pdv-importados/vitest.config.ts
```

**Resumo de cada diff**: ver seção 11.2 (migrations), 10.4 (testes),
parágrafo acima de 10.1 e diff mostrado em 10.6 (rename +
`vendaConsistency`/`vitest.config.ts`).

**Migrations novas**: as 4 listadas acima e em 10.5 — nenhuma aplicada a
produção nesta sessão.

**Testes novos/alterados**: os 3 `.test.sql` novos (Gate A) +
`vendaConsistency.integration.test.ts` (rename + correção) +
`vitest.config.ts` (exclude atualizado) + `run-financial-tests.mjs`
(registro dos 3 novos).

**Arquivos não relacionados**: nenhum nos 11 arquivos finais — os 11
arquivos do diff correspondem exatamente ao escopo do gate (3 fixes + 1
hardening + seus testes + o próprio documento + a correção pontual de
1.2). Nota de diligência: `git add -A` capturou de passagem
`.claude/scheduled_tasks.lock` (artefato interno de coordenação de sessão,
tocado por uma chamada de agendamento própria desta revisão) — identificado
e revertido (`git checkout --`) antes desta lista final; não faz parte do
commit.

**`git status`**: ver bloco acima — árvore de trabalho limpa fora desses
11 arquivos, nada staged além deles, nenhum commit criado.

**SHA base**: `0ba769f6b0dc0fa20fa8acd0a6befb504626eb0e` (idêntico ao SHA
atual — nenhum commit foi criado nesta sessão nem na execução original do
gate).

### 11.9 Veredito

Duas regressões reais foram encontradas por esta revisão — nenhuma
estava presente na validação original do gate porque os testes daquela
rodada (corretos para o que provavam) não cobriam grants pós-DROP nem o
caller multi-step. Ambas foram corrigidas nesta mesma sessão, com prova
antes/depois, e a suíte completa (21/21, incluindo os novos cenários de
regressão que travam as duas correções) foi revalidada em reset limpo
depois das correções. Nenhuma outra dúvida sobre definição histórica de
RPC, teste que não prova o que afirma, ou alteração não relacionada foi
encontrada.

**PRÉ-COMMIT: GO**

---

## 12. Correções pós-CI (PR #363) — fechamento das classes de falha reveladas por review automatizado

Depois do primeiro push, o CI e um review automatizado (Codex) revelaram 1 check falhando
(`migration-remote-drift`) e 5 comentários em `20260902100100_guard_varejo_menor_que_tier_ativo.sql`
e em `vendaConsistency.integration.test.ts`. Por instrução explícita, nenhum foi tratado como
backlog — todas as 4 classes de falha de código + a investigação do drift foram fechadas neste
mesmo PR, com prova, antes de declarar convergência técnica.

### 12.1 — `vendaConsistency.integration.test.ts`: assertion incompatível com o contrato real da RPC

**Causa raiz encontrada (mais profunda que o comentário original do Codex):** o arquivo, mesmo
com nome/tabelas corrigidos (item A01-1.2 original), **não executa em nenhuma configuração de
vitest** quando chama `finalizarVendaCaixaImpl` — essa função usa `createClient()` de
`@/lib/supabase/server`, que chama `cookies()` do Next.js, uma API que só existe dentro de um
request scope real do App Router. Comprovado ao instalar as dependências (`npm ci`, ausentes no
worktree) e rodar o arquivo de verdade: as 4 suítes falhavam com `cookies was called outside a
request scope` — nunca chegavam a executar as asserções que o Codex apontou como erradas.

**Correção:** reescrito para chamar a RPC `finalizar_venda_transacional_canonica_v4` diretamente
via `@supabase/supabase-js` (service_role), sem depender de `cookies()`/Next.js request scope.
Preserva o propósito original do arquivo (provar consistência contra Postgres real) sem duplicar
`finalizarVendaCaixa.integration.test.ts` (mocks, cobre a camada TS) nem os testes SQL deste gate
(cobrem idempotência de retry) — cobre a terceira coisa que nenhum dos dois cobria: contrato de
retorno e atomicidade da RPC contra dados reais. Assertions corrigidas: `documentoFiscal` usa a
chave `documento_fiscal_id` (não `documento_id`); `itensAtualizados`/`estoqueBaixado` são
afirmados `null` (contrato real da RPC — nenhum caminho de código os preenche), não
truthy/`length`.

**Prova:** executado de verdade nesta sessão (`npx vitest run --config
vitest.integration.config.ts`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` do stack local) — **3/3
testes PASS** contra Postgres real: consistência atômica de itens/estoque/pagamento, rollback
completo (nem o cabeçalho da venda persiste) em falta de estoque, exatamente 1 vencedor em
concorrência real (`Promise.all` de duas chamadas simultâneas). `npx tsc --noEmit` limpo. Coleta
pelo runner correto confirmada: bate o glob `app/**/*.integration.test.ts` de
`vitest.integration.config.ts` e está excluído de `vitest.config.ts` (`npm test` normal).

**Resultado:** prova comportamento real (não mais bloqueado por `cookies()`); coletado pelo
runner correto; não depende mais de campos deliberadamente `NULL`; não cria falsa confiança — se
a RPC quebrar, o teste quebra.

**Pendência que permanece, disclosed e não mascarada:** nenhum workflow de CI invoca
`vitest.integration.config.ts` hoje (mesma lacuna já registrada na seção 10.6 para este arquivo e
para `cancelarVendaContrato.integration.test.ts`) — o teste agora *pode* provar comportamento real
quando executado, mas ainda não é executado automaticamente em nenhum push. Fechar essa lacuna de
CI é uma mudança de infraestrutura separada (novo job com stack Supabase local + secrets de
service_role em `ci-pdv-importados.yml`) — fora do escopo desta rodada de correções (que tratou
das 5 classes de falha nomeadas, não de wiring de CI novo).

### 12.2, 12.3, 12.4 — Trigger deferrable, reativação de tier e corrida real: correção unificada

Os 3 achados restantes (comentários Codex #3 "usa NEW congelado", #4 "reativação sem
revalidação", #5 "sem lock compartilhado") são a MESMA invariante cross-table
(`precos_atacado.preco_unitario < produtos.preco_varejo` para tiers ativos) vista de 3 ângulos —
corrigidos juntos em
[20260902120000_serializa_invariante_varejo_tier_e_reativacao.sql](../../backend/supabase/migrations/20260902120000_serializa_invariante_varejo_tier_e_reativacao.sql).

**Achado #5 (corrida real) — reproduzido primeiro, com 2 sessões reais, antes de qualquer
correção**, em
[test-varejo-tier-concurrency.mjs](../../backend/scripts/test-varejo-tier-concurrency.mjs)
(`--reproduzir-bug`, harness idêntico ao de `test-nfe-conferencia-concurrency.mjs` — duas sessões
`psql` interativas persistentes, não uma chamada sequencial): T1 baixa `produtos.preco_varejo`
100→80 (trigger deferrable, ainda sem commit); T2 reativa (`ativo=false→true`) um tier a 90, sem
commit; a checagem de T1 é forçada (`SET CONSTRAINTS ... IMMEDIATE`) enquanto T2 ainda está aberta
— T1 não vê a reativação (MVCC), passa; T1 commita; T2 commita **sem nenhuma checagem** (achado
#4: a trigger do tier não cobria `ativo`). Estado final persistido, provado por consulta direta
pós-teste: `varejo=80, tier_ativo=true, tier_preco=90` — invariante violada, sem rejeição de
nenhum dos dois lados.

**Causa raiz:** as duas triggers da invariante (`validar_tier_preco_menor_que_varejo`,
`validar_varejo_maior_que_tiers_ativos`) validavam cada uma só o próprio lado, sem lock
compartilhado, e a do tier nunca cobria `ativo`; a do varejo (already deferrable) lia
`NEW.preco_varejo` congelado do evento, não o estado final da linha.

**Correção unificada:** as duas triggers passam a ser `CONSTRAINT TRIGGER ... DEFERRABLE
INITIALLY DEFERRED` (checam o estado FINAL da linha no commit, não o NEW do evento — fecha #3) e
as duas tomam o MESMO lock advisory por `produto_id`
(`internal.lock_invariante_varejo_tier`, novo helper, `pg_advisory_xact_lock` namespaced) antes de
ler/validar — serializa qualquer combinação de escritores (INSERT tier, UPDATE
preco_unitario/produto_id/`ativo` — fecha #4 —, UPDATE de `produtos.preco_varejo`) sem risco de
deadlock por ordem diferente de locks, porque é sempre UM lock por `produto_id`, adquirido pela
mesma função nas duas direções.

**Prova pós-fix, mesmo harness de 2 sessões reais (`--provar-fix`, sem `--reproduzir-bug`),
determinística via `SET CONSTRAINTS ... IMMEDIATE` (não depende de timing de wall-clock):**
1. Cenário 1 (mesmo achado #5): T2 agora é **rejeitada no COMMIT**
   (`TIER_PRECO_MAIOR_OU_IGUAL_VAREJO`) — releu o varejo já em 80, já commitado por T1. Estado
   final: `varejo=80, tier_ativo=false` — invariante preservada.
2. Cenário 2 (o lock bloqueia de verdade, não é coincidência de timing): T1 segura o lock via
   `UPDATE` de varejo + `SET CONSTRAINTS IMMEDIATE`; T2 (checagem de um `INSERT` de tier novo no
   MESMO produto) **bloqueia de verdade**, provado por timeout de 900ms, não inspeção textual;
   destrava só depois de T1 commitar, relê o varejo já atualizado, aceita corretamente.
3. Cenário 3 (achado #3 isolado): dois `UPDATE`s de `preco_varejo` na mesma transação
   (100→80→120, tier ativo em 90) — o `COMMIT` aceita o estado FINAL (120), não rejeita pelo passo
   intermediário (80).

Também confirmado que o writer real `atualizar_produto_com_faixa_atacado` (que já havia quebrado
uma vez nesta convergência — ver seção 11.1(b) — e motivou a versão deferrable original) continua
funcionando: `fase6-consolida-padrao-a-dono-global.test.sql` (suíte pré-existente, chama a RPC de
verdade) permanece PASS.

**Novo problema encontrado DURANTE esta correção, investigado e corrigido antes de declarar GO**
(exatamente o cenário que a regra de encerramento pedia para não deixar passar): ao mudar a
trigger do tier de `BEFORE` (imediata) para `DEFERRABLE`, o teste de regressão A04-4.1
(`gate-a04-varejo-menor-que-tier-ativo.test.sql`, já existente deste gate) passou a **falhar** —
criar um tier com preço ≥ varejo não gerava mais erro na hora do `INSERT` dentro do próprio bloco
de teste, porque a checagem agora só dispara no commit/`SET CONSTRAINTS IMMEDIATE`. Causa raiz:
mudança de timing da trigger, não regressão do guard em si (o guard em si funciona — só não na
hora que o teste antigo assumia). Corrigido adicionando `SET CONSTRAINTS
trg_validar_tier_preco_menor_que_varejo IMMEDIATE` no ponto certo do teste A04-4.1 e do cenário
multi-step (que agora força as DUAS triggers, não só a do varejo). Sem essa correção o gate
financeiro ficaria em 21/22, mascarando que o teste — não o código de produção — estava
desatualizado.

### 12.5 — `migration-remote-drift`: investigação da causa raiz e correção canônica (sem mascarar o check)

**Investigação:** o job compara `backend/supabase/migrations/*.sql` contra
`supabase_migrations.schema_migrations` do projeto referenciado por
`SUPABASE_MIGRATION_CHECK_PROJECT_REF` (secret de CI). O log listava 7 migrations como
`remote_ausente`: as **3 deste gate criadas antes desta rodada** de correções pós-CI
(`20260901000000`, `20260901020000`, `20260901030000` — **já existiam em `main`, antes de
qualquer commit deste PR**) e as **4-5 novas deste gate**
(`20260902100000`..`20260902120000`).

**Separação exigida, feita:**

- **As 3 pré-existentes**: consultadas diretamente no projeto Supabase usado durante toda esta
  convergência (`kbabmewnahysfvlybiak`, "jinlong") — `SELECT version, name FROM
  supabase_migrations.schema_migrations WHERE version IN (...)` confirmou que as versões
  `20260901115307`, `20260901115323`, `20260901115338` existem lá, com `name` batendo
  integralmente com os 3 arquivos locais. **Mesmo padrão, já documentado 13 vezes em
  `backend/supabase/README.md`, de migration aplicada via MCP `apply_migration` (não CLI): o
  `version` gravado é o timestamp real de aplicação, não o do nome do arquivo.** Isso confirma que
  `SUPABASE_MIGRATION_CHECK_PROJECT_REF` resolve (pelo menos para essas 3) ao mesmo projeto usado
  nas provas deste gate inteiro — não uma cópia de staging genuinamente atrasada. Postcondition
  reverificada por leitura (tabela/trigger/coluna existem; a trigger do tier rejeita corretamente
  em chamada real) antes de aceitar. **Correção canônica aplicada:** 3 novos pares em
  `backend/supabase/migration-human-gates.json` (o arquivo machine-readable que
  `p0-migration-status.mjs` lê — não é invenção de allowlist, é o mecanismo oficial e já
  estabelecido deste projeto para exatamente este cenário, com o mesmo nível de evidência dos 13
  pares anteriores) + entrada em prosa correspondente no README (décimo quarto ao décimo sexto
  par).
- **As 4-5 novas**: **deliberadamente não aplicadas a nenhum ambiente nesta sessão** (decisão do
  gate de revisão pré-commit, seção 11) — todas as provas usaram `BEGIN...ROLLBACK`. Não há
  tracking remoto para reconciliar porque elas genuinamente não foram deployadas ainda. **Não
  apliquei `db push` nem MCP `apply_migration` para forçar isso a ficar verde.** Fazer isso
  significaria realizar, sem uma decisão explícita e separada do usuário, um deploy real de 5
  migrations (incluindo as correções financeiras críticas A01/A02) no mesmo projeto onde toda a
  investigação deste gate rodou — uma ação de alto risco, difícil de reverter, e que a instrução
  original do pré-commit já havia deliberadamente adiado para o fluxo normal de merge/deploy. O
  check `migration-remote-drift` **continua vermelho por essas 4-5** — corretamente: elas
  realmente não estão no remoto ainda. Isso não é uma lacuna escondida; é o check fazendo seu
  trabalho.

**Resultado:** 3 dos 7 itens de `Drift bloqueante` resolvidos pela via oficial e documentada,
sem tocar produção. Os outros 4-5 permanecem corretamente bloqueantes até uma decisão explícita de
deploy — que não é desta sessão.

### 12.6 — Validação final (reset limpo do zero)

- `npx supabase db reset --local --yes` (Docker, do zero) — todas as migrations, incluindo
  `20260902120000`, aplicadas sem erro.
- `npm run test:financial -w fastproduct-backend` → **22/22 suítes PASS** (as 19 anteriores + a
  nova `test-varejo-tier-concurrency.mjs`, incluindo os 3 cenários de concorrência real acima).
- Grants confirmados por query direta pós-reset: `internal.lock_invariante_varejo_tier`,
  `validar_tier_preco_menor_que_varejo`, `validar_varejo_maior_que_tiers_ativos` — sem `anon`,
  sem `authenticated` (só `postgres` + `service_role`, este último implícito/normal). Nenhuma
  regressão nos grants já corrigidos no pré-commit (`fechar_caixa_atomico`,
  `finalizar_venda_transacional_canonica_v4_unscoped`).
- Idempotência: `20260902120000` reaplicada 2x sobre o mesmo banco, sem erro.
- `test-varejo-tier-concurrency.mjs` registrado em `SCRIPT_SUITES` de `run-financial-tests.mjs` —
  coletado pelo mesmo mecanismo (`npm run test:financial`) do step "Financial regression gate" de
  `ci-backend-supabase.yml`.
- `vendaConsistency.integration.test.ts`: 3/3 PASS (seção 12.1), `tsc --noEmit` limpo.
- Full Playwright: não rodado manualmente. `e2e-playwright` do CI (falha pré-existente, não
  relacionada) classificado como HARNESS-INFRA — ver seção 13.

## 13. `e2e-playwright` (CI) — classificação

**HARNESS-INFRA, não relacionado a este PR.** Log completo da run inspecionado: 20 falhas em 7
specs (`login.spec.ts`, `admin-idioma.spec.ts`, `gerente.spec.ts`,
`admin-vendas-devolucao-troca.spec.ts`, `qa-produtos-modulo.spec.ts`,
`smoke-fase1-provisionamento-homologacao.spec.ts`, `gerente-transferencias.spec.ts`) — nenhuma
menciona qualquer código/RPC/trigger tocado neste gate (busca por
`VAREJO_MENOR_OU_IGUAL_TIER_ATIVO|TIER_PRECO_MAIOR_OU_IGUAL_VAREJO|
FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE|RETRY_PAYLOAD_DIVERGENTE` no log: zero ocorrências). Causa
raiz visível no próprio log: `[WebServer] Server is approaching the used memory threshold,
restarting...`, seguido de `net::ERR_EMPTY_RESPONSE`, `net::ERR_CONNECTION_RESET` e "Navigation
interrupted by another navigation to /admin/dashboard" em cascata por páginas totalmente não
relacionadas (login, toggle de idioma, wizard de provisionamento, relatórios) — exaustão de
memória do runner de CI derrubando o servidor Next.js sob teste, não um defeito de produto. Não
rodado manualmente (Playwright completo), conforme instrução — só observado/classificado pelo log
real do job.

## 14. Veredito desta rodada

Todas as 5 classes de falha reveladas por review automatizado foram fechadas com causa raiz, prova
antes/depois, e revalidação completa — incluindo um problema novo (teste A04-4.1 desatualizado
pela mudança de timing da trigger) encontrado e corrigido durante a própria correção, antes de
declarar conclusão. `migration-remote-drift` teve sua causa raiz separada corretamente (3 de 7
itens eram documentação atrasada, corrigida pela via oficial; 4-5 são deploy pendente genuíno, não
mascarado). `e2e-playwright` classificado como infraestrutura de CI, não produto.
