# CI Diagnostics System

Novo sistema de diagnóstico de CI para distinguir **FAIL DE CÓDIGO** vs **FAIL DE INFRA**.

## Problema original

- Logs remotos sempre 404 — impossível ver o que falhou
- Tentativas de recuperação sem evidência: "deve ser sistêmico", "deve ser proxy"
- Sem observabilidade, não há como provar execução completa
- Risco: código quebrado mascarado como "ambiente"

## Solução: 3 Layer de Diagnóstico

### Layer 1: `ci-execution-tracer` agent

**Função**: Validar que cada step crítico está **instrumentado** (registra execução).

**Métrica**: Score 0-100% — quantos steps têm:
- ✅ timestamp (`date +%s%3N`)
- ✅ captura de exit code (`PIPESTATUS` ou `EXIT=$?`)
- ✅ amostragem de stdout (`tail -20`)

**Exemplo de output**:
```json
{
  "agent": "ci-execution-tracer",
  "score": 100,
  "hasCompletionMarker": true,
  "instrumentedCount": 8,
  "totalCritical": 8,
  "criticalSteps": [
    { "name": "npm ci", "instrumented": true },
    { "name": "typecheck", "instrumented": true },
    ...
  ]
}
```

**Interpretação**:
- Score = 100 → pipeline está completamente documentado
- Score < 100 → alguns steps não têm TRACE (impossível saber onde pararam)
- `hasCompletionMarker=false` → job abortou antes de `CI_EXECUTION_COMPLETE`

### Layer 2: `ci-failure-classifier` agent

**Função**: Rodar checks locais e classificar automaticamente o tipo de falha.

**Checks executados**:
1. `node --version` — valida runtime
2. `npm ci --dry-run` — valida lockfile / postinstall
3. `npm run guard:all` — validates architecture
4. `tsc --noEmit` — valida TypeScript (rápido, sem emit)
5. `eslint <sample>` — valida config e parser

**Classificação automática**:

| Categoria | O quê | Exemplos |
|-----------|-------|----------|
| `PASS` | Sem falha | exit code 0 |
| `REAL_CODE_BUG` | Bug no código | erro TS, falha de lint, teste falhando |
| `DEPENDENCY_FAILURE` | npm/lockfile quebrado | postinstall falhou, EINTEGRITY |
| `ENVIRONMENT_FAILURE` | Runner sem ferramentas | node not found, binário nativo ausente, permissão |
| `PIPELINE_ABORT` | Execução cancelada | SIGTERM, timeout, workflow cancelado |

**Exemplo de output**:
```json
{
  "agent": "ci-failure-classifier",
  "sha": "abc123",
  "canMerge": true,
  "checks": [
    {
      "command": "node --version",
      "category": "PASS",
      "exitCode": 0,
      "evidence": "v22.22.2"
    },
    {
      "command": "npm ci --dry-run",
      "category": "DEPENDENCY_FAILURE",
      "exitCode": 1,
      "evidence": "sentry CDN bloqueado (SENTRYCLI_SKIP_DOWNLOAD?)"
    }
  ],
  "categorySummary": {
    "PASS": 2,
    "REAL_CODE_BUG": 0,
    "ENVIRONMENT_FAILURE": 0,
    "DEPENDENCY_FAILURE": 1,
    "PIPELINE_ABORT": 0
  },
  "canMerge": false
}
```

**Interpretação**:
- `canMerge=true` → sem REAL_CODE_BUG e sem PIPELINE_ABORT
- Qualquer REAL_CODE_BUG = bloqueia merge (bug genuíno)
- ENVIRONMENT_FAILURE ou DEPENDENCY_FAILURE = não bloqueia mas é diagnóstico

### Layer 3: `.github/workflows/ci-core.yml` Instrumentation

**Cada step crítico agora tem TRACE**:

```yaml
- name: 'TRACE: npm ci'
  run: |
    set +e
    TRACE_START=$(date +%s%3N)
    npm ci --no-audit 2>&1 | tee /tmp/npm-ci.log
    TRACE_EXIT=${PIPESTATUS[0]}
    TRACE_END=$(date +%s%3N)
    TRACE_DUR=$((TRACE_END - TRACE_START))
    echo ""
    echo "[TRACE] npm ci | exit=$TRACE_EXIT | dur=${TRACE_DUR}ms"
    tail -20 /tmp/npm-ci.log
    exit $TRACE_EXIT
```

