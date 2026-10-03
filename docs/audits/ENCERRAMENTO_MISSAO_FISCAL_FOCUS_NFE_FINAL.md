# Encerramento da Missão — Frente Fiscal Focus NFe

> **Atualização 2026-10-03 — Sprint P0 Focus:** o contrato do XML (`caminho_xml_nota_fiscal`, links sem autenticação),
> do cancelamento (`caminho_xml_cancelamento`), do PIX (17/20/23) e de `natureza_operacao` (obrigatória, sem default)
> foi confirmado pela Focus. Obtenção do XML, cancelamento com XML separado e classificação por `status` estão
> implementados. Os itens "Obtenção do XML autorizado", "Respostas Focus (Cancelada)" e "Cancelamento fiscal integrado"
> abaixo estão superados. Estado atual: `docs/audits/SPRINT_P0_FOCUS_NFE_PRONTIDAO.md`.

**Data:** 2026-09-03
**Branch:** `claude/jinlong-focus-nfe-readiness-d5524b`
**HEAD final:** `32a5c16e`
**Escopo:** Fase A → C1 → C2.x → C2.11 (gate final independente: PASS/GO) → Missão final (C3 XML + fechamento de infraestrutura local restante). Nenhuma emissão fiscal real, nenhuma credencial real, nenhuma migration remota, nenhum deploy, nenhum merge, em nenhum momento.

Este documento substitui a necessidade de reler os 20+ relatórios intermediários em `docs/audits/`. Eles continuam como evidência detalhada por gate; este é o documento canônico de estado final.

---

## 1. O que foi concluído

**Preservado do gate independente C2.11 (não reaberto, sem regressão):** identidade de provider fail-closed (persistir → confirmar → só então POST), não-duplicidade local sob crash/restart/reaper/DLQ/reprocessamento, snapshot de sync fail-closed (sem reconstrução escalar silenciosa), idempotência semântica de pagamentos na RPC de sync.

**Novo nesta missão final:**
1. **C3 — persistência local do XML autorizado** (infraestrutura completa; obtenção do XML da Focus em si fica BLOCKED EXTERNAL — ver seção 9).
2. **Bug de auditoria corrigido**: congelamento de identidade de provider agora aparece na timeline (`documentos_fiscais_eventos`) — antes era invisível.
3. **Bug de integridade corrigido**: XML vazio/malformado não pode mais ser marcado `ARMAZENADO`.
4. Verificação real (não só leitura de código) de que Supabase Storage funciona ponta-a-ponta no stack local — upload, download, e isolamento de bucket privado confirmados contra `anon`.

## 2. Arquitetura fiscal final

```
Venda (domínio PDV/caixa)
  │  imutável — nunca "vira" documento fiscal
  ▼
DocumentoFiscal (documentos_fiscais_pendentes)
  │  snapshot congelado; máquina de estados
  │  PENDENTE → EM_PROCESSAMENTO → EMITIDO/ERRO/CANCELADO
  │  identidade de provider (empresa+ambiente+provider) persistida e
  │  imutável, pré-condição fatal para POST (P0-1, C2.10/C2.11)
  ▼
FiscalProvider (port — fiscal-provider-adapter.ts)
  │  Mock/Http/Focus/Bling — implementações de infraestrutura
  ▼
FocusProvider — emitir (POST) / consultar (GET) / obterXmlAutorizado (GET, novo)
  ▼
Focus NFe (API REST) → SEFAZ

                    ┌──────────────────────────────────────┐
DocumentoFiscal ──► │ fila de XML (fiscal_claim_documentos_xml) │ ── NOVO (C3)
  EMITIDO           │ desacoplada do fluxo de emissão:          │
                    │ nunca toca status/provider/chave_fiscal/  │
                    │ protocolo/tentativas                      │
                    └──────────────────────────────────────┘
                                  │
                                  ▼
                    Storage privado "documentos-fiscais-xml"
                    path: <provider_identity>/<tipo_doc>/<id>.xml
```

Focus continua inteiramente um adapter de infraestrutura. Nenhum DTO/status/URL/token vazou para o domínio da Venda, PDV ou React. A fila de XML é um segundo fluxo, paralelo, com suas próprias RPCs — nunca compartilha um caminho de escrita com o fluxo de emissão.

## 3. Migrations criadas nesta missão final (além das já certificadas em C2.11)

