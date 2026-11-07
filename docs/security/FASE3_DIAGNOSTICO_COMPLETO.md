# Fase 3 — Diagnóstico completo (segurança, integridade, performance, backup)

Data: 2026-11-05 · Branch: `claude/jinlong-fase3-remediation-plan-15a1d1` · HEAD `1153c962` · Worktree limpa antes do trabalho.
Escopo: auditoria e planejamento. Nenhuma migration, grant, policy, trigger, dado ou configuração foi alterado. Nenhum commit, push ou deploy.

Legenda de evidência:
- **[CÓDIGO]** lido no repositório (arquivo:linha).
- **[PROD-SOMENTE-LEITURA]** consulta `SELECT` no projeto Supabase `jinlong` (`kbabmewnahysfvlybiak`) via MCP.
- **[HIPÓTESE]** plausível, não comprovada.
- **[NÃO VERIFICADO]** não foi possível checar nesta etapa.

---

## 1. Acesso e inventário

| Item | Situação |
|---|---|
| Repositório | **Acessível**. O relatório dizia "GitHub 403"; aqui o worktree local está íntegro (3.528 arquivos rastreados). |
| Migrations versionadas | `backend/supabase/migrations/` — 457 arquivos. |
| App PDV/gerente/admin | `pdv-importados/` (Next.js). |
| PDV offline | `pdv-local/` (Tauri + SQLite) e `backend/supabase/functions/sync-outbox/` (Edge Function). |
| Migrations 001–004 do relatório | **Não estão no repositório** (`migrations_preparadas/`). Não foram validadas como arquivos; só o efeito descrito no relatório. |
| Réplica, `replica/`, `backup/` do relatório | **Não estão no repositório** deste worktree. Ficam fora do escopo verificável aqui. |
| Projeto de produção | `jinlong` — ACTIVE_HEALTHY, Postgres 17.6. Staging `jinlong-staging` está INACTIVE; homolog `jinlong-homolog-palm` ACTIVE. |

**Divergência crítica de migrations (repo × produção):** o ledger de produção (`list_migrations`) não contém versões que existem no repo, por exemplo `20260913090000_relatorio_tz_validado_sem_pg_timezone_names`, `20261028110000_corte_admin_papeis`, `20261028121000`. Também há versão diferente com o mesmo nome: `caixas_fechado_exige_dados_fechamento` está em produção como `20261005151730` e no repo como `20260929120000`. **Antes de aplicar qualquer migration, é preciso reconciliar o ledger.**

---

## 2. Mapeamento dos fluxos de escrita

