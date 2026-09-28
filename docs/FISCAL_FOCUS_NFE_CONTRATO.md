# CONTRATO TÉCNICO — JINLONG × FOCUS NFe

**Documento:** `docs/FISCAL_FOCUS_NFE_CONTRATO.md`  
**Projeto:** Jinlong — ERP / PDV para varejo e atacado  
**Escopo inicial:** NFC-e para o primeiro cliente  
**Status:** Contrato técnico de integração + checklist de auditoria pré-implementação  
**Data:** 2026-09-16

---

## 1. Objetivo

Este documento estabelece o contrato técnico entre o domínio fiscal do Jinlong e a Focus NFe, definindo:

- o que foi confirmado pela Focus;
- o que a documentação oficial da Focus estabelece;
- decisões arquiteturais do Jinlong;
- responsabilidades de cada lado;
- modelo de dados esperado;
- fluxo de emissão;
- idempotência;
- webhooks;
- reconciliação;
- contingência;
- segurança;
- homologação e produção;
- lacunas que ainda precisam ser confirmadas;
- procedimento para auditar o código existente antes de implementar qualquer coisa.

**Regra:** este documento deve ser tratado como contrato de integração. O código não deve inventar comportamento da Focus que não esteja documentado ou confirmado.

---

# 2. Fontes oficiais e evidências

## 2.1 Conversa comercial/técnica com a Focus NFe

Arquivo de origem:

`Conversa do WhatsApp com Focus NFe`

Principais confirmações recebidas em 02/09/2026:

- API atende NFC-e e NF-e;
- cenário SaaS/multiempresa é suportado;
- existe conta "guarda-chuva";
- empresas podem ser cadastradas manualmente pelo painel ou por endpoint;
- para emissão são necessários CNPJ ativo, IE, dados cadastrais e certificado A1;
- certificado A1 fica armazenado na Focus;
- existe período de testes de 30 dias;
- NFC-e possui tratamento de contingência;
- a Focus informou que precisa controlar número e série para o fluxo de contingência descrito comercialmente;
- existem webhooks;
- a API permite o ciclo fiscal necessário;
- rejeições retornam informações estruturadas;
- a integração é REST;
- existe suporte técnico;
- referências são utilizadas para evitar problemas de emissão repetida;
- é possível consultar posteriormente o estado do documento;
- a Focus informou que não possui endpoint para listar documentos/eventos emitidos por período;
- a Focus informou que XML/PDF são disponibilizados e que informações necessárias para consulta posterior além do que a Focus disponibiliza devem ser armazenadas pelo ERP.

## 2.2 Documentação oficial

Documentação principal:

https://doc.focusnfe.com.br/reference/introducao

Guias:

https://focusnfe.com.br/guides/

Preparação do sistema:

https://2025.focusnfe.com.br/guides/preparando-sistema/

Empresas:

https://doc.focusnfe.com.br/reference/empresas

Referência/idempotência:

https://doc.focusnfe.com.br/reference/referencia

Webhooks:

https://doc.focusnfe.com.br/reference/webhooks

Emissão NFC-e:

https://doc.focusnfe.com.br/reference/emitir_nfce

Coleção Postman:

https://www.postman.com/focusnfe/focus-nfe/collection/16594649-c7e14737-9d04-42af-8d6e-ec8eb0bf0a8f

---

# 3. Escopo do primeiro go-live

## 3.1 Dentro do escopo

Para o primeiro cliente:

- emissão de NFC-e;
- integração com Focus NFe;
- ambiente de homologação;
- ambiente de produção;
- consulta de documento;
- tratamento de autorização;
- tratamento de rejeição;
- cancelamento, quando aplicável;
- armazenamento do histórico fiscal no Jinlong;
- armazenamento do XML e demais artefatos disponíveis;
- webhook;
- reconciliação;
- idempotência por referência;
- auditoria;
- vínculo inequívoco entre venda e operação fiscal.

