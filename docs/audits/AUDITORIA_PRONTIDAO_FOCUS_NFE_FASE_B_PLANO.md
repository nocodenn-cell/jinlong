# Prontidão Focus NFe — Fase B: Plano Mínimo (fechamento)

**Data:** 2026-09-02
**Base:** [Fase A — Inventário (fechamento)](./AUDITORIA_PRONTIDAO_FOCUS_NFE_FASE_A.md)
**Fonte do contrato Focus:** documentação oficial colada pelo usuário nesta conversa (autenticação, ambientes, referência, emissão/consulta/cancelamento NFC-e e NF-e, CC-e, empresas). `WebFetch`/`WebSearch` falharam por erro de infraestrutura nesta sessão (5 tentativas) — nenhuma informação de contrato abaixo vem de suposição; onde o material fornecido não detalhava algo, isso é marcado explicitamente como não confirmado, não preenchido por inferência.
**Status:** plano para aprovação. Nada foi implementado, nenhuma migration criada, nenhum commit, nenhuma alteração de banco, nenhum documento fiscal emitido.

---

## 1. ARQUITETURA FINAL PROPOSTA

```
Venda (RPC finalizar_venda_transacional_canonica_v4, transação única)
  │
  ├─ itens_venda (snapshot de preço/desconto — já existe, imutável)
  │
  └─ PASSO 9 (mesma transação): monta payload fiscal a partir de
     itens_venda ⋈ produtos (ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins)
     ⋈ lojas/caixas (dados do emitente)
     → INSERT documentos_fiscais_pendentes (status=PENDENTE, payload=<congelado>)
        │
        │  [congelamento ocorre AQUI — ponto único, dentro da transação da venda.
        │   Depois deste INSERT, nada mais volta a ler produtos/lojas/pdv_config
        │   para este documento. O worker só lê documentos_fiscais_pendentes.payload.]
        │
        ▼
  fiscal-worker (Edge Function, service_role)
     fiscal_claim_documentos() → FOR UPDATE SKIP LOCKED
        │
        ▼
     resolve credencial: loja_id (via venda→caixa) → fiscal_provider_config
        → nome do secret (Vault/Edge secret) → token da empresa Focus
        │
        ▼
     FiscalProvider.callProvider(doc, config)
        │
        ├─ NFC_E / NFCE → FocusProvider.emitirNfce()
        │     POST /v2/nfce?ref={documento_id}   [SÍNCRONO — Focus confirma]
        │     200/201 → autorizada OU rejeitada na mesma resposta
        │     → fiscal_marcar_emitido | fiscal_marcar_erro_normalizado
        │
        └─ NFE → FocusProvider.emitirNfe()
              POST /v2/nfe?ref={documento_id}
              201 → autorizada (mesmo fluxo do NFC-e)
              202 → EM_PROCESSAMENTO (já é um status existente — não é erro)
                 → reconciliação (ver abaixo) resolve depois
        │
        ▼ (quando autorizado, qualquer tipo)
     obter XML (GET consulta) → Supabase Storage → registra path/hash em
     documentos_fiscais_pendentes
        │
        ▼
     documentos_fiscais_eventos (timeline, já existe) — auditoria automática
        por trigger (ENFILEIRADO/CLAIM/EMITIDO/ERRO/CANCELADO já cobrem tudo
        acima sem precisar de tipo de evento novo)

  Reconciliação (mecanismo NOVO, independente de webhook):
     documento em PENDENTE/EM_PROCESSAMENTO além de um limiar, OU erro
     transitório antes de novo retry
        → GET /v2/{nfce|nfe}/{referencia}   [autoridade remota]
        → aplica transição via fiscal_marcar_emitido/fiscal_marcar_erro
           (mesmas RPCs já existentes)

  Webhook (P1 — otimização, não autoridade):
     Focus → POST no nosso endpoint → valida estrutura → localiza documento
        por referência → CONSULTA a Focus server-to-server (nunca confia
        cegamente no corpo do webhook) → aplica a MESMA transição idempotente
        acima → responde 200
     Se o webhook nunca chegar, a reconciliação por consulta (acima) já
     resolve o estado sozinha — por isso webhook não é P0.
```

**Por que isso não quebra nada existente:** a máquina de estados (`PENDENTE→EM_PROCESSAMENTO→EMITIDO/ERRO/CANCELADO`) já cobre exatamente os dois formatos de resposta do Focus (NFC-e sempre síncrono = `PENDENTE→EMITIDO` ou `PENDENTE→ERRO` direto; NF-e 202 = `PENDENTE→EM_PROCESSAMENTO`, resolvido depois pela reconciliação). Nenhum estado novo é necessário.

