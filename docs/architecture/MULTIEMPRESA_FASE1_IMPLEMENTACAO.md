# Multiempresa — Fase 1 (implementação)

> Base: `ESPEC_MULTIEMPRESA_V1.md` (D1–D19). Branch `feat/multiempresa-fase1`.
> **Nada foi aplicado em produção.** Migration aditiva, com rollback testado.

## O que entra

| Item da espec | Entregue | Onde |
|---|---|---|
| Etapa 1 — DDL aditiva | `empresas`, `lojas.empresa_id` (anulável), `UNIQUE(id, empresa_id)`, `UNIQUE(empresa_id, codigo)` (a global continua), `usuario_vinculos`, `plataforma_admins` (vazia) | `backend/supabase/migrations/20261019120000_multiempresa_fase1_base.sql` |
| Etapa 2 — backfill | Empresa 1 (`e0000001-…`) com todas as lojas; vínculos derivados de `usuarios` (DONO→empresa, GERENTE/OPERADOR→loja); ADMIN sem vínculo (D9) | idem |
| Etapa 3 — helpers | `fp_usuario_ativo`, `fp_eh_plataforma`, `fp_empresas_do_usuario`, `fp_empresas_do_usuario_como_dono`, `fp_lojas_permitidas`, `fp_pode_loja` (compat. ADMIN legado), `fp_empresa_da_loja`, `fp_mesma_empresa`, `fp_empresa_operacional` | idem |
| Etapa 4 — trigger legado | `usuarios` (perfil/loja) → `usuario_vinculos` | idem |
| Etapa 7 — protótipo D16 | guarda `tenant_guard` RESTRICTIVE em `fornecedores`, `contas_receber`, `itens_venda` | idem |
| §11 sync-outbox (pré-requisitos D6) | dispositivo vinculado à loja **no servidor**; `x-loja-id`/loja do payload só confirmam; catálogo e `pdv_config` filtrados pela loja do dispositivo; replay de eventos de outra loja recusado | `functions/sync-outbox/tenantScope.ts` + `index.ts` |
| Provisionamento sem SQL | empresa + N lojas + DONO + GERENTES (multi-loja) + OPERADORES numa transação (`plataforma_provisionar_empresa`), config PDV/formas/checklist por loja | `app/admin/provisionamento/*` |
| Ativação do PDV por código | código de uso único (24h, só hash no banco) → segredo HMAC por computador; tela de ativação no desktop | `pdv_dispositivos`, `pdv_codigos_ativacao`, `ativar_dispositivo_pdv`, `pdv-local/src-tauri/src/ativacao.rs`, `pdv-local/src/ativacao/` |
| Instalador | bundle NSIS (pt-BR/中文), config do updater separada, workflow manual de build Windows | `tauri.conf.json`, `tauri.updater.conf.json` + workflow de build Windows em `docs/architecture/multiempresa-fase1/ci-workflows.patch` |

## Comportamento do cliente 1 (D10)

- Todas as lojas viram Empresa 1 → DONO enxerga as mesmas lojas; GERENTE/OPERADOR a mesma loja; ADMIN legado continua global (ramo de compatibilidade).
- PDVs atuais com `SYNC_KEY` no `.env` continuam sincronizando (modo **legado**) sem mudança; não aparece a tela de ativação.
- Assinaturas de RPC e policies existentes não mudam.

## Testes

- `npm run test:multiempresa-fase1 -w fastproduct-backend` (PGlite, migration real): backfill, equivalência cliente 1, provisionamento atômico (inclusive falha = nada gravado), DONO/GERENTE/OPERADOR de A × B em SELECT/INSERT/UPDATE/DELETE (com policies PERMISSIVE amplas, provando que a guarda é a barreira), sentido inverso, GERENTE multi-loja, fail closed (sem sessão, usuário inativo, vínculo inativo), trigger legado, ativação (uso único, expirado, reativação revoga, empresa suspensa), rollback + reaplicação idempotente.
- `deno test backend/supabase/functions/sync-outbox/tenantScope.test.ts`: dispositivo A não escreve na loja B por nenhum tipo de evento (replay offline), header divergente, legado desligado.
- Vitest web (`provisionamentoEmpresa.test.ts`) e desktop (`AtivacaoPdvGate.test.tsx`).

## Rollout em produção (cada passo com autorização explícita)

1. Pré-requisitos da espec: reconciliar drift (Anexo B) e revisar contas de teste em produção (Anexo A).
2. Staging (clone de produção): aplicar a migration; rodar as suítes de regressão do §14 e conferir contagens/somatórios; `EXPLAIN ANALYZE` de `itens_venda` antes/depois.
3. Produção: aplicar a migration (rollback pronto em `backend/supabase/rollback/20261019120000_multiempresa_fase1_base.rollback.sql`).
4. Deploy da Edge `sync-outbox` (sem `SYNC_LEGACY_KEYS_ENABLED`, legado segue ligado).
5. Deploy do web (wizard novo).
6. Gerar código para cada caixa do cliente 1, ativar, conferir sync; depois `SYNC_LEGACY_KEYS_ENABLED=false` e **rotacionar/remover `SYNC_KEY`**.
7. Só então provisionar o cliente 2 pelo wizard.