**Marker obrigatório no final**:
```yaml
- name: 'CI_EXECUTION_COMPLETE'
  if: always()
  run: echo "CI_EXECUTION_COMPLETE: job finished"
```

Se `CI_EXECUTION_COMPLETE` NÃO aparecer nos logs → **job abortou incompleto**.

## Como usar

### 1. Na PR — diagnóstico automático

Todos os agentes rodam na CI e postam resultado como comentário no GitHub:

```
## 🤖 Agent Analysis Report

### 🟢 `ci-failure-classifier`
**Diagnóstico**: Pode mergear (código OK)
SHA: `abc1234567` | Checks: 5

| Check | Categoria | Exit | Duração | Evidência |
|-------|-----------|------|---------|-----------|
| node --version | ✅ PASS | 0 | 0.2s | v22.22.2 |
| npm ci --dry-run | ✅ PASS | 0 | 12.5s | sucesso |
| guard:all | ✅ PASS | 0 | 8.3s | 7 guards OK |
| tsc --noEmit | ✅ PASS | 0 | 18.2s | sem erros |
| eslint (sample) | ✅ PASS | 0 | 5.1s | config OK |

### 🟢 `ci-execution-tracer`
Instrumentação: **8/8** steps (100%)
Marker completo: ✅ CI_EXECUTION_COMPLETE
```

### 2. Debug remoto — ativar `ci_debug=true`

**Actions → CI core → Run workflow → ci_debug=true**

Executa apenas modo leve (sem testes completos, sem build pesado):
```yaml
- checkout
- node --version
- npm ci
- guard:all (validação rápida)
```

Objetivo: **se falha até aqui, é INFRA; se passa, é os testes que têm problema**.

### 3. Lendo um diagnóstico falho

**Se `canMerge=false` e classificação mostra REAL_CODE_BUG**:
```
{
  "command": "tsc --noEmit",
  "category": "REAL_CODE_BUG",
  "evidence": "error TS1234: Property 'foo' not found on type 'Bar'"
}
```
→ **Bug de código genuíno**. Consertar localmente, re-testar `npm run lint typecheck test`, push.

**Se `canMerge=false` mas classificação mostra ENVIRONMENT_FAILURE**:
```
{
  "command": "npm ci --dry-run",
  "category": "ENVIRONMENT_FAILURE",
  "evidence": "ENOENT: node-gyp binary missing"
}
```
→ **Problema de ambiente, não de código**. Código está OK.

**Se CI_EXECUTION_COMPLETE não aparece no log remoto**:
→ **Job abortou incompleto**. Inspecionar se runner crashou ou timeout.

## Regras críticas agora enforced

❌ **Não aceitar "sistêmico" sem evidência**:
- Se `ci-execution-tracer` score=100 e `CI_EXECUTION_COMPLETE` presente → pipeline rodou completo
- Se ambos OK mas `ci-failure-classifier` mostra ENVIRONMENT_FAILURE → é infra, não código

❌ **Não inferir causa sem observabilidade**:
- Cada step tem TRACE de timestamp, exit code, duração, stdout amostra
- Log remoto sempre deve mostrar `[TRACE] <comando> | exit=X | dur=Yms`

❌ **Não marcar CI como irrelevante sem evidência**:
- Se marker falta → pipeline incompleto → **problema real**
- Se marker presente mas falha → diagnosticar via classifier

## Implementação técnica

### Agentes (agents/)

- `ci-execution-tracer.ts` — lê workflow YAML, valida sintaxe de TRACE
- `ci-failure-classifier.ts` — executa checks locais, classifica falhas
- `runner.ts` — chama ambos, posta resultado no PR

### Workflow (ci-core.yml)

- Cada step tem `name: 'TRACE: <comando>'`
- TRACE wrappe: `TRACE_START`, `TRACE_EXIT`, tail de output
- Marker final: `CI_EXECUTION_COMPLETE` (sempre executado via `if: always()`)

### Modo debug

- `workflow_dispatch` com input `ci_debug=boolean`
- Steps ficam `if: ${{ inputs.ci_debug != true }}` (pula em debug mode)
- Executa apenas setup + validação rápida

## Próximos passos

1. Deixar executar um ciclo completo de CI com nova instrumentação
2. Coletar dados de canMerge + categoria de classificação
3. Se score < 100 ou marker falta → investigar que step está incompleto
4. Quando tudo passar com 100%: confiar que código que passa CI é seguro

---

> Sistema projetado para **eliminar suposições**, documentar cada passo, classificar falhas automaticamente e permitir diagnóstico objetivo sem logs centralizados.
