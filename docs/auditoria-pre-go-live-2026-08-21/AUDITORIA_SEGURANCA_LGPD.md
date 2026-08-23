# Auditoria de seguranca, privacidade e LGPD

## Conclusao

Seguranca tecnica: **REPROVADO**. Prontidao LGPD: **INSUFICIENTE**, com ressalva juridica e operacional obrigatoria. O repositorio demonstra hardening relevante, mas nao prova o estado aplicado e contem riscos locais/de dispositivo suficientes para impedir aceite.

## Mapa resumido de dados pessoais

| Titular/dado | Finalidade declarada | Armazenamento/consumidores | Retencao/exclusao comprovada |
|---|---|---|---|
| Usuarios: nome, e-mail, perfil, loja, auth | Acesso, RBAC e auditoria | Supabase Auth/public, web, Edge, operacao | Nao comprovada; usuario inativo e sessao antiga requerem teste real |
| Clientes: identidade, contato, endereco, credito, historico | Venda, recebiveis e fiscal | Postgres, telas admin, relatorios | Migration de compliance existe; job/processo integral nao comprovado |
| Funcionarios/comissoes | Operacao, autoria e remuneracao | Postgres, financeiro/admin | Retencao e desligamento nao comprovados ponta a ponta |
| Fornecedores e documentos fiscais | Compras, AP e fiscal | Postgres, XML/logs/storage quando aplicavel | Politica e expurgo nao comprovados |
| Vendas, caixa e telemetria de dispositivo | Execucao, antifraude, observabilidade | Postgres, browser/desktop logs, Sentry | Documento recomenda TTL de telemetria; implementacao nao encontrada |
| Backups de producao locais | Recuperacao | `backups/` no workspace | Sem classificacao, criptografia, TTL ou descarte comprovados |

## Achados

### SEC-001 - material sensivel local fora da protecao do repositorio

- Severidade/status: **P1 - FALHA**; bloqueia go-live: **sim**.
- Evidencia: `git status` lista `conexao.txt` e `backups/` como nao rastreados; `git check-ignore` nao encontra regra para eles. Nenhum valor foi lido ou reproduzido.
- Impacto/cenario: commit, upload de contexto, backup automatico ou suporte pode expor credenciais, PII e dados comerciais/financeiros.
- Requisito: minimizacao, segredo fora do repo, backup governado.
- Correcao: quarentena fora do workspace, ignore explicito, scanner de segredo/PII e rotacao se houver credencial real.
- Regressao/aceite: `git check-ignore -q` positivo; gitleaks sem segredo; inventario assinado de rotacao; nenhum dump no workspace.
- Dependencias/esforco/dono: DevOps + seguranca + DPO; **M**.

### SEC-002 - credencial HMAC compartilhada distribuida ao desktop

- Severidade/status: **P1 - COMPROVADO**; bloqueia: **sim**.
- Evidencia: `pdv-local/src-tauri/src/db.rs:885-953` le `SYNC_KEY` do processo e assina requests; `backend/supabase/functions/sync-outbox/index.ts:899-1024` valida a mesma chave global, nonce e fingerprint.
- Impacto/cenario: extracao da chave de uma instalacao permite fabricar cliente/dispositivo; nonce impede replay literal, mas nao abuso com novos nonces. Fingerprint enviado pelo cliente nao prova identidade.
- Correcao: credencial unica revogavel por instalacao/loja, provisionamento, escopo de operacoes e rate limit; nao embarcar segredo mestre.
- Regressao/aceite: dispositivo A nao autentica como B; revogacao imediata; loja no token nao pode ser substituida por header/payload; chave extraida de um cliente nao acessa outra loja.
- Dependencias/esforco/dono: backend + desktop + operacao; **G**.

### SEC-003 - logs locais persistentes sem redacao/retencao comprovadas

- Severidade/status: **P1 - FALHA**; bloqueia: **sim**.
- Evidencia: `pdv-local/src/lib/logger.ts:43-56` persiste buffer em `localStorage`; `pdv-importados/shared/unified-logger.ts:113-125` le/grava armazenamento local.
- Impacto/cenario: erros e contexto operacional podem sobreviver logout, ser lidos por perfil do SO/XSS ou entrar em suporte sem minimizacao.
- Correcao: schema allowlist, redacao central, TTL, limite, limpeza no logout e armazenamento protegido no desktop.
- Regressao/aceite: testes com e-mail, CPF, token e payload financeiro provam ausencia; expurgo por TTL/logout.
- Dependencias/esforco/dono: codigo + privacidade; **M**.

### SEC-004 - estado real de RLS/grants nao comprovado