## 3.2 Fora do primeiro corte

Não implementar somente por antecipação:

- todos os tipos de documentos fiscais;
- CT-e;
- MDF-e;
- NFS-e;
- motor fiscal completo para todos os regimes;
- múltiplos provedores;
- recursos fiscais que não sejam necessários para a primeira emissão NFC-e.

A arquitetura, porém, deve permitir evolução futura para NF-e e outros documentos.

---

# 4. Arquitetura obrigatória do Jinlong

## 4.1 Princípio

A Focus NFe é um **provider externo**.

O domínio fiscal do Jinlong NÃO deve conhecer detalhes específicos da API Focus.

Modelo:

```text
                    JINLONG
                       |
                       v
              +----------------+
              | Fiscal Domain  |
              +----------------+
                       |
                       v
              +----------------+
              | Fiscal Port    |
              +----------------+
                       |
                       v
              +----------------+
              | Focus Provider |
              +----------------+
                       |
                       v
                 Focus NFe API
```

O adapter/provider será responsável por:

- autenticação;
- montagem do payload Focus;
- chamadas HTTP;
- tradução de respostas;
- tradução de erros;
- consulta;
- cancelamento;
- webhook integration;
- conversão entre contrato interno e contrato externo.

O domínio Jinlong deve permanecer independente da Focus.

---

# 5. Responsabilidades

## 5.1 Jinlong

O Jinlong é responsável por:

- registrar a venda;
- garantir a identidade da operação;
- criar a referência fiscal;
- manter histórico das tentativas;
- manter histórico dos documentos;
- manter eventos fiscais;
- registrar respostas da Focus;
- registrar rejeições;
- armazenar XML/PDF disponibilizados;
- manter auditoria;
- receber webhooks;
- responder rapidamente ao webhook;
- realizar reconciliação quando necessário;
- impedir emissão duplicada por erro interno;
- apresentar o estado fiscal ao operador/gestor.

## 5.2 Focus NFe

Segundo as informações recebidas:

- comunicação com SEFAZ;
- processamento fiscal;
- emissão;
- contingência conforme suporte/configuração da Focus;
- gerenciamento de recursos fiscais da API;
- geração/retorno dos documentos disponíveis;
- webhooks;
- consulta do documento;
- suporte técnico da API.

---

# 6. Conta guarda-chuva e multiempresa

A Focus confirmou que o cenário SaaS/multiempresa é suportado por uma conta "guarda-chuva".

A documentação atual também informa que a API de Empresas permite:

- criar;
- consultar;
- listar;
- alterar;
- excluir empresas;
- habilitar empresas para emissão.

O Jinlong deve modelar a relação:

```text
Jinlong Empresa/Tenant
        |
        +---- Focus Company ID
        |
        +---- ambiente
        |
        +---- configuração fiscal
        |
        +---- credencial/token
```

## Regra de segurança

O token master da Focus NÃO deve ser utilizado pelo frontend nem ficar exposto no cliente.

A documentação da Focus recomenda que o token master seja usado apenas em ambiente controlado, especialmente para operações administrativas como cadastro de emitentes, e que tokens específicos da empresa sejam utilizados para emissão.

---

# 7. Configuração fiscal por empresa

O domínio deve permitir armazenar, por empresa:

```text
empresa_id
focus_empresa_id
ambiente
cnpj
inscricao_estadual
dados_cadastrais
status_integracao
provider
credencial/token reference
configuracoes fiscais
```

Segredos devem permanecer fora do frontend e ser tratados como secrets/credenciais de backend.

---

# 8. Modelo fiscal

## 8.1 Não colocar toda a informação fiscal diretamente em `vendas`

A documentação da Focus recomenda explicitamente não tratar a emissão como relação 1:1 entre operação comercial e documento fiscal.

Uma venda pode ter:

