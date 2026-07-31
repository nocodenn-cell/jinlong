# Go-Live Certification Report — Jinlong PDV

**Data:** 2026-07-31
**Escopo:** Certificação operacional para a primeira loja real. Arquitetura congelada — nenhuma refatoração, novo módulo, mudança de banco ou redesenho foi proposto ou executado nesta rodada.
**Regra de classificação:** cada item recebe exatamente um resultado — **aprovado** | **falha bloqueadora** | **risco aceito**.

---

## 1. Resumo executivo — decisão Go/No-Go

> ## 🔴 NO-GO
>
> **Bloqueado por um único item: P0 — SYNC_KEY mismatch.** Nenhum outro item levantado nesta certificação impede a abertura da primeira loja por si só. Assim que o P0 for resolvido e comprovado com execução real do smoke, a decisão passa a **GO condicional**, com os itens de P1 permanecendo como risco aceito e documentado (ver §3).

| Bloco | Status |
|---|---|
| P0 — Sincronização (SYNC_KEY) | 🔴 **Falha bloqueadora** — único bloqueador ativo |
| P1.1 — Bypass de autorização gerencial em sangria | ✅ **Resolvido** (ver §2.5) |
| P1.1 — `saldo_atual` nunca creditado por venda | ✅ **Resolvido** (ver §2.5) |
| P1 — Demais fluxos críticos | 🟡 **Risco aceito** — evidência estática existe; execução real não foi possível nesta rodada (ver §4) |
| FIN-001 — Auditoria de devolução/troca | ✅ **Resolvido** |
| GOV-001 — Duplicidade de proteção de branch | ✅ **Resolvido** |
| Achado novo — Ordenação de migrations | 🟡 **Risco aceito** — não bloqueia a 1ª loja; vira item de backlog próprio |

---

## 2. P0 — Sincronização (pdv-local → outbox → sync-outbox → Supabase)

| Campo | Detalhe |
|---|---|
| **Item** | `smoke:sync-edge (pdv-local)`, parte do pipeline `e2e-critical` |
| **Evidência** | CI: run `30650220924`, job "E2E crítico", step "Pipeline E2E crítico" → `401 UNAUTHORIZED`. Confirmado também nos **logs reais do projeto Supabase `jinlong`** (produção): dois `POST 401 /functions/v1/sync-outbox` nos timestamps exatos dos runs de CI de hoje |
| **Causa raiz investigada** | A função [`authorizeSync`](backend/supabase/functions/sync-outbox/index.ts:973) retorna especificamente `"UNAUTHORIZED"` (não `INVALID_SIG`, não `TS_OUT_OF_WINDOW`, não `MISSING_HEADERS`) apenas quando `X-SYNC-KEY` recebido não bate byte-a-byte com o `SYNC_KEY` configurado no Edge Function (comparação via hash SHA-256, [`_shared/crypto.ts:14`](backend/supabase/functions/_shared/crypto.ts:14) — implementação correta, sem bug). `SYNC_KEY` do GitHub Actions e do Supabase Edge Function foram criados com **58 segundos de diferença** (`2026-06-02T09:19:49Z` vs `09:20:47Z`) — indício forte de rotação coordenada com divergência de encoding (espaço/newline), não de um lado simplesmente desatualizado |
| **Ação tomada** | Nenhuma — não foi alterado nenhum secret em nenhum dos dois lados, por decisão explícita de não mexer sem confirmar a fonte de verdade |
| **Pendência para desbloqueio** | Confirmação manual (Supabase Dashboard → Edge Functions → `sync-outbox` → Secrets, ou runbook de dispositivos pdv-local) sobre se há dispositivo real de loja já dependente do valor atual — resposta ainda não obtida |
| **Resultado** | 🔴 **Falha bloqueadora** |
| **Risco residual** | Enquanto não resolvido, a sincronização `pdv-local ↔ Supabase` (fluxo completo `pdv-local → outbox → sync-outbox → Supabase`) não pode ser comprovada em produção real |

---

## 2.5 Achados críticos de segurança encontrados e corrigidos (pós-relatório inicial)

Após a entrega inicial deste relatório, foi feita uma auditoria de código profunda (não só de cobertura de teste) nas 4 frentes de P1, com 3 agentes de revisão independentes lendo o código-fonte real linha a linha. Dois achados **críticos** foram confirmados, aprovados explicitamente e **corrigidos em produção** no mesmo dia:

### 🔴 CRÍTICO — Bypass de autorização gerencial em sangria (RESOLVIDO)
`registrar_movimentacao` e `aprovar_movimentacao` aceitavam um `p_gerente_id` (UUID de qualquer GERENTE/DONO/ADMIN da loja, trivialmente obtível em DTOs já expostos ao cliente) como prova de autorização — **sem exigir senha nem token**. Um operador comum, chamando a Server Action diretamente, autorizava sangria de qualquer valor sem senha de gerente nenhuma.

**Correção aplicada** (migration `20260731195704_fix_movimentacao_gerente_id_bypass_seguranca.sql`, produção `jinlong`):
- `registrar_movimentacao`: status de sangria/suprimento sempre derivado da regra de negócio; `p_status`/`p_gerente_id` deixaram de aprovar qualquer coisa.
- `aprovar_movimentacao`: token de senha validada agora **sempre** obrigatório (anti-replay); aprovador registrado vem de `tokens_desconto_gerente.criado_por` (fonte autoritativa), não do parâmetro do chamador.
- Nenhuma mudança de assinatura — fluxo real da UI não percebe diferença.
- Confirmado ao vivo no banco: bypass removido, hardening da função-trigger auxiliar aplicado após achado do linter de segurança do Supabase.
- **Commit:** `92d427086fb2f2821da36b3aed49c7dddb117d6a`

### 🟠 ALTO — `saldo_atual` nunca inicializado nem creditado por venda (RESOLVIDO)
Abertura de turno nunca setava `saldo_atual = valor_inicial`; vendas em dinheiro nunca o creditavam. Efeito real: sangria e cancelamento/devolução de venda em dinheiro falhavam com "saldo insuficiente" mesmo com caixa físico de sobra.

**Correção aplicada:**
- `cashSession.ts`: abertura de turno agora inicializa `saldo_atual = valor_inicial`.
- Migration `20260731195933_credita_saldo_caixa_venda_dinheiro.sql`: trigger em `vendas_pagamentos` credita `saldo_atual` a cada parcela em DINHEIRO — aditivo, **não toca** a RPC de finalização de venda (marcada "FREEZE: CORE TRANSACIONAL"). Como efeito colateral, corrige também o cancelamento/devolução de venda em dinheiro, que já debitavam corretamente mas falhavam por saldo nunca creditado.
- **Commit:** `92d427086fb2f2821da36b3aed49c7dddb117d6a` (mesmo commit)

**Validação técnica:** typecheck limpo, lint limpo, 846/847 testes unitários verdes (1 falha isolada e não relacionada, confirmada flaky ao rodar sozinha — 3/3 verde). Confirmado ao vivo no banco via `pg_get_functiondef`/`has_function_privilege` que as correções estão ativas em produção.

### Achados de severidade média — registrados, aguardando decisão de fix
Não corrigidos nesta rodada (fora do escopo aprovado até aqui):
- Migration que revogaria acesso de OPERADOR a cadastro de produto nunca foi aplicada em produção (hoje não explorável, nenhuma tela chama esse caminho como operador).
- Token de desconto de gerente não valida `loja_id` (sem impacto hoje, loja única).
- Fechamento via PDV local/Tauri não exige motivo para divergência de caixa (o web exige acima de R$5).
- Isenção do teto de desconto manual por item (15%) com token de gerente foi removida silenciosamente nas reescritas da RPC de venda — hoje inalcançável pela UI, mas contrato quebrado no banco.
- Campos de auditoria (IP, user-agent, device, terminal) coletados na finalização de venda nunca são persistidos em tabela alguma.
- `calcularTotaisComGerente` (client) usa base de cálculo errada — código morto hoje, não usado no checkout real.

---

## 3. P1 — Certificação dos fluxos críticos

**Nota metodológica importante:** nesta rodada, a execução real (login real + clique real na UI, ou RPC real contra Postgres) **não foi possível**. Motivo detalhado no §4. Por isso, todo item de P1 é classificado **risco aceito** — não porque a funcionalidade esteja comprovadamente quebrada, mas porque a certificação de hoje se apoia em evidência de testes automatizados pré-existentes (não executados nesta sessão), não em prova ao vivo.

