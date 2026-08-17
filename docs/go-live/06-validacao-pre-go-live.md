# 06 — Validação antes do GO

Voltar ao [plano](00-README.md). Complementa [`docs/E2E.md`](../E2E.md) e
[`docs/P0_CHECKLIST_OPERACIONAL.md`](../P0_CHECKLIST_OPERACIONAL.md).

---

## 1. Sequência completa, do zero

Esta é a sequência registrada como executada sem flake em §12.6 do
[relatório](../../GO_LIVE_CERTIFICATION_REPORT.md). Rodar inteira, na ordem:

```bash
npx supabase db reset --local --yes
```
```bash
npm run seed:dev-users -w pdv-importados
```
```bash
npm run smoke:rls-rest -w fastproduct-backend
```
```bash
npm run test:rls-scope -w fastproduct-backend
```
```bash
npm run test:financial -w fastproduct-backend
```
```bash
npm run test:financial-concurrency -w fastproduct-backend
```
```bash
npm run check:types-drift -w fastproduct-backend
```
```bash
npm run ci
```

### Resultados de referência

| Etapa | Esperado | Fonte |
|---|---|---|
| `test:rls-scope` | **42/42** | §11.8 |
| `test:financial` | **6/6** (5 suítes + concorrência) | §11.8, §12.6 |
| `vitest` (via `npm run ci`) | **923/923** | §12.6 |
| `check:edge` | 3 Edge Functions OK | §12.6 |

Divergência para menos é **bloqueador**. Não interpretar teste ausente como teste verde.

## 2. Guardas estruturais

```bash
npm run guard:all
```

Cobre 8 guardas — `core`, `pdv`, `routes`, `rpc`, `pricing`, `deps`, `migrations`, `domain` — mais
`check:entity-ssot`. O `guard:migrations` valida a sequência e o SSOT único conforme
[ADR-011](../adr/ADR-011-ssot-unico-migrations.md).

## 3. E2E

```bash
npm run test:e2e:critical -w pdv-importados
```

> 🟠 **`sync-fluxo` não é gate SSRA.** O relatório (§5) classifica o E2E crítico do Playwright como
> *"sistema de risco"*: ele **não bloqueia** o deploy. Para um cliente pagante, tratar como gate
> manual — se falhar, decidir explicitamente, não ignorar.

Homologação do fluxo de Go-Live:

```bash
npm run check:golive -w pdv-importados
npm run check:caixa-pre-producao -w pdv-importados
```

### 3.1 Smoke tests manuais pós-deploy — os 7 testes

Roteiro manual executado **depois** do deploy, no navegador, contra produção. Portado do
`GO-LIVE-RUNBOOK.md` (depreciado) com as correções de URL, health check e rollback já aplicadas.

**Tempo total: ~24 minutos.** Correspondem aos passos 13–22 de
[07-go-live-day.md](07-go-live-day.md) §3 — este é o detalhamento; aquele é a cronologia.

> ⚠️ **Não existe staging.** Estes testes rodam contra **produção**. Use os usuários de teste e
> desfaça o que criar (a venda de teste vira dado real).

#### Teste 1 — Login do operador (3 min) · 🔴 crítico

1. Abrir **https://pdv-importados.vercel.app**
2. Ir para `/login`
3. Entrar com `PLAYWRIGHT_CAIXA_TEST_EMAIL` / `PLAYWRIGHT_CAIXA_TEST_PASSWORD`
4. Verificar que chega em `/caixa` e o painel carrega

**Esperado:** painel do operador visível, console do navegador sem erro.
**Se falhar:** 🔴 parar → [07](07-go-live-day.md) §4.

#### Teste 2 — Busca e adição de produto (5 min) · 🔴 crítico

1. No campo de busca/scanner, digitar o código de barras (`PLAYWRIGHT_E2E_PRODUTO_CODIGO`)
2. Enter · aguardar 2–5 s
3. Verificar mensagem de sucesso (não "não encontrado")
4. Verificar item no carrinho **com o preço correto**

**Se falhar:** 🔴 busca de produto quebrada → parar.

#### Teste 3 — Finalização de venda (5 min) · 🔴 crítico

