# Auditoria Profunda Go-Live — FRENTE 1: Parametrização

> **Pergunta central:** o sistema consegue operar sem depender de configuração manual escondida?
> **Resposta curta:** ❌ **Não.** A parametrização está partida em 3 fontes de verdade, os
> dados fiscais estão 100% vazios, e há parâmetros que o gestor acredita controlar mas que
> nenhum código lê.

| Campo | Valor |
|---|---|
| Data | 2026-08-03 |
| Método | Consulta direta ao banco (REST, `service_role`, somente leitura) + leitura de código |
| Base | Supabase `kbabmewnahysfvlybiak` · 7 lojas · 113 produtos · 12 usuários |
| Escopo | Frente 1 — Empresa/Loja · Comercial · Financeiro · Usuários · Defaults |
| Veredito | ❌ **8 bloqueadores 🔴** |

**Script de sondagem** (somente leitura, reexecutável):
`pdv-importados/scripts/_audit_f1_probe.mjs`

---

## Sumário dos achados

| ID | Severidade | Achado |
|---|---|---|
| F1-01 | 🔴 | 7 de 7 lojas sem CNPJ, razão social, IE e endereço |
| F1-02 | 🔴 | `auto_enqueue_fiscal = false` em todas as lojas — fiscal desligado na origem |
| F1-03 | 🔴 | 105 de 113 produtos sem NCM, com CSOSN `400` presumido |
| F1-04 | 🔴 | 5 de 7 lojas sem linha em `pdv_config` — sem limite de desconto nem regime tributário |
| F1-05 | 🔴 | Formas de pagamento hardcoded — não existe tabela parametrizável |
| F1-06 | 🔴 | `atualizarConfiguracao` aceita chave arbitrária, sem whitelist e sem filtro de loja |
| F1-07 | 🔴 | GERENTE = DONO = ADMIN em 22 de 23 recursos, incluindo `sensitive:financeiro` |
| F1-08 | 🔴 | 9 rotas `/admin` fora da policy, incluindo Configurações e Suspensão |
| F1-09 | 🟠 | 3 fontes de verdade para parametrização (global × por loja × código) |
| F1-10 | 🟠 | 4 chaves de config nunca lidas por código algum |
| F1-11 | 🟠 | `pricing_config_versions` — tabela totalmente órfã |
| F1-12 | 🟠 | 13 produtos com preço de atacado e gatilho 0 → atacado dispara sempre |
| F1-13 | 🟠 | 66 de 113 produtos sem custo → margem e Curva ABC não confiáveis |
| F1-14 | 🟠 | `atualizado_por` null em 100% das configs — nenhuma rastreabilidade |
| F1-15 | 🟡 | 1 produto com atacado > varejo e 1 com custo > venda |
| F1-16 | 🟡 | Senha de gerente do PDV em `pdv_config`, ausente em 1 das 2 lojas |

---

## 1. Empresa / Loja

> **STATUS (2026-08-05): INVESTIGADO, NÃO FECHADO — decisão pendente, não código.**
> A "correção mínima" tem duas partes: preencher dado fiscal real (fora do meu alcance — não
> existe CNPJ/razão/IE real do cliente para eu inserir; inventar dado violaria o próprio
> objetivo de F3-001) e um "gate duro em `/admin/implantacao`". Investiguei esse gate
> (`app/admin/implantacao/homologacaoDados.ts`, campo `impostosMinimosOk`) — hoje ele verifica
> só `Boolean(loja?.id && loja.nome)`, não CNPJ/razão/IE de verdade. O comentário do arquivo
> chama isso de *"Config mínima da loja para operar com **Stub fiscal**"* — ou seja, parece
> deliberadamente relaxado para o modo sem emissão real. Endurecer esse gate para exigir CNPJ
> completo, sem saber se **FLX-02** ("Go-Live com ou sem fiscal?") foi decidido como "com
> fiscal", arrisca travar o fluxo de implantação do piloto por um requisito que só se aplica se
> a direção escolher emitir nota fiscal de verdade. Mesma classe de bloqueio de F1-02: ambos
> dependem de FLX-02. Não toquei o código. Registrado aqui em vez de decidir sozinha.

