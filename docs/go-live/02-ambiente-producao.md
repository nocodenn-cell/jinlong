# 02 — Ambiente de produção

Estado verificado em **2026-08-17** por consulta somente leitura ao projeto Supabase e pelo
repositório. Voltar ao [plano](00-README.md).

---

## 1. Topologia real

| Recurso | Valor |
|---|---|
| **Web (produção canônica)** | https://pdv-importados.vercel.app |
| **Projeto Vercel** | `pdv-importados` (team `jinlong`) |
| **Região Vercel** | `gru1` (São Paulo) — `pdv-importados/vercel.json` |
| **Projeto Supabase** | `jinlong` — ref `kbabmewnahysfvlybiak` |
| **Timezone de relatórios** | `America/Sao_Paulo` |

> ## ⚠️ NÃO EXISTE STAGING
>
> Um **único** projeto Supabase atende produção, Preview da Vercel e os testes E2E. Não há ambiente
> intermediário onde ensaiar uma migration com segurança. Toda validação de banco descrita em
> [06-validacao-pre-go-live.md](06-validacao-pre-go-live.md) usa **`supabase db reset --local`**,
> que é local e descartável — nunca o projeto remoto.

O `vercel.json` da **raiz** do monorepo não é o que vale para o deploy; vale o de
`pdv-importados/`. O da raiz é código morto para efeito de build.

## 2. Edge Functions em produção

Estado real consultado em 2026-08-17:

| Função | Versão | `verify_jwt` | Status |
|---|---|---|---|
| `sync-outbox` | 70 | `false` | ACTIVE |
| `validar-gerente` | 45 | `true` | ACTIVE |
| `fiscal-worker` | 37 | `false` | ACTIVE |

`sync-outbox` e `fiscal-worker` têm `verify_jwt: false` **por desenho** — autenticam por chave
própria (`SYNC_KEY`, `FISCAL_WORKER_KEY`), não por JWT de usuário. Confirmar que essas chaves são
fortes é parte de [01-pre-requisitos.md](01-pre-requisitos.md) §4.3.

> **Observação de proveniência.** Os `entrypoint_path` registrados apontam para caminhos de máquinas
> distintas (`file:///fastproduct/...`, `file:///Naturecode/fastproduct/...`, `/tmp/user_fn_...`).
> Isso indica que as três funções **não foram publicadas do mesmo lugar nem no mesmo fluxo**. Não é
> defeito por si só, mas significa que não há prova de que o código em produção corresponde ao da
> branch. Fechar isso é o objetivo do redeploy descrito em [03-deploy-backend.md](03-deploy-backend.md).

## 3. Achados de segurança — advisors do Supabase

75 avisos de segurança na consulta de 2026-08-17. Resumo:

| Nível | Categoria | Qtd. | Ação |
|---|---|---|---|
| WARN | `authenticated_security_definer_function_executable` | 64 | **Por desenho** — RPCs `SECURITY DEFINER` com guardas internas de loja/perfil. Não agir. |
| WARN | `anon_security_definer_function_executable` | **2** | 🟠 **Corrigir antes do cliente** |
| WARN | `function_search_path_mutable` | 4 | 🟡 Avaliar |
| WARN | `auth_leaked_password_protection` | 1 | 🟡 Habilitar |
| INFO | `rls_enabled_no_policy` | 4 | 🟢 Revisar, provavelmente aceitável |

### 3.1 🟠 `anon` executa duas RPCs `SECURITY DEFINER`

```
public.converter_venda_em_espera(p_id uuid)
public.devolver_venda_em_espera(p_id uuid)
```

Ambas expostas ao papel **`anon`** via `/rest/v1/rpc/…`. São operações sobre venda em espera — não
deveriam ser alcançáveis sem autenticação. Existe migration anterior de revogação para `anon`
(`20260718133633_revoke_anon_pdv_rpcs_and_fix_diag`), mas estas duas ficaram de fora.

**Não existe migration no repositório que feche isso.** É pendência nova, identificada nesta análise
— registrada em [06-validacao-pre-go-live.md](06-validacao-pre-go-live.md) §Lacunas. A correção é uma
migration com `REVOKE EXECUTE … FROM anon`, seguindo o padrão das migrations `277`/`278`.

### 3.2 🟡 `search_path` mutável em 4 funções

```
public.venda_evento_idempotency_key
public.finalizar_venda_transacional_canonica_v2
public.finalizar_venda_transacional_canonica_v3
public.finalizar_venda_transacional
```

As três últimas são **assinaturas legadas** já bloqueadas por migrations de stub
(`20260619234314`, `20260620004913`, `20260620020436`). O risco prático é baixo porque não são o
caminho canônico — a v4 é. `venda_evento_idempotency_key` merece verificação própria.

### 3.3 🟡 Proteção contra senha vazada desabilitada

`auth_leaked_password_protection` está desligado. Com cliente pagante e operadores reais, habilitar
no painel Supabase Auth é recomendado e não exige mudança de código.

### 3.4 🟢 RLS habilitado sem policy (4 tabelas)

```
public._backup_schema_migrations_20260802
public.gerente_auth_attempts
public.gerente_auth_rate_limits
public.produto_create_requests
```

RLS ligado **sem policy** significa negar tudo para `authenticated`/`anon` — postura fechada, não
aberta. As três últimas são acessadas por funções `SECURITY DEFINER`, o que é consistente.
`_backup_schema_migrations_20260802` é tabela de backup e candidata a remoção pós-Go-Live.

## 4. Flags de produção a conferir

| Variável | Valor esperado | Porquê |
|---|---|---|
| `NEXT_PUBLIC_DEBUG_MODE` | `false` | não vazar diagnóstico ao operador |
| `STRICT_MANAGER_DISCOUNT_AUTH` | `true` | exige token de gerente para desconto |
| `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` | **decidir** | `0` = sem logout automático; num balcão real, considerar valor > 0 |
| `FISCAL_DEFAULT_DOC_TYPE` | `NFC_E_STUB` | **fiscal é stub** — ver §5 |
| `NEXT_PUBLIC_CAIXA_SCAN_TELEMETRY_SAMPLE_RATE` | `0` ou baixo | custo/ruído |

## 5. Fiscal é stub — comunicar ao cliente

O módulo fiscal **não emite documento fiscal real**. `FISCAL_DEFAULT_DOC_TYPE=NFC_E_STUB` e a
auditoria (§8.3 do relatório) classifica a operação fiscal como
`NÃO COMPROVADO para operação fiscal real`. O `fiscal-worker` processa uma fila, mas a emissão
verdadeira não está certificada.

**Isto precisa estar explícito no acordo com o primeiro cliente pagante.** Ver
[09-primeiro-cliente.md](09-primeiro-cliente.md) §Limites a comunicar.

## 6. Checklist de saída

- [ ] Confirmado que não há staging e que todo teste remoto atinge produção
- [ ] 3 Edge Functions ACTIVE
- [ ] Decisão tomada sobre `converter_venda_em_espera` / `devolver_venda_em_espera` expostas a `anon`
- [ ] `auth_leaked_password_protection` habilitado (ou risco aceito por escrito)
- [ ] Flags de produção conferidas na Vercel
- [ ] Cliente informado de que o fiscal é stub

→ Próximo: [03-deploy-backend.md](03-deploy-backend.md)
