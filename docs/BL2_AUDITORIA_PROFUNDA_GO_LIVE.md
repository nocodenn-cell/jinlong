# Auditoria Técnica Profunda — Prontidão do Backend Jinlong para Go-Live
**Data**: 2026-07-25
**Ambiente auditado**: `kbabmewnahysfvlybiak`
**Autor**: Claude (claude-sonnet-5)
**Escopo**: Auditoria 1 (system_alerts/venda_finance_context), Auditoria 2 (objetos órfãos), Auditoria 3 (módulo fiscal)
**Natureza**: Investigação pura — **nenhuma alteração foi feita no banco ou no código nesta rodada**

---

## 1. Resumo Executivo

O backend está funcionalmente sólido no núcleo de PDV (venda, caixa, estoque, descontos BL-1, promoções BL-2) — todas as validações anteriores confirmaram isso com evidência real. Esta auditoria aprofundada, porém, encontrou **um bloqueador real de go-live**: o módulo fiscal está em estado de **mock/stub deliberado e documentado pelo próprio projeto**, sem emissão real, sem armazenamento de XML/DANFE, sem cancelamento fiscal funcional, sem carta de correção, sem inutilização, e — achado novo desta rodada — **sem a própria proteção de máquina de estados que impediria updates de status fiscal fora de ordem**.

Os outros dois eixos (system_alerts/venda_finance_context e objetos órfãos) são **achados reais, mas não bloqueantes** — degradação de uma feature de auditoria visual (não crítica) e uma coleção de objetos de schema não versionados que representam risco de governança, não risco funcional imediato.

**Resposta direta à pergunta do usuário**: o backend **não está pronto para go-live com emissão fiscal real**. Está pronto para operar em regime de contingência/manual se essa for uma decisão de negócio aceita conscientemente (ver §9). Nenhum outro achado desta auditoria bloqueia o go-live do núcleo PDV.

---

## 2. Auditoria 1 — `system_alerts` e `venda_finance_context`

### 2.1 `system_alerts` (migration 236)

| Pergunta | Resposta com Evidência |
|---|---|
| **1. Deveria existir?** | Sim — é uma das 5 fontes de dados oficiais e documentadas do painel `/admin/auditoria` ("Auditoria Visual", Fase 2 · item 1). |
| **2. Foi removida?** | Não há evidência de remoção — nunca chegou a ser criada neste ambiente. |
| **3. Nunca chegou a ser criada?** | Confirmado: `pg_proc`/`pg_trigger` não têm `registrar_system_alert`, `trg_detectar_anomalia_item_venda`, `trg_detectar_anomalia_estoque`. Tabela `system_alerts` ausente de `information_schema.tables`. |
| **4. Faz parte de migration não executada?** | Sim — migration `236_system_alerts_log_leve.sql` existe no repositório, criada no mesmo commit (`6258368`, 2026-07-10) que renumerou 235→252 por colisão. O cabeçalho da migration 252 (colidente na época) contém a confissão explícita do próprio time: *"Confirmado com o usuário via `npx supabase migration list` contra produção: nem esta migration nem sua colidente tinham entrada em Remote antes desta mudança."* — ou seja, já era sabido, à época, que essas migrations não estavam aplicadas. |
| **5. Algum código ainda depende?** | **Sim, diretamente.** `pdv-importados/app/admin/auditoria/actions.ts` (linha 267-299) faz `SELECT` em `system_alerts` como uma das 5 fontes da timeline de auditoria. O código é defensivo: `const rows = error ? [] : (data ?? [])` — se a tabela não existir, a query falha silenciosamente e a seção "ALERTA" da timeline fica sempre vazia, sem erro visível ao usuário. O comentário do próprio código já antecipa isso: *"Resiliência: uma fonte indisponível (ex.: ledger ainda não migrado neste ambiente) é ignorada."* |
| **6. Existe documentação desatualizada?** | Sim. `page.tsx` (linha 4-6) descreve `system_alerts` como um dos ledgers "que JÁ existem" — falso para este ambiente. |
| **7. Representa risco para produção?** | 🟡 **Médio** — não quebra nenhum fluxo de venda/caixa/estoque (o alerta é só observabilidade, não bloqueante por design), mas o admin que abrir `/admin/auditoria` verá a seção de alertas **sempre vazia sem nenhum aviso**, podendo interpretar erroneamente que "não há anomalias" quando na verdade a feature não está instalada. |