### 🔴 F1-01 — Nenhuma loja tem identificação fiscal

**Evidência.** `GET /rest/v1/lojas?select=*` — as **7 lojas** retornam
`cnpj: null`, `razao_social: null`, `inscricao_estadual: null`, `nome_fantasia: null`,
`cnae: null` e endereço integralmente nulo (logradouro, número, bairro, cidade, UF, CEP).
Confirmado por contagem: `lojas com CNPJ null: 7 / total: 7`.

Apenas `numero_serie_nfce: 1` e `numero_serie_nfe: 1` estão preenchidos — valores default,
não escolha do cliente.

**Impacto operacional.** Nenhum documento fiscal pode ser emitido. Cupom, relatório e
qualquer impresso sai sem identificação do emitente.

**Risco futuro.** Se o cadastro for feito às pressas no dia do Go-Live, erro de digitação em
CNPJ ou IE gera rejeição em cadeia na SEFAZ, com fila fiscal travada e vendas retidas.

**Correção mínima.** Preencher a loja de produção e tornar `cnpj`, `razao_social`,
`inscricao_estadual` e endereço **NOT NULL para lojas ativas não-teste** (constraint ou
gate duro em `/admin/implantacao`).

**Critério de aceite.** `SELECT count(*) FROM lojas WHERE ativo AND cnpj IS NULL` retorna 0,
e a tentativa de emitir com loja incompleta falha com erro claro antes de chegar à SEFAZ.

### 🔴 F1-02 — Enfileiramento fiscal desligado por padrão

**Evidência.** `pdv_config.auto_enqueue_fiscal = false` nas **2 lojas configuradas**.
O default vem do código: `app/admin/provisionamento/provisionamentoDefaults.ts:7`
(`auto_enqueue_fiscal: false`), com teste **fixando esse comportamento**
(`provisionamentoDefaults.test.ts:10` espera `toBe(false)`).

**Impacto operacional.** Mesmo depois de conectar o provedor fiscal, **nenhuma venda será
enfileirada** — o documento não chega sequer à fila. É um segundo bloqueio, independente do
stub `NFC_E_STUB`.

**Risco futuro.** Go-Live "concluído" com fiscal aparentemente pronto e nenhuma nota
emitida — descoberto apenas na primeira fiscalização ou fechamento contábil.

**Correção mínima.** Inverter o default para lojas com emissão obrigatória e expor o campo na
tela de Configurações (hoje não há UI para ele). Atualizar o teste junto.

**Critério de aceite.** Venda concluída em loja de produção gera registro na fila fiscal
automaticamente, sem intervenção manual.

### 🔴 F1-03 — Catálogo sem NCM, com tributação presumida

**Evidência.** Varredura nos 113 produtos: **105 sem NCM** (`ncm: null`) e **100 com
`csosn: '400'`**. O comentário do próprio código reconhece a obrigatoriedade:
`core/ports/produto.ts:45` — *"NCM 8 dígitos — obrigatório pelo SEFAZ para NF-e/NFC-e"* —
mas o campo é **opcional no cadastro**.

**Impacto operacional.** NCM ausente causa rejeição da NFC-e. CSOSN `400` ("não tributada")
aplicado em massa é uma **presunção tributária** que não foi declarada pelo contador do cliente.

**Risco futuro.** Recolhimento incorreto de imposto, com passivo retroativo. Corrigir 105
produtos depois do Go-Live, com vendas já emitidas, é retrabalho e risco fiscal.

**Correção mínima.** Tornar NCM obrigatório para produtos publicados em loja com emissão
ativa; importar NCM via NF-e de entrada quando disponível; validar CSOSN contra o regime
declarado pelo contador.