| # | Item | Evidência (arquivo:linha) | Cobertura | Resultado | Risco residual |
|---|---|---|---|---|---|
| 1 | **Venda completa** (carrinho, item, desconto, pagamento, finalização, persistência) | `e2e/caixa-golden-flow-cycle5.spec.ts:28,66`; `e2e/caixa-venda.spec.ts:22` | e2e real (golden path) | 🟡 Risco aceito | `fluxo-operacional-completo.spec.ts`, cujo nome sugere prova ponta-a-ponta, na verdade só navega e lê `<h1>` — não finaliza venda nenhuma. Não usar esse arquivo como evidência |
| 2 | **Pagamento** (dinheiro, PIX, cartão, split, saldo restante) | `e2e/caixa-venda-multi-pagamento.spec.ts:32,92,120`; `e2e/caixa-fase5b-golden-flow-ui.spec.ts:130` (assert real no banco) | e2e real (golden path + 1 bloqueio de parcial sem cliente) | 🟡 Risco aceito | `caixa-fase5b-contas-receber.spec.ts` (nomeado para cobrir saldo divergente/race condition) nunca inicializa o cliente Supabase e seu teste 04 é um `TODO` vazio que passa trivialmente — **cobertura real de saldo insuficiente/concorrência é inexistente** |
| 3 | **Caixa** (abertura, venda, movimentação, fechamento, conferência) | `e2e/caixa-fluxos-criticos.spec.ts:26`; `e2e/caixa-modais-abrir-fechar.spec.ts:26` | e2e real (golden path + 1 divergência de fechamento) | 🟡 Risco aceito | **Achado crítico:** `caixa-fase6-reconciliacao.spec.ts` — o único artefato nomeado para "conferência dos valores" — não abre página nem toca banco; só faz `Array.reduce` sobre arrays mockados hardcoded comparando com os próprios valores esperados. **A reconciliação de caixa não tem nenhuma prova real hoje.** É o ponto mais fraco do P1 |
| 4 | **Devolução/troca** (RPC, estoque, impacto financeiro, auditoria FIN-001) | `e2e/admin-vendas-devolucao-troca.spec.ts:28,43`; `app/caixa/server/cancelarVendaContrato.integration.test.ts:90` (integração real, Postgres local, cancelamento total) | e2e real + integration real (parcial) | 🟡 Risco aceito | RPC `devolver_ou_trocar_venda` foi auditada linha a linha (ver FIN-001 abaixo) e está correta; mas o integration test real só cobre **cancelamento total**, não devolução **parcial**/troca de item — esses só têm prova via e2e de UI (golden path) |
| 5 | **Permissões** (operador, gerente, dono/admin, RLS por loja) | Scripts reais em `backend/scripts/` (`test-rls-scope.mjs`, `p0-rls-rest-smoke.mjs`), rodam via `ci-backend-supabase.yml` | Integração real **quando roda** | 🟡 Risco aceito | **Item mais fraco do P1:** o último run desse workflow tem `runner_id: 0` (artefato fantasma do apagão de billing) — **nenhuma execução real confirmada desde a correção do B-1** (hoje, ~17h). O CI do pdv-importados não roda essa gate, então não há garantia automática de que RLS foi validada nesta certificação |

**Recomendação para antes da 1ª loja real:** obter credencial de teste (ou resolver o achado de migrations do §5 de forma completa) para rodar de verdade, pelo menos uma vez, os itens 3 (reconciliação) e 5 (permissões) — são os dois com menor confiança real hoje.

---

## 4. Por que a execução real não foi possível nesta rodada

Tentei três caminhos, nesta ordem, todos documentados em detalhe na sessão:

1. **Ambiente compartilhado (produção/preview):** sem credencial de teste disponível.
2. **Supabase local isolado (Docker), rebuild do zero:** subiu o stack, mas a reconstrução completa do schema a partir das 234 migrations **falhou repetidamente** por um problema de ordenação (§5). Apliquei uma correção cirúrgica pontual (só nas cópias, fora do repositório) que resolveu o primeiro ponto de falha e avançou de 148 para 155 migrations aplicadas — mas um **segundo** ponto de falha, de natureza equivalente, apareceu logo em seguida, confirmando que o problema é sistêmico, não isolado.
3. Por decisão do responsável pela certificação, o caminho de rebuild local foi **registrado e encerrado** nesta rodada, sem investir mais tempo em corrigir a ordenação (que é, por si, um trabalho de correção fora do escopo desta auditoria).

Nenhum arquivo do repositório foi alterado, renomeado ou commitado neste processo — todo o trabalho de correção de ordem ocorreu em uma cópia isolada fora do diretório do projeto.

---

## 5. Achado novo — Risco de infraestrutura: ordenação de migrations

