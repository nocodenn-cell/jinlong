# Plano de homologação — ERP em app.jinlong.app

**Status:** plano. Nada deste documento foi executado. Cada etapa remota exige autorização própria.
**Pré-requisito:** Fase 2 do runbook (`MIGRACAO_SITE_ERP_DOMINIOS.md`): domínio `app.jinlong.app` vinculado ao `pdv-importados`, mantendo `www.jinlong.app` ativo.

## Decisão de migração (aprovada em 2026-10-08)

- **Novo login obrigatório** em `app.jinlong.app`. Os cookies de sessão são *host-only* de `www`; não há compartilhamento de sessão entre hosts e não vamos alterar o fluxo de autenticação para isso.
- **Corte com caixas fechados.** Nenhum carrinho aberto, venda em espera ou turno em andamento atravessa a troca de host.
- Nenhum cliente migra sem aprovação explícita. Ordem: homologação interna → loja piloto → demais clientes.

## O que fica preso à origem (evidências do código)

| Item | Onde | Efeito em `app.jinlong.app` |
|---|---|---|
| Cookies de sessão Supabase (`@supabase/ssr`, sem `domain`) | `lib/supabase/*`, `middleware.ts` | sessão nova; login obrigatório |
| `localStorage['pdv-carrinho']` (zustand/persist) | `shared-core/src/stores/unifiedCartStore.ts` | carrinho começa vazio |
| `localStorage['fastproduct_device_fingerprint']` | `lib/security/deviceFingerprint.ts` | novo identificador (`web-<uuid>`) |
| PKCE de recuperação de senha | `app/auth/esqueci-senha`, `app/auth/callback` | link enviado antes do corte falha uma vez |
| `idioma_preferido` / `usuario_idioma` | cookies | preferência volta ao padrão até a primeira escolha |
| Logout por inatividade | `components/security/SessionIdleLogout.tsx` | sem mudança; contador reinicia com a nova sessão |

### Uso do identificador de terminal (para decidir o risco)
- **Venda web:** `p_terminal_id` é a constante `'web-caixa'` (`caixaVendas.impl.ts`). Não depende do identificador do navegador.
- **Movimentações de caixa:** o identificador do navegador é gravado como `terminal_id` (informativo) em `cashMovementWriter` / `useCaixaStatusMovimentacoes`.
- **Desconto com gerente:** vai como cabeçalho `x-device-fingerprint` em `caixaGerenteDesconto.impl.ts`.
- **Desktop (Tauri):** usa `DEVICE_FINGERPRINT` próprio no `.env` e fala direto com a Edge `sync-outbox`; a allowlist `SYNC_ALLOWED_DEVICE_FINGERPRINTS` é dele. **Sem impacto.**
- **A verificar na homologação:** se algum relatório, auditoria ou regra de negócio agrupa ou filtra por `terminal_id` (então o corte parte o histórico por terminal) e se `validar-gerente` aplica allowlist ao cabeçalho.

## Configurações remotas necessárias (não autorizadas ainda)

1. Supabase Auth → *Redirect URLs*: adicionar `https://app.jinlong.app/**`, mantendo as de `www`.
2. Secret da Edge `validar-gerente`: acrescentar `https://app.jinlong.app` a `VALIDAR_GERENTE_ALLOWED_ORIGINS`, mantendo as atuais.
3. Vercel: vincular `app.jinlong.app` ao projeto `pdv-importados` (sem remover `www`).
4. Variável do ERP `NEXT_PUBLIC_APP_URL` (usada no SSR, `lib/auth/appOrigin.ts`): revisar se está definida; no navegador vale `window.location.origin`.

## Roteiro de homologação (executar em `app.jinlong.app` com conta de teste)

### 1. Autenticação
| # | Passo | Esperado |
|---|---|---|
| A1 | Abrir `/login` anônimo | 200, formulário, idioma conforme cookie |
| A2 | Login gerente, caixa e admin (3 contas de teste) | cada perfil cai na rota certa (`/admin`, `/gerente`, `/caixa`) |
| A3 | Abrir `/admin` sem sessão | redireciona para `/login` |
| A4 | Logout | volta ao `/login`; cookie removido |
| A5 | `esqueci-senha` → e-mail → link | `/auth/callback?code=…` troca o código nesta origem e abre `redefinir-senha` |
| A6 | `alterar-senha` autenticado | conclui sem erro |
| A7 | Sessão aberta em `www` e em `app` ao mesmo tempo | ambas válidas; sair em uma não derruba a outra |
| A8 | Inatividade (`NEXT_PUBLIC_IDLE_LOGOUT_MINUTES`) | logout no tempo configurado |
| A9 | `/login?next=/caixa` | respeita `next` seguro (somente rotas internas) |

### 2. PDV (caixa fechado antes e depois de cada bloco)
| # | Passo | Esperado |
|---|---|---|
| P1 | Abrir caixa | status aberto; movimentação registrada com `terminal_id = web-<uuid>` |
| P2 | Venda varejo (Pix) | recibo; estoque −1 |
| P3 | Venda atacado (qtd ≥ mínimo) | preço de atacado |
| P4 | Pagamento parcial com cliente | conta a receber gerada |
| P5 | Desconto com autorização de gerente | `validar-gerente` responde (CORS ok, sem erro de origem) |
| P6 | Venda em espera, recarregar a página | carrinho recuperado na **mesma** origem |
| P7 | Fechamento de caixa | fecha sem erro; conferência igual à de `www` |
| P8 | Comparar com `www` no mesmo dia | vendas e saldos coincidem (mesmo banco) |

### 3. Identificação de terminal
| # | Passo | Esperado |
|---|---|---|
| T1 | Limpar o site em `app`, abrir `/caixa` | gera `fastproduct_device_fingerprint` novo, estável entre recargas |
| T2 | Abrir movimentação de caixa em `www` e em `app` | `terminal_id` diferente por origem; nada quebra |
| T3 | Consultar relatórios/auditoria por terminal | registrar se o histórico se divide; decidir mitigação antes do corte |

### 4. Redirecionamentos (após Fase 4 apenas)
`/login?next=%2Fcaixa`, `/auth/callback?code=x`, `/admin/catalogo/novo`, `/api/health` e um POST em `/api/caixa/x` em `www.jinlong.app` → 307 para `app.jinlong.app` preservando caminho e query.

## Critérios para liberar o piloto

- Todos os itens A1–A9 e P1–P8 aprovados; T1–T3 sem pendência.
- Sem novos erros no Sentry do ERP durante a homologação.
- Comunicação aos clientes enviada com antecedência: novo login, caixa fechado na troca, link de redefinição antigo expira.

## Gatilhos de rollback
Falha de login acima do normal, 404 em rotas do ERP, erro em venda/caixa, `validar-gerente` recusando origem. Ação: manter (ou devolver) `www.jinlong.app` ao projeto do ERP; `app.jinlong.app` pode continuar em paralelo.
