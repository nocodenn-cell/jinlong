# PDV — Fase 1: Backend Alignment (auditoria + contrato-alvo, sem implementação)

| Campo | Valor |
|-------|-------|
| **Status** | Especificação formal — **auditoria do estado real + contrato-alvo; nenhuma migration escrita ou aplicada nesta rodada** |
| **Escopo desta rodada** | Auditar as RPCs/Server Actions reais do caixa contra o contrato da Fase 0 e definir o contrato que elas devem satisfazer. A implementação (migrations) fica para uma etapa seguinte, após revisão. |
| **Fora de escopo** | UI, frontend state engine, admin mode, CI/infra/tooling, alteração da spec da Fase 0 |
| **Pré-requisito** | [`PDV_FASE3_STATE_MACHINE_SPEC.md`](./PDV_FASE3_STATE_MACHINE_SPEC.md) — este documento audita o backend contra o `PDVSaleState`/`PDVViewState`/COMMAND→STATE definidos lá |

**Regra de ouro desta fase:** o backend não executa ações — ele executa transições de estado. Uma RPC que muda dado sem devolver o estado resultante, ou que descarta o resultado de uma escrita, viola essa regra mesmo que o efeito colateral esteja correto.

---

## 1. Metodologia

Auditoria por leitura direta do código (migrations SQL em `backend/supabase/migrations/`, Edge Function `backend/supabase/functions/validar-gerente/`, wrappers TypeScript em `pdv-importados/app/caixa/server/*`). Cada achado abaixo cita `arquivo:linha`. Achados foram verificados por segunda leitura antes de entrar neste documento — um achado do primeiro levantamento (suposta assinatura divergente de `aprovar_movimentacao` quanto a `p_autorizacao_token`) foi **descartado** após confirmar que a migration [`046_aprovar_movimentacao_por_token_gerente.sql`](../backend/supabase/migrations/046_aprovar_movimentacao_por_token_gerente.sql) já redefine a função com esse parâmetro — não há drift ali.

Convenção de nomenclatura usada neste documento: **RPC** = função SQL (`supabase.rpc(...)`); **wrapper** = Server Action TypeScript que chama a RPC (`pdv-importados/app/caixa/server/*.impl.ts`).

---

## 2. Estado real por fluxo — auditoria contra o contrato da Fase 0

### 2.1 Abertura de caixa (`IDLE` com `caixaStatus: FECHADO` → `IDLE` com `caixaStatus: ABERTO`)

**Não existe RPC.** É um `INSERT` direto na tabela `caixas` a partir do wrapper.

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| Sem função SQL dedicada — abertura é `supabase.from('caixas').insert(...)` | `caixaSessaoOperador.impl.ts:102-111` (`abrirCaixaOperadorImpl`) | §4.1 — mutação sem RPC não tem superfície única para aplicar estado canônico/idempotência/erro estruturado |
| **TOCTOU (race condition)**: guarda é "ler status, depois inserir" — duas chamadas concorrentes podem ambas passar pela leitura antes de qualquer uma inserir | `caixaSessaoOperador.impl.ts:96-99` (leitura) → `102-111` (escrita); **nenhum índice único** encontrado em `caixas` que impeça 2 linhas `status='ABERTO'` para o mesmo `operador_id` | §4.2 — duas aberturas concorrentes podem gerar dois caixas abertos para o mesmo operador |
| `INSERT ... .select('id').single()` só devolve o `id` — não devolve `status`/`data_abertura`/`valor_inicial` da linha recém-criada | `caixaSessaoOperador.impl.ts:109` | §4.1 — resposta parcial; caller tem que re-derivar o resto do estado por conta própria |
| Erro de sessão expirada e de "já existe caixa aberto" retornam string livre (`'Sessão expirada. Faça login novamente.'`, `'Já existe um caixa aberto para este operador.'`), não `error_code` | `caixaSessaoOperador.impl.ts:93, 97` | §4.4 — sem código estável, UI não pode decidir programaticamente o que fazer |

### 2.2 Leitura de status de caixa (`obter_status_caixa_operador`)

RPC existente, bem comportada na forma (nunca lança exceção, sempre devolve linha), mas com mensagem de erro não estruturada.