| Migration | O que faz |
|---|---|
| `20260903150000_fiscal_xml_persistence.sql` | Colunas `xml_status`/`xml_storage_path`/`xml_sha256`/`xml_tentativas`/`xml_proxima_tentativa_em`; trigger inicializa `xml_status=PENDENTE` ao virar EMITIDO; RPCs `fiscal_claim_documentos_xml`/`fiscal_marcar_xml_armazenado`/`fiscal_marcar_xml_bloqueado`/`fiscal_marcar_xml_erro`; bucket privado `documentos-fiscais-xml`. 8 provas vivas. |
| `20260903160000_fiscal_eventos_provider_congelado.sql` | Novo evento `PROVIDER_CONGELADO` na timeline de auditoria — bug de observabilidade encontrado e corrigido durante esta missão. 2 provas vivas. |

Todas as migrations anteriores (C1 → C2.11, 23 arquivos) permanecem certificadas e intocadas nesta rodada.

## 4. XML / Storage / Recovery

- **Invariante absoluto garantido por construção**: as 3 RPCs `fiscal_marcar_xml_*` só têm colunas `xml_*` + `updated_at` em seu `SET` — nenhuma é capaz de tocar `status`/`provider`/`chave_fiscal`/`protocolo`/`tentativas`. Confirmado ao vivo (Postgres real): um ciclo completo de armazenar/bloquear/errar XML não altera nenhum campo do fluxo de emissão.
- **Path determinístico**: `<identidade_provider_congelada_sanitizada>/<tipo_doc>/<documento_id>.xml` — reaproveita a identidade já imutável (C2.10/C2.11) como isolamento loja+ambiente+provider, sem mecanismo paralelo.
- **Idempotência**: mesmo path + mesmo hash em cima de um XML já `ARMAZENADO` = no-op silencioso (retry seguro).
- **Imutabilidade**: path/hash diferente em cima de já `ARMAZENADO` = rejeitado (`FISCAL_XML_JA_ARMAZENADO_IMUTAVEL`) — mesmo princípio já usado para a identidade de provider.
- **Recovery é read-only em relação à emissão**: `obterXmlAutorizado` é GET-only por construção (nunca chama `postFocusEmit`/`buildFocusEmitUrl`); testado com um spy de `fetch` provando ZERO chamadas de rede durante um ciclo de blocked_external.
- **Retenção**: bucket privado, sem policies para `authenticated`/`anon` — só `service_role` (que tem `BYPASSRLS`, confirmado no Postgres real) toca o bucket. Nenhuma tela de download de XML existe ainda (não implementada — especulativa, fora de escopo).
- **Storage local real testado**: upload + download com conteúdo idêntico confirmado; tentativa de leitura com a chave `anon` bloqueada (confirmado, não apenas assumido).
- **Obtenção do XML da Focus em si**: `FocusProvider.obterXmlAutorizado` retorna `BLOCKED_EXTERNAL` imediatamente, **zero chamada de rede** — o nome do campo/endpoint que a Focus usa para devolver o XML autorizado nunca foi confirmado pela documentação oficial colada nesta missão (mesma lacuna de `RESPOSTAS FOCUS` desde o Gate C2.5). Não inventado. `MockProvider` implementa uma versão fake só para provar a infraestrutura de ponta a ponta.

## 5. Emissão / query / idempotência

Sem mudanças nesta rodada — reauditado e reconfirmado PASS (ver seção 6 para as provas reexecutadas): identidade fail-closed, `enforceRetrySafeGate`, `ja_tentou_emissao_antes`, RPC de pagamentos com comparação semântica.

## 6. Segurança / retenção / multiempresa

- Identidade de provider imutável (empresa+ambiente+provider) — reconfirmada ao vivo após o rebuild completo.
- `documentos_fiscais_pendentes.venda_id` `ON DELETE RESTRICT` — reconfirmado.
- DELETE direto de `authenticated` bloqueado (retenção) — reconfirmado.
- XML herda o mesmo isolamento multiempresa via prefixo de path + bucket 100% `service_role`.
- Credencial da fila de XML resolvida **por documento** (a partir da identidade congelada, nunca da config global do worker) — mesma disciplina do P0-1 de emissão, reaproveitando `resolveFocusCredential`.

## 7. Testes executados — PASS / FAIL / SKIPPED