---

## 2. CONTRATO FOCUS CONFIRMADO

Fonte: material colado pelo usuário nesta conversa. Células marcadas "não detalhado no material" não foram preenchidas por suposição.

| Capacidade | Endpoint | Método | Request (campos confirmados) | Response | Autenticação | Referência | Observação |
|---|---|---|---|---|---|---|---|
| Emitir NFC-e | `/v2/nfce?ref={referencia}` | POST | `cnpj_emitente`, `data_emissao`, `modalidade_frete`, `local_destino`, `presenca_comprador`, `natureza_operacao`, destinatário (se aplicável), `items[]`, `formas_pagamento[]`; opcional `forma_emissao=offline` p/ contingência (`numero`, `serie`, `codigo_unico`) | Mesmo formato da consulta; autorizada OU rejeitada na **mesma resposta** | HTTP Basic: usuário = token da empresa, senha vazia | `ref` obrigatória na query, única por token | **Síncrono** — confirmado explicitamente |
| Consultar NFC-e | `/v2/nfce/{referencia}` | GET | — | status de processamento/autorização/cancelamento/erro, XML, DANFCe, QR Code, eventos | Basic (token empresa) | path | Autoridade para reconciliação |
| Cancelar NFC-e | `/v2/nfce/{referencia}` | DELETE | `justificativa` (15–255 caracteres) | — | Basic | path | Síncrono; prazo usual até 30 min pós-emissão |
| Emitir NF-e | `/v2/nfe?ref={referencia}` | POST | itens não detalhados além do padrão geral no material fornecido | **201** autorizada (síncrono) OU **202** processando (assíncrono) | Basic | `ref` obrigatória | Assíncrono por padrão; pode ser síncrono conforme configuração da conta. 202 NÃO é erro |
| Consultar NF-e | `/v2/nfe/{referencia}` | GET | — | processamento/autorização/cancelamento/erro, XML, DANFE, eventos | Basic | path | Necessária para resolver 202 |
| Cancelar NF-e | `/v2/nfe/{referencia}` | DELETE | `justificativa` (15–255) | — | Basic | path | Síncrono; prazo geral até 24h (pode variar por estado) |
| CC-e (NF-e) | `/v2/nfe/{referencia}/carta_correcao` | POST | `correcao` (15–1000), `data_evento` opcional | — | Basic | path | Síncrono; até 20 correções, vale a última. Não existe para NFC-e |
| Criar empresa | `/v2/empresas` | POST | razão social, nome fantasia, CNPJ, IE, IM, regime tributário, endereço (`municipio` — **não** `codigo_ibge`), `habilita_nfe`/`habilita_nfce`, certificado (`arquivo_certificado_base64`+`senha_certificado`), CSC NFC-e homolog/produção, próximo número/série, contingência, emissão síncrona NF-e | empresa criada, com `id` Focus | Não detalhado no material se é token de conta ou outro — **não confirmado** | — | **Opera somente em produção** (`dry_run=1` simula); não testável em homologação |
| Atualizar empresa | `/v2/empresas/{id}` | PUT | mesmos campos | — | — | `{id}` = identificador Focus da empresa | idem acima |
| Ambientes | `homologacao.focusnfe.com.br` / `api.focusnfe.com.br` | — | — | — | Basic, token específico por ambiente/empresa | — | Rotas `/v2`; documentos de homologação sem validade fiscal |

**Achado que corrige a Fase A:** "modelo síncrono = CONFLICT" estava errado. Correção: **NFC-e é sempre síncrono** (o adapter atual já está estruturalmente certo para isso — só falta o DTO real); **NF-e é assíncrono por padrão, podendo ser síncrono por configuração de conta** — o domínio já tem estado (`EM_PROCESSAMENTO`) para representar o caso 202 sem precisar de nada novo.

**Achado que corrige a decisão de multiempresa:** a API de empresas confirma que **cada empresa tem seu próprio token** — não existe token único de conta para todas as lojas. A referência (`ref`) é única *por token*, não globalmente. Isso muda a modelagem: não basta 1 `FISCAL_PROVIDER_TOKEN` global (como hoje) para operar mais de uma loja; é necessário resolver o token correto por `loja_id` antes de cada chamada — mas o **identificador Focus da empresa (`{id}` usado em `PUT /v2/empresas/{id}`) não precisa ser persistido no Jinlong**, porque a emissão em si não o usa (só o token, via Basic Auth). Esse `{id}` só importaria se o Jinlong fosse gerenciar empresas programaticamente via API — o que está fora de escopo (a própria API de empresas só funciona em produção, então nem seria testável em homologação nesta missão).

