# Fase 4: Bloqueador Crítico - Deno TLS/Proxy Issue

**Status:** ⛔ BLOQUEADOR EXTERNO  
**Data:** 2026-07-23  
**Impacto:** Backend (Edge Functions) type-check offline

---

## 🔍 Diagnóstico

### Erro Observado
```
error: Import 'https://esm.sh/@supabase/supabase-js@2.49.1' failed.
  0: error sending request for url (https://esm.sh/@supabase/supabase-js@2.49.1): 
     client error (Connect): unsuccessful tunnel
```

### Tentativas

| Tentativa | Comando | Resultado |
|-----------|---------|-----------|
| 1 | `npm run check:all` | ❌ TLS cert error |
| 2 | `export DENO_CERT=/root/.ccr/ca-bundle.crt && npm run check` | ❌ Tunnel error |
| 3 | `DENO_CERT=... DENO_TLS_CA_STORE=system npm run check:edge` | ❌ Tunnel error |
| 4 | `DENO_CERT=... npx deno check` | ❌ Tunnel error |

### Causa Raiz

[`.ccr/README.md` secção "Tool ignores the proxy entirely"](../../../root/.ccr/README.md):

> Some clients do not read HTTPS_PROXY: Node's built-in fetch, aiohttp, Ruby bundler, hand-rolled Go dialers. **Deno appears to be one of these.**

Deno está tentando fazer CONNECT direto para `esm.sh:443`, mas:
1. Não está usando `HTTPS_PROXY` (127.0.0.1:33433)
2. Está tentando conectar ao host externo diretamente
3. Falha com "unsuccessful tunnel"

### Soluções Testadas & Status

1. ❌ **DENO_CERT** — Deno ignora, problema é tunnel, não cert
2. ❌ **DENO_TLS_CA_STORE=system** — Não funciona sem HTTPS_PROXY
3. ❌ **deno.lock / cache** — Não aplicável (tipo-check precisa das dependências)
4. ⚠️ **Deno proxy flags** — Deno 2.2.2 não tem flags de proxy integradas

---

## 📋 Impacto

### Bloqueado
```
npm run check:all         ❌ (falha em check)
npm run ci                ❌ (falha em check)
GitHub CI workflow        ❌ (bloqueia release)
```

### Não Bloqueado
```
npm run test              ✅ (Vitest, OK)
npm run lint              ✅ (ESLint, OK)
npm run typecheck         ✅ (tsc, OK)
npm run build             ✅ (Next.js, OK)
```

### Severidade para Go-Live
- **CRÍTICA** se Edge Functions têm erros de tipo (risco de deploy quebrado)
- **MÉDIA** se Edge Functions foram validadas manualmente/em produção anterior

---

## 🔧 Alternativas & Mitigações

### Opção A: Workaround Local (Deno Import Map)
```bash
# Criar deno.lock / import_map.json com dependências pré-cachadas
# Converter import map para Deno manifest
# Requires: deno.lock ou espelho local
```
**Status:** ⏱️ Complexo, não testado

### Opção B: Skip Deno Check no CI (Temporário)
```bash
# backend/package.json
"check": "echo 'SKIPPED: Deno proxy issue, see FASE_4_BLOQUEADOR_DENO_TLS.md'"
```
**Status:** ✅ Fácil, mas mascara problemas

### Opção C: Type-Check Manualmente em Staging/Prod
```bash
# Quando Edge Functions forem deployed:
npm run validate:production  # SSRA validation pós-deploy
npm run test:e2e:critical   # smoke end-to-end
```
**Status:** ✅ Viável se Edge Functions já foram validadas

### Opção D: Contatar Administrador (Recomendado)
Report ao Anthropic Support:
- Tool: Deno 2.2.2
- Issue: Não lê HTTPS_PROXY, tenta CONNECT direto
- Proxy: Claude Code agent proxy (ccr-agent-proxy)
- Workaround: Não há built-in; precisa suporte de proxy-side

**Status:** 📞 Escalação externa

---

## 📌 Decisão para Fase 4

### Plano Executivo
1. **Prosseguir com missões não-bloqueadas** ✅
   - Missão 4.2: Fortalecer unit tests (pdv-importados)
   - Missão 4.4: E2E & smoke (Playwright)
   - Missão 4.5: Production gate validation

2. **Validar Edge Functions manualmente** ⚠️
   - Review código `backend/supabase/functions/`
   - Verificar tipos via IDE (VS Code/Cursor)
   - Quando deployed, rodar `npm run validate:production`

3. **Criar task de mitigação** 📋
   - Title: "Fix: Deno proxy support for esm.sh imports"
   - Depends on: Admin/Anthropic fix ou workaround descoberto

### Impacto na Timeline
- **Missão 4.1 (Auditoria):** 80% completa (falta backend Deno check)
- **Missão 4.2-4.6:** Prosseguem normalmente
- **Go-Live Readiness:** Não é bloqueador se Edge Functions já foram validadas

---

## 🚀 Próximos Passos Recomendados

### Hoje (Fase 4, Missão 4.2)
- [ ] Prosseguir com unit tests web + desktop
- [ ] Docuementar Edge Functions como "type-checked manualmente"

### Curto Prazo (1-2 dias)
- [ ] Contatar Anthropic Support (opção D)
- [ ] Se resposta: implementar workaround

### Médio Prazo (Pré-deploy)
- [ ] Revalidar Edge Functions em staging
- [ ] Rodar `npm run validate:production` pós-deploy

---

## 📚 Referências

- [.ccr/README.md — Proxy Diagnostics](../../../root/.ccr/README.md)
- [Deno Manual — Imports & Dependencies](https://docs.deno.com/runtime/reference/cli/deno_check/)
- [esm.sh — CDN para módulos Deno](https://esm.sh)
- Proxy status: `curl -sS http://127.0.0.1:33433/__agentproxy/status`

---

**Recomendação:** Escalar (Opção D) + prosseguir com otras missões (sem bloqueio total).
