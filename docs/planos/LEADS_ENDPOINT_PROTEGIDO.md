# Endpoint protegido do formulário de demonstração (commercial_leads)

Status: **desenho e testes unitários na branch `claude/leads-endpoint-protegido-11f6f2`. Nada aplicado em produção.**
Escopo: `site` (POST `/pedido-demo`) e as migrations `20261104150000`, `20261104160000`, `20261104170000`.
Data: 2026-11-07.

## 1. Problema

- O formulário público (`site/components/TrialForm.tsx`) envia o pedido para `POST /pedido-demo` (route handler do site).
- O route handler (`site/app/pedido-demo/route.ts`) chama a RPC `public.registrar_lead_comercial` via REST com a chave anon
  (`site/lib/demoRequest.ts`, `supabaseDemoStore`).
- A tabela `commercial_leads` não aceita escrita de `anon` (migration `20261104120000`). O único caminho público é a RPC.
- As três migrations da RPC estão **adiadas** em `.github/deploy-governance/deferred-migrations.json` e não estão em produção.

## 2. Estado verificado (2026-11-07)

| Item | Situação |
|---|---|
| Idempotência | Já no banco (`160000`): índice único parcial em `idempotency_key`, `ON CONFLICT DO NOTHING`, hash do conteúdo para detectar chave reutilizada (`LEAD_CHAVE_REUTILIZADA`). Concorrência resolvida pelo banco. |
| Limite de taxa | No banco (`170000`): 10 tentativas por bucket de 10 min, bucket = sha256(salt + IP). Checagem dentro da RPC, então vale para qualquer chamada. |
| Validação | Duplicada no banco (`150000`/`160000`) e no servidor (`validateDemoRequest`, zod em `leadSchema.ts`). |
| Honeypot | No servidor (`handleDemoRequest`): campo `website` preenchido responde 201 e não grava. |
| Origem / CSRF | **Não existe.** Entra nesta entrega (`pedidoDemoGuards.ts`). |
| Flag `SITE_DEMO_FORM_ATIVO` | **Reproduzida nesta branch** em `supabaseDemoStore` (`site/lib/demoRequest.ts`): só `'true'` (sem espaço extra) ativa a persistência; ausente, `'1'` ou `'false'` devolvem `null` e não há chamada ao banco, ou seja, 503 `not_configured`. Padrão desligada. Testes em `demoRequest.test.ts`. |
| Log de tentativas | **Não existe.** Entra nesta entrega (`linhaDeLog`), sem dado pessoal. |

## 3. Defeito encontrado: limite por IP compartilhado por todos os visitantes

A RPC lê o IP de `request.headers.x-forwarded-for` (último item), que é o que o edge do Supabase acrescenta.
Mas o site chama a RPC **a partir do servidor** (Vercel). Para o Supabase, o IP do cliente é o IP de saída do servidor
do site. Consequência: **todos os visitantes contam no mesmo bucket**; 10 pedidos em 10 minutos travam o formulário
para o site inteiro. Os testes de `demoRequest.test.ts` não pegam isto, porque o banco fake separa por IP recebido
explicitamente, não pela chamada real.

**Risco registrado (não corrigido nesta branch, migration `170000` não alterada):**
- Enquanto a `170000` estiver como está, o limite por IP é global: com 10 tentativas aceitas a cada 10 minutos para o site
  inteiro, um visitante ou um robô pode bloquear novos pedidos de todos. É negação de serviço do formulário, sem vazamento de dado.
- Controle no servidor hoje: a flag `SITE_DEMO_FORM_ATIVO` (padrão desligada) impede a chamada ao banco; a verificação de
  origem e o honeypot filtram tráfego comum antes da chamada. Nenhum desses controles limita a frequência por IP:
  o route handler ainda não aplica limite próprio. `clientIpFrom` já calcula o IP certo, mas a RPC atual não o recebe.
- Enquanto o risco durar, a flag fica desligada em produção. Antes de ligá-la, a correção da §4 precisa estar aplicada
  (ou um limite no servidor, se a decisão do dono for não mexer na migration).

Correção (antes de aplicar a `170000`):
- O servidor do site lê o IP do visitante (`clientIpFrom`, `pedidoDemoGuards.ts`) e o envia como parâmetro `p_client_ip`.
- A RPC passa a usar `p_client_ip` (validado no formato de IP ou `sem-ip`) em vez do cabeçalho.
- Isto só é seguro se **apenas o servidor** puder chamar a RPC (§4). Se `anon` puder chamar, qualquer um envia o IP que quiser.

## 4. Decisão: service_role no servidor, com EXECUTE da RPC restrito a service_role

**Decidido pelo dono em 2026-11-07: opção A (service_role).**

