# 18 — Entrega: autorização executiva F1–F4

Branch `claude/import-intelligence-s1a`, commits locais, **sem push, merge, deploy nem migration em produção**.
Ambiente de teste:
- PostgreSQL 17 em container local, com as 406 migrations do repositório reproduzidas;
- Supabase local (`supabase start`), com GoTrue, PostgREST e Storage reais.

Detalhes em: 14 (F1), 15 (runbook), 16 (F2), 17 (F3 e F4).

## 1. Código implementado

| Fase | Commit | O quê |
|---|---|---|
| F1 | `1d42c9db` | Sincronização de vínculos com proveniência; correção do P0 em `lojas`; cerca de empresa (RESTRICTIVE + trigger de escrita) em 44 tabelas; ADMIN legado restrito à empresa legada; RPCs e views de escopo global corrigidas; plataforma (D2) com cadastro auditado; provisionamento com empresa explícita (D1); habilitação comercial com vigência e responsável (D3); trava de 2ª empresa; `requireModulo` no app; provisionamento e configurações ajustados |
| F2 | `fd910f71` | Escala de custo para 6 casas: preparada, medida e testada em `pendentes/`. **Bloqueada** para ativação |
| F3 | `86df0c11` | Parser de NF-e preservando referências (D5), com compatibilidade de vínculos e detecção de ambiguidade |
| F3 | `d509407e` | Trava de recebimento duplicado OC × NF-e (D7) atrás de rollout por empresa; relatório de vínculos (D5) |
| F3 | `32ccfeb7` | Motor de conciliação de duplicatas e obrigações (D6), puro, em centavos exatos |
| F4 | `e4d43604` | Persistência do Import Intelligence: tabelas próprias, apuração versionada e imutável, aprovação recalculada pelo servidor, documentos privados (D8); adapter usando o motor existente |

## 2. Migrations locais

| Arquivo | Estado |
|---|---|
| `migrations/20261010130000_f1_isolamento_multiempresa.sql` | aplicada localmente (container e Supabase local); idempotente; rollback testado |
| `pendentes/20261010140000_f2_custo_escala_6.sql` | **fora** de `migrations/`; testada e medida; rollback testado (aborta se houver perda) |
| `migrations/20261010150000_f3_nfe_salvaguardas.sql` | aplicada localmente; idempotente; rollback testado |
| `migrations/20261010160000_f4_import_intelligence_persistencia.sql` | aplicada localmente; idempotente; rollback testado (aborta se houver dados) |

## 3. Testes e resultados

| Suíte | Resultado |
|---|---|
| SQL F1 (`f1-isolamento-multiempresa`) | 35/35, no container e no Supabase real |
| SQL M1 (atualizada para F1) | 29/29, nos dois |
| SQL F3 (`f3-nfe-salvaguardas`) | 9/9 (RPC real de confirmação) |
| SQL F4 (`f4-import-intelligence`) | 11/11 |
| SQL F2 (`pendentes/f2-custo-escala-6`) | 6/6 |
| C1 (classe SECURITY DEFINER) | OK em todas as fases |
| REST com JWT real (`f1-rls-rest-smoke.mjs`) | 32/32 |
| Integração real do Import Intelligence (GoTrue + PostgREST + Storage + motor) | 2/2 |
| Regressão `backend/scripts/*.test.sql` | baseline anterior à M1: 31 PASS / 12 FAIL. Depois da F4: 35 PASS / 12 FAIL (47 scripts). As 12 falhas são **idênticas, com a mesma mensagem**, às do baseline (`diff` vazio); os 4 PASS a mais são os testes novos |
| Rollback F1, F2, F3, F4 | `pg_dump --schema-only` idêntico ao estado anterior em todas |
| shared-core | 352 passed / 5 skipped (eram 337); `tsc` limpo |
| pdv-importados | ver §3.1 |
| Typecheck e ESLint (arquivos alterados) | limpos |
| Guardrails | os 9 OK |

### 3.1 Vitest completo do app

376 arquivos: **371 passam, 3 skipped, 2 falham por causa do ambiente**, ambas comprovadas. Nenhuma toca código alterado.

- `productUpdater.semRpc.integracao` usa uma chave fictícia quando não há variável de ambiente e só roda porque o Supabase local está de pé. Com a chave local real passa 2/2, contra o banco já com F1–F4.
- `dashboard/page.paginacao` estoura o timeout de 15 s sob a carga da suíte completa e passa isolado (2/2).

No total: 2.345 testes passam e 1 falha (o timeout).

## 4. Evidências da correção do P0 em `lojas`

Mesmo script nos bancos M1 e F1. Um GERENTE da empresa A tenta alterar a loja da empresa B:
- **M1: 1 linha alterada, loja de B visível.**
- **F1: 0 linhas, loja invisível.**

Com JWT real via PostgREST:
- PATCH em B1 → nenhuma linha;
- PATCH em loja irmã por GERENTE → nenhuma linha;
- troca de `empresa_id` → 42501;
- POST por DONO → negado;
- loja sem empresa → recusada até para service_role.

A edição legítima da própria loja continua funcionando (L5).

## 5. Isolamento por empresa

| Superfície | Prova |
|---|---|
| Lojas | SQL L1–L5 e REST L1–L9 |
| 44 tabelas com tenant (produtos, estoque, caixas, vendas, usuários, financeiro…) | SQL C1–C6 e REST C1–C5. O DONO de B, que no legado era global ("Padrão A"), não lê nem escreve dados de A |
| RPC SECURITY DEFINER de escrita | SQL C4 e REST C6. No banco M1, o DONO de A ajustava o estoque de B; na F1, `CERCA_EMPRESA_VIOLADA` |
| RPCs de leitura de escopo global e views definer | SQL C5, C6b e REST C7–C8 |
| Plataforma e módulo | SQL P1–P6 e M1–M5; REST P1–P6 e M1–M8 |
| Import Intelligence | SQL F4-03 e F4-10; integração real (B licenciado não vê A) |