**Causa raiz**: migration escrita e commitada, mas nunca aplicada a este ambiente específico durante o processo (não documentado no repositório) que estabeleceu o baseline de schema deste projeto Supabase. É um gap de **execução de deploy**, não de código — o código da migration está correto e pronto.

**Impacto**: funcional, mas isolado à tela de auditoria visual do admin — não afeta venda, caixa, estoque, fiscal ou financeiro.

**Recomendação**: aplicar a migration 236 (validada antes contra ausência de conflitos, já que os objetos-alvo — tabela nova, triggers novos — não colidem com nada existente) **antes do go-live**, se a tela de Auditoria Visual for considerada parte do contrato de entrega do piloto. Caso contrário, no mínimo atualizar o comentário do código para não afirmar que a fonte "já existe".

### 2.2 `venda_finance_context` (migration 252)

| Pergunta | Resposta com Evidência |
|---|---|
| **1. Deveria existir?** | Discutível — é um mirror passivo, a própria migration declara: *"Não é fonte de verdade — caixa (liquidez) e contas_receber (financeiro) permanecem autoridades."* Não é um requisito funcional per se, é uma conveniência de leitura que nunca foi conectada a nenhuma tela. |
| **2. Foi removida?** | Não — nunca foi criada aqui. |
| **3. Nunca chegou a ser criada?** | Confirmado, mesma evidência do item 236 (mesmo commit, mesma confissão no cabeçalho). |
| **4. Faz parte de migration não executada?** | Sim, `252_venda_finance_context_mirror.sql`. |
| **5. Algum código ainda depende?** | **Não.** Busca exaustiva (`grep -rn "venda_finance_context"` em `pdv-importados`, `pdv-local`, `shared-core`, `shared`) retornou **zero ocorrências de uso real** — só aparece em `database.types.ts` (arquivo auto-gerado de tipos, não é "uso"). |
| **6. Existe documentação desatualizada?** | Sim, mas de baixo impacto: comentários nas migrations 268/272/274 ("PASSO 7: já feito via trigger em migration 252") descrevem um comportamento que não existe neste ambiente. Como nada lê essa tabela, a "mentira" do comentário não tem efeito observável. |
| **7. Representa risco para produção?** | 🟢 **Baixo** — zero consumidor, zero impacto funcional comprovado. É puramente um item de dívida técnica/documentação. |

**Causa raiz**: idêntica à de `system_alerts` — migration não aplicada neste ambiente durante o setup do baseline.

**Impacto**: nenhum observável hoje. Risco é de natureza documental (comentários desatualizados), não funcional.

**Recomendação**: decisão de produto, não de engenharia — decidir formalmente entre (a) aplicar a migration e conectar a alguma tela futura, ou (b) descontinuar formalmente e remover a migration do histórico de "pendências". Não bloqueia go-live em nenhum cenário.

---

## 3. Auditoria 2 — Objetos Órfãos (Varredura com Evidência)

Metodologia: cruzamento de `information_schema`/`pg_catalog` (schema real) contra `grep` exaustivo de todo o repositório local (migrations + código de aplicação). Cada item abaixo tem evidência de ausência de referência, não suposição.

### 3.1 Tabelas e Funções Sem Rastro em Nenhuma Migration Local

