# Auditoria de Identidade em Produção — Lojas, Usuários e Contratos Críticos

**Data:** 2026-08-07
**Escopo:** lojas fantasma, contas de usuário e confirmação dos contratos de login, loja ativa, estoque e venda.
**Método:** consultas **somente leitura** ao banco de produção + leitura de código. **Nenhuma alteração executada** — nem em dados, nem em arquitetura, nem em código.
**Objetivo:** reduzir risco antes do Go-Live.

---

## 0. Conclusão em uma linha

Os contratos técnicos de login, estoque e venda estão **íntegros**. O risco real não é de arquitetura: são **4 contas de teste com perfil `DONO` ativas em produção**, e as policies `*_select_dono_todas_lojas` dão a qualquer `DONO` leitura de **todas as vendas e todo o estoque da Matriz**, sem escopo de loja.

Isso é mais grave do que registrei em `AUDITORIA_POS_ONDA_2.md` §P1-A, onde descrevi o risco como "operar sobre estoque inexistente". **Reclassificado de P1 para P0.**

---

## 1. Lojas fantasma

Seis lojas além da Matriz, **todas com `ativo = true`**, todas com movimento zero:

| ID | Nome | Criada | Usuários (ativos) | Estoque | Caixas | Vendas | Contas a receber |
|---|---|---|---|---|---|---|---|
| `a0000001-…-000000000001` | **Matriz** | 2026-04-08 | 9 (9) | 113 | 39 | 56 | 0 |
| `148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8` | Probe 1784431715968 | 2026-07-19 | **1 (1)** | 0 | 0 | 0 | 0 |
| `8d2d3fb5-7107-4a73-8903-a0b2a289d9ca` | Probe 1784431787527 | 2026-07-19 | **1 (1)** | 0 | 0 | 0 | 0 |
| `3d65ba13-4c47-456b-b49e-5cf456229a25` | Smoke Homolog 1784432057537 | 2026-07-19 | **1 (1)** | 0 | 0 | 0 | 0 |
| `2ad145c6-72fc-46ee-aa71-ad9328ddcba8` | Smoke Homolog 1784431993511 | 2026-07-19 | 0 | 0 | 0 | 0 | 0 |
| `501db05a-0589-429c-871c-ee40af7ac928` | Smoke Homolog 1784431560866 | 2026-07-19 | 0 | 0 | 0 | 0 | 0 |
| `a0000002-…-000000000002` | Filial demo | 2026-04-08 | 0 | 0 | 0 | 0 | 0 |

As cinco `Probe`/`Smoke` nasceram no mesmo dia (2026-07-19), de execuções de homologação contra produção — consequência direta de não haver staging (`project-infra-topologia-ambientes`).

### Decisão sobre inativação de loja: **não reduz risco**

`lojas.ativo` **nunca é lido pela aplicação.** Varredura completa: a única referência é uma escrita, no rollback do provisionamento (`app/admin/provisionamento/actions.ts:486`). Nenhuma RLS policy e nenhuma RPC consultam a coluna.

**Portanto: marcar as lojas fantasma como inativas é higiene de catálogo, não controle de acesso.** Um usuário apontado para loja inativa continua entrando normalmente. Quem controla o acesso é `usuarios.ativo` (§3.1).

Recomendação: inativar as 6 por higiene — **depois** de tratar os usuários, e sabendo que sozinho não protege nada.

---

## 2. Usuários

**12 contas. Todas com `ativo = true`. Onze são de teste.**

