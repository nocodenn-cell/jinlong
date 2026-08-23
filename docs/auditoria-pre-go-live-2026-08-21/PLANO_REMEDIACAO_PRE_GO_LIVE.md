# Plano executavel de remediacao pre-go-live

## Principios de execucao

- Cada tarefa referencia IDs da matriz e termina com evidencia no mesmo SHA.
- Alteracao financeira e sempre aditiva/compensatoria; rollback nao apaga fatos.
- Segredo, migration financeira e traducao em massa nao entram no mesmo PR.
- Todo rollout passa por staging reconstruido do SSOT e canary por loja.

## Sprint 0 - congelar e tornar auditavel (bloqueante)

1. **S0.1 - fixar candidato de release (FIN-001).** Reconciliar o working tree com `main`, revisar individualmente as migrations financeiras alteradas e gerar manifest SHA/ordem/checksum. Arquivos provaveis: migrations `20260813*`, `20260814*`, teste adversarial e workflows. Gate: working tree limpo, guard de migrations, schema rebuild. Risco: incluir reparo parcial. Nao agrupar com mudanca funcional.
2. **S0.2 - retirar material sensivel do workspace (SEC-001, LGPD-002).** Quarentena, inventario, ignore, gitleaks e decisao humana de rotacao/descarte. Arquivos: `.gitignore`, pipeline de secrets. Gate: scans limpos e backup restauravel no cofre. Rollback: restaurar somente do cofre, nunca recolocar dump no repo.
3. **S0.3 - fornecer fontes obrigatorias.** Adicionar os dois documentos solicitados em local documental aprovado ou disponibiliza-los ao auditor. Gate: hash e leitura integral registrados. Nao alterar codigo.
4. **S0.4 - ambiente efemero.** Subir Supabase local limpo exclusivamente de `backend/supabase/migrations`; sem producao. Gate: migration list, RLS audit e seed sintetico.

Paralelizacao: S0.2 e obtencao de fontes podem ocorrer em paralelo; S0.1 e S0.4 sao sequenciais. Aprovação humana: rotacao/descarte, escolha do SHA e qualquer reparo de migration.

## Sprint 1 - seguranca e isolamento

1. **S1.1 - identidade por dispositivo (SEC-002).** Projetar credencial unica, escopo loja/dispositivo, expiracao, revogacao e rate limit. Arquivos: `pdv-local/src-tauri/src/db.rs`, `sync-outbox/index.ts`, tabelas/RPCs via migration nova. Testes: chave A/B, header/payload adulterado, nonce/replay, dispositivo revogado, operador inativo. Rollout: opt-in por loja, dupla validacao temporaria com telemetria; rollback desativa novo metodo sem reabilitar segredo comprometido.
2. **S1.2 - catalogo de superficie DB (SEC-004, FIN-003).** Audit SQL de tabelas/views/functions/buckets; revokes por assinatura; `search_path` seguro; matriz RBAC. Gate: anon/operador/gerente/cross-loja negativos via REST/RPC. Nao agrupar com regra financeira.
3. **S1.3 - logs seguros (SEC-003).** Redacao allowlist, TTL, limpeza logout e storage protegido desktop. Testes canario com PII/token. Gate: nenhum valor sensivel no Sentry/localStorage.
4. **S1.4 - releases assinadas (SEC-005).** Assinatura/provenance/updater e teste de artefato adulterado.

Paralelizacao: S1.2, S1.3 e S1.4 podem ser PRs independentes; S1.1 exige design aprovado antes de codigo.

## Sprint 2 - certificacao financeira

1. **S2.1 - invariantes e falhas (FIN-002).** Executar e completar suite para total de venda, split payment, caixa, AR/AP, cancelamento/devolucao, comissao, offline, idempotencia por loja e failpoints. Gate: 30 corridas concorrentes, zero duplicacao/omissao, reconciliacao centavo a centavo.
2. **S2.2 - timezone por loja (FIN-004).** Separar fuso da linguagem e passar bounds UTC a todas as leituras. Testes: Recife/UTC, virada de dia e DST internacional. Rollout por feature flag e comparacao shadow; rollback volta leitura, sem alterar fatos.
3. **S2.3 - fixture contabil unica (FIN-005).** Dataset sintetico alimenta dashboard, vendas, caixa, AP, AR, comissoes e relatorios; snapshot inclui formula e filtros. Gate: todos fecham com ledger detalhado.
4. **S2.4 - restauracao e migration interrompida.** Ensaio de backup/restore e falha entre migrations. Gate: RTO/RPO medidos, checksums e reconciliacao pos-restore.

Nao agrupar: writer de venda, AR/AP, comissao e timezone em uma unica migration/PR. Cada mudanca tem rollback/compensacao proprio e gate dedicado.

## Sprint 3 - LGPD operacional

1. **S3.1 - mapa e retencao (LGPD-001/003).** RoPA, matriz por entidade, purge de telemetria e anonimizacao referencial. Gate: relogio acelerado e prova de expurgo.
2. **S3.2 - DSAR E2E.** Confirmacao, exportacao, correcao, oposicao/revogacao e exclusao/anonimizacao com auditoria. Gate: caso sintetico dentro do SLA, inclusive impacto em backup.
3. **S3.3 - juridico/operacao (LGPD-004).** DPA, suboperadores, transferencias, encarregado, incidente e validacao de bases legais. Gate humano; codigo nao pode declarar conformidade sozinho.

## Sprint 4 - i18n e expansao

1. **S4.1 - eliminar hardcodes (I18N-001).** Inventario mecanico, namespaces, lint e migracao por rota. Gate PT/ZH sem mistura e zero literal fora allowlist.
2. **S4.2 - unificar desktop (I18N-002).** Consumir runtime/catalogos compartilhados; locale por usuario, moeda/fuso por loja; recibos golden.
3. **S4.3 - fundacao EN (I18N-003/004).** BCP-47, catalogo EN, persistencia extensivel, SSR/client consistente e bundle lazy. Gate sem fallback PT e sem hydration mismatch.
4. **S4.4 - regionalizacao (I18N-005).** Modelar pais fiscal, moeda, timezone, endereco e documentos separadamente. Apenas descoberta para Croacia/UE/Asia; regras legais exigem especialistas locais.
5. **S4.5 - QA nativo/visual.** Revisao mandarim nativa, glossario, 320-1440 px, 200%, CJK, EN +30%, teclado/leitor e impressao.

Paralelizacao: inventario/lint, glossario nativo e modelagem regional podem iniciar juntos; migracao de telas e desktop dependem do contrato compartilhado. Nao misturar traducao com mudanca de calculo financeiro ou regra fiscal.

## Gate final e rollout

1. CI completo no mesmo SHA: check Edge, lint, typecheck, unit/integration/E2E, guards, RLS REST, financeiro SQL/concorrencia, build web/desktop e scan de supply chain.
2. Staging reconstruido, duas homologacoes consecutivas por perfil e por loja, incluindo offline/replay e virada do dia.
3. Aprovacoes: financeiro/produto, seguranca, DPO/juridico, operacao e traducao nativa.
4. Canary em uma loja, monitoramento de duplicatas, divergencia de caixa, erros auth/sync e fallback i18n.
5. Rollback de aplicacao por artefato assinado; rollback de banco somente plano preaprovado e fatos financeiros por compensacao. Nunca `DELETE`/reescrita de ledger para desfazer rollout.