- várias tentativas;
- documento rejeitado;
- documento cancelado;
- nova emissão;
- contingência;
- mais de um documento associado à mesma operação.

Portanto o modelo conceitual deve ser:

```text
VENDA
  |
  +---- FISCAL_OPERATION
             |
             +---- FISCAL_ATTEMPT
             |
             +---- FISCAL_DOCUMENT
             |
             +---- FISCAL_EVENT
```

## 8.2 Exemplo

```text
Venda #1842
 |
 +-- Tentativa 1
 |      |
 |      +-- rejeitada
 |
 +-- Tentativa 2
        |
        +-- autorizada
```

Outro caso possível:

```text
Venda #1842
 |
 +-- NFC-e A
 |      |
 |      +-- cancelada
 |
 +-- NFC-e B
        |
        +-- autorizada
```

O banco deve suportar esses cenários.

---

# 9. Entidades mínimas recomendadas

Os nomes finais devem respeitar a arquitetura já existente do Jinlong. Não criar tabelas duplicadas caso o sistema já possua entidades equivalentes.

Conceitualmente:

## fiscal_operations

Representa a intenção/operação fiscal vinculada à operação comercial.

Campos conceituais:

```text
id
empresa_id
venda_id
tipo_documento
status
created_at
updated_at
```

## fiscal_attempts

Representa cada tentativa de emissão.

```text
id
fiscal_operation_id
reference
attempt_number
status
request_payload_hash
response_payload
error_code
error_message
started_at
finished_at
created_at
```

## fiscal_documents

Representa documentos fiscais efetivamente retornados/identificados.

```text
id
fiscal_operation_id
reference
tipo
modelo
numero
serie
chave_acesso
protocolo
status
xml
pdf
data_emissao
created_at
updated_at
```

## fiscal_events

Representa mudanças/eventos recebidos ou produzidos.

```text
id
fiscal_document_id
event_type
status
payload
source
received_at
processed_at
created_at
```

**Esses nomes são conceituais. Antes de criar migrations, o agente deve verificar o schema atual e reutilizar entidades existentes quando elas já cumprirem a responsabilidade.**

---

# 10. Referência / idempotência

A Focus utiliza `ref` como identificador da emissão.

A documentação atual informa:

- `ref` deve ser única dentro do escopo do token;
- pode ser alfanumérica;
- não deve conter caracteres especiais;
- pode utilizar o ID interno do sistema;
- se a autorização falhar, em geral a mesma referência pode ser reutilizada após correção;
- depois de autorizada, a referência fica vinculada ao documento e não deve ser reutilizada para uma nova emissão.

## Regra Jinlong

Uma operação fiscal deve receber uma referência persistente.

Exemplo conceitual:

```text
JINLONG-{fiscal_operation_id}
```

ou outro identificador interno que respeite as regras da Focus.

Não gerar uma nova referência simplesmente porque ocorreu timeout.

Fluxo:

```text
Venda
  |
  v
Fiscal Operation
  |
  +-- reference persistida
          |
          v
       Focus
```

Se ocorrer:

```text
Jinlong -> Focus
          |
          +-- timeout
```

o sistema deve consultar a referência antes de tentar criar outra emissão.

---

# 11. NFC-e

A documentação atual da Focus informa que a emissão de NFC-e possui endpoint:

```text
POST /v2/nfce
```

com `ref` como referência obrigatória.

A documentação atual também informa que:

- a emissão NFC-e é síncrona;
- a API pode definir número/série automaticamente;
- existe opção de informar número/série;
- existe opção de emissão offline manual com `forma_emissao=offline`;
- o modo offline manual exige dados adicionais, incluindo número, série e `codigo_unico`.

## IMPORTANTE — divergência a confirmar

Na conversa comercial de 02/09/2026, a Focus informou:

> para a contingência automática descrita por eles, o controle de número e série precisa permanecer com a Focus.

Na documentação atual consultada, aparecem também mecanismos de numeração automática e emissão offline manual.

