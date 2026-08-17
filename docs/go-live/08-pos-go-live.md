# 08 — Pós Go-Live: monitoramento, riscos e dívidas

Voltar ao [plano](00-README.md). Template base: [`monitoramento.md`](../../monitoramento.md).

---

## 1. Janela de acompanhamento

| Período | Cadência | Foco |
|---|---|---|
| **D0 (dia do GO)** | contínuo até o fechamento do caixa | reconciliação AR/AP e comissão |
| **D+1 a D+7** | diário, no fechamento | caixa esperado × contado; comissões do dia |
| **D+8 a D+30** | semanal | tendência, outbox, fila fiscal |

### 1.1 Cadência das primeiras 24 horas

| Frequência | Verificar |
|---|---|
| **A cada 30 min** | taxa de erro no Sentry (§2.6) · pageload na Vercel · repetir 1–2 dos smokes de [06](06-validacao-pre-go-live.md) §3.1 |
| **A cada hora** | exceções do Sentry (agrupamento e frequência) · lag de sync — o gerente deve ver a venda em menos de 2 min |
| **No fim do dia** | fechamento de caixa conferido em conjunto · feedback do operador · métricas de desempenho |

Automatizar o que der; o que não der, alguém precisa olhar de fato.

## 2. O que monitorar

### 2.1 Reconciliação financeira — a prioridade

É o que acabou de mudar. Todo dia, no fechamento:

| Verificação | Sinal de problema |
|---|---|
| Caixa esperado (`calcular_valor_sistema_dinheiro_caixa`) × contado | divergência sem justificativa |
| Toda venda `CONCLUIDA` do dia tem **exatamente uma** comissão | venda sem comissão, ou duplicada |
| Liquidação em dinheiro → efeito correlacionado em caixa | liquidação sem contrapartida |
| Pagamento AP em dinheiro → sangria correlacionada | pagamento sem saída |
| Cancelamento com recebimento prévio → compensação registrada | dinheiro sem estorno |

`caixas.saldo_atual` é **cache operacional**, não fonte de verdade. A autoridade do esperado em
espécie é `calcular_valor_sistema_dinheiro_caixa`
([ADR-caixa](../adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md)).

### 2.2 Ledger de vendas

Divergência entre `vendas` e `venda_eventos` indica projeção falhando. Lembrar que **admin lê
`vendas` e gerente/auditoria leem `venda_eventos`** — é o achado FIN-298-07, ainda aberto, e a razão
de KPIs poderem divergir entre telas.

### 2.3 Outbox do desktop

Se o cliente usa `pdv-local`: acompanhar falhas de sync. `OUTBOX_MAX_SYNC_FAILURES=12` é o teto antes
de o item parar de tentar.

### 2.4 Fila fiscal

`documentos_fiscais_pendentes` e a DLQ. Lembrando que o fiscal é **stub** — a fila anda, mas não há
emissão real certificada.

### 2.5 Health e deployment

```bash
curl -s https://pdv-importados.vercel.app/api/health
```

Resposta real de `app/api/health/route.ts`:

```json
{ "deploymentId": "...", "gitSha": "...", "timestamp": 1234567890 }
```

`gitSha` deve continuar correspondendo ao commit publicado. Mudança inesperada = deploy não previsto.

### 2.6 Sentry — observabilidade de erros

O projeto usa **`@sentry/nextjs`** (`instrumentation.ts` e `instrumentation-client.ts`).
Configuração relevante, lida do código:

| Item | Valor real | Fonte |
|---|---|---|
| DSN do browser | `NEXT_PUBLIC_SENTRY_DSN` | `instrumentation-client.ts` |
| Ambiente | derivado de **`VERCEL_ENV`** (não de `NODE_ENV`) | `resolveSentryEnvironment()` |
| **Release** | **`VERCEL_GIT_COMMIT_SHA`** | `next.config.js` → `withSentryConfig` |
| Amostragem de traces | 10% em produção, 100% fora | `tracesSampleRate` |
| Session Replay | só em sessões **com erro**; `maskAllText`, `blockAllMedia` | `replayIntegration` |
| Source maps | ocultos no bundle público (`hideSourceMaps: true`) | `next.config.js` |
| Upload de source maps | exige `SENTRY_ORG` e `SENTRY_PROJECT` no build | `next.config.js` |

