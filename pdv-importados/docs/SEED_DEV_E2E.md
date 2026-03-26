# Seed de usuários — desenvolvimento e E2E

O login em `/login` exige:

1. Usuário em **Supabase Auth** (e-mail + senha).
2. Linha em **`public.usuarios`** com o mesmo **`id`** (UUID) do Auth e **`perfil`** em `OPERADOR` | `GERENTE` | `DONO`.

Sem a linha em `usuarios`, o app mostra erro de cadastro após autenticar.

---

## Opção A — Script (recomendado)

Usa a **service_role** no servidor (Node); não vai para o browser.

### 1. Variáveis em `pdv-importados/.env.local`

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Dashboard → **Project Settings** → **API** → **service_role** (JWT). **Nunca** commitar. |
| `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL` | Sim | URL do projeto (cloud ou local). |
| `SEED_DEV_PASSWORD` | Sim* | Senha dos dois usuários de teste. |
| `SEED_GERENTE_EMAIL` | Não | Padrão: `e2e-gerente@localhost.test` |
| `SEED_OPERADOR_EMAIL` | Não | Padrão: `e2e-operador@localhost.test` |

\* Alternativa: definir só `PLAYWRIGHT_TEST_PASSWORD` (mesmo valor usado no Playwright).

### 2. Rodar

```bash
cd pdv-importados
npm run seed:dev-users
```

O script é **idempotente**: se o e-mail já existir no Auth, apenas faz **upsert** em `usuarios`.

### 3. Playwright

Use o mesmo e-mail/senha do **gerente** (perfil `GERENTE` ou `DONO` — aqui criamos `GERENTE`):

```bash
# PowerShell
$env:PLAYWRIGHT_TEST_EMAIL="e2e-gerente@localhost.test"
$env:PLAYWRIGHT_TEST_PASSWORD="(a mesma de SEED_DEV_PASSWORD)"
npm run test:e2e
```

Ou coloque essas variáveis no `.env.local` e carregue-as no shell de CI (o Playwright lê `process.env` do ambiente onde roda o comando; se necessário, use `dotenv` no CI ou export explícito).

---

## Opção B — Manual (Dashboard + SQL)

Útil quando não quer rodar Node com service_role.

### 1. Criar usuário no Auth

**Authentication → Users → Add user**  
- E-mail e senha desejados  
- Marque **Auto Confirm User** (e-mail confirmado), senão o login por senha pode falhar conforme configuração do projeto.

Copie o **UUID** do usuário (coluna User UID).

### 2. Inserir perfil

**SQL Editor** (como usuário com permissão de escrita em `public.usuarios` — no painel costuma ser possível; em ambiente local use `postgres` ou service role):

```sql
INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo)
VALUES (
  'COLE_AQUI_O_UUID_DO_AUTH',
  'Nome exibido',
  'GERENTE',  -- ou OPERADOR | DONO
  'pt',
  true
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  perfil = EXCLUDED.perfil,
  idioma_preferido = EXCLUDED.idioma_preferido,
  ativo = EXCLUDED.ativo;
```

`idioma_preferido` deve ser um de: `pt`, `zh`, `zh-HK` (conforme migrations).

### 3. Operador para `/caixa`

Repita com outro usuário Auth e `perfil = 'OPERADOR'`.

---

## Supabase local (`supabase start`)

1. Na pasta **`backend`** do monorepo: `npx supabase start`, depois `npx supabase status` — use **API URL** e **service_role key** no `.env.local`.
2. Rode `npm run seed:dev-users` como acima.

A **anon key** não serve para o script; só a **service_role** cria usuários em Auth e grava em `usuarios` com RLS bypass.

---

## Segurança

- **Não** commite `.env.local`, **service_role** nem senhas reais.
- Em produção, prefira convites, triggers de signup ou fluxo administrativo em vez de seeds com senhas fixas.
- E-mails `*@localhost.test` são apenas convenção para dev; ajuste `SEED_*_EMAIL` se o projeto exigir domínio verificável.

---

## Ver também

- [SUPABASE_ENV.md](./SUPABASE_ENV.md) — variáveis do Next.
- [../../docs/E2E.md](../../docs/E2E.md) — Playwright e `PLAYWRIGHT_TEST_*`.
