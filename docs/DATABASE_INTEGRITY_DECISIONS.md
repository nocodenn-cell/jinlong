# Database Integrity Hardening — Decisões Arquiteturais

Registro das decisões tomadas durante a sprint de hardening (Fase 5.1), com
justificativa e evidência. Documento vivo — atualizado por frente.

Legenda de status: ✅ decidida e aplicada · 🔶 decidida, pendente de execução · ⏸️ aguardando

---

## DEC-01 — `vendas.cliente_id` não é incidente confirmado, é hipótese aberta (Frente 1)

**Status:** ✅ (conclusão registrada)

**Contexto:** O relatório de auditoria (`docs/DATABASE_INTEGRITY_REPORT.md`, §2.1) classificou
o drift de `vendas.cliente_id` como risco alto de "perda silenciosa de dados em produção".

**Evidência apurada:**
- A RPC v4 (`24702_finalizar_venda_v4_contas_receber_automatico.sql:245-250` e
  `268_reconcile_finalizar_venda_v4_single_overload.sql:221-226`) **realmente grava**
  `cliente_id` via `INSERT INTO public.vendas (..., cliente_id) VALUES (..., p_cliente_id)`.
- O código passou a depender de `cliente_id` no commit `2177b62` (2026-07-11).
- `database.types.ts` gerado em 2026-07-13 (commit `f6d0f25`) **não continha** `cliente_id`
  em `vendas`; a migration `276` (reconciliação) foi escrita em 2026-07-17.
- **Não há prova objetiva** (histórico de `schema_migrations`, auditoria) de que a RPC v4
  foi implantada em produção ANTES da criação da coluna. O documento de homologação
  (`docs/FASE_5_ACCEPTANCE.md` §15) marca a aplicação das migrations 270–276 como
  **pendente**.

**Decisão:** Reclassificar de "incidente ocorrido" para **hipótese não comprovada**. O risco
existiria apenas se a RPC estivesse implantada antes da coluna existir. A ordem real de
aplicação em produção deve ser validada no banco antes de classificar como incidente.
Validação objetiva sugerida: `SELECT count(*) FROM vendas WHERE cliente_id IS NOT NULL;`
e inspeção de logs de erro da v4 relacionados a `cliente_id`.

---

## DEC-02 — Tabelas órfãs mortas NÃO são canonizadas no repositório (Frente 2)

**Status:** 🔶 (decisão tomada; DROP em produção pendente de execução/homologação)

**Contexto:** A reconciliação de RLS contra produção (`pg_policies` do projeto
`kbabmewnahysfvlybiak`, 2026-07-17) revelou **6 tabelas que existem em produção mas não têm
`CREATE TABLE` em nenhuma migration do repositório**, todas mortas/WIP:

| Tabela | Linhas | `.from()` no app | Em `database.types.ts` | Policies órfãs |
|---|---|---|---|---|
| `perfis` | 3 | 0 | sim | 4 |
| `funcionarios` | 0 | 0 | não | 3 |
| `funcionarios_meta` | 0 | 0 | não | 7 |
| `comissoes_regras_funcionario` | 0 | 0 | não | 2 |
| `comissoes_regras_historico` | 0 | 0 | não | 1 |
| `historico_precos_produto` | 0 | 0 | não | 1 |

**Evidência complementar:** O próprio repo já reconhecia `perfis` como inexistente no schema
versionado — `223_indices_fks_sem_cobertura.sql:30-34`: *"`public.perfis` nunca existiu como
tabela no schema — nenhuma migration cria essa relação"*. `perfis` é provável experimento
pré-`usuarios` (mesmo papel: perfil de acesso), com 3 linhas legadas, nunca conectado ao app.

**Decisão:** NÃO versionar essas 6 tabelas nem suas 18 policies. Canonizá-las importaria
schema morto/WIP como se fosse legítimo — criaria dívida nova, o oposto do objetivo da sprint.
Em vez disso: (a) mantê-las documentadas aqui como drift órfão conhecido **com plano**;
(b) plano de execução: confirmar em homologação que as 3 linhas de `perfis` são descartáveis,
então `DROP TABLE` das 6 em produção (não-destrutivo para o app, que não as usa). O DROP não é
feito unilateralmente nesta sprint — exige janela de homologação e confirmação do dado de `perfis`.

**Alternativa rejeitada:** "Versionar tudo (paridade bit-a-bit)" — rejeitada porque
perpetuaria schema morto no repositório e nas instalações novas.

---

## DEC-03 — `produtos.caixa_policy` / `painel_policy` versionadas, mas sinalizadas como vestigiais (Frente 2)

**Status:** ✅ (versionadas na migration 277) · 🔶 (remoção futura recomendada)

**Contexto:** Duas policies fantasma de `produtos` usam
`(auth.jwt() ->> 'role') = 'caixa'` / `= 'painel'` — um esquema de autorização por claim de JWT
que a aplicação atual não emite (o app usa `usuarios.perfil`: GERENTE/DONO/ADMIN/OPERADOR).

**Decisão:** Versioná-las na migration 277 **para paridade exata com produção** (a tabela
`produtos` está viva), mas registrar que são **vestigiais/no-op** no fluxo de auth atual — o
SELECT de `produtos` funciona via `produtos_leitura` (authenticated). São candidatas a remoção
posterior, após confirmar que nenhum cliente legado ainda autentica com esse claim.

---

## DEC-04 — Estratégia de versionamento de RLS: "versionar vivas, isolar mortas" (Frente 2)

**Status:** ✅

**Contexto:** 37 policies existem em produção sem `CREATE POLICY` no repositório (3× mais que as
11 do relatório inicial, que só via os blocos GUARD da migration 224 / snapshot 2026-06-02).