**Atualização (2026-11-07):** as migrations `150000`, `160000` e `170000` (e o rollback da `170000`) voltaram ao original de `main`, porque a guarda de governança proíbe alterar migrations adiadas. As correções abaixo foram movidas para a migration nova `20261107130000_commercial_leads_servico_e_ip.sql` (com rollback e entrada adiada no manifesto). Ela foi testada no homolog em transação com `ROLLBACK` e é idempotente sobre o estado atual. Nenhuma das migrations adiadas foi alterada.

Descrição original das correções (agora na `20261107130000`):
- Migrations `150000` e `160000`: `EXECUTE` só para `service_role`; a verificação prova que `anon` não executa.
- Migration `170000`: `p_client_ip` como último parâmetro (vem do servidor); a checagem não lê mais `request.headers`; a versão de 13 argumentos da `160000` é removida; `EXECUTE` só para `service_role`.
- Rollback da `170000` ajustado à nova assinatura.
- Site: `SITE_DEMO_SUPABASE_SERVICE_ROLE_KEY` (substitui a anon); `clientIpFrom` passa o IP do visitante pela rota.

**Guarda de plataforma (decidido em 2026-11-07):** `site/lib/platform.test.ts` proibia `service_role` em `demoRequest.ts`. O dono autorizou relaxar a guarda: agora ela permite `service_role` só como nome da variável `SITE_DEMO_SUPABASE_SERVICE_ROLE_KEY` no código (comentários ignorados) e continua proibindo `createClient` e outras tabelas.
Scripts `backend/scripts/sec03-*` e evidências `docs/qa/evidencias/sec02_*` foram atualizados para service_role e p_client_ip. Rodados em Postgres 16 descartável com schema mínimo (`sec02_bootstrap_minimo.sql`), não no Supabase real: 9 blocos OK no sec03, concorrência (a: 1 protocolo; b: 10 aceitas e 10 recusadas) e sec02 com anon negado na RPC. Falta repetir no homolog com o schema real.

Opções avaliadas:

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| A. `service_role` no route handler | Servidor chama a RPC com a chave `service_role`; `EXECUTE` só para `service_role`; `anon` sem nada. | Uma chave, um caminho. Remove a RPC da superfície pública. Permite `p_client_ip` confiável. Sem migração de papéis. | A chave bypassa RLS de todo o projeto: se vazar, o dano é do projeto inteiro. Exige cuidado de configuração. |
| B. Função `SECURITY DEFINER` estreita com `EXECUTE` para `anon` (estado atual) | Qualquer um com a chave anon pública chama a RPC. | Não expõe chave privilegiada. | A chave anon é pública por desenho: qualquer um chama a RPC direto, sem origem nem honeypot. `p_client_ip` vira spoofável. |
| C. Papel dedicado `lead_writer` com `EXECUTE` só na função | Servidor assina um JWT com `role: lead_writer` (com o segredo JWT do projeto) e chama o PostgREST. | Menor privilégio possível; vazamento limitado à função. | Mais peças (geração de JWT, rotação, testes de papel). Não justificado para o volume atual. |

**Decisão: A.** A RPC continua `SECURITY DEFINER`, com `REVOKE` de `PUBLIC` e `anon` e `GRANT EXECUTE` só para `service_role`.
Justificativa: é a única opção que fecha o caminho público direto (B) sem um mecanismo novo (C). O risco da chave
`service_role` é controlado por configuração: variável só no ambiente de servidor do Vercel (nunca `NEXT_PUBLIC_*`,
nunca em bundle ou log), rotação imediata se houver suspeita de vazamento. Revisitar C se o projeto ganhar outros
usos do `service_role` no site.

Mudanças necessárias nas migrations (ainda não aplicadas, então podem ser editadas antes da aplicação):
- `150000`/`160000`/`170000`: trocar `GRANT EXECUTE ... TO anon` por `GRANT EXECUTE ... TO service_role` e manter
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. Os blocos `DO $verify$` passam a checar `anon` **sem** EXECUTE.
- `170000`: adicionar `p_client_ip text` à assinatura da RPC e passá-lo a `internal.commercial_lead_rate_check(p_ip)`.
  A função de checagem para de ler `request.headers`. Assinatura muda: o site e a migration sobem juntos (já previsto no cabeçalho da `160000`).

## 5. Idempotência: o que o servidor repete

- O servidor **não** deduplica por conta própria: a unicidade e a comparação de conteúdo ficam no banco (`160000`).
- O cliente (`TrialForm.tsx`) envia `idempotency_key` (UUID por tentativa). Se a chave não vier, o servidor gera uma
  nova (`handleDemoRequest`, cliente antigo): nesse caso não há deduplicação de reenvio. Recomendação: depois do corte,
  exigir a chave (400 `invalid` sem ela). Não aplicado nesta entrega, para não quebrar cliente em cache.
