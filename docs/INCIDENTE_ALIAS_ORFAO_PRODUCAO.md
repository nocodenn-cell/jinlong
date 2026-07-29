# Alias de produção pinado em build obsoleto — reconfirmação e estado atual

**Data da medição:** 2026-07-29
**Contexto:** Fase 2B, investigação de P0-2 (Vercel SSO)
**Classificação:** **P0** — mesma severidade dos demais P0 do relatório
**Status:** medido e confirmado em aberto. **Nenhuma alteração executada.**

---

## 0. Correção de registro

A primeira versão deste documento classificou o achado como *"pior que um P0"* e
como descoberta nova. **Ambas as afirmações estavam erradas.**

O problema já estava identificado e documentado antes desta sessão:

| Registro | Identificador | Texto |
|---|---|---|
| `docs/GO_LIVE_BLOCKERS.md:17` | **B-4** | *"Produção defasada. `pdv-importados.vercel.app` serve `dpl_7DPHmhdz…` (`a4edafbf`, 23/07)"* |
| `docs/PLANO_REMEDIACAO_CICD.md:28` | **N1** | *"Produção está servindo código de 23/07 … o alias de produção nunca migrou"* — já classificado 🔴 **P0** |
| `docs/CICD_FINAL_STATE.md:103` | **V1** | *"pinado em `dpl_7DPHmhdz…` … Cliente usa versão defasada"* |
| `docs/ENCERRAMENTO_CICD_GO_NOGO.md:262` | — | mesma medição, com evidência de `/api/health` |

O alias `v0-pdv-importados.vercel.app` também já aparece em
`docs/PLANO_REMEDIACAO_CICD.md`. Nada aqui é inédito.

O que esta sessão acrescenta é **o estado atual medido** e **uma interação nova**
descrita em §3.

---

## 1. Estado medido em 2026-07-29

| Alias | Acesso | Deployment | Commit |
|---|---|---|---|
| `pdv-importados.vercel.app` | 🔓 público | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |
| `v0-pdv-importados.vercel.app` | 🔓 público | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |
| `pdv-importados-jinlong.vercel.app` | 🔒 SSO | `dpl_APh135U7…` | `fc6c494d` (29/07) |
| `pdv-importados-38nzt338i-jinlong.vercel.app` | 🔒 SSO | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |

```
$ curl -s https://pdv-importados.vercel.app/api/health
{"deploymentId":"dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU",
 "gitSha":"a4edafbf5771fce76bd138089fa2d7800d501554","timestamp":1785354272892}

$ git rev-list --count a4edafbf..main
38
```

**B-4/N1 continua aberto.** A distância cresceu de "dois PRs" para **38 commits**.

### Causa

A API da Vercel mostra que `dpl_7DPHmhdz` retém `pdv-importados.vercel.app` e
`v0-pdv-importados.vercel.app`, enquanto `dpl_APh135U7` recebeu apenas
`-jinlong` e `-git-main-jinlong`. A Vercel reatribui automaticamente só os
aliases auto-gerados; aliases custom permanecem fixados onde foram postos.

---

## 2. Severidade — avaliação honesta

**Não é vazamento de dados.** A raiz do host obsoleto responde 307 e redireciona
para login; o acesso continua exigindo autenticação Supabase, e o banco recebeu
o hardening da Fase 1 (migrations 277–284) que vale para **qualquer** build que
o consulte. O que `/api/health` expõe publicamente é `deploymentId` e `gitSha` —
divulgação de informação de baixo impacto.

**É problema de correção e de operação:**

- O cliente receberia código de 23/07 se usasse a URL limpa.
- O build de 23/07 é anterior às revogações de `EXECUTE` das migrations 277/278/282;
  pode chamar RPCs hoje revogadas e falhar de formas que ninguém observa.
- Não há hoje URL alguma que sirva o código atual a um usuário real.

---

## 3. O que é novo nesta medição

**A produção correta está atrás de SSO enquanto a obsoleta está aberta.**

Nos registros anteriores (B-4/N1), o problema era "o alias aponta para deployment
antigo". Agora soma-se: o deployment **novo** só responde em `-jinlong`, que está
protegido por Vercel Authentication. A combinação produz um estado em que as duas
saídas estão erradas — a aberta serve código velho, a atualizada não abre.

**Consequência para o SSRA.** `release-validate.yml` define
`PRODUCTION_HOST=pdv-importados.vercel.app` — o alias pinado. Quando o CI voltar
(P0-1), o gate comparará `platform=dpl_APh135U7…` contra `runtime=dpl_7DPHmhdz…`
e falhará. **Isso é o gate funcionando como projetado**, não um defeito: ele
existe exatamente para detectar este drift. Ele não roda desde 2026-07-07 por
causa do billing, e por isso o desvio seguiu invisível.

Se a proteção SSO for mantida no host que o SSRA mede, será necessário
*Protection Bypass for Automation* (header `x-vercel-protection-bypass`), senão
o gate fica vermelho por não conseguir ler `/api/health`.

---

## 4. O que NÃO foi feito

Nada foi alterado na Vercel. Não executei reatribuição de alias, remoção de
alias, mudança de Deployment Protection, nem promoção/rollback de deployment.

Limitação técnica registrada: o Vercel CLI expõe `alias list|set|remove`, mas
**não** expõe controle de Deployment Protection — isso é dashboard ou API com
token de conta, fora do que consigo executar aqui.

---

## 5. Opções

### Opção A — Consolidar no deployment atual (recomendada)

1. `pdv-importados.vercel.app` → `dpl_APh135U7…`.
2. Remover `v0-pdv-importados.vercel.app` (resíduo de integração v0.dev).
3. Promover o host a *production domain* do projeto, para que futuros deploys
   reatribuam o alias automaticamente — sem isso o problema volta no próximo deploy.
4. Manter `PRODUCTION_HOST` do SSRA apontando para ele.

**Impacto:** a URL pública passa a servir código atual — que é o objetivo.
**Rollback:** `vercel alias set dpl_7DPHmhdz… pdv-importados.vercel.app`; o
deployment antigo continua READY. Reversível em segundos.
**Validação:** `/api/health` do alias === `latestDeployment.id` da API do projeto.

### Opção B — Fechar a exposição primeiro

Ligar Deployment Protection nos dois aliases públicos. Para a exposição, mas
**não resolve B-4**: continua sem URL servindo código atual, e o SSRA continua
medindo a superfície errada. É paliativo, não correção.

### Opção C — Domínio próprio

Registrar o domínio definitivo (P1-2) e apontá-lo para o deployment atual, depois
aposentar os `.vercel.app`. Melhor destino final; mantém B-4 aberto enquanto não
houver domínio.

---

## 6. Recomendação revisada

**Opção A.** A escolha registrada na sessão foi "fechar agora, consolidar depois"
(Opção B), mas essa preferência foi manifestada sob a premissa — que eu havia
apresentado incorretamente — de que se tratava de exposição de dados. Com a
severidade corrigida (§2), fechar tem pouco ganho de segurança e mantém o
bloqueador principal em aberto: **continuaria não existindo URL que entregue o
código atual ao cliente.**

Consolidar (A) resolve B-4, destrava o SSRA e é revertível em segundos. O passo 3
é o que impede a recorrência — sem ele, o alias volta a ficar para trás no
próximo deploy.

Decisão pendente de reconfirmação, agora com a severidade correta.