## O que fica para as próximas fases (não feito aqui)

- Guarda RESTRICTIVE nas demais ~140 tabelas (etapa 7, por lote), `empresa_id` em `categorias`/`marcas`/`regras_preco`/… (etapa 6). Até lá, **tabelas sem guarda continuam protegidas só pelas policies atuais** (que hoje dão a DONO/ADMIN visão global) — por isso o cliente 2 **não** deve entrar antes das etapas 6–8.
- RPCs P0 (`transferir_estoque_*`, `fiscal_reprocessar_documento`) e o padrão "só GERENTE restrito" → `fp_pode_loja` (etapas 5 e 8).
- Sessão do web (`getRawSession`) carregando empresa/vínculos e fail closed (etapa 9); `admin/funcionarios` gravando vínculo; `validar-gerente` derivando loja do vínculo (SEC-04).
- sync-outbox: `regras_preco` globais (sem produto/categoria) não vão para dispositivos de tenant; `operador_id` da venda ainda não é validado contra o vínculo da loja; rate limit dedicado em `op=ativar`.
- Desktop: plugin `tauri-plugin-updater` no Rust (dependência + `.plugin(...)` + checagem no boot), chave de assinatura, e proteger `ativacao.json` com DPAPI no Windows. O build Rust não foi validado neste ambiente (rustc 1.85, sem WebKitGTK) — rodar o job `rust-tauri-checks` (label `run-tauri`).
- Revisão dos textos em chinês por falante nativo.

## CI (aplicar à parte)

O token usado para abrir este PR não tem escopo `workflow`, então as mudanças em `.github/workflows/` estão em
`docs/architecture/multiempresa-fase1/ci-workflows.patch` (novos passos no `ci-backend-supabase.yml` para
`test:multiempresa-fase1` e `tenantScope.test.ts`, e o workflow manual `release-pdv-desktop.yml`). Aplicar com
`git apply docs/architecture/multiempresa-fase1/ci-workflows.patch` e commitar com uma credencial que tenha `workflow`.

---

## Fase 2 — guardas em todo o tenant (migration `20261019140000_multiempresa_fase2_guardas.sql`)

Aditiva e reversível (`backend/supabase/rollback/20261019140000_multiempresa_fase2_guardas.rollback.sql`).
Tolera drift: tabela/coluna ausente vira NOTICE e fica registrada como `aplicada = false` em `internal.fp_tenant_guardas`.

| Peça | O que faz |
|---|---|
| Guardas RESTRICTIVE `tenant_guard` | 78 tabelas (registro em `internal.fp_tenant_guardas`) + 3 da fase 1. Classes: **L** loja direta (`fp_pode_loja`), **L?** loja nulável (NULL = legado da Empresa 1), **J** loja pela entidade-pai via `fp_loja_de(tipo, id)` (vendas por caixa, itens/pagamentos/devoluções/fiscal por venda, comissões, NF-e, OC, remessas, histórico por produto), **E** empresa (`fp_pode_empresa`), **R** `lojas`, **V** `usuarios`. |
| `empresa_id` no catálogo/config | categorias, marcas, regras_preco, categorias_financeiras, pricing_config_versions, configuracoes_gerais, relatorio_settings — backfill Empresa 1; trigger preenche com a empresa do usuário; servidor com 2+ empresas sem `empresa_id` ⇒ erro `EMPRESA_ID_OBRIGATORIA` (nunca linha órfã). |
| Envelopes de RPC (§8) | 42 RPCs SECURITY DEFINER expostas a `authenticated` que recebem loja/caixa/venda/produto/documento/OC/NF-e/remessa/conta/operador: corpo original movido intacto para `internal`, wrapper em `public` com a mesma assinatura e grants chama `fp_assert_loja` antes. `transferir_estoque_seguro` também exige `fp_assert_mesma_empresa(origem, destino)`. `p_loja_id NULL` (“todas as lojas”) só com uma empresa ou ADMIN legado. service_role/cron passam direto. Registro em `internal.fp_rpc_envelopes` (usado pelo rollback). |
| `vincular_usuario_loja` | cadastro de funcionário grava o vínculo validando que o **ator** pode a loja e que o usuário não é de outra empresa. Chamado por `app/admin/funcionarios/actions.ts` (função ausente ⇒ compat). |
| `fp_usuario_pode_loja` | sync valida `operador_id` de VENDA_REGISTRADA / CAIXA_ABERTO / MOVIMENTO_CAIXA contra vínculo ativo da loja do dispositivo (`EVENTO_OPERADOR_SEM_VINCULO`). |
| `ativar_dispositivo_pdv_v2` | registra tentativas em `pdv_ativacao_tentativas`; 10 falhas/15 min por computador **ou** IP ⇒ `ATIVACAO_PDV_BLOQUEADA` (HTTP 429 no sync-outbox). |
| Sessão web | `fetchRawSession` lê `usuario_vinculos`; `AdminSession` ganha `empresaId`/`vinculos`. Sem vínculo ⇒ `blocked: sem_empresa`; vínculos em 2 empresas ⇒ `blocked: multi_empresa` (falha fechada). Tabela ausente ⇒ compat. ADMIN legado segue. |