**Critério de aceite.** Nenhum produto `PUBLICADO` sem NCM em loja com `auto_enqueue_fiscal`,
e CSOSN coerente com o regime tributário configurado.

> **STATUS (2026-08-05): FECHADO (código) — 5 lojas sem config seguem sem config, e está correto.**
> As 5 lojas sem `pdv_config` são `Filial demo` (seed da migration 036) + 4 lojas
> `Probe_*`/`Smoke Homolog *` — 100% dado de teste, escopo de F3-001, não desta correção.
> A única loja real (`Matriz`) já tinha `pdv_config`. O gap real não era dado, era código: o
> wizard de provisionamento (`provisionarLojaAction`) cria loja e `pdv_config` em chamadas
> sequenciais (não uma transação SQL real), sem compensação se `ensurePdvConfig` falhasse
> depois da loja já criada — a loja recém-criada sobreviveria sem config, exatamente o defeito
> que este ticket descreve. Corrigido: `catch` agora desativa (`ativo=false`) a loja
> recém-criada nesta mesma requisição se qualquer passo posterior falhar — mesma lógica de
> compensação já usada para o usuário de Auth. O gate de implantação (`temPdvConfig` em
> `coletarDadosHomologacao.ts` → `gapBool('loja.pdv', ...)`) já existia e já bloqueia
> corretamente; não precisou de mudança. 2 testes novos (`actions.test.ts`), suíte completa
> (895 testes) e typecheck limpos. `COUNT(lojas ativas) = COUNT(pdv_config)` continua falso
> hoje porque as 5 faltantes são teste — critério será satisfeito quando F3-001 rodar.

### 🔴 F1-04 — 5 de 7 lojas sem `pdv_config`

**Evidência.** `pdv_config` retorna **2 linhas** (lojas `a0000001…` e `3d65ba13…`) para
**7 lojas** cadastradas.

**Impacto operacional.** As 5 lojas sem linha não têm `max_desconto_gerente_percentual`,
`limite_sangria_sem_gerente`, `regime_tributario`, `cfop_padrao` nem
`quantidade_minima_atacado_padrao`. O comportamento passa a depender de fallback implícito
no código — **não verificado** qual é o fallback em cada consumidor.

**Risco futuro.** Ao abrir a segunda loja real, ela herda comportamento indefinido em
descontos e sangria — exatamente os controles que protegem o caixa.

**Correção mínima.** Criar `pdv_config` na mesma transação de criação da loja (o wizard de
provisionamento já tem os defaults prontos) e adicionar verificação no gate de implantação.

**Critério de aceite.** `COUNT(lojas ativas) = COUNT(pdv_config)`.

---

## 2. Configurações comerciais

### Estado atual dos parâmetros (evidência de banco)

| Parâmetro | Onde vive | Valor | Situação |
|---|---|---|---|
| Desconto máx. operador | `configuracoes_gerais` (global) | 10,00% | ✅ ativo |
| Desconto máx. gerente | `pdv_config` (por loja) | 30% | ✅ ativo |
| Desconto máx. manual/item | `pdv_config` | 15% | ✅ ativo |
| Desconto máx. total | `pdv_config` | 60% | ✅ ativo |
| Qtd. mínima atacado | `pdv_config` | 6 | ⚠️ ignorada quando o produto tem gatilho próprio |
| Limite sangria sem gerente | `pdv_config` | R$ 200 | ✅ ativo |
| Comissão padrão | `configuracoes_gerais` | 5,00% | 🟠 **nunca lida** |
| Limite cancelamento sem gerente | `configuracoes_gerais` | R$ 500 | 🟠 **nunca lida** (descrição já diz "Reservado") |
| Lead time min/max | `configuracoes_gerais` | 30 / 60 dias | 🟠 **nunca lida** |
| Estoque mínimo padrão | `configuracoes_gerais` | 10 | 🟠 **nunca lida** |

