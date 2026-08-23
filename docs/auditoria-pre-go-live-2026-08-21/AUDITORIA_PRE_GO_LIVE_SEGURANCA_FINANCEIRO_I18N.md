# Auditoria pre-go-live - seguranca, financeiro e i18n

## Identificacao e escopo

| Campo | Valor |
|---|---|
| Data | 2026-08-21 |
| Ambiente | Workspace local Windows, PowerShell, sem conexao autenticada ao Supabase remoto |
| Branch | `codex/ap-payments-reconciliation` |
| HEAD | `3d68d32880986832403976d46a47968efcd8d873` |
| Estado auditado | HEAD mais working tree suja, explicitamente distinguida do commit |
| Metodo | Revisao adversarial de documentacao, codigo, migrations, testes, CI e historico Git local; testes locais nao destrutivos |

Esta auditoria nao alterou codigo, migrations, banco remoto, deploy ou PR. Somente os seis documentos desta pasta foram criados.

## Limitacoes materiais

1. As fontes obrigatorias `Especificação de Alterações e Melhorias do Sistema.pdf` e `Princípios-de-Engenharia.txt` nao existem no workspace, no indice Git ou nos anexos acessiveis. Portanto, requisitos nelas contidos estao **NAO COMPROVADOS**.
2. Nao houve acesso autenticado ao banco local ou remoto. Estado efetivamente aplicado, RLS, grants, backups gerenciados e dados reais nao foram provados.
3. O working tree ja continha alteracoes em cinco migrations financeiras, no teste adversarial financeiro, lockfile e `pdv-importados/package.json`. O SHA acima nao identifica sozinho o estado observado.
4. `npm run guard:all` nao iniciou porque o npm global aponta para modulo inexistente. A tentativa com pnpm foi interrompida ao tentar rede; os pacotes movidos por ele foram restaurados. Testes dependentes de npm ficaram limitados.
5. Nao foram executados testes destrutivos, concorrentes contra producao, restauracao de backup, browser E2E, assinatura de artefato desktop ou validacao linguistica por falante nativo.

## Vereditos obrigatorios

| Frente | Veredito | Base objetiva |
|---|---|---|
| Seguranca tecnica | **REPROVADO** | Segredo compartilhado embarcado no desktop, logs locais persistentes sem politica demonstrada, arquivos sensiveis locais fora do ignore e estado RLS remoto nao comprovado. |
| Prontidao LGPD | **INSUFICIENTE** | Existe politica, mas retencao, expurgo, exportacao, atendimento, backups e suboperadores nao possuem implementacao/processo comprovados. Requer validacao juridica e operacional. |
| Confiabilidade financeira | **NAO COMPROVADA** | O estado financeiro relevante esta parcialmente fora do SHA e os testes SQL/concorrencia exigem banco nao disponivel. |
| Portugues | **PARCIAL** | Catalogo amplo, mas ha hardcodes e desktop separado sem arquitetura de locale. |
| Mandarim | **REQUER VALIDACAO NATIVA** | Paridade de 2.516 chaves comprovada; qualidade terminologica/fiscal e cobertura visual nao foram validadas por nativo. |
| Prontidao estrutural para ingles | **NAO PRONTO** | `en-US` deliberadamente cai em mensagens PT; tipos, constraints e persistencia aceitam apenas `pt`/`zh`. |
| Europa/outros mercados | **REQUER DESACOPLAMENTO** | Moeda, timezone, fiscalidade, enderecos e documentos permanecem Brasil-centricos. Ingles nao equivale a Europa; LGPD nao substitui GDPR. |
| Go-live geral | **BLOQUEADO** | Ha FIN-001 P0 e P1 abertos sem mitigacao comprovada, alem da ausencia das fontes obrigatorias e de prova do banco aplicado. |

## Resumo de achados

| Frente | P0 | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|---:|
| Seguranca | 0 | 4 | 1 | 0 | 5 |
| LGPD | 0 | 2 | 2 | 0 | 4 |
| Financeiro | 1 | 3 | 1 | 0 | 5 |
| I18n | 0 | 3 | 2 | 0 | 5 |
| **Total** | **1** | **12** | **6** | **0** | **19** |

## Bloqueadores de go-live

- **FIN-001:** release financeira nao e reproduzivel pelo SHA; working tree contem alteracoes financeiras nao commitadas e o branch nao e `main`.
- **FIN-002 / FIN-003:** invariantes, concorrencia, RLS e grants do banco aplicado nao foram executados/provados neste ambiente.
- **SEC-001 / SEC-002:** material sensivel local esta exposto a commit acidental e o desktop usa credencial HMAC compartilhada, sem identidade por dispositivo demonstrada.
- **LGPD-001 / LGPD-002:** politica documental afirma controles de retencao/anonimizacao sem mecanismo e governanca de backup comprovados.
- Fontes obrigatorias ausentes impedem aceite completo dos requisitos.