---

## 3. P0 FINAL — indispensável para primeira emissão segura em homologação

### P0.1 — Snapshot fiscal imutável (congelamento no enqueue)

| Campo | Conteúdo |
|---|---|
| GAP | `documentos_fiscais_pendentes.payload` fica `NULL` no caminho web (insert inline na RPC de venda) e sem campos fiscais de item no caminho sync (`fiscal_enqueue_after_venda_sync.ts`) |
| ALTERAÇÃO | (a) Caminho web: enriquecer o `INSERT` do PASSO 9 da RPC de venda para montar `payload` via `jsonb_build_object` com itens (join `itens_venda`⋈`produtos` por `ncm/cfop_produto/csosn/cest/cst_pis/cst_cofins`, preço/desconto/qtd já disponíveis na própria transação) + dados do emitente (via `caixa→loja`) + forma de pagamento/totais — tudo na mesma transação da venda, sem chamar a função TS morta (que quebraria a atomicidade se chamada como passo separado). (b) Caminho sync: enriquecer `fiscal_enqueue_after_venda_sync.ts` com uma consulta a `produtos` pelos `produto_id` recebidos, adicionando os mesmos 6 campos fiscais ao `fiscalPayload.itens[]` |
| ARQUIVOS | `backend/supabase/migrations/<nova>_finalizar_venda_fiscal_payload_snapshot.sql` (nova versão da RPC — segue o padrão de 33 migrations anteriores que já recriam essa função); `backend/supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.ts` |
| MIGRATION? | Sim (recriar a RPC com `CREATE OR REPLACE`, mesmo padrão já usado) |
| TESTE | Estender `vendaConsistency.integration.test.ts` para afirmar conteúdo de `payload.itens[0].ncm` etc. (hoje só afirma `status`); novo teste unitário para `fiscal_enqueue_after_venda_sync.ts` |
| RISCO | Baixo — é aditivo (só enriquece um jsonb que hoje é ignorado/vazio); não muda comportamento de venda, estoque ou pagamento |
| ROLLBACK | `CREATE OR REPLACE` de volta à versão anterior da RPC (mesmo padrão de reversão já usado nas 33 migrations anteriores) |

**Garantia de imutabilidade:** o worker (`fiscal-worker/index.ts`) já hoje só encaminha `raw.payload` recebido do banco ao provider — não há, em nenhum ponto do código atual, uma nova consulta a `produtos`/`lojas`/`pdv_config` depois do enqueue. Essa garantia **já existe estruturalmente**; o gap era só o payload chegar vazio. P0.1 fecha isso sem exigir nenhuma mudança no worker quanto a "não reconsultar cadastros".

### P0.2 — `FocusProvider`: DTO real de NFC-e (síncrono)

| Campo | Conteúdo |
|---|---|
| GAP | Corpo enviado hoje é envelope genérico (`{ref, documento_id, venda_id, tipo_doc, correlation_id, payload}`), não o schema NFC-e real (`cnpj_emitente, items[], formas_pagamento[]`, etc.) |
| ALTERAÇÃO | Nova função de mapeamento `buildFocusNfceRequestBody(doc)` dentro do adapter, traduzindo o `payload` congelado (P0.1) para o formato confirmado na tabela do §2; manter `pickFocusChaveProtocolo` (parsing de resposta já tolerante a variações de campo) |
| ARQUIVOS | `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts` |
| MIGRATION? | Não |
| TESTE | Novo — `fiscal-provider-adapter.test.ts`: dado um `payload` de exemplo, o corpo montado bate com o schema NFC-e; resposta de sucesso mapeia corretamente; resposta de rejeição mapeia corretamente |
| RISCO | Médio — é o coração da integração; mitigado por não tocar no restante do worker (claim/retry/DLQ ficam intactos) |
| ROLLBACK | Reverter o arquivo (sem estado persistido a desfazer — é lógica pura de tradução de request/response) |

### P0.3 — `FocusProvider`: aceitar NF-e 201/202 sem tratar 202 como erro