| Objeto | Tipo | Evidência de Ausência de Origem | Quem Referencia | Classificação | Risco de Remoção |
|---|---|---|---|---|---|
| `venda_engine_shadow_runs` | Tabela | `grep -rl "venda_engine_shadow_runs" backend/supabase/migrations/*.sql` → 0 resultados | Nenhum código de aplicação (`grep` em `pdv-importados`/`pdv-local`/`shared-core` → 0) | **INVESTIGAR** | Desconhecido — não há como provar que nada mais escreve nela sem acesso a logs de aplicação/CI fora do repositório |
| `shadow_validar_venda_engine_v4` | Função | Mesma busca, 0 resultados | Nenhum | **INVESTIGAR** | Idem |
| `baixar_estoque_venda` | Função | 0 resultados em migrations locais | Nenhum código de aplicação encontrado | **INVESTIGAR** | Baixo pela ausência de referência, mas não comprovado — pode ser chamada por um processo externo (script operacional, cron manual) não versionado |
| `caixa_integridade_gate_check` | Função | 0 resultados | Nenhum | **INVESTIGAR** | Idem |
| `listar_valores_sistema_dinheiro_caixas` | Função | 0 resultados | Nenhum | **INVESTIGAR** | Idem |
| `perfis` | Tabela | 0 ocorrências de `CREATE TABLE public.perfis` em qualquer migration; a tabela **é referenciada** em 6 migrations (provavelmente predicados de RLS de outras tabelas) | Referenciada indiretamente por RLS de outras tabelas — não confirmado se é lida por código de aplicação | **INVESTIGAR** | Alto se removida sem confirmar — pode ser dependência de RLS ativa mesmo sem CREATE TABLE rastreável |

**Nota metodológica importante**: não classifiquei nenhum destes como "REMOVER", porque a ausência de referência no repositório **não é prova suficiente de que nada os usa em produção** — poderiam ser escritos/lidos por: scripts operacionais fora do repo, chamadas diretas via SQL Editor do Supabase Dashboard, ou uma integração externa não documentada. A tabela `venda_engine_shadow_runs` + a função `shadow_validar_venda_engine_v4` sugerem fortemente um experimento de "shadow testing" de um motor de vendas alternativo aplicado diretamente ao banco — mas isso é inferência, não prova. **Recomendo que a equipe confirme com quem tem contexto institucional antes de qualquer remoção.**

### 3.2 RPCs Legadas Comprovadamente Mortas (Evidência Completa)

| Objeto | Evidência de Ausência de Chamada | Evidência de Que Já Foi Substituída | Classificação | Risco de Remoção |
|---|---|---|---|---|
| `finalizar_venda_transacional_canonica_v2` | `grep -rn "finalizar_venda_transacional_canonica_v2"` em todo código de aplicação → **0 chamadas reais**; única ocorrência é em `database.types.ts` (gerado) e em `mensagemErroUsuario.test.ts:20`, onde o teste **espera a mensagem de erro "Could not find the function"** — ou seja, o próprio teste unitário do projeto assume que a função não deveria ser encontrada | `finalizar_venda_transacional_canonica_v4` é a única chamada por `caixaVendas.impl.ts` (frontend real) | **REMOVER** (ou, no mínimo, `REVOKE EXECUTE`) | Baixo — nenhuma chamada real depende dela |
| `finalizar_venda_transacional_canonica_v3` | Idêntico ao v2 | Idem | **REMOVER** (ou `REVOKE EXECUTE`) | Baixo |

**Porém — risco real de MANTER, não de remover**: ambas ainda têm `EXECUTE` concedido a `anon`, `authenticated` e `PUBLIC` no banco real (confirmado por `information_schema.routine_privileges`). Isso **contradiz diretamente** a documentação do projeto (`Jinlong/02_ESTADO_ATUAL.md`, linha 112: *"RPCs v2/v3 acessíveis | ✅ Bloqueadas"*, datado 2026-07-10). Verifiquei via SQL real, duas vezes, nesta sessão: **não estão bloqueadas**. Isso é uma discrepância direta entre documentação e realidade, e um vetor de bypass real do fluxo de auditoria/validação de preço que a v4 (BL-1/BL-2) implementa — qualquer chamada direta a essas RPCs antigas (via client Supabase com a anon key, por exemplo) ainda seria aceita pelo banco.

### 3.3 Grants Excessivos (Hygiene, Não Crítico)

