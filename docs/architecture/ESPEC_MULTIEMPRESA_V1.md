# Especificação Multiempresa — Jinlong (v1, congelada para revisão)

> Status: **DECISÕES FECHADAS (D1–D19)** · Data: 2026-10-02 · Fase 1: conceitualmente aprovada, **execução em produção não autorizada**
> Base: inventário read-only de produção (`kbabmewnahysfvlybiak`) e do repositório (HEAD `897f1c6`).
> Marcadores: **[FATO]** evidência observada · **[INFERÊNCIA]** conclusão derivada · **[NÃO CONFIRMADO]** a validar · **[DECISÃO]** decidido pelo produto · **[PENDENTE]** decisão em aberto.

## 0. Decisões já tomadas

| # | Decisão | Origem |
|---|---|---|
| D1 | ADMIN = plataforma Jinlong; nunca atalho para dados de clientes | [DECISÃO] |
| D2 | DONO = empresa inteira; GERENTE = uma ou mais lojas; OPERADOR = uma loja | [DECISÃO] |
| D3 | `usuario_vinculos` entra na Fase 1 (GERENTE multi-loja desde já) | [DECISÃO] |
| D4 | `categorias` e `marcas` pertencem à EMPRESA | [DECISÃO] |
| D5 | Imagens de produto: leitura pública mantida; escrita isolada por empresa/loja | [DECISÃO] |
| D6 | `sync-outbox` fora do 1º corte SaaS; risco P1 documentado e fechado antes de uso multi-cliente | [DECISÃO] |
| D7 | Drift: reconciliar as 3 migrations só-produção e classificar as 27 só-repo antes da Fase 1 | [DECISÃO] |
| D8 | `perfis`: manter durante a transição; remover só com dependência zero comprovada | [DECISÃO] |
| D9 | ADMIN atual: não migrar até identificação humana | [DECISÃO] |
| D10 | Cliente 1 não percebe a transformação: comportamento operacional equivalente em todas as etapas | [DECISÃO] |
| D11 | `lojas.codigo` único **dentro da empresa** (`UNIQUE (empresa_id, codigo)`); a unicidade global atual só sai depois que `provisionamento` deixar de usar o código como identificador global | [DECISÃO] |
| D12 | `regras_preco`, `categorias_financeiras`, `pricing_config_versions` pertencem à EMPRESA | [DECISÃO] |
| D13 | `configuracoes_gerais` = EMPRESA por padrão, com escopo classificado chave a chave (§7.1); sem segunda tabela | [DECISÃO] |
| D14 | `relatorio_settings` = LOJA | [DECISÃO] |
| D15 | `precos_atacado.loja_id NULL` = preço padrão da EMPRESA; `loja_id = X` = override da loja X; nunca global entre empresas | [DECISÃO] |
| D16 | Guarda RESTRICTIVE aprovada só para protótipo em poucas tabelas; expansão depois da bateria do §7.2 | [DECISÃO] |
| D17 | Fase 1 = migration **aditiva**, sem mudar policies, sem trocar a fonte de verdade, sem remover `usuarios.perfil`/`usuarios.loja_id` | [DECISÃO] |
| D18 | Regra de segurança: toda operação nova responde "qual é o tenant?"; "não sei" ou `LOJA_MATRIZ_ID` ⇒ falha fechada | [DECISÃO] |
| D19 | PR desta especificação contém só documentação; implementação em branch separada | [DECISÃO] |

## 1. Identidade

- **[FATO]** `public.usuarios.id` é FK para `auth.users(id) ON DELETE CASCADE` (`001_schema_inicial.sql:14`). Relação 1:1.
- **Regra:** `auth.users` = autenticação (credencial, e-mail, sessão). `usuarios` = pessoa no Jinlong (nome, idioma, `ativo`, `funcionario_id`). **Nenhum dado de organização ou papel é fonte de verdade em `usuarios` após o corte.**
- `usuarios.ativo = false` bloqueia a pessoa em **todas** as empresas (bloqueio de identidade). Bloqueio por empresa é feito no vínculo (`usuario_vinculos.ativo`).
- `auth.users` sem linha em `usuarios` (**[FATO]** 3 hoje) não acessa nada (fail closed já existente em `adminPolicy.ts`).

## 2. Empresa