**Não reconciliar essas informações por inferência.**

Antes de implementar contingência própria, confirmar com o suporte técnico:

1. qual fluxo de contingência será utilizado pelo Jinlong;
2. se o Jinlong deve ou não enviar número/série;
3. se o fluxo comercial de contingência automática é diferente da emissão offline manual documentada;
4. como a Focus retorna os números/séries utilizados;
5. como o Jinlong deve registrar eventuais documentos gerados/cancelados durante contingência.

---

# 12. Webhooks

A Focus recomenda webhooks para documentos processados de forma assíncrona e para evitar polling excessivo.

A documentação atual informa que:

- o webhook é um POST para URL definida pelo cliente;
- cada acionamento corresponde a um documento;
- em caso de falha ou resposta fora de 2xx, existem novas tentativas;
- os intervalos documentados incluem 1 minuto, 30 minutos, 1 hora, 3 horas e 24 horas;
- após o ciclo de tentativas, não haverá nova tentativa para aquele evento;
- o estado pode ser recuperado posteriormente por consulta.

A API de criação de webhook também possui campos de `authorization` e `authorization_header`.

## Arquitetura Jinlong

```text
Focus
  |
  | POST webhook
  v
/api/webhooks/focus
  |
  +-- validar
  |
  +-- registrar evento bruto
  |
  +-- responder 2xx rapidamente
  |
  v
processamento assíncrono
```

O endpoint não deve executar processamento pesado antes de responder.

## Regra

Webhook não é a única fonte de recuperação.

Deve existir:

```text
Webhook
   +
Consulta
   +
Reconciliação
```

---

# 13. Reconciliação

A Focus confirmou que é possível consultar posteriormente o estado de uma nota.

Também informou que não existe endpoint para simplesmente listar todos os documentos/eventos emitidos por determinado período.

Portanto o Jinlong não pode depender de uma sincronização histórica completa via API.

O sistema deve manter internamente:

- referência;
- status;
- número;
- série;
- chave;
- protocolo;
- rejeição;
- eventos;
- XML;
- PDF quando disponível;
- timestamps;
- payloads/respostas relevantes.

## Reconciliação mínima

Para documentos em estado transitório ou cuja confirmação não foi recebida:

```text
PENDENTE / PROCESSANDO
        |
        v
consultar Focus
        |
        +-- AUTORIZADO
        +-- REJEITADO
        +-- CANCELADO
        +-- outro estado documentado
```

Não fazer polling agressivo.

---

# 14. Rate limit

A documentação da Focus informa limite padrão de:

**100 requisições/minuto por token.**

O Jinlong deve:

- preferir webhook;
- evitar loops de consulta;
- evitar reconsultas de documentos já finalizados;
- persistir as respostas recebidas;
- controlar retries;
- evitar reenvio automático de documento que tenha erro definitivo.

---

# 15. Tratamento de erros

O Jinlong deve distinguir pelo menos:

### Erro de transporte

Exemplos:

- timeout;
- conexão recusada;
- indisponibilidade temporária.

Tratamento:

```text
não assumir rejeição fiscal
        |
        v
consultar referência
```

### Erro de validação

Exemplos:

- campo obrigatório;
- payload inválido;
- configuração ausente.

Tratamento:

```text
registrar erro
não repetir cegamente
corrigir dados/configuração
```

### Rejeição fiscal

Registrar:

```text
código
mensagem
payload/resposta
data
documento/tentativa
```

O operador deve receber uma mensagem útil sem perder o erro técnico original para diagnóstico.

---

# 16. XML, PDF e retenção

A Focus informou que disponibiliza XML/PDF e que informações necessárias para consulta posterior além do que fica disponível devem ser armazenadas pelo ERP.

Portanto o Jinlong deve manter seu próprio histórico fiscal.

O XML não deve depender exclusivamente da disponibilidade operacional da Focus.

---

# 17. Segurança

