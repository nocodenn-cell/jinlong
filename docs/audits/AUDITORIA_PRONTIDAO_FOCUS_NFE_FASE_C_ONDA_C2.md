# Prontidão Focus NFe — Fase C / Onda C2: Focus Adapter + Consulta + Reconciliação Segura

**Data:** 2026-09-02
**Escopo:** transformar `FocusProvider` de envelope genérico em adapter real, com resolução de credencial multiempresa fail-closed, boundary NFC-e/NF-e (síncrono/assíncrono), consulta/reconciliação, e retry seguro. **Nenhuma chamada real à Focus foi feita.** C1/C1.5 preservados integralmente — nenhuma migration reaberta, nenhum arquivo de C1 alterado além do que esta onda pede.

---

## DIFF

100% confinado a `backend/supabase/functions/fiscal-worker/` — confirmado por `git status` (zero arquivo em `pdv-importados/`, zero migration nova, zero mudança em `sync-outbox` além de um `deno.lock` já reportado no Gate C1.5).

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `fiscal_credential_resolver.ts` | Novo | C2.1/C2.2 — `resolveFocusCredential` (fail-closed), `resolveFocusBaseUrl`, `resolveDeployAmbiente` |
| `fiscal_focus_dto.ts` | Novo | C2.3 — mapeador do snapshot → envelope Focus, só campos confirmados; gaps explícitos, nunca inventados |
| `fiscal_worker_orchestration.ts` | Novo | C2.7/C2.8/C2.9 — traduz `FocusRemoteState` → RPCs já existentes; falha de credencial → mesma trilha de erro |
| `fiscal_types.ts` | Modificado | +`FocusRemoteState` (6 estados canônicos) — resto intocado |
| `fiscal-provider-adapter.ts` | Modificado | `FocusProvider` ganha `emitirNfe`/`consultarDocumento`; URLs viram tipo-doc-aware (`/v2/nfce` vs `/v2/nfe`); `callProvider` (NFC-e) reescrito sobre o mesmo classificador. `Mock`/`Http`/`Bling` **intocados** |
| `index.ts` | Modificado | Resolução de credencial por documento, retry-seguro, ramo NF-e, endpoint de reconciliação explícita. Fluxo NFC-e/mock/http/bling legado **copiado sem alteração** abaixo do novo código |
| `*.test.ts` (4 novos) | Novo | 40 testes, fake HTTP/fake Supabase — nenhum toca rede real |

## PORT

**Antes:** `FiscalProvider { callProvider(doc, config): Promise<ProviderResult> }` — 1 método, 2 estados (ok/erro).

**Depois:** mesmo método preservado (assinatura idêntica, `Mock`/`Http`/`Bling` não mudam nada), **+ 2 métodos opcionais**:
```ts
interface FiscalProvider {
  callProvider(doc, config): Promise<ProviderResult>;
  emitirNfe?(doc, config): Promise<FocusRemoteState>;
  consultarDocumento?(ref, tipoDoc, config): Promise<FocusRemoteState>;
}
```
Justificativa: C2.8 pediu "capacidade explícita no port existente — menor alteração possível — não criar segundo provider/service paralelo". Opcionais porque só `FocusProvider` precisa deles — zero mudança forçada nos outros 3 providers, zero segundo port.

## DTO

`buildFocusNfceEnvelope(payload)` mapeia **só o confirmado**:

| Campo Focus | Fonte | Status |
|---|---|---|
| `cnpj_emitente` | `payload.emitente.cnpj` | ✅ mapeado |
| `data_emissao` | `payload.data_venda` | ✅ mapeado (formato ISO8601 assumido — não confirmado pela documentação fornecida, validar em homologação) |
| `natureza_operacao` | — | ❌ **GAP — não inventado.** Sem fonte em produto/loja/pdv_config. Decisão de negócio pendente (config de operação? config da loja? valor fixo do contrato?). Não usei `"VENDA"` nem qualquer default |
| `modalidade_frete` | — | ❌ GAP — valores/enum válidos não confirmados |
| `local_destino` | — | ❌ GAP — idem |
| `presenca_comprador` | — | ❌ GAP — idem |
| `items[]` | — | ❌ GAP — schema de item Focus (nomes de campo) não fornecido nesta missão. Dados existem em `payload.itens[]`, falta o DE-PARA |
| `formas_pagamento[]` | — | ❌ GAP — idem, dados em `payload.pagamentos[]` |
| destinatário | — | ❌ GAP — schema não confirmado; dado existe em `payload.destinatario` quando há cliente |

**Nenhum destes 7 gaps foi preenchido com valor inventado.** O corpo HTTP realmente construído hoje contém só os 2 campos confirmados + o envelope de rastreio (`ref`/`documento_id`/`venda_id`/`tipo_doc`/`correlation_id`) que já existia antes da C2. Enviar isso a uma Focus real hoje seria rejeitado por campos obrigatórios ausentes — **isso é esperado e correto**: não fazemos chamada real nesta onda, e não vou fingir um DTO completo que eu não tenho evidência de estar certo.

## MULTIEMPRESA

