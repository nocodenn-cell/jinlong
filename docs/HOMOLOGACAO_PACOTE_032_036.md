# Homologação — pacote 032–036 (multi-loja, fiscal, recebimento, transferências)

Objetivo: fechar o ciclo com segurança em homologação, com evidências e critérios claros de aceite antes de promover para produção.

Escopo deste runbook:

- Banco: migrations `032` a `036`.
- Web (`pdv-importados`): módulos gerente (`estoque`, `recebimento`, `transferencias`, `financeiro`) e pricing/carrinho.
- Desktop (`pdv-local`): compatibilidade das regras de carrinho/pricing.
- Operação: smoke SQL completo e regressão mínima guiada.

---

## Pré-condições obrigatórias

- Ambiente Supabase de homologação separado de produção.
- Projeto Supabase já linkado na máquina de execução.
- Usuários de teste válidos: `OPERADOR`, `GERENTE`/`DONO`.
- Snapshot/backup recente do banco de homologação.
- `SYNC_KEY` e secrets da Edge válidos no ambiente alvo.

Checklist:

- [ ] Backup/snapshot confirmado
- [ ] Ambiente de homologação correto confirmado
- [ ] Credenciais de teste válidas

---

## 1) Aplicar e validar migrations 032–036

### 1.1 Aplicação

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase migration list
npx supabase db push
npx supabase migration list
```

Critérios de aceite:

- [x] `032`, `033`, `034`, `035`, `036` aparecem em **Remote**.
- [x] `db push` sem erro.
- [x] Sem lacunas de ordem entre migrations novas.

### 1.2 Sanidade estrutural (tabelas/RPCs/views)

No SQL Editor (homologação), executar:

```sql
SELECT TO_REGCLASS('public.lojas')                    AS lojas;
SELECT TO_REGCLASS('public.remessas')                 AS remessas;
SELECT TO_REGCLASS('public.remessa_itens')            AS remessa_itens;
SELECT TO_REGCLASS('public.movimentos_estoque_log')   AS movimentos_estoque_log;
SELECT TO_REGCLASS('public.documentos_fiscais_pendentes') AS documentos_fiscais_pendentes;
SELECT TO_REGCLASS('public.clientes')                 AS clientes;
SELECT TO_REGCLASS('public.contas_receber')           AS contas_receber;
SELECT TO_REGCLASS('public.liquidacoes_receber')      AS liquidacoes_receber;
SELECT TO_REGCLASS('public.v_estoque_baixo')          AS v_estoque_baixo;
```

```sql
SELECT ROUTINE_NAME
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_SCHEMA = 'public'
  AND ROUTINE_NAME IN (
    'confirmar_remessa_entrada',
    'transferir_estoque_entre_lojas',
    'registrar_liquidacao_receber',
    'decrementar_estoque_seguro'
  )
ORDER BY ROUTINE_NAME;
```

Critérios de aceite:

- [x] Todas as tabelas/views retornam não nulo em `TO_REGCLASS`.
- [x] Todas as RPCs listadas existem.

### 1.3 Legado com `loja_id` preenchido

```sql
SELECT
  (SELECT COUNT(*) FROM public.usuarios WHERE loja_id IS NULL) AS usuarios_sem_loja,
  (SELECT COUNT(*) FROM public.caixas WHERE loja_id IS NULL)   AS caixas_sem_loja,
  (SELECT COUNT(*) FROM public.estoque WHERE loja_id IS NULL)  AS estoque_sem_loja;
```

```sql
SELECT
  loja_id,
  COUNT(*) AS linhas
FROM public.estoque
GROUP BY loja_id
ORDER BY linhas DESC;
```

Critérios de aceite:

- [x] `usuarios_sem_loja = 0`
- [x] `caixas_sem_loja = 0`
- [x] `estoque_sem_loja = 0`
- [x] Distribuição por `loja_id` compatível com expectativa do ambiente

### 1.4 RLS/policies básicas novas

```sql
SELECT
  TABLENAME,
  ROWSECURITY
FROM PG_TABLES
WHERE SCHEMANAME = 'public'
  AND TABLENAME IN (
    'lojas',
    'remessas',
    'remessa_itens',
    'movimentos_estoque_log',
    'documentos_fiscais_pendentes',
    'clientes',
    'contas_receber',
    'liquidacoes_receber'
  )