| # | Fluxo | Arquivo:linha | Função / RPC | Origem | Persistência | Perfil autorizado | Contorno possível | Testes |
|---|---|---|---|---|---|---|---|---|
| F1 | Finalizar venda online | `pdv-importados/app/caixa/server/caixaVendas.impl.ts:300` | `finalizar_venda_transacional_canonica_v4` (SECURITY DEFINER, dono `postgres`, EXECUTE authenticated) | Server action do PDV | RPC transacional | OPERADOR/GERENTE/DONO/ADMIN da loja | Não pela UI. Pelo REST, sim (ver A1) | `pdv-importados/tests/contrato-finalizar-venda-v4.test.ts` |
| F2 | Cancelar venda | `caixaVendas.impl.ts:103` | `cancelar_venda_transacional` (DEFINER, authenticated) | Server action | RPC | Gerente/operador conforme RPC | Não pela UI; REST DML permite alterar/excluir (A3) | `cancelarVendaContrato.integration.test.ts` |
| F3 | Devolução / troca | `app/admin/vendas/actions.ts` (leitura) → RPC `devolver_ou_trocar_venda` | DEFINER, authenticated | Admin/Gerente | RPC | — | — | `e2e/admin-vendas-devolucao-troca.spec.ts` |
| F4 | Abrir caixa | `app/caixa/server/cashSession.ts:123-131` | **INSERT direto em `caixas`** (`operador_id`, `loja_id`, `valor_inicial`, `saldo_atual`, `status`) | Operador (authenticated) | REST direto | OPERADOR | `valor_inicial` aceito do cliente (ver N1) | `e2e` de caixa |
| F5 | Fechar caixa | `cashSession.ts:170` | `fechar_caixa_atomico` (DEFINER, authenticated) | Operador | RPC | Operador próprio | — | `fechamento-caixa-por-forma.pr-b.test.ts` |
| F6 | Reabrir caixa (retomada) | Não há chamada no app (busca em `pdv-importados` sem resultado para `retomar_caixa_atomico`). RPC existe: migration `20260904140000_retomar_caixa_atomico.sql` | `retomar_caixa_atomico` (DEFINER, authenticated) | — | RPC que cria **novo** turno | GERENTE/DONO/ADMIN com token | — | Sem consumidor de UI |
| F7 | Sincronização offline — venda | `backend/supabase/functions/sync-outbox/index.ts:786-787` | `registrar_venda_com_itens` / `_v2` (DEFINER, **sem** EXECUTE para authenticated) | Edge Function com `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:1156-1165`) | RPC via service_role | Outbox HMAC | Depende de segredo HMAC (não auditado aqui) | `sync-outbox-contract-smoke.mjs` |
| F8 | Sincronização offline — caixa | `sync-outbox/index.ts:564` (INSERT `caixas`), `:611` (`fechar_caixa_pdv_atomico`), `:672` (`registrar_movimentacao`) | Service role | Edge | INSERT direto só em `caixas` (service_role) | — | — | — |
| F9 | Sync offline — gravação local | `pdv-local/src-tauri/src/db.rs:517,538,570` | INSERT em `vendas`, `itens_venda`, `vendas_pagamentos` **no SQLite local** | Tauri | SQLite | — | — | — |
| F10 | Disparo do sync | `pdv-local/src/hooks/usePdvLocalOutboxSync.ts:41` usa `sync_outbox_real_cmd` | `pdv-local/src-tauri/src/db.rs:1721` (real) | Tauri | — | — | Comando `sync_outbox` (simulado) **registrado** em `main.rs:43-44` e `db.rs:1636` (marca ENVIADO sem enviar) — ver N2 | `usePdvLocalOutboxSync.test.tsx` |
| F11 | Alertas leves pós-venda | `app/caixa/server/registrarAlertasLevesVenda.ts:24` | `pdv_config_flags_visuais` (a cada venda) | Server | RPC | — | — | — |
| F12 | Ajuste de cliente/usuário | `app/admin/funcionarios/actions.ts:460,563,577` | UPDATE em `usuarios` via cliente `admin` (service role) | Admin | — | ADMIN | — | — |
| F13 | Seleção de empresa | `app/selecionar-empresa/actions.ts:26` | UPDATE `usuarios.loja_id` via `admin` | Usuário | — | Verificar validação de vínculo | NÃO VERIFICADO | — |
| F14 | Demo | `app/demo-fluxo/actions.ts:144,202,217` | `.from('caixas')`, `.from('vendas')` | Rota demo | **NÃO VERIFICADO** se é escrita e se está desligada em produção | — | — | — |

**Escritas diretas de `vendas`, `itens_venda`, `vendas_pagamentos`, `descontos_venda` no código do app:** busca em `pdv-importados` (excluindo testes) por `.from(tabela).insert/update/upsert/delete` não retornou nenhuma ocorrência. As únicas escritas diretas de `authenticated` identificadas são `caixas` (F4) e `usuarios` (idioma e vínculos, via cliente próprio ou admin). [CÓDIGO]

**Conclusão de F1–F13:** o app escreve venda por RPC transacional. O REST DML em vendas não é usado pelo app identificado. Isso reduz o risco de quebra da migration 002, mas **não** remove a superfície de ataque (ver A1/A3).

Limitações: não examinei `caixaVendaEspera.impl.ts` (só leituras confirmadas nas linhas 390–485), nem o gerente de vendas além das linhas 200–270 e nem `app/demo-fluxo`. Marcados como NÃO VERIFICADO.