`RETURNS TABLE (status, caixa_id, data_abertura, valor_inicial, valor_sistema_dinheiro, blind_closure_enabled, mensagem_operador)` — [`230_caixa_status_fechamento.sql:3-61`](../backend/supabase/migrations/230_caixa_status_fechamento.sql).

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| `status = 'ERRO'` traz `mensagem_operador` como frase solta em português (`'Sessão expirada. Faça login novamente.'`, `'Caixa indisponível no momento.'`) — a segunda é um `WHEN OTHERS` genérico que colapsa qualquer causa real de `calcular_valor_sistema_dinheiro_caixa` em uma única frase | `230_caixa_status_fechamento.sql:25-26, 44-46` | §4.4 — mensagem substitui código; causa real perdida |

Fora isso, este RPC já satisfaz "sempre retorna estado explícito, nunca lança" — é o exemplo mais próximo do contrato-alvo já existente.

### 2.3 Fechamento de caixa (`fechar_caixa_atomico`)

RPC bem comportada e **já idempotente** (`o_ja_fechado = true` em vez de erro num replay dentro de 24h) — [`230_caixa_status_fechamento.sql:71-158`](../backend/supabase/migrations/230_caixa_status_fechamento.sql).

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| `UPDATE public.caixas SET status = 'FECHADO', ...` sem `RETURNING` — a linha final é montada com valores calculados antes do `UPDATE`, não lida de volta | `230_caixa_status_fechamento.sql:148-156` | §4.1 (parcial) — funciona porque os valores computados são os mesmos que seriam lidos, mas quebra a garantia "estado vem de uma leitura pós-escrita", não de reconstrução em memória |

### 2.4 Adicionar/remover/alterar item (`SALE_ACTIVE` self-loop)

Confirma o que a Fase 0 já registrou: **não existe RPC** — é 100% `unifiedCartStore` em memória no cliente. Não há o que auditar aqui do lado do backend; a única chamada de rede nesse trecho é a leitura de preço (§2.5). Este é o ponto onde a "regra de ouro" (backend só faz transição de estado) é estruturalmente inaplicável hoje, porque **não há backend envolvido** — é puramente client-side. Registrado aqui para que a Fase 1 não finja que existe uma RPC a normalizar onde não existe nenhuma.

### 2.5 Cálculo de preço (`calcular_preco_produto`)

`RETURNS jsonb` — [`250_calcular_preco_produto_decision_fields.sql:27-108`](../backend/supabase/migrations/250_calcular_preco_produto_decision_fields.sql).

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| Nunca lança exceção para casos esperados; erro vem como campo `erro` dentro do jsonb de sucesso (`{ preco: null, tipo, erro: "quantidade_invalida" }` / `"produto_nao_encontrado"`) | `250_...sql:45-49, 58-62` | §4.4 — dois padrões coexistindo no mesmo backend (exceção vs. campo sentinela) para o mesmo tipo de erro de validação |
| Códigos de erro em `snake_case` minúsculo, diferente do padrão `MODULO_CODIGO` (SCREAMING_SNAKE) usado no restante do domínio de venda | `250_...sql:49, 62` | §4.4 — dois vocabulários de erro no mesmo domínio |
| Preço é validado **duas vezes** por item não-MANUAL/PROMOÇÃO: uma vez em `recalcularItensNoServidor` (client → RPC, pré-checkout) e de novo dentro de `finalizar_venda_transacional_canonica_v4` (server-side, autoritativo) | `caixaPrecoAutoritativoServer.ts:196-201`; `243_...v4_captura.sql` comentário linha 9 e loop linhas 111-145 | Não é uma violação de contrato por si — é redundância intencional (defesa em profundidade), mas **deve ser preservada** no contrato-alvo: a segunda validação (dentro do RPC de finalização) é a que importa para determinismo; a primeira é só UX antecipada |

`tipo` (`'VAREJO' | 'ATACADO'`, campo de decisão devolvido por esta RPC) é exatamente o tipo de dado que o contrato-alvo protege: **é resolvido inteiramente aqui**, nunca recalculado ou reinterpretado no frontend. Ver §4.5 — regra formalizada para não deixar essa garantia implícita.

### 2.6 Autorização de desconto de gerente (`validar-gerente`, Edge Function — não é RPC SQL)