| Campo | Conteúdo |
|---|---|
| GAP | Adapter atual só entende sucesso (com chave+protocolo) ou erro; não distingue "201 autorizado" de "202 processando" |
| ALTERAÇÃO | `FocusProvider.callProvider` para NF-e: se `res.status === 202`, retornar um resultado `ok: true` sem chave/protocolo definitivos, sinalizando `EM_PROCESSAMENTO` (estado já existente) em vez de `EMITIDO`; `index.ts` passa a tratar esse retorno chamando uma nova RPC leve (ou reaproveitando `fiscal_marcar_erro` com `transitorio: true` e um marcador específico) para manter o documento em `EM_PROCESSAMENTO` até a reconciliação (P0.4) resolver |
| ARQUIVOS | `fiscal-provider-adapter.ts`, `fiscal-worker/index.ts` |
| MIGRATION? | Possivelmente não — se `EM_PROCESSAMENTO` já é atingível via `fiscal_claim_documentos` (que já marca esse status ao puxar o documento), o 202 pode simplesmente ser tratado como "ainda não terminou, deixar como está e aguardar reconciliação" sem nenhuma RPC nova. Decisão final de implementação fica para a Fase C, mas nenhuma migration nova é esperada aqui |
| TESTE | Cenário 202 no fake provider: documento permanece `EM_PROCESSAMENTO`, não vira `ERRO` |
| RISCO | Baixo-médio — precisa não confundir "202 = ainda processando" com falha transitória (que dispararia backoff/retry indevido de um novo POST, potencialmente incorrendo em nova emissão) |
| ROLLBACK | Reverter arquivos, sem estado a desfazer |

### P0.4 — Consulta por referência (reconciliação, independente de webhook)

| Campo | Conteúdo |
|---|---|
| GAP | `FocusProvider` só tem `callProvider` (emitir); não existe `consultarDocumento` |
| ALTERAÇÃO | Nova função `consultarNfce(ref, config)` / `consultarNfe(ref, config)` (GET); nova RPC/mecanismo administrativo `fiscal_reconciliar_documento(documento_id)` chamável sob demanda (painel `/gerente/financeiro?tab=fiscal`, botão "Consultar na Focus") e, opcionalmente, por um job — aplica a transição via as RPCs já existentes (`fiscal_marcar_emitido`/`fiscal_marcar_erro_normalizado`), nunca escreve estado diretamente fora delas |
| ARQUIVOS | `fiscal-provider-adapter.ts` (novas funções de consulta); novo endpoint/Edge Function ou extensão do `fiscal-worker` com uma segunda rota; `DocumentoFiscalDetalheClient.tsx`/`DocumentoFiscalDetailSheet.tsx` (botão "Consultar agora", reaproveitando os componentes já existentes) |
| MIGRATION? | Não necessariamente — se a reconciliação for feita chamando as RPCs já existentes (`fiscal_marcar_emitido`/`fiscal_marcar_erro_normalizado`) a partir de uma nova Edge Function/rota, não precisa de RPC SQL nova. Avaliar em Fase C se uma RPC dedicada `fiscal_reconciliar_documento` (que só delega às duas existentes) ajuda ou é camada supérflua |
| TESTE | Documento `PENDENTE`/`EM_PROCESSAMENTO` velho → consulta retorna autorizado → vira `EMITIDO` com chave/protocolo; retorna rejeitado → vira `ERRO`; retorna "ainda processando" → permanece inalterado |
| RISCO | Baixo — é read-only até decidir aplicar transição, e a transição em si já é validada pela máquina de estados existente |
| ROLLBACK | Remover a rota/UI nova; nenhuma mudança de schema a desfazer |

### P0.5 — Retry seguro: consultar antes de re-emitir após erro transitório/timeout

| Campo | Conteúdo |
|---|---|
| GAP | Hoje, erro transitório (incl. timeout) agenda um retry que fará um **novo POST** de emissão; se a Focus já tiver processado o POST anterior (nosso timeout não significa timeout do lado da Focus), o reenvio pode colidir com uma referência já vinculada |
| ALTERAÇÃO | No worker, antes de reenviar um POST para um documento com `tentativas > 0`, chamar primeiro a consulta (P0.4) pela mesma referência; se já autorizado/rejeitado lá, aplicar a transição direto sem reemitir; só faz novo POST se a consulta confirmar "não encontrado"/sem tentativa anterior registrada na Focus |
| ARQUIVOS | `fiscal-worker/index.ts` |
| MIGRATION? | Não |
| TESTE | Cenário do teste de homologação pedido pelo usuário: mesma referência enviada de novo → Focus não cria segundo documento (validado primeiro manualmente em homologação real, depois automatizado como teste de contrato se possível) |
| RISCO | Baixo — é uma consulta a mais antes de decidir, não uma mudança de estado |
| ROLLBACK | Reverter para o comportamento anterior (reenviar direto) |

### P0.6 — Resolução de credencial multiempresa (loja → token Focus)