1. "Finalizar venda"
2. Forma de pagamento **DINHEIRO**
3. Confirmar · aguardar 10–20 s
4. Verificar "Venda registrada/concluída" e o cupom com total e itens

**Se falhar:** 🔴 registro de venda quebrado → parar.

#### Teste 4 — Visibilidade no painel do gerente (3 min) · 🟡

1. Sair do operador · entrar com `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD`
2. Ir para `/gerente`
3. Localizar a venda do Teste 3 em "Últimas vendas"
4. Conferir que o timestamp é de 1–2 minutos atrás

**Se falhar:** 🟡 sync atrasado — aguardar 5 min e repetir. Persistindo, tratar como 🔴.

> Lembrar que **admin lê `vendas` e gerente/auditoria leem `venda_eventos`** (FIN-298-07, aberto).
> Divergência entre as duas telas é o defeito conhecido, não necessariamente falha do deploy.

#### Teste 5 — Abertura de caixa (5 min) · 🟡

1. Voltar como operador · `/caixa`
2. "Operações" → "Abrir caixa"
3. Valor inicial **R$ 100,00** · confirmar
4. Verificar "Caixa aberto" e o saldo exibido igual ao informado

**Se falhar:** 🟡 verificar o Sentry ([08](08-pos-go-live.md) §2.6).

#### Teste 6 — Sentry (2 min) · 🟡

Detalhado em [08-pos-go-live.md](08-pos-go-live.md) §2.6. Em resumo: nenhum *issue* crítico novo, e
uma stack trace amostrada deve aparecer **legível** (`arquivo:linha`), não minificada.

**Decisão:** mais de ~10 issues novos → investigar antes de prosseguir.

#### Teste 7 — Vercel Analytics (1 min) · 🟡

1. Projeto `pdv-importados` → aba **Analytics**
2. Pageload (LCP) **< 3 s**
3. Sem erros 5xx no gráfico de taxa de erro

**Decisão:** erro > 1% → investigar.

#### Tabela de resultados

| # | Teste | Severidade | Status | Nota |
|---|---|---|---|---|
| 1 | Login do operador | 🔴 | ☐ ✅ / ☐ 🔴 | |
| 2 | Busca e adição de produto | 🔴 | ☐ ✅ / ☐ 🔴 | |
| 3 | Finalização de venda | 🔴 | ☐ ✅ / ☐ 🔴 | |
| 4 | Visibilidade no gerente | 🟡 | ☐ ✅ / ☐ 🟡 | |
| 5 | Abertura de caixa | 🟡 | ☐ ✅ / ☐ 🟡 | |
| 6 | Sentry | 🟡 | ☐ ✅ / ☐ 🟡 | |
| 7 | Vercel Analytics | 🟡 | ☐ ✅ / ☐ 🟡 | |

**Decisão:**

- Todos ✅ → seguir para a aceitação financeira ([07](07-go-live-day.md) §3, passos 17–20)
- Qualquer 🔴 → **parar**; rollback conforme [07](07-go-live-day.md) §4 — ⚠️ **nunca reverter só a aplicação**
- Vários 🟡 → observar 5 min e decidir explicitamente

> Estes 7 testes cobrem **venda e sessão**. Eles **não** provam a cadeia financeira — recebimento,
> pagamento AP, comissão e estorno são os passos 17–20 de [07](07-go-live-day.md) §3, e são o motivo
> real deste deploy.

## 4. Validação de dados

### 4.1 Ledger de vendas

Toda venda concluída deve ter evento no ledger. Online: RPC v4 registra `SALE_REGISTERED`. Offline:
a Edge chama `ensure_venda_evento_registrado(..., 'sync_outbox')`.

```bash
node backend/scripts/sync-outbox-contract-smoke.mjs
```

### 4.2 Comissões

Só faz sentido validar **depois** de aplicar o Grupo B ([03](03-deploy-backend.md) §1.1). Sem essas
migrations, a comissão em produção depende de `AFTER UPDATE OF status` e pode simplesmente não nascer.

Após aplicar, conferir na produção que toda venda `CONCLUIDA` do dia tem exatamente uma linha de
comissão — `LEFT JOIN` de `vendas` com `comissoes_vendedores`, conforme o método descrito em §9.3
(FIN-298-03 item 9) do relatório.

### 4.3 Reconciliação caixa × AR/AP