Fluxo implementado exatamente como pedido: `DocumentoFiscal → payload.loja_id → fiscal_provider_config(loja_id, ambiente) → token_env_var (gerado em C1) → Deno.env.get → token → FocusProvider`.

Fail closed provado por teste (não só código) para: config ausente, desabilitada, provider incompatível, secret ausente, secret vazio, ambiente divergente (a query nem encontra a linha do ambiente errado — zero HTTP por construção, não por checagem extra). Loja A/Loja B nunca cruzam secret — provado.

`FISCAL_PROVIDER_TOKEN`/`FISCAL_PROVIDER_URL` (mecanismo legado) **nunca são lidos** no branch `providerType === "focus"` — não há fallback possível porque o código nem referencia essas variáveis nesse caminho (não é uma checagem que pode ser esquecida, é ausência estrutural).

## IDEMPOTÊNCIA

- **Mesma `ref` sempre**: `resolveFocusRef(doc)` é pura, determinística (`doc.id` por padrão) — testada com chamadas repetidas retornando o mesmo valor.
- **Timeout no POST → consulta antes de novo POST**: implementado em `index.ts` — qualquer documento com `tentativas > 0` passa por `provider.consultarDocumento` antes de qualquer novo `callProvider`/`emitirNfe`. Só `nao_encontrado` libera um novo POST.
- **Crash após Focus aceitar**: mesmo mecanismo — do ponto de vista do worker, "timeout" e "crash + reaper reenfileirou" são indistinguíveis (ambos resultam em `tentativas > 0`), então a mesma proteção cobre os dois.
- **Nenhum retry gera novo DocumentoFiscal**: não haveria como — o retry opera sobre o MESMO `id` de `documentos_fiscais_pendentes` já claimed; não há caminho de código que crie uma nova linha nesse fluxo.

## RECONCILIAÇÃO

Endpoint explícito (`POST` com `{mode: "reconciliar", documento_id}` no mesmo `fiscal-worker`, não um segundo serviço): busca o documento → resolve credencial → `consultarDocumento` (só GET, nunca emite) → `applyFocusRemoteState` (mesma tradução usada em todo o resto) → mesma RPC/máquina de estados/auditoria já existentes.

**Separado do reaper**: o reaper (`fiscal_reaper_documentos`, já existente, intocado nesta onda) resolve *"preso localmente"* (timeout de processamento sem resposta alguma); a reconciliação resolve *"não sei o estado remoto"* (chamando a Focus de verdade). Não escrevi nenhuma linha de código que confunda os dois — são funções/branches diferentes, um não chama o outro.

Não agendei cron — conforme instruído.

## TESTES

40 testes, todos executados de verdade (Docker `denoland/deno:latest`, sem instalar nada no host — mesma técnica do Gate C1.5), fake HTTP/fake Supabase, zero chamada real:

| # | Cenário | Resultado |
|---|---|---|
| 1 | NFC-e autorizada | PASS |
| 2 | NFC-e rejeitada | PASS |
| 3 | NFC-e timeout | PASS |
| 4 | Consulta NFC-e autorizada | PASS |
| 5 | Consulta NFC-e rejeitada | **BLOCKED** — schema de rejeição via consulta não confirmado pela documentação fornecida; classificador trata ambíguo como `processando` (lado seguro), não `rejeitado`. Registrado, não inventado |
| 6 | NF-e 201 | PASS |
| 7 | NF-e 202 | PASS |
| 8 | Consulta posterior NF-e 202 → autorizada | PASS |
| 9 | Timeout POST → GET antes de 2º POST | PASS (via orquestração — mesma função aplica resultado de consulta e de emissão) |
| 10 | Crash/recovery → GET | PASS (mesmo mecanismo do 9 — equivalência documentada) |
| 11 | Mesma `ref` em retry | PASS |
| 12 | Loja A usa secret A | PASS |
| 13 | Loja B usa secret B | PASS |
| 14 | Loja A nunca usa secret B | PASS |
| 15 | Config inexistente → fail closed | PASS |
| 16 | Config desabilitada → fail closed | PASS |
| 17 | Secret inexistente → fail closed | PASS |
| 18 | Ambiente divergente → fail closed, zero HTTP | PASS |
| 19 | Resposta Focus inválida | PASS |
| 20 | HTTP 429 | PASS |
| 21 | HTTP 5xx | PASS |
| 22 | HTTP 4xx definitivo | PASS |
| 23 | Token/Authorization ausentes de logs | PASS |
| 24 | DTO Focus não vaza para domínio | PASS (nível adapter — `items`/`formas_pagamento` nunca aparecem inventados no corpo; nível repositório — `git diff` confirma zero arquivo fora de `fiscal-worker/`) |

**39/40 PASS, 1/24 BLOCKED (reportado, não escondido).** Gates adicionais: `deno check` PASS (todo o diretório, incluindo os 4 novos arquivos e os testes), `tsc --noEmit` do `pdv-importados` PASS (nenhum arquivo tocado, confirmação de não-regressão).