| Objeto | Achado | Severidade |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4` | `EXECUTE` concedido a `PUBLIC` (além de `anon`/`authenticated`, que já bastariam) | 🟢 Baixa — mitigado por check interno (`v_uid IS NULL` rejeita chamador não autenticado) |
| `calcular_promocao_aplicavel` | Mesmo padrão | 🟢 Baixa — função read-only, sem efeito colateral |

### 3.4 Migrations Parcialmente Substituídas — Um Caso Limpo Encontrado

| Migration Original | Substituta | Evidência |
|---|---|---|
| `240_relatorio_previsao_estoque.sql` (função `relatorio_previsao_estoque`) | `242_relatorio_cobertura_estoque_reclassificacao.sql` (função `relatorio_cobertura_estoque`) | Migration 242 faz `DROP FUNCTION public.relatorio_previsao_estoque(...)` explícito, com justificativa documentada no cabeçalho (reclassificação semântica: indicador não pode ser chamado de "previsão"). Confirmado no banco: só `relatorio_cobertura_estoque` existe. |

**Classificação**: **MANTER como está** — não é drift, é evolução deliberada e limpa. Nenhuma ação necessária.

### 3.5 Funções Fiscais Parcialmente Ausentes — Achado Elevado Nesta Rodada

| Objeto | Origem | Status Remoto |
|---|---|---|
| `tg_documentos_fiscais_estado_bi` / `tg_documentos_fiscais_estado_bu` + triggers `tr_documentos_fiscais_estado_bi/bu` | Migration `092_fiscal_state_machine.sql` | **Ausentes** (confirmado via `pg_proc`/`pg_trigger`) |
| `tg_documentos_fiscais_eventos_bi_correlation` | Migration `091_fiscal_correlation_id.sql` | Ausente |

Isto é tratado com a devida gravidade na Auditoria 3 (§4.6), porque não é "só" um objeto órfão — é a **ausência da própria proteção de integridade de estado** do módulo fiscal.

### 3.6 Itens Não Verificáveis com as Ferramentas Disponíveis (Limitações Metodológicas Declaradas)

Para não fabricar conclusões sem base, declaro explicitamente o que **não pude comprovar** nesta auditoria:

- **Índices nunca utilizados**: `pg_stat_user_indexes` mostrou `idx_scan = 0` para **praticamente todos os índices não-PK do banco** (dezenas). Isso **não é evidência de índice inútil** — este ambiente tem apenas 56 vendas registradas e volume de tráfego mínimo; o planner do Postgres nem precisa considerar a maioria dos índices com esse volume de dados. Concluir "remover" a partir dessa métrica, neste ambiente, seria exatamente o tipo de suposição que foi pedido para não fazer. **Não classifiquei nenhum índice como candidato à remoção.**
- **Policies não utilizadas**: Postgres não expõe estatística nativa de "hit" por policy de RLS sem instrumentação adicional (`pg_stat_statements` não distingue por policy). Não verificável com as ferramentas desta sessão.
- **CHECKs redundantes**: revisão manual das tabelas core (descontos_venda, itens_venda, regras_preco, pdv_config, tokens_desconto_gerente) não encontrou nenhum CHECK duplicado ou redundante — todos têm propósito distinto e comprovado nas migrations de origem.
- **ENUMs mortos**: apenas 2 tipos ENUM existem no schema (`categoria_financeira_tipo`, `motivo_desconto_enum_tipo`) — ambos com uso ativo confirmado (contas a pagar/receber e BL-1, respectivamente). **Nenhum ENUM órfão encontrado.**

---

## 4. Auditoria 3 — Módulo Fiscal

### 4.1 Nota Sobre o "Documento Funcional" Citado

Busquei exaustivamente por um documento formal que especifique os requisitos citados na solicitação (NFC-e/NF-e, XML/DANFE, consulta SEFAZ, cancelamento, carta de correção, inutilização, reenvio, auditoria completa) — termos como "carta de correção", "inutilização" e "CCe" **não aparecem em nenhum arquivo do repositório** (`docs/`, `Jinlong/`, código). **Não encontrei esse documento commitado no repositório que tenho acesso.** Trato os itens citados como os requisitos padrão e universalmente conhecidos da legislação fiscal brasileira para NFC-e/NF-e (SEFAZ, SPED), já que são consistentes com o domínio do produto (PDV varejo no Brasil), e avalio a implementação contra eles. Se existe um documento funcional formal fora deste repositório, recomendo que seja anexado para uma comparação linha-a-linha mais precisa.

### 4.2 Estado Documentado pelo Próprio Projeto (Evidência Primária)

`Jinlong/02_ESTADO_ATUAL.md` (snapshot de 2026-07-10, mas ainda o documento de estado mais recente encontrado) já classifica o módulo:

- Home.md linha 38: **"Fiscal NFC-e | 🟡 Mock/stub"**
- 02_ESTADO_ATUAL.md linha 58: **"NFC-e Focus real | TODO em `fiscal-provider-adapter.ts` | P2 (congelado)"**
- linha 59: **"Bling adapter fiscal | TODO explícito no código | P2 (congelado)"**
- linha 75 (Feature Freeze): **"NFC-e Focus real | Sem checklist Focus completo"**

Ou seja: **o próprio projeto já sabia e documentou** que o módulo fiscal é um stub congelado (P2) antes desta auditoria. Isto não é uma surpresa nova — é uma confirmação com evidência de código de um estado já conhecido pela equipe.

### 4.3 Arquitetura de Providers (Evidência de Código)

`backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts` implementa 4 providers:

| Provider | Implementação | Realismo |
|---|---|---|
| `MockProvider` | Gera `chave_fiscal` e `protocolo` **fictícios** (`NFE-MOCK-{...}`, `PROTO-{...}`) | ❌ Simulação pura, não é emissão real |
| `HttpProvider` | Encaminha para uma URL HTTP genérica configurável, espera resposta JSON com `chave_fiscal`/`protocolo` | ⚠️ Depende inteiramente de um backend externo não especificado/documentado |
| `FocusProvider` | Integração real com a API do Focus NFe (autenticação Basic, parsing de chave/protocolo, tratamento de erro HTTP) — é um SaaS intermediário que se conecta à SEFAZ, não conexão direta | ⚠️ Implementação de código mais completa, mas o próprio projeto a classifica como "TODO"/"sem checklist completo" — não validada em produção |
| `BlingProvider` | Literalmente delega para `HttpProvider` — comentário no código: `// TODO: Implementar integração específica com Bling` | ❌ Placeholder, não implementado |