| Campo | Detalhe |
|---|---|
| **Descrição** | 201 dos 234 arquivos em `backend/supabase/migrations/` usam numeração sequencial simples (`NNN_descrição.sql`) em vez do prefixo de timestamp de 14 dígitos (`YYYYMMDDHHMMSS_...`). Como a aplicação de migrations é lexicográfica, arquivos `NNN_` (ex.: `248_`, `270_`) ordenam **depois** de qualquer arquivo com prefixo `2026...`, independente da ordem real em que foram criados |
| **Efeito comprovado** | Reconstrução do schema do zero (`supabase db reset`/`start`) falha pelo menos em dois pontos distintos onde uma migration recente depende de algo que uma migration antiga (mal ordenada) só cria depois, ou vice-versa. Corrigi o primeiro ponto cirurgicamente (renomeando só 3 arquivos, em cópia isolada) e um segundo ponto equivalente apareceu na sequência |
| **Escopo de impacto — Go-Live operacional** | **Não bloqueia a abertura da primeira loja.** A produção atual foi construída incrementalmente (cada migration aplicada em sua ordem real de criação, não replay do zero) — o schema de produção está íntegro. Este problema só se manifesta ao **reconstruir do zero** |
| **Escopo de impacto — Risco de infraestrutura** | Rebuild do zero (disaster recovery, novo ambiente, ambiente de homologação limpo) **falha hoje**. Se produção precisar ser reconstruída num incidente real, esse processo vai travar exatamente como travou aqui |
| **Classificação** | 🟡 **Risco aceito** — condicionado a: a correção completa (reconstrução da ordem cronológica real, provavelmente via consulta ao histórico git arquivo por arquivo) **entra em backlog próprio, após esta certificação** — não é item de código a resolver agora |

---

## 6. Itens já resolvidos (registro)

### FIN-001 — Lacuna de auditoria operacional em devolução/troca
- **Diagnóstico:** RPC `devolver_ou_trocar_venda` correta (transacional, idempotente, `FOR UPDATE`, validação de quantidade já devolvida, reversão de caixa/contas_receber). O problema era ausência de visibilidade: eventos de devolução/troca gravavam em `venda_pos_venda_operacoes` mas não apareciam na timeline `/admin/auditoria`.
- **Correção implementada:** novo tipo `DEVOLUCAO` na timeline existente — leitura somente-leitura de `venda_pos_venda_operacoes`, isolamento por loja via RLS já existente (sem migration, sem RPC nova).
- **Arquivos alterados:** `pdv-importados/app/admin/auditoria/actions.ts`, `_components/AuditoriaTimeline.tsx`, `page.tsx`.
- **Commit:** `2976aa8e29e8b6813eb37138de18a2f61e72547a` (branch `test/diagnose-runner-allocation`, sem push).
- **Evidência:** typecheck limpo, lint limpo, 847/847 testes unitários verdes.
- **Status:** ✅ Resolvido — validação operacional visual pendente por ausência de credencial/staging (mesma limitação do §4).

### GOV-001 — Duplicidade de proteção da branch `main`
- **Diagnóstico:** duas fontes de proteção ativas simultaneamente — Branch Protection clássica (exige `build-and-test`, real) e um Ruleset (`id 16298836`) exigindo contexts mortos (`build`, `lint`, `test`, `typecheck`) nunca publicados por workflow algum, criado em 2026-05-12 e nunca atualizado.
- **Ação:** Ruleset `16298836` deletado via API do GitHub. Branch Protection clássica confirmada intacta (`build-and-test` como único required check).
- **Status:** ✅ Resolvido. **Nota separada:** bypass de merge por conta admin (comprovado no PR #254, mergeado com `build-and-test: failure` e 0 reviews) **não foi resolvido** por esta ação — é uma permissão de conta, não uma regra a deletar. Registrado como item de governança em aberto, não bloqueador do Go-Live.

### Confirmados como resolvidos em etapas anteriores desta auditoria
- **D-4** (`build-and-test` vermelho por Node 20→22) — confirmado verde com runner real, 9min de execução.
- **B-1** (runners indisponíveis por billing) — confirmado restaurado.
- **B-4** (produção defasada) — confirmado resolvido: `pdv-importados.vercel.app` aponta para o deployment buildado do commit atual de `main`.

---

## 7. Ajuste registrado fora do escopo de certificação (baixo risco)

Ajuste visual pontual no `CaixaSearchBar` (remoção do ícone `Barcode` de dentro do input de busca do PDV), aprovado separadamente como alteração de baixo risco:
- Removido: ícone `Barcode` (lucide-react), padding-left associado, import não usado.
- Typecheck/lint: ✅ limpos.
- Validação visual: pendente por ausência de credencial (mesma limitação do §4).

---

## 8. Checklist de reativação — próximos passos na ordem certa

```
1. P0   Confirmar fonte de verdade do SYNC_KEY (Supabase Dashboard)
2. P0   Alinhar o secret desatualizado; revalidar smoke:sync-edge
3. P1   Obter credencial de teste (ou concluir reconstrução de migrations)
4. P1   Executar de verdade os 5 itens, priorizando #3 (reconciliação) e #5 (permissões)
5. —    Backlog separado: reconstrução cronológica completa das migrations (§5)
```