Contrato HTTP em `backend/supabase/functions/validar-gerente/index.ts`; lógica em `_shared/gerente-auth.ts:359-475`.

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| **Não idempotente por design**: toda chamada bem-sucedida gera um token novo (32 bytes aleatórios) e insere uma linha nova em `tokens_desconto_gerente`, sem invalidar tokens anteriores ainda não usados do mesmo gerente/operador | `_shared/gerente-auth.ts:94-98` (`generateToken`), `320-357` (`persistTokenAndResetLimits`) | §4.3 — duas chamadas idênticas em sequência (ex.: duplo clique) produzem **dois tokens válidos simultâneos**, não o mesmo token replayed |
| Vocabulário de erro é uma mistura de `error_code`-like strings (`SENHA_INVALIDA`, `CONFIG_HASH_INSEGURO`) com semântica dirigida por status HTTP (`401`/`429`/`500`/`503`) em vez de um único enum estável | `_shared/gerente-auth.ts` (múltiplos pontos), listado no anexo de códigos abaixo | §4.4 — mais próximo do contrato-alvo que as RPCs SQL, mas ainda não é um enum fechado documentado em um só lugar |
| Consumo do token (`usado = true`) só acontece depois, dentro de `finalizar_venda_transacional_canonica_v4` — ou seja, a "transição de estado" real do token (`emitido → usado`) está fisicamente separada da sua emissão, em dois sistemas diferentes (Edge Function vs. Postgres RPC) | `_shared/gerente-auth.ts:333-339` (emissão) × `243_...v4_captura.sql:227-229` (consumo) | Não é uma violação isolada, mas é uma fonte de estado dividido entre dois runtimes que o contrato-alvo (§4) precisa reconhecer explicitamente, não fingir que é uma única RPC |

### 2.7 Checkout → Finalização (`PAYMENT_PENDING → PAYMENT_PROCESSING → COMPLETED`, `finalizar_venda_transacional_canonica_v4`)

Já mapeada em detalhe na Fase 0 (§4 de `PDV_FASE3_STATE_MACHINE_SPEC.md`). Achados adicionais desta auditoria, focados no contrato de retorno/idempotência/erro:

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| `UPDATE public.tokens_desconto_gerente SET usado = true ... ON CONFLICT` (na verdade `IF NOT FOUND`) sem `RETURNING` | `243_...v4_captura.sql:227-229` | §4.1 — controle de fluxo via `NOT FOUND`, sem capturar o novo estado do token |
| `INSERT INTO vendas ... ON CONFLICT (id) DO NOTHING` sem `RETURNING` — a função não sabe, a partir desta linha isolada, se foi ela quem criou a linha ou se já existia | `243_...v4_captura.sql:184-189` | §4.1 — mitigado pelo early-return de idempotência **antes** deste ponto (linha 78-86), mas a garantia depende de dois mecanismos coordenados, não de um único ponto de verdade |
| `INSERT INTO itens_venda ...` e `INSERT INTO vendas_pagamentos ...` com `ON CONFLICT DO NOTHING`, ambos sem `RETURNING` | `243_...v4_captura.sql:201-205, 214-222` | §4.1 — mesmo padrão |
| Códigos de erro com **sufixo dinâmico interpolado** (`FINALIZAR_VENDA_CANONICA_ESTOQUE:%`, `..._PRECO_NAO_VALIDADO:<uuid>`, `..._TIPO_PRECO_DIVERGENTE:<uuid>`, `..._PRECO_DIVERGENTE:<uuid>`) quebram matching exato de string — um consumidor programático precisa fazer `startsWith`/split em `:` | `243_...v4_captura.sql:132, 137, 140, 208` | §4.4 — o padrão `MODULO_CODIGO` é bom, mas o sufixo dinâmico deveria ir em um campo de detalhe separado, não concatenado ao código |
| Fiscal é **deliberadamente** fire-and-forget dentro da própria transação: falha em `fiscal_enfileirar_documento_venda` é capturada (`WHEN OTHERS`) e vira uma string `SQLERRM` livre dentro de `dados_fiscais.fiscal_enqueue_error`; o wrapper TS nunca inspeciona essa chave, só repassa `dados_fiscais` adiante | `243_...v4_captura.sql:239-256`; `caixaVendas.impl.ts:394` | Este é o **único** fire-and-forget *intencional e documentado* do domínio (comentário da própria migration: "Fiscal desacoplado ... NÃO derruba a venda") — contrato-alvo deve **preservar** esse desacoplamento, mas exigir que o erro capturado seja visível em `PDVViewState.lastCompletedSale.documentoFiscal` como `'error'`, não silenciosamente ignorado pela UI |
| **Fire-and-forget não intencional**: depois que a venda já foi concluída com sucesso, o wrapper dispara `supabase.rpc('registrar_pricing_version_venda', ...)` sem `await` — só um `.then()` que loga um warning no Sentry se falhar. A função pode retornar ao chamador antes desse `.then()` executar (risco real em ambiente serverless) | `caixaVendas.impl.ts:363-380` | §4.1/§4.3 — efeito implícito não retornado; se falhar, nada no `PDVViewState` reflete isso, e em serverless o callback pode nunca completar |

