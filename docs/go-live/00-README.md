# Plano de Go-Live — Primeiro Cliente Pagante

> ## Baseline do piloto (2026-08-27) — ler primeiro
>
> O piloto web está em **GO** com `main` = produção = **`e1327e62`**.
> Fonte: [`../piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md`](../piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).
>
> **Esta pasta** (criada 2026-08-17, branch `codex/ap-payments-reconciliation`) descreve o
> evento *seguinte*: cliente pagante além do piloto. O alerta abaixo (“30 migrations”)
> é **histórico daquela data**. Não usá-lo como NO-GO do piloto atual. Revalidar o
> ledger só antes de um segundo cliente ou janela DDL.

**Criado em:** 2026-08-17 · **Branch de referência:** `codex/ap-payments-reconciliation`
**Escopo:** implantação do **primeiro cliente pagante**, distinta do Go-Live do piloto.

---

## Resumo executivo

O sistema **já está em produção desde 2026-08-09**, mas com o **piloto** (loja Matriz, autorização de
DONO Demo). Este plano trata do evento seguinte: colocar um **cliente pagante real** operando.

> ## 🔴 BLOQUEADOR (histórico 17/08) — produção estava atrás do repositório
>
> **Na data deste plano**, 30 migrations existiam no repositório e não estavam aplicadas.
> **Não usar este parágrafo como NO-GO do piloto `e1327e62`.** Muitas correções financeiras
> e D0 foram aplicadas depois (Fase 6, D0-01/03, kardex, DRAFT). Antes de um *segundo*
> cliente, revalidar `schema_migrations` — não assumir nem o 30 nem o zero.

### Segundo bloqueador — a janela de deploy não é livre

O §11.6 do relatório de certificação classifica este rollout como
**`ROLLOUT INCOMPATÍVEL, FALHA FECHADA`**: banco novo com app antiga **e** banco antigo com app nova
**ambos falham**, sem gravar nada. Isso é proteção, não defeito — mas obriga **deploy coordenado de
banco e aplicação**, com janela de indisponibilidade de AR/AP. Ver [07-go-live-day.md](07-go-live-day.md).

---

## Respostas às perguntas centrais

### O que está 100% pronto?

> Gates atuais (`e1327e62`): [piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](../piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).
> A linha 923/923 vitest abaixo é da certificação **09/08** (`2afa14ca`), não do run de 27/08.

| Item | Evidência |
|---|---|
| Aplicação web em produção, alinhada à `main` | SHA `e1327e62` (27/08). Histórico 09/08: `2afa14ca` |
| 3 Edge Functions ativas em produção | `sync-outbox` v70, `validar-gerente` v45, `fiscal-worker` v37 (versões de 17/08 — revalidar se for segundo cliente) |
| Suíte de testes (09/08, histórico) | 923/923 vitest, 42/42 RLS, 6/6 financeiro (§12.6 da certificação antiga) |
| Gates de regressão no CI | `test:financial` integrado ao `ci-backend-supabase.yml` (§11.8) |
| Bloco de comissões DB-05 **no código** | Certificado backend + frontend (§12.7) |
| `venda_finance_context` | Encerrado — [ADR-012](../adr/ADR-012-aposentadoria-venda-finance-context.md) |
| Documentação operacional para o cliente | [Manual do operador](../../MANUAL_OPERADOR_RESUMIDO.md), [Checklist 1º dia](../../CHECKLIST_PRIMEIRO_DIA.md) |

### O que precisa ser feito antes do cliente final?

Ordenado por bloqueio. Detalhes em [06-validacao-pre-go-live.md](06-validacao-pre-go-live.md).

| # | Item | Severidade | Onde |
|---|---|---|---|
| 1 | Ledger de produção revalidado (não assumir as “30 migrations” de 17/08) | 🟡 Revalidar | [03](03-deploy-backend.md) |
| 2 | Deploy coordenado banco + app (janela de falha fechada) | 🔴 Bloqueador | [07](07-go-live-day.md) |
| 3 | Reauditoria independente do bloco AR/AP (§11.10 — pendente) | 🔴 Bloqueador | [06](06-validacao-pre-go-live.md) |
| 4 | Revogar `anon` de 2 RPCs `SECURITY DEFINER` | 🟠 Alto | [02](02-ambiente-producao.md) |
| 5 | `GL-DENO-LOCK` — `--frozen` falha em 2 de 3 Edge Functions | 🟠 Alto | [03](03-deploy-backend.md) |
| 6 | E2E crítico (Playwright `sync-fluxo`) não é gate | 🟠 Alto | [06](06-validacao-pre-go-live.md) |
| 7 | Repair histórico de AR/AP legado não executado (§11.5 item 4) | 🟡 Médio | [08](08-pos-go-live.md) |
| 8 | Telas financeiras além de comissões não reconciliadas (§12.8) | 🟡 Médio | [06](06-validacao-pre-go-live.md) |
| 9 | `auth_leaked_password_protection` desabilitado | 🟡 Médio | [02](02-ambiente-producao.md) |

