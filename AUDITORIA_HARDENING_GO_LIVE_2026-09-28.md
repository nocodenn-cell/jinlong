# AUDITORIA CONSOLIDADA — HARDENING & GO-LIVE READINESS
**Data:** 28/09/2026
**Modo:** Investigação com evidência viva (Vercel `get_runtime_errors`, Supabase `get_advisors`) + leitura de código atual + 3 auditorias estáticas anteriores (17–27/09/2026), revalidadas
**Escopo:** Resposta à proposta "FASE 7 — BLOCO A (Production Hardening) → B (Certificação Operacional) → C (Bling Flow Gap) → D (Fiscal/Focus NFe)"

Este documento substitui/corrige `AUDITORIA_SEGURANCA_INTEGRIDADE_2026-09-27.md`, `audit-matriz_seguranca.md` e `audit-search_path_4funcoes.md` como fonte de verdade mais atual — os três continham achados corretos na época, mas o estado do banco (advisor de segurança) já mudou desde então. `audit-fluxos_operacionais_jinlong.md` (17/09) permanece válido e é adotado como o plano de execução do Bloco B/C (ver seção 4).

---

## 1. Conclusão executiva

A estrutura em 4 blocos proposta (A→B→C→D) está correta. A correção é de **peso relativo**: os Blocos B e C não precisam de nova investigação — já foram auditados em 17/09 com plano de execução pronto. O esforço real de "problemas reais" está concentrado no Bloco A (segurança de produção) e, depois, no Bloco D (que é desenvolvimento do zero, não hardening).

**Ações já executadas nesta sessão** (ver seção 2):
1. Corrigido bug de produção em `/admin/configuracoes` (ativo desde 20/08/2026)
2. Corrigido bug de produção em `/demo-fluxo`
3. Fechado o P0 de segurança mais grave confirmado: `atualizarPrecoVarejoProduto` permitia alterar preço de produto de outra loja

**Itens que permanecem em aberto** (ver seção 3) — registrados para a próxima sessão de hardening, não fechados aqui por decisão de escopo.

---

## 2. Corrigido nesta sessão

### 2.1 `/admin/configuracoes` — `TypeError: Cannot read properties of null (reading 'replace')`
- **Evidência de produção:** Vercel `get_runtime_errors`, projeto `pdv-importados` — 6 ocorrências, 2 usuários, primeira ocorrência 2026-08-20, última 2026-09-28 16:47 UTC (bug ativo há 39 dias).
- **Causa raiz:** `pdv-importados/app/admin/configuracoes/_components/ConfiguracoesContent.tsx:428` chamava `maskCnpj(loja.cnpj)` sem tratar `null`, diferente de `maskTel(loja.telefone ?? '')` (linha 474) e `maskCep(loja.endereco_cep ?? '')` (linha 494), que já tratavam. Quando `loja.cnpj` é `null` no banco, `maskCnpj → digitsOnly → raw.replace(...)` quebra em `configMasks.ts:11`.
- **Correção aplicada:** `maskCnpj(loja.cnpj ?? '')` — mesmo padrão das linhas vizinhas.

### 2.2 `/demo-fluxo` — `Error: useAdminV2Session must be used within AdminV2SessionProvider`
- **Evidência de produção:** Vercel `get_runtime_errors` — 1 ocorrência em 2026-09-28.
- **Causa raiz:** `PageHeader` (`components/ui/admin-v2/PageHeader.tsx:39`) renderiza incondicionalmente `<AdminV2UtilityBar />`, que chama `useAdminV2Session()`. `DemoFluxoClient.tsx` usa `PageHeader`, mas `app/demo-fluxo/layout.tsx` só repassava `children`, sem nunca instanciar `AdminV2SessionProvider` — diferente de `/admin`, onde `AdminV2Shell` faz essa instanciação.
- **Correção aplicada:** em `app/demo-fluxo/page.tsx`, buscar `idioma` do usuário atual via `getUsuarioIdioma()` (helper já usado em outras Server Actions/rotas) e envolver `<DemoFluxoClient>` com `<AdminV2SessionProvider idioma={idioma}>`, sem trazer o shell administrativo completo (sidebar etc.), que não faz sentido nessa rota de diagnóstico standalone.

