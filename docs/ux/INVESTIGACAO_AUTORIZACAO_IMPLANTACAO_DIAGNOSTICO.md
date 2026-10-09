# Investigação — autorização por URL em Implantação e Diagnóstico do Caixa

> **Atualização (2026-10-09):**
> - **A3 (RLS do GO-LIVE): corrigido e aplicado em produção** com autorização explícita — PR #516 (mergeado). Versão remota `20261009033124` (nome do arquivo `20261009120000`), par registrado em `migration-human-gates.json`. Pré-check de catálogo: produção idêntica ao repositório. Verificação pós-aplicação (catálogo): trigger habilitado, função `SECURITY DEFINER`, sem `EXECUTE` para `PUBLIC`, linha existente inalterada.
> - **A1 (Diagnóstico por URL): decidido** — só DONO/ADMIN; **Implantação segue acessível ao GERENTE**. PR #517 (mergeado). Descoberta: `loadAdminContext` só calcula permissões e **não bloqueia**; a página e a Server Action agora barram explicitamente.
> - **A2 (action sem guarda): corrigido** no #517; erro de permissão correto e tratamento de exceção no #518.
> - **Aberto:** a RPC `pdv_diagnostico_pre_producao` ainda aceita GERENTE no banco (só leitura). Exige migration; decisão pendente.

| Campo | Valor |
|---|---|
| Data | 2026-10-08 |
| Natureza | **Investigação com evidência. Nenhuma correção aplicada** (fica em PR de segurança separado, conforme pedido). |
| Ambiente | Stack Supabase **local e isolada** (`supabase start`, projeto `fastproduct`, portas 54321+), 401 migrations do repositório + `seed.sql`. Usuários de teste locais com senhas descartáveis. **Nada remoto foi tocado**; nenhuma migration remota; nenhuma credencial real. |
| Reprodução | `docs/ux/evidencias/authz-probe.mjs` (lê a senha de teste de arquivo local; não contém segredo) |

## 1. Resumo

| # | Achado | Risco | Evidência |
|---|---|---|---|
| A1 | `/admin/diagnostico-caixa` e `/admin/implantacao` abrem por URL para **GERENTE e DONO**; a sidebar só os esconde de não-ADMIN | **Baixo** (por desenho atual da policy; exposição de leitura) | §2 |
| A2 | `executarDiagnosticoCaixaAction` não tem guarda de sessão no TypeScript, mas a RPC bloqueia no banco | **Baixo** (defesa existe, só está em outra camada) | §3 |
| **A3** | **A RLS de `implantacao_checklists` permite que qualquer GERENTE da loja grave `go_autorizado=true` e `go_autorizado_por=<qualquer usuário>` direto pela API, contornando a regra "só DONO/ADMIN autoriza" e a checagem de bloqueios** | **Médio** | §4 — **reproduzido** |

Nenhum dos três afeta venda, caixa, estoque ou financeiro. O alcance real do A3 é a **integridade da evidência de governança do GO-LIVE**, porque `go_autorizado` só é lido dentro do próprio módulo de implantação (`grep` em `.ts/.tsx/.sql`).

## 2. A1 — acesso por URL às duas páginas

- `adminPolicy.ts`: `RESOURCE_PROFILES['route:/admin/implantacao']` e `['route:/admin/diagnostico-caixa']` = `ALL_ADMIN_PROFILES` (GERENTE, DONO, ADMIN). Só `route:/admin/provisionamento` é `['ADMIN']`.
- Sidebar: `adminOnly: true` esconde os dois de quem não é ADMIN (`showAdminOnlyItems = perfil === 'ADMIN'`). **É cosmético.**
- A página de Implantação restringe dentro da UI: `podeAutorizarGo = DONO || ADMIN`; override de loja só para ADMIN (`implantacao/page.tsx:23,26`).
- Cronologia útil: o gate de GO-LIVE é um instrumento do **dono** (autorizar) com participação do gerente (preencher). Ver §5, decisão 1.

**Risco: baixo.** Gerente ver um checklist e um diagnóstico técnico não expõe dado de cliente ou financeiro.

## 3. A2 — Diagnóstico do Caixa

- Server action `executarDiagnosticoCaixaAction` (`diagnostico-caixa/actions.ts`) **não verifica sessão**. Delega a `executarDiagnosticoCaixaPreProducao`, que chama a RPC `pdv_diagnostico_pre_producao` com o cliente do usuário.
- A RPC é `SECURITY DEFINER` e valida internamente: `auth.uid()` nulo → `sessao_expirada`; perfil fora de GERENTE/DONO/ADMIN → `nao_autorizado` (`20260621005400_256_...sql:14-30`). `GRANT` apenas para `authenticated` e `service_role`.
- **Teste real (local):**

| Chamador | Resultado |
|---|---|
| anon (sem login) | **401** `permission denied for function` |
| OPERADOR | **403** `nao_autorizado` |
| GERENTE | 200 (executa) |
| DONO | 200 (executa) |

- O que a RPC devolve: presença de migrations, `GRANT`s e funções (estado técnico da instalação). **Somente leitura.**