| Campo | Conteúdo |
|---|---|
| GAP | Hoje existe só `FISCAL_PROVIDER_TOKEN` global (1 token para todo o sistema); a Focus confirma que cada empresa tem seu próprio token — não dá para operar mais de uma loja com um único token |
| ALTERAÇÃO | Nova tabela mínima **genérica** (não Focus-específica) mapeando `loja_id → provider_type, ambiente, secret_ref, habilitado` — o `secret_ref` é só um **nome** de secret (ex.: convenção `FISCAL_TOKEN_<loja_id>`), nunca o valor. O valor real do token continua exclusivamente em Supabase Edge secrets (mesmo padrão já usado para `FISCAL_PROVIDER_TOKEN`/`SYNC_KEY`). Worker resolve `loja_id` (via `venda→caixa`) → busca a linha de config → lê o secret pelo nome → usa no Basic Auth |
| ARQUIVOS | `fiscal-worker/index.ts` (resolução de credencial antes de chamar o provider), `fiscal-provider-adapter.ts` (`ProviderConfig` ganha `token` já resolvido por chamada, não fixo por processo) |
| MIGRATION? | Sim — nova tabela `fiscal_provider_config` |
| TESTE | Duas lojas com secrets diferentes → cada emissão usa o token certo (fake provider capturando o header Authorization recebido) |
| RISCO | Médio — é uma peça nova, mas pequena e sem dado sensível em banco; risco principal é RLS mal escopada (mitigar: leitura só GERENTE/DONO/ADMIN da própria loja + ADMIN global, escrita só DONO/ADMIN, seguindo o mesmo padrão já corrigido para `lojas`/`pdv_config` em P0.9/P0.10) |
| ROLLBACK | `DROP TABLE` (aditiva, sem dado de produção a perder nesta fase — nada é gravado nela em homologação além de configuração de teste) |

**Nota explícita (evita acoplamento):** esta tabela **não** tem colunas com nome `focus_*` — é modelada como configuração de provider genérica, reutilizável se um dia trocar de fornecedor (vendor exit preservado).

### P0.7 — Ambiente homologação × produção (seleção explícita e guarda)

| Campo | Conteúdo |
|---|---|
| GAP | `FISCAL_ENVIRONMENT` está documentada mas nunca é lida pelo código; alternância hoje é 100% implícita via `FISCAL_PROVIDER_URL` |
| ALTERAÇÃO | Worker passa a ler `FISCAL_ENVIRONMENT` (`homologacao`/`producao`) e validar que `FISCAL_PROVIDER_URL` contém o host esperado (`homologacao.focusnfe.com.br` vs `api.focusnfe.com.br`) antes de qualquer chamada — se não bater, aborta com erro claro em vez de silenciosamente chamar o ambiente errado. Mesma checagem pode ser estendida por `loja_id` se `fiscal_provider_config` (P0.6) carregar `ambiente` por linha |
| ARQUIVOS | `fiscal-worker/index.ts` |
| MIGRATION? | Não (ou: adicionar coluna `ambiente` em `fiscal_provider_config`, já coberta pela migration de P0.6) |
| TESTE | URL de produção + `FISCAL_ENVIRONMENT=homologacao` → aborta com erro; combinação coerente → prossegue |
| RISCO | Baixo |
| ROLLBACK | Reverter arquivo |

### P0.8 — Persistência de XML (ciclo completo)

| Campo | Conteúdo |
|---|---|
| GAP | Zero colunas, zero código; ao autorizar, hoje nada persiste o XML |
| ALTERAÇÃO | Após `EMITIDO`, worker chama a consulta (GET, já necessária por P0.4) para obter XML, faz upload para Supabase Storage (bucket dedicado, ex. `documentos-fiscais`, não o `produto-imagens` já usado para outra coisa), grava `xml_storage_path`/`xml_hash`/`xml_obtido_em` em `documentos_fiscais_pendentes` |
| ARQUIVOS | `fiscal-worker/index.ts`, `fiscal-provider-adapter.ts` (extrair XML da resposta de consulta) |
| MIGRATION? | Sim — 3 colunas aditivas em `documentos_fiscais_pendentes` + criação do bucket Storage (via migration ou painel, a definir) |
| TESTE | Emissão autorizada (fake) → XML "persistido" (mock de Storage) → path/hash gravados |
| RISCO | Baixo-médio — Storage é infraestrutura nova para este domínio, mas o padrão de upload já existe no projeto (`uploadLogoLojaAction`, `lib/thermal-printer` não relevante aqui) — reaproveitar o mesmo client de Storage já usado |
| ROLLBACK | Colunas aditivas — remover não perde histórico de emissão (só o vínculo ao XML) |