### 2.3 P0 — `atualizarPrecoVarejoProduto` permitia alterar preço de produto de outra loja
- **Severidade:** P0 (confirmado presente no código antes da correção, não hipotético — relido `actions.ts:167-201` diretamente).
- **Causa raiz:** a Server Action fazia `UPDATE produtos SET preco_varejo WHERE id = produto_id` direto via PostgREST. A policy RLS `produtos_escrita` (`WITH CHECK auth_usuario_gerencial_loja(loja_id)`) valida que o usuário **tem perfil gerencial em alguma loja**, não que o **produto alvo** pertence à loja do usuário — um GERENTE da Loja A que descobrisse o UUID de um produto da Loja B (export CSV, log, enumeração) conseguia alterar o preço dele.
- **Correção aplicada:**
  - Nova migração `backend/supabase/migrations/20260928120000_atualizar_preco_varejo_produto_rpc.sql`, criando `public.atualizar_preco_varejo_produto(p_produto_id uuid, p_preco numeric)` — `SECURITY DEFINER`, valida perfil (`GERENTE`/`DONO`/`ADMIN`), preço > 0, existência do produto e — para `GERENTE` — que `loja_id` do produto bate com a loja do usuário (mesmo padrão de `receber_ordem_compra`, migration 110: `DONO`/`ADMIN` mantêm acesso global, só `GERENTE` é restrito à própria loja).
  - Migração **aplicada em produção** (`mcp__supabase__apply_migration`, projeto `jinlong`) e verificada via `pg_proc` (`prosecdef=true`, `search_path=public`).
  - `app/gerente/produtos/actions.ts`: a action agora chama `supabase.rpc('atualizar_preco_varejo_produto', ...)` em vez do `UPDATE` direto, com tradutor de erro dedicado (`mensagemErroPreco`, mesmo padrão de `mensagemErroOc` já usado em `app/gerente/compras/ocRecebimento.ts`).
- **Teste de regressão recomendado (não executado nesta sessão — requer ambiente com 2 lojas/usuários reais):** GERENTE da Loja A não deve mais conseguir alterar preço de produto da Loja B (`PRECO_LOJA`); GERENTE da própria loja e DONO/ADMIN devem continuar funcionando normalmente.

---

## 3. Aberto — Bloco A (Production Hardening), não corrigido nesta sessão

| # | Item | Severidade | Estado confirmado hoje | Fonte |
|---|---|---|---|---|
| 1 | `uploadImagemProduto`/`removerImagemProduto` sem validar tenant na Server Action | P1 | Storage (bucket `produto-imagens`) já tem RLS de escrita amarrada a `produtos.loja_id` desde a migração `20260904100000_storage_produto_imagens_tenant_isolation.sql` — falta confirmar se isso fecha o gap ou se a Server Action ainda tem exposição adicional fora do Storage RLS | Auditoria 27/09 + Explore 28/09 |
| 2 | `transferir_estoque_seguro` — `p_loja_origem` não validada contra loja do usuário | P1 | Confirmado presente em `082_transferencia_segura_idempotente.sql:96-110` | Auditoria 27/09 |
| 3 | Fallback `LOJA_MATRIZ_ID` em `getGerenteLojaId()` — usuário sem `loja_id` acessa a Matriz | P1 | Reportado; falta confirmar se o trigger `on_auth_user_created` pode de fato deixar `loja_id` nulo | Auditoria 27/09 |
| 4 | `categorias`/`marcas`/`regras_preco` — tabelas globais sem `loja_id`, leitura aberta a qualquer `authenticated` | P1 | Confirmado por leitura de schema (`001_schema_inicial.sql`, `044_usuario_perfil_admin_rls.sql`) | Auditoria 27/09 |
| 5 | RLS habilitado sem nenhuma policy | P1/P2 (funcional, não necessariamente porta aberta) | **5 tabelas confirmadas pelo advisor de segurança ao vivo hoje**: `_backup_schema_migrations_20260802`, `gerente_auth_attempts`, `gerente_auth_rate_limits`, `produto_create_requests`, `tokens_autorizacao_operacao`. RLS + zero policy nega acesso por padrão a `anon`/`authenticated` — não é exposição, mas pode estar quebrando funcionalidade silenciosamente se alguma delas precisa ser lida pelo client. Precisa decisão tabela por tabela. | Supabase `get_advisors`, 28/09 |
| 6 | `search_path` mutável em funções `SECURITY DEFINER` | P2 | **7 funções ao vivo hoje** — conjunto **diferente** do documentado em `audit-search_path_4funcoes.md` (que cobria 5 funções, aparentemente já corrigidas): `internal.comissao_valor_item`, `trg_comissoes_ajustes_bloquear_mutacao`, `venda_evento_idempotency_key`, `finalizar_venda_transacional_canonica_v2`, `finalizar_venda_transacional_canonica_v3`, `finalizar_venda_transacional`, `trg_movimentos_estoque_log_bloquear_mutacao`. O documento antigo está desatualizado nesse ponto. | Supabase `get_advisors`, 28/09 |
| 7 | `fiscal_reprocessar_documento` — `IF current_user <> 'postgres'` pula validação de perfil em conexão direta como `postgres` | P1/P2 | **Confirmado ainda presente** na definição mais recente (`20260806135429_307_d3_reaper_fiscal_em_processamento.sql:168-194`); nenhuma migração posterior corrigiu | Auditoria 27/09 + Explore 28/09 |
| 8 | 65 funções `SECURITY DEFINER` executáveis por `authenticated` | Informativo | Por design — maioria valida perfil internamente (confirmado pela matriz 27/09); superfície grande, vale pente-fino amostral, não reescrever todas | Supabase `get_advisors`, 28/09 |
| 9 | Leaked password protection desabilitado (Supabase Auth) | P2 | Confirmado; correção é 1 toggle no painel Supabase Auth | Supabase `get_advisors`, 28/09 |
| 10 | Validação DONO → GERENTE → OPERADOR com tentativas reais de acesso indevido | Lacuna de processo | ~10-15 arquivos de teste cobrem lógica de guarda/tenant, mas **todos mockam o cliente Supabase** — nenhum teste hoje simula sessão real de OPERADOR chamando ação exclusiva de GERENTE, ou GERENTE da Loja A acessando dado da Loja B via RLS/RPC ao vivo. A "matriz de segurança" de 27/09 é análise estática, não teste de penetração executado. | Explore 28/09 |