- Erros do banco são traduzidos: `LEAD_RATE_LIMIT` → 429, `LEAD_CHAVE_REUTILIZADA` → 409, `LEAD_*` de validação → 400,
  demais (incluindo `LEAD_RATE_INDISPONIVEL`, rede, resposta fora do formato) → 503 genérico. Fail-closed.

## 6. Ordem das verificações no route handler (alvo)

1. Flag `SITE_DEMO_FORM_ATIVO` desligada → 503 `not_configured` (a UI mostra WhatsApp/e-mail). Nenhuma leitura do corpo.
2. Origem: `origemPermitida(Origin, origensPermitidas(getSiteUrl(), SITE_DEMO_EXTRA_ORIGINS))`. Falhou → 403 `invalid`, log `rejeitado`.
3. Content-Type `application/json` e `Content-Length` ≤ 4096 (já existe). Falhou → 400.
4. Corpo JSON e `validateDemoRequest` (zod). Falhou → 400 com campos.
5. Honeypot preenchido → 201 com protocolo fictício, **sem gravar**, log `honeypot`.
6. Chamada à RPC com `service_role`, `p_client_ip = clientIpFrom(headers)`, `p_idempotency_key`.
7. Resposta conforme §5. Log `gravado` ou `limite`/`rejeitado`/`indisponivel`, sempre via `linhaDeLog`.

Confirmação com protocolo só volta depois do 2xx da RPC (já garantido em `supabaseDemoStore`).

## 7. Controles contra abuso

| Controle | Onde | Estado |
|---|---|---|
| Limite por IP compartilhado | Banco (`170000`), com `p_client_ip` do visitante | Desenho corrigido (§3). Não aplicado. |
| Honeypot (`website`) | Servidor | Pronto (`demoRequest.ts`). |
| Verificação de origem | Servidor | Pronto (`pedidoDemoGuards.ts`). Integrar ao route. |
| Tamanho e tipo do corpo | Route | Pronto. |
| Idempotência | Banco | Pronto (`160000`). |
| Log sem dado pessoal | Servidor | Pronto (`linhaDeLog`): só evento, status, motivo técnico (código) e hora truncada. Nunca nome, loja, contato, IP ou protocolo. |
| Captcha / Turnstile | — | Fora desta entrega. Considerar se o honeypot + limite não bastarem. |

## 8. Testes

- `site/lib/demoRequest.test.ts` (existente): validação, idempotência e concorrência com banco fake, cliente REST.
- `site/lib/pedidoDemoGuards.test.ts` (novo): IP do cliente (ordem de confiança, formato), origem exata, log sem PII.
- Lacuna conhecida: nenhum teste roda a RPC real. Validar em homologação com: (a) limite do IP A não afeta IP B;
  (b) chamada direta com a chave anon recusada (`permission denied`); (c) reenvio com a mesma chave devolve o protocolo original.

## 9. Pendências que dependem do dono

1. ~~Escolher A ou C.~~ **Feito: A (service_role), decidido pelo dono em 2026-11-07.** Próximo: aplicar as mudanças de §4 nas migrations (ainda não feitas) e trocar a chave no site (§9.6).
2. **Criar a flag `SITE_DEMO_FORM_ATIVO`**. Ela não existe nesta branch, embora o pedido diga que já foi implementada.
   Ela deve nascer desligada e ser checada no route handler (§6, passo 1).
3. **Ordem e aplicação das migrations.** `20261104120000` (privilégios do anon, manual, runbook
   `docs/runbooks/APLICAR_20261104120000_ANON_PRIVILEGIOS.md`) vem **antes**. Depois, na ordem `150000` → `160000` → `170000`,
   já com as correções da §4. Cada uma só com autorização explícita do dono, validação em homologação e o label
   `deploy-prod:aprovado` no PR que remove a entrada de `deferred-migrations.json`.
4. **Deploy conjunto.** A `160000` muda a assinatura da RPC; o site novo e a migration precisam subir juntos.
5. **Confirmar em homologação** que o Vercel envia `x-vercel-forwarded-for` com o IP do cliente (não verificado daqui).
6. **Variável de ambiente nova** `SITE_DEMO_EXTRA_ORIGINS` (opcional, previews) e troca de `SITE_DEMO_SUPABASE_ANON_KEY` por
   `SITE_DEMO_SUPABASE_SERVICE_ROLE_KEY` no Preview e Production, somente quando a opção A for aprovada.

## 10. Fora desta entrega

- Nenhuma alteração no route handler, no `TrialForm.tsx`, nem na flag (apenas as guardas puras e os testes).
- Nenhuma migration aplicada, nenhum grant ou policy remoto alterado, nenhum deploy, nenhum label, nenhum merge.
- Remoção do componente e da rota: não feita, como pedido.