**PDF/DANFE: fica fora do P0** — é obtível por nova consulta a qualquer momento (a Focus garante XML por consulta; DANFCe/DANFE também aparecem na resposta de consulta segundo o material fornecido) e não é necessário para provar a consistência do domínio fiscal em si.

### P0.9 — Testes mínimos

Cobertura proposta (adaptada da lista do usuário, sem E2E pesado):

| Cenário | Onde |
|---|---|
| Snapshot imutável (payload congelado, worker não reconsulta cadastros) | Novo teste de integração (estende `vendaConsistency.integration.test.ts`) |
| DTO Focus (NFC-e) montado corretamente a partir do payload | `fiscal-provider-adapter.test.ts` (novo) |
| Mesma referência enviada de novo não duplica (fake provider simulando dedup) | `fiscal-worker` (novo) — complementado por teste manual real em homologação |
| Timeout após Focus possivelmente já ter recebido → consulta antes de reemitir | `fiscal-worker` (novo, fake provider com timeout simulado) |
| Retry com erro transitório | idem |
| Resposta 202 (NF-e processando) não vira erro | idem |
| Consulta por referência aplica transição correta (autorizado/rejeitado/ainda processando) | idem |
| Autorização (sucesso) e rejeição (erro definitivo) | idem |
| Crash entre resposta Focus e persistência local (falha do `fiscal_marcar_emitido`) | já parcialmente coberto pelo comportamento existente do `index.ts` (vira retry) — adicionar teste explícito |
| RLS de `fiscal_provider_config` | teste SQL/RLS, mesmo padrão dos já existentes para `documentos_fiscais_pendentes` |
| Multiempresa: duas lojas usam tokens diferentes | `fiscal-worker` (novo) |
| Venda independente do documento fiscal (falha de enqueue não aborta venda) | já coberto por `vendaConsistency.integration.test.ts` — confirmar/reforçar |

Webhook duplicado fica fora do P0 (webhook é P1) — não criar o teste ainda.

---

## 4. P1 FINAL — indispensável antes de produção

| # | Item | Por que não é P0 |
|---|---|---|
| P1.1 | Endpoint de webhook (validação estrutural, idempotente, sempre confirma via consulta antes de aplicar transição) | NFC-e é 100% síncrono (não precisa de webhook para o primeiro teste); reconciliação por consulta (P0.4) já fecha o ciclo para NF-e assíncrono sem depender de webhook chegar |
| P1.2 | Novo tipo de evento `WEBHOOK_RECEBIDO` na timeline | Acompanha P1.1 |
| P1.3 | `FocusProvider.cancelar` (DELETE NFC-e/NF-e) | Cancelamento fiscal real não é necessário para provar que a emissão funciona |
| P1.4 | Sinalização operacional: venda cancelada com documento `EMITIDO` gera condição visível/auditável (sem cancelamento automático da nota) | Governança de UX, não bloqueia teste técnico de emissão |
| P1.5 | Carta de Correção (CC-e) | Só existe para NF-e; a própria documentação da missão já apontava isso como não necessário para o primeiro cenário (NFC-e) |
| P1.6 | `pdv_config` — corrigir RLS de escrita (menor correção: nova `CREATE POLICY`, sem `SECURITY DEFINER`) | Não bloqueia testar emissão via migration/seed direto; é config de UX de gerente |
| P1.7 | `lojas` — corrigir escopo de `lojas_write_gerente` (preservando Padrão A: DONO/ADMIN global, GERENTE só a própria loja) | Achado de segurança adjacente, não bloqueia homologação técnica |
| P1.8 | `correlation_id` como header HTTP ao provider + logger web | Observabilidade, não bloqueia primeira emissão |
| P1.9 | DANFE/PDF gerado/armazenado | Recuperável por consulta a qualquer momento; não bloqueia consistência do domínio |
| P1.10 | Agendamento do `fiscal_reaper_documentos` (código já pronto) | Baixo risco, mas é operação de produção, não de teste de homologação |

## 5. P2 — hardening/evolução

- Inutilização de numeração (delegada à Focus).
- Estado de contingência SEFAZ explícito (avaliar se cabe em `fiscal_error_category` existente).
- GTIN validado, CST-ICMS não-Simples, alíquotas ICMS/IPI — somente se/quando o piloto atender regime fora do Simples Nacional (P0 já funciona com os defaults atuais: `csosn='400'`, `cst_pis/cst_cofins='07'`, que são valores de Simples Nacional).
- Unidade tributável separada da comercial.
- Código IBGE — **não entra nem em P2 por ora**: a documentação de empresa confirma `municipio` (texto), não `codigo_ibge`, como campo. Só reconsiderar se um contrato futuro exigir explicitamente.
- Identificador Focus da empresa (`{id}` de `/v2/empresas/{id}`) — só se o Jinlong um dia gerenciar empresas via API (fora de escopo; a API só opera em produção).