## 6. Impacto no primeiro cliente

O cliente atual está inteiro na empresa legada, então a cerca não muda o que ele faz hoje (regressão idêntica, teste E1). Mudanças de comportamento intencionais:

1. GERENTE só edita os dados cadastrais da própria loja.
2. Ninguém cria loja pela tela de configurações (D1).
3. **O provisionamento passa a exigir um administrador de plataforma cadastrado. Hoje não existe nenhum (D2).** A equipe FastProduct não provisiona até a designação pelo runbook (doc 15).
4. Contas inativas ou com loja inexistente deixam de passar pela cerca (fail closed).
5. NF-e: um CNPJ de emitente iniciado em zero passa a ser aceito. Vínculos legados continuam reconhecidos. Códigos colidentes na mesma nota passam a pedir conferência.
6. NF-e (D7, D6): **nada muda até o rollout ser ligado para a empresa.**
7. Import Intelligence: invisível até a habilitação comercial.

## 7. Pendências e riscos remanescentes

| # | Pendência ou risco | Severidade | Bloqueia |
|---|---|---|---|
| 1 | Tabelas globais (configurações, categorias, marcas…) e tabelas-filhas sem cerca | P0 para 2º cliente | cadastro de 2º cliente no ERP (travado no banco) |
| 2 | Identidade real de plataforma ainda não designada (D2) | P1 | provisionamento e habilitação pelo caminho de plataforma (o caminho `ops_` funciona) |
| 3 | Pré-checagem em clone autorizado: divergências, exceções, lojas órfãs, custo do trigger de cerca com volume real | P1 | aplicar F1 em produção |
| 4 | F2: UI e gravadores com 6 casas (32 consumidores) | P1 | ativar F2 (não bloqueia F4) |
| 5 | D6 ainda não ligado à confirmação de NF-e do ERP (precisa de rollout por empresa) | P2 | — |
| 6 | Relatório D5 em clone de produção e consolidação com conferência humana | P2 | — |
| 7 | Prazos de retenção (D8) sem validação jurídica | P1 | uso de documentos reais |
| 8 | `pdv_diagnostico_pre_producao` e buckets antigos de storage sem revisão de tenant | P2 | 2º cliente |
| 9 | As 12 falhas pré-existentes da regressão não foram triadas | P2 | — |
| 10 | Medição de lock da F2 feita com 50 mil linhas, não com o volume real | P2 | ativar F2 |

## 8. GO/NO-GO — ativação exclusiva do Import Intelligence

| Critério | Estado |
|---|---|
| Isolamento entre empresas nas superfícies do módulo | ✅ testado (SQL, REST com JWT real, integração) |
| Módulo desabilitado por padrão; habilitação auditada com responsável, vigência e histórico | ✅ |
| Acesso cumulativo: tenant, módulo, autenticação, papel e empresa operacional | ✅ |
| Persistência salva, reabre e reproduz o cálculo (hash idêntico) | ✅ |
| Nenhum efeito em estoque, contas a pagar e preços | ✅ |
| Migrations aplicadas em produção | ❌ não, por restrição |
| Pré-checagem em clone autorizado (item 3) | ❌ pendente |
| Identidade de plataforma real ou procedimento `ops_` autorizado para a habilitação | ❌ pendente (decisão administrativa) |
| Interface do módulo (hub) | ❌ não existe ainda |

**Decisão: GO técnico local; NO-GO para ativação em produção até cumprir os itens 2 e 3 de §7 e construir o hub.**
Depois disso, a ativação exclusiva para o primeiro cliente segue o runbook (doc 15 §3), sem nenhum hardcode: o banco lê a empresa `LEGADA_M1`.

**Cadastro de um segundo cliente no ERP: NO-GO** (§7 item 1; travado no banco).

## 9. Próxima implementação: hub visual de Importações

1. **Rotas** `/importacoes` (lista) e `/importacoes/[id]` (operação), protegidas por `requireModulo(client, 'IMPORT_INTELLIGENCE', { papeis: ['DONO','GERENTE'] })` no server component e em cada action. A entrada no menu só aparece com o módulo ativo, e a negação é feita no servidor.
2. **Server actions** finas sobre o adapter: criar operação; salvar item, câmbio, despesa, desconto e tributo; registrar documento (upload no bucket privado + sha256 calculado no servidor); simular; apurar; aprovar (com o client de serviço apenas dentro de `aprovarApuracao`).
3. **Telas:**
   - lista com status e versões;
   - editor de itens, com quantidade comercial × fator → estoque;
   - despesas com critério de rateio e justificativa;
   - tributos com status de recuperabilidade;
   - documentos com versão;
   - painel de apuração: custo unitário com 6 casas na memória de cálculo, totais com 2, divergências bloqueantes em destaque, conservação;
   - comparação entre versões;
   - aprovação e reabertura (somente DONO).
4. **Conciliação (D6)** exibida a partir dos documentos NF-e e invoice da operação, usando `conciliarObrigacoesNfe`.
5. **Testes:** E2E com Supabase local, cobrindo módulo desligado (rota 404 ou negada), isolamento, simulação, apuração, aprovação e acessibilidade.
6. **Fora do escopo do hub**, por decisão: integrar o custo aprovado ao estoque, a contas a pagar ou a preços. Isso exige uma fase própria e a F2 ativada.
