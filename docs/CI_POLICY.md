# Política de CI obrigatório em `main`

Item 12 do Plano Mestre de Fechamento dos Gaps (Jīn Lóng). Decide quais
checks de CI são **required** antes de habilitar branch protection (item 11)
— não redesenha nenhum workflow, só declara a política.

## Contexto que motivou a decisão

Antes desta unidade, `main` não tinha nenhum `required_status_checks`
configurado (confirmado via `gh api repos/.../branches/main/protection` —
chave ausente). A auditoria de completude já havia provado isso na prática:
PR #366 foi mergeado com CI vermelho.

## Required (bloqueiam merge em `main`)

| Check | Workflow | Por quê |
|---|---|---|
| `build-and-test` | CI pdv-importados | Build + testes unitários do app real — sem isso não há garantia mínima de que o código compila e os testes passam. |
| `gitleaks` | Secret scan | Scanning de segredo — vazamento de credencial é P0 por definição. |
| `Supabase local gates (RLS smoke + scope + REST)` | CI backend Supabase | Cobre RLS smoke, scope por perfil, REST RLS smoke e o **Financial regression gate** e o **Types drift gate** no mesmo job — é o gate central de integridade de dado/segurança do backend. |
| `edge-functions-typecheck` | CI backend Supabase | Type-check das 3 Edge Functions em produção (sync-outbox, validar-gerente, fiscal-worker) — estável, rápido, sem histórico de flakiness nesta sessão. |
| `outbox-contract` | CI backend Supabase | Contract smoke do payload v1 do sync-outbox — estável, sem histórico de flakiness nesta sessão. |
| `anti-replay-diagnostic-gate` | CI backend Supabase | Gate de anti-replay do sync-outbox — integridade financeira/anti-fraude. |

## Não-required (por ora, com motivo objetivo)

| Check | Motivo |
|---|---|
| `e2e-critical` ("E2E crítico (sistema de risco)") | O próprio workflow já documenta (`ci-pdv-importados.yml:4,79`): "E2E = sistema de risco, não sistema de decisão (e2e-critical não bloqueia nada)". Observa regressão funcional; não faz parte do `needs:` de nenhum gate de deploy. Mudar isso é decisão de produto, não deste item. |
| `e2e-playwright` | Gated atrás de `vars.ENABLE_PLAYWRIGHT_E2E` (opcional/desligável) e com histórico de flakiness de infraestrutura (rate limit de imagem Docker, timeout de instalação do Playwright) observado repetidamente durante o fechamento dos itens 1-24 desta engine loop. Não tornar required enquanto continuar comprovadamente flaky. |
| `migration-remote-drift` | Achado do item 10 (PR #377): 17 migrations de uma iniciativa separada (prontidão fiscal Focus NFe, `20260902130000`-`20260903180000`) chegaram a `main` via merge e nunca foram aplicadas em produção — drift genuinamente desconhecido e correto em continuar vermelho. Tornar este check required agora bloquearia **todo** merge em `main` até essa iniciativa separada ser resolvida por quem tem contexto de negócio/fiscal sobre ela. Fica como candidato a required assim que esse backlog for zerado — tracked como risco residual no fechamento do Plano Mestre. |

## Como isso é aplicado

Branch protection de `main` configurada via `gh api` (item 11) com
`required_status_checks.contexts` = exatamente a lista "Required" acima,
`strict=false` (não exige branch atualizada com main antes do merge — o repo
já não usa esse modo hoje) e mantendo os campos já ativos
(`enforce_admins=true`, `allow_force_pushes=false`, `allow_deletions=false`).

## Revisão desta política

Reavaliar quando: (a) `migration-remote-drift` voltar a ficar
consistentemente verde (promover a required); (b) `e2e-playwright`/
`e2e-critical` ganharem um dono e critério de estabilidade definido pelo
time de produto.