---

## 4. Bloco B (Certificação Operacional) + Bloco C ("Bling Flow Gap") — já auditados, plano pronto

`audit-fluxos_operacionais_jinlong.md` (17/09/2026) já certificou ponta-a-ponta os fluxos de Produto, Compra/Recebimento, Venda, Cancelamento e Fechamento de Caixa pedidos (mapeou 8 fluxos no total). Achado central do documento, que responde diretamente à reformulação do Bloco C ("em que operação o usuário não sabe pra onde ir"):

> "O dado certo já existe no banco e já é calculado no backend, mas morre antes de chegar à tela." — a maioria dos gaps é falta de `<Link>`, não falta de funcionalidade.

Achado mais sério (risco operacional real, não só UX): **dois módulos de recebimento de mercadoria (Ordens de Compra e Recebimento Manual) não se comunicam** — sem referência cruzada a `ordem_compra_id`, risco de duplicidade de lançamento de estoque.

O documento já contém: tabela de gaps por fluxo com severidade, Top 10 por impacto operacional, menor mudança por item (com arquivos e riscos mapeados), plano de implementação priorizado de 13 itens, e o que explicitamente não fazer agora. **Recomendação: adotar a seção F desse documento como plano de execução, em vez de reabrir a investigação.** Blocos B e C são, na prática, a mesma evidência vista de dois ângulos — não duas frentes de trabalho separadas.

---

## 5. Bloco D (Fiscal / Focus NFe) — confirmado não iniciado

`docs/FISCAL_FOCUS_NFE_CONTRATO.md` (16/09/2026): **"Integração: planejada"**, **"Homologação: ainda não concluída"**. Infraestrutura interna real e testada (fila de processamento, schema de persistência de XML, isolamento por tenant), mas nenhum documento correlato afirma ter tocado comportamento real do Focus (tributação, resposta Focus, PIX, XML, cancelamento, CC-e). A migração de persistência de XML está marcada `"BLOCKED EXTERNAL"` aguardando confirmação de contrato.

Confirma a decisão de sequenciar esse bloco por último — não há trabalho perdido em adiar, e abri-lo agora seria prematuro com P0/P1 de segurança ainda abertos (seção 3).

---

## 6. Sequenciamento recomendado para a próxima sessão

1. P1s restantes da seção 3 (itens 1-4) — mesmo padrão RPC usado no P0 desta sessão.
2. Decisão tabela-por-tabela para as 5 RLS-sem-policy (item 5).
3. `search_path` das 7 funções atuais + bypass do `fiscal_reprocessar_documento` (itens 6-7).
4. Suite de teste de autorização cross-role real, contra ambiente de teste/staging (item 10).
5. Depois: seção F de `audit-fluxos_operacionais_jinlong.md` (Bloco B/C).
6. Por último: Fiscal/Focus NFe (Bloco D), retomando `FISCAL_FOCUS_NFE_CONTRATO.md`.

---

## 7. O que não fazer agora

Confirmado independentemente pela seção G de `audit-fluxos_operacionais_jinlong.md`: WhatsApp, marketplace, e-commerce, novas dashboards, IA, redesign geral, polimento visual, dezenas de relatórios novos — nenhum aparece como problema real nas evidências coletadas. Risco de oportunidade maior está em deixar P0/P1 de segurança e gaps de fluxo abertos enquanto se constrói funcionalidade nova.