## Nunca:

- colocar token Focus no frontend;
- enviar credenciais para o navegador;
- armazenar token em código-fonte;
- registrar token em logs;
- expor credencial em mensagens de erro;
- permitir acesso de usuário comum às credenciais.

## Webhook

Utilizar o mecanismo de autorização suportado pela Focus e validar o cabeçalho configurado.

Além disso:

- registrar o evento;
- evitar processamento duplicado;
- manter idempotência no recebimento;
- responder rapidamente.

---

# 18. Auditoria

O sistema deve registrar as ações fiscais relevantes.

Isso está alinhado tanto ao requisito funcional do Jinlong quanto aos princípios de engenharia do projeto.

Registrar, conforme aplicável:

- usuário;
- empresa;
- venda;
- operação fiscal;
- tentativa;
- referência;
- ação;
- status anterior;
- status novo;
- data/hora;
- erro/rejeição;
- cancelamento;
- webhook recebido;
- reconciliação executada.

---

# 19. Testes obrigatórios antes de produção

## Autenticação

- token válido;
- token inválido;
- empresa correta;
- ambiente correto.

## Emissão

- NFC-e autorizada;
- NFC-e rejeitada;
- dados obrigatórios ausentes;
- produto inválido;
- pagamento inválido.

## Idempotência

- envio normal;
- timeout após envio;
- consulta por referência;
- tentativa repetida;
- referência já utilizada.

## Webhook

- recebimento;
- resposta 2xx;
- payload inválido;
- evento duplicado;
- indisponibilidade temporária;
- reprocessamento.

## Contingência

Testar somente o fluxo efetivamente suportado/configurado pela Focus para o Jinlong.

Validar:

- queda da SEFAZ;
- retorno da SEFAZ;
- número;
- série;
- documentos envolvidos;
- cancelamentos/ajustes eventualmente produzidos;
- estado final no Jinlong.

## Cancelamento

- cancelamento válido;
- cancelamento rejeitado;
- atualização via webhook;
- consulta posterior.

---

# 20. Homologação

Antes da produção:

```text
Jinlong
   |
   v
Focus Homologação
   |
   v
SEFAZ Homologação
```

Executar o checklist completo.

Somente depois:

```text
Homologação aprovada
        |
        v
configuração de produção
        |
        v
1 emissão real controlada
        |
        v
validação
        |
        v
go-live
```

---

# 21. Primeiro cliente

O primeiro cliente deve ser tratado como implantação controlada.

Checklist:

- [ ] conta Focus criada;
- [ ] empresa/emitente configurado;
- [ ] CNPJ;
- [ ] IE;
- [ ] dados cadastrais;
- [ ] certificado A1;
- [ ] ambiente de homologação;
- [ ] token correto;
- [ ] webhook;
- [ ] Jinlong conectado;
- [ ] emissão homologação;
- [ ] rejeição testada;
- [ ] consulta testada;
- [ ] cancelamento testado;
- [ ] contingência validada;
- [ ] XML armazenado;
- [ ] produção habilitada;
- [ ] primeira emissão real validada.

---

# 22. Auditoria obrigatória do código existente

## NÃO implementar a integração imediatamente.

Primeiro, o agente deve auditar o Jinlong atual.

Objetivo:

> descobrir exatamente o que já existe, o que pode ser reutilizado e o que realmente falta.

A hipótese de trabalho do projeto é que grande parte da infraestrutura necessária talvez já exista. Isso deve ser **verificado por evidências no código**, não assumido.

## O agente deve procurar

### Venda

- fluxo canônico de finalização;
- transação;
- persistência;
- itens;
- pagamentos;
- cliente;
- estoque;
- status.

### Empresas / tenants

- entidade empresa;
- tenant;
- CNPJ;
- inscrição estadual;
- configuração por loja;
- permissões.

### Auditoria

- mecanismo existente;
- eventos;
- histórico;
- logs.