---

## 6. MIGRATIONS PROPOSTAS (lista — nenhuma criada)

| # | Nome proposto | Motivo |
|---|---|---|
| 1 | `<ts>_finalizar_venda_fiscal_payload_snapshot.sql` | Recria a RPC de venda para popular `payload` com snapshot fiscal congelado (P0.1) |
| 2 | `<ts>_fiscal_provider_config.sql` | Tabela genérica loja→config de provider (nome do secret, ambiente, habilitado) + RLS (P0.6, P0.7) |
| 3 | `<ts>_documentos_fiscais_xml_storage.sql` | Colunas `xml_storage_path`, `xml_hash`, `xml_obtido_em` em `documentos_fiscais_pendentes` (P0.8) |
| 4 | `<ts>_pdv_config_write_policy.sql` | Nova `CREATE POLICY` de escrita para `pdv_config` (P1.6) |
| 5 | `<ts>_lojas_write_policy_scope_loja.sql` | Corrige `lojas_write_gerente` para escopo por loja preservando Padrão A (P1.7) |
| 6 | `<ts>_fiscal_evento_webhook_recebido.sql` | Adiciona `'WEBHOOK_RECEBIDO'` ao CHECK de `documentos_fiscais_eventos.evento_tipo` (P1.2, só quando P1.1 for implementado) |

Migrations 1–3 são P0; 4–6 são P1 (listadas aqui para visibilidade, não para execução agora).

---

## 7. ARQUIVOS QUE SERIAM ALTERADOS (P0)

- `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts`
- `backend/supabase/functions/fiscal-worker/index.ts`
- `backend/supabase/functions/fiscal-worker/fiscal_types.ts`
- `backend/supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.ts`
- `.env.example` (documentar novas variáveis, sem valores reais)
- `pdv-importados/app/gerente/financeiro/documento/[id]/DocumentoFiscalDetalheClient.tsx` e `pdv-importados/app/admin/financeiro/_components/DocumentoFiscalDetailSheet.tsx` (botão "Consultar agora" — reaproveitando UI já existente, P0.4)

## 8. ARQUIVOS NOVOS (P0)

- `backend/supabase/migrations/<ts>_finalizar_venda_fiscal_payload_snapshot.sql`
- `backend/supabase/migrations/<ts>_fiscal_provider_config.sql`
- `backend/supabase/migrations/<ts>_documentos_fiscais_xml_storage.sql`
- `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.test.ts`
- `backend/supabase/functions/fiscal-worker/*.test.ts` (demais cenários de §3 P0.9)

---

## 9. O QUE NÃO SERÁ ALTERADO (boundaries preservados)

- Separação Venda × DocumentoFiscal (schema e transação) — intacta.
- Máquina de estados fiscal (`tr_documentos_fiscais_estado_bi/bu`) — nenhum estado novo; NF-e 202 reaproveita `EM_PROCESSAMENTO` já existente.
- `documentos_fiscais_eventos` — nenhuma mudança em P0 (o novo tipo de evento é P1, só quando webhook existir).
- `fiscal_claim_documentos`, `fiscal_marcar_emitido`, `fiscal_marcar_erro`, `fiscal_marcar_erro_normalizado`, `fiscal_reaper_documentos`, `fiscal_reprocessar_documento` — lógica de retry/backoff/DLQ intacta, reutilizadas como estão.
- Colunas fiscais de `produtos` (`ncm/cfop_produto/csosn/cest/cst_pis/cst_cofins`) — já suficientes para o cenário Simples Nacional do primeiro teste; nenhuma coluna nova de produto.
- `lojas` — nenhuma coluna nova (`focus_empresa_id` e `codigo_ibge` explicitamente descartados nesta fase por falta de necessidade comprovada no contrato).
- `fiscal_providers.ts`, `fiscal-validation.ts` — não removidos nesta missão (instrução explícita do usuário; ficam como estão, código morto documentado).
- `enfileirarDocumentoFiscalPosVenda`/`caixaFiscalEnqueueServer.ts` — não removido nem conectado; a solução correta para o caminho web é enriquecimento SQL-side (P0.1), não essa função (que quebraria atomicidade se chamada como passo separado pós-venda). Permanece código morto, candidato a limpeza futura (P2, fora desta missão).
- Cadastro de empresa via API Focus (`POST/PUT /v2/empresas`) — fora de escopo: só opera em produção, não testável em homologação nesta missão; empresas continuam cadastradas manualmente na Focus.
- Cancelamento de venda (`cancelar_venda_transacional`) — nenhuma alteração em P0; nenhum acoplamento automático ao domínio fiscal.
- RBAC/RLS já madura de `documentos_fiscais_pendentes`/`documentos_fiscais_eventos`/DLQ — intacta.