| Suíte | Resultado |
|---|---|
| `deno check` (fiscal-worker + sync-outbox) | **PASS** — 0 erros |
| `deno test` (fiscal-worker + sync-outbox) | **PASS — 114/114** (98 já certificados em C2.11 + 16 novos desta missão) |
| `tsc --noEmit` (pdv-importados, projeto inteiro) | **PASS** — 0 erros |
| `vitest run --config vitest.integration.config.ts` (Postgres real local) | **13/14 PASS** — 1 falha pré-existente (ver abaixo) |
| `vitest run` (unitário, projeto inteiro) | **1258 PASS, 2 SKIPPED**, 1 arquivo falhou (ver abaixo) |
| Provas vivas Postgres (rebuild do zero + reseed) | **PASS** — identidade/congelamento (5 cenários), RESTRICT, retenção, `ja_tentou_emissao_antes` sobrevivendo a reprocessamento (3 cenários), idempotência de pagamentos (10 cenários incluindo adversariais: formas duplicadas, arredondamento, split↔escalar nas duas direções), XML (6 cenários), evento `PROVIDER_CONGELADO` (2 cenários) |
| Storage real (upload/download/isolamento) | **PASS** — testado contra o stack local reconstruído do zero |
| `SKIPPED` contado como PASS em algum lugar? | **Não** — nenhum |

**Falhas pré-existentes, não causadas por esta missão (confirmado por `git diff origin/main`, zero diferença):**
1. `app/caixa/server/cancelarVendaContrato.integration.test.ts` — `cookies() was called outside a request scope`. Mesma causa raiz documentada desde antes desta missão.
2. `app/admin/produtos/productUpdater.semRpc.integracao.test.ts` (suíte unitária geral) — usa uma chave de service role placeholder (`MOCK_SERVICE_ROLE_KEY_DO_NOT_COMMIT`) quando `SUPABASE_SERVICE_ROLE_KEY` não está definida; o teste só verifica se o stack está *alcançável* (não se a credencial é válida), então, com o stack fiscal desta missão de pé, ele tenta rodar de verdade e falha no parsing do JWT placeholder. Em CI normal (sem Postgres local ativo) este arquivo é `describe.skip`. Zero diff vs `origin/main` — artefato de acoplamento de ambiente (versão do Supabase CLI local emite chaves `sb_secret_...`, não JWT legado), não uma regressão desta missão.

## 8. Bugs encontrados e corrigidos durante a missão

1. **Congelamento de provider invisível na auditoria** (`323e7c9f`) — `tg_documentos_fiscais_eventos_au` só reagia a mudanças de `status`; uma UPDATE que só muda `provider` (o congelamento em si, P0-1 de C2.10/C2.11) nunca gerava evento na timeline. Corrigido: novo evento `PROVIDER_CONGELADO`, logado só na 1ª transição real (a imutabilidade já garantida impede qualquer segunda tentativa de chegar a esta UPDATE).
2. **XML vazio/inválido podia ser marcado `ARMAZENADO`** (`32a5c16e`) — `processXmlDocumento` fazia upload e confirmava sucesso para qualquer string devolvida por `obterXmlAutorizado`, incluindo vazia ou claramente não-XML. Corrigido: validação mínima interna (conteúdo não-vazio e começando com `<`) antes de subir para o Storage.

Nenhum outro bug P0/P1 encontrado nesta rodada além destes dois — o restante da infraestrutura (emissão, retry, idempotência, retenção, multiempresa) já havia sido auditado e certificado PASS no gate independente C2.11 e foi reconfirmado sem regressão.

## 9. BLOCKED EXTERNAL restantes

`WebFetch`/`WebSearch` foram testados nesta sessão (múltiplas tentativas, inclusive contra `example.com`) e continuam **indisponíveis por falha de infraestrutura** (mesmo diagnóstico já registrado 3x em sessões anteriores) — não foi possível confrontar novamente a documentação oficial da Focus. Nenhum item abaixo pôde ser desbloqueado nesta rodada por falta de acesso a documentação nova; todos permanecem exatamente como certificados no Gate C2.5/C2.7, e cada um precisa da informação específica listada:

| Item | O que falta exatamente | De quem |
|---|---|---|
| **Tributação (ICMS/PIS/COFINS)** | Nomes de campo do grupo de tributação em `campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html` (seção de tributação — a parte não-tributária já foi confirmada e implementada) | Documentação oficial Focus (colar a seção específica) |
| **Obtenção do XML autorizado (C3)** | Nome do campo/endpoint que devolve o XML (ex.: algo como um `caminho_xml_nota_fiscal`) — nunca confirmado | Documentação oficial Focus |
| **Respostas Focus (JSON exato)** | Corpo real de cada um dos 5 estados de consulta (Processando/Autorizada/Rejeitada/Cancelada/Não encontrada) — sem isso, o estado `cancelado` não existe em `FocusRemoteState` e uma consulta a documento cancelado pode ser mal-classificada (risco residual já documentado em `fiscal_types.ts`) | Documentação oficial Focus, ou captura de uma consulta real em homologação |
| **PIX** | Modalidade real usada no PDV (estático/dinâmico/automático) — decisão operacional, não documentação | Responsável operacional da loja |
| **Cartão — dados transacionais** | Se `bandeira_operadora`/`numero_autorizacao` são obrigatórios para os códigos `03`/`04` | Documentação oficial Focus ou teste em homologação |
| **Destinatário identificado** | Campos exatos exigidos pela Focus para NFC-e/NF-e com destinatário identificado fora do estado | Documentação oficial Focus |
| **Dados fiscais do produto de teste** | NCM/CFOP/`icms_origem`/CSOSN/CST reais (ficha completa já produzida no Gate C2.7) | Contador/responsável fiscal da loja |
| **Credencial Focus de homologação** | Token real cadastrado em `fiscal_provider_config` | Operacional |