### Teste de cobertura (`npm run test:multiempresa-fase2`)
Aplica **todas** as 414 migrations em PGlite e: (1) falha se qualquer tabela de `public` não tiver `tenant_guard` (RESTRICTIVE, FOR ALL, authenticated, USING/CHECK via `fp_*`) nem isenção com motivo; (2) falha se uma tabela com `loja_id`/`empresa_id` escapar; (3) falha se uma RPC SECURITY DEFINER exposta a `authenticated` não estiver envelopada nem na lista de pendências com motivo; (4) A×B comportamental (leitura, escrita, update/delete cruzado, troca de loja, catálogo, RPCs, transferência entre empresas, ADMIN legado); (5) vínculo, operador, limite de ativação; (6) rollback e reaplicação.

### Pendências (antes do cliente 2 em produção)
1. **Configuração global** (D12/D13): `configuracoes_gerais` tem `UNIQUE(chave)`, `pricing_config_versions` tem índice de versão ativa global, `relatorio_settings` é linha única; as RPCs `configuracoes_para_caixa_web`, `pdv_config_*`, `obter_limite_sangria_sem_gerente`, `obter_pricing_version_ativa` leem a config global. Cliente 2 hoje vê só defaults e não consegue salvar config que colida com a chave da Empresa 1. Precisa de troca de unicidade para `(empresa_id, chave)` + RPCs por empresa.
2. **RPCs com loja no payload/derivada** (`financeiro_comando*`, `financeiro_painel`, `listar_caixas_elegiveis_desembolso`, `listar_vendas_em_espera`, `pdv_diagnostico_pre_producao`): revisar uma a uma com A×B.
3. **Suites em Postgres real** (`test:financial`, `test:rls-scope`, `test:rls-policies`) exigem Supabase local (docker) e não rodaram aqui — rodar no CI/staging com esta migration antes do merge.
4. **Desempenho**: guardas J chamam `fp_loja_de` por linha; medir em staging (EXPLAIN em vendas/itens_venda) e, se preciso, materializar `loja_id` nas tabelas J quentes.
5. Seletor de empresa na UI para usuário com vínculo em 2 empresas (hoje bloqueado).
6. Desativar `SYNC_LEGACY_KEYS_ENABLED` depois de ativar todos os PDVs do cliente 1; rotacionar o `SYNC_KEY` vazado na branch `loop/ux-caixa-gold-token`.
7. Build/assinatura do instalador Tauri (Rust não validado neste ambiente) e workflow de CI (patch em `docs/architecture/multiempresa-fase1/ci-workflows.patch`, precisa de token com escopo `workflow`).

## Fase 3 — configuração por empresa, seletor e SEC-04 (20261019150000)

- `configuracoes_gerais` única por `(empresa_id, chave)`; `pricing_config_versions` com 1 versão ativa por empresa; `relatorio_settings` 1 linha por empresa; `pdv_config` com `empresa_id` e linha padrão por empresa (`loja_id` NULL). Backfill: tudo da Empresa 1 (cliente 1 lê exatamente as mesmas linhas, `pdv_config.id = 1`).
- Empresa nova recebe padrões automaticamente (trigger `trg_empresa_semear_config`).
- `fp_empresa_contexto(p_loja)` resolve a empresa da operação; 23 funções reescritas por `internal.fp_reescrever` (original guardado em `internal.fp_funcoes_reescritas`). Em staging/produção conferir `SELECT * FROM internal.fp_funcoes_reescritas WHERE NOT aplicada` — drift do repo ⇒ reescrita não aplicada.
- Revisadas e cobertas por teste A×B: `financeiro_comando*`, `financeiro_painel`, `listar_caixas_elegiveis_desembolso`, `listar_vendas_em_espera`, `pdv_diagnostico_pre_producao`. `RPC_PENDENTES` vazio: o teste enumerador exige envelope ou revisão para toda RPC.
- Seletor de empresa: `/selecionar-empresa` grava cookie `fp_empresa` + loja ativa (`usuarios.loja_id`); clientes Supabase mandam `x-fp-empresa`, que só ESTREITA o escopo.
- SEC-04: `validar-gerente` só aceita loja permitida ao token e valida a senha da empresa da loja (antes a senha do gerente da empresa 1 valia para todas).
- sync-outbox: catálogo (`regras_preco`) e `pdv_config` pela empresa do dispositivo.
- Testes: `npm run test:multiempresa-fase3` (18). Rollback: `rollback/20261019150000_...` ANTES do rollback da fase 2.