✅ **Ponto forte real:** a escada de desconto (operador 10% → item 15% → gerente 30% →
teto total 60%) é coerente e está de fato implementada, com aprovação gerencial registrada
em `descontos_venda` (aparece na trilha de auditoria).

### 🟠 F1-12 — Atacado dispara sempre em 13 produtos

**Evidência.** Dos **43 produtos com `preco_atacado`**, **13 têm
`quantidade_gatilho_atacado = 0`**. Com gatilho zero, qualquer quantidade satisfaz a
condição de atacado.

**Impacto operacional.** Venda unitária sai com preço de atacado — perda de margem
silenciosa, item a item, sem alerta.

**Risco futuro.** Erosão de margem difícil de diagnosticar depois, porque cada venda parece
individualmente legítima.

**Correção mínima.** Ao gravar `preco_atacado`, exigir `quantidade_gatilho_atacado >= 2`
(ou herdar `quantidade_minima_atacado_padrao = 6` de `pdv_config`). Corrigir os 13 existentes.

**Critério de aceite.** Nenhum produto com `preco_atacado IS NOT NULL AND
quantidade_gatilho_atacado < 2`.

### 🟠 F1-13 / 🟡 F1-15 — Qualidade de preço

- **66 de 113 produtos sem `preco_custo`** — é a causa raiz do aviso exibido em Relatórios
  (*"Custo não é confiável"*). Margem e Curva ABC ficam indicativas, não decisórias.
- **1 produto com `preco_custo > preco_varejo`** (venda com prejuízo estrutural).
- **1 produto com `preco_atacado > preco_varejo`** (atacado mais caro que varejo — inversão lógica).

**Correção mínima.** Validação no formulário e no import: bloquear atacado > varejo; alertar
custo > venda (permitido apenas com `permitir_abaixo_custo = true`, campo que já existe).

---

## 3. Configurações financeiras

### 🔴 F1-05 — Formas de pagamento não são parametrizáveis

**Evidência.** As tabelas `formas_pagamento` e `contas_financeiras` **não existem**
(REST retorna `PGRST205 — Could not find the table`). As formas são um enum fixo em código:
`app/caixa/finalizarVendaValidation.ts:11-16` →
`['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO']`, usado como `z.enum` na validação
da venda (linhas 53 e 62).

**Impacto operacional.** O lojista **não pode** cadastrar crediário/fiado, vale-alimentação,
cartão parcelado, taxa de adquirente ou prazo de recebível. Qualquer forma nova exige
alteração de código e deploy.

**Risco futuro.** Primeira loja que trabalha com fiado ou maquininha parcelada não consegue
operar — e a mudança exige release, não configuração.

**Correção mínima.** Tabela `formas_pagamento` por loja (nome, tipo, taxa %, prazo de
compensação, ativo) e substituição do `z.enum` estático por validação contra o cadastro.
Manter os 4 valores atuais como seed.

**Critério de aceite.** Adicionar uma forma de pagamento nova sem tocar em código.

### Fluxo de caixa — parcialmente parametrizado

- ✅ `limite_sangria_sem_gerente` = R$ 200 (ativo, por loja).
- ✅ `blind_closure = false` — **decisão relevante não exposta na UI**: conferência cega no
  fechamento é um controle antifraude clássico. Está desligada e não há tela para ligar.
- 🟡 Saldo inicial de caixa: **não verificado** — a coluna `valor_abertura` não existe em
  `caixas`; a modelagem de abertura não foi confirmada nesta frente.
- ✅ Categorias financeiras: 9 cadastradas e ativas (Aluguel, Custo de Mercadoria, Energia,
  Impostos, Marketing, Salários, etc.) — este é o **único bloco financeiro genuinamente
  parametrizado**.

---

## 4. Usuários e permissões

### Perfis reais no banco

`ADMIN: 1 · DONO: 5 · GERENTE: 3 · OPERADOR: 3` (12 usuários)

### 🔴 F1-07 — Perfis gerenciais são indistinguíveis na prática

