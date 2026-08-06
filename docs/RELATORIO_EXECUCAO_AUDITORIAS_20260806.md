# Relatório de execução — fechamento dos achados de auditoria (2026-08-06)

**Branch:** `claude/audit-findings-go-live-qldlgw` · **Base:** `main` (`1b0dfdf`)
**Ambiente verificado:** Supabase `jinlong` (`kbabmewnahysfvlybiak`), produção.

Regra aplicada: nada foi marcado como concluído sem prova colhida do banco vivo ou do
código. Onde o registro anterior divergia da realidade, o registro foi corrigido — nos dois
sentidos.

---

## 1. Itens concluídos

### 1.1 Fechados nesta sessão

| Item | Prioridade | O que foi feito | Evidência |
|---|---|---|---|
| **D-1** — overload `fiscal_reprocessar_documento(uuid,text)` sem verificação de perfil | P0 (fiscal) | Migration `305` remove a função. Confirmado antes do DROP que nenhum chamador usa a versão de 2 args | Commit `07ad3d8b`; verificação na própria migration: sobrou 1 assinatura e ela contém `FISCAL_REPROCESSO_PERFIL`; `authenticated` manteve o EXECUTE do painel |
| **D-2** — máquina de estados fiscal (`092`) nunca aplicada | P0 (fiscal) | Migration `306` aplica o conteúdo da `092` (número novo para não mentir sobre a ordem real) | Commit `07ad3d8b`; prova viva na migration: documento levado a `EMITIDO` pelo caminho legal, `EMITIDO → PENDENTE` rejeitado, prova removida. Reprovado após a `308` |
| **D-3** — sem reaper, sem teto de tentativas, sem DLQ automática | P0 (fiscal) | Migration `307`: `fiscal_reaper_documentos`, `fiscal_claim_documentos` ignora quem está na DLQ, `fiscal_reprocessar_documento` limpa a DLQ e zera tentativas. Reaper acoplado ao `fiscal-worker`, antes do claim | Commit `07ad3d8b`; prova viva na migration percorre o ciclo inteiro: órfão → DLQ → claim ignora → resgate manual |
| **Hardening** das funções-trigger criadas pela `306` | — | Migration `308` revoga EXECUTE de `anon`/`authenticated` | Commit `30d46832`; achado do advisor do Supabase, mesmo padrão da `20260731200258` |

A ordem obrigatória **D-1 → D-2 → D-3** foi respeitada.

### 1.2 Já estavam resolvidos — confirmado, registro corrigido

| Item | Registro anterior | Realidade verificada |
|---|---|---|
| **BL-1** — reconciliação da RPC v4 (token + auditoria de desconto) | "P0, primeiro item da fila" | ✅ **Concluído.** v4 com assinatura única (22 args) contendo `SET usado`, `INSERT descontos_venda` e `motivo_desconto`; `descontos_venda` com `operador_id`/`aplicado_em`/`motivo_desconto`/`motivo_descricao_livre`; app encaminhando (`caixaVendas.impl.ts:307-308`) |
| **Revoga OPERADOR do cadastro de produto** | "migration criada, não aplicada" (e o próprio `.sql` dizia isso no cabeçalho) | ✅ **Aplicada.** Versão `20260730093000` em `schema_migrations`; gate com `'OPERADOR'` ausente do corpo vivo de `criar_produto_com_estoque_inicial` |
| **B-1**, **D-4** | Já registrados como resolvidos | Mantidos — sem contra-evidência |

---

## 2. Itens ainda pendentes, e o motivo de cada um

### 2.1 Bloqueadores de Go-Live

