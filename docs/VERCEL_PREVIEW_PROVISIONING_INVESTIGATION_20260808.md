# Investigação Vercel — Preview em ERROR (2026-08-08)

**Projeto:** `pdv-importados` (`prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO`)  
**Team:** NatureCode / `jinlong` (`team_C1mGhbvpvDlAAEm05epmTKR0`)  
**Branch em foco:** `cursor/fechamento-ui-ux-633a`  
**Método:** API Vercel (MCP) + config no repositório + comparação de deployments. **Sem alteração de env de produção, Supabase ou painel.**

---

## 1. Veredito

| Pergunta | Resposta |
|----------|----------|
| Falha é `next build` / TypeScript? | **Não** — o build **nunca inicia** na Vercel. |
| Falha é Root Directory / `npm ci`? | **Não evidenciado** — último deploy OK usou `npm ci` + `next build` com sucesso (~2 min). |
| Falha é commit específico (14b73bd, 4b73a2d, …)? | **Não** — commits **só docs** também falham igual; padrão é **global desde ~2026-08-07**. |
| Classe da falha | **Pré-build:** `BUILD_FAILED` + `Resource provisioning failed` (~600–700 ms, **zero linhas de log**). |
| Correção via código no repo? | **Não comprovada** nesta investigação — exige **painel Vercel** (integrações / backend do projeto / billing) ou **suporte Vercel**. |

---

## 2. Configuração (medida + documentada)

### 2.1 Painel Vercel (referência `docs/GO_LIVE_FASE2_RELATORIO_FINAL.md`, jul/2026)

| Campo | Valor documentado |
|-------|-------------------|
| Framework | Next.js |
| **Root Directory** | `pdv-importados` |
| Install Command | `npm ci` |
| Build Command | (default / `npm run build` no workspace) |
| Output Directory | `.next` (relativo a `pdv-importados`) |
| Node.js | **24.x** (API projeto) |
| Região (funções) | `gru1` (`pdv-importados/vercel.json`) |
| `project.live` | `false` (produção não “live” no sentido Vercel; **não** explica log vazio) |

### 2.2 Repositório (monorepo)

| Artefato | Conteúdo relevante |
|----------|-------------------|
| Raiz `package.json` | workspaces: `pdv-importados`, `pdv-local`, `backend`, `shared-core`; `build` → `turbo run build --filter=pdv-importados` |
| Raiz `vercel.json` | `installCommand: npm ci`, `buildCommand: npm run build`, `outputDirectory: .next` — alinhado à **Opção A** em `docs/DEPLOY_VERCEL.md` (**só aplica se Root Directory = `.`** no painel) |
| `pdv-importados/vercel.json` | `"regions": ["gru1"]` |
| `.nvmrc` (raiz) | `20` (painel reporta Node **24.x** — divergência conhecida, **não** explica falha instantânea sem log) |
| `package-lock.json` | **Só na raiz** (correto para workspaces) |
| CI | `.github/workflows/ci-pdv-importados.yml` — **não faz deploy**; deploy só via GitHub App Vercel |

**Opção B (legado painel):** `docs/DEPLOY_VERCEL.md` recomenda `Install: cd .. && npm ci` se Root = `pdv-importados`. O último deploy **OK** rodou `npm ci` **sem** `cd ..` e instalou pacotes — comportamento aceito pelo npm workspaces.

---

## 3. Deployments analisados (SHAs pedidos)

Todos com o **mesmo** par `errorCode` / `errorMessage` e **sem build logs**:

| Commit (curto) | Deployment ID | Branch | Estado | Δ ready−building |
|----------------|---------------|--------|--------|------------------|
| `14b73bdc` | `dpl_F5Xpdtavyo3B42YKYZuu78UdKSZr` | `cursor/fechamento-ui-ux-633a` | ERROR | ~689 ms |
| `4b73a2dc` | `dpl_EuPF4WNBwDjguyFBLb9ezNvfw9RC` | `cursor/fechamento-ui-ux-633a` | ERROR | ~ms |
| `e362c389` | `dpl_39DDuYTczrtJ1YkQXnhiH6APvLWv` | `cursor/reconciliacao-supabase-audit-633a` | ERROR | ~575 ms |
| `25a155ab` | `dpl_5j3mYvCEw3E47Zw7459ubQ6KPQE8` | `cursor/reconciliacao-supabase-audit-633a` | ERROR | ~ms |
| `6e3f9f79` | `dpl_CKNGytiAN5W1QC3hNCe8YNZ5c1Zx` | `cursor/estoque-compras-admin-v2-633a` | ERROR | ~ms |

**Mensagem exata (API):** `errorMessage: "Resource provisioning failed"`, `errorCode: "BUILD_FAILED"`.

---

## 4. Último deployment saudável (comparação)

| Campo | Último **READY** | Deployments **ERROR** (atual) |
|-------|------------------|-------------------------------|
| ID | `dpl_4znhvKr7EGUMUvZacJZQZGpe6UP3` | ex. `dpl_F5Xpdt…` |
| Commit | `826b52d2` (docs migrations/UI audit) | vários (UI, docs, Supabase audit) |
| Data (API ms) | `1786065421665` | ≥ `1786132919926` |
| Duração até ready | **~170 s** (build real) | **~0,7 s** |
| Build logs | Sim — clone, `npm ci`, `next build`, deploy | **Nenhum evento** |
| Região deploy | `gru1` | `gru1` |
| Build machine (log) | **Washington iad1**, 4 cores / 8 GB | (não chega a alocar) |