| Perfil | Nome | E-mail | Loja | Último login | Vendas | Classificação |
|---|---|---|---|---|---|---|
| DONO | Dono Demo | `aoliveiradamata@gmail.com` | Matriz | 2026-08-03 | 30 | ✅ **real** |
| DONO | Dono E2E | `e2e-dono@localhost.test` | Matriz | nunca | 0 | ⚠️ teste |
| DONO | Probe Dono | `probe.dono.1784431715968@fp-homolog.com` | Probe …5968 | nunca | 0 | ⚠️ teste |
| DONO | Probe Dono | `probe.dono.1784431787527@fp-homolog.com` | Probe …7527 | nunca | 0 | ⚠️ teste |
| DONO | Dono Smoke | `smoke.dono.1784432057537@fp-homolog.com` | Smoke …7537 | nunca | 0 | ⚠️ teste |
| ADMIN | E2E Admin FastProduct | `e2e-admin@fastproduct.dev` | Matriz | 2026-07-19 | 0 | ⚠️ teste |
| GERENTE | Gerente E2E | `demo-gerente@localhost.test` | Matriz | 2026-07-10 | 1 | ⚠️ teste |
| GERENTE | Gerente E2E | `e2e-gerente@localhost.test` | Matriz | 2026-08-03 | 0 | ⚠️ teste |
| GERENTE | Demo Gerente | `demo@jinlong.com` | Matriz | 2026-07-29 | 2 | ⚠️ teste/demo — **confirmar** |
| OPERADOR | Operador E2E | `demo-operador@localhost.test` | Matriz | 2026-06-23 | 1 | ⚠️ teste |
| OPERADOR | Operador E2E | `e2e-operador@localhost.test` | Matriz | 2026-07-29 | **22** | ⚠️ teste |
| OPERADOR | Operador Teste | `operador.test@example.com` | Matriz | 2026-07-10 | 0 | ⚠️ teste |

### 2.1 Usuário sem loja válida

**Nenhum.** `usuarios.loja_id` é `NOT NULL` com default Matriz, e todos os 12 apontam para loja existente. Três apontam para loja fantasma — existente, mas vazia.

### 2.2 Perfil incompatível — o achado principal

**Cinco contas `DONO`, das quais quatro são de teste.** `DONO` é o perfil de maior alcance, e as policies não o restringem por loja:

```sql
-- vendas_select_dono_todas_lojas  /  estoque_select_dono_todas_lojas
EXISTS (SELECT 1 FROM usuarios u
        WHERE u.id = auth.uid() AND u.perfil = 'DONO')
```

Sem cláusula de `loja_id`. Consequência concreta: **qualquer** conta `DONO` — inclusive uma `Probe Dono` que pertence a uma loja vazia — lê **todas as vendas e todo o estoque da Matriz**.

Não é um bug de policy: a visão macro do dono é intencional e está documentada em `AUTHORIZATION_MATRIX.md`. O problema é **quem carrega o perfil**: contas geradas por script de homologação receberam `DONO`.

Atenuantes reais: as quatro contas de teste `DONO` têm `last_sign_in_at = null` — **nunca autenticaram**. O risco é latente, não explorado.
Agravantes: e-mails confirmados, contas ativas, padrão de e-mail previsível e documentado no repositório (`docs/E2E.md`, `docs/SEED_DEV_E2E.md`, `scripts/seed-dev-users.mjs`).

Sobre credenciais: as senhas **não estão versionadas** — `seed-dev-users.mjs:50-53` lê de `SEED_DEV_PASSWORD` / `PLAYWRIGHT_TEST_PASSWORD`. Mas existem nas máquinas de quem rodou o seed e nos segredos de CI, e são compartilhadas entre todas as contas seed.

### 2.3 Consequência para a homologação

**As 56 vendas de produção foram feitas por contas de teste:** `e2e-operador` (22), `Dono Demo` (30), `Demo Gerente` (2), `demo-operador` (1), `Gerente E2E` (1). Só `Dono Demo` é conta real.

Isso não é risco de segurança, mas altera a leitura da matriz de aceite: os dados existentes em produção são resíduo de teste, não operação real. Relevante para `GO_LIVE_ACEITE.md`.

---

## 3. Contratos críticos — confirmação