| # | Item | Motivo de continuar pendente |
|---|---|---|
| **D-6** 🆕 | **14 migrations (`289`–`304`, ~178 KB) aplicadas em produção que não existem em nenhum dos 272 refs do Git** | **Bloqueio real, fora do alcance de código.** Depende de quem as aplicou publicar o branch de origem. Reconstruí-las por engenharia reversa foi descartado de propósito — ver §4 |
| **D-7** 🆕 | **Reconstrução do banco quebrada por 3 dependências fora de ordem** (raiz única: `248_devolver_ou_trocar_venda.sql`) | Não bloqueia a 1ª loja, mas bloqueia disaster recovery e o staging (P0-3). **A correção já existe pronta** no branch `origin/chore/node22-alignment` — basta abrir PR. Não renomeei nada por instrução explícita de escopo |
| **P0** | SYNC_KEY mismatch (`smoke:sync-edge` → 401) | Exige confirmar a fonte de verdade no console do Supabase e decidir qual lado rotacionar. Nenhum secret foi tocado |
| **B-2** | Required status checks inexistentes em `main` | Console do GitHub, dono do repositório |
| **B-3** | Bypass list ativa (torna a proteção decorativa) | Console do GitHub, dono do repositório |
| **B-4** | Produção defasada na Vercel | Console da Vercel |
| **B-6** → **B-5** | `FISCAL_PROVIDER_TYPE=mock`; Vault sem credenciais do worker | Console do Supabase. **O código já está pronto**: D-1/D-2/D-3 eram os pré-requisitos e estão cumpridos. Inverter a ordem emite documento com chave `NFE-MOCK-…` |
| **P0-3/4/6** | Staging separado, remoção de contas de teste, plano do GitHub | Saneamento operacional, não código |

### 2.2 P1 — certificação dos fluxos críticos

Permanece **risco aceito**, pelo mesmo motivo da rodada anterior e sem mudança nesta: não há
credencial de teste, e o rebuild local do schema falha pela ordenação de migrations. Os dois
pontos de menor confiança continuam sendo **reconciliação de caixa** (o arquivo nomeado para
isso só faz `Array.reduce` sobre mocks) e **permissões/RLS** (o workflow não teve execução
real confirmada).

### 2.3 P2 — não iniciados, por regra de priorização

A instrução era explícita: P2 só depois de P0 e P1. Há P0 aberto (D-6, SYNC_KEY, B-2…B-6),
então **nenhum P2 foi executado** — apenas retriados com evidência.

| Item | Situação verificada |
|---|---|
| Token de desconto de gerente não valida `loja_id` | 🟡 Aberto — **e maior do que o registrado.** Nenhum chamador envia `loja_id` hoje (`CaixaPageClient.tsx:1199`, `caixaMovimentacoes.impl.ts:100`), e os tokens existentes têm `loja_id NULL`. Exigir a igualdade na RPC **agora quebraria o desconto de gerente em produção**. Ordem correta: (1) `validar-gerente` derivar a loja do gerente autenticado; (2) deploy da edge function; (3) confirmar tokens com `loja_id`; (4) só então a RPC exigir |
| Auditoria (IP/UA/device/terminal) nunca persistida — BL-3 | 🟡 Aberto, confirmado: cada parâmetro aparece 1 vez no `functiondef` — só a assinatura, nenhum uso |
| Isenção do teto de 15% por item com token de gerente | 🟡 Aberto, confirmado: `max_desconto_manual_item` ausente da v4 viva |
| Fechamento no PDV local sem motivo de divergência | 🟡 Aberto — não reverificado (exige o app Tauri) |
| `calcularTotaisComGerente` com base de cálculo errada | ⚠️ **Reclassificar.** "Código morto" não se sustenta: é reexportada pelos stores dos dois apps. Se a base estiver errada, o alcance é maior que o registrado |
| BL-2 (promoções), BL-4 (guard de drift de corpo), BL-5 (teto de item por config) | Backlog, não iniciados |

---

## 3. Riscos remanescentes para o Go-Live