### 2.8 Cancelamento de venda (`cancelar_venda_transacional`)

`RETURNS TABLE (venda_id, status_venda, valor_estornado)` — [`059_cancelar_venda_split_e_auditoria_nao_dinheiro.sql:11-205`](../backend/supabase/migrations/059_cancelar_venda_split_e_auditoria_nao_dinheiro.sql). Não faz parte do `PDVSaleState` da Fase 0 (que termina em `COMPLETED` terminal) — é um fluxo pós-venda, mas compartilha o mesmo domínio de dados.

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| `status_venda` é sempre o literal `'CANCELADA'` hardcoded no `RETURN QUERY`, nunca lido de volta do `UPDATE` | `059_...sql:170-172` (update sem `RETURNING`), `199-200` (return hardcoded) | §4.1 |
| Não é idempotente no sentido "replay seguro": uma segunda chamada para a mesma venda já cancelada **lança** `CANCELAR_VENDA_JA_CANCELADA` em vez de devolver sucesso com o resultado já conhecido (padrão diferente do usado em `finalizar_venda_transacional_canonica_v4`, que faz early-return de sucesso) | `059_...sql` (checagem de status antes do fluxo principal) | §4.3 — dois padrões de idempotência diferentes no mesmo domínio (early-return-sucesso vs. erro-em-replay) |
| Checagem de teto de valor para cancelamento por `OPERADOR` (`cancelamento_maximo_valor_sem_gerente`) só existe no **wrapper TS**, não na RPC — e é código morto na prática, porque a própria RPC já bloqueia qualquer perfil que não seja `GERENTE\|DONO\|ADMIN` | `caixaVendas.impl.ts:90-105` vs. `059_...sql` (permissão só libera GERENTE+) | Não é uma violação de contrato de estado, mas é uma regra de negócio duplicada/morta que deveria ser removida ou movida para a RPC ao alinhar este fluxo |

### 2.9 Movimentações de caixa (sangria/reforço/estorno) — `045_caixa_movimentacoes_transacionais.sql`

Este é o fluxo **mais próximo do contrato-alvo já hoje**: `registrar_movimentacao` tem `p_idempotency_key` obrigatório, backed por índice único `uq_movimentacoes_caixa_idempotency (caixa_id, idempotency_key)`, e faz replay real (recaptura `unique_violation` e devolve a linha existente) — [`045_...sql:124-393`, idempotência em `372-391`].

| Achado | Local | Violação do contrato-alvo |
|--------|-------|-----------------------------|
| `aprovar_movimentacao` e `cancelar_movimentacao` **não** têm chave de idempotência — uma segunda chamada para a mesma movimentação já aprovada/cancelada lança `MOV_CAIXA_APROVACAO_STATUS_INVALIDO`/`MOV_CAIXA_CANCELAMENTO_STATUS_INVALIDO` em vez de replay | `045_...sql:395-523` (aprovar), `525-586` (cancelar) | §4.3 — mesmo padrão de inconsistência do §2.8: alguns fluxos fazem replay-sucesso, outros erro-em-replay |
| `cancelar_movimentacao` tem assinatura de retorno **diferente** das outras três (`RETURNS TABLE(movimentacao_id, status_movimentacao)`, sem `saldo_atual`) | `045_...sql:525-529` (assinatura) vs. as demais em `124-129`, `395-405`, `588-593` | §4.1 — mesma família de operação, contrato de retorno assimétrico sem motivo funcional aparente |
| `aprovar_movimentacao`/`cancelar_movimentacao` fazem `UPDATE ... SET status = 'aprovado'/'cancelado'` sem `RETURNING`, e o `RETURN QUERY` final usa o literal hardcoded em vez de reler a linha | `045_...sql:507-518` (aprovar), `573-585` (cancelar) | §4.1 |
| **Idempotência anulada pelo caller**: o wrapper `estornarMovimentacaoCaixaImpl` gera uma `p_idempotency_key` com `crypto.randomUUID()` novo a cada chamada, em vez de reaproveitar a chave determinística de default da RPC (`'estorno:' || origem_id`, usada só quando o caller passa `NULL`) — isso significa que o mecanismo de replay do índice único **nunca** dispara para estornos vindos deste wrapper | `caixaMovimentacoes.impl.ts:257` vs. default em `045_...sql:610` | §4.3 — contrato de idempotência existe na RPC mas é neutralizado pelo caller; o guard remanescente é o índice parcial `uq_movimentacoes_caixa_estorno_ativo`, que numa corrida real de duplo-clique surge como erro genérico do Postgres (`unique_violation`, `23505`), não um `MOV_CAIXA_*` |