## Evidencias positivas confirmadas

- `scripts/rpc-gate-guard.mjs`: PASS; fluxo web v4 e writer local canonico.
- `scripts/pricing-rpc-guard.mjs`: PASS; pricing online via RPC e excecao offline declarada.
- Catalogos `pt.json` e `zh.json`: 2.516 folhas cada, sem chaves faltantes em qualquer lado.
- Callback de autenticacao usa `safeNextPath`, reduzindo risco de open redirect (`pdv-importados/app/auth/callback/route.ts:17`).
- Sync implementa HMAC, timestamp, nonce UUID e persistencia anti-replay (`backend/supabase/functions/sync-outbox/index.ts:984-1024`).
- Ha migrations de hardening para `search_path`, revogacao de `PUBLIC/anon` e isolamento por loja; a aplicacao remota, contudo, nao foi provada.

## Documentos e areas consultadas

Foram lidos ou inspecionados: `package.json` dos workspaces; `.github/workflows`; `docs/architecture/GO_LIVE_READINESS.md`; `docs/GO_LIVE_STATUS_ATUAL.md`; `docs/TERMOS_E_PRIVACIDADE.md`; `docs/AUTHORIZATION_MATRIX.md`; `docs/architecture/inventario_i18n.md`; `docs/architecture/financial_100_audit.md`; `docs/RECONNECT_REPLAY_POLICY.md`; `docs/adr/ADR-011-ssot-unico-migrations.md`; documentacao de seguranca web; codigo de auth, admin, caixa, financeiro, i18n e desktop; Edge Functions; migrations canonicas; scripts de RLS/financeiro; lockfiles e workflows. O inventario detalhado de comandos esta no fim deste documento.

## Comandos executados

```text
git branch --show-current; git rev-parse HEAD; git status --short; git log -1
rg --files (inventario documental, SQL, workflows e configuracoes)
git ls-files / git check-ignore / git diff --stat / git diff [migrations financeiras]
rg -n (service_role, SECURITY DEFINER, grants, storage local, updater, i18n, locale, moeda, timezone, hardcodes)
node scripts/migration-sequence-guard.mjs            -> FAIL
node scripts/rpc-gate-guard.mjs                      -> PASS
node scripts/pricing-rpc-guard.mjs                  -> PASS
node (comparacao recursiva pt.json x zh.json)       -> 2516/2516, paridade
npm run guard:all                                   -> NAO INICIOU (npm global quebrado)
pnpm run guard:all                                  -> INTERROMPIDO (rede restrita; dependencias restauradas)
```

## Proximo passo recomendado

Executar o sprint 0 do `PLANO_REMEDIACAO_PRE_GO_LIVE.md`: congelar um commit candidato em `main`, remover/ignorar material sensivel, disponibilizar as duas fontes obrigatorias e levantar um Supabase efemero a partir do SSOT. Somente depois repetir gates financeiros/RLS e homologacao humana.

## HANDOFF PARA CLAUDE CODE

Ordem exata:

1. Abrir `MATRIZ_ACHADOS_PRE_GO_LIVE.md`, depois `PLANO_REMEDIACAO_PRE_GO_LIVE.md`.
2. Abrir primeiro `.gitignore`, `pdv-local/src-tauri/src/db.rs`, `backend/supabase/functions/sync-outbox/index.ts`, `backend/scripts/financial-adversarial-gates.test.sql`, as migrations `20260813*`/`20260814*`, `pdv-importados/src/lib/i18n/catalogAdapter.ts` e `shared-core` de locale/moeda.
3. Nao misturar rotacao/identidade de dispositivo, remediacao financeira e expansao i18n no mesmo PR.
4. Manter verdes: guard de migrations, guard de RPC, guard de pricing, testes RLS REST, testes financeiros SQL e concorrencia, typecheck/lint/test/build web, testes desktop e paridade de catalogos.
5. Exigir aprovacao humana para rotacao de segredos, descarte/retencao de backups, migrations financeiras, mudanca de base legal/retencao, termos juridicos, escolha de moeda/pais fiscal e promocao para producao.
6. Rollout: staging com banco reconstruido do zero, duas execucoes consecutivas dos cenarios financeiros e cross-loja, backup restauravel validado, canary por loja e rollback somente por compensacao financeira - nunca DELETE de fatos.
