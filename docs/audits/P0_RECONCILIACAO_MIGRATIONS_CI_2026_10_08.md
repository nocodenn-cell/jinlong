# P0 — Reconciliação de migrations + estabilização CI

**Escopo:** diagnóstico somente-leitura sobre o tip `da0ff15d` (PR #488).  
**Projeto Supabase auditado:** `jinlong` (ref omitido; ver secrets/CI `SUPABASE_MIGRATION_CHECK_PROJECT_REF`).  
**CI de referência:** run `37814186308` (backend) + `37814186463` (pdv-importados), 2026-10-08.  
**Restrição operacional:** nenhuma DDL remota, nenhum `migration repair`, nenhum merge, nenhum deploy.

---

## 1. Veredicto executivo

| Frente | Causa raiz comprovada | GO/NO-GO |
|---|---|---|
| Drift remoto (`migration-remote-drift`) | 10 versões locais `remote_ausente` (nunca aplicadas no remoto; sem par HUMAN_GATE). 70 pares MCP/CLI já registrados continuam HUMAN_GATE (não bloqueiam). | **NO-GO** merge enquanto o gate exigir alinhamento remoto **e** essas 10 permanecerem só no Git |
| Playwright (`e2e-playwright`) | `next-server` morreu por **JavaScript heap OOM** (~3370 MB / limite 4096); depois `ERR_CONNECTION_REFUSED` em `:3000` é efeito em cascata — **não** é defeito de login | **NO-GO** estabilização até correção de memória/concorrência do webServer |
| Types-drift / gates locais | PASS no tip `da0ff15d` | **GO** preservar; não reabrir |
| E2E crítico | PASS (suíte curta termina antes do OOM) | **GO** como sinal de risco, não de decisão de merge |
| Continuidade M2 local | Sem dependência de apply remoto das 10; experimental fora do path CLI | **GO** continuidade local |
| Reconciliação remota das 10 | Exige autorização humana + plano por lote (SSOT caixa/fiscal + aditivos #488) | **NO-GO** automático |

---

## 2. Frente A — Causa raiz do drift remoto

### 2.1 O que o gate mede

Job `migration-remote-drift` (`.github/workflows/ci-backend-supabase.yml`):

1. `supabase link` com `SUPABASE_MIGRATION_CHECK_PROJECT_REF`
2. `node backend/scripts/p0-migration-status.mjs`
3. Compara `supabase migration list` (Local vs Remote) com arquivos em `backend/supabase/migrations/`
4. Aceita apenas:
   - alinhamento estrito Local=Remote
   - pares atômicos em `migration-human-gates.json` (git_only + remote_only presentes)
   - espelhos legados / greenfield SSOT / `FORBIDDEN_APPLY`

O gate **não** enfraqueceu: ele está representando corretamente que há SQL no Git ainda não registrado no histórico remoto sob a versão do arquivo.

### 2.2 Inventário no tip `da0ff15d`

| Fonte | Contagem |
|---|---|
| Arquivos `.sql` com prefixo numérico no disco | 402 |
| Linhas parseadas do CLI | 435 |
| Pares HUMAN_GATE (MCP timestamp ≠ nome do arquivo) | 70 (inclui rollout 05/10 e sprint #464) |
| Drift bloqueante | **10** (`remote_ausente`) |
| Maior versão no disco | `20261008140100` |
| Maior remote_only já gateado | `20261006200048` |

Consulta remota somente-leitura (`schema_migrations` onde `version like '20261007%' or '20261008%'`): **0 linhas**.  
Nenhum dos 10 nomes lógicos aparece sob outro timestamp MCP.

### 2.3 Dualidade histórica (já gateada — não é o bloqueio atual)

Padrão repetido desde 28/09 e consolidado no rollout 05/10 (`docs/audits/MIGRATIONS_ROLLOUT_2026_10_05.md`):

- Aplicação via **MCP `apply_migration`** (não CLI)
- `schema_migrations.version` = timestamp real de aplicação
- `name` = identificador lógico do arquivo Git
- Gate aceita só o **par** `{gitOnlyVersion, remoteOnlyVersion}`

Essas divergências são **históricas equivalentes** (SQL/hash já provados no rollout). Continuam listadas como HUMAN_GATE e **não** causam exit 1.

### 2.4 Drift bloqueante real (10 versões)

As 8 primeiras já estão em `origin/main` (mesmo blob SHA). As 2 últimas são exclusivas do #488 (restauração pós-quarentena da 120000).

| # | Local (Git) | Remoto | SHA-256 arquivo | SHA-256 normalizado (CRLF→LF + trim) | Estado real | Risco reaplicação | Evidência | Ação recomendada | Auth humana |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `20261007161220_fiscal_cancelado_ssot.sql` | — | `07cb5c16…9bebdd` | `53235bfa…1cddc43` | Só Git; blob idêntico em main | Médio — CREATE OR REPLACE + REVOKE INSERT fiscal | CI drift + SQL remoto vazio 07/08 | Apply controlado (MCP ou CLI) **após** auth; depois registrar par HUMAN_GATE se MCP gravar outro timestamp | **Sim** |
| 2 | `20261007163000_ssot_001_002_painel_ec_cache.sql` | — | `fe628dee…95e0ab` | `0c9fb204…eb724c` | Só Git; main | **Alto** — reescreve `cancelar_venda_transacional` + trigger saldo | Idem | Lote SSOT com provas locais já existentes; apply ordenado | **Sim** |
| 3 | `20261007163100_ssot_003_nfe_obrigacao_duplicata.sql` | — | `fafa37ea…f4c8ca` | `a6068e90…ec5122` | Só Git; main | Alto — `confirmar_importacao_nfe` | Idem | Mesmo lote SSOT | **Sim** |
| 4 | `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` | — | `daedb41f…a39002` | `49bd75d5…abff0da` | Só Git; main | Baixo — REVOKE idempotente | Idem | Pode ir com lote SSOT; **não** confundir com `migrations-pending-auth/20261008120000` (DROP POLICY) | **Sim** |
| 5 | `20261007170000_ssot_002_mov_ar_ec_cache.sql` | — | `636de0ed…0d3b6e` | `2f1c89d3…da0d3b6e` | Só Git; main | **Alto** — sangria/AR/liquidação | Idem | Lote SSOT após 163000 | **Sim** |
| 6 | `20261007171000_ssot_002_cancel_guard_antes_devolucao.sql` | — | `9b536de7…af75f5e` | `0de4bff6…b95df9ee` | Só Git; main | Alto — hotfix ordem do guard em `cancelar_venda_transacional` (depende de 163000+170000) | Idem | Sempre depois de 163000/170000 | **Sim** |
| 7 | `20261007180000_calcular_valor_sistema_por_forma_caixa.sql` | — | `360f9007…3c32d7` | `76dbae1d…e3b5be` | Só Git; main | Médio — função nova read-model | Idem | Lote fechamento por forma | **Sim** |
| 8 | `20261007190000_caixas_fechamento_formas_snapshot.sql` | — | `c09427b9…899898c` | `904854ff…d26fbff` | Só Git; main | **Alto** — TABLE + RLS + reescreve `fechar_caixa_atomico` | Idem | Depois de 180000; snapshot de ACL/corpo da RPC antes | **Sim** |
| 9 | `20261008140000_formas_pagamento_conta_financeira_id.sql` | — | `3683ab35…8749ff` | `d6125165…dee00b20` | Só Git; **só #488** | Baixo — `ADD COLUMN IF NOT EXISTS` aditivo | Tip #488; coluna **não** vem de `20261006180000` (que usa `financeiro_contas_forma`) | Necessária para `database.types.ts` / types-drift local; apply remoto só se produto remoto ainda consumir a coluna | **Sim** |
| 10 | `20261008140100_financeiro_comando_v1_wrapper.sql` | — | `6e44615b…a843ad` | `0636d13b…89fd9a0` | Só Git; **só #488** | **Alto** — rename `financeiro_comando`→`financeiro_comando_v1` + wrapper | Remoto já tem `financeiro_comando_operacional` (06180000→remoto 06195837); apply cego pode conflitar com superfície legada | Diff remoto de `pg_proc`/`financeiro_comando*` **antes** de qualquer apply; preferir prova de necessidade de contrato types vs schema prod | **Sim** |

### 2.5 Quarentena / pending (fora do path CLI — não são o drift)

| Artefato | Path | Papel |
|---|---|---|
| `20261006120000_…` | `migrations-forbidden/` | `FORBIDDEN_APPLY` — remote_ausente **esperado** |
| `20261008120000_…` | `migrations-pending-auth/` | DROP POLICY fiscal — **não** entra no CLI até auth |

### 2.6 O gate está correto?

**Sim.** Aceitar as 10 como HUMAN_GATE sem apply remoto mascararia schema ausente em produção (ex.: `caixas_fechamento_formas`, guards E(c), funções fiscais).  
O que **não** deve ser feito: silenciar `remote_ausente` sem prova de equivalência de schema no remoto.

Nota estrutural: `main` já carrega as 8 SSOT; o drift bloqueante **não é exclusivo do #488**. O #488 adiciona 140000/140100 e faz o tip falhar com 10 em vez de 8.

---

## 3. Frente B — Playwright / `ERR_CONNECTION_REFUSED`

### 3.1 Timeline (job `113443345230`, run `37814186463`)

| UTC | Evento |
|---|---|
| 17:24:43 | Step E2E inicia; `PLAYWRIGHT_E2E_WITH_DEV=1`; `webServer` = `npx next dev -p 3000` |
| 17:27–17:35 | Falhas **pré-OOM** em `mobile-chrome-pixel` (i18n/nav/etiquetas) — servidor ainda vivo |
| **17:36:37** | `[WebServer] FATAL ERROR: … JavaScript heap out of memory` / `OOMErrorHandler` em `next-server (v15.5.15)` — heap ~3370 MB, `NODE_OPTIONS=--max-old-space-size=4096` |
| 17:38:06+ | Cascata: `ERR_EMPTY_RESPONSE` → `ERR_CONNECTION_REFUSED` em `http://localhost:3000/login` |
| 17:41:09 | Resumo: **44 failed**; webServer **não** voltou |

Evidências numéricas no log: 1× OOM, 2× `ERR_EMPTY_RESPONSE`, 175× `ERR_CONNECTION_REFUSED`, 0 restart saudável do Next após o fatal.

### 3.2 O que **não** é a causa

- Não é falha de credencial/login (seed + readiness Auth/PostgREST passaram; E2E crítico PASS no mesmo tip)
- Não é porta 3000 nunca ocupada (testes mobile navegaram para `/admin/*` antes do OOM)
- Não é timeout curto de readiness do Supabase

### 3.3 Causa raiz

Pressão de memória do **`next dev` + suíte ampla** (chromium + mobile-chrome + mobile-safari; workers default; retries=2) no runner ~7 GB, com heap Node tetado em 4 GB. O processo do webServer morre; Playwright continua e interpreta como login/connection refused.

`e2e-critical` passa porque roda só 3 specs sequenciais e termina ~17:26 (antes do OOM ~17:36).

Falhas pré-OOM em mobile (strict `getByRole('navigation')`, placeholder etiquetas, idioma) são **dívida de harness/UI** separada — documentadas em `docs/E2E.md` — e não explicam a cascata `:3000`.

### 3.4 Correções locais propostas (não implementadas neste diagnóstico)

Ordem preferida (determinística, sem desligar testes):

1. **CI `e2e-playwright`:** `next build && next start -p 3000` em vez de `next dev` (menor heap; alinha a carga a produção).
2. Se ainda apertar: `workers: 1` **só** no job completo (não no critical).
3. Não subir `max-old-space-size` para 8192 (já matou runner no #1227).
4. Tratar falhas mobile pré-OOM em PR isolado de harness (seletores), sem tocar produto financeiro.

---

## 4. Frente C — Integridade do #488 e PRs paralelos

Não alterados neste trabalho:

- Regras financeiras / RLS / RPCs de produção
- Migrations experimentais M1/M2
- Frontend paralelo
- Credenciais / Vercel remota
- Gates (nenhum `continue-on-error`, nenhum `--warn-only` no CI)

PRs abertos preservados: #485, #489, #492, #493, #495, #496 (ramos distintos).

---

## 5. Plano seguro de reconciliação remota (requer auth explícita)

### Fase 0 — Pré-voo (somente leitura)

1. Snapshot de corpos/ACLs das RPCs alvo (`cancelar_venda_transacional`, `fechar_caixa_atomico`, `confirmar_importacao_nfe`, `financeiro_comando*`, grants `documentos_fiscais_pendentes`).
2. Confirmar backup/PITR (fora do escopo deste doc; ver #485/#489 — RPO não garantido).
3. Aplicar **primeiro em clone/branch Supabase** se disponível; senão janela curta com rollback SQL preparado.

### Fase 1 — Lote SSOT (1→6)

Ordem estrita: `161220` → `163000` → `163100` → `163200` → `170000` → `171000`.  
Após cada uma: ler `schema_migrations` (version+name+statements hash) e pós-condições.  
Se MCP gravar timestamp ≠ arquivo → registrar par em `migration-human-gates.json` no mesmo PR de reconciliação.

### Fase 2 — Fechamento por forma (7→8)

`180000` → `190000`. Validar tabela `caixas_fechamento_formas` + SELECT policy + corpo de `fechar_caixa_atomico`.

### Fase 3 — Aditivos #488 (9→10) — decisão separada

- `140000`: baixo risco se coluna ausente; no-op se já existir por outro caminho.
- `140100`: **só** após prova de que produção ainda precisa do wrapper `financeiro_comando` / rename v1 sem colidir com `financeiro_comando_operacional` já aplicado.

### Rollback

- Funções: restaurar corpo/ACL do snapshot Fase 0.
- Tabela `caixas_fechamento_formas`: dropar só se vazia / sem dependência operacional confirmada.
- Nunca apagar linhas de `schema_migrations` sem processo de repair documentado e auth.

### O que **não** fazer

- `db push --include-all`
- `migration repair` cego
- Marcar as 10 como HUMAN_GATE sem apply + hash
- Aplicar `migrations-forbidden/20261006120000` ou `migrations-pending-auth/20261008120000` neste lote

---

## 6. GO/NO-GO detalhado

### Merge do #488

**NO-GO** se branch protection exige `migration-remote-drift` verde — o tip adiciona 2 `remote_ausente` e herda 8 da main.  
**Condicional:** merge só com (a) reconciliação remota das 10 **ou** (b) decisão humana explícita de aceitar gate vermelho / mudança de política de merge (não recomendado).  
Conteúdo local do #488 (quarentena + types-drift) está **GO** nos gates locais.

### Reconciliação remota

**NO-GO** sem autorização explícita do dono do projeto. Plano acima pronto; execução bloqueada por restrição operacional.

### Estabilização Playwright

**NO-GO** até trocar `next dev`→`next start` (ou reduzir workers) em branch isolada e comprovar ausência de OOM no job completo.  
E2E crítico permanece sinal útil (PASS).

### Continuidade M2 local

**GO** — trabalho experimental local (#493/#495/#496) não depende do apply remoto das 10; manter fora de `supabase/migrations/` canônico remoto.

---

## 7. Evidências coletadas

| Artefato | Referência |
|---|---|
| Log drift | job `113438452911` / run `37814186308` |
| Log Playwright + OOM | job `113443345230` / run `37814186463` |
| Artifact traces | `e2e-playwright-test-results` (artifact id `11567299410`) |
| Tip auditado | `da0ff15d` |
| SQL remoto 07/08 | `[]` (somente leitura) |
| Rollout 05/10 | `docs/audits/MIGRATIONS_ROLLOUT_2026_10_05.md` |
| Gate script | `backend/scripts/p0-migration-status.mjs` |
| Human gates | `backend/supabase/migration-human-gates.json` (70 pares) |

---

## 8. Bloqueadores que exigem decisão humana

1. Autorizar (ou não) apply remoto do lote SSOT 07/10 já presente em `main`.
2. Autorizar (ou não) apply dos aditivos `20261008140000` / `20261008140100` do #488 — especialmente o rename/wrapper financeiro.
3. Política de merge: exigir drift verde vs. merge com dívida remota conhecida.
4. Autorizar correção de CI Playwright (`next start` / workers) em branch isolada.
5. Autorizar (separado) `migrations-pending-auth/20261008120000` — fora deste lote.

---

*Documento gerado em modo diagnóstico. Nenhuma alteração remota foi executada.*