---

## 3. Produção — catálogo (somente leitura)

**Grants de `authenticated`** [PROD-SOMENTE-LEITURA]:
- `vendas`: SELECT, INSERT, UPDATE, DELETE.
- `itens_venda`: SELECT, INSERT, UPDATE, DELETE.
- `vendas_pagamentos`: SELECT, INSERT, UPDATE, DELETE.
- `descontos_venda`: SELECT, INSERT, UPDATE, DELETE.
- `perfis`: SELECT, INSERT, UPDATE, DELETE.
- `feature_flags`: SELECT, INSERT, UPDATE, DELETE.
- `caixas`: SELECT na tabela; UPDATE apenas na coluna `status` (grant de coluna, migration 20260814012644).

**Funções que escrevem nessas tabelas:** todas as encontradas (`pg_proc`, `prosrc` com INSERT/UPDATE/DELETE) são `SECURITY DEFINER` com dono `postgres`. Nenhuma função `SECURITY INVOKER` escreve nessas tabelas. Por isso, revogar DML direto de `authenticated` não quebra RPCs. [PROD-SOMENTE-LEITURA]

**Triggers relevantes:**
- `caixas`: `trg_caixas_fechado_imutavel` (BEFORE UPDATE — bloqueia mudança de status de FECHADO) e `trg_caixas_saldo_inicial_bi` (BEFORE INSERT — define `saldo_atual := valor_inicial`).
- `vendas`: `trg_vendas_caixa_aberto_bi` (exige caixa aberto), `trg_vendas_caixa_aberto_bu`, `trg_registrar_comissao`, `trg_vendas_cancelamento_ajusta_comissao`, `financeiro_venda_captura`, `financeiro_cancelamento`. **Não há trigger de auditoria em DELETE de `vendas`.**
- `vendas_pagamentos`: `trg_vendas_pagamentos_credita_caixa` (AFTER INSERT OR UPDATE OF valor, forma → `trg_creditar_saldo_caixa_venda_dinheiro`, SECURITY DEFINER), `financeiro_split_captura`, `trg_vendas_pagamentos_parcelas`.

**Policies relevantes** [PROD-SOMENTE-LEITURA]:
- `vendas_insert_loja`: operador da loja insere venda no próprio caixa (`operador_id = auth.uid()`), **sem validar total**.
- `vendas_pagamentos_insert_loja`: operador insere pagamento em venda própria.
- `itens_insert` (`itens_venda`): operador insere itens em venda própria.
- `vendas_update_loja` e `vendas_delete_loja`: GERENTE/DONO/ADMIN da mesma loja.
- `itens_venda_write_gerente_loja` (ALL): GERENTE/DONO/ADMIN da loja.
- `descontos_venda_update_gerente_dono` e `..._delete_...`: GERENTE/DONO/ADMIN.
- `caixas_insert_authenticated`: operador insere caixa próprio na própria loja.
- `caixas_update_authenticated`: operador ou gerente altera o próprio caixa; a restrição real vem do grant de coluna e do trigger.
- `perfis_update_policy`: `auth.uid() = user_id`, **sem restrição de coluna**. `perfis_insert_policy`: próprio user. `perfis_delete_policy`: `perfis_usuario_gerencial_loja(loja_id)`.
- `Feature flags - INSERT/UPDATE/DELETE para admin/service_role`: `service_role` **ou** `authenticated` com `usuarios.perfil IN ('DONO','ADMIN')` **sem filtro de empresa**.

**Constraints:** `caixas_fechado_exige_dados_fechamento` (ativa em produção). Consulta: 0 caixas FECHADO sem dados de fechamento. 0 caixas com `turno_anterior_id` (nunca houve retomada).

---

## 4. Problemas inconclusivos — situação após esta etapa