| Risco | Severidade | Leitura |
|---|---|---|
| **Rebuild do banco entrega schema errado sem falhar** (D-6) | 🔴 Alta | Pior que o achado de ordenação: aquele **falha** e avisa; este **passa** e entrega um banco sem multi-tenant de fornecedor, conferência de NF-e/OC, limite de crédito, snapshot de custo e formas de pagamento. Em um incidente real, é o risco mais perigoso da lista |
| **Trabalho em produção sem revisão** (D-6) | 🔴 Alta | ~178 KB de DDL que não passou por PR, CI ou guard. Enquanto B-2/B-3 estiverem abertos, a proteção de branch também não pegaria |
| **Rebuild do banco nem chega ao fim** (D-7) | 🟠 Média-alta | Erro duro em `SQLSTATE 42883`; hoje derruba 2 gates de CI. Mitigado por já existir correção pronta em branch — vira baixo assim que o PR for aberto |
| **Sincronização `pdv-local ↔ Supabase` não comprovada** (SYNC_KEY) | 🔴 Alta | Se a loja usar o PDV local, o caminho de sync não tem prova de funcionamento |
| **Reconciliação de caixa sem prova real** | 🟠 Média-alta | O artefato que deveria cobrir isso não abre página nem toca banco |
| **RLS por loja sem execução confirmada** | 🟠 Média-alta | Agrava com `294_fornecedores_multi_tenant` em produção: multi-tenant começou a existir sem que o gate de RLS tenha rodado |
| **Token de desconto cruzando lojas** | 🟠 Média | Inócuo com loja única; deixa de ser quando a segunda loja entrar |
| **Ordenação lexicográfica de migrations** | 🟡 Média | Registrado na certificação §5, segue aberto. Independente de D-6 |
| **Módulo fiscal ligado fora de ordem** | 🟡 Média | Mitigado: os três pré-requisitos de código estão cumpridos e a ordem está escrita no `GO_LIVE_BLOCKERS.md`. O risco agora é operacional (inverter B-6 e B-5) |

---

### 2.4 Divergência introduzida por esta própria sessão

As migrations `305`–`308` foram aplicadas via `apply_migration`, que gravou versão por
timestamp (`20260806134834`…), enquanto os arquivos no repositório seguiram a convenção `NNN_`
vigente. É drift do mesmo tipo que este PR denuncia, criado por ele.

