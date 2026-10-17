# Plano de homologação — ERP em app.jinlong.app

**Status (2026-10-17):** pré-requisitos concluídos (domínio vinculado em 2026-10-16; Redirect URLs `https://app.jinlong.app/**` e `https://www.jinlong.app/**` cadastradas pelo responsável). **Parte sem login: aprovada. Parte com login: pendente (bloqueio abaixo).**
**Pré-requisito:** Fase 2 do runbook (`MIGRACAO_SITE_ERP_DOMINIOS.md`): domínio `app.jinlong.app` vinculado ao `pdv-importados`, mantendo `www.jinlong.app` ativo.

## Resultado — parte sem login (2026-10-17, sem gravar dados)

Método: `curl` contra `www` e `app` lado a lado, navegador integrado em `https://app.jinlong.app/login`, leitura do código e Sentry. Nenhum login, venda, movimentação ou envio de e-mail.

| # | Verificação | `www` | `app` | Resultado |
|---|---|---|---|---|
| H1 | Mesmo deploy | `dpl_AzdCk3JMkCqSaMH3HnNY8Rx8uXaA` | idem (HTML e `/api/health`) | ✅ código idêntico |
| H2 | Cabeçalhos (HSTS, `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Cache-Control: no-store`) | presentes | idênticos | ✅ |
| H3 | TLS | — | `CN=app.jinlong.app`, válido até 2027-01-14 | ✅ |
| H4 | `/login`, `/auth/esqueci-senha`, `/auth/redefinir-senha` | 200 | 200 | ✅ |
| H5 | `/admin/estoque`, `/caixa`, `/gerente/recebimento`, `/auth/alterar-senha` sem sessão | 307 → `/login?next=…` no próprio host | idem | ✅ permissões barram anônimo |
| H6 | `/auth/callback` sem código / código inválido | 307 → `esqueci-senha?erro=link_invalido` / `link_expirado` | idem, no próprio host | ✅ fluxo PKCE trata erro na origem certa |
| H7 | APIs `/api/gerente/{health,fila/status,notificacoes/count,atividades/recent}` sem sessão | 401 | 401 | ✅ (o middleware não cobre `/api`; as rotas se protegem sozinhas) |
| H8 | `/api/health` | 200 `ok` | 200 `ok` | ✅ |
| H9 | Open redirect `?next=https://evil.example` | — | — | ✅ por código: `LoginForm.destinoAposLogin` e `auth/callback.safeNextPath` aceitam só caminhos internos (`/admin`, `/caixa`, `/gerente`…) |
| H10 | Navegador: login renderiza, assets 200 no próprio host, console sem erros | — | ✅ | ✅ |
| H11 | Troca de idioma pt ↔ zh (só cookie) | — | ✅ e voltou para pt | ✅ |
| H12 | Sentry 24 h | — | nenhum erro novo; só `caixa.finalizar_venda.sucesso` (evento informativo, não erro) | ✅ |
| H13 | `validar-gerente` | chamada pelo servidor, sem `Origin`; secret inalterado | idem | ✅ não depende do domínio |

## Bloqueio — parte com login

O agente não digita senhas em produção (regra de segurança), e os testes de caixa, estoque e desconto movimentam dados reais se feitos em loja de produção. Por isso A1–A9, P1–P6 e os blocos de estoque ficam **com o responsável**, usando contas e loja de teste:
1. A2/A4/A7: entrar em `app` com um perfil de cada (admin, gerente, caixa), conferir a rota de destino, sair; repetir com `www` aberto em outra aba (sessões independentes).
2. A9: `https://app.jinlong.app/login?next=/caixa` e depois `?next=https://evil.example` (deve cair na rota padrão do perfil).
3. Estoque (somente leitura): abrir `/admin/estoque` e `/admin/estoque/movimentacoes` e conferir os mesmos saldos vistos no `www`.
4. Caixa e desconto: **só em loja de teste** (ou sem finalizar). Abrir o caixa, montar o carrinho, pedir desconto com senha de gerente (P5: o token deve ser emitido) e cancelar a venda antes de finalizar. Se não houver loja de teste, P1–P4 ficam para o piloto (Fase 3), com um caixa real e supervisão.
5. A5 (opcional): "esqueci a senha" com uma conta de teste; o link do e-mail deve abrir em `app.jinlong.app/auth/callback` e levar a `redefinir-senha`.

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
2. ~~Secret da Edge `validar-gerente`~~: **não é necessário** (verificado em 2026-10-17). A Edge é chamada por server action, sem `Origin`; o `www` também não está na lista e funciona. Ver `MIGRACAO_SITE_ERP_DOMINIOS.md`.
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
| P5 | Desconto com autorização de gerente | token emitido (a chamada é feita pelo servidor; nenhum `ORIGIN_NOT_ALLOWED`) |
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
