# 04 — Deploy do frontend (Vercel / `pdv-importados`)

Voltar ao [plano](00-README.md). Detalhe completo em [`docs/DEPLOY_VERCEL.md`](../DEPLOY_VERCEL.md).

---

## 1. O que a Vercel realmente executa

| Item | Valor real | Armadilha |
|---|---|---|
| Config que vale | `pdv-importados/vercel.json` | o `vercel.json` da **raiz** é ignorado no build |
| Região | `gru1` (São Paulo) | — |
| Instalação | `npm ci` | **nunca** `npm install` — não conserta lock corrompido |
| Node | **24.x** | o `engines` permite 20–24; build local em 20 não prova o build da Vercel |
| Build | `turbo run build --filter=pdv-importados` | só o Next; `pdv-local` não entra |

## 2. Build de produção local

```bash
npm ci
npm run build
```

Equivalente ao que a Vercel roda. Para reproduzir o pipeline completo do CI:

```bash
npm run ci
```

## 3. Variáveis de ambiente na Vercel

As 16 variáveis estão listadas em [01-pre-requisitos.md](01-pre-requisitos.md) §4.1. Conferir no
painel do projeto, escopo **Production**, antes do deploy.

```bash
npm run env:check -w pdv-importados
```

Atenção especial (ver [02-ambiente-producao.md](02-ambiente-producao.md) §4):
`NEXT_PUBLIC_DEBUG_MODE=false`, `STRICT_MANAGER_DISCOUNT_AUTH=true`, e decisão explícita sobre
`NEXT_PUBLIC_IDLE_LOGOUT_MINUTES`.

> ⚠️ Variável alterada na Vercel **não** afeta um deployment já construído. Toda mudança de env
> exige **redeploy**.

## 4. Ordem em relação ao banco

> 🔴 O deploy do frontend **não é independente**. Com as 30 migrations do
> [03](03-deploy-backend.md) pendentes, a matriz de compatibilidade do §11.6 do relatório vale:

| Banco | App | Resultado |
|---|---|---|
| antigo | antiga | funciona, sem as garantias da remediação |
| **novo** | **antiga** | **falha fechada** — AR/AP rejeitados em `LIQUIDACAO_IDEMPOTENCY_KEY` |
| **antigo** | **nova** | **falha fechada** — PostgREST não acha a função de 7/9 argumentos |
| novo | nova | estado alvo |

Ou seja: **banco primeiro, app imediatamente depois**, com a janela mais curta possível. A ordem
cronológica está em [07-go-live-day.md](07-go-live-day.md).

## 5. Health check

A rota existe: `pdv-importados/app/api/health/route.ts`.

```bash
curl -s https://pdv-importados.vercel.app/api/health
```

Resposta esperada: `{ deploymentId, gitSha }`.

**O gate SSRA é a igualdade** entre o `deploymentId` reportado pela plataforma Vercel e o retornado
por `/api/health`. Se divergirem, o tráfego não está no deployment que você acabou de publicar —
não prossiga.

Conferir também que `gitSha` corresponde ao commit que você publicou:

```bash
git rev-parse HEAD
```

## 6. Smokes pós-deploy

```bash
npm run smoke:http                  -w pdv-importados
npm run test:e2e:post-deploy-smoke  -w pdv-importados
```

## 7. Checklist de saída

- [ ] `npm ci` + `npm run build` verdes localmente
- [ ] 16 variáveis conferidas no escopo Production
- [ ] `env:check` verde
- [ ] Banco já atualizado ([03](03-deploy-backend.md)) — **não deployar app antes**
- [ ] Deploy publicado e promovido a produção
- [ ] `/api/health` responde e `deploymentId` bate com a plataforma (SSRA)
- [ ] `gitSha` corresponde ao commit publicado
- [ ] `smoke:http` e `test:e2e:post-deploy-smoke` verdes

→ Próximo: [05-deploy-desktop.md](05-deploy-desktop.md)
