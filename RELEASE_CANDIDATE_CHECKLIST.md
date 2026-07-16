# Release Candidate Checklist — FastProduct

**Data:** 2026-07-16 · **Base:** `main` @ `8deb540` (produção atual) · **RC branch de auditoria:** PR #198

Legenda: [x] verificado/verde · [ ] pendente · 🔒 requer confirmação humana (mutação de produção)

## A. Código
- [x] Testes 663/663 verdes (web 530 · shared-core 76 · desktop 57), 0 skip
- [x] Typecheck limpo (exit 0)
- [x] `guard:all` 7/7 OK (core, pdv, routes, rpc, pricing, deps, migrations)
- [x] Sem regra de negócio na UI (`guard:core`)
- [x] Fluxo de venda único (`guard:rpc`) — v4 web / RPC local
- [x] 0 TODO/FIXME em core/lib; 0 testes skip
- [ ] Consolidar UI dupla `/gerente`→Admin V2 (gate de validação por módulo — P2)

## B. Infraestrutura
- [x] Supabase `jinlong` ACTIVE_HEALTHY (Postgres 17.6, sa-east-1)
- [x] Edge Functions ativas: sync-outbox v68, validar-gerente v43, fiscal-worker v35
- [x] `ageguard` confirmado INACTIVE (não serve tráfego de produção)
- [x] Vercel `pdv-importados` (team jinlong) ativo, Node 24.x

## C. Configuração
- [x] Autoridade única por camada definida e documentada
- [x] Nenhuma referência a variável inexistente no código
- [x] Nenhum shim de compat obsoleto no código
- [x] Nenhuma secret real versionada (só `.example` + `.env.test` fictício)
- [ ] 🔒 Confirmar valores de cofre Vercel Env (Prod/Preview) — não legível por API
- [ ] 🔒 Confirmar GitHub Actions Secrets/Variables por nome
- [ ] 🔒 Remover 4 nomes órfãos dos cofres (após confirmar não-uso externo)
- [ ] 🔒 Confirmar `NEXT_PUBLIC_SUPABASE_URL` (Prod) = `kbabmewnahysfvlybiak`

## D. Deploy
- [x] Produção = `main` HEAD (`8deb540`) — sem drift repo↔prod
- [x] Deploy de produção READY; rollback candidate disponível (`c41f241`)
- [x] PR #198 (auditorias) só em Preview — não promovido a produção

## E. Banco
- [x] Ledger de produção lido (18 migrations rastreadas)
- [x] `guard:migrations` local OK (sem colisão por timestamp)
- [ ] 🔒 Aplicar/confirmar migrations do repo ausentes no ledger: **248, 250, 251, 252, 253, 256**
- [ ] 🔒 Homologar 248 (devolução) + gate financeiro 5/5 antes de aplicar em produção
- [ ] Normalizar numeração duplicada (dois `259`, dois `268`) — cosmético, pós-go-live

## F. Observabilidade / Segurança
- [x] Sentry configs presentes (client/server/edge)
- [ ] 🔒 Confirmar `SENTRY_DSN` no cofre de produção
- [x] Advisors de segurança: 0 ERROR (114 WARN/INFO — revisar 33 anon SECURITY DEFINER)
- [x] Advisors de performance: 0 ERROR (266 otimização — não bloqueante)
- [ ] 🔒 Habilitar *leaked password protection* (Supabase Auth — toggle dashboard)
- [ ] Revisar 2 tabelas RLS-enabled-sem-policy (`gerente_auth_attempts` + 1)

## Critério de GO
GO quando **todos os itens 🔒 de B/C/E/F forem confirmados por você** e a homologação da 248 passar. Código/Deploy já estão em GO.