#### Verificação pós-deploy

1. **Release correlacionada.** No Sentry, a release do deploy deve ser **exatamente o `gitSha`
   retornado por `/api/health`**. Se não bater, os source maps não são correlacionados e a stack de
   produção aparece minificada.
2. **Stack trace legível.** Amostre uma exceção: deve mostrar `arquivo:linha`, não bundle minificado.
3. **Sem pico de erro.** Logo após o deploy, a taxa deve estar próxima de zero.
4. **Redação de payload ativa** — a PR #305 (`fix(observability): redact sensitive Sentry payloads`)
   introduziu `lib/observability/redact.ts`. Confirmar em um evento real que dados sensíveis não
   aparecem no payload enviado.

> ⚠️ **Lacuna conhecida.** Nenhuma variável do Sentry consta em
> [`pdv-importados/.env.example`](../../pdv-importados/.env.example) — nem `NEXT_PUBLIC_SENTRY_DSN`,
> nem `SENTRY_ORG`/`SENTRY_PROJECT`. Sem elas configuradas na Vercel, o Sentry **fica silenciosamente
> desligado** (`enabled` depende do ambiente e do DSN) e o upload de source maps não acontece.
> **Conferir no painel da Vercel antes do GO** — o `.env.example` não vai lembrar você disso.

### 2.7 Limiares de alerta

| Métrica | 🟡 Amarelo | 🔴 Vermelho |
|---|---|---|
| Taxa de erro no Sentry | > 0,5% | > 2% |
| Pageload na Vercel (LCP) | > 2 s | > 4 s |
| Lag de sync | > 3 min | > 5 min |
| Falhas de autenticação | > 10/h | > 50/h |
| Timeouts de RPC | > 5/h | > 20/h |

**Ação:**

- 🟡 → avisar o time e investigar
- 🔴 → acionar o on-call (§6) e **preparar** decisão de rollback — ler [07](07-go-live-day.md) §4 antes de agir

> Estes limiares vieram do runbook depreciado e **nunca foram calibrados com tráfego real**. Trate-os
> como ponto de partida e ajuste após a primeira semana do cliente.

## 3. Riscos residuais em produção

### 3.1 Comprovados e fechados (com gate de regressão)

§11.9: escrita direta do contador de caixa, writer legado, venda offline em dinheiro, ADMIN
cross-loja em AR, acréscimo acima da tabela, desconto manual offline sem teto, retry offline,
diagnósticos cross-loja, colisão de chave AP, ausência de estorno AR/AP, tipos divergentes.

**Só valem em produção depois de aplicado o Grupo B** ([03](03-deploy-backend.md) §1.1).

### 3.2 Teóricos — reais no desenho, sem ocorrência comprovada

| Risco | Escopo | Mitigação disponível |
|---|---|---|
| Estoque offline fora da transação | desktop | não usar desktop, ou conferir estoque diariamente |
| Venda offline sem `caixa_id` sem âncora de catálogo | desktop | exigir caixa aberto no desktop |
| Faixa/promoção não validadas no offline | desktop | idem |
| `DELETE` em `caixas` concedido a `authenticated` | web | limitado por policy e FKs; caixa com movimento não é apagável |

### 3.3 Não comprovados

§11.9 lista explicitamente como **não comprovados**: estado remoto de produção após a remediação;
universo histórico e necessidade de repair; rollout real na Vercel com dois deployments; e
concorrência real entre processos distintos — as provas existentes rodam em transação única.

Ou seja: **o primeiro cliente pagante é, na prática, a primeira execução real desses cenários.**
Tratar as duas primeiras semanas como observação ativa, não como operação estável.

### 3.4 Abertos e conhecidos