### API / backend

- rotas;
- server actions;
- services;
- RPCs;
- adapters;
- secrets.

### Banco

- tabelas fiscais existentes;
- campos fiscais em vendas;
- enums;
- migrations;
- constraints;
- índices.

### Segurança

- secrets;
- RLS;
- autorização;
- isolamento por empresa.

### Observabilidade

- logs;
- erros;
- tracing, se existente;
- mecanismos de retry.

### Frontend

- tela de venda;
- status da venda;
- mensagens de erro;
- área fiscal existente;
- impressão/visualização de documento.

---

# 23. Resultado esperado da auditoria do Claude Code

O Claude Code NÃO deve começar codificando.

Primeiro deve produzir:

## A. EXISTE E PODE REUTILIZAR

Tabela:

```text
Componente | Arquivo | Evidência | Reutilização
```

## B. EXISTE MAS PRECISA ADAPTAÇÃO

```text
Componente | Arquivo | Problema | Alteração mínima
```

## C. NÃO EXISTE

```text
Necessidade | Evidência da ausência | Implementação necessária
```

## D. RISCOS

Classificar:

- P0 — bloqueador de emissão/go-live;
- P1 — importante, mas não bloqueia primeiro fluxo;
- P2 — evolução posterior.

## E. ARQUITETURA PROPOSTA

Mostrar:

```text
Venda
 ↓
Fiscal Operation
 ↓
Fiscal Port
 ↓
Focus Adapter
 ↓
Focus API
```

E identificar os arquivos reais do repositório onde cada boundary deve ficar.

---

# 24. Regra contra duplicação

Antes de criar qualquer:

- tabela;
- enum;
- tipo;
- serviço;
- função;
- endpoint;
- validação;
- estado;

o agente deve procurar se já existe equivalente.

Isso segue o princípio de Single Source of Truth do Jinlong.

Não criar:

```text
VendaFiscal
VendaFiscalNova
FiscalVenda
```

se uma entidade existente já representa a responsabilidade.

---

# 25. Princípios arquiteturais do Jinlong

A integração deve obedecer aos princípios já definidos pelo projeto:

- arquitetura consistente;
- baixo acoplamento;
- alta manutenibilidade;
- previsibilidade;
- confiabilidade;
- auditoria;
- testabilidade;
- observabilidade;
- Single Source of Truth;
- evolução incremental;
- mínimo retrabalho.

Antes de uma mudança, avaliar:

1. reduz complexidade?
2. melhora manutenção?
3. preserva arquitetura?
4. reduz dívida técnica?
5. aumenta previsibilidade?
6. reduz acoplamento?
7. melhora testabilidade?
8. fortalece SSOT?
9. melhora observabilidade?
10. facilita futuras integrações?
11. existe solução mais simples?

---

# 26. Dúvidas ainda abertas com a Focus

Não considerar resolvidas por inferência:

1. Qual é exatamente o fluxo de contingência automática de NFC-e usado no cenário do Jinlong?
2. Quem controla número/série em cada modo de emissão?
3. Como o Jinlong deve reconciliar documentos produzidos em contingência?
4. Qual é exatamente o contrato de autenticação dos webhooks?
5. Quais eventos de webhook serão configurados para NFC-e?
6. Como tratar evento duplicado?
7. Qual é o conjunto completo de estados relevantes para NFC-e?
8. Qual é o fluxo de cancelamento específico da NFC-e?
9. Como a API de Empresas deve ser utilizada no modelo multiempresa do Jinlong?
10. Quais requisitos fiscais específicos o primeiro emitente de Pernambuco possui além do que já foi informado?

Essas dúvidas devem ser encaminhadas ao suporte técnico quando forem necessárias para implementação.

---

# 27. Prompt oficial para Claude Code

Copiar este prompt após colocar este documento no repositório:

