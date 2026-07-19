# Runbook — Criação de usuários oficiais e implantação do primeiro cliente

Fluxo oficial para implantação.

- **Loja + DONO:** wizard interno `/admin/provisionamento` (perfil **ADMIN**, requer
  `SUPABASE_SERVICE_ROLE_KEY` no servidor). Depois conduza o gate em `/admin/implantacao`.
- **Funcionários do dia a dia** (OPERADOR / GERENTE): UI `/admin/funcionarios`.
- **Contas internas ADMIN:** ainda via este runbook (SQL + Auth), se necessário.

Contas criadas só no Auth sem linha em `public.usuarios` continuam irregulares.

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

## Gate GO-LIVE (obrigatório)

Após provisionar a loja e o DONO, conduza a implantação em **`/admin/implantacao`**:

- Checklist persistido por loja (não Markdown).
- Cada item: status · responsável · data/hora · observações.
- Estados: **Não pronto** · **Pronto com pendências** · **GO-LIVE autorizado**.
- Somente DONO/ADMIN autoriza GO; bloqueado se houver obrigatórios pendentes
  (fiscal: Stub **ou** NFC-e homologada).

## Recuperação e troca de senha (self-service)

O app expõe:

| Fluxo | Rota |
|---|---|
| Esqueci a senha | `/auth/esqueci-senha` (link no login) |
| Redefinir via e-mail | `/auth/callback` → `/auth/redefinir-senha` |
| Trocar senha logado | `/auth/alterar-senha` (admin sidebar + PDV) |

**Pré-requisito Supabase:** em Authentication → URL Configuration, adicione o redirect  
`https://<dominio-do-app>/auth/callback` (e `http://localhost:3000/auth/callback` em dev).  
Defina `NEXT_PUBLIC_APP_URL` no host Next com a mesma origem.

## Passo a passo — implantação de um cliente novo

### 1–2. Criar a loja e o DONO — wizard `/admin/provisionamento`

1. Login com conta **ADMIN** (equipe FastProduct).
2. Abrir **Sistema → Provisionamento**.
3. Informar nome da loja, e-mail real do DONO, senha inicial e idioma.
4. Confirmar → o servidor cria `lojas`, Auth user, `public.usuarios` (DONO),
   `pdv_config` padrão e bootstrap do checklist.
5. Seguir o link para `/admin/implantacao?lojaId=…` e conduzir o GO-LIVE.

**Nunca reutilizar** a loja `Matriz` (`a0000001-0000-4000-8000-000000000001`) nem a
`Filial demo` para clientes reais.

#### Fallback (só se o wizard estiver indisponível)

```sql
INSERT INTO public.lojas (id, nome)
VALUES (gen_random_uuid(), '<NOME REAL DA LOJA DO CLIENTE>')
RETURNING id;
```

Dashboard → Authentication → Users → Add user (e-mail real, Auto Confirm), depois:

```sql
INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo, loja_id)
VALUES
  ('<UID_DONO>', '<Nome real do dono>', 'DONO', 'zh', true, '<LOJA_ID>');
```

### 3. Demais funcionários — UI `/admin/funcionarios`

Com o DONO logado no painel:
1. Abrir **Funcionários**.
2. Criar GERENTE e OPERADOR (e-mail real + senha inicial).
3. Desativar contas pelo toggle (equivale a `ativo = false`).

Alternativa legado (só se a UI estiver indisponível): repetir o passo 2 para GERENTE/OPERADOR via Auth + SQL.

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
