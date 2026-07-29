# INCIDENTE — Aliases órfãos servindo build obsoleto em produção

**Data da descoberta:** 2026-07-29
**Descoberto durante:** Fase 2B, investigação de P0-2 (Vercel SSO)
**Classificação:** **P0-crítico** — supera em severidade os 6 P0 do relatório de auditoria
**Status:** documentado. **Nenhuma alteração executada.** Aguardando decisão.

> Este documento existe porque a instrução da Fase 2B é explícita: *"Se encontrar
> algo pior que um P0, interrompa imediatamente e documente antes de alterar
> qualquer coisa."* A investigação de P0-2 parou aqui.

---

## 1. Resumo

O projeto Vercel `pdv-importados` tem **quatro** aliases de produção apontando
para **dois deployments diferentes**. Os dois aliases que um cliente naturalmente
usaria estão **públicos, sem autenticação, e servindo um build de 38 commits
atrás** — enquanto o deployment atual está trancado atrás do SSO da Vercel.

Na prática: **hoje não existe nenhuma URL que entregue o código atual de produção
a um usuário real.**

---

## 2. Evidência

### 2.1 Mapa de aliases (medido em 2026-07-29)

| Alias | Acesso | Deployment servido | Commit |
|---|---|---|---|
| `pdv-importados.vercel.app` | 🔓 **PÚBLICO** | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |
| `v0-pdv-importados.vercel.app` | 🔓 **PÚBLICO** | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |
| `pdv-importados-jinlong.vercel.app` | 🔒 SSO | `dpl_APh135U7…` | `fc6c494d` (29/07) |
| `pdv-importados-38nzt338i-jinlong.vercel.app` | 🔒 SSO | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |

Verificação direta:
```
$ curl -s https://pdv-importados.vercel.app/api/health
{"deploymentId":"dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU",
 "gitSha":"a4edafbf5771fce76bd138089fa2d7800d501554","timestamp":1785354272892}

$ curl -s -o /dev/null -w "%{http_code}" https://pdv-importados-jinlong.vercel.app/api/health
302   → https://vercel.com/sso-api
```

### 2.2 Distância entre o build público e a produção real

```
$ git rev-list --count a4edafbf..main
38
```

O commit `a4edafbf` (*"feat(phase6): consolidação de documentação e governança"*)
é de **2026-07-23**. `main` está **38 commits à frente**.

### 2.3 Por que os aliases divergiram

A API da Vercel mostra a lista de aliases de cada deployment:

- `dpl_7DPHmhdz` (23/07) → `pdv-importados.vercel.app`, `v0-pdv-importados.vercel.app`, `pdv-importados-jinlong.vercel.app`, `pdv-importados-git-main-jinlong.vercel.app`
- `dpl_APh135U7` (29/07) → **apenas** `pdv-importados-jinlong.vercel.app`, `pdv-importados-git-main-jinlong.vercel.app`

Quando o deploy de 29/07 subiu, a Vercel reatribuiu **somente os aliases
auto-gerados** (`-jinlong`, `-git-main-jinlong`). Os aliases atribuídos
manualmente — `pdv-importados.vercel.app` e `v0-pdv-importados.vercel.app` —
**permaneceram fixados no deployment antigo**, que é o comportamento esperado da
plataforma para aliases custom.

O prefixo `v0-` indica origem na integração v0.dev (há branches `v0/*` no remoto).

---

## 3. Por que isto é mais grave que os P0 catalogados

**3.1 — O cliente receberia a URL errada.** `pdv-importados.vercel.app` é a URL
limpa, a que qualquer pessoa escolheria para entregar. Ela serve código de 23/07
e é a única que abre sem login. A URL correta (`-jinlong`) bate num muro de SSO.

**3.2 — O build obsoleto fala com o banco de produção.** As variáveis de ambiente
são do projeto, não do deployment: `NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` do build de 23/07 apontam para
`kbabmewnahysfvlybiak` — o mesmo banco de produção. Código antigo, dados atuais.

**3.3 — Código anterior ao hardening da Fase 1.** As migrations 277–284 foram
aplicadas em **29/07**, seis dias *depois* do build público. Elas revogaram
`EXECUTE` de RPCs para `anon`/`authenticated` (277, 278, 282). O frontend de
23/07 pode chamar RPCs que hoje estão revogadas — resultando em falhas que
ninguém monitora, num host que ninguém sabe que existe.

