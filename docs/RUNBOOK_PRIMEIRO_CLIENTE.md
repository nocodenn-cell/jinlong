# Runbook — Criação de usuários oficiais e implantação do primeiro cliente

Fluxo oficial (administrativo/manual) para criar contas de produção. Enquanto não existir
UI de gestão de usuários, **este documento é o processo canônico** — qualquer conta criada
fora dele é considerada irregular.

## Modelo oficial de perfis

| Perfil | Valor em `usuarios.perfil` | Rota inicial | Uso |
|---|---|---|---|
| DONO | `DONO` | `/admin/dashboard` | Proprietário da loja |
| GERENTE | `GERENTE` | `/admin/dashboard` | Gestão diária (hoje com o mesmo acesso do DONO — diferenciação prevista na Fase C) |
| OPERADOR | `OPERADOR` | `/caixa` | Operador de caixa (sem acesso ao painel) |
| ADMIN | `ADMIN` | `/admin/dashboard` | **Reservado à equipe interna** (suporte/dev). Não criar para clientes. |

## Fonte única de verdade (SSOT)

**Perfil e loja moram exclusivamente em `public.usuarios`.**

`public.perfis` é uma tabela órfã (drift de produção): auditoria de 2026-07-09 confirmou via
`pg_policies`/`pg_get_functiondef` que nenhuma política RLS de outra tabela, nenhuma função do
schema `public` e nenhum código de aplicação lê essa tabela — as 4 políticas que ela possui são
auto-referenciais (controlam apenas o acesso à própria tabela). Gravar perfil nela **não tem
efeito nenhum** e já produziu uma conta quebrada em produção (`gerente.test@example.com`).

> ⚠️ Regra: NUNCA insira em `public.perfis`. Se encontrar código ou instrução sugerindo isso,
> trate como desatualizado e corrija a instrução.

## Regras de bloqueio ativas no login (enforcement em código)

Desde a Fase A, o login e o middleware bloqueiam:

| Condição | Comportamento |
|---|---|
| Sem linha em `public.usuarios` | Mensagem "conta não vinculada ao cadastro da loja"; não entra |
| `usuarios.ativo = false` | Mensagem "conta desativada"; signOut imediato; middleware bloqueia rotas protegidas (`conta_inativa`) |
| `usuarios.loja_id` nulo | Mensagem "conta sem loja vinculada"; signOut; middleware bloqueia (`conta_sem_loja`) |

Ou seja: **desativar um usuário = `UPDATE public.usuarios SET ativo = false WHERE id = ...`** —
agora isso bloqueia de verdade (login e navegação). `ativo = NULL` é tratado como ativo
(compatibilidade com linhas antigas).

## Passo a passo — implantação de um cliente novo

### 1. Criar a loja (nunca reutilizar a Matriz de teste)

```sql
INSERT INTO public.lojas (id, nome)
VALUES (gen_random_uuid(), '<NOME REAL DA LOJA DO CLIENTE>')
RETURNING id;  -- guarde este UUID para o passo 3
```

A loja `Matriz` (`a0000001-0000-4000-8000-000000000001`) e a `Filial demo` contêm dados de
teste/E2E — não colocar usuários reais nelas.

### 2. Criar cada usuário no Supabase Auth

Dashboard → **Authentication → Users → Add user**:
- E-mail **real** da pessoa (nunca `@localhost.test`, `@example.com`, `@exemplo.com`).
- Senha inicial forte; marcar **Auto Confirm User**.
- Copiar o **User UID** gerado.

### 3. Vincular o perfil (uma linha por usuário, em `public.usuarios`)

```sql
INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo, loja_id)
VALUES
  ('<UID_DONO>',     '<Nome real do dono>',     'DONO',     'zh', true, '<LOJA_ID_DO_PASSO_1>'),
  ('<UID_GERENTE>',  '<Nome real do gerente>',  'GERENTE',  'pt', true, '<LOJA_ID_DO_PASSO_1>'),
  ('<UID_OPERADOR>', '<Nome real do operador>', 'OPERADOR', 'pt', true, '<LOJA_ID_DO_PASSO_1>');
```

- `idioma_preferido`: `pt` ou `zh` — é só o idioma **inicial**; o usuário troca sozinho pelo
  seletor PT/普通话 na sidebar do painel (adicionado na Fase A).
- `nome`: nome real — nunca "Demo", "Teste" ou "E2E".

### 4. Validar (checklist de aceite)

- [ ] DONO loga → cai em `/admin/dashboard` no idioma configurado.
- [ ] DONO troca 中文 ↔ Português pelo seletor da sidebar; faz logout/login → idioma persistiu.
- [ ] GERENTE loga → `/admin/dashboard` em português.
- [ ] OPERADOR loga → cai direto em `/caixa` (sem acesso a `/admin`).
- [ ] `UPDATE usuarios SET ativo = false` num usuário de teste → login bloqueado com mensagem clara; reativar depois.
- [ ] Nenhum dado da Matriz de teste aparece nas telas do cliente (loja separada).

## Disposição das contas existentes (estado de 2026-07-09)

| Conta | Destino |
|---|---|
| `aoliveiradamata@gmail.com` | Manter (conta pessoal real do fundador — decisão de negócio) |
| `demo@jinlong.com` | Manter só para demonstração comercial; nunca entregar ao cliente |
| `e2e-gerente@localhost.test`, `e2e-operador@localhost.test` | Manter — usados pelo Playwright/CI |
| `demo-gerente@`, `demo-operador@localhost.test`, `e2e-dono@localhost.test` | Candidatas a desativar (`ativo = false`) se não usadas por CI |
| `gerente.test@example.com` | Quebrada (perfil na tabela errada) — corrigir criando linha em `usuarios` OU desativar no Auth; decidir antes do go-live |
| `cloudagenttest@mailinator.com`, `email-do-test@exemplo.com` | Sem perfil, nunca logaram — remover no Auth |