### Quais são os riscos reais de produção?

Ver [08-pos-go-live.md](08-pos-go-live.md) §Riscos. Os três que mais importam com dinheiro de cliente real:

1. **Estoque offline fora da transação** (§11.5 item 3) — falha entre a RPC e a baixa de estoque
   deixa venda e estoque divergentes. Risco **teórico**, sem prova de ocorrência.
2. **Venda offline sem `caixa_id`** não resolve a loja e perde a âncora de catálogo (§11.5 item 2).
3. **Validação de faixa/promoção ausente no caminho offline** (§11.5 item 1).

Todos os três são do caminho **offline (`pdv-local`)**. Se o primeiro cliente operar **somente web**,
os três saem do caminho crítico — ver [05-deploy-desktop.md](05-deploy-desktop.md).

### Qual o plano de rollback?

Existe playbook: [`ROLLBACK_HOTLINE_PLAYBOOK.md`](../../ROLLBACK_HOTLINE_PLAYBOOK.md).
O específico deste deploy está em [07-go-live-day.md](07-go-live-day.md) §Rollback — atenção ao fato
de que **rollback da app sem rollback do banco derruba AR/AP para toda a base** (§11.6).

### Como monitorar em produção?

Ver [08-pos-go-live.md](08-pos-go-live.md) e o template existente [`monitoramento.md`](../../monitoramento.md).

---

## Estrutura deste plano

| Arquivo | Para quê |
|---|---|
| [01-pre-requisitos.md](01-pre-requisitos.md) | Ferramentas, acessos, variáveis de ambiente |
| [02-ambiente-producao.md](02-ambiente-producao.md) | Configuração de produção e achados de segurança |
| [03-deploy-backend.md](03-deploy-backend.md) | Migrations e Edge Functions |
| [04-deploy-frontend.md](04-deploy-frontend.md) | Vercel / `pdv-importados` |
| [05-deploy-desktop.md](05-deploy-desktop.md) | Tauri / `pdv-local` |
| [06-validacao-pre-go-live.md](06-validacao-pre-go-live.md) | Testes e validações antes do GO |
| [07-go-live-day.md](07-go-live-day.md) | Cronologia do dia, responsáveis, rollback |
| [08-pos-go-live.md](08-pos-go-live.md) | Monitoramento, riscos, dívidas |
| [09-primeiro-cliente.md](09-primeiro-cliente.md) | Onboarding, dados iniciais, treinamento |
| [10-troubleshooting.md](10-troubleshooting.md) | Problemas conhecidos e diagnóstico |
| [CHECKLIST-FINAL.md](CHECKLIST-FINAL.md) | Checklist para imprimir |

## Documentos que este plano NÃO substitui

Este plano **orquestra**; o detalhe permanece nos documentos existentes:

- [`GO_LIVE_CERTIFICATION_REPORT.md`](../../GO_LIVE_CERTIFICATION_REPORT.md) — certificação e auditoria (autoridade técnica)
- [`docs/CHECKLIST_DEPLOY_SUPABASE.md`](../CHECKLIST_DEPLOY_SUPABASE.md) — operação Supabase
- [`docs/DEPLOY_VERCEL.md`](../DEPLOY_VERCEL.md) — deploy web
- [`docs/P0_CHECKLIST_OPERACIONAL.md`](../P0_CHECKLIST_OPERACIONAL.md) — checklist P0
- [`docs/AMBIENTES_E_RELEASE.md`](../AMBIENTES_E_RELEASE.md) — ambientes e gates
- [`docs/PRODUCAO_GO_NO_GO.md`](../PRODUCAO_GO_NO_GO.md) — o que o CI cobre vs. o que é manual
- [`CHECKLIST_IMPLANTACAO_CLIENTE.md`](../../CHECKLIST_IMPLANTACAO_CLIENTE.md) — dia 0 técnico
- [`docs/E2E.md`](../E2E.md) — Playwright

## Nota sobre as issues

As issues **#298, #262, #261, #260, #259, #136 e #66** não puderam ser lidas ao vivo: a API do GitHub
respondeu **HTTP 503** durante toda esta análise (incidente de performance em 2026-08-17). O que consta
aqui sobre a **#298** vem do §8 do relatório de certificação, que a transcreve integralmente. As
demais **não foram verificadas** e estão registradas como lacuna em
[06-validacao-pre-go-live.md](06-validacao-pre-go-live.md) §Lacunas.
