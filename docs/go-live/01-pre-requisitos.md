# 01 — Pré-requisitos

Tudo que precisa existir **antes** de iniciar qualquer passo do Go-Live.
Voltar ao [plano](00-README.md).

---

## 1. Ferramentas locais

| Ferramenta | Versão exigida | Como verificar | Origem da exigência |
|---|---|---|---|
| Node.js | `>=20.0.0 <25.0.0` | `node -v` | `engines` do `package.json` da raiz |
| npm | acompanha o Node | `npm -v` | — |
| Supabase CLI | atual | `npx supabase --version` | usado via `npx`, sem instalação global |
| Deno | via Supabase CLI | `npm run check:edge` | valida as 3 Edge Functions |
| Git | qualquer recente | `git --version` | — |
| Playwright | instalado pelo workspace | `npx playwright --version` | E2E |

> ⚠️ **Atenção com o Node.** O `engines` permite 20–24, mas a Vercel constrói com **Node 24.x**.
> Construir localmente em Node 20 e concluir que "passou" não prova o build da Vercel.

```bash
node -v && npm -v && npx supabase --version && git --version
```

## 2. Instalação de dependências

**Sempre `npm ci`, nunca `npm install`.** O `npm install` não conserta um lockfile corrompido — ele
mascara o problema até o build da Vercel falhar.

```bash
npm ci
```

Se o `npm ci` falhar por lockfile inconsistente, o único caminho que resolve é apagar
`package-lock.json` e `node_modules` e regerar. Não tente remendar com `npm install`.

## 3. Acessos necessários

| Serviço | Nível | Para quê |
|---|---|---|
| **Supabase** — projeto `jinlong` (`kbabmewnahysfvlybiak`) | Owner/Admin | aplicar migrations, deploy de Edge Functions, secrets |
| **Vercel** — projeto `pdv-importados` (team `jinlong`) | Member com deploy | deploy web, variáveis de ambiente |
| **GitHub** — `nocodenn-cell/fastproduct` | Write | merge, tags, Actions |
| **Painel `/admin/implantacao`** | perfil DONO | registrar `go_autorizado` |

> ⚠️ **Não existe ambiente de staging.** Um único projeto Supabase serve produção, Preview e E2E.
> Qualquer teste destrutivo atinge o mesmo banco do cliente. Ver [02-ambiente-producao.md](02-ambiente-producao.md).

## 4. Variáveis de ambiente

### 4.1 Web — `pdv-importados`

Fonte: [`pdv-importados/.env.example`](../../pdv-importados/.env.example). Todas as 16:

| Variável | Natureza | Nota para produção |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | URL do projeto `jinlong` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | anon key |
| `NEXT_PUBLIC_APP_URL` | pública | `https://pdv-importados.vercel.app` |
| `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` | pública | `0` desliga o logout por inatividade — **revisar para cliente real** |
| `NEXT_PUBLIC_APP_NAME` | pública | nome exibido |
| `NEXT_PUBLIC_DEFAULT_LANG` | pública | `pt` |
| `NEXT_PUBLIC_ADMIN_CHINESE_UI` | pública | UI em 普通话 no admin |
| `RELATORIO_TIMEZONE` | servidor | `America/Sao_Paulo` |
| `FISCAL_WORKER_ENDPOINT` | servidor | URL da Edge `fiscal-worker` |
| `FISCAL_WORKER_KEY` | **segredo** | segredo forte; nunca no repositório |
| `AUTO_ENQUEUE_FISCAL_ON_SALE` | servidor | enfileiramento fiscal automático |
| `FISCAL_DEFAULT_DOC_TYPE` | servidor | `NFC_E_STUB` — **fiscal é stub, não emissão real** |
| `USE_UNIFIED_SALES_FLOW` | servidor | `true` |
| `STRICT_MANAGER_DISCOUNT_AUTH` | servidor | `true` em produção |
| `NEXT_PUBLIC_DEBUG_MODE` | pública | **`false` em produção** |
| `NEXT_PUBLIC_CAIXA_SCAN_TELEMETRY_SAMPLE_RATE` | pública | `0` desliga telemetria de scan |

Verificação automatizada disponível:

```bash
npm run env:check -w pdv-importados
```

### 4.2 Desktop — `pdv-local`

Fonte: [`pdv-local/.env.example`](../../pdv-local/.env.example):

| Variável | Nota |
|---|---|
| `SYNC_ENDPOINT` | URL da Edge `sync-outbox` |
| `SYNC_KEY` | **segredo** — deve bater com o secret da Edge Function |
| `DEVICE_FINGERPRINT` | identificador do dispositivo |
| `OUTBOX_MAX_SYNC_FAILURES` | `12` |
| `SUPABASE_ANON_KEY` | anon key |
| `PDV_OPERADOR_ID` | UUID do operador |

```bash
npm run env:check -w pdv-local
```

> **`SYNC_KEY` divergente foi a causa do NO-GO de 2026-07-31.** Confirmar que o valor no `.env` do
> desktop é idêntico ao secret configurado na Edge Function antes de qualquer teste de sync.

### 4.3 Segredos do lado Supabase

Configurados como secrets do projeto, **não** no repositório: `FISCAL_WORKER_KEY`, `SYNC_KEY` e a
`service_role key`. O repositório tem varredura de segredos no CI
(`.github/workflows/secret-scan.yml`) — não contorne.

## 5. Estado do repositório

Antes de começar, a branch de deploy precisa estar limpa e verde:

```bash
git status --short
npm run guard:all
npm run ci
```

`guard:all` roda 8 guardas estruturais, incluindo `guard:migrations`
(`scripts/migration-sequence-guard.mjs`), que valida sequência e SSOT único de migrations conforme
[ADR-011](../adr/ADR-011-ssot-unico-migrations.md).

## 6. Checklist de saída

- [ ] Node dentro de `>=20 <25`, ciente de que a Vercel usa 24.x
- [ ] `npm ci` concluído sem erro
- [ ] Acesso confirmado a Supabase, Vercel, GitHub e `/admin/implantacao`
- [ ] Todas as 16 variáveis do web definidas na Vercel (produção)
- [ ] Todas as 6 variáveis do desktop definidas (se o cliente usar `pdv-local`)
- [ ] `SYNC_KEY` do desktop idêntica ao secret da Edge
- [ ] `npm run guard:all` verde
- [ ] `npm run ci` verde
- [ ] Ciente de que **não há staging** — todo teste atinge o banco de produção

→ Próximo: [02-ambiente-producao.md](02-ambiente-producao.md)