| Problema do relatório | Resultado |
|---|---|
| App grava venda/itens/pagamentos por REST? | **Não no código do PDV identificado** (F1–F13). Ainda não verificado: `demo-fluxo` (F14) e um varredura de *todos* os pacotes além de `pdv-importados`. |
| App faz `UPDATE caixas SET status` direto? | **Não.** Único UPDATE/INSERT direto em `caixas` no app é INSERT de abertura (F4). Atualizações de status passam por RPC ou service role. |
| Fluxos alternativos de sync offline | Existem: (a) sync real via Edge com service_role (F7/F8); (b) comando `sync_outbox` simulado no Tauri (F10, N2). |
| Causa-raiz dos 43 timeouts PostgREST | Evidência direta: logs `postgrest_logs` mostram "Warp server error: Thread killed by timeout manager" — 45 ocorrências nas últimas 24h (63 linhas de timeout no total do período consultado). Causa-raiz **não comprovada**. Ver `docs/performance/DIAGNOSTICO_TIMEOUTS_E_PERFORMANCE.md`. |
| Impacto real dos picos de latência | Parcialmente medido (pg_stat_statements); ver documento de performance. |

---

## 5. Achados novos (não estavam no relatório)

- **N1 — `valor_inicial` de abertura aceito do cliente.** `caixas_insert_authenticated` permite INSERT com `valor_inicial` arbitrário; `trg_caixas_saldo_inicial_bi` copia para `saldo_atual`. Não há teto server-side verificado. Risco: inflar troco inicial e encobrir falta no fechamento. **Validar regra de negócio e teto.**
- **N2 — comando Tauri `sync_outbox` simulado registrado** (`pdv-local/src-tauri/src/main.rs:43-44`, `db.rs:1636-1659`), marca registros como `ENVIADO` sem enviar. A UI usa só `sync_outbox_real_cmd`. Risco de perda de dados se invocado. **Remover ou proteger por build flag.**
- **N3 — `perfis_insert_policy` permite criar perfil próprio** com qualquer `perfil`/`loja_id`; soma-se ao B1.
- **N4 — 0 consumidores de `perfis` no código** (busca em `ts/tsx/js/mjs/rs` fora de docs/migrations não retornou nada). A tabela é usada apenas pelas policies de `perfis`. Autorização real usa `usuarios.perfil`. Por isso B1 é de **integridade latente**, não de bypass atual de RPC.
- **N5 — `feature_flags` sem consumidor no app** (só tipos gerados e comentário em `lib/modulos/requireModulo.ts`). Não há tela de administração de flags neste repositório.
- **N6 — `retomar_caixa_atomico` sem chamador.** A reabertura legítima existe no banco, mas não há tela que a use. Decisão de produto pendente.
- **N7 — 0 auditoria em `DELETE` de `vendas`** (não há trigger de auditoria), mesmo com `vendas_delete_loja` ativo.

---

## 6. Reavaliação do relatório anterior

| Afirmação do relatório | Revisão |
|---|---|
| A2 reproduzida na réplica (V17–V19) | **Não reproduz em produção.** `trg_caixas_fechado_imutavel` está ativo (migration `20260904140000`, no ledger de produção). A réplica não tinha esse trigger. A migration 001 do relatório é **redundante** frente ao trigger existente. |
| `perfis` tem 0 linhas | **Incorreto.** Produção tem 3 linhas; 0 divergências com `usuarios.loja_id`. |
| Feature flags "global, sem empresa_id" | Confirmado (4 linhas; policies sem filtro de empresa). |
| "Operador altera saldo_atual" negado | Confirmado: grant de coluna só em `status`. |
| 43 timeouts; `registrar_venda_com_itens` pico 7,4 s | Não reavaliado com a mesma janela; ver documento de performance. |
| Backup "sem rotina operacional comprovada" | Ver documento de backup (há scripts no repo, sem prova de execução). |

---

## 7. Não comprovado / bloqueado

- Conteúdo real de `migrations_preparadas/001–004` (não estão no repositório).
- Réplica e restauração isolada do relatório (artefatos fora do repo).
- Demo (F14) e `caixaVendaEspera` (escritas, se houver).
- Locks, `pg_stat_activity` e conexões: **não consultados**.
- Teste de exploração real (A1) em produção: **não executado** e **não autorizado**.