**Provider padrão**: `Deno.env.get("FISCAL_PROVIDER_TYPE") ?? "mock"` — **sem configuração explícita de variável de ambiente, o sistema usa o Mock Provider.** Não tive acesso para confirmar se `FISCAL_PROVIDER_TYPE` está configurado como secret na Edge Function deste projeto (ferramentas desta sessão não expõem segredos de Edge Functions) — **este é um item que precisa ser confirmado manualmente pela equipe antes do go-live.**

### 4.4 Estrutura de Dados — Ausência Confirmada de Armazenamento de XML/DANFE

```sql
-- Colunas reais de documentos_fiscais_pendentes:
id, venda_id, tipo_doc, status, payload (jsonb), ultimo_erro, created_at, updated_at,
tentativas, proxima_tentativa_em, ultima_tentativa_em, provider, provider_ref,
chave_fiscal, protocolo, processado_em, fiscal_error_code, fiscal_error_category,
fiscal_action_hint, fiscal_retryable, fiscal_next_step_url, fiscal_error_payload, deleted_at
```

**Não existe nenhuma coluna** para armazenar o XML assinado do documento fiscal, nem link/referência a um DANFE gerado. Confirmado também por busca de código: `grep -i "xml\|danfe"` em todos os arquivos de `fiscal-worker/` → **0 ocorrências**. A tabela guarda apenas metadados (chave de acesso, protocolo, status) — o documento fiscal em si (XML) **nunca é persistido em lugar nenhum do sistema**, nem localmente nem em storage externo.