---

## 10. Revisão adversarial

**Existe solução menor?**
Sim, e foi adotada em 3 pontos: (a) reaproveitar `EM_PROCESSAMENTO` para o caso NF-e 202 em vez de criar estado novo; (b) enriquecer o INSERT existente da RPC de venda em vez de introduzir uma nova etapa/transação; (c) adiar webhook para P1 porque NFC-e (o primeiro cenário real) é inteiramente síncrono — reconciliação por consulta já é suficiente para o P0.

**Estamos duplicando algo?**
Ponto de atenção genuíno: o payload fiscal passa a ser montado em dois lugares (SQL, para o caminho web; TS, para o caminho sync) porque são dois contextos transacionais diferentes — não é possível compartilhar literalmente o código entre PL/pgSQL e Deno/TS. Não é duplicação evitável; é a mesma lógica de mapeamento implementada duas vezes por necessidade de runtime, o que é aceitável e já é o padrão existente no projeto (os dois caminhos já existiam separados antes desta missão).

**Estamos acoplando Focus ao domínio?**
Mitigado deliberadamente: o mapeamento para o schema Focus (NFC-e/NF-e) fica inteiramente dentro de `fiscal-provider-adapter.ts` (o `payload` congelado em `documentos_fiscais_pendentes` continua genérico — itens com preço/qtd/dados fiscais do produto, não nomes de campo da Focus). A tabela `fiscal_provider_config` é modelada genericamente (`provider_type`, não colunas `focus_*`).

**Estamos adicionando coluna que poderia ser configuração?**
Verificado e evitado: `focus_empresa_id` e `codigo_ibge` foram explicitamente descartados por falta de necessidade comprovada no contrato fornecido. A única tabela nova (`fiscal_provider_config`) é, ela mesma, a representação de "isso é configuração, não dado de domínio" — por isso existe separada de `lojas`.

**Estamos criando estado desnecessário?**
Não — nenhum novo valor de `documentos_fiscais_pendentes.status` é proposto no P0. O único enum novo é `documentos_fiscais_eventos.evento_tipo += 'WEBHOOK_RECEBIDO'`, e está em P1, condicionado à implementação do webhook.

**Estamos confundindo retry com reconciliação?**
Não — três mecanismos distintos, cada um com responsabilidade única: (1) reaper (`fiscal_reaper_documentos`, já existe) resgata documento preso localmente em `EM_PROCESSAMENTO` por morte do worker; (2) reconciliação por consulta (P0.4, novo) resolve incerteza sobre o **estado remoto** na Focus; (3) retry-seguro (P0.5, novo) é uma checagem pontual antes de decidir se reemite após erro transitório — usa (2) como ferramenta, mas é uma decisão diferente de (1).

**Estamos reconstruindo snapshot a partir de dados mutáveis?**
Não — o worker (`index.ts`) hoje só encaminha `payload` já persistido; nenhuma mudança proposta introduz uma nova consulta a `produtos`/`lojas`/`pdv_config` depois do enqueue. A garantia de imutabilidade já é estrutural no código atual; P0.1 só corrige o conteúdo que é congelado.

**Estamos aumentando o diff sem benefício para homologação?**
Cancelamento fiscal real, CC-e, webhook, DANFE e as duas correções de RLS adjacentes (`pdv_config`/`lojas`) foram deliberadamente movidos para P1 — nenhum deles é necessário para rodar e reconciliar uma primeira emissão de NFC-e (ou NF-e) real em homologação. O P0 ficou restrito a: congelar o snapshot, mapear o DTO real, aceitar os dois formatos de resposta do Focus, consultar por referência, resolver credencial por loja, guardar ambiente, persistir XML, e testar tudo isso.

---

## FASE B READY FOR APPROVAL: YES

Nenhuma implementação foi feita. Nenhuma migration foi criada. Nenhum commit. Nenhuma alteração de banco. Nenhum documento fiscal emitido. Aguardando sua aprovação item a item (ou geral) antes da Fase C.