**Evidência.** `lib/admin/policy/adminPolicy.ts:55-88`. De **23 entradas** entre
`ACTION_PROFILES` e `RESOURCE_PROFILES`, **22 usam `ALL_ADMIN_PROFILES = ['GERENTE','DONO','ADMIN']`**.
A única exceção é `route:/admin/provisionamento: ['ADMIN']`.

Isso inclui explicitamente `sensitive:financeiro` e `sensitive:comissoes` — marcados como
*sensíveis* no próprio código, mas liberados para os três perfis.

**Impacto operacional.** Um GERENTE vê faturamento, margem, comissões de todos e configurações
fiscais — mesmo poder que o DONO. A distinção de perfil existe no cadastro mas **não produz
efeito prático**.

**Risco futuro.** Ao contratar o primeiro gerente que não é sócio, não há como restringir
acesso a dados financeiros sem alterar código.

**Correção mínima.** Diferenciar ao menos: `sensitive:financeiro`, `sensitive:comissoes`,
`route:/admin/configuracoes` e `route:/admin/suspensao` → `['DONO','ADMIN']`.

**Critério de aceite.** Sessão GERENTE recebe `deny` em recursos financeiros sensíveis, com
teste automatizado cobrindo a matriz perfil × recurso.

**Nuance justa:** a *arquitetura* de permissão é boa — policy única com escopos
(`edge`/`api`/`action`/`resource`/`gerente`), `Decision` tipada e `derivePermissionsForSession`.
O problema é a **configuração da matriz**, não o desenho. Correção barata.

### 🔴 F1-08 — 9 rotas fora da policy

**Evidência.** Rotas existentes em `app/admin/` **ausentes** de `RESOURCE_PROFILES`:

`categorias-financeiras`, `categorias-produtos`, `comissoes`, `compras`, `configuracoes`,
`marcas-produtos`, `produtos`, `relatorios`, `suspensao`

Elas caem no fallback `hasAllowedPerfil(session, undefined) → canAccessAdmin(session)`
(`adminPolicy.ts:90-95`), isto é: **qualquer perfil gerencial entra**.

**Impacto operacional.** `/admin/configuracoes` (parâmetros fiscais e da empresa) e
`/admin/suspensao` (kill-switch que interrompe o faturamento) **não têm restrição por perfil**.

**Risco futuro.** Um gerente pode suspender as vendas da loja ou alterar dados fiscais sem
que isso seja uma decisão de projeto — é um efeito colateral de rota não mapeada.

**Correção mínima.** Mapear as 9 rotas explicitamente e **inverter o default do fallback**:
rota não mapeada deve ser `deny`, não `allow`.

**Critério de aceite.** Teste que enumera `app/admin/*` e falha se alguma rota não estiver
declarada na policy.

---

## 5. Defaults perigosos, hardcoded e config órfã

> **STATUS (2026-08-05): PARCIAL — whitelist + `atualizado_por` fechados; `loja_id` sinalizado,
> não implementado.** Migration `297_configuracoes_gerais_whitelist.sql` aplicada e verificada
> em produção: `CHECK (chave IN (...8 chaves conhecidas...))` na própria tabela — vale para
> `atualizarConfiguracao` **e** para `atualizarSuspensaoVendas`
> (`app/gerente/suspensao/actions.ts`, que escreve direto em `configuracoes_gerais` e também
> não tinha whitelist nem `atualizado_por`; corrigido no mesmo commit). Ambos os escritores
> agora gravam `atualizado_por = auth.session.userId`. 4 testes novos (whitelist rejeitada sem
> tocar o banco; `atualizado_por` gravado), suíte completa (895) e typecheck limpos.
>
> **`loja_id` não implementado — risco real, não preguiça.** `configuracoes_gerais` é lida por
> `app/caixa/server/caixaConfiguracoes.impl.ts`, `caixaGerenteDesconto.impl.ts` e
> `caixaConsultaRapida.impl.ts` — caminho de checkout **ativo em produção com cliente real**.
> Isolar por loja exige mudar leitura (fallback global→loja) nesses três consumidores, não só
> a escrita — não é uma migration isolada de baixo risco como a whitelist. Fazer isso na mesma
> passada arriscaria regressão no caixa ao vivo sem o tipo de prova isolada que esse caminho
> merece. Registrado como pendência explícita (ver F1-09, já P2/pós-R1 no guia de Go-Live).

