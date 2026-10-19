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