### 4.5 Funcionalidades Específicas — Busca Exaustiva

| Funcionalidade | Busca Realizada | Resultado |
|---|---|---|
| **Cancelamento fiscal (chamada real ao provider/SEFAZ)** | Funções RPC existentes: `fiscal_claim_documentos`, `fiscal_enfileirar_documento_venda`, `fiscal_marcar_emitido`, `fiscal_marcar_erro`, `fiscal_marcar_erro_normalizado`, `fiscal_reprocessar_documento` | **Nenhuma função de cancelamento fiscal existe.** A máquina de estados (migration 092, quando aplicada) *permite* a transição `EMITIDO→CANCELADO` no schema, mas não há nenhuma RPC que orquestre a chamada real ao provider para cancelar um documento já emitido dentro do prazo legal. |
| **Carta de Correção Eletrônica (CCe)** | `grep -rli "carta.*correc\|\bcce\b"` em migrations + fiscal-worker | **Zero ocorrências.** Inexistente, não parcial. |
| **Inutilização de numeração** | `grep -rli "inutiliza"` | **Zero ocorrências.** Inexistente. |
| **Contingência (offline SEFAZ)** | `grep -rli "conting"` | **Zero ocorrências.** Inexistente. |
| **Reenvio/retry de emissão** | Colunas `tentativas`, `proxima_tentativa_em`, `ultima_tentativa_em`, função `fiscal_reprocessar_documento` | ✅ **Implementado** — há um mecanismo real de retry com backoff (migration 093: "backoff quadrático") para falhas de *emissão*. Isto é diferente de "consulta de status pós-emissão bem-sucedida" (não encontrado). |
| **Consulta de status SEFAZ** (pós-emissão, para documentos "em processamento" há muito tempo) | Nenhuma função de polling/consulta ativa encontrada | **Inexistente.** O fluxo assume resposta síncrona do provider (sucesso ou erro imediato); não há reconciliação para o caso em que a SEFAZ demora ou o processamento fica pendente indefinidamente. |
| **Máquina de estados / integridade de transição** | Migration 092 define os triggers; **ausentes neste ambiente** (§3.5) | 🔴 **Parcialmente implementado no código, mas inativo neste ambiente** — `documentos_fiscais_pendentes.status` pode ser atualizado para qualquer valor sem validação de transição, incluindo potencialmente pular de `PENDENTE` direto para `EMITIDO` sem passar por `EM_PROCESSAMENTO`, ou reverter um `CANCELADO`. |
| **Rastreabilidade/auditoria de eventos fiscais** | Tabela `documentos_fiscais_eventos` existe (migração early), com `tg_documentos_fiscais_eventos_ai/au` confirmados **presentes** no banco | ✅ **Parcialmente implementado** — há trilha de eventos para inserções/updates, mas sem o guard de transição de estado (092) para garantir que só transições válidas cheguem a essa trilha. |

### 4.6 Classificação Final por Item (Conforme Solicitado)

| Item | Classificação | Evidência-Chave |
|---|---|---|
| Emissão NFC-e/NF-e real | **Inexistente** (em qualquer ambiente sem `FISCAL_PROVIDER_TYPE` configurado explicitamente) | Default `mock`; FocusProvider é a única via real, mas documentado como não validado |
| Armazenamento de XML | **Inexistente** | Zero colunas, zero código |
| Armazenamento/geração de DANFE | **Inexistente** | Zero colunas, zero código |
| Consulta de status SEFAZ | **Inexistente** | Zero função de polling encontrada |
| Cancelamento fiscal | **Parcialmente implementado** | Schema permite a transição (quando o guard existe), mas nenhuma RPC orquestra o cancelamento real |
| Carta de Correção (CCe) | **Inexistente** | Zero ocorrência em todo o código |
| Inutilização de numeração | **Inexistente** | Zero ocorrência em todo o código |
| Reenvio/retry de emissão | **Implementado** | Backoff quadrático real, RPC `fiscal_reprocessar_documento` |
| Máquina de estados / integridade | **Implementado no código, mas inativo neste ambiente** | Migration 092 correta; triggers ausentes no banco real |
| Auditoria/rastreabilidade de eventos fiscais | **Parcialmente implementado** | Trilha de eventos existe; guard de integridade de transição não |
| Documentação funcional formal do módulo fiscal | **Documentação inconsistente/ausente** | Não encontrado documento com os requisitos citados; `02_ESTADO_ATUAL.md` já reconhece o módulo como stub |