**Decisão (escolha explícita do time):** Versionar apenas as **19 policies sobre tabelas vivas**
(migration `277_rls_policies_fantasma_versionamento.sql`), reproduzindo predicados USING/WITH CHECK
**verbatim** de `pg_policies` de produção — incluindo a forma initplan-otimizada `( SELECT auth.uid())`
onde presente. As 18 policies das 6 tabelas mortas ficam sob DEC-02. Idempotência via
`DROP POLICY IF EXISTS` + `CREATE POLICY`.

**Por que verbatim:** o próprio repo (blocos GUARD da 224) alertava que reconstruir policy de
segurança por suposição é "decisão que exige confirmação explícita, não suposição". Com acesso
read-only a `pg_policies`, a suposição foi eliminada — a definição é a real de produção.

---

## DEC-05 — `finalizar_venda_transacional` legada desativada via stub LEGACY_DISABLED (Frente 3)

**Status:** ✅ (stub versionado na migration 278) · 🔶 (aplicação em produção pendente de homologação)

**Contexto:** Auditoria de RPCs. A função-base `public.finalizar_venda_transacional` (sem sufixo
`_canonica_vN`) é a v1 da finalização de venda, anterior à cadeia v2→v3→v4.

**Evidência (produção jinlong, 2026-07-17):**
- 2 overloads: o **7-arg** já era stub `LEGACY_DISABLED`; o **9-arg** estava **VIVO** — 6 KB de
  lógica real, `SECURITY DEFINER`, `GRANT EXECUTE` a `authenticated`. Ambos `RETURNS void`.
- No repositório, ambos overloads estavam vivos (020 cria o 7-arg, 122 cria o 9-arg). Nenhuma
  migration os desativou — os stubs LEGACY do repo cobriam apenas v2/v3.
- **Callers reais = 0.** `grep` de `.rpc('finalizar_venda_transacional')` em todo o código
  (pdv-importados, pdv-local, shared, shared-core, backend/functions) só encontra 2 referências em
  documentação `.md`. Único caller ativo de finalização: `..._canonica_v4` (`caixaVendas.impl.ts`).

**Impacto medido:** caminho de finalização de venda paralelo à golden flow v4, executável por
qualquer `authenticated` via PostgREST, sem as blindagens da v4 (cliente_id/contas_receber,
revalidação de preço, auditoria de evento). Violação de SSoT + superfície de risco real.

**Decisão:** Desativar ambos overloads com `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'` (mesmo padrão
de v2/v3), mantendo assinatura e `RETURNS void`, e revogar `EXECUTE` de anon/authenticated/public
(defesa em profundidade). Migration `278_stub_finalizar_venda_transacional_legada.sql`. Não é DROP:
o stub dá erro claro a qualquer caller residual (melhor DX/segurança que "função não existe").

**Alternativa rejeitada:** DROP das funções — rejeitada em favor do precedente de stub (v2/v3), que
preserva a assinatura e sinaliza a intenção. Permitida (0 callers), mas o stub é mais defensivo.

---

## DEC-06 — Views: securizar as 3 com drift; manter monitoramento; órfãs viram candidatas a DROP com gate (Frente 4)

**Status:** ✅ (security_invoker versionado na migration 279) · 🔶 (DROP das 2 órfãs pendente de gate)

**Contexto:** Auditoria de views. No PostgreSQL, uma view sem `security_invoker` roda com o
privilégio do owner (`postgres`), contornando a RLS das tabelas base.

**Evidência (produção, 2026-07-17):** 7 views, **todas já com `security_invoker` habilitado** —
produção está segura. Mas 3 são criadas no repositório SEM `security_invoker` (anteriores ao padrão
da migration 040): `v_vendas_dia` (001), `v_top_produtos` (001), `v_venda_consistencia_anomalias`
(244). Um `db reset` do zero as recriaria inseguras (bypass de RLS de `vendas`/`itens_venda` numa
instalação nova). Nenhuma das 3 é consultada pelo app (0 `.from()`).

**Decisão:**
1. **Securizar as 3** com `ALTER VIEW ... SET (security_invoker = true)` (migration 279) — fecha o
   bypass no bootstrap, casa com produção, no-op no remoto (idempotente).
2. **`v_venda_consistencia_anomalias`**: mantida — é view de monitoramento/auditoria de
   consistência (0 anomalias por N dias é um check de homologação em `docs/FASE_5_ACCEPTANCE.md`).
3. **`v_vendas_dia` e `v_top_produtos`**: classificadas **órfãs** (substituídas pelas RPCs
   `relatorio_vendas_por_dia_periodo` / `relatorio_top_produtos_periodo`; 0 uso no app; **0
   dependências no banco** — `pg_depend` vazio). Candidatas a `DROP`, mas **não removidas nesta
   sprint**: como se chamam "vendas do dia" e "top produtos", podem ser lidas por um consumidor
   externo (BI/dashboard/planilha) fora do repositório, que o grep não alcança. **Gate para o
   DROP:** confirmar com o time que nenhuma ferramenta externa consulta essas views; então
   `DROP VIEW`. Postura consistente com DEC-02 (não destruir unilateralmente).

**Alternativa rejeitada:** DROP imediato das 2 órfãs — rejeitada pelo risco de quebrar um consumidor
externo não rastreável pelo código. Securizar já elimina o risco de segurança sem esse risco.

---

## Pendências de decisão (frentes futuras)
- **DEC-07 (Frente 7 — Bootstrap):** estratégia para o problema de ordenação lexicográfica
  numérico × timestamp. Aguardando análise.
- **DEC-08 (Frente 8 — CI):** causa raiz do pipeline quebrado. Aguardando investigação (fora
  de escopo até autorização — usuário pediu para não mexer em CI agora).