### 🔴 F1-06 — `atualizarConfiguracao` sem whitelist nem escopo de loja

**Evidência.** `app/gerente/configuracoes/actions.ts:15-30`:

```ts
export async function atualizarConfiguracao(
  input: { chave: string; valor: string },
) {
  const auth = await assertGerenteSession()      // ✅ tem guarda de sessão
  ...
  .from('configuracoes_gerais')
  .update({ valor: input.valor.trim() })
  .eq('chave', input.chave)                       // ❌ chave arbitrária, sem whitelist
                                                  // ❌ sem .eq('loja_id', ...)
                                                  // ❌ não grava atualizado_por
}
```

Três problemas somados:
1. **`chave: string` livre** — qualquer chave existente pode ser sobrescrita por qualquer
   perfil gerencial, sem validação de domínio nem de formato do valor.
2. **Sem filtro de loja** — `configuracoes_gerais` **não tem `loja_id`**; a alteração é
   global e atinge **todas as 7 lojas**. Em SaaS multi-loja, isso é vazamento de configuração
   entre inquilinos.
3. **`atualizado_por` nunca é gravado** — confirmado no banco: **null em 100% das linhas**,
   com `atualizado_em` idêntico ao `criado_em` (2026-06-01) em todas.

**Impacto operacional.** Um gerente da Loja A altera o desconto máximo e muda o
comportamento da Loja B. Sem rastro de quem alterou.

**Risco futuro.** Multi-tenancy quebrada: o primeiro cliente com duas lojas terá parâmetros
comerciais interferindo entre si.

**Correção mínima.** Whitelist de chaves com validação por `tipo_dado`; adicionar `loja_id`
a `configuracoes_gerais` (ou migrar essas chaves para `pdv_config`, que já é por loja);
gravar `atualizado_por` a partir da sessão.

**Critério de aceite.** Chave fora da whitelist é rejeitada; alteração na Loja A não afeta a
Loja B; `atualizado_por` preenchido em toda escrita.

### 🔴 Defaults fiscais presumidos

**Evidência.** `app/admin/provisionamento/provisionamentoDefaults.ts:3-11`:

```ts
export const PDV_CONFIG_DEFAULTS = {
  cfop_padrao: '5102',
  cst_padrao: '00',
  regime_tributario: 'SIMPLES_NACIONAL',
  auto_enqueue_fiscal: false,
  ...
}
```

Toda loja nova nasce presumindo **Simples Nacional**, CFOP `5102` e CST `00`. Nenhum desses
valores foi declarado pelo cliente; são herdados silenciosamente do wizard.

**Correção mínima.** Tornar `regime_tributario` uma **escolha obrigatória** no wizard de
provisionamento, sem default, com CFOP/CST derivados do regime escolhido.

### 🟠 F1-09 — Três fontes de verdade para parametrização

| Fonte | Escopo | Exemplos |
|---|---|---|
| `configuracoes_gerais` | **Global** (sem `loja_id`) | desconto operador, comissão padrão, suspensão |
| `pdv_config` | **Por loja** | descontos gerente/item/total, sangria, CFOP, regime |
| Código | Compilado | formas de pagamento, defaults de provisionamento |

Isso viola o princípio de Single Source of Truth do projeto. Pior: **desconto do operador é
global e desconto do gerente é por loja** — dois controles da mesma escada em fontes
diferentes, com escopos incompatíveis.