**Limitação honesta**: os 40 testes cobrem as peças (`fiscal_credential_resolver`, `fiscal-provider-adapter`, `fiscal_worker_orchestration`, `fiscal_focus_dto`) isoladamente. A FIAÇÃO dentro do `Deno.serve` de `index.ts` (decisão "consultar antes de reemitir" dentro do laço real de claim) não tem um teste end-to-end simulando uma requisição HTTP completa ao worker — `Deno.serve` não é trivialmente testável sem subir um servidor real. Revisei essa fiação manualmente linha a linha (reproduzida no relatório), mas não é o mesmo nível de prova que os testes das peças.

## BOUNDARY CHECK

- `git diff --stat` confirma 100% das mudanças em `backend/supabase/functions/fiscal-worker/` — nenhum arquivo de `pdv-importados/`, nenhuma migration nova, nenhum componente React tocado.
- `FocusRemoteState`/`ProviderResult` usam vocabulário interno (`autorizado`/`processando`/`rejeitado`/`erro_transitorio`/`erro_definitivo`/`nao_encontrado`) — nenhum nome de campo ou status literal da Focus escapa dessas fronteiras.
- `buildFocusNfceEnvelope` e as URLs `/v2/nfce`/`/v2/nfe` ficam só dentro de `fiscal-provider-adapter.ts`/`fiscal_focus_dto.ts`.
- `pdv-importados/app/gerente/financeiro/**` (UI de documento fiscal) não foi tocado — continua consumindo só o schema normalizado de `documentos_fiscais_pendentes`.

## LIMITAÇÕES

1. **Schema de resposta Focus (sucesso, rejeição e consulta) não foi confirmado em detalhe** pela documentação fornecida nesta missão — só a lista de informações que cada endpoint "pode retornar". A heurística herdada (múltiplos nomes de campo possíveis para chave/protocolo) segue como estava; a distinção `rejeitado` vs `erro_definitivo` e a detecção de rejeição via consulta são heurísticas provisórias, marcadas como tal no código (`fiscal_types.ts`). **Devem ser validadas contra respostas reais de homologação antes de qualquer confiança em produção.**
2. **DTO NFC-e/NF-e estruturalmente incompleto** (7 gaps listados) — nenhuma emissão real seria aceita pela Focus hoje, mesmo com credencial e ambiente corretos. Isso é o esperado nesta fase (sem chamada real) e o próximo bloqueador explícito antes de qualquer homologação de verdade.
3. **`natureza_operacao` continua sem decisão de negócio** — precisa ser resolvido (não é tarefa técnica) antes do DTO poder ficar completo.
4. **Sem teste end-to-end do `Deno.serve`** (ver TESTES acima) — só das peças.
5. **Formato de `data_emissao`** (ISO8601 assumido) não confirmado.
6. Continuam fora, como instruído: webhook, XML/Storage, PDF/DANFE, cancelamento fiscal, CC-e, inutilização, cron/reaper scheduling, RLS de `pdv_config`/`lojas`, limpeza de código morto, emissão real, certificado real, CSC real.

---

## Revisão adversarial

- **POST duplicado após timeout?** Não — `tentativas > 0` sempre consulta primeiro; só `nao_encontrado` libera novo POST (testado).
- **Nova `ref` em retry?** Não — `resolveFocusRef` é pura e determinística por `doc.id` (testado).
- **Vazamento de token?** Testado diretamente — nenhum `console.error`/corpo de requisição contém o token durante uma chamada real com erro 5xx.
- **Loja A usando credencial B?** Testado — impossível pela própria query (`WHERE loja_id = X`).
- **Produção usando homologação ou vice-versa?** A query só encontra config do ambiente certo; mismatch = `FISCAL_CONFIG_AUSENTE`, zero HTTP (testado).
- **URL Focus fora do adapter?** Não — `resolveFocusBaseUrl`/`buildFocusEmitUrl`/`buildFocusConsultaUrl` só existem em `fiscal_credential_resolver.ts`/`fiscal-provider-adapter.ts`.
- **DTO Focus fora do adapter?** Não — `fiscal_focus_dto.ts` é o único lugar que conhece nomes de campo Focus.
- **Status Focus vazando ao domínio?** Não — `FocusRemoteState` é vocabulário interno; RPCs recebem `chave_fiscal`/`protocolo`/`erro`, nunca um `status` cru da Focus.
- **202 tratado como erro?** Não — zero RPC chamada para `processando` (testado).
- **GET causando emissão?** Não — `consultarDocumento` só faz `fetch(..., {method:"GET"})`; nenhum branch de `applyFocusRemoteState` chama uma RPC de emissão a partir de um resultado de consulta além de `fiscal_marcar_emitido` (que só GRAVA o que a Focus já decidiu, não decide nada).
- **Reaper confundido com reconciliação?** Não — funções e endpoints diferentes; reaper não foi tocado nesta onda.
- **Default tributário inventado?** Não — `natureza_operacao` e os outros 6 gaps ficam como gap explícito, nunca um valor.

Nenhum dos 12 itens da revisão adversarial encontrou problema real.

---

## ONDA C2 READY: YES

Parando aqui. Fazendo o commit da C2. **Não iniciarei C3. Não farei push. Não farei merge. Não aplicarei produção. Não farei chamada real à Focus.**