ORDER BY TABLENAME;
```

Critérios de aceite:

- [x] Todas as tabelas acima com `ROWSECURITY = TRUE`.

---

## 2) Sair do stub fiscal (NFC_E_STUB -> emissão real)

Status atual: existe fila fiscal (`documentos_fiscais_pendentes`) com `NFC_E_STUB`, sem integração Sefaz/SAT.

### 2.1 Decisão técnica mínima para homologação

Definir e congelar antes de codar:

- Provedor de emissão (SAT, NFCE API externa, gateway fiscal).
- Contrato de payload de emissão (campos obrigatórios).
- Mapeamento de status (`PENDENTE`, `EMITIDO`, `ERRO`, `CANCELADO`).
- Estratégia de retentativa e idempotência por `venda_id`.

Critérios de aceite:

- [ ] ADR/documento curto aprovado pelo time técnico.
- [ ] Campos obrigatórios e regras de erro definidos.

### 2.2 Implementação mínima obrigatória (gateway fiscal)

Itens para implementar:

- Worker/serviço de emissão consumindo `documentos_fiscais_pendentes`.
- Atualização de status transacional:
  - sucesso -> `EMITIDO` + chave/protocolo.
  - falha -> `ERRO` + `ultimo_erro`.
- Idempotência por `venda_id`/documento.
- Endpoint/ação para reprocessar documentos com erro.

Critérios de aceite:

- [ ] Documento real emitido em homologação para venda de teste.
- [ ] Falha simulada atualiza `ultimo_erro` e mantém rastreabilidade.
- [ ] Reprocessamento funciona sem duplicar documento fiscal.

### 2.3 Comandos de verificação operacional

```sql
SELECT STATUS, COUNT(*) AS QTD
FROM PUBLIC.DOCUMENTOS_FISCAIS_PENDENTES
GROUP BY STATUS
ORDER BY STATUS;
```

```sql
SELECT ID, VENDA_ID, TIPO_DOC, STATUS, ULTIMO_ERRO, UPDATED_AT
FROM PUBLIC.DOCUMENTOS_FISCAIS_PENDENTES
ORDER BY CREATED_AT DESC
LIMIT 20;
```

Critérios de aceite:

- [ ] Há transições reais `PENDENTE -> EMITIDO`.
- [ ] Cenário de erro controlado registrado em `ULTIMO_ERRO`.

---

## 3) Fortalecer UX e validações das telas novas

Páginas alvo: `/gerente/recebimento`, `/gerente/transferencias`, `/gerente/financeiro`, e ajustes em `/gerente/estoque`.

### 3.1 Hardening mínimo de UX

Implementar:

- Feedback de sucesso/erro por ação (toast/alerta persistente por request).
- Validação explícita client + server (`ZOD`) com mensagens amigáveis.
- Estados de loading e bloqueio de duplo submit.
- Exibição de erro retornado por RPC no formulário.
- Confirmações para ações críticas (transferência, liquidação).

Critérios de aceite:

- [ ] Nenhuma ação “silenciosa” (sempre mostra resultado ao usuário).
- [ ] Não é possível submeter valores inválidos sem mensagem clara.
- [ ] Duplo clique não gera duplicidade de operação.

### 3.2 Conferência em lote (recebimento)

Implementar:

- Inclusão de múltiplos itens por remessa na mesma tela.
- Resumo pré-confirmação (totais, divergências, itens zerados).
- Persistência de observações por item (quando houver divergência).

Critérios de aceite:

- [ ] Remessa com múltiplos itens concluída com sucesso.
- [ ] Divergências ficam evidenciadas no fluxo.

---

## 4) Testes de integração e regressão

### 4.1 Testes automáticos locais (web + desktop)

```powershell
cd C:\Naturecode\fastproduct\pdv-importados
npm run test

cd C:\Naturecode\fastproduct\pdv-local
npm run test
```

Critérios de aceite:

- [ ] Suites verdes em `pdv-importados`.
- [ ] Suites verdes em `pdv-local`.
- [ ] Sem regressão em pricing/atacado/carrinho.

### 4.2 Cenários E2E mínimos (manual guiado)

Executar e evidenciar:

1. Recebimento -> cria remessa -> confirma entrada -> estoque aumenta.
2. Transferência -> reduz origem e aumenta destino -> log em `movimentos_estoque_log`.
3. Financeiro -> cria cliente/título -> liquida parcial -> liquida total.
4. Caixa -> venda com atacado aplicado corretamente (limite configurado).
5. Compatibilidade `pdv-importados` x `pdv-local` para regra de preço/carrinho.

Queries de apoio:

```sql
SELECT LOJA_ID, PRODUTO_ID, QUANTIDADE_ATUAL, ESTOQUE_MINIMO
FROM PUBLIC.ESTOQUE
ORDER BY UPDATED_AT DESC
LIMIT 30;
```

```sql
SELECT LOJA_ID, PRODUTO_ID, TIPO_CODIGO, QUANTIDADE_DELTA, CREATED_AT
FROM PUBLIC.MOVIMENTOS_ESTOQUE_LOG
ORDER BY CREATED_AT DESC
LIMIT 30;
```

```sql
SELECT ID, CLIENTE_ID, VALOR_TOTAL, VALOR_ABERTO, STATUS
FROM PUBLIC.CONTAS_RECEBER
ORDER BY CREATED_AT DESC
LIMIT 30;
```

Critérios de aceite:

- [ ] Todos os 5 cenários executados sem erro funcional.
- [ ] Evidências (prints/logs/IDs) anexadas na task de homologação.

---

## 5) Checklist operacional de release (gate final)

### 5.1 Smoke SQL completo

No SQL Editor (homologação), executar:

- `backend/supabase/scripts/smoke_operacao_fluxo_completo.sql`

Critérios de aceite:

- [ ] Script executa até o fim sem erro.
- [ ] Validações internas do script passam.

### 5.2 Compatibilidade entre web e desktop

Conferir no mesmo ambiente:

- mesma política de pricing (varejo/atacado);
- mesma consistência de totais no fechamento de venda;
- sem divergência de comportamento por quantidade limiar.

Critérios de aceite:

- [ ] Amostra de produtos de teste com resultado idêntico entre apps.
- [ ] Nenhuma divergência de totalização em carrinho/venda final.

### 5.3 Gate de promoção (Go / No-Go)

Promover para produção somente se:

- [ ] Itens 1–5 deste documento concluídos.
- [ ] Sem erro crítico aberto (P0/P1) relacionado ao pacote.
- [ ] Rollback definido (versão anterior da Edge + plano de reversão operacional).

---

## Ordem executável resumida

1. Aplicar migrations e validar estrutura/RLS/legado (`loja_id`).
2. Rodar smoke SQL completo.
3. Executar testes automáticos (`pdv-importados` e `pdv-local`).
4. Executar E2E manual dos fluxos novos.
5. Fechar stub fiscal com emissão real e retentativa/idempotência.
6. Repetir smoke + E2E fiscal com emissão real.
7. Aprovar gate Go/No-Go com evidências.

Se qualquer etapa crítica falhar: **No-Go**, corrigir, reexecutar desde a etapa afetada e atualizar evidências.