### 2.10 Vocabulário de erro fora do domínio de venda (referência de severidade do problema)

Achados de contexto — não são fluxos do `PDVSaleState`, mas mostram que a falta de convenção de `error_code` não é isolada ao checkout: `RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501'` e variantes lowercase sem prefixo de módulo aparecem repetidas em `078_dashboard_gerente_resumo.sql`, `079_...v2.sql`, `080_...structured.sql`, `100_dashboard_gerente_top_produto.sql`, `101_fix_dashboard_atividades_limit.sql`, `127_kardex_vendas_imutavel.sql`, `225_dashboard_serie_horaria_semana_anterior.sql`; e mensagens com prefixo de nome de função + dois pontos (`'decrementar_estoque: sessão inválida'`) em `015_security_rpc_hardening.sql` e `070_decrementar_estoque_idempotente_delega_seguro.sql`. **Três convenções de erro coexistem no banco**: `MODULO_CODIGO` (SCREAMING_SNAKE, o padrão a adotar), `codigo_lowercase` sem prefixo, e `funcao: frase livre`.

---

## 3. Resumo — desvios por categoria do contrato-alvo

| Categoria (Fase 1, entregável) | Fluxos conformes hoje | Fluxos não conformes |
|----------------------------------|---------------------------|---------------------------|
| **1. Estado canônico obrigatório** (§4.1) | `obter_status_caixa_operador`, `fechar_caixa_atomico` (parcial), `registrar_movimentacao` | Abertura de caixa (sem RPC), `finalizar_venda_transacional_canonica_v4` (writes sem `RETURNING`), `cancelar_venda_transacional`, `aprovar_movimentacao`, `cancelar_movimentacao` |
| **2. Normalização de transições** (§4.2) | Máquina de venda (`SALE_ACTIVE→PAYMENT_PENDING→PAYMENT_PROCESSING→COMPLETED`) já é respeitada pela única RPC que fecha o ciclo | Abertura de caixa: TOCTOU permite estado inválido (2 caixas abertos) |
| **3. Idempotência operacional** (§4.3) | `registrar_movimentacao` (idempotência real via chave + índice único), `finalizar_venda_transacional_canonica_v4` (early-return em `CONCLUIDA`) | `validar-gerente` (gera token novo sempre), `cancelar_venda_transacional`/`aprovar_movimentacao`/`cancelar_movimentacao` (erro-em-replay em vez de replay-sucesso), `estornar_movimentacao` via wrapper (idempotência neutralizada pelo caller) |
| **4. Contrato de erro estruturado** (§4.4) | Maioria das RPCs de venda/caixa usa `MODULO_CODIGO` | `calcular_preco_produto` (campo sentinela lowercase), `obter_status_caixa_operador` (frase livre no caso de erro), sufixos dinâmicos interpolados em `finalizar_venda_transacional_canonica_v4`, dashboards/`decrementar_estoque` (convenções alternativas) |

---

## 4. Contrato-alvo da Fase 1

Define o que toda RPC/wrapper do domínio de venda **deve** satisfazer daqui para frente. Este contrato é a régua contra a qual a auditoria da §2 foi feita — a implementação (migrations que fecham cada gap) é trabalho de uma etapa seguinte, não deste documento.

### 4.1 Estado canônico obrigatório

Toda mutação (RPC ou wrapper) que altera o estado de uma venda, caixa, movimentação ou token deve devolver, na mesma resposta:

1. **Estado final explícito** — não um literal hardcoded reconstituído em memória antes do `UPDATE`/`INSERT`; a leitura pós-escrita (`RETURNING`, ou um `SELECT` subsequente dentro da mesma transação) é a fonte da verdade.
2. **Contexto suficiente para reconstruir a fatia relevante de `PDVViewState`** sem uma segunda chamada — ex.: abrir caixa devolve `{ caixaId, status, dataAbertura, valorInicial }`, não só `{ caixaId }`.
3. Nenhuma mutação client-facing sem uma RPC ou Server Action que a represente — "escrita direta de tabela a partir do wrapper" (como a abertura de caixa hoje) deixa de ser aceitável quando este contrato for implementado.

📌 Regra derivada: **toda mutação precisa retornar o estado final completo**. Nenhum comando é "fire and forget" — inclusive o `registrar_pricing_version_venda` hoje disparado sem `await` (§2.7) precisa, no contrato-alvo, ou (a) ser `await`ado e seu resultado refletido em `PDVViewState`, ou (b) ser explicitamente redesenhado como assíncrono garantido (fila/outbox) em vez de uma Promise solta — "fogo e esquece" apenas por syntax accident não é uma opção válida.

**Exceção documentada e preservada**: o desacoplamento do enfileiramento fiscal dentro de `finalizar_venda_transacional_canonica_v4` (§2.7) é a única condição em que "a venda commit independente do resultado de uma sub-operação" é intencional. O contrato-alvo não elimina esse desacoplamento — exige que o resultado (sucesso/erro) desse sub-passo continue sendo devolvido no payload (`dados_fiscais`/`documentoFiscal`), como já acontece, e que a UI (fora de escopo aqui) o exponha em vez de ignorá-lo.

### 4.2 Normalização de transições

Toda RPC do domínio de venda deve, antes de executar seu efeito, verificar que o estado de origem é um dos estados válidos para aquele comando (tabela §2 de `PDV_FASE3_STATE_MACHINE_SPEC.md`) e:

- **Rejeitar explicitamente** com um `error_code` (§4.4) se o estado de origem não permite a transição — nunca aplicar o efeito parcialmente e devolver um estado ambíguo.
- Onde a transição de origem é ambígua por concorrência (ex.: dois `abrir_caixa_operador` simultâneos), a normalização é responsabilidade do **banco**, via constraint (ex.: índice único parcial `WHERE status = 'ABERTO'`), não de uma checagem prévia em TypeScript — o padrão já usado em `uq_movimentacoes_caixa_idempotency` e `uq_movimentacoes_caixa_estorno_ativo` é o modelo a replicar para a abertura de caixa.

### 4.3 Garantia de idempotência operacional

Duas famílias de idempotência coexistem hoje no domínio (§3) e o contrato-alvo escolhe **uma** como padrão: **replay-sucesso** (a chamada repetida devolve o mesmo resultado de sucesso da primeira, sem lançar) — é o padrão de `finalizar_venda_transacional_canonica_v4` e `registrar_movimentacao`, e é o único compatível com retry automático de rede sem lógica condicional no cliente.

- Toda RPC que representa uma operação crítica (venda, pagamento, adicionar item — quando existir RPC para isso, §2.4) deve aceitar ou derivar uma chave de idempotência e devolver o resultado da primeira execução bem-sucedida em qualquer replay, em vez de lançar um erro de "já processado".
- `cancelar_venda_transacional`, `aprovar_movimentacao` e `cancelar_movimentacao` precisam migrar do padrão atual (erro-em-replay) para replay-sucesso.
- Onde o caller (wrapper TS) é responsável por gerar a chave de idempotência, o contrato-alvo exige que a chave seja **determinística por operação de negócio** (ex.: `estorno:<origem_id>`), nunca por invocação (`crypto.randomUUID()` a cada chamada anula a garantia, como hoje em `estornarMovimentacaoCaixaImpl`, §2.9).
- `validar-gerente` (Edge Function) precisa de uma decisão explícita fora deste documento: idempotência por token ativo (reaproveitar token não expirado do mesmo operador/gerente em vez de emitir um novo) é uma mudança de política de segurança, não só de contrato de dados — fica registrada como gap, não resolvida aqui.

### 4.4 Contrato de erro estruturado

Toda resposta de erro de qualquer RPC/wrapper do domínio de venda deve conter, sem exceção:

```
{
  error_code: string   // MODULO_CODIGO, SCREAMING_SNAKE, SEM sufixo dinâmico interpolado
  state: PDVSaleState | CaixaStatus   // o estado atual, mesmo em erro — nunca omitido
  message: string       // mensagem não técnica, para exibição direta na UI
  detail?: unknown       // dado dinâmico (UUID de produto, valor de divergência, etc.) — nunca concatenado ao code
}
```

Consequências diretas dos achados da §2:

- `calcular_preco_produto` migra do campo sentinela lowercase (`erro: "quantidade_invalida"`) para o mesmo formato `error_code` do resto do domínio.

### 4.5 Regras de domínio (ex.: atacado) são resolvidas inteiramente aqui — nunca reinterpretadas no frontend

"Atacado" não é um caso especial deste contrato — é o exemplo canônico do que "estado canônico obrigatório" (§4.1) já exige: `calcular_preco_produto` resolve `tipo` (`VAREJO`/`ATACADO`), preço e qualquer regra de elegibilidade (ex.: quantidade mínima) **antes** do dado chegar a qualquer resposta consumida pelo frontend. Nenhuma RPC deste domínio pode devolver um preço "provisório" que dependa de o cliente aplicar uma regra de atacado por conta própria depois.

Consequência direta para qualquer restrição de ação ligada a atacado (ex.: um teto de desconto de gerente diferente para itens de atacado, se essa regra existir ou vier a existir): o cálculo de elegibilidade entra na RPC que produz `allowedActions`/`primaryAction.enabled` (Fase 0, §5), com `error_code` estruturado (formato desta seção) se um comando for tentado fora da regra. Isso não é uma exceção ao contrato de erro — é a aplicação normal dele. Não há, e não deve haver, uma segunda cópia dessa regra em TypeScript client-side "para validar mais rápido" — se a latência de round-trip for um problema real de UX, a correção é otimizar a RPC (cache, índice, etc.), não duplicar a regra de negócio no cliente.
- Sufixos dinâmicos hoje interpolados no código (`FINALIZAR_VENDA_CANONICA_ESTOQUE:<mensagem>`, `..._PRECO_DIVERGENTE:<uuid>`) migram para `detail`, mantendo o `error_code` como string fixa e comparável por igualdade exata.
- `obter_status_caixa_operador` migra a frase livre de `mensagem_operador` (caso `ERRO`) para um `error_code` fixo (ex.: `CAIXA_STATUS_SESSAO_EXPIRADA`, `CAIXA_STATUS_INDISPONIVEL`), preservando a mensagem amigável no campo `message`.
- As três convenções concorrentes fora do domínio de venda (`permissao_negada` lowercase, `funcao: frase livre`) ficam fora do escopo imediato desta fase (não fazem parte do `PDVSaleState`), mas ficam registradas como o mesmo problema estrutural, para não serem tratadas como precedente ao implementar o contrato-alvo no domínio de venda.

---

## 5. O que este documento explicitamente não decide nem faz

1. **Não escreve nem aplica nenhuma migration.** Todo achado da §2 é diagnóstico; toda regra da §4 é contrato-alvo, não implementação.
2. **Não decide a política de idempotência de `validar-gerente`** (reaproveitar token vs. sempre emitir novo) — é uma decisão de segurança que precisa de dono explícito antes de virar código.
3. **Não normaliza o vocabulário de erro fora do domínio de venda** (dashboards, `decrementar_estoque` legado) — mencionado por severidade comparativa (§2.10), não como entregável desta fase.
4. **Não implementa RPC de abertura de caixa** para fechar o gap TOCTOU (§2.1) — só documenta que o gap existe e qual constraint resolveria (índice único parcial).
5. **Não altera a spec da Fase 0** (`PDV_FASE3_STATE_MACHINE_SPEC.md`) — este documento a usa como régua, não a modifica.

Critério de conclusão real da Fase 1 (a ser avaliado só depois que a implementação decorrente deste contrato existir, não neste documento): qualquer fluxo de PDV pode ser reconstruído apenas pelos responses do backend; não existe estado necessário no frontend que não venha do backend; replay de eventos gera o mesmo estado final. Este documento é o diagnóstico e o contrato que tornam esse critério verificável — ele próprio não o satisfaz ainda, porque nenhum código mudou.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-07-02 | Rascunho inicial — auditoria das RPCs/wrappers reais do PDV contra o contrato da Fase 0 + definição do contrato-alvo da Fase 1. Sem migrations nesta rodada (decisão explícita: spec agora, implementação depois). |