### 3.1 Login e conta inativa — ✅ íntegro

Corrijo aqui uma suspeita minha durante esta auditoria. Ao ver que `getUsuarioAtual()` (`lib/auth/usuarioAtual.ts:44-46`) seleciona apenas `perfil, idioma_preferido, loja_id` — **sem `ativo`** — levantei a hipótese de que inativar usuário não bloquearia o PDV. **Verifiquei e estava errado.**

A cadeia real:

| Camada | Evidência |
|---|---|
| `middleware.ts:64-66` | matcher cobre `/admin/*`, `/gerente/*` e **`/caixa/*`** |
| `sessionConsistency.ts:33` | `USUARIO_SELECT = 'perfil, idioma_preferido, loja_id, ativo'` — **carrega `ativo`** |
| `sessionConsistency.ts:124-129` | `ativo === false` → `blockedReason = 'inativo'` |
| `adminPolicy.ts:256-265` | estado `blocked` → redirect para login em **toda** rota protegida |
| `adminPolicy.ts:42-48` | `isProtectedRoute` inclui `/caixa` explicitamente |

**`usuarios.ativo = false` bloqueia painel e PDV.** É controle efetivo e é a mitigação correta.

`getUsuarioAtual` não reverificar `ativo` é ausência de defesa em profundidade, não uma brecha: Server Actions do `/caixa` são POST para a própria rota, coberta pelo matcher. Registrado como P2, sem ação nesta rodada.

### 3.2 Loja ativa — ❌ contrato inexistente

`lojas.ativo` existe no schema (`NOT NULL DEFAULT true`), **não é lido em lugar nenhum**: nem app, nem RLS, nem RPC. Uma loja inativa se comporta exatamente como uma ativa.

Não é regressão — nunca houve esse contrato. Registrado como P2: hoje é inofensivo (uma loja), e vira relevante se multi-loja entrar em escopo.

### 3.3 Estoque — ✅ íntegro

RLS ativa em todas as 9 tabelas críticas:

| Tabela | RLS | Policies |
|---|---|---|
| `usuarios` · `lojas` · `produtos` · `estoque` · `vendas` · `itens_venda` · `caixas` · `contas_receber` · `estoque_baixas` | ✅ todas | 4 · 2 · 4 · 5 · 5 · 3 · 4 · 3 · 1 |

`estoque_select_mesma_loja` escopa por `usuarios.loja_id`; `estoque_select_dono_todas_lojas` é a exceção macro descrita em §2.2.

### 3.4 Venda — ✅ íntegro