Trecho do log OK (início):

```text
Running build in Washington, D.C., USA (East) – iad1
Running "install" command: `npm ci`...
Running "npm run build" > next build
Build Completed in /vercel/output [2m]
Deployment completed
```

**Conclusão:** a configuração que **funcionou** em `826b52d2` é a mesma família (Root `pdv-importados`, `npm ci`, Next 15). A regressão **não** correlaciona com diff de aplicação nos SHAs listados.

---

## 5. Causa raiz provável (evidência externa + sintoma)

Padrão idêntico ao documentado na [comunidade Vercel](https://community.vercel.com/t/vercel-deployments-failing-with-resource-provisioning-failed-and-0ms-build-time/32451):

1. **Integrações de marketplace** (Supabase / Neon / Upstash / etc.) falham na fase **“Provisioning Integrations”** **antes** do clone/build → log vazio.
2. **Configuração legacy do backend do projeto** incompatível com o plano (ex.: `functionDefaultTimeout`, Fluid / Active CPU) após downgrade — ver [tópico Hobby + legacy backend](https://community.vercel.com/t/hobby-project-stuck-on-resource-provisioning-failed-legacy-backend-settings/42915).

**Checagens feitas nesta sessão:**

| Hipótese | Resultado |
|----------|-----------|
| Supabase `jinlong` pausado | **Descartada** — MCP: `ACTIVE_HEALTHY`, 1 branch |
| Limite de branches Supabase | **Descartada** — 1/10 |
| `GerenteTable` / build local | **Irrelevante** — build local verde; Vercel não compila |
| GitHub billing (Actions) | **Paralelo** — CI pode estar parado; **não** impede Git push → Vercel hook |

**Não medido via API (requer dono no painel):** integrações Vercel conectadas, Build Machine / Fluid Compute, spending limit **da conta Vercel**, cache de build corrompido (695 MB no último OK).

---

## 6. Ações manuais recomendadas (ordem)

1. **Vercel → Team `jinlong` → Settings → Billing**  
   - Confirmar pagamento / spending limit (mesma classe de problema que GitHub Actions P0-1, mas **conta Vercel**).

2. **Vercel → Project `pdv-importados` → Settings → Integrations**  
   - Listar integrações (Supabase, Sentry, Upstash, …).  
   - Se existir **Supabase Integration** com provisionamento por Preview: **reautenticar**, **desconectar** (env vars manuais já documentadas) ou corrigir recurso upstream.  
   - Redeploy de um commit conhecido (`826b52d2` ou `main`).

3. **Settings → General → Build & Development**  
   - **Build Machine:** padrão do plano (não Enhanced incompatível).  
   - **Node.js:** alinhar com `.nvmrc` / CI (**22** em Actions, **20** em `.nvmrc`) — **só após** provisioning voltar; não é a causa do log zero.  
   - **Clear Build Cache** (último cache ~696 MB no deploy OK).

4. **Settings → Functions** (se disponível)  
   - Verificar timeout default / Fluid; se projeto já teve Pro e caiu para Hobby, pedir suporte para limpar flags backend (`isUsingActiveCPU`, `SKIP_NAMESPACE_QUEUE`) — padrão community #42915.

5. **Suporte Vercel** (se 1–4 não resolverem em 1 redeploy)  
   - Enviar IDs: `dpl_F5Xpdtavyo3B42YKYZuu78UdKSZr`, `dpl_4znhvKr7EGUMUvZacJZQZGpe6UP3`, mensagem `Resource provisioning failed`, zero logs.  
   - Pedir detalhe da fase **Provisioning Integrations** / backend settings.

6. **Validação pós-correção**  
   - Deployment **Ready** + URL Preview (SSO: `ssoProtection.enabled: true` — usar share link ou login team).  
   - `GET /api/health` na URL Preview.  
   - Gates locais inalterados: `typecheck`, `lint`, `test`, `check:ds-sprint0`, `check:entity-ssot`, `build`.

---

## 7. O que **não** fazer (pedido explícito)

- Não alterar Node para 24 “só para testar” no repo.  
- Não mudar Root Directory sem confirmar no painel.  
- Não rotacionar / expor secrets de produção.  
- Não `db push`, migration, repair ou DDL Supabase.  
- Não continuar sprint UI/UX até Preview **Ready** ponta a ponta.

---

## 8. Estado desta missão

| Critério | Status |
|----------|--------|
| Causa identificada com log de build | **Parcial** — classe **provisioning**; subcausa exata **no painel/suporte** |
| Correção commitada no repo | **Nenhuma** (sem causa comprovada em código) |
| Preview Ready + app acessível | **Bloqueado** — aguarda ação manual §6 |

**Próximo passo operacional:** executar §6 (1–2) no painel; após um deploy **Ready**, retomar UI/UX (`/admin/vendas`).