**Impacto real: baixo** — as quatro são idempotentes (`DROP … IF EXISTS`, `ADD COLUMN IF NOT
EXISTS`, `CREATE OR REPLACE`, `REVOKE`), então reaplicá-las num rebuild é seguro. A correção é
renomear os quatro arquivos para o prefixo que produção gravou: quatro `git mv`, zero mudança
de conteúdo. **Não feito por instrução explícita** desta tarefa ("não recrie, renomeie ou
reescreva migrations"). Detalhe em `AUDITORIA_DRIFT_MIGRATIONS_20260806.md` §2.4.

---

## 4. Por que D-6 não foi corrigido nesta sessão

Extrair os `statements` de `schema_migrations` e gravá-los como `.sql` era possível. Foi
descartado por três razões, todas de arquitetura, não de esforço:

1. **Criaria duplicata divergente.** As migrations têm cabeçalho, numeração própria (`289_`,
   `291_`, …) e blocos `DO $verify$` no estilo do projeto — foram escritas por alguém, e
   existe um branch de origem. Reconstruir em paralelo produz dois arquivos para a mesma
   migration no dia em que esse branch subir.
2. **Entregaria metade da mudança.** O código de aplicação que consome esse schema também
   está fora de `main`. Um repositório com as migrations e sem os consumidores é menos
   coerente, não mais.
3. **Perderia a intenção.** Justificativa, mapeamento de chamadores e plano de rollback — que
   este projeto exige em toda migration — não são recuperáveis de `pg_get_functiondef`.

Resolução proposta, passo a passo, em
[`AUDITORIA_DRIFT_MIGRATIONS_20260806.md`](./AUDITORIA_DRIFT_MIGRATIONS_20260806.md) §4. Os
números `289`–`304` continuam livres no repositório e batem exatamente com os nomes já
registrados no banco.

---

## 5. Percentual estimado de conclusão

Estimativa por frente, contando só o que tem evidência:

| Frente | Conclusão | Base da estimativa |
|---|---:|---|
| **Núcleo PDV (venda, caixa, estoque, desconto)** | ~95% | BL-1 fechado e verificado; certificação operacional concluída; 847 testes verdes. Falta prova ao vivo de reconciliação |
| **Módulo fiscal — código** | 100% | D-1, D-2, D-3 fechados na ordem, cada um com prova viva |
| **Módulo fiscal — ativação** | 0% | B-6 e B-5 são console e não foram tocados |
| **Catálogo / cadastro de produto** | ~90% | P0 e P1 das 3 rodadas entregues; resta decisão de produto (tags, tela de detalhe, fornecedor inativo) |
| **Infra / CI-CD** | ~55% | B-1 e D-4 resolvidos; B-2, B-3, B-4 abertos |
| **Governança / SSOT do schema** | ~40% | D-6 aberto; ordenação de migrations aberta |
| **Certificação P1 (prova ao vivo)** | ~30% | Evidência estática existe; execução real segue impossível sem credencial |
| **Projeto para Go-Live do núcleo PDV** | **~80%** | Ponderado pelo caminho crítico |

Leitura honesta: **o código está substancialmente pronto; o que falta é majoritariamente
console e governança.** Depois desta sessão não resta nenhum bloqueador de Go-Live que seja
código — os 6 restantes são Vercel, Supabase, GitHub e publicação de trabalho já em produção.

---

## 6. Checklist final de Go-Live

### Bloqueia a abertura da primeira loja

```
▢  D-6   Publicar as 14 migrations 289–304 que estão em produção e fora do Git  [OWNER]
         → janela 05/08 15:18 → 06/08 09:05 UTC em schema_migrations
▢  P0    Confirmar a fonte de verdade do SYNC_KEY e alinhar o secret     [OWNER]
▢  P0    Revalidar smoke:sync-edge após alinhar                          [DEV]
▢  B-4   Restaurar produção na Vercel (main está à frente)               [OWNER]
▢  B-2   Habilitar required status checks em main                        [OWNER]
▢  B-3   Esvaziar a bypass list                                          [OWNER]
▢  P0-4  Remover contas de teste da produção                             [OWNER]
```

### Destrava a reconstrução do banco e 2 gates de CI — correção já pronta

```
▢  D-7   Abrir PR de origin/chore/node22-alignment                       [OWNER]
         → superconjunto de main (8 commits, 0 atrás); contém o rename de
           248_devolver_ou_trocar_venda.sql que resolve as 3 quebras, mais
           2 migrations e 3 renames de nomenclatura, todos byte-idênticos
▢  —     Validar pelo gate "Supabase local RLS smoke", que deve voltar a subir
```

### Bloqueia só o módulo fiscal — ordem obrigatória, não inverter

```
✅ D-1   Overload sem authz removido                    (migration 305)
✅ D-2   Máquina de estados aplicada                    (migration 306)
✅ D-3   Reaper + teto de tentativas + DLQ              (migration 307)
▢  B-6   FISCAL_PROVIDER_TYPE: mock → provider real                      [OWNER]
▢  B-5   Vault: fiscal_worker_url + fiscal_worker_key                    [OWNER]
▢  —     Reagendar o pg_cron do worker (desagendado pela migration 285)  [OWNER]
```

> O reaper **não** precisa de agendamento próprio: roda dentro do `fiscal-worker`, antes do
> claim. Ajuste por env se necessário: `FISCAL_REAPER_TIMEOUT_MINUTOS` (15),
> `FISCAL_REAPER_MAX_TENTATIVAS` (5).

### Recomendado antes de operar de verdade

```
▢  Obter credencial de teste e executar ao vivo a reconciliação de caixa
▢  Rodar de verdade o gate de RLS por loja  — urgência subiu com 294_fornecedores_multi_tenant
▢  P0-3  Criar projeto Supabase de staging para separar Preview de Produção
▢  P0-6  Plano do GitHub compatível com branch protection
▢  Substituir o teste de reconciliação que só faz Array.reduce sobre mocks
```

### Pós-Go-Live

```
▢  Renomear as migrations 305–308 para o prefixo que produção gravou (4 git mv)
▢  Token de desconto de gerente com escopo de loja (na ordem descrita em §2.3)
▢  BL-3  Persistir a auditoria de IP/UA/device/terminal
▢  Reclassificar calcularTotaisComGerente antes de decidir o fix
▢  Gate de CI comparando schema_migrations com backend/supabase/migrations/
```

> **Não entra mais na lista:** "reconstrução cronológica completa das migrations". A auditoria
> mostrou que das 2.932 inversões só **3** quebram algo, todas da mesma raiz — renumerar os
> ~76 arquivos `NNN_` seria trabalho grande sem ganho proporcional. Fica registrado como
> decisão, não como pendência.

---

## 7. Validação executada

### 7.1 CI do PR #258 (HEAD `44722ede`)

| Check | Resultado | Leitura |
|---|---|---|
| **`build-and-test`** (único *required*) | ✅ **success** (6m54s) | [run 31109766289](https://github.com/nocodenn-cell/fastproduct/actions/runs/31109766289) |
| `edge-functions-typecheck` | ✅ success | valida a alteração no `fiscal-worker` |
| `gitleaks`, `outbox-contract`, `anti-replay-diagnostic-gate` | ✅ success | — |
| Vercel preview | ✅ Ready | build do app passa |
| `migration-remote-drift` | ❌ failure | **pré-existente** — compara contra o projeto de staging do secret `SUPABASE_MIGRATION_CHECK_PROJECT_REF`, que não existe (bloqueador **P0-3**). Já listava 41 migrations (`248`→`288`) como ausentes antes deste branch |
| `rls-rest-gate` | ❌ failure | **pré-existente** — HTTP **401 em toda chamada**, ou seja credencial inválida, não negação de RLS: JWTs de smoke expirados desde 2026-05-17 (§7.5 da certificação) |
| `Supabase local RLS smoke` | ❌ failure | **pré-existente** — é o **D-7**: o stack local não sobe por causa de `248_devolver_ou_trocar_venda.sql` fora de ordem |
| `Test RLS scope by profile` | ❌ failure | **pré-existente** — mesma causa (`No such container: supabase_db_fastproduct`) |
| `E2E crítico (sistema de risco)` | ❌ failure | **pré-existente** — falha em `smoke:sync-edge (pdv-local)` com `error: 'UNAUTHORIZED'`: é o **P0 do SYNC_KEY**, já registrado na certificação §2 |

**Nenhuma das 5 falhas foi introduzida por este branch**, e cada uma foi confirmada pelo log do
próprio job, não por inferência. As migrations deste PR sequer chegam a ser alcançadas no job de
rebuild: ele morre por volta da centésima de 241.

### 7.2 Validação local

| Verificação | Resultado |
|---|---|
| `npx tsc -p tsconfig.typecheck.json --noEmit` | ✅ sem erros |
| `npx vitest run` | ✅ **847/847** em 161 arquivos |
| `npx next lint` (áreas alteradas) | ✅ sem avisos |
| `npm run guard:all` (9 guards) | ✅ OK — 6 avisos de legado pré-existentes |
| `deno check` do `fiscal-worker` | ✅ limpo |
| Migrations `305`–`308` | ✅ aplicadas em `jinlong`, com verificação no efeito dentro de cada transação |
| Dados de produção | ✅ inalterados — as provas vivas criam e removem suas próprias linhas; 2 documentos fiscais antes e depois, 0 sobras |

**Não executado:** `deno check` de `sync-outbox` e `validar-gerente` — o proxy deste ambiente
bloqueia `esm.sh` (`unsuccessful tunnel`), de onde esses dois importam. Nenhum dos dois foi
alterado. `npx next build` não foi executado: nenhuma mudança de runtime no app (só
`database.types.ts`, coberto pelo typecheck).
