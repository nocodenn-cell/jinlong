# PDV Local — Tauri + React (desktop)

Cliente de **caixa local-first** (Windows via Tauri 2) com **SQLite**, **catálogo em cache** e **fila outbox** sincronizada pela Edge `sync-outbox` — o cenário “loja com catálogo + outbox” descrito no `../pdv-importados/README.md` **é este app**, não o browser.

## Papel no monorepo (vs `pdv-importados`)

| | **pdv-importados** (web) | **pdv-local** (desktop) |
|---|--------------------------|-------------------------|
| Rede | Online-first, Supabase Auth no navegador | Operação na máquina da loja; sync por `SYNC_*` |
| Rotas / UI | Muitas rotas (login, caixa web, painel gerente, admin) | **Uma** aplicação Vite (poucas telas); superfície de código e dependências **menor** que o web |
| Persistência | Postgres (RLS) em tempo real | SQLite + envio assíncrono via outbox |
| Complemento | Referência operacional “sempre online” | Complementa o mesmo negócio com **vendas e caixa persistidos localmente** até a nuvem aceitar o sync |

## Estrutura

- `src/` — App React (Vite).
- `src-tauri/` — App desktop Tauri 2.
- `tsconfig.json` — alias `@core/*` apontando para `../pdv-importados/core/*` (iremos evoluir isso para um pacote compartilhado).

## comandos Tauri (sync)

- **`sync_outbox_real_cmd`** — envia a outbox para a Edge `sync-outbox` (usa `SYNC_*` no `.env`).
- **`sync_outbox`** — modo **simulado** (marca enviado sem HTTP); só para testes internos, não use como substituto do real em produção.

## Como rodar (depois de instalar Rust + Tauri toolchain)

Instale dependências na **raiz do monorepo** (um único `package-lock.json`):

```bash
cd c:/Naturecode/fastproduct
npm ci
npm run dev:tauri
```

Alternativa (só esta pasta, menos recomendado): `cd pdv-local && npm install` gera lockfile local e não alinha versões com o restante do monorepo.

O Tauri vai abrir uma janela apontando para o frontend React em `http://localhost:4173`.

## Sync real (Supabase)

Crie um arquivo `.env` na raiz do `pdv-local` a partir do `.env.example`:

```bash
copy .env.example .env
```

Depois ajuste:

- `SYNC_ENDPOINT` → `https://<projeto>.supabase.co/functions/v1/sync-outbox`
- `SYNC_KEY` → o mesmo valor configurado nos secrets da Edge Function `sync-outbox`.
- A mesma Edge `sync-outbox` atende `GET ?op=catalogo` e `GET ?op=pdv_config` com autenticação `X-SYNC-KEY`.
- **Não** é mais necessário `SUPABASE_SERVICE_ROLE_KEY` no `pdv-local/.env`.
- **Senha do gerente (desconto):** use hash forte server-side em `public.pdv_config.gerente_senha_bcrypt` (bcrypt). A validação do desconto é feita pela Edge (`validar_gerente`) e não depende mais de hash local no app desktop.

**Credenciais e ambientes (dev/staging/prod):** ver `../docs/AMBIENTES_E_RELEASE.md` (boas práticas de rotação de segredo e isolamento por ambiente).

## Próximos passos

- Empacotar `../pdv-importados/core` como biblioteca compartilhada (npm workspace ou pacote interno).
- Login de operador no PDV (substituir `PDV_OPERADOR_ID` opcional no `.env`).
- Sincronizar fechamento de caixa e movimentos (sangria/suprimento) na Edge `sync-outbox`.

### Sincronização de vendas (caixa + operador)

- Aplique as migrations no Supabase com **`npx supabase db push`** a partir da pasta **`backend`** na raiz do monorepo (não de `pdv-local`). Na primeira vez: `npx supabase link --project-ref <Reference ID>`. Detalhes em `../backend/supabase/README.md`.
- **Retry / DLQ:** falhas por evento na Edge aplicam backoff e, após `OUTBOX_MAX_SYNC_FAILURES` (padrão 12), o item fica `ERRO` até **Repor na fila** no app. Ver `../pdv-importados/core/sync/TAURI_SYNC.md`.
- O payload da outbox inclui `caixa_id`, `troco_inicial_caixa` e `operador_id` (UUID válido).
- A função `sync-outbox` cria `public.caixas` com o mesmo `id` da sessão local, se ainda não existir, e grava `vendas.caixa_id` / `vendas.operador_id` quando forem UUIDs válidos.
- Opcional: defina `PDV_OPERADOR_ID` no `.env` (UUID de `public.usuarios`) para preencher operador sem UI de login.