Nenhum destes foi resolvido por invenção — todos permanecem exatamente `BLOCKED EXTERNAL`, cada um com a informação exata necessária já listada acima (a maioria já estava assim desde o Gate C2.5/C2.7; nada regrediu, nada foi resolvido por falta de acesso a nova documentação).

## 10. Pendências P1/P2 não bloqueantes

- **Cancelamento fiscal integrado** — não implementado. Depende do mesmo gap de RESPOSTAS FOCUS (detectar o estado "Cancelada") para ser feito com segurança; implementar sem isso arriscaria inventar comportamento.
- **CC-e (Carta de Correção)** — não implementado, mesmo motivo de dependência externa.
- **DANFE/PDF** — não implementado; provavelmente tem o mesmo padrão de "campo com URL não confirmado" do XML.
- **Webhook Focus** — deliberadamente não implementado (payload/assinatura não confirmados); reconciliação sob demanda já cobre a mesma necessidade sem essa dependência.
- **Tela de download de XML para gerente** — não implementada (especulativa, sem UI requerida ainda); quando existir, precisará de uma policy de Storage nova (mesmo padrão de `produto-imagens`).
- **Catálogo real** — saneamento/classificação fiscal em massa dos produtos existentes; trabalho de dado, não de código.
- **`productUpdater.semRpc.integracao.test.ts`** — acoplamento de ambiente com o formato de chave do Supabase CLI local atual; não é fiscal, fora do domínio desta missão, não tocado.

## 11. Commits / diff final

Working tree limpo ao final, exceto `.claude/scheduled_tasks.lock` e `backend/supabase/functions/fiscal-worker/deno.lock` (drift pré-existente, não relacionado a esta missão, não tocado) e `AGENTS.md` (origem não comprovada, já sinalizado em sprints anteriores, não tocado).

Commits desta missão final (sobre o HEAD já certificado `b4a1b3f0` do gate independente C2.11):

| Commit | O que faz |
|---|---|
| `d3868200` | C3 — persistência local do XML: migration + provider adapter + orquestração + testes |
| `323e7c9f` | Fix: evento `PROVIDER_CONGELADO` na timeline de auditoria |
| `32a5c16e` | Fix: valida conteúdo do XML antes de marcar `ARMAZENADO` |

Todo o diff desta missão final está confinado a `backend/supabase/migrations/` (2 arquivos novos) e `backend/supabase/functions/fiscal-worker/` (5 arquivos: 1 novo módulo + teste, 3 alterados). Nenhum arquivo fora do domínio fiscal foi tocado.

## 12. Estado final

**INFRAESTRUTURA FISCAL LOCAL: READY**
Tudo que dependia apenas do código deste repositório está implementado e comprovado por prova real (Postgres do zero + Storage real + Deno + TypeScript + integração): identidade fail-closed, não-duplicidade local, snapshot imutável, idempotência de pagamentos, persistência de XML, retenção, isolamento multiempresa, auditoria/timeline.

**PRONTO PARA HOMOLOGAÇÃO FOCUS: NO**
Bloqueado **exclusivamente por fatores externos**, nenhum deles técnico/local: documentação oficial da Focus ainda faltando para tributação/XML/respostas/destinatário/cartão (seção 9), decisão operacional de PIX, dados fiscais reais do produto de teste, e a credencial de homologação em si. Não há mais nenhum defeito arquitetural conhecido que impeça avançar assim que essas informações chegarem.

**PRONTO PARA PRODUÇÃO FISCAL: NO**
Depende de homologação bem-sucedida primeiro (checklist completo em `ENCERRAMENTO_SPRINT_PRONTIDAO_FISCAL_FOCUS.md`, inalterado).

---

Nenhuma ação de produção, chamada real à Focus, uso de credencial real, migration remota, deploy, push ou merge foi realizada nesta missão. Parado no critério de encerramento (B): o próximo avanço depende necessariamente de documentação oficial da Focus e/ou dados operacionais que esta sessão não possui.