| Item | Ref. |
|---|---|
| FIN-298-07 — KPIs de fontes diferentes entre telas | §8.6 |
| Telas financeiras (AR, AP, caixa, relatórios) não reconciliadas com o contrato líquido | §12.8 |
| Repair histórico de AR/AP legado (`idempotency_key IS NULL`) não executado | §11.5 item 4 |
| Reabertura de caixa sem implementação localizada | FIN-298-09 |
| `anon` em 2 RPCs `SECURITY DEFINER` | [02](02-ambiente-producao.md) §3.1 |
| `GL-DENO-LOCK` | [03](03-deploy-backend.md) §7.1 |

## 4. Repair histórico — não improvisar

Liquidações e pagamentos anteriores à remediação têm `idempotency_key IS NULL` e **não têm caixa
inferível**. O plano (§9.3) é explícito:

> **Backfill automático é proibido.** Repair somente com fonte externa ou turno comprovado, com
> chave determinística e `ON CONFLICT` para impedir dupla contabilização.

Diagnóstico read-only deve separar `SEM_CAIXA_COMPROVÁVEL`, `CAIXA_UNÍVOCO` e `AMBÍGUO` antes de
qualquer escrita. Contas com `valor_pago` diferente da soma do histórico devem ser **bloqueadas para
análise**, nunca corrigidas em silêncio.

## 5. Critério para declarar operação estável

Depois de **30 dias** com todos verdadeiros:

- [ ] Nenhuma divergência de caixa sem justificativa
- [ ] Nenhuma venda concluída sem comissão
- [ ] Nenhuma liquidação/pagamento sem contrapartida
- [ ] Outbox sem acúmulo (se desktop)
- [ ] Reauditoria independente do bloco AR/AP concluída (L2)
- [ ] Riscos teóricos §3.2 sem ocorrência real

---

## 6. Escalonamento e on-call

> **Preencher antes do GO.** Os campos abaixo estavam como placeholders no runbook depreciado e
> **continuam sem preencher**. Um plano de escalonamento com `[Nome]` não escala nada.

| Papel | Nome | Contato | Telefone |
|---|---|---|---|
| **Responsável técnico** | `________` | `________` | `________` |
| **Responsável de negócio / dono** | `________` | `________` | `________` |
| **Contato no cliente** (gerente da loja) | `________` | `________` | `________` |

### Caminho de escalonamento

```
Problema detectado
    ↓ (5 min)
Responsável técnico investiga
    ├→ Menor            → registrar, planejar correção
    ├→ Relevante mas contornável → hotfix + redeploy coordenado
    └→ Crítico / dinheiro ou dado inconsistente
           → PARAR  →  [07] §4  →  avisar dono e cliente
```

**O que é crítico aqui** (ver [10-troubleshooting.md](10-troubleshooting.md) §8): dinheiro recebido
sem contrapartida, caixa fechando com divergência inexplicada, venda sumida ou duplicada, estoque
divergente sem lançamento, qualquer sinal de dupla contabilização.

> ⚠️ Escalonar **não** é sinônimo de reverter. Com o bloco financeiro aplicado, reverter só a
> aplicação derruba AR/AP para toda a base. A decisão de rollback é de [07](07-go-live-day.md) §4.

## 7. Post-mortem

Obrigatório após qualquer rollback ou incidente que afete dinheiro, estoque ou dado do cliente.

1. Abrir issue no GitHub com a tag `rollback` (ou `incident`)
2. Registrar **o que falhou, quando e por quê**, com evidência — logs, IDs de venda, prints
3. Registrar o que foi feito, na ordem em que foi feito
4. Classificar: defeito de código · defeito de dado · defeito de processo · lacuna de documentação
5. Planejar a correção e **validar no banco local** (`supabase db reset --local`) — não há staging
6. Só então planejar o redeploy, novamente coordenado banco↔app

> Se o incidente expôs uma lacuna deste plano, **corrigir os arquivos de `docs/go-live/` no mesmo
> post-mortem**. Documento que não aprende com incidente vira o próximo `GO-LIVE-RUNBOOK.md`.

→ Próximo: [09-primeiro-cliente.md](09-primeiro-cliente.md)
