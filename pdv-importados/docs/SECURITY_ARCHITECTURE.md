# Arquitetura de Segurança — FastProduct PDV

> **Versão:** 1.0 — Auditoria 2026-05-27  
> **Escopo:** pdv-importados (Next.js) + backend Supabase (PostgreSQL / Edge Functions)  
> **Público-alvo:** desenvolvedores novos e revisores de PR

---

## 1. Modelo de Cargos (RBAC)

O sistema diferencia quatro perfis armazenados em `public.usuarios.perfil`:

| Perfil | Acesso | Notas |
|--------|--------|-------|
| `OPERADOR` | PDV / caixa (`/caixa/*`) | Não acessa painel gerencial |
| `GERENTE` | PDV + painel gerencial (`/gerente/*`) | Escopo restrito à própria loja |
| `DONO` | Igual ao GERENTE | Pode ter visão ampliada em futuras features |
| `ADMIN` | Tudo, todas as lojas | Sem restrição de loja nas políticas RLS |

O campo `perfil` vem de uma query ao banco (`public.usuarios`) — nunca confie somente no JWT sem confirmar no banco, pois o JWT pode estar obsoleto.

---

## 2. Camadas de Proteção

### 2.1 Layout / Middleware (Next.js)

**Arquivo:** `app/gerente/layout.tsx`

```typescript
if (!isPerfilPainelGerencial(perfil)) redirect('/caixa')
```

Primeira barreira: qualquer rota `/gerente/*` renderizada com perfil OPERADOR é redirecionada antes de carregar qualquer componente filho.

> **Regra:** nunca remova ou mova este guard para um componente cliente — Server Components executam no servidor e garantem que nenhum HTML gerencial seja enviado ao operador.

---

### 2.2 Server Actions (Next.js `"use server"`)

**Helper canônico:** `lib/auth/gerenteOuDono.ts → assertGerenteOuDono()`

Todas as Server Actions do painel gerencial devem começar com:

```typescript
const authCheck = await assertGerenteOuDono()
if (!authCheck.ok) return { ok: false, error: authCheck.error }
```

**Arquivos protegidos (adicionado em 2026-05-27):**

| Arquivo | Funções protegidas |
|---|---|
| `app/gerente/clientes/actions.ts` | `buscarClientesPaginadosAction`, `salvarClienteAction`, `excluirClienteAction` |
| `app/gerente/vendas/actions.ts` | `buscarVendasPaginadasAction`, `obterKpisVendas`, `obterVendasCompletaParaExport`, `cancelarVendaGerenteAction` |
| `app/gerente/shared/actionHelpers.ts` | `listarCadastro`, `criarCadastro`, `atualizarCadastro`, `excluirCadastro`, `alternarAtivoCadastro` |

> **Regra:** toda função exportada de `app/gerente/**/actions.ts` deve chamar `assertGerenteOuDono()` como primeira instrução assíncrona. PRs sem esse guard devem ser bloqueados na revisão.

---

### 2.3 API Routes (Next.js Route Handlers)

**Arquivo:** `app/api/gerente/notificacoes/count/route.ts`

Rotas em `/api/gerente/*` exigem verificação explícita de sessão e cargo:

```typescript
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: usuario } = await supabase.from('usuarios').select('perfil').eq('id', user.id).single()
if (!isPerfilPainelGerencial(usuario?.perfil)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

> **Regra:** Route Handlers não herdam o guard do layout. Cada arquivo `route.ts` em `/api/gerente/*` é responsável por sua própria autenticação.

---

### 2.4 Row Level Security (RLS) — PostgreSQL / Supabase

O RLS é a **última linha de defesa** — garante isolamento mesmo se uma camada superior falhar.

#### Padrão de isolamento multi-tenant

Todas as tabelas transacionais usam `loja_id` para isolar dados entre lojas:

```sql
-- Padrão aplicado em: vendas, estoque, produtos, clientes, contas_receber,
--                     liquidacoes_receber, movimentacoes_caixa, documentos_fiscais_pendentes
CREATE POLICY exemplo_select_loja ON public.tabela FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND (u.perfil = 'ADMIN' OR u.loja_id = tabela.loja_id)
  )
);
```

- **ADMIN:** visão global (todas as lojas)
- **GERENTE / DONO / OPERADOR:** apenas a própria `loja_id`
- **Fallback da Matriz:** UUID fixo `a0000001-0000-4000-8000-000000000001` (migration 032)

#### Tabelas críticas e suas migrations de RLS

| Tabela | RLS habilitado | Filtro loja_id | Migration de referência |
|--------|---------------|---------------|------------------------|
| `usuarios` | ✅ | ✅ | 001, 068 |
| `vendas` | ✅ | ✅ (via caixa) | 042, 044 |
| `produtos` / `estoque` | ✅ | ✅ | 032, 042, 044 |
| `caixas` | ✅ | ✅ | 032, 045, 057 |
| `clientes` | ✅ | ✅ | **112** (adicionado em 2026-05-27) |
| `contas_receber` | ✅ | ✅ | **112** (adicionado em 2026-05-27) |
| `liquidacoes_receber` | ✅ | ✅ (via contas_receber) | **112** (adicionado em 2026-05-27) |
| `documentos_fiscais_pendentes` | ✅ | ✅ (via venda→caixa) | 094 |
| `pdv_config` | ✅ | — (SELECT revogado direto) | 058 |

> **Regra:** toda nova tabela que armazene dados de negócio deve ter `loja_id NOT NULL`, RLS habilitado e política com filtro `u.loja_id = tabela.loja_id` antes de ir para produção.

---

### 2.5 Autenticação de Supervisor no PDV (Desconto de Gerente)

**Fluxo:** `CaixaGerenteModal → Edge Function validar-gerente → token 64-char → RPC finalizar_venda`

| Ponto | Proteção |
|-------|---------|
| Senha do gerente | bcrypt com salt (coluna `pdv_config.gerente_senha_bcrypt`) |
| Comparação | `bcrypt.compareSync` + `timingSafeEqual` |
| Rate limiting | 5 tentativas/15min por usuário; 20/15min por IP; 10/15min por device |
| Token gerado | 256 bits de entropia, TTL 5 minutos, consumo único (`FOR UPDATE`) |
| Validação final | Feita dentro do RPC PostgreSQL — nunca no cliente |

> **Regra:** a coluna `gerente_senha_sha256` foi **removida** em 2026-05-27. Não reintroduza hash SHA-256 para senhas. Qualquer nova funcionalidade de PIN/senha deve usar bcrypt via `pgcrypto.crypt()` ou argon2 via Edge Function.

---

### 2.6 Funções SECURITY DEFINER

Funções PostgreSQL com `SECURITY DEFINER` executam com privilégios elevados e bypassam RLS. Use com critério.

**Regras obrigatórias:**
1. Sempre incluir `SET search_path = public` para evitar injeção de schema
2. Validar `auth.uid()` ou `auth.role()` no início da função
3. Documentar no comentário SQL por que `SECURITY DEFINER` é necessário

**Funções existentes com SECURITY DEFINER:**

| Função | Justificativa |
|--------|--------------|
| `finalizar_venda_transacional` | Operações atômicas cross-tabela (venda + itens + estoque) |
| `registrar_liquidacao_receber` | Atualização atômica de saldo com FOR UPDATE |
| `fiscal_enfileirar_documento_venda` | Chamada via service_role do sync-outbox |
| `decrementar_estoque_seguro` | Baixa de estoque atômica por venda |
| `auth_usuario_eh_dono` | Evitar recursão infinita em policy RLS |
| `pdv_config_para_caixa_web` | Retornar config sem expor hashes de senha |

---

### 2.7 Enfileiramento Fiscal (Edge Function service_role)

**Arquivo:** `backend/supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.ts`

A Edge Function `sync-outbox` usa `service_role` e deve passar `p_loja_id` no RPC para ativar a validação de isolamento:

```typescript
await supabase.rpc('fiscal_enfileirar_documento_venda', {
  p_venda_id: payload.venda_id,
  p_tipo_doc: tipoDoc,
  p_payload: fiscalPayload,
  p_loja_id: loja_id,   // ← obrigatório para validação cross-loja (migration 114)
})
```

> **Regra:** configure a env var `LOJA_ID` na Edge Function no Supabase Dashboard. Sem ela, `loja_id` será `null` e a validação de loja será pulada (comportamento tolerado apenas em desenvolvimento).

---

## 3. Exclusão de Clientes — Conformidade LGPD Art. 16

**Arquivo:** `app/gerente/clientes/actions.ts → excluirClienteAction()`

A LGPD (Art. 16) proíbe a exclusão de dados necessários para obrigações legais (contabilidade, fiscal). O sistema implementa a seguinte lógica:

```
1. Saldo de crediário aberto → REJEITA (não pode excluir)
2. Possui histórico em contas_receber → ANONIMIZA dados pessoais
   (nome, documento, telefone, email, endereço → valores nulos/ANONIMIZADO)
   (registro contábil é PRESERVADO para fins fiscais)
3. Sem histórico → DELEÇÃO FÍSICA permitida
```

> **Regra:** nunca substitua essa lógica por um `DELETE` direto. Qualquer remoção que ignore o histórico financeiro pode gerar passivo legal. A anonimização é a ação correta para clientes com histórico.

---

## 4. Checklist para Novos Desenvolvedores

Antes de abrir um PR com qualquer feature que toque no painel gerencial, verifique:

- [ ] Nova Server Action em `app/gerente/*` chama `assertGerenteOuDono()` como primeira instrução
- [ ] Nova Route Handler em `app/api/gerente/*` valida `auth.getUser()` + `isPerfilPainelGerencial()`
- [ ] Nova tabela com dados de negócio tem coluna `loja_id NOT NULL`, RLS habilitado e política com filtro de loja
- [ ] Nenhuma senha ou PIN é comparado no cliente — sempre no servidor (Edge Function ou RPC)
- [ ] Nenhum hash SHA-256 sem salt para senhas — usar bcrypt via `pgcrypto.crypt()` ou argon2
- [ ] Funções `SECURITY DEFINER` têm `SET search_path = public` e validam `auth.uid()`
- [ ] Exclusão de clientes usa a lógica LGPD de `excluirClienteAction()` — nunca `DELETE` direto

---

## 5. Histórico de Alterações de Segurança

| Data | Tipo | Descrição | Arquivos |
|------|------|-----------|---------|
| 2026-05-27 | CRÍTICO | Guard `assertGerenteOuDono()` adicionado nas Server Actions de clientes e vendas | `app/gerente/clientes/actions.ts`, `app/gerente/vendas/actions.ts` |
| 2026-05-27 | CRÍTICO | Redirect por cargo no layout do painel gerencial | `app/gerente/layout.tsx` |
| 2026-05-27 | CRÍTICO | Isolamento multi-tenant (`loja_id`) em clientes, contas_receber, liquidacoes_receber | Migration 112 |
| 2026-05-27 | ALTO | Remoção da coluna `gerente_senha_sha256`; senha exclusivamente em bcrypt | Migration 113 (pdv_config) |
| 2026-05-27 | ALTO | Campos de auditoria `operador_id` e `aplicado_em` em `descontos_venda` | Migration 113 |
| 2026-05-27 | ALTO | Validação de loja para `service_role` em `fiscal_enfileirar_documento_venda` | Migration 114, sync-outbox |
| 2026-05-27 | MÉDIO | Guard de autenticação/autorização na Route Handler de notificações | `app/api/gerente/notificacoes/count/route.ts` |