---

## 5. Achados Críticos (Bloqueiam Go-Live com Emissão Fiscal Real)

1. **Emissão fiscal real inexistente por padrão** — sem configuração explícita de provider, todo documento fiscal emitido é uma simulação (`MockProvider`), com chave e protocolo fictícios que não têm validade legal alguma perante a SEFAZ.
2. **Ausência total de armazenamento de XML/DANFE** — mesmo que a emissão real fosse ativada (via Focus), o sistema hoje não guarda o documento fiscal assinado nem gera/armazena o DANFE para entrega ao cliente. Isso é uma obrigação legal básica de qualquer emissor fiscal brasileiro.
3. **Cancelamento fiscal, carta de correção e inutilização inexistentes** — são obrigações operacionais do dia a dia de qualquer PDV fiscal (erros de digitação acontecem, vendas são canceladas). Sem essas funcionalidades, qualquer erro pós-emissão não tem caminho de correção formal perante a SEFAZ.
4. **Máquina de estados fiscal inativa neste ambiente** — mesmo o código já escrito (migration 092) para impedir transições de status inválidas não está protegendo este banco. Combinado com o item 3, um documento `EMITIDO` poderia ter seu status alterado livremente sem nenhuma trilha de legitimidade.

## 6. Achados Importantes (Degradam ou Geram Risco, Não Bloqueiam Núcleo PDV)

5. **RPCs legadas v2/v3 ainda acessíveis** (`anon`/`authenticated`/`PUBLIC`), contradizendo a documentação do projeto que afirma estarem bloqueadas — verificado com SQL real duas vezes nesta sessão. Recomendo `REVOKE EXECUTE` como ação de baixo risco e alta redução de superfície de ataque.
6. **`system_alerts` ausente** — feature de auditoria visual degradada silenciosamente (seção "ALERTA" sempre vazia, sem aviso ao usuário).
7. **Objetos órfãos não versionados** (`venda_engine_shadow_runs`, `shadow_validar_venda_engine_v4`, `baixar_estoque_venda`, `caixa_integridade_gate_check`, `listar_valores_sistema_dinheiro_caixas`, `perfis`) — risco de governança: existe um canal de mudança de schema fora do controle de versão, o que por si só é uma prática de risco independente do conteúdo específico desses objetos.

## 7. Achados Informativos (Sem Ação Necessária ou Fora de Escopo de Engenharia)

8. `venda_finance_context` ausente — zero consumidor, decisão de produto (manter no roadmap ou descontinuar formalmente).
9. Migration 240→242 (relatório de estoque) — evolução limpa e documentada, nenhuma ação necessária.
10. `EXECUTE` a `PUBLIC` em 2 RPCs do BL-2 — hygiene menor, mitigado por check interno.
11. Índices com `idx_scan=0` — não conclusivo neste ambiente de baixo volume; não recomendo remoção sem medição em produção real.

---

## 8. Plano Priorizado Antes do Go-Live