Após o Grupo B: para cada liquidação em dinheiro, deve existir efeito correlacionado em caixa.
Antes do Grupo B, **não existe** — é o defeito FIN-298-01/02.

## 5. Testes de carga

Existem ferramentas no repositório:

```bash
npm run stress:pdv
npm run stress:pdv:check
npm run gate:pdv
```

> ⚠️ **Não apontar stress test para produção.** Não há staging; o alvo seria o banco do cliente.
> Rodar apenas contra o banco local do `db reset`.

**Lacuna honesta:** não há teste de carga com número-alvo definido para o perfil deste cliente
(transações/hora, PDVs simultâneos). Sem esse número, "passou no stress" não significa nada.
Ver §7 abaixo.

## 6. Reauditoria pendente do bloco AR/AP

> 🔴 **Bloqueador de escopo, não técnico.**
>
> §11.10 do relatório: *"Fase 3A — comissão: continua **NÃO AUTORIZADA**. Depende de reauditoria
> independente desta remediação"*. §12.7: `FASE 3A: NÃO LIBERADA`.
>
> A remediação AR/AP foi implementada e tem gate de regressão, mas **não foi reauditada por terceiro
> independente**. Para dinheiro de cliente pagante, essa reauditoria deveria acontecer antes do GO —
> ou o risco ser aceito por escrito, com ciência de que os P0 financeiros foram fechados pelo mesmo
> agente que os identificou.

## 7. Lacunas — o que falta para um Go-Live 100% seguro

Levantadas nesta análise. Nenhuma tem correção no repositório hoje.

| # | Lacuna | Severidade | Nota |
|---|---|---|---|
| L1 | 30 migrations não aplicadas em produção | 🔴 | [03](03-deploy-backend.md) §1 |
| L2 | Reauditoria independente do bloco AR/AP não executada | 🔴 | §6 acima |
| L3 | `anon` executa `converter_venda_em_espera` e `devolver_venda_em_espera` | 🟠 | **achado novo** — sem migration de correção. [02](02-ambiente-producao.md) §3.1 |
| L4 | `GL-DENO-LOCK` aberto em 2 de 3 Edge Functions | 🟠 | [03](03-deploy-backend.md) §7.1 |
| L5 | E2E `sync-fluxo` não é gate bloqueante | 🟠 | §3 acima |
| L6 | Sem alvo de carga definido para o perfil do cliente | 🟠 | §5 acima |
| L7 | Repair histórico de AR/AP legado não executado | 🟡 | §11.5 item 4 |
| L8 | Telas financeiras além de comissões não reconciliadas | 🟡 | §12.8 |
| L9 | Fiscal é stub — sem emissão real certificada | 🟡 | [02](02-ambiente-producao.md) §5 |
| L10 | `auth_leaked_password_protection` desabilitado | 🟡 | [02](02-ambiente-producao.md) §3.3 |
| L11 | Proveniência das Edge Functions em produção não corresponde à branch | 🟡 | [02](02-ambiente-producao.md) §2 |
| L12 | **Issues #262, #261, #260, #259, #136, #66 não verificadas** | ❓ | GitHub retornou HTTP 503 durante toda a análise de 2026-08-17. Precisam ser lidas antes do GO. |
| L13 | Documentos oficiais de requisitos ausentes | 🟡 | `Especificação de Alterações…pdf` e `Princípios-de-Engenharia.txt` nunca estiveram no repositório (§8.1, §9.1) |
| L14 | Regra oficial de reabertura de caixa | 🟡 | FIN-298-09; decidido por DB-07 (novo turno vinculado), sem implementação localizada |

## 8. Checklist de saída

- [ ] Sequência §1 completa e verde, com os números de referência
- [ ] `guard:all` verde
- [ ] E2E crítico executado; falhas decididas explicitamente
- [ ] `check:golive` e `check:caixa-pre-producao` verdes
- [ ] Validação de ledger executada
- [ ] L1 resolvida (migrations aplicadas)
- [ ] L2 resolvida **ou** risco aceito por escrito
- [ ] L3 e L4 decididas
- [ ] L12 resolvida — issues lidas
- [ ] Demais lacunas registradas e comunicadas

→ Próximo: [07-go-live-day.md](07-go-live-day.md)