- Severidade/status: **P1 - NAO COMPROVADO**; bloqueia: **sim**.
- Evidencia: existem `audit_rls_public_tables.sql`, `test-rls-scope.mjs` e migrations 115/218-221, mas nao houve banco autenticado. `SECURITY DEFINER` e historico longo de redefinicoes tornam prova textual insuficiente.
- Impacto/cenario: overload ou grant residual pode permitir RPC direta, anon/authenticated ou acesso cross-loja.
- Correcao: reconstruir banco do zero e consultar `pg_class`, `pg_policy`, `pg_proc`, `proacl`, `proconfig`, views e buckets; comparar com producao.
- Regressao/aceite: zero tabela exposta sem RLS; zero definer publico sem `search_path` seguro e revoke explicito; matriz negativa operador/gerente/cross-loja passa.
- Dependencias/esforco/dono: banco + DevOps; **G**.

### SEC-005 - integridade/assinatura do updater desktop nao comprovada

- Severidade/status: **P2 - NAO COMPROVADO**; bloqueia: nao isoladamente.
- Evidencia: busca em `pdv-local/src-tauri` nao encontrou configuracao demonstravel de updater, chave publica, assinatura e endpoint de release.
- Impacto: distribuicao manual ou futura atualizacao sem cadeia assinada aumenta risco supply-chain.
- Correcao/aceite: definir canal, assinatura obrigatoria, chave offline, hash/provenance e teste de artefato adulterado rejeitado.
- Dependencias/esforco/dono: DevOps + desktop; **M**.

### LGPD-001 - politica afirma retencao/anonimizacao sem mecanismo operacional provado

- Severidade/status: **P1 - PARCIAL**; bloqueia: **sim**.
- Evidencia: `docs/TERMOS_E_PRIVACIDADE.md` declara retencao, anonimizacao, direitos e contato; nao foi encontrado fluxo completo versionado de DSAR, exportacao, correcao, expurgo e evidencias de atendimento.
- Impacto: promessa contratual pode nao ser executavel; exclusao pode quebrar fatos financeiros ou permanecer em backups.
- Correcao: inventario RoPA, runbook DSAR, matriz de retencao por entidade, anonimização referencial, SLA e trilha de aprovacao.
- Aceite: pedido sintetico percorre confirmacao, exportacao, correcao e exclusao/anonimizacao inclusive backup; relatorio de evidencias sem PII excessiva.
- Dependencias/esforco/dono: produto + operacao + juridico + codigo; **G**.

### LGPD-002 - backups locais sem governanca demonstrada

- Severidade/status: **P1 - FALHA**; bloqueia: **sim**.
- Evidencia: dumps nomeados como producao em `backups/`, fora do Git e fora do ignore.
- Impacto: copia secundaria contorna RLS, direitos do titular e controles do provedor.
- Correcao/aceite: criptografia, acesso minimo, inventario, TTL, descarte e restauracao auditada; nenhum dump em workstation comum.
- Dependencias/esforco/dono: DevOps + DPO; **M**.

### LGPD-003 - retencao de telemetria e logs e apenas recomendacao

- Severidade/status: **P2 - PARCIAL**; bloqueia: nao isoladamente.
- Evidencia: `docs/RECONNECT_REPLAY_POLICY.md` recomenda 7-15 dias raw e job futuro; o proprio documento lista purge/agregados como proximo passo.
- Impacto: crescimento indefinido e tratamento alem da necessidade.
- Correcao/aceite: TTL automatizado, agregados anonimizados, alerta de falha e teste temporal.
- Dependencias/esforco/dono: banco + privacidade; **M**.

### LGPD-004 - base legal, papeis e transferencias exigem validacao humana

- Severidade/status: **P2 - NAO COMPROVADO**; bloqueia expansao.
- Evidencia: termos atribuem controlador/operador e bases legais, mas repositorio nao prova contratos com suboperadores, RIPD/LIA, transferencia internacional, encarregado efetivo ou resposta a incidente.
- Correcao/aceite: revisao por profissional juridico, DPA/suboperadores, mapa de regioes, canal testado e tabletop de incidente.
- Dependencias/esforco/dono: juridico + DPO + operacao; **G**.

## Separacao LGPD exigida

- Controle tecnico comprovado: catalogo de auth/RBAC, migrations de RLS/hardening, nonce anti-replay, politica publicada no codigo.
- Controle tecnico ausente/parcial: identidade por dispositivo, redacao/TTL de logs, expurgo integral e prova de backups.
- Processo organizacional: DSAR, offboarding, incidente, rotacao, restauracao, registro de operacoes e fornecedores.
- Documento juridico: DPA, lista de suboperadores, transferencia, politica de retencao e avisos por finalidade.
- Validacao profissional: bases legais, legitimo interesse, consentimento/opt-out, prazos fiscais, controlador/operador e GDPR.