**3.4 — O gate que existia para detectar exatamente isto estava desligado.** O
SSRA (`release-validate.yml`) compara `deploymentId` da plataforma contra
`/api/health` do runtime. Ele aponta para `PRODUCTION_HOST=pdv-importados.vercel.app`
— o alias órfão. Se rodasse, retornaria:

```
mismatch: platform=dpl_APh135U7… runtime=dpl_7DPHmhdz…
```

O SSRA **não está quebrado — ele detectaria o problema corretamente**. Não roda
desde 2026-07-07 por causa do P0-1 (billing). O drift existe há pelo menos 6 dias
sem ninguém ver, e o mecanismo desenhado para vê-lo estava sem energia.

Esta é a interação que torna o conjunto pior que a soma: **P0-1 cegou o detector,
P0-2 escondeu a produção real, e o alias órfão ficou servindo o público.**

---

## 4. O que NÃO foi feito

Nada foi alterado. Especificamente **não** executei:

- reatribuição de `pdv-importados.vercel.app` para o deployment atual;
- remoção do alias `v0-pdv-importados.vercel.app`;
- alteração de Deployment Protection;
- promoção ou rollback de qualquer deployment.

Motivo: reatribuir alias é mudança de exposição de produção. Se algum cliente,
demo ou integração já usa `pdv-importados.vercel.app`, o comportamento muda
instantaneamente — inclusive para melhor, mas sem aviso. Precisa de decisão.

---

## 5. Opções

### Opção A — Consolidar num único alias público (recomendada)

1. Reatribuir `pdv-importados.vercel.app` → `dpl_APh135U7…` (deployment atual).
2. **Remover** `v0-pdv-importados.vercel.app` — resíduo de integração v0.dev, sem propósito.
3. Manter Deployment Protection **ligada** em `-jinlong` (URLs internas) e desligada
   apenas no alias público consolidado.
4. Corrigir `PRODUCTION_HOST` no SSRA para o alias consolidado.
5. Configurar **alias automático**: garantir que futuros deploys de produção
   reatribuam o alias custom (Vercel: Settings → Domains → marcar o domínio como
   *production domain* do projeto, não alias manual).

**Impacto:** `pdv-importados.vercel.app` passa a servir código atual. Quem usa a
URL hoje recebe a versão nova — é o comportamento desejado, mas é mudança visível.
**Rollback:** reatribuir o alias de volta a `dpl_7DPHmhdz` (o deployment antigo
continua existindo e READY). Reversível em segundos pela UI ou CLI.
**Validação:** `curl -s https://pdv-importados.vercel.app/api/health` deve
retornar `deploymentId` idêntico ao `latestDeployment.id` da API do projeto.

### Opção B — Domínio próprio antes de consolidar

Registrar o domínio definitivo (P1-2), apontá-lo para o deployment atual, e só
então aposentar os `.vercel.app`. Evita mexer duas vezes na URL entregue ao
cliente.

**Custo:** mantém o alias órfão público por mais tempo.
**Mitigação intermediária:** ligar Deployment Protection também em
`pdv-importados.vercel.app` e `v0-pdv-importados.vercel.app` — fecha a exposição
imediatamente sem decidir o destino final.

### Opção C — Fechar tudo agora, decidir depois

Ligar proteção nos dois aliases públicos. Nenhuma URL fica aberta. É a ação de
menor risco e maior reversibilidade se a prioridade for **parar a exposição
hoje**.

---

## 6. Recomendação

**C agora, A em seguida, B quando houver domínio.**

Fechar a exposição não depende de nenhuma outra decisão e é trivialmente
reversível. Consolidar o alias (A) deve vir junto da correção do
`PRODUCTION_HOST` do SSRA, senão o gate continua medindo a superfície errada.

---

## 7. Ação de engenharia associada (independente da decisão)

O SSRA precisa de duas correções, ambas válidas em qualquer das opções:

1. **`PRODUCTION_HOST` deve ser o host que realmente serve produção.** Hoje
   aponta para o alias órfão.
2. **O SSRA precisa alcançar `/api/health` mesmo com Deployment Protection ligada.**
   O caminho suportado pela Vercel é *Protection Bypass for Automation*: um
   secret que o CI envia no header `x-vercel-protection-bypass`. Sem isso, manter
   a proteção ligada implica SSRA permanentemente vermelho.

Ambas estão preparadas mas **não aplicadas**, porque dependem da opção escolhida
em §5 e do secret de bypass, que precisa ser gerado pelo dono da conta.