**Correção mínima.** Consolidar toda parametrização comercial em `pdv_config` (por loja),
deixando `configuracoes_gerais` apenas para flags realmente globais da plataforma.

### 🟠 F1-10 / F1-11 — Configuração existente sem uso

**Nunca lidas por código algum** (grep em `app/` e `lib/` retorna zero ocorrências):
`comissao_padrao_percentual` (5,00%), `cancelamento_maximo_valor_sem_gerente` (R$ 500),
`lead_time_min_dias` (30), `lead_time_max_dias` (60), `estoque_minimo_padrao` (10).

**Tabela órfã:** `pricing_config_versions` existe nas migrações e **não é referenciada em
lugar nenhum** do app.

**Impacto.** Configuração-fantasma é pior que configuração ausente: o gestor ajusta a
comissão para 7% acreditando ter mudado a regra, e nada acontece. A descrição de
`cancelamento_maximo_valor_sem_gerente` chega a admitir *"Reservado"* — mas isso não aparece
para quem opera.

**Correção mínima.** Ou implementar a leitura, ou remover a chave, ou marcá-la
explicitamente como inativa na UI. Nunca deixar um controle que não controla.

### 🟡 F1-16 — Senha de gerente do PDV

`pdv_config.gerente_senha_bcrypt` está preenchida (bcrypt, custo 12 — ✅ hash adequado) na
loja 1 e **null na loja 2**. Comportamento com hash ausente: **não verificado** — pode
significar autorização gerencial impossível ou, pior, dispensada.

---

## 6. Resposta à pergunta da Frente 1

> *O sistema consegue operar sem depender de configuração manual escondida?*

**Não.** Hoje há três categorias de dependência oculta:

1. **Configuração ausente que trava a operação** — dados fiscais da loja (F1-01),
   `pdv_config` faltando em 5 lojas (F1-04), NCM em 105 produtos (F1-03).
2. **Configuração que existe e não é editável** — formas de pagamento (F1-05),
   `auto_enqueue_fiscal` sem UI (F1-02), `blind_closure` sem UI.
3. **Configuração que é editável e não faz nada** — 4 chaves nunca lidas (F1-10),
   tabela órfã (F1-11).

A terceira categoria é a mais perigosa, porque **produz falsa sensação de controle**.

---

## 7. Plano de correção da Frente 1

### Bloco A — Bloqueadores de Go-Live
1. F1-01 · preencher e travar dados fiscais da loja de produção
2. F1-02 · ligar `auto_enqueue_fiscal` e expor na UI
3. F1-03 · NCM obrigatório para publicados + revisar CSOSN com o contador
4. F1-04 · garantir `pdv_config` para toda loja ativa
5. F1-06 · whitelist + escopo de loja + `atualizado_por`
6. F1-07 / F1-08 · diferenciar perfis e mapear as 9 rotas; fallback vira `deny`

### Bloco B — Risco operacional
7. F1-05 · tabela de formas de pagamento
8. F1-09 · consolidar parametrização em `pdv_config`
9. F1-12 · corrigir gatilho de atacado nos 13 produtos + validação
10. F1-13 · campanha de preenchimento de custo (66 produtos)
11. F1-10 / F1-11 · implementar ou remover configs órfãs

### Bloco C — Ajustes
12. F1-15 · validações de coerência de preço
13. F1-16 · definir comportamento com `gerente_senha_bcrypt` nulo
14. Expor `blind_closure` na UI de configurações

---

## 8. Limites desta frente

- Consultas feitas com `service_role`, que **contorna RLS** — este relatório comprova o
  *conteúdo* dos dados, **não** a eficácia das políticas RLS. Auditar RLS exige teste com
  JWT de cada perfil (recomendado para a Frente de Segurança).
- Comportamento de fallback quando `pdv_config` está ausente: **não verificado**.
- Modelagem de abertura/saldo inicial de caixa: **não verificada** (coluna esperada não existe).
- Nenhuma escrita foi feita no banco. O script de sondagem é somente leitura.