```sql
empresas (
  id uuid PK,
  nome text NOT NULL,
  razao_social text NULL,
  cnpj text NULL CHECK (cnpj ~ '^[0-9]{14}$'),     -- UNIQUE parcial quando não nulo
  plano text NOT NULL,
  status text NOT NULL CHECK (status IN ('ATIVA','SUSPENSA','CANCELADA')),
  vigencia_inicio date NOT NULL,
  vigencia_fim date NULL,
  max_lojas int NULL,        -- NULL = sem limite
  max_usuarios int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

- Licença (`status`, vigência, limites) **não participa da autorização de escopo**. É verificada por um helper separado (`fp_empresa_operacional`, §6) aplicado no login e nas operações de escrita.
- Empresa 1 = cliente atual. `cnpj`/`razao_social`: **[PENDENTE]** — `lojas.cnpj` da MATRIZ está vazio em produção ([FATO]); preencher só com dado fornecido pelo cliente.

## 3. Loja

- `lojas.empresa_id uuid NOT NULL REFERENCES empresas(id)` (nullable → backfill → NOT NULL).
- `UNIQUE (id, empresa_id)` em `lojas`, para permitir FK composta a partir de `usuario_vinculos` (garante que a loja do vínculo pertence à empresa do vínculo).
- `lojas.codigo`: **[DECISÃO D11]** único por empresa. [FATO] Hoje existe `lojas_codigo_key UNIQUE (codigo)` e `app/admin/provisionamento/actions.ts:108-140` (`ensureLoja`) busca a loja **por código no banco inteiro** e reaproveita a existente — é o único uso como identificador global encontrado (nenhuma função SQL, rota ou Edge Function usa `lojas.codigo` [FATO]; `TransferenciasGerentePageClient` só exibe). Sequência: Fase 1 adiciona `UNIQUE (empresa_id, codigo)` **sem** remover a global; `ensureLoja` passa a filtrar por empresa; só então `lojas_codigo_key` é removida.
- `lojas.empresa_id` fica **anulável** na Fase 1: `provisionamento` ainda insere loja sem empresa [FATO]. `NOT NULL` só depois que o fluxo de criação de loja gravar `empresa_id`.
- `lojas.ativo` continua sendo o desligamento operacional da loja.

## 4. Vínculo

```sql
usuario_vinculos (
  id uuid PK,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  loja_id uuid NULL,
  papel text NOT NULL CHECK (papel IN ('DONO','GERENTE','OPERADOR')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  FOREIGN KEY (loja_id, empresa_id) REFERENCES lojas(id, empresa_id),
  CHECK ((papel = 'DONO' AND loja_id IS NULL) OR (papel <> 'DONO' AND loja_id IS NOT NULL))
)
UNIQUE (usuario_id, empresa_id, papel, loja_id) NULLS NOT DISTINCT
UNIQUE (usuario_id, empresa_id) WHERE papel = 'OPERADOR' AND ativo   -- operador: 1 loja por empresa
INDEX (usuario_id) WHERE ativo; INDEX (loja_id) WHERE ativo
```

- Exemplos: DONO→(A, NULL) · GERENTE→(A, A1) + (A, A2) · OPERADOR→(A, A1).
- **ADMIN não tem vínculo.** Tabela separada:

```sql
plataforma_admins (usuario_id uuid PK REFERENCES usuarios(id), ativo boolean, motivo text, created_at, created_by)
```

  Criada **vazia** na Fase 1 (D9).
- Escrita em `usuario_vinculos` e `plataforma_admins`: **somente** via RPC/servidor (sem policy de escrita para `authenticated`).
- Multi-empresa por pessoa: o modelo permite. A sessão (§9) usa **uma empresa ativa**; se a pessoa tiver vínculos ativos em >1 empresa e não houver seletor, a sessão **falha fechada**. Não há restrição de banco impedindo o caso futuro.

## 5. Papel

| Papel | Escopo | Fonte |
|---|---|---|
| ADMIN (plataforma) | operações de plataforma (provisionar empresa/loja, suporte). **Não lê dados de cliente via RLS.** | `plataforma_admins` |
| DONO | todas as lojas da empresa do vínculo | `usuario_vinculos (loja_id NULL)` |
| GERENTE | lojas listadas nos vínculos | `usuario_vinculos` |
| OPERADOR | 1 loja | `usuario_vinculos` |

- Operações de plataforma sobre dados de cliente (suporte) acontecem **no servidor com `service_role`**, com trilha de auditoria — nunca por bypass de RLS baseado em papel. **[PENDENTE]**: se suporte precisar ler dados de cliente, definir mecanismo explícito (ex.: vínculo temporário auditado). Fora do escopo da v1.
- `usuarios.perfil` permanece como **espelho legado** até a Fase "Corte" (§13).

## 6. Escopo — helpers (fonte única)

Todos em `public` (necessário para uso em policy), `STABLE`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated, service_role`.

| Helper | Retorno | Regra |
|---|---|---|
| `fp_usuario_ativo()` | bool | `usuarios.ativo` do `auth.uid()` |
| `fp_eh_plataforma()` | bool | linha ativa em `plataforma_admins` |
| `fp_empresas_do_usuario()` | setof uuid | empresas com vínculo ativo |
| `fp_lojas_permitidas(p_papeis text[] DEFAULT NULL)` | setof uuid | DONO → todas as lojas da empresa; GERENTE/OPERADOR → lojas dos vínculos; filtra por papéis se informado |
| `fp_pode_loja(p_loja uuid, p_papeis text[])` | bool | `p_loja ∈ fp_lojas_permitidas(p_papeis)` |
| `fp_empresa_da_loja(p_loja uuid)` | uuid | `lojas.empresa_id` |
| `fp_mesma_empresa(p_loja_a uuid, p_loja_b uuid)` | bool | empresas iguais e não nulas |
| `fp_empresa_operacional(p_empresa uuid)` | bool | `status='ATIVA'` e vigência válida (licença; separado do escopo) |

**Modo de compatibilidade** (Fases 1–5): enquanto o corte não ocorrer, `fp_pode_loja` retorna também `true` para o caminho legado `usuarios.perfil='ADMIN'` (global), preservando o comportamento atual do ADMIN existente (D9/D10). A remoção desse ramo é um único `CREATE OR REPLACE` na Fase "Corte ADMIN".

Regra para todos os helpers: **contexto ausente ⇒ `false`/conjunto vazio** (nunca fallback para MATRIZ).

## 7. RLS

**[FATO]** 146 policies, todas PERMISSIVE; 31 sem escopo de loja; 63 com `DONO/ADMIN OU loja`; 10 com `ADMIN OU loja`; 17 só loja.

**Estratégia: guarda RESTRICTIVE de tenant por tabela**, em vez de reescrever as 146 policies.

```sql
CREATE POLICY tenant_guard ON <tabela> AS RESTRICTIVE FOR ALL TO authenticated
  USING (<expr_escopo>) WITH CHECK (<expr_escopo>);
```

- RESTRICTIVE combina com AND com as permissivas: nenhuma policy ampla existente consegue conceder acesso fora do tenant. As permissivas atuais continuam definindo **o que** cada papel faz; a guarda define **onde**.
- Reversível: `DROP POLICY tenant_guard`.
- `<expr_escopo>` por classe de tabela:

| Classe | Tabelas (resumo) | Expressão |
|---|---|---|
| L — loja direta | as 36 com `loja_id` | `fp_pode_loja(loja_id, NULL)` (colunas `loja_id` anuláveis: tratar caso a caso, §12) |
| J — loja por join | `vendas` (via `caixas`), `itens_venda`, `vendas_pagamentos`, `descontos_venda`, `devolucoes`, `movimentos_caixa`, `estoque_baixas`, `estoque_reposicoes_*`, `remessa_itens`, `ordens_compra_itens`, `importacoes_nfe_itens`, `importacoes_nfe_duplicatas`, `comissoes_itens`, `comissoes_pagamentos_ajustes`, `comissoes_regras_historico`, `venda_pos_venda_*`, `vendas_canceladas_auditoria`, `documentos_fiscais_*`, `historico_precos_produto`, `historico_tiers_crud` | `EXISTS (pai WHERE pai.id = fk AND fp_pode_loja(pai.loja_id, NULL))` — **sem** adicionar coluna |
| E — empresa | `categorias`, `marcas` (D4); `regras_preco`, `categorias_financeiras`, `pricing_config_versions` (D12); `configuracoes_gerais` (D13, ver §7.1) | `empresa_id IN (SELECT fp_empresas_do_usuario())` (requer coluna `empresa_id`, adicionada de forma incremental) |
| L por decisão | `relatorio_settings` (D14) | ganha `loja_id`; a linha única atual vira a da MATRIZ |
| L com padrão de empresa | `precos_atacado` (D15) | `loja_id IS NULL` ⇒ padrão da empresa do **produto**; `loja_id = X` ⇒ override da loja X. Guarda: produto visível ao usuário **e** (`loja_id IS NULL` ou `fp_pode_loja(loja_id)`) |
| R — raiz | `lojas` | SELECT: `empresa_id IN fp_empresas_do_usuario()`; escrita: DONO da empresa (e plataforma via servidor) |
| P — plataforma | `feature_flags`, `tipos_movimento_estoque` | leitura autenticada; escrita só `service_role` |
| T — técnico | `gtin_lookup_cache`, `sync_request_nonces`, `gerente_auth_*`, `transferencias_idempotencia`, `venda_engine_shadow_runs`, `caixa_scan_telemetry_events`, `_backup_schema_migrations_20260802` | sem tenant; revisar acesso direto (`sync_request_nonces` e `venda_engine_shadow_runs` estão **sem RLS** [FATO]) |
| V — identidade/vínculo | `usuarios`, `usuario_vinculos`, `plataforma_admins`, `empresas`, `perfis` | próprio usuário + DONO da empresa (leitura); escrita só servidor |

### 7.1 `configuracoes_gerais` — escopo por chave ([FATO] 8 chaves em produção)

| Chave | Escopo | Observação |
|---|---|---|
| `comissao_padrao_percentual` | empresa | política comercial |
| `desconto_maximo_operador_percentual` | empresa | política comercial |
| `cancelamento_maximo_valor_sem_gerente` | empresa | marcada como "Reservado" na descrição |
| `lead_time_min_dias`, `lead_time_max_dias` | empresa | importação |
| `estoque_minimo_padrao` | empresa | default de criação de linha de estoque |
| `vendas_suspensas`, `motivo_suspensao` | empresa | suspende **todas** as lojas da empresa. Suspensão por loja não existe hoje [FATO] e **não** é criada agora |

Nenhuma chave foi comprovada como específica de loja ⇒ todas recebem `empresa_id`; nenhuma é duplicada.

### 7.2 `precos_atacado` — validação contra a SSOT de preço

- [FATO] Produção: 58 linhas, **todas** com `loja_id NULL`. `calcular_preco_produto` filtra `AND (pa.loja_id IS NULL OR pa.loja_id = p_loja_id)`.
- [FATO] `precos_atacado` referencia `produto_id`, e `produtos.loja_id` é `NOT NULL`. Logo uma linha `NULL` já fica presa ao tenant do produto: **não existe hoje caminho de preço global entre empresas** pela SSOT.
- [NÃO CONFIRMADO] Precedência override (loja) > padrão (NULL) quando ambos existirem: não verificada no corpo da função. Validar antes de qualquer mudança de comportamento (teste com as duas linhas para o mesmo produto/faixa).
- Risco remanescente: `precos_atacado_escrita` (PERMISSIVE por perfil, sem loja) — coberto pela guarda.

### 7.3 Protótipo da guarda RESTRICTIVE (D16)

Antes de expandir, aplicar em 3 tabelas representativas — `fornecedores` (L direta), `contas_receber` (L, financeira) e `itens_venda` (J por join) — e provar:
1. SELECT/INSERT/UPDATE/DELETE para DONO, GERENTE, OPERADOR;
2. Empresa A × Empresa B;
3. combinação com cada PERMISSIVE existente da tabela (nenhuma concede fora do tenant);
4. `service_role` (ignora RLS — esperado; documentar);
5. RPCs `SECURITY DEFINER` que escrevem nessas tabelas (ignoram RLS — esperado; cobertas pelo §8);
6. `EXPLAIN ANALYZE` antes/depois.

- **Views:** [FATO] as 12 views são `security_invoker` → herdam a guarda. Manter assim (bloquear view nova sem `security_invoker` no CI).
- **Desempenho [NÃO CONFIRMADO]:** guarda em tabelas grandes (`itens_venda`, `venda_eventos`) precisa de medição (`EXPLAIN ANALYZE`) antes/depois; helpers `STABLE` e chamados como `(SELECT fp_…())` para virar initplan.

## 8. RPC

`SECURITY DEFINER` ignora RLS ⇒ **cada RPC precisa de checagem explícita** com os helpers. Padrão substituto:

```sql
-- antes:  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM <loja> THEN RAISE ...
-- depois: IF NOT fp_pode_loja(<loja>, ARRAY['GERENTE','DONO']) THEN RAISE ...
```

| Grupo | Funções ([FATO], produção) | Ação |
|---|---|---|
| P0 — cross-empresa hoje | `transferir_estoque_seguro`, `transferir_estoque_entre_lojas` (GERENTE basta estar na origem **ou** destino) | exigir `fp_pode_loja(origem)` **e** `fp_mesma_empresa(origem, destino)`; `entre_lojas`: revogar EXECUTE (SEC-06) |
| P0 — sem loja | `fiscal_reprocessar_documento`; `obter_estoque_disponivel_transferencia` (P1) | escopo pela loja do documento / do parâmetro |
| Padrão "só GERENTE restrito" (DONO/ADMIN globais) | `ajustar_estoque_manual`, `atualizar_preco_varejo_produto`, `atualizar_produto_com_faixa_atacado`, `confirmar_importacao_nfe`, `confirmar_remessa_entrada`, `dashboard_gerente_resumo`, `encerrar_ordem_compra_com_falta`, `importar_nfe_transacao`, `liquidar_comissoes` (DONO global, ADMIN restrito), `receber_ordem_compra`, `registrar_conferencia_nfe`, `registrar_conferencia_ordem_compra`, `relatorio_produtos_sem_giro_periodo`, `relatorio_consistencia_vendas_gerente`, `retomar_caixa_atomico`, `vincular_importacao_nfe_ordem_compra`, `criar_produto_com_estoque_inicial` (ADMIN ignora loja), `fiscal_enfileirar_documento_venda` (DONO/ADMIN globais) | trocar para `fp_pode_loja` |
| Já restritas à loja para todos | `cancelar_conta_pagar`, `estornar_*`, `registrar_liquidacao_receber`, `registrar_pagamento_contas_pagar`, `excluir_linha_estoque_produto`, `*_movimentacao`, `calcular_valor_sistema_dinheiro_caixa`, `consumir_token_autorizacao_operacao`, `registrar_pricing_version_venda`, `cancelar_venda_transacional`, `devolver_ou_trocar_venda`, wrapper `finalizar_venda_*_v4` | trocar `u.loja_id = X` por `fp_pode_loja(X, …)` só quando GERENTE multi-loja exigir (senão GERENTE de A1+A2 fica preso à loja "principal") |
| Helpers legados | `auth_usuario_eh_admin`, `auth_usuario_eh_dono`, `auth_usuario_loja_id`, `auth_usuario_gerencial_loja`, `auth_pode_ver_produto_gerencial` | reimplementar por cima de `fp_*` (mesma assinatura) — muda o comportamento de todas as policies que os usam de uma vez |
| Internas/trigger | `internal.*`, `tg_*`, `trg_*`, `fn_*` | sem mudança (sem EXECUTE para API) |
| INVOKER com `p_loja_id` | `detalhe_comissoes_operador`, `gerente_estoque_list_page`, `resumo_comissoes_por_operador`, `list_produtos_gerente_filtrados`, `relatorio_cobertura_estoque` | cobertas pela guarda RLS (§7) |

Regra: nenhuma RPC aceita `loja_id`/`empresa_id` do cliente como autorização — o parâmetro só seleciona, o helper autoriza.

## 9. Sessão

- `getRawSession` (`lib/admin/auth/sessionConsistency.ts`) passa a carregar: `userId`, `ativo`, `eh_plataforma`, `empresaId` (única ativa), `vinculos[]`, `lojasPermitidas[]`, `papelEfetivo`.
- **Loja ativa:** OPERADOR → a loja do vínculo; GERENTE com 1 loja → ela; GERENTE com >1 → seleção explícita (seletor mínimo, só quando >1); DONO → loja selecionada ou "todas" nas telas consolidadas.
- **Fail closed:** sem empresa, sem vínculo, empresa não operacional ou >1 empresa sem seletor ⇒ bloqueio no `adminPolicy`/middleware com motivo explícito (estende o `conta_sem_loja` atual).
- **`LOJA_MATRIZ_ID`:** [FATO] ~22 pontos de produção com `?? LOJA_MATRIZ_ID` (`app/caixa/server/*`, `app/gerente/*`, `app/admin/auditoria|estoque`, `lib/gerente/auth/sessionContext.ts:18`) + defaults de banco em `usuarios`, `caixas`, `estoque`. Remoção em 2 passos: (1) instrumentar (log/alerta quando o fallback é usado; esperado = 0 hoje); (2) trocar por erro. Defaults de banco removidos após o backfill.
- Equivalência para o cliente 1: todos os usuários atuais têm `loja_id = MATRIZ` [FATO] ⇒ a sessão nova resolve a mesma loja.

## 10. Storage

- **[DECISÃO D5]** Leitura pública mantida; URL pública ≠ autorização de escrita. Bucket `produto-imagens`: `public = true`. [FATO] 0 objetos; 4 policies (INSERT/UPDATE/DELETE/SELECT) condicionadas a perfil gerencial e à existência do `produtos.id` no prefixo do caminho.
- [INFERÊNCIA] O subselect em `produtos` dentro da policy roda com a RLS de quem chama, logo já herda o escopo de `produtos`. **Mesmo assim**, explicitar: `fp_pode_loja(p.loja_id, ARRAY['GERENTE','DONO'])` no INSERT/UPDATE/DELETE.
- Caminho do objeto continua `<produto_id>/<arquivo>`; não incluir empresa no caminho (o produto já determina).

## 11. Edge Functions

| Função | [FATO] hoje | Regra |
|---|---|---|
| `validar-gerente` | JWT do usuário; `loja_id` vem do corpo | loja derivada do usuário/vínculo no servidor; corpo só seleciona entre lojas permitidas (fecha SEC-04, ainda não aplicada em produção) |
| `sync-outbox` | HMAC (chave por dispositivo ou `SYNC_KEY` global); loja do header `x-loja-id`, fallback `DEFAULT_PDV_LOJA_ID` | **fora do 1º corte (D6)**; P1 aberto. Pré-requisitos para operação multiempresa pelo desktop: dispositivo vinculado à loja no servidor; loja enviada pelo cliente ignorada como autorização; `DEFAULT_PDV_LOJA_ID` não é mecanismo de autorização; teste dispositivo A → loja B negado |
| `fiscal-worker` | chave `X-FISCAL-WORKER-KEY`, `verify_jwt=false`, `service_role`; credencial por `loja_id` do payload | manter; validar `fp_empresa_operacional` da loja antes de emitir; `fiscal_provider_config` não existe em produção [FATO] (frente fiscal, separada) |

Server Actions com `service_role` ([FATO]): `admin/provisionamento` (exige perfil ADMIN → passa a exigir `fp_eh_plataforma`), `admin/funcionarios` (cria usuário e **passa a criar vínculo**; valida loja ∈ lojas permitidas do ator), `gerente/estoque` e `criarProdutoComEstoqueInicialRpc` (passam a validar loja via helper antes da RPC), `api/health` (sem dado de tenant).

## 12. Migração (incremental, reversível)

Cada etapa: local → staging (clone) → autorização explícita → produção. Nenhuma etapa altera comportamento do cliente 1 antes da etapa 8.

| # | Etapa | Muda comportamento? | Reversão |
|---|---|---|---|
| 0 | Reconciliar drift (Anexo B) | conforme cada migration | por migration |
| 1 | DDL aditiva: `empresas`, `lojas.empresa_id` (NULL), `usuario_vinculos`, `plataforma_admins` (vazia), `UNIQUE(id, empresa_id)` | não | `DROP` |
| 2 | Backfill: Empresa 1; `lojas.empresa_id`; vínculos a partir de `usuarios` (DONO→(E1,NULL); GERENTE/OPERADOR→(E1, loja_id)); ADMIN **sem** vínculo; `empresa_id` NOT NULL | não | `DELETE` das linhas novas |
| 3 | Helpers `fp_*` (com modo compatibilidade) + reimplementação dos `auth_usuario_*` | não (equivalência provada) | restaurar corpo anterior (guardado no baseline) |
| 4 | Sincronização legada: trigger `usuarios` → `usuario_vinculos` (perfil/loja alterados por fluxos antigos refletem no vínculo) | não | `DROP TRIGGER` |
| 5 | RPC P0 (transferências, fiscal_reprocessar, estoque_transferência) | não para o cliente 1 (1 loja) | corpo anterior |
| 6 | `empresa_id` em `categorias`/`marcas` (+ demais confirmados), backfill E1 | não | `DROP COLUMN` |
| 7 | Guardas RESTRICTIVE por lote de domínio (catálogo → estoque → vendas/caixa → financeiro → fiscal → comissões → identidade) | não para o cliente 1 | `DROP POLICY tenant_guard` |
| 8 | RPCs do padrão "só GERENTE restrito" → `fp_pode_loja` | não (DONO vê todas as lojas da E1 = todas) | corpo anterior |
| 9 | Frontend: sessão nova, instrumentação do fallback, depois fail closed; `funcionarios`/`provisionamento` gravam vínculo | não | revert de deploy |
| 10 | Teste A × B em staging (§14) | — | — |
| 11 | Corte ADMIN (após D9): remover ramo legado do helper; popular `plataforma_admins` se aplicável | só para ADMIN | recolocar ramo |
| 12 | Remover defaults MATRIZ; `usuarios.perfil/loja_id` passam a derivados | não | restaurar defaults |
| 13 | Cliente 2 | — | — |

**Colunas `loja_id` anuláveis** ([FATO] 9 tabelas; NULLs contados em produção em 2026-10-02): `movimentacoes_caixa` 3 · `pdv_config` 1 (de 2 linhas) · `tokens_desconto_gerente` 2 · `cadastro_produto_telemetry_events` 1 · `precos_atacado` 58/58 (semântica D15) · `contas_pagar_pagamentos`, `liquidacoes_receber`, `system_alerts` 0 · `perfis` (fora do modelo, D8). Antes da etapa 7, decidir por tabela (backfill, derivar por join ou tratar NULL como "da empresa" — **nunca** como global).

## 13. Compatibilidade

- `usuarios.perfil` e `usuarios.loja_id` permanecem e continuam válidos até a etapa 12; durante a transição a fonte de verdade é `usuarios` e o vínculo é derivado (trigger, etapa 4). No corte, inverte: vínculo é fonte; `usuarios.*` vira derivado ou é removido em etapa futura.
- Assinaturas de RPC **não mudam** (o frontend não precisa de deploy sincronizado com o banco).
- Códigos de erro existentes (`*_LOJA_INVALIDA`, `*_PERFIL`) são mantidos; novos só para casos novos (`*_EMPRESA_INVALIDA`, `EMPRESA_NAO_OPERACIONAL`).
- `perfis` (D8): [FATO] nenhuma função, view ou policy de outra tabela a usa; nenhum uso no código da aplicação; 3 linhas (2 com `user_id` existente em `usuarios`); roles `perfil_restrito`, `perfil_gerente`, `perfil_admin` sem membros além de `postgres`. **[DECISÃO]** não remover, não alterar, não usar como fonte de autorização. A fonte do novo modelo é `usuario_vinculos` + `plataforma_admins` + helpers `fp_*`.

## 14. Testes

| Nível | Teste | Gate |
|---|---|---|
| Equivalência | para cada helper reimplementado e cada policy/RPC alterada: mesmo resultado antes/depois com E1 única, por perfil (os 11 usuários reais em clone) | etapas 3–8 |
| Regressão | suítes existentes: `fase3-tenant-isolation-*`, `test-rls-scope`, `p0-rls-rest-smoke`, `rls-produtos-tenant-rest-smoke`, `sec04-*`, `run-financial-tests`, `test:e2e:critical` | toda etapa |
| Isolamento A × B | Empresa A (A1, A2), Empresa B (B1); DONO A, GERENTE A1, GERENTE A1+A2, OPERADOR A1 contra B1: SELECT/INSERT/UPDATE/DELETE REST em todas as tabelas L/J/E/R; todas as RPCs do §8; Storage (write); `validar-gerente`; relatórios | etapa 10, obrigatório antes do cliente 2 |
| Positivos | GERENTE A1+A2 opera A2; DONO A consolida A1+A2; transferência A1→A2 permitida; A1→B1 negada | etapa 10 |
| Fail closed | usuário sem vínculo; vínculo inativo; empresa SUSPENSA/vencida; >1 empresa sem seletor | etapa 9 |
| Integridade | contagens por tabela e somatórios financeiros (vendas, caixas, contas) idênticos antes/depois do backfill | etapa 2 |
| Desempenho | `EXPLAIN ANALYZE` das 10 consultas mais quentes antes/depois da guarda | etapa 7 |
| CI | bloquear: policy nova sem guarda em tabela L/J/E; view sem `security_invoker`; RPC `SECURITY DEFINER` com `p_loja_id` sem chamada a `fp_pode_loja` | contínuo |

## Anexo A — ADMIN atual (pendência 1)

- [FATO] Único ADMIN: `4b19c169-…`, **inativo**, criado e último login em 2026-07-19, 0 vendas e 0 movimentos de estoque como ator.
- [FATO] O e-mail é exatamente o valor padrão de `PLAYWRIGHT_ADMIN_EMAIL` em `pdv-importados/e2e/smoke-fase1-provisionamento-homologacao.spec.ts:50`.
- [INFERÊNCIA] Conta de teste automatizado (e2e) criada em produção — não é pessoa da equipe nem do cliente.
- [NÃO CONFIRMADO] Quem executou o e2e contra produção.
- **[DECISÃO]** Classificada como **conta técnica/teste legada**. Não é promovida a plataforma, não recebe vínculo, permanece inativa; nenhum UPDATE/DELETE em produção nesta etapa. O backfill da Fase 1 a ignora explicitamente.
- **Pré-requisito do cliente 2:** revisar todas as contas de teste em produção (e2e, `@localhost.test`, `@example.com`) e garantir que não participem da operação real.

## Anexo B — Drift (pendência 2)

**Só em produção (3) — reconciliar no repositório antes de qualquer migration:**

| Versão | Nome | Situação [FATO] |
|---|---|---|
| `20260928201815` | `atualizar_preco_varejo_produto_rpc` | a função **não existe em nenhum arquivo** do repositório; usa padrão DONO/ADMIN global |
| `20260930090200` | `p03_vendas_lista_kpi_uma_linha_por_venda` | **conflita** com `20260930120000_vendas_lista_kpis_por_venda.sql` (só repo): duas implementações da mesma correção |
| `20261002104957` | `pos_venda_operacoes_select_dono_todas_lojas` | redefine `venda_pos_venda_operacoes_select_loja` com `auth_usuario_eh_dono()` global; repositório tem versão anterior |

**[DECISÃO D7/drift] Ordem:** (A) registrar no repositório as 3 migrations só-produção; (B) trazer para o repositório a RPC `atualizar_preco_varejo_produto`; (C) resolver o conflito `20260930090200` (produção) × `20260930120000` (repositório) escolhendo **uma** implementação; (D) avaliar SEC-04 e SEC-06 para o plano SaaS. As demais **não** são aplicadas só por estarem no repositório.

**Só no repositório (27) — classificação:**

| Classe | Migrations | Relação com SaaS |
|---|---|---|
| Segurança/isolamento | `20260916120000_sec04_token_gerente_vinculo_loja_v4`, `20260916120200_sec06_revoke_transferir_estoque_entre_lojas_legado` | **necessárias** (entram antes ou junto da etapa 5) |
| Caixa/venda (operacional) | `20260903130000_registrar_venda_pagamentos_split`, `20260903140000_registrar_venda_pagamentos_idempotencia`, `20260904140000_retomar_caixa_atomico`, `20260913090000_relatorio_tz_validado…`, `20260929120000_caixas_fechado_exige_dados_fechamento`, `20260929130000_descontos_venda_exige_pagamento_dinheiro`, `20260930120000_vendas_lista_kpis_por_venda` (conflito acima) | outra frente; verificar se o objeto já existe em produção por outra versão (ex.: `retomar_caixa_atomico` existe em produção [FATO]) |
| Devolução C3 | `20261001100000` … `20261001100500` (6) | outra frente |
| Fiscal | `20260902130000`, `20260902130100_fiscal_provider_config`, `20260902140300`, `20260902150000`, `20260902160000`, `20260903100000`, `20260903110000`, `20260903120000`, `20260903150000`, `20260903160000`, `20260903170000`, `20260903180000` (12) | outra frente; `fiscal_provider_config` é relevante para credencial por loja (§11) |

## Fora de escopo da v1

Billing; seletor de empresa; suporte com leitura de dados de cliente; exportação por tenant; LGPD além do isolamento; `sync-outbox` multi-cliente (só documentado); reorganização fiscal.