| # | Ação | Prioridade | Esforço Estimado | Owner Sugerido |
|---|---|---|---|---|
| 1 | Decisão de negócio: o piloto vai operar com **emissão fiscal real (Focus)** ou em **regime manual/contingência** no D0? | 🔴 P0 — decisão bloqueante | Decisão, não código | Produto/Negócio |
| 2 | Se emissão real: configurar `FISCAL_PROVIDER_TYPE=focus` + credenciais, e validar o checklist Focus completo (hoje inexistente) | 🔴 P0 se item 1 = real | Alto (dias) | Backend + Fiscal/Contábil |
| 3 | Implementar armazenamento de XML assinado + geração/armazenamento de DANFE | 🔴 P0 se item 1 = real | Alto (dias) | Backend |
| 4 | Implementar cancelamento fiscal real (RPC + chamada ao provider) | 🔴 P0 se item 1 = real | Médio-Alto | Backend |
| 5 | Aplicar migration 092 (máquina de estados fiscal) neste ambiente — protege contra corrupção de estado independente da decisão do item 1 | 🟠 P1 | Baixo (migration já escrita) | Backend |
| 6 | `REVOKE EXECUTE` de `finalizar_venda_transacional_canonica_v2/v3` de `anon`/`authenticated`/`PUBLIC` | 🟠 P1 | Baixo | Backend |
| 7 | Corrigir `Jinlong/02_ESTADO_ATUAL.md` (afirmação incorreta sobre v2/v3 bloqueadas) | 🟠 P1 | Trivial | Qualquer um |
| 8 | Decidir sobre `system_alerts`: aplicar migration 236 ou ajustar UI para não sugerir dado ausente como "sem alertas" | 🟡 P2 | Baixo | Backend |
| 9 | Investigar objetos órfãos com a equipe (confirmar uso real ou remover com segurança) | 🟡 P2 | Baixo (investigação) | Backend + quem tem contexto histórico |
| 10 | Carta de correção e inutilização de numeração | 🟡 P2 — pode ser pós-D0 se volume de correções esperado for baixo no piloto inicial | Alto | Backend + Fiscal/Contábil |
| 11 | Consulta de status SEFAZ / reconciliação de pendências antigas | 🟢 P3 | Médio | Backend |
| 12 | `venda_finance_context`: decidir manter ou descontinuar | 🟢 P3 | Trivial (decisão) | Produto |

---

## 9. Itens Realmente Bloqueantes vs. Itens Aceitáveis Pós-Go-Live

### 🔴 Bloqueantes (se o objetivo é emissão fiscal real desde o D0)

- Emissão fiscal real configurada e validada (item 2)
- Armazenamento de XML/DANFE (item 3)
- Cancelamento fiscal funcional (item 4)

### 🟠 Fortemente recomendado antes do D0 (risco baixo de esforço, alto retorno)

- Máquina de estados fiscal ativa (item 5) — é só aplicar uma migration já escrita
- Revogar acesso às RPCs v2/v3 (item 6) — trivial, fecha uma superfície de bypass real
- Corrigir a documentação incorreta (item 7)

### 🟢 Aceitável para pós-go-live (não bloqueia operação do núcleo PDV)

- `system_alerts` (feature de conveniência, não crítica)
- Carta de correção / inutilização (se o volume de erro fiscal esperado no piloto inicial for baixo e houver processo manual de contingência combinado com o cliente)
- Consulta de status SEFAZ / reconciliação (pode ser feito manualmente no início)
- Investigação de objetos órfãos (governança, não urgência operacional)
- `venda_finance_context` (zero impacto)

### A Decisão Central Que Só o Negócio Pode Tomar

**O backend do núcleo PDV (venda, caixa, estoque, descontos, promoções) está pronto para go-live.** O módulo fiscal **não está pronto para emissão fiscal real automática**. A pergunta que decide se isso é um bloqueio de go-live ou não é: **o piloto vai operar com emissão fiscal formal desde o primeiro dia, ou existe um acordo operacional (manual/contingência/terceirizado) para o período inicial?** Essa é uma decisão de negócio/compliance, não uma decisão técnica, e o próprio projeto já a havia sinalizado como "P2 congelado" antes desta auditoria — o achado novo aqui é a confirmação com evidência de código de que essa decisão *ainda* precisa ser tomada e comunicada explicitamente antes do go-live, não presumida.

---

**Data**: 2026-07-25
**Autor**: Claude (claude-sonnet-5)
**Status**: Investigação concluída — nenhuma alteração de código/schema realizada nesta rodada, conforme solicitado