| RPC | `authenticated` | `anon` |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4` | ✅ **única habilitada** | — |
| `finalizar_venda_transacional_canonica_v3` / `v2` (4 sobrecargas) | revogada | — |
| `finalizar_venda_transacional` (legada, 2 sobrecargas) | revogada | — |
| `registrar_venda_com_itens` | revogada (só `service_role`, sync-outbox) | — |
| `decrementar_estoque_seguro` | ✅ caminho canônico | — |
| `decrementar_estoque_idempotente` (legada) | revogada | — |
| `cancelar_venda_transacional` | ✅ (perfil validado na função) | — |

**`anon` não executa nenhuma delas.** Confirma o fechamento registrado em `AUDITORIA_HARDENING_PRE_BASELINE.md` e o `guard:rpc` de fluxo único.

---

## 4. Decisão de inativação — recomendação

**Não executei nada.** Alterar estado de contas em produção é ação sua. Abaixo o que recomendo, em ordem de eficácia.

### Passo 1 — as 4 contas `DONO` de teste (P0, antes do Go-Live)

São as únicas com leitura global de vendas e estoque da Matriz.

```sql
UPDATE public.usuarios SET ativo = false
WHERE id IN (
  'd45e3cf3-d1e1-48e0-a6f7-f3799a2996cb',  -- Dono E2E        e2e-dono@localhost.test
  'dadd133f-1799-4695-9794-fb30465121c0',  -- Probe Dono      probe.dono.1784431715968@…
  'e7753f81-e397-4597-9285-7e1c2eebdc36',  -- Probe Dono      probe.dono.1784431787527@…
  '87ac559f-7082-41e0-b9dc-5f4bdda293b7'   -- Dono Smoke      smoke.dono.1784432057537@…
);
```

Reversível (`ativo = true`). Nenhuma delas jamais autenticou, então não há sessão em uso para quebrar.

### Passo 2 — demais contas de teste (P1)

`e2e-admin@fastproduct.dev`, `demo-gerente@localhost.test`, `e2e-gerente@localhost.test`, `demo-operador@localhost.test`, `e2e-operador@localhost.test`, `operador.test@example.com`.

**Antes de executar, decida duas coisas:**

1. **`demo@jinlong.com` ("Demo Gerente")** — não incluí acima. O nome e o domínio sugerem conta de demonstração comercial; se for usada para demo a cliente, inativar quebra a demo. **Confirme comigo.**
2. **Os E2E rodam contra produção.** Inativar `e2e-*` derruba a suíte E2E — que é precisamente o motivo de existirem. A decisão de fundo é a de sempre: enquanto não houver ambiente separado, ou os testes rodam com contas ativas em produção, ou não rodam.

### Passo 3 — lojas fantasma (P2, higiene)

```sql
UPDATE public.lojas SET ativo = false
WHERE id IN (
  '148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8',
  '8d2d3fb5-7107-4a73-8903-a0b2a289d9ca',
  '3d65ba13-4c47-456b-b49e-5cf456229a25',
  '2ad145c6-72fc-46ee-aa71-ad9328ddcba8',
  '501db05a-0589-429c-871c-ee40af7ac928',
  'a0000002-0000-4000-8000-000000000002'   -- Filial demo
);
```

Lembrando §1: **isso não bloqueia nada hoje.** Vale como higiene de catálogo e para o dia em que `lojas.ativo` passar a ser respeitado.

**Não recomendo `DELETE`** em nenhum caso: `usuarios.id` referencia `auth.users`, e vendas/caixas apontam para operadores. Inativar é reversível; apagar não.

---

## 5. Riscos classificados

| ID | Risco | Classe | Ação |
|---|---|---|---|
| **ID-01** | ~~4 contas `DONO` de teste ativas com leitura global~~ | ~~P0~~ **RESOLVIDO 2026-08-07** | ✅ Passo 1 executado — ver §7 |
| **ID-02** | 7 demais contas de teste ativas em produção | **P1** | Passo 2 — decidir E2E e `demo@jinlong.com` primeiro |
| **ID-03** | `guard:rpc` vermelho (caller duplicado v4) — pré-existente | **P1** | Análise própria, fora desta auditoria |
| **ID-04** | `lojas.ativo` não é contrato — coluna existe e nunca é lida | **P2** | Registrar; relevante só com multi-loja |
| **ID-05** | `getUsuarioAtual` não reverifica `ativo` (sem defesa em profundidade) | **P2** | Registrar; rota já é coberta pelo middleware |
| **ID-06** | 6 lojas fantasma poluindo o catálogo | **P2** | Passo 3 |
| **ID-07** | Dados de produção são resíduo de teste (55 das 56 vendas) | **P2** | Considerar na leitura de `GO_LIVE_ACEITE.md` |

**P0: 1 · P1: 2 · P2: 4.**

---

## 6. O que não foi feito

- **Nenhuma alteração de dados em produção** — só `SELECT`.
- **Nenhuma alteração de arquitetura, código ou refatoração**, conforme a diretriz.
- **Nenhuma policy alterada.** A visão macro do `DONO` é intencional; o problema é a atribuição do perfil a contas de teste, e a correção é nas contas.
- **Nenhuma conta apagada nem senha rotacionada.**

---

## 7. Execução do P0 — ID-01 (2026-08-07)

Autorizado na Onda 2.5. Estratégia reversível (`ativo = false`), nunca `DELETE`.

### Pré-verificação

Confirmado antes de aplicar que nenhuma spec autentica com as 4 contas: o smoke de homologação **cria** contas novas a cada execução (`smoke.dono.${stamp}@fp-homolog.com`, `e2e/smoke-fase1-provisionamento-homologacao.spec.ts:152-154`) em vez de reusar; `e2e-dono@localhost.test` só é *criada* por `scripts/seed-dev-users.mjs:57` e não é consumida por nenhum teste.

### Evidência antes → depois

| Conta | E-mail | Antes | Depois | Último login | Vendas | Caixas |
|---|---|---|---|---|---|---|
| `d45e3cf3-…2996cb` | `e2e-dono@localhost.test` | ativo | **inativo** | nunca | 0 | 0 |
| `dadd133f-…5121c0` | `probe.dono.1784431715968@fp-homolog.com` | ativo | **inativo** | nunca | 0 | 0 |
| `e7753f81-…eebdc36` | `probe.dono.1784431787527@fp-homolog.com` | ativo | **inativo** | nunca | 0 | 0 |
| `87ac559f-…dda293b7` | `smoke.dono.1784432057537@fp-homolog.com` | ativo | **inativo** | nunca | 0 | 0 |

### Validação pós-execução

| Verificação | Resultado |
|---|---|
| `DONO` ativos restantes | **1** — `aoliveiradamata@gmail.com` (conta real) |
| Usuários ativos / inativos | 8 / 4 |
| Vendas · caixas · linhas de estoque | 56 · 39 · 113 — **inalterados** |
| Contas inativadas com vendas atribuídas | **0** |
| Contas inativadas com caixa em aberto | **0** |

Nenhuma funcionalidade legítima afetada. Reversível com `UPDATE … SET ativo = true` nos mesmos 4 ids.

**Passos 2 e 3 não executados** — seguem dependendo das duas decisões abertas em §4 (o que fazer com `demo@jinlong.com` e com a suíte E2E que roda contra produção).

---

## 8. Achado adicional — `vendas_em_espera` (2026-08-07)

Durante a organização do repositório, o arquivo `TODO_auditoria_255.md` foi encontrado **dentro da árvore de código** (`app/caixa/`), onde ninguém o lê. Ele registra 12 pendências de RLS/integridade da tabela `vendas_em_espera`. Movido para `docs/auditoria/TODO_AUDITORIA_255_VENDAS_EM_ESPERA.md`.

Três das pendências foram **confirmadas vivas em produção**:

| Pendência do registro | Verificação |
|---|---|
| "RLS SELECT: hoje qualquer usuário da loja lê" | ✅ **Confirmada.** `vendas_em_espera_select` tem a cláusula `loja_id IN (SELECT u.loja_id FROM usuarios u WHERE u.id = auth.uid())` — qualquer operador da loja lê o carrinho pausado dos colegas |
| "WITH CHECK na policy UPDATE" | ✅ **Confirmada.** `vendas_em_espera_update` tem `with_check = null` — nada impede alterar `operador_id`/`loja_id` na escrita |
| "Remover `desconto_gerente_token` do persist" | ✅ Coluna existe — porém **0 de 2 linhas têm valor**, então o vazamento de token é latente, não realizado |

Estado da tabela: 2 registros `EM_ESPERA`, ambos de 2026-07-18, um único operador, uma única loja — resíduo de teste.

**Classificação: ID-08, P2.** Não corrigido nesta rodada: exige migration de policy, ou seja, alteração de contrato de segurança sob feature freeze. O impacto real hoje é baixo (dado de teste, token vazio, escopo intra-loja) e o custo de errar uma policy no núcleo é alto. Requer revisão formal, como a ADR-010.