```text
MISSÃO — AUDITORIA PRÉ-INTEGRAÇÃO FOCUS NFe

Leia primeiro:
- docs/FISCAL_FOCUS_NFE_CONTRATO.md
- docs/Princípios-de-Engenharia.txt
- docs/ARQUITETURA_REGRAS_NEGOCIO.md
- demais ADRs/documentação fiscal relevantes.

Objetivo:
Auditar o estado REAL do Jinlong antes de implementar a integração Focus NFe.

NÃO implemente código nesta missão.

Precisamos descobrir:
1. o que já existe e pode ser reutilizado;
2. o que existe mas precisa adaptação;
3. o que realmente falta;
4. quais partes bloqueiam o primeiro go-live;
5. se já existe infraestrutura fiscal suficiente para conectar a Focus.

Audite no código, banco, migrations, RPCs, APIs, services, adapters, frontend e testes.

Mapeie especificamente:
- fluxo canônico de finalização da venda;
- persistência da venda;
- pagamentos;
- estoque;
- empresa/tenant;
- CNPJ/IE;
- configurações fiscais;
- auditoria;
- permissões;
- tabelas/entidades fiscais;
- estados fiscais;
- endpoints existentes;
- webhooks existentes;
- secrets;
- logs;
- testes.

Procure duplicações antes de propor qualquer entidade nova.

Entregue um relatório com:

A) EXISTE E REUTILIZAR
B) EXISTE E ADAPTAR
C) NÃO EXISTE
D) P0/P1/P2
E) riscos arquiteturais
F) fluxo proposto Jinlong → Fiscal Domain → Focus Adapter → Focus
G) migrations necessárias, somente se realmente necessárias
H) testes necessários
I) sequência mínima de implementação

IMPORTANTE:
- Não invente comportamento da Focus.
- Use o contrato em docs/FISCAL_FOCUS_NFE_CONTRATO.md como fonte de requisitos.
- Onde houver conflito entre documentação comercial e documentação técnica da Focus, marque como "DÚVIDA A CONFIRMAR" em vez de decidir por conta própria.
- Não crie nova arquitetura se a arquitetura existente já comportar a integração.
- Preserve Single Source of Truth.
- Apresente evidências concretas: arquivos, símbolos, tabelas, migrations, RPCs e testes.
- Não altere código nesta missão.
```

---

# 28. Critério de encerramento da auditoria

A auditoria só está concluída quando conseguirmos responder:

> **"O Jinlong já possui tudo o que precisa para receber uma emissão NFC-e da Focus? Se não, quais são exatamente os menores componentes que faltam?"**

Não aceitar respostas genéricas como:

- "precisa criar integração fiscal";
- "precisa criar tabela fiscal";
- "precisa criar webhook".

Cada afirmação precisa apontar para evidência no repositório ou para requisito deste contrato.

---

# 29. Regra de implementação posterior

Somente depois da auditoria:

```text
AUDITORIA
   ↓
decisões
   ↓
PR pequeno
   ↓
migration, se necessária
   ↓
adapter Focus
   ↓
emissão homologação
   ↓
webhook
   ↓
reconciliação
   ↓
testes
   ↓
produção
```

Evitar uma implementação monolítica de "integração Focus".

---

# 30. Fonte de verdade deste contrato

Este documento consolida:

1. informações fornecidas pela Focus NFe na conversa comercial de 02/09/2026;
2. documentação oficial da Focus NFe consultada em 16/09/2026;
3. requisitos fiscais já definidos para o Jinlong;
4. princípios arquiteturais do projeto.

Quando a documentação da Focus mudar, este contrato deve ser revisado.

Quando o Jinlong implementar uma decisão diferente, este contrato deve ser atualizado antes de considerar a arquitetura consolidada.

---

## STATUS

**Integração:** planejada  
**Homologação:** ainda não concluída  
**Produção:** não iniciar antes da auditoria + homologação  
**Próximo passo:** auditoria somente leitura do repositório pelo Claude Code