**Risco: baixo.** A defesa existe no banco. Recomendação de higiene (não urgente): adicionar `assertGerenteSession()` na action, para que a camada de aplicação não dependa só do banco.

## 4. A3 — RLS permite forjar a autorização de GO-LIVE (reproduzido)

**Fato de código:**
- `autorizarGoLiveAction` exige `DONO|ADMIN` e que não haja `bloqueios` (`implantacao/actions.ts:283-294`). Essa regra existe **só na aplicação**.
- Na migration `20260719032927_implantacao_checklist_go_live.sql`, as políticas `implantacao_checklists_update` / `_insert` usam `auth_usuario_gerencial_loja(loja_id)` (GERENTE, DONO ou ADMIN da loja) **sem restringir colunas ou perfil**. Não há trigger (`pg_trigger` vazio para a tabela) nem restrição de coluna: `authenticated` tem `UPDATE` em `go_autorizado`.
- A aplicação usa o cliente Supabase **do usuário** (`createClient()`), logo o gerente já possui o token que a API aceita.

**Teste real (stack local, gerente com login de verdade):**

| Ação | Resultado |
|---|---|
| GERENTE cria cabeçalho do checklist da própria loja | 201 |
| **GERENTE `PATCH` `go_autorizado=true`, `go_autorizado_por=<id do DONO>`, `go_observacao='forjado…'` direto no PostgREST** | **200 — gravou.** Lido de volta pelo DONO: `go_autorizado=true`, `go_autorizado_por=<DONO>` |
| OPERADOR tenta ler / alterar o cabeçalho | 0 linhas (bloqueado por RLS) |
| GERENTE cria cabeçalho de **outra loja** | 403 (isolamento multiempresa preservado) |
| GERENTE altera cabeçalho de outra loja | 0 linhas afetadas |

**Conclusão:**
- O isolamento **entre lojas** e a barreira para **OPERADOR/anon** funcionam.
- A barreira **GERENTE × DONO** existe só na interface; pela API, o gerente autoriza o GO-LIVE em nome do dono, ignorando os bloqueios e forjando quem autorizou (`go_autorizado_por` é FK para `auth.users`, qualquer id válido serve).

**Classificação: MÉDIO.**
- Probabilidade: baixa-média (exige um GERENTE autenticado que conheça a API; o token do usuário é público para ele).
- Impacto hoje: baixo-médio — adultera **trilha de governança**; `go_autorizado` não destrava venda nem financeiro (única leitura está em `implantacao/actions.ts`).
- Agravante futuro: se alguém passar a usar `go_autorizado` como gate real (ex.: bloquear PDV antes do GO), vira alto.
- Mesma classe de problema pode existir em `implantacao_checklist_itens` (gerente marcar item como CONCLUIDO é **intencional** — a UI permite —, mas então o par "gerente preenche / dono autoriza" só se sustenta se o cabeçalho for protegido).

## 5. Correção sugerida (NÃO aplicada) e decisões

**PR de segurança separado, com migration revisada e gate humano** (`migration-human-gates.json`):

1. **Decisão de produto (P1):** GERENTE deve poder abrir Implantação/Diagnóstico por URL? (a) sim — documentar e manter; (b) não — restringir a DONO/ADMIN em `adminPolicy.RESOURCE_PROFILES` e na própria página (`loadAdminContext` + guarda). Recomendo (a) para Implantação (gerente preenche) e (b) para Diagnóstico (ferramenta de equipe).
2. **Correção de A3 (obrigatória se GO-LIVE for governança real):** migration que separa as permissões do cabeçalho, p. ex.
   - `REVOKE UPDATE (go_autorizado, go_autorizado_em, go_autorizado_por, go_observacao) ON implantacao_checklists FROM authenticated;` e uma RPC `SECURITY DEFINER` `autorizar_go_live(p_loja_id, p_obs)` que valida `perfil IN ('DONO','ADMIN')` + bloqueios; **ou**
   - trigger `BEFORE UPDATE` que rejeita mudança nessas colunas se `auth_perfil() NOT IN ('DONO','ADMIN')` e força `go_autorizado_por = auth.uid()`.
   A UI continua igual; muda só a garantia.
3. **Higiene (A2):** `assertGerenteSession()` em `executarDiagnosticoCaixaAction`.
4. **Teste de regressão:** transformar `authz-probe.mjs` em teste SQL/e2e do gate (já existe `financial-adversarial-gates` como modelo).

**Não incluir** nenhuma dessas mudanças em PRs de navegação.

## 6. Limites desta investigação

- Verificação **somente local**. Não consultei o banco de produção; o estado das policies lá deveria ser conferido (`pg_policies`), pois o ambiente pode divergir (há `MIGRATIONS_DRIFT_CLASSIFICATION.md` no repositório).
- Não testei a política de `implantacao_checklist_itens` com o mesmo rigor (escrita permitida a GERENTE é intencional).
- O gate de DONO só foi exercitado pelo fluxo de UI na leitura de código, não por clique em navegador.
